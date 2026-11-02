import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { firmarComprobante } from '@/lib/archivosServidor'

const VIGENCIA_SEGUNDOS = 60

// Abre una foto o comprobante del bucket a quien tenga sesión iniciada.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ruta = req.nextUrl.searchParams.get('ruta')
  if (!ruta || ruta.startsWith('/') || ruta.split('/').includes('..')) {
    return NextResponse.json({ error: 'Archivo inválido' }, { status: 400 })
  }

  const url = await firmarComprobante(ruta, VIGENCIA_SEGUNDOS)
  if (!url) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })

  const res = NextResponse.redirect(url)
  res.headers.set('Cache-Control', 'private, max-age=30')
  return res
}
