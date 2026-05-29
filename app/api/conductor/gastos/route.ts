import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, full_name, odoo_employee_name')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'conductor') {
      return NextResponse.json({ error: 'Solo conductores pueden registrar gastos' }, { status: 403 })
    }

    const body = await req.json()
    const { servicioId, servicioNombre, descripcion, monto, moneda = 'soles', fotos = [] } = body

    if (!servicioId || !servicioNombre || !descripcion || !monto) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const conductorNombre = profile.full_name || profile.odoo_employee_name || 'Conductor'
    const montoNum = parseFloat(String(monto))
    if (isNaN(montoNum) || montoNum <= 0) {
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
    }

    const { data: gasto, error: gastoError } = await supabase
      .from('gastos_conductor')
      .insert({
        servicio_id: servicioId,
        servicio_nombre: servicioNombre,
        conductor_id: user.id,
        conductor_nombre: conductorNombre,
        descripcion,
        monto: montoNum,
        moneda,
        fotos,
        estado: 'pendiente',
      })
      .select()
      .single()

    if (gastoError) throw gastoError

    // Create calendario_pagos entry — due date = today + 7 days
    const due = new Date()
    due.setDate(due.getDate() + 7)
    const fechaStr = due.toISOString().split('T')[0]

    await supabase.from('calendario_pagos').insert({
      fecha: fechaStr,
      nombre_pago: `Gasto conductor: ${conductorNombre}`,
      monto: montoNum,
      moneda,
      descripcion: `${descripcion} | Servicio: ${servicioNombre}`,
      frecuencia: 'unica',
      monto_variable: false,
      tipo: 'gasto_conductor',
      gasto_conductor_id: gasto.id,
      creado_por: user.id,
    })

    return NextResponse.json({ ok: true, gasto })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // Verify conductor owns it and it's still pending
    const { data: gasto } = await supabase
      .from('gastos_conductor')
      .select('id, estado, conductor_id')
      .eq('id', id)
      .single()

    if (!gasto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (gasto.conductor_id !== user.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    if (gasto.estado !== 'pendiente') return NextResponse.json({ error: 'Solo se pueden eliminar gastos pendientes' }, { status: 400 })

    // Delete associated calendario_pagos entry first
    await supabase.from('calendario_pagos').delete().eq('gasto_conductor_id', id)

    // Delete the gasto
    const { error: delError } = await supabase.from('gastos_conductor').delete().eq('id', id)
    if (delError) throw delError

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
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
    const hasFinanzas = (profile?.module_permissions as any)?.pagos?.enabled === true
    if (!profile || (!isAdminRole && !hasFinanzas)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id, fotoPago } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { error: gastoError } = await supabase
      .from('gastos_conductor')
      .update({
        estado: 'pagado',
        pagado_at: new Date().toISOString(),
        foto_pago: fotoPago ?? null,
      })
      .eq('id', id)

    if (gastoError) throw gastoError

    await supabase
      .from('calendario_pagos')
      .update({ estado: 'pagado' })
      .eq('gasto_conductor_id', id)

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
