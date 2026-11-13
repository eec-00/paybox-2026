import { NextResponse } from 'next/server'
import {
  ALL_HITO_FIELDS, TIPO_SERVICIO_BOOL_FIELDS, MODALIDAD_DEVOLUCION_FIELD, MODALIDAD_OTRO_CONDUCTOR,
  detectTipoServicio, type TaskTypeFlags,
} from '@/lib/servicios/hitos'
import { fechaCorte } from '@/lib/servicios/rango'
import { createClient } from '@/lib/supabase/server'
import { odooAuth, odooCall } from '@/lib/odoo'
import { etapaFinalizadoDe } from '@/lib/servicios/etapas'
import { puedeEditarServicios, puedeVerServicios, SIN_PERMISO_EDITAR } from '@/lib/servicios/permisos'

type Acceso =
  | { tipo: 'panel'; puedeEditar: boolean }
  | { tipo: 'conductor'; employeeId: number | null; employeeName: string }

/** Quién llama y qué puede hacer. Panel = admin/developer o usuario con el
 * módulo Servicios (sin module_permissions = acceso a todo, igual que el
 * Sidebar). Conductor = solo sus propias tareas, y solo marcar hitos /
 * modalidad / finalizar — nunca leer la lista completa ni editar otros campos. */
async function getAcceso(): Promise<Acceso | NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, can_edit, module_permissions, odoo_employee_id, odoo_employee_name')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  if (profile.role === 'conductor') {
    return { tipo: 'conductor', employeeId: profile.odoo_employee_id || null, employeeName: profile.odoo_employee_name || '' }
  }
  if (puedeVerServicios(profile)) {
    return { tipo: 'panel', puedeEditar: puedeEditarServicios(profile) }
  }
  return NextResponse.json({ error: 'Se requiere acceso al módulo de Servicios' }, { status: 403 })
}

// Lo único que el portal del conductor escribe: la hora de cada hito y la
// modalidad de devolución.
const CAMPOS_CONDUCTOR = new Set<string>([...ALL_HITO_FIELDS, MODALIDAD_DEVOLUCION_FIELD])

/** ¿La tarea está asignada a este conductor? Mismo criterio que
 * /api/conductor/servicios: por id de empleado, o por nombre si no lo tiene. */
