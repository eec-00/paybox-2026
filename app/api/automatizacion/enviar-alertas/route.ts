import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'
import { CAMPOS_VENCIMIENTO, getDaysUntil, normalizeAlertas, getAlertasEfectivas } from '@/lib/automatizacion/campos'

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
    .map((c) => {
      const estado = c.dias < 0 ? `VENCIDO (hace ${Math.abs(c.dias)} días)` : c.dias === 0 ? 'VENCE HOY' : `Vence en ${c.dias} días`
      const color = c.dias < 0 ? '#dc2626' : c.dias <= 30 ? '#d97706' : '#ca8a04'
      return `<tr>
        <td style="border:1px solid #e5e7eb;padding:10px 14px">${c.label}</td>
        <td style="border:1px solid #e5e7eb;padding:10px 14px">${c.fecha}</td>
        <td style="border:1px solid #e5e7eb;padding:10px 14px;color:${color};font-weight:600">${estado}</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f9fafb">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#1a2332;padding:24px 28px">
      <h1 style="margin:0;color:#fff;font-size:20px">⚠️ Aviso de Vencimientos</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:13px">Eemerson SAC — Sistema PayBox</p>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151">Estimado(a) <strong>${nombre}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280">
        Le informamos que los siguientes documentos están próximos a vencer o ya han vencido.
        Por favor tome las acciones necesarias para su renovación.
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="border:1px solid #e5e7eb;padding:10px 14px;text-align:left;color:#374151">Documento</th>
            <th style="border:1px solid #e5e7eb;padding:10px 14px;text-align:left;color:#374151">Fecha de Vencimiento</th>
            <th style="border:1px solid #e5e7eb;padding:10px 14px;text-align:left;color:#374151">Estado</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px">
        Atentamente,<br><strong style="color:#374151">Eemerson SAC</strong> · Sistema PayBox
      </p>
    </div>
  </div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const { tipo = 'trailers', soloPreview = false } = await req.json()

    // Load config from Supabase
    const { data: config } = await supabase
      .from('automatizacion_config')
      .select('*')
      .eq('tipo', tipo)
      .single()

    const alertasConfig = normalizeAlertas(config?.alertas)

    const jobTitle = config?.job_title || 'Conductor'

    // Fetch employees from Odoo
    const uid = await odooAuth()
    // Paso 1: obtener empleados por job_title (sin campos x_studio_ para evitar errores)
    let empleadosBase = await odooCall<any[]>(
      uid,
      'hr.employee',
      'search_read',
      [[['job_title', '=', jobTitle]]],
      { fields: ['id', 'name', 'work_email'], limit: 500 }
    )
    if (!empleadosBase || empleadosBase.length === 0) {
      empleadosBase = await odooCall<any[]>(
        uid,
        'hr.employee',
        'search_read',
        [[['job_title', 'ilike', jobTitle]]],
        { fields: ['id', 'name', 'work_email'], limit: 500 }
      ) || []
    }

    // Paso 2: obtener campos de vencimiento
    const ids = empleadosBase.map((e) => e.id)
    const studioFields = CAMPOS_VENCIMIENTO.map((c) => c.key)
    let studioData: any[] = []
    try {
      studioData = await odooCall<any[]>(
        uid,
        'hr.employee',
        'search_read',
        [[['id', 'in', ids]]],
        { fields: ['id', ...studioFields], limit: 500 }
      ) || []
    } catch {
      studioData = []
    }
    const studioMap = new Map(studioData.map((r) => [r.id, r]))
    const empleados = empleadosBase.map((emp) => ({ ...emp, ...(studioMap.get(emp.id) || {}) }))

    const emailsParaEnviar: { empleado: any; campos: any[] }[] = []

    for (const empleado of empleados || []) {
      if (!empleado.work_email) continue

      const camposAlerta: any[] = []

      for (const campo of CAMPOS_VENCIMIENTO) {
        const fecha = empleado[campo.key]
        if (!fecha || fecha === false) continue

        const dias = getDaysUntil(fecha)
        if (dias === null) continue

        // Umbrales efectivos: específicos del campo + globales
        const umbrales = getAlertasEfectivas(alertasConfig, campo.key)
        if (umbrales.length === 0) continue

        // Threshold más cercano que aún cubre los días restantes
        const alertaMatch = umbrales
          .sort((a, b) => a.dias - b.dias)
          .find((a) => dias <= a.dias)

        if (!alertaMatch) continue

        // Check if already sent for this field+threshold+date combination
        const { data: yaEnviado } = await supabase
          .from('automatizacion_alertas_log')
          .select('id')
          .eq('empleado_odoo_id', empleado.id)
          .eq('campo', campo.key)
          .eq('dias_anticipacion', alertaMatch.dias)
          .eq('fecha_vencimiento', fecha)
          .maybeSingle()

        if (yaEnviado) continue

        camposAlerta.push({
          key: campo.key,
          label: campo.label,
          fecha: fecha as string,
          dias,
          diasAlerta: alertaMatch.dias,
        })
      }

      if (camposAlerta.length > 0) {
        emailsParaEnviar.push({ empleado, campos: camposAlerta })
      }
    }

    if (soloPreview) {
      return NextResponse.json({
        preview: true,
        total: emailsParaEnviar.length,
        detalle: emailsParaEnviar.map((e) => ({
          nombre: e.empleado.name,
          email: e.empleado.work_email,
          campos: e.campos.map((c) => ({ label: c.label, fecha: c.fecha, dias: c.dias })),
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
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const resultados = { enviados: 0, errores: 0, omitidos: 0, detalles: [] as any[] }

    for (const { empleado, campos } of emailsParaEnviar) {
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

        // Log each sent alert to avoid duplicates
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
