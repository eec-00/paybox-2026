import { NextResponse } from 'next/server'
import {
  ATRIBUTOS_ODOO, type AsistenciaPago, type AtributosServicio, type DevolucionPago, type GastoPago, type HorariosServicio, type ServicioPago,
} from '@/lib/pruebas/pagosConductores'
import {
  ALL_HITO_FIELDS, TIPO_SERVICIO_BOOL_FIELDS, MODALIDAD_DEVOLUCION_FIELD, MODALIDAD_RETIRO_FIELD, MODALIDAD_OTRO_CONDUCTOR,
  detectTipoServicio, getHitosForTask, type TaskTypeFlags,
} from '@/lib/servicios/hitos'
import { fechaLima, registrosPorStep, sumarDias, tiemposHitos } from '@/lib/servicios/fechasHitos'
import { consultarSerieTcSbs, tipoCambioDelDia } from '@/lib/pruebas/tipoCambioSbs'
import { CAMPOS_CITA, CAMPO_CITA_DEVOLUCION, aplicarCitasNuevas, citaLima, diasEntre } from '@/lib/servicios/citas'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'



import { odooAuth, odooCall } from '@/lib/odoo'
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
  'x_studio_hora_de_cita', 'x_studio_hora_de_devolucion', ...CAMPOS_CITA, 'x_studio_almacen_de_devolucion', 'x_studio_almacen_de_destino',
  MODALIDAD_DEVOLUCION_FIELD, MODALIDAD_RETIRO_FIELD,
  ...TIPO_SERVICIO_BOOL_FIELDS, ...ALL_HITO_FIELDS,
]

/** Hito I12 «Contenedor vacío devuelto»: acredita la devolución de la subtarea (guía v1.0 §3.06) */
const CAMPO_I12 = 'x_studio_contenedor_vacio_devuelto'

const SUBTAREA_DEVOLUCION_DOMAIN = ['|', ['x_studio_es_tarea_de_devolucion_de_vacio', '=', true], ['name', 'ilike', 'devoluci']]

/** Cita de devolución en minutos desde la medianoche del día de programación
 * (> 1440 si es otro día). Con «Fecha y hora de cita de devolución» el día es
 * exacto; con la «Hora de Devolución» antigua se asume el día de programación. */
