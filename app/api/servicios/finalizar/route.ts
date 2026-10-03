import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Fuerza un servicio a "Servicio Finalizado" sin pasar por el flujo normal del
// conductor — para cuando el conductor dejó un servicio a medias y no sabe
// cómo cerrarlo en la app. Mueve la etapa en Odoo y registra el servicio como
// completado en Supabase (lo que hace que Servicios > Trailers lo muestre
// como "Completado"), igual que si el conductor hubiera marcado el último
// hito él mismo.

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

export async function POST(request: NextRequest) {
  try {
    // Admin/developer o usuarios con acceso al módulo "servicios" — cierra el
    // servicio saltándose al conductor.
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role, module_permissions')
      .eq('id', user.id)
      .single()

    const isAdminRole = callerProfile?.role === 'admin' || callerProfile?.role === 'developer'
    const hasServicios = (callerProfile?.module_permissions as any)?.servicios?.enabled === true
    if (!callerProfile || (!isAdminRole && !hasServicios)) {
      return NextResponse.json({ error: 'Se requiere acceso al módulo de Servicios' }, { status: 403 })
    }

    const { id } = await request.json()
    const taskId = parseInt(id)
    if (!taskId) return NextResponse.json({ error: 'id de servicio requerido' }, { status: 400 })

    const uid = await odooAuth()

    const tasks = await odooCall<{ id: number; name: string; x_studio_conductor?: [number, string] | false }[]>(
      uid, 'project.task', 'search_read', [[['id', '=', taskId]]],
      { fields: ['id', 'name', 'x_studio_conductor'], limit: 1 }
    )
    if (!tasks.length) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    const task = tasks[0]

    const stages = await odooCall<{ id: number; name: string }[]>(
      uid, 'project.task.type', 'search_read',
      [[['name', 'ilike', 'finaliz']]],
      { fields: ['id', 'name'], limit: 5 }
    )
    if (!stages.length) return NextResponse.json({ error: 'No se encontró etapa "Servicio Finalizado"' }, { status: 404 })
    const stage = stages[0]
    await odooCall(uid, 'project.task', 'write', [[taskId], { stage_id: stage.id }])

    const admin = createAdminClient()

    // Se atribuye al conductor asignado (si tiene cuenta en el portal), para
    // que su propio historial también lo muestre como terminado y no como
    // pendiente. Si no se puede resolver, queda a nombre de quien lo finalizó.
    let conductorId = user.id
    if (Array.isArray(task.x_studio_conductor)) {
      const { data: conductorProfile } = await admin
        .from('user_profiles')
        .select('id')
        .eq('odoo_employee_id', task.x_studio_conductor[0])
        .maybeSingle()
      if (conductorProfile) conductorId = conductorProfile.id
    }

    const codigo = task.name.includes(' - ') ? task.name.split(' - ')[0] : task.name
    await Promise.all([
      admin.from('conductor_servicios_progreso').delete().eq('servicio_id', taskId),
      admin.from('conductor_servicios_completados')
        .upsert({ conductor_id: conductorId, servicio_id: taskId, servicio_nombre: codigo }),
    ])

    return NextResponse.json({ ok: true, stageId: stage.id, stageName: stage.name })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error POST /api/servicios/finalizar:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
