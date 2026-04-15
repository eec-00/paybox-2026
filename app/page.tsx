import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  let user = null
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    user = authUser
  } catch {
    // Error al conectar con Supabase, tratar como no autenticado
  }

  if (user) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
