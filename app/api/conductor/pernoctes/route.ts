import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { nombreServicioAsignado } from '@/lib/conductor/servicioAsignado'
import { nocheDe, validarAltaPernocte } from '@/lib/pernoctes/reglas'

const UNIQUE_VIOLATION = '23505'

const CAMPOS_CONDUCTOR = 'id, servicio_id, servicio_nombre, noche, motivo, motivo_detalle, evidencias, estado, observacion, created_at, revisado_at'

type Perfil = { role: string; full_name: string | null; odoo_employee_id: number | null; odoo_employee_name: string | null }
type Conductor = { error: NextResponse } | { error?: undefined; user: { id: string }; profile: Perfil }

async function conductorActual(): Promise<Conductor> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, odoo_employee_id, odoo_employee_name')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'conductor') {
    return { error: NextResponse.json({ error: 'Solo conductores pueden registrar pernoctes' }, { status: 403 }) }
  }
  return { user, profile: profile as Perfil }
}

const mensaje = (err: unknown) => (err as { message?: string })?.message || String(err)

/** GET ?servicioId=… → pernoctes del conductor en ese servicio (o los últimos 30) */
export async function GET(req: NextRequest) {
  try {
    const c = await conductorActual()
    if (c.error) return c.error
    const servicioId = Number(req.nextUrl.searchParams.get('servicioId'))
    let q = createAdminClient().from('pernoctes_conductor').select(CAMPOS_CONDUCTOR)
      .eq('conductor_id', c.user.id).neq('estado', 'anulado')
      .order('noche', { ascending: false }).limit(30)
    if (Number.isInteger(servicioId) && servicioId > 0) q = q.eq('servicio_id', servicioId)
    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ pernoctes: data ?? [], nocheActual: nocheDe(new Date()) })
  } catch (err) {
    return NextResponse.json({ error: mensaje(err) }, { status: 500 })
  }
}

/** POST → «Voy a pernoctar»: registra la solicitud de la noche actual */
export async function POST(req: NextRequest) {
  try {
    const c = await conductorActual()
    if (c.error) return c.error
    const { user, profile } = c

    const alta = validarAltaPernocte(await req.json().catch(() => null))
    if (!alta.ok) return NextResponse.json({ error: alta.error }, { status: 400 })
    const d = alta.datos

    const servicioNombre = await nombreServicioAsignado(d.servicioId, profile.odoo_employee_id || null, profile.odoo_employee_name || '')
    if (!servicioNombre) return NextResponse.json({ error: 'Este servicio no está asignado a tu usuario' }, { status: 403 })

    const admin = createAdminClient()
    // Solo con el servicio en curso: la app guarda la fila de progreso al tocar
    // «Iniciar servicio» y la borra al marcar el último hito
    const { data: enCurso, error: progresoError } = await admin.from('conductor_servicios_progreso')
      .select('servicio_id').eq('conductor_id', user.id).eq('servicio_id', d.servicioId).maybeSingle()
    if (progresoError) throw progresoError
    if (!enCurso) {
      return NextResponse.json({ error: 'Solo puedes pedir pernocte con el servicio en curso (iniciado y sin finalizar)' }, { status: 409 })
    }

    const conductorNombre = profile.full_name || profile.odoo_employee_name || 'Conductor'
    const noche = nocheDe(new Date())

    const { data: pernocte, error } = await admin.from('pernoctes_conductor').insert({
      conductor_id: user.id,
      conductor_nombre: conductorNombre,
      odoo_employee_id: profile.odoo_employee_id || null,
      servicio_id: d.servicioId,
      servicio_nombre: servicioNombre,
      noche,
      motivo: d.motivo,
      motivo_detalle: d.motivoDetalle,
      duerme_en_unidad: true,
      lat: d.lat,
      lng: d.lng,
      precision_m: d.precision,
      evidencias: d.evidencias,
      estado: 'pendiente',
    }).select(CAMPOS_CONDUCTOR).single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return NextResponse.json({ error: 'Ya registraste un pernocte para esta noche' }, { status: 409 })
      }
      throw error
    }

    await admin.from('pernoctes_historial').insert({
      pernocte_id: pernocte.id, accion: 'solicitar', estado_anterior: null, estado_nuevo: 'pendiente',
      usuario_id: user.id, usuario_nombre: conductorNombre,
    })

    return NextResponse.json({ ok: true, pernocte })
  } catch (err) {
    return NextResponse.json({ error: mensaje(err) }, { status: 500 })
  }
}

/** DELETE ?id=… → el conductor anula su solicitud mientras sigue pendiente */
export async function DELETE(req: NextRequest) {
  try {
    const c = await conductorActual()
    if (c.error) return c.error
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const admin = createAdminClient()
    const { data: anulados, error } = await admin.from('pernoctes_conductor')
      .update({ estado: 'anulado' })
      .eq('id', id).eq('conductor_id', c.user.id).eq('estado', 'pendiente')
      .select('id')
    if (error) throw error
    if (!anulados?.length) {
      return NextResponse.json({ error: 'Solo puedes anular un pernocte pendiente de revisión' }, { status: 409 })
    }
    await admin.from('pernoctes_historial').insert({
      pernocte_id: id, accion: 'anular', estado_anterior: 'pendiente', estado_nuevo: 'anulado',
      usuario_id: c.user.id, usuario_nombre: c.profile.full_name || c.profile.odoo_employee_name || 'Conductor',
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: mensaje(err) }, { status: 500 })
  }
}
