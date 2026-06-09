import { NextRequest, NextResponse } from 'next/server'
import { sunatSolBFFetch } from '@/lib/sunat/client'

const TIP_CONSULTA_LABELS: Record<string, string> = {
  '01': '01 - GRE BF Remitente emitidas',
  '02': '02 - GRE BF Transportista emitidas',
  '03': '03 - GRE BF Remitente Complementaria emitidas',
  '04': '04 - GRE BF Transportista Complementaria emitidas',
  '05': '05 - GRE BF Remitente recibidas',
  '06': '06 - GRE BF Transportista recibidas',
  '07': '07 - GRE BF Remitente complementaria recibidas',
  '08': '08 - GRE BF Transportista complementaria recibidas',
  '09': '09 - GRE BF relacionadas',
}

// GET /api/sunat/grebf?tipConsulta=02&periodo=202606&ubiPartida=&ubiLlegada=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipConsulta = searchParams.get('tipConsulta')
  const periodo = searchParams.get('periodo')
  const ubiPartida = searchParams.get('ubiPartida') ?? ''
  const ubiLlegada = searchParams.get('ubiLlegada') ?? ''

  if (!tipConsulta || !periodo) {
    return NextResponse.json({ error: 'Requerido: tipConsulta, periodo (AAAAMM)' }, { status: 400 })
  }

  const tipoconsultaLabel = TIP_CONSULTA_LABELS[tipConsulta] ?? tipConsulta

  try {
    const body = new URLSearchParams({
      accion: 'llenarGrillaConsultaGre',
      ruc: '',
      periodo,
      tipoguia: '',
      numeroguia: '',
      tipoconsulta: tipoconsultaLabel,
      ubipartida: ubiPartida,
      ubillegada: ubiLlegada,
      'dojo.preventCache': String(Date.now()),
    })

    const res = await sunatSolBFFetch(
      '/cl-at-itconsultacbf/consultagre.do?accion=llenarGrillaConsultaGre',
      body,
    )

    const text = await res.text()
    console.log('[sunat/grebf] status:', res.status, 'body:', text.slice(0, 300))

    let data: unknown
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    const items: unknown[] = (data as any)?.entrega?.lstResultado ?? []
    const indError: string = (data as any)?.entrega?.ind_error ?? ''

    return NextResponse.json({ ok: res.ok && indError === '0', status: res.status, data, items })
  } catch (error: any) {
    console.error('[sunat/grebf GET]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
