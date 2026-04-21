import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'
import { CAMPOS_VENCIMIENTO, getCamposForTipo, isVehicleTipo, getDaysUntil, normalizeAlertas, getAlertasEfectivas } from '@/lib/automatizacion/campos'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ODOO_URL = (process.env.ODOO_URL || process.env.URL || '').trim().replace(/\/$/, '')
const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()

async function odooAuth(): Promise<number> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: 1,
      params: {
        service: 'common',
        method: 'authenticate',
        args: [ODOO_DB, ODOO_EMAIL, ODOO_API_KEY, {}],
      },
    }),
  })
  const data = await res.json()
  if (data.error) {
    const msg = data.error.data?.message ?? data.error.message
    throw new Error(`Autenticación Odoo fallida: ${msg}`)
  }
  if (!data.result) throw new Error('Autenticación Odoo fallida: credenciales incorrectas')
  return data.result as number
}

async function odooCall<T>(
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs],
      },
    }),
  })
  const data = await res.json()
  if (data.error) {
    const msg = data.error.data?.message ?? data.error.message
    throw new Error(`Odoo ${model}.${method}: ${msg}`)
  }
  return data.result as T
}

function buildEmailHtml(nombre: string, items: { label: string; fecha: string; dias: number }[]): string {
  const filas = items
    .map((c, idx) => {
      const bg = idx % 2 === 0 ? '#fffde7' : '#ffffff'
      const estadoColor = c.dias < 0 ? '#dc2626' : c.dias <= 7 ? '#ea580c' : c.dias <= 30 ? '#d97706' : '#854d0e'
      const estadoTxt = c.dias < 0
        ? `VENCIDO (hace ${Math.abs(c.dias)} d)`
        : c.dias === 0 ? 'VENCE HOY'
        : `${c.dias} días`
      return `<tr style="background:${bg}">
        <td style="border:1px solid #f59e0b;padding:9px 14px;font-size:13px;color:#1c1917;text-align:center">${nombre.toUpperCase()}</td>
        <td style="border:1px solid #f59e0b;padding:9px 14px;font-size:13px;color:#1c1917;text-align:center">${c.label}</td>
        <td style="border:1px solid #f59e0b;padding:9px 14px;font-size:13px;color:#1c1917;text-align:center">${c.fecha}</td>
        <td style="border:1px solid #f59e0b;padding:9px 14px;font-size:13px;font-weight:700;color:${estadoColor};text-align:center">${estadoTxt}</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f0f4f8">
<div style="max-width:660px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)">

  <!-- Header -->
  <div style="background:#ffffff;padding:28px 32px 16px;text-align:center;border-bottom:3px solid #f59e0b">
    <div style="display:inline-flex;align-items:center;gap:12px">
      <span style="font-size:32px">📢</span>
      <div>
        <h1 style="margin:0;font-size:22px;font-weight:900;letter-spacing:2px;color:#1c1917;text-transform:uppercase">Vencimientos Próximos</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#78716c;letter-spacing:1px">EEMERSON SAC — Sistema PayBox</p>
      </div>
    </div>
  </div>

  <!-- Body -->
  <div style="padding:24px 28px">
    <p style="margin:0 0 18px;font-size:14px;color:#44403c">
      Estimado(a) <strong>${nombre}</strong>, los siguientes documentos están próximos a vencer o ya han vencido.
      Por favor tome las acciones necesarias para su renovación.
    </p>

    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead>
        <tr style="background:#f59e0b">
          <th style="border:1px solid #d97706;padding:10px 14px;color:#ffffff;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.5px">Conductor / Unidad</th>
          <th style="border:1px solid #d97706;padding:10px 14px;color:#ffffff;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.5px">Documento</th>
          <th style="border:1px solid #d97706;padding:10px 14px;color:#ffffff;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.5px">F. Vencimiento</th>
          <th style="border:1px solid #d97706;padding:10px 14px;color:#ffffff;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.5px">Estado</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>

    <div style="margin-top:20px;padding:12px 16px;background:#fef9c3;border-left:4px solid #f59e0b;border-radius:4px;font-size:13px;color:#713f12">
      Si ya lo actualizaste, <strong>comunícalo</strong> al área administrativa para que pueda proceder con su presentación.
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#1c1917;padding:18px 28px;text-align:center">
    <p style="margin:0;font-size:15px;font-weight:800;color:#f59e0b;letter-spacing:1px;text-transform:uppercase">¡Agradecemos su atención!</p>
    <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,.6);letter-spacing:.5px">Administración EEMERSON SAC</p>
  </div>

</div>
</body>
</html>`
}

async function fetchRegistros(uid: number, tipo: string, filtro: string): Promise<any[]> {
  const campos = getCamposForTipo(tipo)
  const studioFields = campos.map((c) => c.key)

  if (isVehicleTipo(tipo)) {
    // fleet.vehicle — filtrar por categoría
    const domain: any[] = filtro ? [['category_id.name', '=', filtro]] : []
    const baseFields = ['id', 'name', 'license_plate']
    let base = await odooCall<any[]>(uid, 'fleet.vehicle', 'search_read', [domain], {
      fields: baseFields, limit: 500, order: 'name asc',
    }) || []
    if (base.length === 0) return []
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
    // hr.employee — filtrar por job_title
    let base = await odooCall<any[]>(uid, 'hr.employee', 'search_read',
      [[['job_title', '=', filtro]]],
      { fields: ['id', 'name', 'work_email'], limit: 500 }
    ) || []
    if (base.length === 0) {
      base = await odooCall<any[]>(uid, 'hr.employee', 'search_read',
        [[['job_title', 'ilike', filtro]]],
        { fields: ['id', 'name', 'work_email'], limit: 500 }
      ) || []
    }
    if (base.length === 0) return []
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

export async function POST(req: NextRequest) {
  try {
    const { tipo = 'conductores', soloPreview = false } = await req.json()

    // Load config from Supabase
    const { data: config } = await supabase
      .from('automatizacion_config')
      .select('*')
      .eq('tipo', tipo)
      .single()

    const alertasConfig = normalizeAlertas(config?.alertas)
    const filtro = config?.job_title || (tipo === 'conductores' ? 'Conductor' : tipo)
    const camposDeTipo = getCamposForTipo(tipo)
    const esVehiculo = isVehicleTipo(tipo)

    // Para vehículos: el email destino es destination_email configurado
    const destinationEmail = config?.destination_email || ''

    const uid = await odooAuth()
    const registros = await fetchRegistros(uid, tipo, filtro)

    const alertasPorRegistro: { registro: any; campos: any[] }[] = []

    for (const registro of registros) {
      // Conductores necesitan work_email; vehículos usan destination_email
      if (!esVehiculo && !registro.work_email) continue

      const camposAlerta: any[] = []

      for (const campo of camposDeTipo) {
        const fecha = registro[campo.key]
        if (!fecha || fecha === false) continue

        const dias = getDaysUntil(fecha)
        if (dias === null) continue

        const umbrales = getAlertasEfectivas(alertasConfig, campo.key)
        if (umbrales.length === 0) continue

        const alertaMatch = umbrales
          .sort((a, b) => a.dias - b.dias)
          .find((a) => dias <= a.dias)

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

    if (soloPreview) {
      if (esVehiculo) {
        // Para vehículos: preview consolidado
        const todosLosCampos = alertasPorRegistro.flatMap((r) =>
          r.campos.map((c) => ({ label: `${r.registro.name} — ${c.label}`, fecha: c.fecha, dias: c.dias }))
        )
        return NextResponse.json({
          preview: true,
          total: alertasPorRegistro.length > 0 ? 1 : 0,
          destinationEmail,
          detalle: alertasPorRegistro.length > 0 ? [{
            nombre: `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} (${alertasPorRegistro.length} unidades)`,
            email: destinationEmail,
            campos: todosLosCampos,
          }] : [],
        })
      }
      return NextResponse.json({
        preview: true,
        total: alertasPorRegistro.length,
        detalle: alertasPorRegistro.map((r) => ({
          nombre: r.registro.name,
          email: r.registro.work_email,
          campos: r.campos.map((c) => ({ label: c.label, fecha: c.fecha, dias: c.dias })),
        })),
      })
    }

    // Validate SMTP config
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json(
        { error: 'SMTP no configurado. Agrega SMTP_HOST, SMTP_USER y SMTP_PASS al .env.local' },
        { status: 500 }
      )
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })

    const resultados = { enviados: 0, errores: 0, omitidos: 0, detalles: [] as any[] }

    if (esVehiculo) {
      // Vehículos: un solo correo consolidado al destination_email
      if (!destinationEmail) {
        return NextResponse.json({ error: 'Configura el correo destino en Configurar → Correo destino' }, { status: 400 })
      }
      if (alertasPorRegistro.length === 0) {
        return NextResponse.json({ enviados: 0, errores: 0, omitidos: 0, detalles: [] })
      }
      const tipoLabel = tipo.charAt(0).toUpperCase() + tipo.slice(1)
      const allItems = alertasPorRegistro.flatMap((r) =>
        r.campos.map((c) => ({ label: `${r.registro.name} — ${c.label}`, fecha: c.fecha, dias: c.dias }))
      )
      try {
        await transporter.sendMail({
          from: `"Eemerson SAC" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: destinationEmail,
          subject: `⚠️ Documentos próximos a vencer — ${tipoLabel} (${alertasPorRegistro.length} unidades)`,
          html: buildEmailHtml(`${tipoLabel} — Flota Eemerson SAC`, allItems),
        })
        // Log sent alerts
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
        resultados.enviados = 1
        resultados.detalles.push({ nombre: tipoLabel, email: destinationEmail, status: 'enviado', campos: allItems.length })
      } catch (err: any) {
        resultados.errores = 1
        resultados.detalles.push({ nombre: tipoLabel, email: destinationEmail, status: 'error', error: err.message })
      }
      return NextResponse.json(resultados)
    }

    // Conductores: un email por persona
    const emailsParaEnviar = alertasPorRegistro

    for (const { registro: empleado, campos } of emailsParaEnviar) {
      try {
        await transporter.sendMail({
          from: `"Eemerson SAC" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: empleado.work_email,
          subject: `⚠️ Documentos próximos a vencer — ${empleado.name}`,
          html: buildEmailHtml(
            empleado.name,
            campos.map((c) => ({ label: c.label, fecha: c.fecha, dias: c.dias }))
          ),
        })

        for (const campo of campos) {
          await supabase.from('automatizacion_alertas_log').upsert(
            {
              empleado_odoo_id: empleado.id,
              empleado_nombre: empleado.name,
              campo: campo.key,
              dias_anticipacion: campo.diasAlerta,
              fecha_vencimiento: campo.fecha,
              enviado_a: empleado.work_email,
              enviado_at: new Date().toISOString(),
            },
            {
              onConflict: 'empleado_odoo_id,campo,dias_anticipacion,fecha_vencimiento',
              ignoreDuplicates: true,
            }
          )
        }

        resultados.enviados++
        resultados.detalles.push({ nombre: empleado.name, email: empleado.work_email, status: 'enviado', campos: campos.length })
      } catch (err: any) {
        resultados.errores++
        resultados.detalles.push({ nombre: empleado.name, email: empleado.work_email, status: 'error', error: err.message })
      }
    }

    return NextResponse.json(resultados)
  } catch (error: any) {
    console.error('[enviar-alertas]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
