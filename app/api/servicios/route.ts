import { NextResponse } from 'next/server'

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
const BASE_FIELDS = ['name', 'stage_id', 'partner_id', 'date_deadline']

// Candidate x_studio fields — validated at runtime via fields_get
const CANDIDATE_X_FIELDS = [
  // OPERATIVA TRANSPORTE
  'x_studio_fecha_de_la_programacin',
  'x_studio_hora_de_cita',
  'x_studio_placa_camin',
  'x_studio_placa_camion',
  'x_studio_placa_carreta',
  'x_studio_conductor',
  'x_studio_referencia_booking',
  'x_studio_agencia',
  'x_studio_nmero_de_contenedor',
  'x_studio_numero_de_contenedor',
  'x_studio_almacn_de_retiro',
  'x_studio_almacen_de_retiro',
  'x_studio_almacn_de_destino',
  'x_studio_almacen_de_destino',
  'x_studio_es_importacin',
  'x_studio_es_importacion',
  // TIEMPOS OPERATIVOS
  'x_studio_ingreso_a_almacen_de_retiro',
  'x_studio_salida_de_almacen_de_retiro',
  'x_studio_llegada_a_cliente',
  'x_studio_ingreso_a_planta',
  'x_studio_inicio_carga_descarga',
  'x_studio_termino_de_carga_descarga',
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
    const stageFilter = searchParams.get('stage') || ''
    const limitParam = parseInt(searchParams.get('limit') || '500')
    const debugFields = searchParams.get('fields') === '1'

    const uid = await odooAuth()

    // Discover which x_studio fields actually exist
    const validFields = await getValidFields(uid)

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

    const tasks = await odooCall<unknown[]>(
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
