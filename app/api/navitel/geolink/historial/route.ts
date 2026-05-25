import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('geoenlaces_historial')
      .select('id, created_at, user_email, user_name, vehiculos, duracion_horas, expira_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return NextResponse.json({ success: true, historial: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
