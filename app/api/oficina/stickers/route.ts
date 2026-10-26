import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { leerToque } from '@/lib/oficina/nfc'

// Registra un sticker nuevo a partir de un toque real (quien administra RRHH
// lo acerca una vez con su celular). El número de ese toque queda consumido.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: permiso } = await supabase.rpc('can_manage_vacaciones', { perm: 'can_edit' })
  if (permiso !== true) {
    return NextResponse.json({ error: 'Solo Recursos Humanos puede registrar stickers' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const toque = leerToque(body)
  if (!toque) return NextResponse.json({ error: 'Link del sticker inválido' }, { status: 400 })
  const nombre = typeof body.nombre === 'string' && body.nombre.trim() ? body.nombre.trim() : 'Oficina'

  const { error } = await createAdminClient()
    .from('oficina_stickers')
    .insert({ uid: toque.uid, nombre, max_contador: toque.contador })
  if (error) {
    const msg = error.code === '23505' ? 'Este sticker ya está registrado' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