async function esTareaDelConductor(uid: number, taskId: number, acceso: Extract<Acceso, { tipo: 'conductor' }>): Promise<boolean> {
  const [task] = await odooCall<{ x_studio_conductor: [number, string] | false }[]>(
    uid, 'project.task', 'read', [[taskId]], { fields: ['x_studio_conductor'] }
  )
  const ref = task?.x_studio_conductor
  if (!Array.isArray(ref)) return false
  if (acceso.employeeId) return ref[0] === acceso.employeeId
  const nombre = acceso.employeeName.trim().toLowerCase()
  return !!nombre && ref[1].toLowerCase().includes(nombre)
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
  'x_studio_fecha_maxima_de_devolucion',
  // En la subtarea de devolución: relacionado (solo lectura) al del padre
  'x_studio_fecha_maxima_de_devolucion_1',
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
    // La lista y el detalle exponen clientes y datos de todos los servicios:
    // solo para el panel. El conductor lee lo suyo en /api/conductor/servicios.
    const acceso = await getAcceso()
    if (acceso instanceof NextResponse) return acceso
    if (acceso.tipo !== 'panel') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

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

      // Etapas del proyecto del servicio, para la barra de etapas del detalle
      let stages: { id: number; name: string }[] = []
      try {
        const [{ project_id }] = await odooCall<{ project_id: [number, string] | false }[]>(
          uid, 'project.task', 'read', [[taskId]], { fields: ['project_id'] }
        )
        if (project_id) {
          stages = await odooCall<{ id: number; name: string }[]>(
            uid, 'project.task.type', 'search_read',
            [[['project_ids', 'in', [project_id[0]]]]],
            { fields: ['id', 'name'], order: 'sequence asc, id asc' }
          )
        }
      } catch {
        stages = []
      }

      return NextResponse.json({ task, conductor, cliente, stages })
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

    // ?dias=N → solo servicios programados en los últimos N días. Entran
    // también las subtareas cuyo servicio padre cae en el rango (pueden no
    // traer fecha propia) y los servicios aún sin fecha creados en el rango
    // (ej. una "Nueva solicitud" que todavía no se programa).
    const dias = parseInt(searchParams.get('dias') || '')
    if (dias > 0) {
      const corte = fechaCorte(dias)
      domain.push(
        '|', '|',
        ['x_studio_fecha_de_la_programacin', '>=', corte],
        ['parent_id.x_studio_fecha_de_la_programacin', '>=', corte],
        '&', ['x_studio_fecha_de_la_programacin', '=', false], ['create_date', '>=', `${corte} 00:00:00`],
      )
    }

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

const ALMACEN_DEVOLUCION_FIELD = 'x_studio_almacen_de_devolucion'
const SUBTAREA_DEVOLUCION_DOMAIN = ['|', ['x_studio_es_tarea_de_devolucion_de_vacio', '=', true], ['name', 'ilike', 'devoluci']]

/** Completa las subtareas de devolución de vacío del servicio padre con lo
 * que la automatización de Odoo no copia (duplica una plantilla en blanco):
 * fecha de programación y almacén de devolución. Solo llena lo que esté
 * vacío — nunca pisa algo puesto a mano. La fecha máxima de devolución no
 * hace falta: en la subtarea es un campo relacionado al del padre. La
 * subtarea la crea Odoo de forma síncrona al guardar la modalidad, así que
 * ya existe cuando se llama esto. */
async function completarSubtareaDevolucion(uid: number, parentId: number): Promise<void> {
  const [parent] = await odooCall<{ x_studio_fecha_de_la_programacin: string | false; x_studio_almacen_de_devolucion: [number, string] | false }[]>(
    uid, 'project.task', 'read', [[parentId]], { fields: ['x_studio_fecha_de_la_programacin', ALMACEN_DEVOLUCION_FIELD] }
  )
  if (!parent) return
  const copiar: [string, unknown][] = [
    ['x_studio_fecha_de_la_programacin', parent.x_studio_fecha_de_la_programacin || false],
    [ALMACEN_DEVOLUCION_FIELD, parent.x_studio_almacen_de_devolucion ? parent.x_studio_almacen_de_devolucion[0] : false],
  ]
  for (const [field, value] of copiar) {
    if (!value) continue
    const subtareas = await odooCall<number[]>(
      uid, 'project.task', 'search',
      [[['parent_id', '=', parentId], [field, '=', false], ...SUBTAREA_DEVOLUCION_DOMAIN]]
    )
    if (subtareas.length) await odooCall(uid, 'project.task', 'write', [subtareas, { [field]: value }])
  }
}

/** Al cambiar el almacén de devolución del servicio padre, lo lleva también a
 * sus subtareas de devolución que seguían con el valor anterior (o vacías) —
 * si alguien le puso otro a mano a la subtarea, se respeta. */
async function sincronizarAlmacenDevolucion(uid: number, parentId: number, anterior: number | false, nuevo: number | false): Promise<void> {
  const subtareas = await odooCall<number[]>(
    uid, 'project.task', 'search',
    [[['parent_id', '=', parentId], [ALMACEN_DEVOLUCION_FIELD, 'in', [false, ...(anterior ? [anterior] : [])]], ...SUBTAREA_DEVOLUCION_DOMAIN]]
  )
  if (subtareas.length) await odooCall(uid, 'project.task', 'write', [subtareas, { [ALMACEN_DEVOLUCION_FIELD]: nuevo }])
}

export async function POST(request: Request) {
  try {
    const acceso = await getAcceso()
    if (acceso instanceof NextResponse) return acceso
    const esConductor = acceso.tipo === 'conductor'

    const body = await request.json()

    // El conductor solo finaliza o edita (hitos/modalidad) — los catálogos
    // (conductores, partners, flota) son del modal de edición del panel.
    if (esConductor && body.action && body.action !== 'finalize') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Panel de solo lectura: puede ver y usar los catálogos (son lecturas),
    // pero no finalizar ni editar.
    const escribe = body.action === 'finalize' || !body.action
    if (acceso.tipo === 'panel' && escribe && !acceso.puedeEditar) {
      return NextResponse.json({ error: SIN_PERMISO_EDITAR }, { status: 403 })
    }

    // conductores → lista de empleados para el select
    // Finalizar servicio → busca stage "Servicio Finalizado" y lo asigna
    if (body.action === 'finalize') {
      const id = parseInt(body.id)
      if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
      const uid = await odooAuth()
      if (esConductor && !(await esTareaDelConductor(uid, id, acceso))) {
        return NextResponse.json({ error: 'Este servicio no está asignado a ti' }, { status: 403 })
      }
      const stage = await etapaFinalizadoDe(uid, id)
      if (!stage) {
        return NextResponse.json({ error: 'No se encontró etapa "Servicio Finalizado"' }, { status: 404 })
      }
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

    if (esConductor) {
      const prohibidos = Object.keys(fields).filter(k => !CAMPOS_CONDUCTOR.has(k))
      if (prohibidos.length) {
        return NextResponse.json({ error: `Campos no permitidos: ${prohibidos.join(', ')}` }, { status: 403 })
      }
      if (!(await esTareaDelConductor(uid, id, acceso))) {
        return NextResponse.json({ error: 'Este servicio no está asignado a ti' }, { status: 403 })
      }
    }

    // Validate fields exist before writing — invalid fields → skip silently
    const fieldNames = Object.keys(fields)
    const existingMeta = await odooCall<Record<string, { type: string; relation?: string }>>(
      uid, 'project.task', 'fields_get', [fieldNames], { attributes: ['type', 'relation'] }
    )
    const validFields = Object.fromEntries(
      Object.entries(fields).filter(([k]) => k in existingMeta)
    )
    const skipped = fieldNames.filter(k => !(k in existingMeta))

    // Un many2one solo acepta el id. Si llega el nombre como texto (ej. la
    // placa "MELGA/Semirremolque.../B9C997"), se busca el registro: Odoo
    // rechazaría la escritura entera y no se guardaría nada.
    for (const [k, v] of Object.entries(validFields)) {
      const meta = existingMeta[k]
      if (meta.type !== 'many2one' || typeof v !== 'string' || !meta.relation) continue
      const nombre = v.trim()
      let ids = await odooCall<number[]>(uid, meta.relation, 'search', [[['name', '=', nombre]]], { limit: 1 })
      if (!ids.length && meta.relation === 'fleet.vehicle') {
        ids = await odooCall<number[]>(uid, meta.relation, 'search', [[['license_plate', '=ilike', nombre]]], { limit: 1 })
      }
      if (!ids.length) {
        return NextResponse.json({ error: `No se encontró "${nombre}" en Odoo — elígelo de la lista` }, { status: 400 })
      }
      validFields[k] = ids[0]
    }

    // Valor previo del almacén de devolución, para llevar el cambio a la subtarea
    let almDevolucionAnterior: number | false | undefined
    if (ALMACEN_DEVOLUCION_FIELD in validFields) {
      const [prev] = await odooCall<{ x_studio_almacen_de_devolucion: [number, string] | false }[]>(
        uid, 'project.task', 'read', [[id]], { fields: [ALMACEN_DEVOLUCION_FIELD] }
      )
      almDevolucionAnterior = prev?.x_studio_almacen_de_devolucion ? prev.x_studio_almacen_de_devolucion[0] : false
    }

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
    // "Devolución de vacío" en blanco (sin fecha queda perdida al fondo de la
    // tabla, y sin almacén el conductor no sabe a dónde llevar el vacío).
    // Se le copian la fecha de programación y el almacén de devolución.
    if (validFields[MODALIDAD_DEVOLUCION_FIELD] === MODALIDAD_OTRO_CONDUCTOR) {
      try {
        await completarSubtareaDevolucion(uid, id)
      } catch (e) {
        console.error('No se pudo completar la subtarea de devolución:', e instanceof Error ? e.message : e)
      }
    }
    if (almDevolucionAnterior !== undefined && validFields[ALMACEN_DEVOLUCION_FIELD] !== almDevolucionAnterior) {
      try {
        await sincronizarAlmacenDevolucion(uid, id, almDevolucionAnterior, validFields[ALMACEN_DEVOLUCION_FIELD] as number | false)
      } catch (e) {
        console.error('No se pudo actualizar el almacén de la subtarea de devolución:', e instanceof Error ? e.message : e)
      }
    }

    return NextResponse.json({ ok: true, ...(skipped.length ? { skipped } : {}), ...(stageUpdate ?? {}) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error POST /api/servicios:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
