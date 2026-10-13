import { NextResponse } from 'next/server'
import { ATRIBUTOS_ODOO, type AtributosServicio, type ServicioPago } from '@/lib/pruebas/pagosConductores'

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

async function odooCall<T = unknown>(uid: number, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
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

type M2O = [number, string] | false

interface TaskRow {
  id: number
  name: string
  stage_id: M2O
  partner_id: M2O
  sale_line_id: M2O
  x_studio_conductor: M2O
  x_studio_placa: M2O
  x_studio_fecha_de_la_programacin: string | false
}

/**
 * GET /api/pruebas/pagos-conductores?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Servicios del rango (por fecha de programación, inclusive) con los
 * atributos de su producto de venta (tipo de servicio, modalidad, tipo de
 * carga y zona).
 * Las subtareas (ej. "Devolución de vacío") se excluyen: heredan la misma
 * línea de venta del servicio padre y se pagarían dos veces.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || ''
    const end = searchParams.get('end') || ''
    const fechaRe = /^\d{4}-\d{2}-\d{2}$/
    if (!fechaRe.test(start) || !fechaRe.test(end)) {
      return NextResponse.json({ error: 'Parámetros start/end inválidos (YYYY-MM-DD)' }, { status: 400 })
    }

    const uid = await odooAuth()

    const projects = await odooCall<{ id: number }[]>(
      uid, 'project.project', 'search_read',
      [[['name', 'ilike', 'Servicio de Transporte']]], { fields: ['id'], limit: 1 }
    )
    if (!projects.length) {
      return NextResponse.json({ error: 'Proyecto "Servicio de Transporte" no encontrado en Odoo' }, { status: 404 })
    }

    const tasks = await odooCall<TaskRow[]>(
      uid, 'project.task', 'search_read',
      [[
        ['project_id', '=', projects[0].id],
        ['parent_id', '=', false],
        ['x_studio_fecha_de_la_programacin', '>=', start],
        ['x_studio_fecha_de_la_programacin', '<=', end],
      ]],
      {
        fields: ['name', 'stage_id', 'partner_id', 'sale_line_id', 'x_studio_conductor', 'x_studio_placa', 'x_studio_fecha_de_la_programacin'],
        order: 'x_studio_fecha_de_la_programacin asc, name asc',
      }
    )

    // tarea → línea de venta → producto → valores de atributo (3 lecturas en lote)
    const saleLineIds = Array.from(new Set(tasks.filter(t => t.sale_line_id).map(t => (t.sale_line_id as [number, string])[0])))
    const saleLines = saleLineIds.length
      ? await odooCall<{ id: number; product_id: M2O }[]>(uid, 'sale.order.line', 'read', [saleLineIds], { fields: ['product_id'] })
      : []
    const productBySaleLine = new Map(saleLines.map(l => [l.id, l.product_id ? l.product_id[0] : null]))

    const productIds = Array.from(new Set(saleLines.filter(l => l.product_id).map(l => (l.product_id as [number, string])[0])))
    const products = productIds.length
      ? await odooCall<{ id: number; product_template_attribute_value_ids: number[] }[]>(
          uid, 'product.product', 'read', [productIds],
          { fields: ['product_template_attribute_value_ids'], context: { active_test: false } }
        )
      : []

    const ptavIds = Array.from(new Set(products.flatMap(p => p.product_template_attribute_value_ids)))
    const ptavs = ptavIds.length
      ? await odooCall<{ id: number; name: string; attribute_id: M2O }[]>(
          uid, 'product.template.attribute.value', 'read', [ptavIds], { fields: ['name', 'attribute_id'] }
        )
      : []
    const ptavById = new Map(ptavs.map(v => [v.id, v]))

    const atributosByProduct = new Map<number, AtributosServicio>()
    for (const p of products) {
      const a: AtributosServicio = { tipoServicio: null, modalidad: null, tipoCarga: null, zona: null }
      for (const vid of p.product_template_attribute_value_ids) {
        const v = ptavById.get(vid)
        const key = v?.attribute_id ? ATRIBUTOS_ODOO[v.attribute_id[1]] : undefined
        if (v && key) a[key] = v.name
      }
      atributosByProduct.set(p.id, a)
    }

    const vacio: AtributosServicio = { tipoServicio: null, modalidad: null, tipoCarga: null, zona: null }
    const servicios: ServicioPago[] = tasks.map(t => {
      const productId = t.sale_line_id ? productBySaleLine.get(t.sale_line_id[0]) : null
      return {
        id: t.id,
        name: t.name,
        fecha: t.x_studio_fecha_de_la_programacin,
        etapa: t.stage_id ? t.stage_id[1] : null,
        cliente: t.partner_id ? t.partner_id[1] : null,
        conductorId: t.x_studio_conductor ? t.x_studio_conductor[0] : null,
        conductor: t.x_studio_conductor ? t.x_studio_conductor[1] : null,
        placa: t.x_studio_placa ? t.x_studio_placa[1] : null,
        atributos: (productId && atributosByProduct.get(productId)) || vacio,
      }
    })

    return NextResponse.json({ servicios, rango: { start, end } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error en /api/pruebas/pagos-conductores:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
