import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

async function odooCall<T = unknown>(
  uid: number, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}
): Promise<T> {
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

const BASE_FIELDS = ['name', 'stage_id', 'partner_id', 'date_deadline']
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
  'x_studio_es_importacion',
  'x_studio_saliendo_de_la_cochera',
  'x_studio_en_cola_de_ingreso',
  'x_studio_ingreso_a_almacen_de_retiro_1',
  'x_studio_salida_de_almacen_de_retiro',
  'x_studio_llegada_a_cliente',
  'x_studio_ingreso_a_planta',
  'x_studio_inicio_cargadescarga',
  'x_studio_termino_de_descarga',
  'x_studio_salida_de_cliente',
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
        domain.push([dateField, '>=', startDate], [dateField, '<=', endDate])
      }
    }

    const tasks = await odooCall<unknown[]>(
      uid, 'project.task', 'search_read', [domain],
      { fields, order: 'name desc', limit: 500 }
    )

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

    return NextResponse.json({ tasks, stats, month: monthParam })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[conductor/servicios]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
