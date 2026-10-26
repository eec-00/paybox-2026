import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { estadoHoy } from '@/lib/oficina/servidor'

// Estado del día del trabajador de oficina (para la pantalla de marcar sin
// haber tocado el sticker): sus marcas de hoy y cuál le toca.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const estado = await estadoHoy(createAdminClient(), user.id)
  if (!estado) return NextResponse.json({ habilitado: false })
  return NextResponse.json({ habilitado: true, ...estado })
}
