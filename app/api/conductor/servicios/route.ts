import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ALL_HITO_FIELDS, TIPO_SERVICIO_BOOL_FIELDS } from '@/lib/servicios/hitos'

// Datos operativos en vivo (hitos, GPS, servicios recién creados como subtareas
// de devolución) — nunca debe servirse cacheado, ni la ruta ni los fetch a Odoo.
export const dynamic = 'force-dynamic'

const ODOO_URL = (process.env.ODOO_URL || process.env.URL_ODOO || '').trim().replace(/\/$/, '')
const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()

async function odooAuth(): Promise<number> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
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

async function odooCall<T = unknown>(
  uid: number, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: Date.now(),
      params: { service: 'object', method: 'execute_kw', args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs] },
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
  return data.result as T
}

const BASE_FIELDS = ['name', 'stage_id', 'partner_id', 'date_deadline', 'parent_id', 'create_date']
const CANDIDATE_FIELDS = [
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
  ...ALL_HITO_FIELDS,
]

export async function GET(req: NextRequest) {
  try {
    // Auth
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, odoo_employee_id, odoo_employee_name')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'conductor' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const employeeName: string = profile.odoo_employee_name || ''
    const employeeId: number | null = profile.odoo_employee_id || null

    if (!employeeName && !employeeId) {
      return NextResponse.json({ tasks: [], stats: { total: 0, porEtapa: {}, clientes: [] }, month: '' })
    }

    // Month filter from ?month=YYYY-MM
    const { searchParams } = new URL(req.url)
    const monthParam = searchParams.get('month') || ''

    const uid = await odooAuth()

    // Discover valid fields + conductor field type
    const fieldsMeta = await odooCall<Record<string, { type: string }>>(
      uid, 'project.task', 'fields_get', [CANDIDATE_FIELDS], { attributes: ['type'] }
    )
    const validExtraFields = Object.keys(fieldsMeta)
    const fields = [...BASE_FIELDS, ...validExtraFields]

    // Find project
    const projects = await odooCall<{ id: number }[]>(
      uid, 'project.project', 'search_read',
      [[['name', 'ilike', 'Servicio de Transporte']]],
      { fields: ['id'], limit: 1 }
    )
    if (!projects.length) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
    const projectId = projects[0].id

    // Build conductor filter
    const conductorType = fieldsMeta['x_studio_conductor']?.type
    const conductorFilter: unknown[] =
      conductorType === 'many2one' && employeeId
        ? [['x_studio_conductor', '=', employeeId]]
        : [['x_studio_conductor', 'ilike', employeeName]]

    const domain: unknown[] = [['project_id', '=', projectId], ...conductorFilter]

    // Month date filter
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [year, month] = monthParam.split('-').map(Number)
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
      const dateField = validExtraFields.includes('x_studio_fecha_de_la_programacin')
        ? 'x_studio_fecha_de_la_programacin'
        : 'date_deadline'
      if (dateField) {
        // Las subtareas (p.ej. "Devolución de vacío" creadas cuando un servicio
        // termina antes y la devolución queda como tarea vinculada, ver
        // FEATURES.MD §6) no suelen tener x_studio_fecha_de_la_programacin
        // seteado, así que nunca calzarían con el rango de fecha normal y
        // desaparecerían de todos los meses. Para esas (parent_id seteado) se
        // usa su fecha de creación como fallback.
        domain.push('|',
          '&', [dateField, '>=', startDate], [dateField, '<=', endDate],
          '&', ['parent_id', '!=', false],
          '&', ['create_date', '>=', `${startDate} 00:00:00`], ['create_date', '<=', `${endDate} 23:59:59`],
        )
      }
    }

    const tasks = await odooCall<any[]>(
      uid, 'project.task', 'search_read', [domain],
      { fields, order: 'name desc', limit: 500 }
    )

    // Las subtareas (ej. "Devolución de vacío") se crean duplicando una
    // plantilla en blanco (ver automatización de Odoo), no copiando los datos
    // del servicio padre — así que contenedor, booking, agencia y almacén de
    // devolución les quedan vacíos aunque el conductor los necesita para
    // saber de qué servicio se trata. Si vienen vacíos, se completan con los
    // del servicio padre (nunca se pisa lo que la subtarea sí trae propio,
    // como su placa/conductor, que legítimamente son distintos).
    const PARENT_FALLBACK_FIELDS = [
      'x_studio_nmero_de_contenedor', 'x_studio_referenciabooking',
      'x_studio_agencia', 'x_studio_almacen_de_devolucion',
    ].filter(f => validExtraFields.includes(f))

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

    // Orden por número de servicio (ej. "S02155"), no alfabético por nombre
    // completo: una subtarea (ej. "Devolución de vacío") no tiene ese prefijo
    // en su propio nombre, así que se ordena usando el número del servicio
    // padre — debe caer junto a su servicio, no al final de la lista.
    const servicioKeyFor = (t: any): string => {
      const nameSource = Array.isArray(t.parent_id) ? t.parent_id[1] : t.name
      return typeof nameSource === 'string' && nameSource.includes(' - ')
        ? nameSource.split(' - ')[0]
        : (nameSource || '')
    }
    tasks.sort((a, b) => servicioKeyFor(b).localeCompare(servicioKeyFor(a), undefined, { numeric: true }))

    // Compute stats
    const stats = {
      total: tasks.length,
      porEtapa: (tasks as any[]).reduce<Record<string, number>>((acc, t) => {
        const stage = Array.isArray(t.stage_id) ? t.stage_id[1] : 'Sin etapa'
        acc[stage] = (acc[stage] || 0) + 1
        return acc
      }, {}),
      clientes: [...new Set<string>(
        (tasks as any[])
          .map(t => Array.isArray(t.partner_id) ? t.partner_id[1] as string : '')
          .filter(Boolean)
      )],
    }

    const [{ data: completados }, { data: progreso }] = await Promise.all([
      supabase.from('conductor_servicios_completados').select('servicio_id').eq('conductor_id', user.id),
      supabase.from('conductor_servicios_progreso').select('servicio_id, step_actual').eq('conductor_id', user.id),
    ])

    const completedServiceIds = completados?.map((c: { servicio_id: number }) => c.servicio_id) ?? []
    const servicioProgreso: Record<number, number> = {}
    for (const p of (progreso ?? []) as { servicio_id: number; step_actual: number }[]) {
      servicioProgreso[p.servicio_id] = p.step_actual
    }

    return NextResponse.json({ tasks, stats, month: monthParam, completedServiceIds, servicioProgreso })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[conductor/servicios]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
