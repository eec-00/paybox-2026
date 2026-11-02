import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Para rutas del personal: exige sesión y que el usuario no sea conductor.
 * El proxy solo pide sesión, y el portal del conductor usa /api/conductor y
 * /api/servicios. Devuelve la respuesta de error, o null si puede pasar.
 */
export async function exigirPersonal(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role === 'conductor') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  return null
}
