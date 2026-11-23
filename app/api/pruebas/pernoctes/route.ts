import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { puedeVerModulo } from '@/lib/utils/modulos'
import {
  CLAVES_EXCLUSION, ESTADOS_PERNOCTE, estadoTrasAccion, validarAccion,
  type AccionPernocte, type ChecklistPernocte, type EstadoPernocte,
} from '@/lib/pernoctes/reglas'

const ACCIONES: AccionPernocte[] = ['aprobar', 'rechazar', 'escalar', 'comentar']
const FECHA = /^\d{4}-\d{2}-\d{2}$/

async function revisorActual() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, email, module_permissions')
    .eq('id', user.id)
    .single()
  if (!puedeVerModulo(profile, 'pruebas')) {
    return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) }
  }
  const esAdmin = profile!.role === 'admin' || profile!.role === 'developer'
  return { user, nombre: (profile!.full_name || profile!.email || 'Usuario') as string, esAdmin }
}

const mensaje = (err: unknown) => (err as { message?: string })?.message || String(err)

/** GET ?desde=&hasta=&estado= → pernoctes con su historial */
export async function GET(req: NextRequest) {
  try {
    const r = await revisorActual()
    if ('error' in r) return r.error
    const sp = req.nextUrl.searchParams
    const desde = sp.get('desde') || ''
    const hasta = sp.get('hasta') || ''
    const estado = sp.get('estado') || ''

    let q = createAdminClient().from('pernoctes_conductor').select('*, pernoctes_historial(*)')
      .order('noche', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (FECHA.test(desde)) q = q.gte('noche', desde)
    if (FECHA.test(hasta)) q = q.lte('noche', hasta)
    if ((ESTADOS_PERNOCTE as readonly string[]).includes(estado)) q = q.eq('estado', estado)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ pernoctes: data ?? [], esAdmin: r.esAdmin })
  } catch (err) {
    return NextResponse.json({ error: mensaje(err) }, { status: 500 })
  }
}

/** PATCH { id, accion, checklist, observacion } → aprobar / rechazar / escalar / comentar */
export async function PATCH(req: NextRequest) {
  try {
    const r = await revisorActual()
    if ('error' in r) return r.error

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const id = typeof body?.id === 'string' ? body.id : ''
    const accion = body?.accion as AccionPernocte
    const observacion = typeof body?.observacion === 'string' ? body.observacion.trim().slice(0, 1000) : ''
    const crudo = (body?.checklist ?? {}) as Record<string, unknown>
    const checklist = Object.fromEntries(
      CLAVES_EXCLUSION.map(k => [k, typeof crudo[k] === 'boolean' ? crudo[k] : null]),
    ) as ChecklistPernocte
    if (!id || !ACCIONES.includes(accion)) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })

    const admin = createAdminClient()
    const { data: actual, error: leerError } = await admin.from('pernoctes_conductor')
      .select('id, estado').eq('id', id).maybeSingle()
    if (leerError) throw leerError
    if (!actual) return NextResponse.json({ error: 'Pernocte no encontrado' }, { status: 404 })

    const estado = actual.estado as EstadoPernocte
    const problema = validarAccion(estado, accion, checklist, observacion, { esAdmin: r.esAdmin })
    if (problema) return NextResponse.json({ error: problema }, { status: 400 })

    const nuevo = estadoTrasAccion(estado, accion)
    if (accion !== 'comentar') {
      // Solo si nadie lo cambió mientras se revisaba
      const { data: cambiados, error } = await admin.from('pernoctes_conductor')
        .update({
          estado: nuevo,
          ...checklist,
          revisado_por: r.user.id,
          revisado_por_nombre: r.nombre,
          revisado_at: new Date().toISOString(),
          observacion: observacion || null,
        })
        .eq('id', id).eq('estado', estado)
        .select('id')
      if (error) throw error
      if (!cambiados?.length) {
        return NextResponse.json({ error: 'Otra persona cambió esta solicitud. Actualiza la lista.' }, { status: 409 })
      }
    }

    const { error: histError } = await admin.from('pernoctes_historial').insert({
      pernocte_id: id, accion, estado_anterior: estado, estado_nuevo: nuevo,
      observacion: observacion || null, usuario_id: r.user.id, usuario_nombre: r.nombre,
    })
    if (histError) throw histError

    return NextResponse.json({ ok: true, estado: nuevo })
  } catch (err) {
    return NextResponse.json({ error: mensaje(err) }, { status: 500 })
  }
}
