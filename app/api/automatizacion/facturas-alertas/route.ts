import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'
import { normalizeAlertas } from '@/lib/automatizacion/campos'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ODOO_URL = (process.env.ODOO_URL || process.env.URL_ODOO || '').trim().replace(/\/$/, '')
const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()

async function odooAuth(): Promise<number> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: { service: 'common', method: 'authenticate', args: [ODOO_DB, ODOO_EMAIL, ODOO_API_KEY, {}] },
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
  if (!data.result) throw new Error('Autenticación Odoo fallida')
  return data.result as number
}

async function odooCall<T>(uid: number, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: Date.now(),
      params: { service: 'object', method: 'execute_kw', args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs] },
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
  return data.result as T
}

function addDays(date: Date, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function formatMoney(amount: number): string {
  return `S/ ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function buildFacturasEmailHtml(
  facturas: { name: string; cliente: string; vencimiento: string; total: number; dias: number }[]
): string {
  const filas = facturas.map((f, idx) => {
    const bg = idx % 2 === 0 ? '#fefce8' : '#ffffff'
    const estadoColor = f.dias < 0 ? '#dc2626' : f.dias <= 7 ? '#ea580c' : f.dias <= 14 ? '#d97706' : '#15803d'
    const estadoTxt = f.dias < 0
      ? `VENCIDO (hace ${Math.abs(f.dias)} d)`
      : f.dias === 0 ? 'VENCE HOY'
      : `${f.dias} días`
    return `<tr style="background:${bg}">
      <td style="border:1px solid #fbbf24;padding:9px 12px;font-size:12px;color:#1c1917;white-space:nowrap">${f.name}</td>
      <td style="border:1px solid #fbbf24;padding:9px 12px;font-size:12px;color:#1c1917">${f.cliente}</td>
      <td style="border:1px solid #fbbf24;padding:9px 12px;font-size:12px;color:#1c1917;text-align:center;white-space:nowrap">${f.vencimiento}</td>
      <td style="border:1px solid #fbbf24;padding:9px 12px;font-size:12px;color:#1c1917;text-align:right;white-space:nowrap;font-weight:600">${formatMoney(f.total)}</td>
      <td style="border:1px solid #fbbf24;padding:9px 12px;font-size:12px;font-weight:700;color:${estadoColor};text-align:center;white-space:nowrap">${estadoTxt}</td>
    </tr>`
  }).join('')

  const totalMonto = facturas.reduce((s, f) => s + f.total, 0)

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f0f4f8">
<div style="max-width:700px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)">

  <div style="background:#ffffff;padding:28px 32px 16px;text-align:center;border-bottom:3px solid #f59e0b">
    <div style="display:inline-flex;align-items:center;gap:12px">
      <span style="font-size:32px">🧾</span>
      <div>
        <h1 style="margin:0;font-size:22px;font-weight:900;letter-spacing:2px;color:#1c1917;text-transform:uppercase">Facturas por Vencer</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#78716c;letter-spacing:1px">EEMERSON SAC — Sistema PayBox</p>
      </div>
    </div>
  </div>

  <div style="padding:24px 28px">
    <p style="margin:0 0 18px;font-size:14px;color:#44403c">
      Las siguientes <strong>${facturas.length} factura(s)</strong> están próximas a vencer o ya han vencido.
      Monto total: <strong style="color:#1c1917">${formatMoney(totalMonto)}</strong>
    </p>

    <table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead>
        <tr style="background:#f59e0b">
          <th style="border:1px solid #d97706;padding:9px 12px;color:#fff;font-weight:700;text-align:left">Factura</th>
          <th style="border:1px solid #d97706;padding:9px 12px;color:#fff;font-weight:700;text-align:left">Cliente</th>
          <th style="border:1px solid #d97706;padding:9px 12px;color:#fff;font-weight:700;text-align:center">Vencimiento</th>
          <th style="border:1px solid #d97706;padding:9px 12px;color:#fff;font-weight:700;text-align:right">Total</th>
          <th style="border:1px solid #d97706;padding:9px 12px;color:#fff;font-weight:700;text-align:center">Estado</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>

    <div style="margin-top:20px;padding:12px 16px;background:#fef9c3;border-left:4px solid #f59e0b;border-radius:4px;font-size:13px;color:#713f12">
      Gestiona el cobro o coordina con el área de finanzas para el seguimiento oportuno.
    </div>
  </div>

  <div style="background:#1c1917;padding:18px 28px;text-align:center">
    <p style="margin:0;font-size:15px;font-weight:800;color:#f59e0b;letter-spacing:1px;text-transform:uppercase">Administración EEMERSON SAC</p>
    <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,.6)">Sistema PayBox — Alertas automáticas</p>
  </div>

</div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const { soloPreview = false } = await req.json()

    const { data: config } = await supabase
      .from('automatizacion_config')
      .select('*')
      .eq('tipo', 'facturas')
      .single()

    const alertasConfig = normalizeAlertas(config?.alertas)
    const globales = (alertasConfig._global || []).filter((a) => a.activo)
    const destinationEmail: string = config?.destination_email || ''

    if (globales.length === 0) {
      return NextResponse.json({ error: 'No hay umbrales de alerta configurados. Configura al menos un umbral en días.' }, { status: 400 })
    }

    const maxDias = Math.max(...globales.map((a) => a.dias))
    const today = new Date()
    const maxDateStr = addDays(today, maxDias)

    const uid = await odooAuth()

    const domain: unknown[] = [
      ['move_type', 'in', ['out_invoice', 'out_refund']],
      ['state', '=', 'posted'],
      ['payment_state', '=', 'not_paid'],
      ['invoice_date_due', '!=', false],
      ['invoice_date_due', '<=', maxDateStr],
    ]

    const facturas = await odooCall<any[]>(uid, 'account.move', 'search_read', [domain], {
      fields: ['id', 'name', 'partner_id', 'invoice_date_due', 'amount_total', 'payment_state'],
      limit: 500,
      order: 'invoice_date_due asc',
    }) || []

    // For each factura, find the matching threshold and check if already sent
    type FacturaAlerta = {
      id: number
      name: string
      cliente: string
      vencimiento: string
      total: number
      dias: number
      diasAlerta: number
    }

    const pendientes: FacturaAlerta[] = []

    for (const f of facturas) {
      const dias = daysUntil(f.invoice_date_due)
      const match = globales
        .filter((a) => dias <= a.dias)
        .sort((a, b) => a.dias - b.dias)[0]

      if (!match) continue

      const { data: yaEnviado } = await supabase
        .from('automatizacion_alertas_log')
        .select('id')
        .eq('empleado_odoo_id', f.id)
        .eq('campo', 'invoice_date_due')
        .eq('dias_anticipacion', match.dias)
        .eq('fecha_vencimiento', f.invoice_date_due)
        .maybeSingle()

      if (yaEnviado) continue

      pendientes.push({
        id: f.id,
        name: f.name,
        cliente: f.partner_id ? f.partner_id[1] : '—',
        vencimiento: f.invoice_date_due,
        total: f.amount_total,
        dias,
        diasAlerta: match.dias,
      })
    }

    if (soloPreview) {
      return NextResponse.json({
        preview: true,
        total: pendientes.length,
        destinationEmail,
        detalle: pendientes.map((p) => ({
          nombre: p.name,
          cliente: p.cliente,
          vencimiento: p.vencimiento,
          total: p.total,
          dias: p.dias,
          diasAlerta: p.diasAlerta,
        })),
      })
    }

    if (pendientes.length === 0) {
      return NextResponse.json({ enviados: 0, errores: 0, omitidos: 0, detalles: [] })
    }

    if (!destinationEmail) {
      return NextResponse.json({ error: 'Configura el correo destino en Configurar.' }, { status: 400 })
    }

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP no configurado. Agrega SMTP_HOST, SMTP_USER y SMTP_PASS al .env.local' }, { status: 500 })
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      family: 4,
    } as Parameters<typeof nodemailer.createTransport>[0])

    const resultados = { enviados: 0, errores: 0, omitidos: 0, detalles: [] as any[] }

    const destinatarios = destinationEmail.split(',').map((e: string) => e.trim()).filter(Boolean)

    try {
      await transporter.sendMail({
        from: `"Eemerson SAC" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: destinatarios.join(', '),
        subject: `⚠️ ${pendientes.length} factura(s) próximas a vencer — Eemerson SAC`,
        html: buildFacturasEmailHtml(pendientes),
      })

      for (const p of pendientes) {
        await supabase.from('automatizacion_alertas_log').upsert({
          empleado_odoo_id: p.id,
          empleado_nombre: p.name,
          campo: 'invoice_date_due',
          dias_anticipacion: p.diasAlerta,
          fecha_vencimiento: p.vencimiento,
          enviado_a: destinatarios.join(', '),
          enviado_at: new Date().toISOString(),
        }, { onConflict: 'empleado_odoo_id,campo,dias_anticipacion,fecha_vencimiento', ignoreDuplicates: true })
      }

      resultados.enviados = 1
      resultados.detalles.push({
        nombre: `${pendientes.length} facturas`,
        email: destinatarios.join(', '),
        status: 'enviado',
        campos: pendientes.length,
      })
    } catch (err: any) {
      resultados.errores = 1
      resultados.detalles.push({ nombre: 'Facturas', email: destinatarios.join(', '), status: 'error', error: err.message })
    }

    return NextResponse.json(resultados)
  } catch (error: any) {
    console.error('[facturas-alertas]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
