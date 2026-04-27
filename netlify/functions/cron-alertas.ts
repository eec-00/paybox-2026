import { schedule } from '@netlify/functions'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'
import {
  getCamposForTipo,
  isVehicleTipo,
  getDaysUntil,
  normalizeAlertas,
  getAlertasEfectivas,
} from '../../lib/automatizacion/campos'

// ─── Clientes ────────────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    family: 4,
  } as Parameters<typeof nodemailer.createTransport>[0])
}

// ─── Odoo ────────────────────────────────────────────────────────────────────

const ODOO_URL = () => (process.env.URL_ODOO || process.env.ODOO_URL || '').trim().replace(/\/$/, '')
const ODOO_DB  = () => (process.env.DB || process.env.ODOO_DB || '').trim()
const ODOO_EMAIL = () => (process.env.EMAIL || process.env.ODOO_EMAIL || '').trim()
const ODOO_KEY   = () => (process.env.API_KEY || process.env.ODOO_API_KEY || '').trim()

async function odooAuth(): Promise<number> {
  const res = await fetch(`${ODOO_URL()}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: { service: 'common', method: 'authenticate', args: [ODOO_DB(), ODOO_EMAIL(), ODOO_KEY(), {}] },
    }),
  })
  const data = await res.json()
  if (!data.result) throw new Error(`Odoo auth failed: ${JSON.stringify(data.error)}`)
  return data.result as number
}

async function odooCall<T>(uid: number, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${ODOO_URL()}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: Date.now(),
      params: { service: 'object', method: 'execute_kw', args: [ODOO_DB(), uid, ODOO_KEY(), model, method, args, kwargs] },
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Odoo ${model}.${method}: ${JSON.stringify(data.error)}`)
  return data.result as T
}

async function fetchRegistros(uid: number, tipo: string, filtro: string): Promise<any[]> {
  const campos = getCamposForTipo(tipo)
  const studioFields = campos.map((c) => c.key)

  if (isVehicleTipo(tipo)) {
    const domain: any[] = filtro ? [['category_id.name', '=', filtro]] : []
    const base = await odooCall<any[]>(uid, 'fleet.vehicle', 'search_read', [domain], {
      fields: ['id', 'name', 'license_plate'], limit: 500, order: 'name asc',
    }) || []
    if (!base.length) return []
    const ids = base.map((v) => v.id)
    let studio: any[] = []
    try {
      studio = await odooCall<any[]>(uid, 'fleet.vehicle', 'search_read', [[['id', 'in', ids]]], {
        fields: ['id', ...studioFields], limit: 500,
      }) || []
    } catch { studio = [] }
    const map = new Map(studio.map((r) => [r.id, r]))
    return base.map((v) => ({ ...v, ...(map.get(v.id) || {}) }))
  } else {
    const titles = filtro.split(',').map((t: string) => t.trim()).filter(Boolean)
    let base = await odooCall<any[]>(uid, 'hr.employee', 'search_read',
      [[['job_title', 'in', titles]]],
      { fields: ['id', 'name', 'work_email'], limit: 500 }
    ) || []
    if (!base.length) {
      base = await odooCall<any[]>(uid, 'hr.employee', 'search_read',
        [[['job_title', 'ilike', titles[0]]]],
        { fields: ['id', 'name', 'work_email'], limit: 500 }
      ) || []
    }
    if (!base.length) return []
    const ids = base.map((e) => e.id)
    let studio: any[] = []
    try {
      studio = await odooCall<any[]>(uid, 'hr.employee', 'search_read', [[['id', 'in', ids]]], {
        fields: ['id', ...studioFields], limit: 500,
      }) || []
    } catch { studio = [] }
    const map = new Map(studio.map((r) => [r.id, r]))
    return base.map((e) => ({ ...e, ...(map.get(e.id) || {}) }))
  }
}

// ─── Email HTML ───────────────────────────────────────────────────────────────

