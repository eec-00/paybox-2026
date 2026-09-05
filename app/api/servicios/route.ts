import { NextResponse } from 'next/server'
import { ALL_HITO_FIELDS, TIPO_SERVICIO_BOOL_FIELDS } from '@/lib/servicios/hitos'

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
  if (!data.result) throw new Error('Autenticación Odoo fallida')
  return data.result as number
}

async function odooCall<T = unknown>(
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

// Base fields always present on project.task
const BASE_FIELDS = ['name', 'stage_id', 'partner_id', 'date_deadline', 'parent_id']

// Candidate x_studio fields — validated at runtime via fields_get
const CANDIDATE_X_FIELDS = [
  // OPERATIVA TRANSPORTE
  'x_studio_fecha_de_la_programacin',
  'x_studio_hora_de_cita',
  'x_studio_placa',
  'x_studio_placa_carreta',
  'x_studio_conductor',
  'x_studio_referenciabooking',
  'x_studio_agencia',
  'x_studio_nmero_de_contenedor',
  'x_studio_almacen_de_retiro',
  'x_studio_almacen_de_destino',
  'x_studio_almacen_de_devolucion',
  'x_studio_es_importacion',
  'x_studio_modalidad_de_devolucion',
  'x_studio_modalidad_de_retiro',
  ...TIPO_SERVICIO_BOOL_FIELDS,
  // TIEMPOS OPERATIVOS (genéricos, se mantienen por compatibilidad)
  'x_studio_saliendo_de_la_cochera',
  'x_studio_en_cola_de_ingreso',
  'x_studio_ingreso_a_almacen_de_retiro_1',
  'x_studio_salida_de_almacen_de_retiro',
  'x_studio_llegada_a_cliente',
  'x_studio_ingreso_a_planta',
  'x_studio_inicio_cargadescarga',
  'x_studio_termino_de_descarga',
  'x_studio_salida_cliente',
  // TIEMPOS OPERATIVOS (catálogo completo por tipo de servicio)
  ...ALL_HITO_FIELDS,
]

async function getValidFields(uid: number): Promise<string[]> {
  const allFields = await odooCall<Record<string, unknown>>(
    uid,
    'project.task',
    'fields_get',
    [CANDIDATE_X_FIELDS],
    { attributes: ['string', 'type'] }
  )
  const valid = Object.keys(allFields)
  return [...BASE_FIELDS, ...valid]
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const idParam = searchParams.get('id')
    const stageFilter = searchParams.get('stage') || ''
    // El proyecto "Servicio de Transporte" ya supera las 2500 tareas. Con un
    // límite bajo (antes 500) y orden alfabético descendente, las subtareas
    // (ej. "Devolución de vacío", "Retiro de vacío – Exportación") — cuyo
    // nombre no empieza con "S0XXXX" — quedaban siempre fuera del corte junto
    // con miles de servicios antiguos, invisibles en el panel admin sin que
    // nadie lo notara. Se sube el límite por defecto muy por encima del
    // total actual para no perder datos silenciosamente.
    const limitParam = parseInt(searchParams.get('limit') || '10000')
    const debugFields = searchParams.get('fields') === '1'

    const uid = await odooAuth()

    // Discover which x_studio fields actually exist
    const validFields = await getValidFields(uid)

    // Detalle de un solo servicio (para la vista de detalle)
    if (idParam) {
      const taskId = parseInt(idParam)
      const tasks = await odooCall<Record<string, unknown>[]>(
        uid,
        'project.task',
        'search_read',
        [[['id', '=', taskId]]],
        { fields: validFields, limit: 1 }
      )
      if (!tasks.length) {
        return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
      }
      const task = tasks[0]

      let conductor: Record<string, unknown> | null = null
      const conductorRef = task.x_studio_conductor
      if (Array.isArray(conductorRef) && conductorRef[0]) {
        try {
          const empCandidateFields = ['id', 'name', 'work_phone', 'mobile_phone', 'job_title', 'work_email']
          const empMeta = await odooCall<Record<string, unknown>>(
            uid, 'hr.employee', 'fields_get', [empCandidateFields], { attributes: ['type'] }
          )
          const empFields = empCandidateFields.filter((f) => f in empMeta)
          const emps = await odooCall<Record<string, unknown>[]>(
            uid,
            'hr.employee',
            'search_read',
            [[['id', '=', conductorRef[0]]]],
            { fields: empFields, limit: 1 }
          )
          conductor = emps[0] || null
        } catch {
          conductor = null
        }
      }

      let cliente: Record<string, unknown> | null = null
      const clienteRef = task.partner_id
      if (Array.isArray(clienteRef) && clienteRef[0]) {
        try {
          const partnerCandidateFields = ['id', 'name', 'email', 'phone', 'mobile', 'vat', 'street', 'city', 'website']
          const partnerMeta = await odooCall<Record<string, unknown>>(
            uid, 'res.partner', 'fields_get', [partnerCandidateFields], { attributes: ['type'] }
          )
          const partnerFields = partnerCandidateFields.filter((f) => f in partnerMeta)
          const partners = await odooCall<Record<string, unknown>[]>(
            uid,
            'res.partner',
            'search_read',
            [[['id', '=', clienteRef[0]]]],
            { fields: partnerFields, limit: 1 }
          )
          cliente = partners[0] || null
        } catch {
          cliente = null
        }
      }

      return NextResponse.json({ task, conductor, cliente })
    }

    if (debugFields) {
      // Debug mode: return field list with their labels/types
      const allStudioFields = await odooCall<Record<string, { string: string; type: string }>>(
        uid,
        'project.task',
        'fields_get',
        [],
        { attributes: ['string', 'type'] }
      )
      const xStudioOnly = Object.fromEntries(
        Object.entries(allStudioFields).filter(([k]) => k.startsWith('x_studio'))
      )
      return NextResponse.json({ fields: xStudioOnly, validFromCandidates: validFields })
    }

    const projects = await odooCall<{ id: number; name: string }[]>(
      uid,
      'project.project',
      'search_read',
      [[['name', 'ilike', 'Servicio de Transporte']]],
      { fields: ['id', 'name'], limit: 1 }
    )

    if (!projects.length) {
      return NextResponse.json(
        { error: 'Proyecto "Servicio de Transporte" no encontrado en Odoo' },
        { status: 404 }
      )
    }

    const projectId = projects[0].id

    const domain: unknown[] = [['project_id', '=', projectId]]
    if (stageFilter) domain.push(['stage_id.name', 'ilike', stageFilter])

    const tasks = await odooCall<any[]>(
      uid,
      'project.task',
      'search_read',
      [domain],
      {
        fields: validFields,
        order: 'name desc',
        limit: limitParam,
      }
    )

    // Las subtareas (ej. "Devolución de vacío", "Retiro de vacío –
    // Exportación") se crean duplicando una plantilla en blanco (ver
    // automatización de Odoo), no copiando los datos del servicio padre —
    // así que contenedor, booking, agencia y almacén de devolución les
    // quedan vacíos en la tabla aunque describen el mismo servicio. Si vienen
    // vacíos, se completan con los del servicio padre (nunca se pisa lo que
    // la subtarea sí trae propio, como su placa/conductor).
    const PARENT_FALLBACK_FIELDS = [
      'x_studio_nmero_de_contenedor', 'x_studio_referenciabooking',
      'x_studio_agencia', 'x_studio_almacen_de_devolucion',
    ].filter(f => validFields.includes(f))

    if (PARENT_FALLBACK_FIELDS.length > 0) {
      const parentIds = Array.from(new Set(
        tasks
          .filter(t => Array.isArray(t.parent_id) && PARENT_FALLBACK_FIELDS.some(f => !t[f]))
          .map(t => t.parent_id[0] as number)
      ))
      if (parentIds.length > 0) {
        const parents = await odooCall<any[]>(
          uid, 'project.task', 'read', [parentIds], { fields: PARENT_FALLBACK_FIELDS }
        )
        const parentById = new Map(parents.map(p => [p.id, p]))
        for (const t of tasks) {
          if (!Array.isArray(t.parent_id)) continue
          const parent = parentById.get(t.parent_id[0])
          if (!parent) continue
          for (const f of PARENT_FALLBACK_FIELDS) {
            if (!t[f] && parent[f]) t[f] = parent[f]
          }
        }
      }
    }

    const stages = await odooCall<{ id: number; name: string }[]>(
      uid,
      'project.task.type',
      'search_read',
      [[['project_ids', 'in', [projectId]]]],
      { fields: ['id', 'name'], order: 'sequence asc' }
    )

    return NextResponse.json({ tasks, stages, total: tasks.length, projectId, validFields })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error en /api/servicios:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // conductores → lista de empleados para el select
    // Finalizar servicio → busca stage "Servicio Finalizado" y lo asigna
    if (body.action === 'finalize') {
      const { id } = body as { id: number }
      const uid = await odooAuth()
      const stages = await odooCall<{ id: number; name: string }[]>(
        uid, 'project.task.type', 'search_read',
        [[['name', 'ilike', 'finaliz']]],
        { fields: ['id', 'name'], limit: 5 }
      )
      if (!stages.length) {
        return NextResponse.json({ error: 'No se encontró etapa "Servicio Finalizado"' }, { status: 404 })
      }
      const stage = stages[0]
      await odooCall(uid, 'project.task', 'write', [[id], { stage_id: stage.id }])
      return NextResponse.json({ ok: true, stageId: stage.id, stageName: stage.name })
    }

    if (body.action === 'conductores') {
      const uid = await odooAuth()
      const empleados = await odooCall<{ id: number; name: string }[]>(
        uid,
        'hr.employee',
        'search_read',
        [[['active', '=', true]]],
        { fields: ['id', 'name'], order: 'name asc', limit: 300 }
      )
      return NextResponse.json({ empleados })
    }

    // flota → lista de vehículos para selects de placa
    if (body.action === 'flota') {
      const uid = await odooAuth()
      const vehiculos = await odooCall<{
        id: number
        name: string
        license_plate: string
        category_id: [number, string] | false
      }[]>(
        uid,
        'fleet.vehicle',
        'search_read',
        [[['active', '=', true]]],
        { fields: ['id', 'name', 'license_plate', 'category_id'], order: 'license_plate asc', limit: 500 }
      )
      return NextResponse.json({ vehiculos })
    }

    // Editar tarea
    const { id, fields } = body as { id: number; fields: Record<string, unknown> }
    if (!id || !fields || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'id y fields requeridos' }, { status: 400 })
    }

    const uid = await odooAuth()

    // Validate fields exist before writing — invalid fields → skip silently
    const fieldNames = Object.keys(fields)
    const existingMeta = await odooCall<Record<string, unknown>>(
      uid, 'project.task', 'fields_get', [fieldNames], { attributes: ['type'] }
    )
    const validFields = Object.fromEntries(
      Object.entries(fields).filter(([k]) => k in existingMeta)
    )
    const skipped = fieldNames.filter(k => !(k in existingMeta))

    if (Object.keys(validFields).length > 0) {
      await odooCall(uid, 'project.task', 'write', [[id], validFields])
    }

    return NextResponse.json({ ok: true, ...(skipped.length ? { skipped } : {}) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error POST /api/servicios:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
