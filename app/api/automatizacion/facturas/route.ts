import { NextRequest, NextResponse } from 'next/server'

const ODOO_URL = (process.env.ODOO_URL || process.env.URL_ODOO || '').trim().replace(/\/$/, '')
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
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
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
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
  return data.result as T
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '200')
  const offset = parseInt(searchParams.get('offset') || '0')
  const estado = searchParams.get('estado') || '' // posted, cancel, draft, all
  const busqueda = searchParams.get('q') || ''

  try {
    const uid = await odooAuth()

    const domain: unknown[] = [
      ['move_type', 'in', ['out_invoice', 'out_refund']],
    ]

    if (estado && estado !== 'all') {
      domain.push(['state', '=', estado])
    } else {
      domain.push(['state', '!=', 'draft'])
    }

    if (busqueda) {
      domain.push('|')
      domain.push(['name', 'ilike', busqueda])
      domain.push(['partner_id.name', 'ilike', busqueda])
    }

    const fields = [
      'id',
      'name',
      'move_type',
      'partner_id',
      'invoice_date',
      'invoice_date_due',
      'ref',
      'invoice_user_id',
      'amount_untaxed',
      'amount_tax',
      'amount_total',
      'state',
      'payment_state',
      'is_move_sent',
    ]

    const facturas = await odooCall<any[]>(
      uid,
      'account.move',
      'search_read',
      [domain],
      { fields, limit, offset, order: 'invoice_date desc, name desc' }
    )

    const total = await odooCall<number>(
      uid,
      'account.move',
      'search_count',
      [domain]
    )

    return NextResponse.json({ facturas: facturas ?? [], total, limit, offset })
  } catch (error: any) {
    console.error('[automatizacion/facturas]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
