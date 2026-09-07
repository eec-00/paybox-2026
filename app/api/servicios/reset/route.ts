import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ALL_HITO_FIELDS, TIPO_SERVICIO_BOOL_FIELDS, getHitosForTask } from '@/lib/servicios/hitos'

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

// Campos necesarios para detectar el tipo de servicio y saber qué hitos tiene.
const TIPO_FIELDS = [
  'x_studio_almacen_de_devolucion',
  'x_studio_modalidad_de_devolucion',
  'x_studio_modalidad_de_retiro',
  ...TIPO_SERVICIO_BOOL_FIELDS,
]

export async function POST(request: NextRequest) {
  try {
    // Solo admin/developer puede reiniciar un servicio — reinicia horas
    // marcadas por el conductor, es una acción irreversible.
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || (callerProfile.role !== 'admin' && callerProfile.role !== 'developer')) {
      return NextResponse.json({ error: 'Se requiere rol de administrador' }, { status: 403 })
    }

    const { id } = await request.json()
    const taskId = parseInt(id)
    if (!taskId) return NextResponse.json({ error: 'id de servicio requerido' }, { status: 400 })

    const uid = await odooAuth()

    // Traer el servicio con los campos necesarios para saber qué tipo es y
    // qué hitos (campos de hora) tiene que limpiar.
    const fieldsMeta = await odooCall<Record<string, unknown>>(
      uid, 'project.task', 'fields_get', [[...TIPO_FIELDS, ...ALL_HITO_FIELDS]], { attributes: ['type'] }
    )
    const validFields = Object.keys(fieldsMeta)
    const tasks = await odooCall<Record<string, unknown>[]>(
      uid, 'project.task', 'search_read', [[['id', '=', taskId]]],
      { fields: ['id', ...validFields], limit: 1 }
    )
    if (!tasks.length) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    const task = tasks[0]

    // Poner en 0 todas las horas del flujo de este servicio (respeta el tipo
    // detectado, ej. si ya eligió "Otro conductor" mantiene esa cola de
    // hitos). No se toca la modalidad de devolución/retiro ni la subtarea
    // vinculada — si existe, se reinicia aparte con su propio botón.
    const hitos = getHitosForTask(task as Record<string, unknown>)
    const resetFields: Record<string, unknown> = {}
    for (const hito of hitos) {
      if (validFields.includes(hito.field)) resetFields[hito.field] = 0
    }

    // Volver a la primera etapa del proyecto (ej. "Nueva Solicitud") — si el
    // servicio ya estaba en "Servicio Finalizado" no debería seguir viéndose
    // así mientras el conductor lo vuelve a hacer.
    const projects = await odooCall<{ id: number }[]>(
      uid, 'project.project', 'search_read',
      [[['name', 'ilike', 'Servicio de Transporte']]],
      { fields: ['id'], limit: 1 }
    )
    let stageId: number | null = null
    let stageName: string | null = null
    if (projects.length) {
      const stages = await odooCall<{ id: number; name: string }[]>(
        uid, 'project.task.type', 'search_read',
        [[['project_ids', 'in', [projects[0].id]]]],
        { fields: ['id', 'name'], order: 'sequence asc', limit: 1 }
      )
      if (stages.length) {
        stageId = stages[0].id
        stageName = stages[0].name
        resetFields.stage_id = stageId
      }
    }

    if (Object.keys(resetFields).length > 0) {
      await odooCall(uid, 'project.task', 'write', [[taskId], resetFields])
    }

    // Limpiar el progreso guardado en Supabase para que el portal del
    // conductor lo muestre como "sin iniciar" de nuevo (RLS solo deja al
    // admin leer estas tablas, no borrarlas — se usa el cliente de servicio).
    const admin = createAdminClient()
    await Promise.all([
      admin.from('conductor_servicios_progreso').delete().eq('servicio_id', taskId),
      admin.from('conductor_servicios_completados').delete().eq('servicio_id', taskId),
    ])

    return NextResponse.json({ ok: true, stageId, stageName })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error POST /api/servicios/reset:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
