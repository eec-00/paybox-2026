import { NextResponse } from 'next/server'
import {
  ATRIBUTOS_ODOO, type AtributosServicio, type DevolucionPago, type HorariosServicio, type ServicioPago,
} from '@/lib/pruebas/pagosConductores'
import {
  ALL_HITO_FIELDS, TIPO_SERVICIO_BOOL_FIELDS, MODALIDAD_DEVOLUCION_FIELD, MODALIDAD_RETIRO_FIELD, MODALIDAD_OTRO_CONDUCTOR,
  detectTipoServicio, getHitosForTask, type TaskTypeFlags,
} from '@/lib/servicios/hitos'
import { registrosPorStep, tiemposHitos } from '@/lib/servicios/fechasHitos'
import { createAdminClient } from '@/lib/supabase/admin'

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

interface TaskRow extends TaskTypeFlags {
  [key: string]: unknown
  id: number
  name: string
  stage_id: M2O
  partner_id: M2O
  sale_line_id: M2O
  x_studio_conductor: M2O
  x_studio_placa: M2O
  x_studio_fecha_de_la_programacin: string | false
}

const BASE_FIELDS = ['name', 'stage_id', 'partner_id', 'sale_line_id', 'x_studio_conductor', 'x_studio_placa', 'x_studio_fecha_de_la_programacin']

// Campos para los adicionales (hora de cita, horarios marcados por el
// conductor, tipo de flujo) — se validan con fields_get por si alguno no
// existe en Odoo.
const ADICIONAL_FIELDS = [
  'x_studio_hora_de_cita', 'x_studio_almacen_de_devolucion',
  MODALIDAD_DEVOLUCION_FIELD, MODALIDAD_RETIRO_FIELD,
  ...TIPO_SERVICIO_BOOL_FIELDS, ...ALL_HITO_FIELDS,
]

const SUBTAREA_DEVOLUCION_DOMAIN = ['|', ['x_studio_es_tarea_de_devolucion_de_vacio', '=', true], ['name', 'ilike', 'devoluci']]

function m2oName(v: unknown): string | null {
  return Array.isArray(v) && typeof v[1] === 'string' ? v[1] : null
}

/** Horarios de un servicio con fecha (ver lib/servicios/fechasHitos.ts): real
 * si el conductor marcó el hito con ubicación, estimada si no.
 * "Servicio finalizado" no cuenta para el fin: muchas veces se marca después
 * (ej. al finalizar desde la tabla) y no refleja cuándo terminó la operación. */
function calcularHorarios(task: TaskRow, registros: Record<number, string>): HorariosServicio {
  const hitos = getHitosForTask(task)
  const tiempos = tiemposHitos(
    hitos.map(hito => task[hito.field] as number | false),
    task.x_studio_fecha_de_la_programacin,
    registros,
    step => hitos[step].key === 'servicio_finalizado',
  )
  const h: HorariosServicio = { inicio: null, fin: null, devolucion: null, linea: [] }
  hitos.forEach((hito, step) => {
    const t = tiempos[step]
    h.linea.push({ key: hito.key, label: hito.label, min: t?.min ?? null, real: t?.real ?? false })
    if (!t || hito.key === 'servicio_finalizado') return
    if (hito.key === 'inicio_ruta') h.inicio = t.min
    if (hito.key === 'contenedor_devuelto') h.devolucion = t.min
    // El mayor, no el último: el conductor a veces marca fuera de orden
    if (h.fin === null || t.min > h.fin) h.fin = t.min
  })
  return h
}

/**
 * GET /api/pruebas/pagos-conductores?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Servicios del rango (por fecha de programación, inclusive) con los
 * atributos de su producto de venta (tipo de servicio, modalidad, tipo de
 * carga y zona), hora de cita y horarios marcados por el conductor, más las
 * subtareas de devolución de vacío (para los adicionales).
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

    const fieldInfo = await odooCall<Record<string, unknown>>(
      uid, 'project.task', 'fields_get', [ADICIONAL_FIELDS], { attributes: ['type'] }
    )
    const extraFields = ADICIONAL_FIELDS.filter(f => f in fieldInfo)

    const tasks = await odooCall<TaskRow[]>(
      uid, 'project.task', 'search_read',
      [[
        ['project_id', '=', projects[0].id],
        ['parent_id', '=', false],
        ['x_studio_fecha_de_la_programacin', '>=', start],
        ['x_studio_fecha_de_la_programacin', '<=', end],
      ]],
      {
        fields: [...BASE_FIELDS, ...extraFields],
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

    // Fecha real de cada hito marcado con ubicación desde la app del conductor
    const registrosPorTask = new Map<number, Record<number, string>>()
    if (tasks.length) {
      const { data: locs, error: locError } = await createAdminClient()
        .from('service_locations')
        .select('task_id, step_index, created_at')
        .in('task_id', tasks.map(t => t.id))
      if (locError) throw new Error(`service_locations: ${locError.message}`)
      const filasPorTask = new Map<number, { step_index: number; created_at: string }[]>()
      for (const l of locs ?? []) filasPorTask.set(l.task_id, [...(filasPorTask.get(l.task_id) ?? []), l])
      for (const [taskId, filas] of Array.from(filasPorTask.entries())) registrosPorTask.set(taskId, registrosPorStep(filas))
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
        horaCita: typeof t.x_studio_hora_de_cita === 'number' && t.x_studio_hora_de_cita !== 0
          ? Math.round(t.x_studio_hora_de_cita * 60) : null,
        flujo: detectTipoServicio(t),
        devolucionOtroConductor: t[MODALIDAD_DEVOLUCION_FIELD] === MODALIDAD_OTRO_CONDUCTOR,
        horarios: calcularHorarios(t, registrosPorTask.get(t.id) ?? {}),
      }
    })

    // Subtareas de devolución de vacío de estos servicios (se pagan como
    // adicional a quien la hizo, si no es el conductor del servicio).
    const taskById = new Map(tasks.map(t => [t.id, t]))
    const subtareas = tasks.length
      ? await odooCall<TaskRow[]>(
          uid, 'project.task', 'search_read',
          [[['parent_id', 'in', tasks.map(t => t.id)], ...SUBTAREA_DEVOLUCION_DOMAIN]],
          { fields: ['name', 'stage_id', 'parent_id', 'x_studio_conductor', ...extraFields.filter(f => f === 'x_studio_almacen_de_devolucion')] }
        )
      : []
    const devoluciones: DevolucionPago[] = subtareas.flatMap(st => {
      const padre = Array.isArray(st.parent_id) ? taskById.get(st.parent_id[0] as number) : undefined
      if (!padre) return []
      return [{
        id: st.id,
        name: st.name,
        etapa: st.stage_id ? st.stage_id[1] : null,
        conductorId: st.x_studio_conductor ? st.x_studio_conductor[0] : null,
        conductor: st.x_studio_conductor ? st.x_studio_conductor[1] : null,
        almacen: m2oName(st.x_studio_almacen_de_devolucion) ?? m2oName(padre.x_studio_almacen_de_devolucion),
        fecha: padre.x_studio_fecha_de_la_programacin,
        padreId: padre.id,
        padreName: padre.name,
        padreConductorId: padre.x_studio_conductor ? padre.x_studio_conductor[0] : null,
        padreConductor: padre.x_studio_conductor ? padre.x_studio_conductor[1] : null,
      }]
    })

    return NextResponse.json({ servicios, devoluciones, rango: { start, end } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error en /api/pruebas/pagos-conductores:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
