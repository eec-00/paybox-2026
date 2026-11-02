import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hoyLima, sabadoDePago } from '@/lib/fechas'
import { odooAuth, odooCall } from '@/lib/odoo'
import { validarAltaGasto } from '@/lib/gastos/validaciones'

const UNIQUE_VIOLATION = '23505'

// Busca el servicio solo si está asignado al conductor, con el mismo criterio
// que su lista en /api/conductor/servicios. Devuelve el nombre real en Odoo.
async function nombreServicioAsignado(
  servicioId: number,
  employeeId: number | null,
  employeeName: string,
): Promise<string | null> {
  const uid = await odooAuth()
  const fieldsMeta = await odooCall<Record<string, { type: string }>>(
    uid, 'project.task', 'fields_get', [['x_studio_conductor']], { attributes: ['type'] }
  )
  const conductorFilter =
    fieldsMeta['x_studio_conductor']?.type === 'many2one' && employeeId
      ? ['x_studio_conductor', '=', employeeId]
      : ['x_studio_conductor', 'ilike', employeeName]

  const tasks = await odooCall<{ name: string }[]>(
    uid, 'project.task', 'search_read',
    [[['id', '=', servicioId], conductorFilter]],
    { fields: ['name'], limit: 1 }
  )
  return tasks[0]?.name ?? null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, full_name, odoo_employee_id, odoo_employee_name')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'conductor') {
      return NextResponse.json({ error: 'Solo conductores pueden registrar gastos' }, { status: 403 })
    }

    const alta = validarAltaGasto(await req.json().catch(() => null))
    if (!alta.ok) return NextResponse.json({ error: alta.error }, { status: 400 })
    const { id, servicioId, descripcion, monto: montoNum, moneda, fotos } = alta.datos

    const conductorNombre = profile.full_name || profile.odoo_employee_name || 'Conductor'

    const employeeName: string = profile.odoo_employee_name || ''
    const employeeId: number | null = profile.odoo_employee_id || null
    const servicioNombre = employeeName || employeeId
      ? await nombreServicioAsignado(servicioId, employeeId, employeeName)
      : null

    if (!servicioNombre) {
      return NextResponse.json({ error: 'Este servicio no está asignado a tu usuario' }, { status: 403 })
    }

    const { data: insertado, error: gastoError } = await supabase
      .from('gastos_conductor')
      .insert({
        ...(id ? { id } : {}),
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

    let gasto = insertado
    if (gastoError) {
      if (gastoError.code !== UNIQUE_VIOLATION || !id) throw gastoError
      // Reintento o doble clic: el gasto ya entró con este id, no se crea otro
      const { data: existente } = await supabase
        .from('gastos_conductor')
        .select()
        .eq('id', id)
        .eq('conductor_id', user.id)
        .maybeSingle()
      if (!existente) return NextResponse.json({ error: 'Identificador de gasto inválido' }, { status: 409 })
      gasto = existente
    }

    // Si un intento anterior guardó el gasto y falló acá, el reintento lo completa
    const { data: yaAgendado, error: agendadoError } = await supabase
      .from('calendario_pagos')
      .select('id')
      .eq('gasto_conductor_id', gasto.id)
      .limit(1)
      .maybeSingle()

    let calendarioError = agendadoError
    if (!agendadoError && !yaAgendado) {
      // Create calendario_pagos entry — aparece el día en que se registró
      // En hora de Lima: el servidor corre en UTC y de noche contaba desde mañana
      const fechaStr = hoyLima()

      const { error } = await supabase.from('calendario_pagos').insert({
        fecha: fechaStr,
        fecha_limite: sabadoDePago(fechaStr),
        nombre_pago: `Gasto conductor: ${conductorNombre}`,
        monto: gasto.monto,
        moneda: gasto.moneda,
        descripcion: `${gasto.descripcion} | Servicio: ${gasto.servicio_nombre}`,
        frecuencia: 'unica',
        monto_variable: false,
        tipo: 'gasto_conductor',
        gasto_conductor_id: gasto.id,
        creado_por: user.id,
      })
      calendarioError = error
    }

    if (calendarioError) {
      console.error('Gasto sin calendario de pagos:', gasto.id, calendarioError.message)
      return NextResponse.json(
        { error: 'El gasto se guardó pero no entró al calendario de pagos. Vuelve a intentarlo.', gastoId: gasto.id },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, gasto })
  } catch (err: unknown) {
    // Los errores de Supabase no son instancias de Error
    const msg = (err as { message?: string })?.message || String(err)
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

    const { id, fotoPago, registroId } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // Solo pasa de pendiente a pagado una vez: evita un segundo reembolso
    const { data: pagados, error: gastoError } = await supabase
      .from('gastos_conductor')
      .update({
        estado: 'pagado',
        pagado_at: new Date().toISOString(),
        foto_pago: fotoPago ?? null,
      })
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select('id')

    if (gastoError) throw gastoError
    if (!pagados?.length) {
      return NextResponse.json({ error: 'Este gasto ya estaba pagado o no existe' }, { status: 409 })
    }

    const { error: calendarioError } = await supabase
      .from('calendario_pagos')
      .update({ estado: 'pagado', ...(registroId ? { registro_id: registroId } : {}) })
      .eq('gasto_conductor_id', id)

    if (calendarioError) throw calendarioError

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
