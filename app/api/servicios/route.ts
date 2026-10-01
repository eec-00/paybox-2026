import { NextResponse } from 'next/server'
import {
  ALL_HITO_FIELDS, TIPO_SERVICIO_BOOL_FIELDS, MODALIDAD_DEVOLUCION_FIELD, MODALIDAD_OTRO_CONDUCTOR,
  detectTipoServicio, type TaskTypeFlags,
} from '@/lib/servicios/hitos'

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
  'x_studio_subtarea_de_devolucion_creada',
  'x_studio_subtarea_de_retiro_creada',
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

const INICIO_DESCARGA_FIELD = 'x_studio_inicio_descarga'

async function moverImportacionAEnCliente(
  uid: number,
  taskId: number
): Promise<{ stageId: number; stageName: string } | null> {
  const flagFields = ['x_studio_es_import', 'x_studio_es_tarea_de_devolucion_de_vacio', 'x_studio_es_tarea_de_retiro_de_vacio', 'x_studio_almacen_de_devolucion']
  const meta = await odooCall<Record<string, unknown>>(uid, 'project.task', 'fields_get', [flagFields], { attributes: ['type'] })
  const [task] = await odooCall<(TaskTypeFlags & { stage_id: [number, string] | false; project_id: [number, string] | false })[]>(
    uid, 'project.task', 'read', [[taskId]], { fields: ['stage_id', 'project_id', ...flagFields.filter(f => f in meta)] }
  )
  if (!task || detectTipoServicio(task) !== 'importacion' || !task.project_id) return null

  const stages = await odooCall<{ id: number; name: string; sequence: number }[]>(
    uid, 'project.task.type', 'search_read',
    [[['project_ids', 'in', [task.project_id[0]]]]],
    { fields: ['id', 'name', 'sequence'], order: 'sequence asc, id asc' }
  )
  const target = stages.find(s => s.name.trim().toLowerCase() === 'en cliente')
  if (!target) return null

  const currentIdx = task.stage_id ? stages.findIndex(s => s.id === (task.stage_id as [number, string])[0]) : -1
  const targetIdx = stages.indexOf(target)
  if (currentIdx >= targetIdx) return null

  await odooCall(uid, 'project.task', 'write', [[taskId], { stage_id: target.id }])
  return { stageId: target.id, stageName: target.name }
}

/** Pone la fecha de programación del servicio padre a sus subtareas de
 * devolución de vacío que todavía no tengan fecha (nunca pisa una fecha ya
 * puesta a mano). La subtarea la crea Odoo de forma síncrona al guardar la
 * modalidad, así que ya existe cuando se llama esto. */
async function fecharSubtareaDevolucion(uid: number, parentId: number): Promise<void> {
  const [parent] = await odooCall<{ x_studio_fecha_de_la_programacin: string | false }[]>(
    uid, 'project.task', 'read', [[parentId]], { fields: ['x_studio_fecha_de_la_programacin'] }
  )
  if (!parent?.x_studio_fecha_de_la_programacin) return
  const subtareas = await odooCall<number[]>(
    uid, 'project.task', 'search',
    [[
      ['parent_id', '=', parentId],
      ['x_studio_fecha_de_la_programacin', '=', false],
      '|', ['x_studio_es_tarea_de_devolucion_de_vacio', '=', true], ['name', 'ilike', 'devoluci'],
    ]]
  )
  if (subtareas.length) {
    await odooCall(uid, 'project.task', 'write', [subtareas, { x_studio_fecha_de_la_programacin: parent.x_studio_fecha_de_la_programacin }])
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

    // partners → búsqueda de contactos de Odoo para los campos de almacén
    // (retiro/destino/devolución son many2one a res.partner). Se busca en el
    // servidor porque son miles de contactos — no se puede bajar la lista entera.
    if (body.action === 'partners') {
      const q = String(body.q || '').trim()
      if (q.length < 2) return NextResponse.json({ partners: [] })
      const uid = await odooAuth()
      const res = await odooCall<[number, string][]>(
        uid, 'res.partner', 'name_search', [], { name: q, operator: 'ilike', limit: 30 }
      )
      return NextResponse.json({ partners: res.map(([id, name]) => ({ id, name })) })
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

    // Importación: al marcar "Inicio descarga" el servicio pasa a la etapa
    // "En Cliente". Solo avanza — si ya está en una etapa posterior (ej. un
    // admin corrigiendo la hora de un servicio ya finalizado) no la regresa.
    let stageUpdate: { stageId: number; stageName: string } | null = null
    if (validFields[INICIO_DESCARGA_FIELD]) {
      try {
        stageUpdate = await moverImportacionAEnCliente(uid, id)
      } catch (e) {
        console.error('No se pudo mover a "En Cliente":', e instanceof Error ? e.message : e)
      }
    }

    // Al pasar la devolución a "Otro conductor", Odoo crea la subtarea
    // "Devolución de vacío" sin fecha — queda perdida al fondo de la tabla.
    // Se le pone la misma fecha de programación del servicio original.
    if (validFields[MODALIDAD_DEVOLUCION_FIELD] === MODALIDAD_OTRO_CONDUCTOR) {
      try {
        await fecharSubtareaDevolucion(uid, id)
      } catch (e) {
        console.error('No se pudo poner fecha a la subtarea de devolución:', e instanceof Error ? e.message : e)
      }
    }

    return NextResponse.json({ ok: true, ...(skipped.length ? { skipped } : {}), ...(stageUpdate ?? {}) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error POST /api/servicios:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
