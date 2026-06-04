import { NextRequest, NextResponse } from 'next/server'
import { getSunatToken, sunatFetch } from '@/lib/sunat/client'

// GET /api/sunat/gre?test=1 — test OAuth connection
// GET /api/sunat/gre?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD&numRegistros=0 — query by date range
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  if (searchParams.get('test') === '1') {
    try {
      const credential = await getSunatToken()
      return NextResponse.json({
        ok: true,
        message: 'Sesión SUNAT establecida',
        credential_preview: credential.substring(0, 30) + '...',
      })
    } catch (error: any) {
      console.error('[sunat/gre test]', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }

  // Date-range query — max 100 rows per call, paginate via numRegistros
  const fechaInicio = searchParams.get('fechaInicio')
  const fechaFin = searchParams.get('fechaFin')
  const numRegistros = searchParams.get('numRegistros') ?? '0'
  const numMaximo = '100'

  if (!fechaInicio || !fechaFin) {
    return NextResponse.json(
      { error: 'Requerido: fechaInicio, fechaFin (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  try {
    const params = new URLSearchParams({
      fechaInicio,
      fechaFin,
      numMaximo,
      numRegistros,
    })

    const res = await sunatFetch(`/v1/contribuyente/gem/comprobantes?${params}`)

    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    return NextResponse.json({ ok: res.ok, status: res.status, data })
  } catch (error: any) {
    console.error('[sunat/gre GET range]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}

// POST /api/sunat/gre — consultar individual o emitir GRE
// body: { action: 'consultar', ruc, tipo, serie, numero }
//       { action: 'emitir', payload: {...} }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'consultar') {
      const { ruc, tipo, serie, numero } = body

      if (!ruc || !tipo || !serie || !numero) {
        return NextResponse.json(
          { error: 'Campos requeridos: ruc, tipo, serie, numero' },
          { status: 400 }
        )
      }

      const res = await sunatFetch(`/v1/contribuyente/gem/${ruc}/${tipo}/${serie}/${numero}`)

      const text = await res.text()
      let data: unknown
      try { data = JSON.parse(text) } catch { data = { raw: text } }

      return NextResponse.json({ ok: res.ok, status: res.status, data })
    }

    if (action === 'emitir') {
      const { payload } = body
      if (!payload) return NextResponse.json({ error: 'payload requerido' }, { status: 400 })

      const res = await sunatFetch('/v1/contribuyente/gem', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const text = await res.text()
      let data: unknown
      try { data = JSON.parse(text) } catch { data = { raw: text } }

      return NextResponse.json({ ok: res.ok, status: res.status, data })
    }

    return NextResponse.json({ error: 'action inválido: consultar | emitir' }, { status: 400 })
  } catch (error: any) {
    console.error('[sunat/gre POST]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
