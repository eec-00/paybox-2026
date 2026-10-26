import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { leerToque } from '@/lib/oficina/nfc'
import { estadoHoy } from '@/lib/oficina/servidor'

// Se llama apenas se abre el link del sticker: "reclama" ese número de toque
// (cada uno vale una sola vez) y devuelve un ticket de 10 minutos con el que
// el trabajador confirma la marca después de tomarse la selfie.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const toque = leerToque(body)
  if (!toque) {
    return NextResponse.json({
      ok: false, codigo: 'link_invalido',
      mensaje: 'Este link no viene del sticker de la oficina. Acerca tu celular al sticker para marcar.',
    })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('oficina_reclamar_toque', {
    p_user: user.id, p_uid: toque.uid, p_contador: toque.contador,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const res = data as { ok: boolean; ticket_id?: string; codigo?: string; mensaje?: string }
  if (!res.ok) {
    // Sticker nuevo: quien administra RRHH puede registrarlo desde este mismo toque.
    let puedeRegistrar = false
    if (res.codigo === 'sticker_desconocido') {
      const { data: permiso } = await supabase.rpc('can_manage_vacaciones', { perm: 'can_edit' })
      puedeRegistrar = permiso === true
    }
    return NextResponse.json({ ...res, puedeRegistrar, uid: toque.uid, contador: toque.contador })
  }

  const estado = await estadoHoy(admin, user.id)
  return NextResponse.json({ ok: true, ticketId: res.ticket_id, ...estado })
}