function buildEmailHtml(nombre: string, items: { label: string; fecha: string; dias: number }[]): string {
  const filas = items.map((c, idx) => {
    const bg = idx % 2 === 0 ? '#fffde7' : '#ffffff'
    const color = c.dias < 0 ? '#dc2626' : c.dias <= 7 ? '#ea580c' : c.dias <= 30 ? '#d97706' : '#854d0e'
    const estado = c.dias < 0 ? `VENCIDO (hace ${Math.abs(c.dias)}d)` : c.dias === 0 ? 'VENCE HOY' : `${c.dias} días`
    return `<tr style="background:${bg}">
      <td style="border:1px solid #f59e0b;padding:9px 14px;font-size:13px;text-align:center">${nombre.toUpperCase()}</td>
      <td style="border:1px solid #f59e0b;padding:9px 14px;font-size:13px;text-align:center">${c.label}</td>
      <td style="border:1px solid #f59e0b;padding:9px 14px;font-size:13px;text-align:center">${c.fecha}</td>
      <td style="border:1px solid #f59e0b;padding:9px 14px;font-size:13px;font-weight:700;color:${color};text-align:center">${estado}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f4f8">
<div style="max-width:660px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)">
  <div style="padding:28px 32px 16px;text-align:center;border-bottom:3px solid #f59e0b">
    <h1 style="margin:0;font-size:22px;font-weight:900;color:#1c1917;text-transform:uppercase">Vencimientos Proximos</h1>
    <p style="margin:4px 0 0;font-size:12px;color:#78716c">EEMERSON SAC — Sistema PayBox</p>
  </div>
  <div style="padding:24px 28px">
    <p style="margin:0 0 18px;font-size:14px;color:#44403c">Estimado(a) <strong>${nombre}</strong>, los siguientes documentos estan proximos a vencer o ya han vencido.</p>
    <table style="border-collapse:collapse;width:100%">
      <thead>
        <tr style="background:#f59e0b">
          <th style="border:1px solid #d97706;padding:10px 14px;color:#fff;font-weight:700;text-align:center">Conductor / Unidad</th>
          <th style="border:1px solid #d97706;padding:10px 14px;color:#fff;font-weight:700;text-align:center">Documento</th>
          <th style="border:1px solid #d97706;padding:10px 14px;color:#fff;font-weight:700;text-align:center">F. Vencimiento</th>
          <th style="border:1px solid #d97706;padding:10px 14px;color:#fff;font-weight:700;text-align:center">Estado</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    <div style="margin-top:20px;padding:12px 16px;background:#fef9c3;border-left:4px solid #f59e0b;font-size:13px;color:#713f12">
      Si ya lo actualizaste, <strong>comunícalo</strong> al área administrativa.
    </div>
  </div>
  <div style="background:#1c1917;padding:18px 28px;text-align:center">
    <p style="margin:0;font-size:15px;font-weight:800;color:#f59e0b;text-transform:uppercase">Gracias por su atencion</p>
    <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,.6)">Administracion EEMERSON SAC</p>
  </div>
</div></body></html>`
}

// ─── Lógica principal para un tipo ──────────────────────────────────────────

async function procesarTipo(tipo: string): Promise<{ enviados: number; errores: number; detalles: any[] }> {
  const supabase = getSupabase()
  const transporter = getTransporter()

  const { data: config } = await supabase
    .from('automatizacion_config')
    .select('*')
    .eq('tipo', tipo)
    .single()

  const alertasConfig = normalizeAlertas(config?.alertas)
  const filtro = config?.job_title || (tipo === 'conductores' ? 'Conductor' : tipo)
  const esVehiculo = isVehicleTipo(tipo)
  const destinationEmail: string = config?.destination_email || ''

  const uid = await odooAuth()
  const registros = await fetchRegistros(uid, tipo, filtro)

  const alertasPorRegistro: { registro: any; campos: any[] }[] = []

  for (const registro of registros) {
    if (!esVehiculo && !registro.work_email) continue

    const camposAlerta: any[] = []
    for (const campo of getCamposForTipo(tipo)) {
      const fecha = registro[campo.key]
      if (!fecha || fecha === false) continue
      const dias = getDaysUntil(fecha)
      if (dias === null) continue
      const umbrales = getAlertasEfectivas(alertasConfig, campo.key)
      if (!umbrales.length) continue
      const alertaMatch = umbrales.sort((a, b) => a.dias - b.dias).find((a) => dias <= a.dias)
      if (!alertaMatch) continue

      const { data: yaEnviado } = await supabase
        .from('automatizacion_alertas_log')
        .select('id')
        .eq('empleado_odoo_id', registro.id)
        .eq('campo', campo.key)
        .eq('dias_anticipacion', alertaMatch.dias)
        .eq('fecha_vencimiento', fecha)
        .maybeSingle()

      if (yaEnviado) continue
      camposAlerta.push({ key: campo.key, label: campo.label, fecha: fecha as string, dias, diasAlerta: alertaMatch.dias })
    }

    if (camposAlerta.length > 0) alertasPorRegistro.push({ registro, campos: camposAlerta })
  }

  const resultado = { enviados: 0, errores: 0, detalles: [] as any[] }
  if (!alertasPorRegistro.length) {
    console.log(`[cron] ${tipo}: sin alertas pendientes`)
    return resultado
  }

  const from = `"Eemerson SAC" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`

  if (esVehiculo) {
    if (!destinationEmail) {
      console.error(`[cron] ${tipo}: sin destination_email configurado`)
      resultado.errores = 1
      return resultado
    }
    const tipoLabel = tipo.charAt(0).toUpperCase() + tipo.slice(1)
    const allItems = alertasPorRegistro.flatMap((r) =>
      r.campos.map((c) => ({ label: `${r.registro.name} — ${c.label}`, fecha: c.fecha, dias: c.dias }))
    )
    try {
      await transporter.sendMail({
        from,
        to: destinationEmail,
        subject: `Documentos proximos a vencer — ${tipoLabel} (${alertasPorRegistro.length} unidades)`,
        html: buildEmailHtml(`${tipoLabel} — Flota Eemerson SAC`, allItems),
      })
      for (const { registro, campos } of alertasPorRegistro) {
        for (const campo of campos) {
          await supabase.from('automatizacion_alertas_log').upsert({
            empleado_odoo_id: registro.id,
            empleado_nombre: registro.name,
            campo: campo.key,
            dias_anticipacion: campo.diasAlerta,
            fecha_vencimiento: campo.fecha,
            enviado_a: destinationEmail,
            enviado_at: new Date().toISOString(),
          }, { onConflict: 'empleado_odoo_id,campo,dias_anticipacion,fecha_vencimiento', ignoreDuplicates: true })
        }
      }
      resultado.enviados = 1
      resultado.detalles.push({ nombre: tipoLabel, email: destinationEmail, campos: allItems.length })
      console.log(`[cron] ${tipo}: 1 correo enviado a ${destinationEmail} (${allItems.length} campos)`)
    } catch (err: any) {
      resultado.errores = 1
      resultado.detalles.push({ nombre: tipoLabel, error: err.message })
      console.error(`[cron] ${tipo} error SMTP:`, err.message)
    }
  } else {
    for (const { registro: empleado, campos } of alertasPorRegistro) {
      try {
        await transporter.sendMail({
          from,
          to: empleado.work_email,
          subject: `Documentos proximos a vencer — ${empleado.name}`,
          html: buildEmailHtml(empleado.name, campos.map((c) => ({ label: c.label, fecha: c.fecha, dias: c.dias }))),
        })
        for (const campo of campos) {
          await supabase.from('automatizacion_alertas_log').upsert({
            empleado_odoo_id: empleado.id,
            empleado_nombre: empleado.name,
            campo: campo.key,
            dias_anticipacion: campo.diasAlerta,
            fecha_vencimiento: campo.fecha,
            enviado_a: empleado.work_email,
            enviado_at: new Date().toISOString(),
          }, { onConflict: 'empleado_odoo_id,campo,dias_anticipacion,fecha_vencimiento', ignoreDuplicates: true })
        }
        resultado.enviados++
        resultado.detalles.push({ nombre: empleado.name, email: empleado.work_email, campos: campos.length })
        console.log(`[cron] ${tipo}: correo enviado a ${empleado.work_email}`)
      } catch (err: any) {
        resultado.errores++
        resultado.detalles.push({ nombre: empleado.name, error: err.message })
        console.error(`[cron] ${tipo} error ${empleado.name}:`, err.message)
      }
    }
    if (destinationEmail && alertasPorRegistro.length > 0) {
      const allItems = alertasPorRegistro.flatMap((r) =>
        r.campos.map((c) => ({ label: `${r.registro.name} — ${c.label}`, fecha: c.fecha, dias: c.dias }))
      )
      try {
        await transporter.sendMail({
          from,
          to: destinationEmail,
          subject: `Resumen conductores — ${alertasPorRegistro.length} con documentos por vencer`,
          html: buildEmailHtml('Conductores — Flota Eemerson SAC', allItems),
        })
        console.log(`[cron] ${tipo}: resumen enviado a ${destinationEmail}`)
      } catch (err: any) {
        console.error(`[cron] ${tipo} resumen error:`, err.message)
      }
    }
  }

  return resultado
}

// ─── Handler programado — 4:15am hora Peru (UTC-5 = 9:15 UTC) ───────────────

export const handler = schedule('36 9 * * *', async () => {
  console.log('[cron] Iniciando envio de alertas...')
  const tipos = ['tractos', 'carretas', 'conductores'] as const
  const resumen: Record<string, unknown> = {}

  for (const tipo of tipos) {
    try {
      resumen[tipo] = await procesarTipo(tipo)
    } catch (err: any) {
      console.error(`[cron] ${tipo} fallo total:`, err.message)
      resumen[tipo] = { error: err.message }
    }
  }

  console.log('[cron] Finalizado:', JSON.stringify(resumen))
  return { statusCode: 200, body: JSON.stringify({ ok: true, resumen }) }
})
