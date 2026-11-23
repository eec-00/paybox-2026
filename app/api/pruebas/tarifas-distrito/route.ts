import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { puedeVerModulo } from '@/lib/utils/modulos'
import { REGLAS_ORDINARIAS, normalizar, productoDe } from '@/lib/pruebas/motorZonas'
import type { TarifaAprobada } from '@/lib/pruebas/pagosConductores'
import { COLUMNAS_TARIFA, aTarifa, type FilaTarifaDistrito } from '@/lib/pruebas/tarifasDistrito'

// Tarifas de distritos nuevos validadas por Administración (respuesta de
// Margiory, nov. 2026, punto 5). Solo simulación: no paga ni escribe en Odoo.
// POST valida la tarifa propuesta (la de la zona; no se aceptan otros importes:
// una excepción de importe es otra decisión). DELETE la quita (solo admin).

const PRODUCTOS: TarifaAprobada['producto'][] = ['GEN', 'IMO', 'DES']

async function usuarioActual() {
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

/** POST { zona, distrito, producto } → valida la tarifa de la zona para ese distrito */
export async function POST(req: NextRequest) {
  try {
    const u = await usuarioActual()
    if ('error' in u) return u.error

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const zona = typeof body?.zona === 'string' ? body.zona.trim() : ''
    const distrito = typeof body?.distrito === 'string' ? body.distrito.trim().slice(0, 120) : ''
    const producto = body?.producto as TarifaAprobada['producto']
    if (!zona || !distrito || !PRODUCTOS.includes(producto)) {
      return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
    }

    const clave = normalizar(distrito)
    if (REGLAS_ORDINARIAS.some(r => [r.distrito, ...r.alias].some(n => normalizar(n) === clave))) {
      return NextResponse.json({ error: `«${distrito}» ya tiene tarifa propia en el tarifario` }, { status: 400 })
    }
    const deZona = REGLAS_ORDINARIAS.filter(r => r.zona === zona && productoDe(r) === producto)
    const montos = Array.from(new Set(deZona.map(r => r.monto)))
    if (montos.length !== 1) {
      return NextResponse.json({ error: `${zona} no tiene una tarifa única para proponer` }, { status: 400 })
    }

    const { data, error } = await createAdminClient()
      .from('pruebas_tarifas_distrito')
      .upsert({
        zona, distrito, distrito_clave: clave, producto, monto: montos[0],
        aprobado_por: u.user.id, aprobado_por_nombre: u.nombre,
      }, { onConflict: 'zona,distrito_clave,producto' })
      .select(COLUMNAS_TARIFA)
      .single()
    if (error) throw error
    return NextResponse.json({ tarifa: aTarifa(data as FilaTarifaDistrito) })
  } catch (err) {
    return NextResponse.json({ error: mensaje(err) }, { status: 500 })
  }
}

/** DELETE ?id= → quita una validación (solo admin) */
export async function DELETE(req: NextRequest) {
  try {
    const u = await usuarioActual()
    if ('error' in u) return u.error
    if (!u.esAdmin) return NextResponse.json({ error: 'Solo un administrador puede quitar una tarifa validada' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id') || ''
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
    const { error } = await createAdminClient().from('pruebas_tarifas_distrito').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: mensaje(err) }, { status: 500 })
  }
}