function citaDevolucionMin(t: TaskRow): number | null {
  const nueva = citaLima(t[CAMPO_CITA_DEVOLUCION])
  if (nueva && t.x_studio_fecha_de_la_programacin) {
    return diasEntre(t.x_studio_fecha_de_la_programacin, nueva.fecha) * 1440 + Math.round(nueva.hora * 60)
  }
  const h = t.x_studio_hora_de_devolucion
  return typeof h === 'number' && h !== 0 ? Math.round(h * 60) : null
}

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
    // La pantalla es solo para administradores; el permiso también debe valer acá
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'developer'].includes(profile.role)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

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

    // Distrito del «Almacén de Destino» de cada tarea (dirección de entrega del cliente en Odoo)
    const destinoIds = Array.from(new Set(tasks.map(t => t.x_studio_almacen_de_destino).filter(Array.isArray).map(v => (v as [number, string])[0])))
    const distritoDe = new Map<number, string | null>()
    if (destinoIds.length) {
      const dirs = await odooCall<{ id: number; l10n_pe_district?: M2O }[]>(
        uid, 'res.partner', 'read', [destinoIds], { fields: ['l10n_pe_district'], context: { active_test: false } },
      ).catch(() => [])
      for (const d of dirs) distritoDe.set(d.id, d.l10n_pe_district ? d.l10n_pe_district[1] : null)
    }

    const vacio: AtributosServicio = { tipoServicio: null, modalidad: null, tipoCarga: null, zona: null }
    tasks.forEach(aplicarCitasNuevas)
    const servicios: ServicioPago[] = tasks.map(t => {
      const dest = Array.isArray(t.x_studio_almacen_de_destino) ? t.x_studio_almacen_de_destino as [number, string] : null
      const productId = t.sale_line_id ? productBySaleLine.get(t.sale_line_id[0]) : null
      return {
        id: t.id,
        name: t.name,
        fecha: t.x_studio_fecha_de_la_programacin,
        etapa: t.stage_id ? t.stage_id[1] : null,
        cliente: t.partner_id ? t.partner_id[1] : null,
        clienteId: t.partner_id ? t.partner_id[0] : null,
        conductorId: t.x_studio_conductor ? t.x_studio_conductor[0] : null,
        conductor: t.x_studio_conductor ? t.x_studio_conductor[1] : null,
        placa: t.x_studio_placa ? t.x_studio_placa[1] : null,
        atributos: (productId && atributosByProduct.get(productId)) || vacio,
        horaCita: typeof t.x_studio_hora_de_cita === 'number' && t.x_studio_hora_de_cita !== 0
          ? Math.round(t.x_studio_hora_de_cita * 60) : null,
        flujo: detectTipoServicio(t),
        devolucionOtroConductor: t[MODALIDAD_DEVOLUCION_FIELD] === MODALIDAD_OTRO_CONDUCTOR,
        horarios: calcularHorarios(t, registrosPorTask.get(t.id) ?? {}),
        citaDevolucion: citaDevolucionMin(t),
        almacenDestino: dest ? { id: dest[0], nombre: dest[1], distrito: distritoDe.get(dest[0]) ?? null } : null,
      }
    })

    // Subtareas de devolución de vacío de estos servicios (se pagan como
    // adicional a quien la hizo, si no es el conductor del servicio).
    const taskById = new Map(tasks.map(t => [t.id, t]))
    const subtareas = tasks.length
      ? await odooCall<TaskRow[]>(
          uid, 'project.task', 'search_read',
          [[['parent_id', 'in', tasks.map(t => t.id)], ...SUBTAREA_DEVOLUCION_DOMAIN]],
          { fields: ['name', 'stage_id', 'parent_id', 'x_studio_conductor', ...extraFields.filter(f => f === 'x_studio_almacen_de_devolucion' || f === CAMPO_I12)] }
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
        devueltoMin: typeof st[CAMPO_I12] === 'number' && st[CAMPO_I12] !== 0 ? Math.round((st[CAMPO_I12] as number) * 60) : null,
        padreId: padre.id,
        padreName: padre.name,
        padreConductorId: padre.x_studio_conductor ? padre.x_studio_conductor[0] : null,
        padreConductor: padre.x_studio_conductor ? padre.x_studio_conductor[1] : null,
      }]
    })

    // Asistencia (máquina) y gastos (reembolsables) de la app, cruzados con el
    // empleado de Odoo por user_profiles.odoo_employee_id
    const admin = createAdminClient()
    const empleados = Array.from(new Set(
      [...servicios.map(s => s.conductorId), ...devoluciones.map(d => d.conductorId)].filter((x): x is number => x !== null),
    ))
    const taskIds = [...tasks.map(t => t.id), ...subtareas.map(st => st.id)]
    const { data: gastosRaw, error: gastosError } = taskIds.length
      ? await admin.from('gastos_conductor')
        .select('id, servicio_id, servicio_nombre, conductor_id, conductor_nombre, descripcion, monto, moneda, estado, fotos, created_at')
        .in('servicio_id', taskIds)
      : { data: [], error: null }
    if (gastosError) throw new Error(`gastos_conductor: ${gastosError.message}`)

    const usuariosGasto = Array.from(new Set((gastosRaw ?? []).map(g => g.conductor_id as string)))
    const perfiles: { id: string; odoo_employee_id: number | null }[] = []
    if (empleados.length) {
      const { data, error: e } = await admin.from('user_profiles').select('id, odoo_employee_id').in('odoo_employee_id', empleados)
      if (e) throw new Error(`user_profiles: ${e.message}`)
      perfiles.push(...(data ?? []))
    }
    if (usuariosGasto.length) {
      const { data, error: e } = await admin.from('user_profiles').select('id, odoo_employee_id').in('id', usuariosGasto)
      if (e) throw new Error(`user_profiles: ${e.message}`)
      perfiles.push(...(data ?? []))
    }
    const empleadoDe = new Map(perfiles.map(p => [p.id, p.odoo_employee_id]))

    const usuariosConductores = perfiles.filter(p => p.odoo_employee_id !== null && empleados.includes(p.odoo_employee_id)).map(p => p.id)
    const { data: asistRaw, error: asistError } = usuariosConductores.length
      ? await admin.from('asistencias_conductor')
        .select('conductor_id, created_at, salida_at')
        .in('conductor_id', Array.from(new Set(usuariosConductores)))
        .gte('created_at', `${start}T05:00:00Z`)
        .lt('created_at', `${sumarDias(end, 1)}T05:00:00Z`)
      : { data: [], error: null }
    if (asistError) throw new Error(`asistencias_conductor: ${asistError.message}`)

    const asistencias: AsistenciaPago[] = (asistRaw ?? []).flatMap(a => {
      const conductorId = empleadoDe.get(a.conductor_id as string)
      return conductorId ? [{ conductorId, fecha: fechaLima(a.created_at as string), salida: !!a.salida_at }] : []
    })
    const gastos: GastoPago[] = (gastosRaw ?? []).map(g => ({
      id: g.id as string,
      servicioId: g.servicio_id as number,
      servicio: (g.servicio_nombre as string | null) ?? null,
      conductorId: empleadoDe.get(g.conductor_id as string) ?? null,
      conductor: (g.conductor_nombre as string | null) ?? null,
      descripcion: (g.descripcion as string | null) ?? null,
      monto: Number(g.monto),
      moneda: (g.moneda as string) || 'soles',
      estado: g.estado as string,
      fotos: Array.isArray(g.fotos) ? g.fotos.length : 0,
      fecha: fechaLima(g.created_at as string),
    }))

    // Gastos en dólares: tipo de cambio venta SBS del día del gasto (BCRP)
    const fechasDolares = gastos.filter(g => g.moneda === 'dolares').map(g => g.fecha).sort()
    if (fechasDolares.length) {
      const serie = await consultarSerieTcSbs(sumarDias(fechasDolares[0], -10), fechasDolares[fechasDolares.length - 1])
      for (const g of gastos) if (g.moneda === 'dolares') g.tipoCambio = tipoCambioDelDia(serie, g.fecha)
    }

    return NextResponse.json({ servicios, devoluciones, asistencias, gastos, rango: { start, end } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error en /api/pruebas/pagos-conductores:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
