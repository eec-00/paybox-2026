import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_ALERTAS = [
  { dias: 30, activo: true, nombre: '1 mes' },
  { dias: 90, activo: true, nombre: '3 meses' },
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo') || 'trailers'

  try {
    const { data, error } = await supabase
      .from('automatizacion_config')
      .select('*')
      .eq('tipo', tipo)
      .single()

    if (error || !data) {
      return NextResponse.json({
        tipo,
        job_title: 'Conductor',
        alertas: DEFAULT_ALERTAS,
        activo: true,
      })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({
      tipo,
      job_title: 'Conductor',
      alertas: DEFAULT_ALERTAS,
      activo: true,
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tipo, job_title, alertas, activo, destination_email } = body

    if (!tipo || !job_title) {
      return NextResponse.json({ error: 'tipo y job_title son requeridos' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('automatizacion_config')
      .upsert(
        { tipo, job_title, alertas, activo, destination_email: destination_email ?? '', updated_at: new Date().toISOString() },
        { onConflict: 'tipo' }
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[automatizacion/config POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
