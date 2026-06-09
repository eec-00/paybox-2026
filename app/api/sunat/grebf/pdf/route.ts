import { NextRequest, NextResponse } from 'next/server'
import { sunatSolBFFetch } from '@/lib/sunat/client'

// GET /api/sunat/grebf/pdf?numeroFile=922051430&numeroRUC=20523380347
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

    // SUNAT returns HTML error page when session expired
    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      return NextResponse.json({ error: 'Sesión expirada — pega una nueva cookie BF' }, { status: 401 })
    }

    const bytes = await res.arrayBuffer()
    const disposition = res.headers.get('content-disposition') ?? `attachment; filename="GRE-BF-${numeroFile}.pdf"`
    const filename = disposition.match(/filename=([^\s;]+)/)?.[1] ?? `GRE-BF-${numeroFile}.pdf`

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    console.error('[sunat/grebf/pdf]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
