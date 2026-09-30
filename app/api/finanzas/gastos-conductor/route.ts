import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Eliminar un gasto de conductor desde Finanzas. Antes se borraba directo
// desde el navegador: si la RLS no dejaba, Supabase respondía "ok" con 0 filas
// borradas y el gasto seguía ahí sin ningún aviso. Acá se valida el permiso en
// código y se borra con el cliente admin.
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, module_permissions')
      .eq('id', user.id)
      .single()

    const isAdminRole = profile?.role && ['admin', 'developer'].includes(profile.role)
    const pagos = (profile?.module_permissions as any)?.pagos
    const puedeBorrar = pagos?.enabled === true && pagos?.can_delete !== false
    if (!profile || (!isAdminRole && !puedeBorrar)) {
      return NextResponse.json({ error: 'No tienes permiso para eliminar gastos' }, { status: 403 })
    }

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const admin = createAdminClient()
    const { error: calError } = await admin.from('calendario_pagos').delete().eq('gasto_conductor_id', id)
    if (calError) throw calError

    const { data: borrados, error: delError } = await admin
      .from('gastos_conductor')
      .delete()
      .eq('id', id)
      .select('id')
    if (delError) throw delError
    if (!borrados?.length) return NextResponse.json({ error: 'El gasto ya no existe' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Error en DELETE /api/finanzas/gastos-conductor:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
