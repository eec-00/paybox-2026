import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { odooAuth, odooCall } from '@/lib/odoo'
import { puedeEditarServicios, puedeVerServicios, SIN_PERMISO_EDITAR } from '@/lib/servicios/permisos'
import { etapaFinalizadoDe } from '@/lib/servicios/etapas'
// Fuerza un servicio a "Servicio Finalizado" sin pasar por el flujo normal del
// conductor — para cuando el conductor dejó un servicio a medias y no sabe
// cómo cerrarlo en la app. Mueve la etapa en Odoo y registra el servicio como
// completado en Supabase (lo que hace que Servicios > Trailers lo muestre
// como "Completado"), igual que si el conductor hubiera marcado el último
// hito él mismo.

export async function POST(request: NextRequest) {
  try {
    // Admin/developer o usuarios con acceso al módulo "servicios" — cierra el
    // servicio saltándose al conductor.
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role, can_edit, module_permissions')
      .eq('id', user.id)
      .single()

    if (!puedeVerServicios(callerProfile)) {
      return NextResponse.json({ error: 'Se requiere acceso al módulo de Servicios' }, { status: 403 })
    }
    if (!puedeEditarServicios(callerProfile)) {
      return NextResponse.json({ error: SIN_PERMISO_EDITAR }, { status: 403 })
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

    const stage = await etapaFinalizadoDe(uid, taskId)
    if (!stage) return NextResponse.json({ error: 'No se encontró etapa "Servicio Finalizado"' }, { status: 404 })
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
