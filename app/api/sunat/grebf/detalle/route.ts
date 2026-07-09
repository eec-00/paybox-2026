import { NextRequest, NextResponse } from 'next/server'
import { sunatSolBFFetch } from '@/lib/sunat/client'
import { extractDetalleFromPdf } from '@/lib/sunat/pdfDetalle'

// GET /api/sunat/grebf/detalle?numeroFile=922051430&numeroRUC=20523380347
// Descarga el PDF de la guía y extrae placa(s) y conductor del texto.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const numeroFile = searchParams.get('numeroFile')
  const numeroRUC = searchParams.get('numeroRUC')

  if (!numeroFile || !numeroRUC) {
    return NextResponse.json({ error: 'Requerido: numeroFile, numeroRUC' }, { status: 400 })
  }

  try {
    const body = new URLSearchParams({
      accion: 'descargarPdf',
      numeroRUC,
      numeroFile,
    })

    const res = await sunatSolBFFetch(
      '/cl-at-itconsultacbf/consultagre.do?accion=descargarPdf',
      body,
    )

    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      return NextResponse.json({ error: 'Sesión expirada — pega una nueva cookie BF' }, { status: 401 })
    }

    const bytes = await res.arrayBuffer()
    const detalle = await extractDetalleFromPdf(bytes)

    return NextResponse.json({ ok: true, ...detalle })
  } catch (error: any) {
    console.error('[sunat/grebf/detalle]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
