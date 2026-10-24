import { NextRequest, NextResponse } from 'next/server'



import { odooAuth, odooCall } from '@/lib/odoo'
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
