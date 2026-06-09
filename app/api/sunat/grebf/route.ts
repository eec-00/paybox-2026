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

const MAX_MONTHS = 12

function monthRange(desde: string, hasta: string): string[] {
  let year = parseInt(desde.slice(0, 4))
  let month = parseInt(desde.slice(4, 6))
  const endYear = parseInt(hasta.slice(0, 4))
  const endMonth = parseInt(hasta.slice(4, 6))
  const months: string[] = []
  while (
    months.length < MAX_MONTHS &&
    (year < endYear || (year === endYear && month <= endMonth))
  ) {
    months.push(`${year}${String(month).padStart(2, '0')}`)
    month++
    if (month > 12) { month = 1; year++ }
  }
  return months
}

async function queryOnePeriodo(
  tipoconsultaLabel: string,
  periodo: string,
  ubiPartida: string,
  ubiLlegada: string,
): Promise<unknown[]> {
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
  console.log(`[sunat/grebf] periodo=${periodo} status=${res.status} preview=${text.slice(0, 120)}`)
  let data: unknown
  try { data = JSON.parse(text) } catch { return [] }
  const ind = (data as any)?.entrega?.ind_error
  if (ind !== '0' && ind !== 0) return []
  return (data as any)?.entrega?.lstResultado ?? []
}

// GET /api/sunat/grebf?tipConsulta=02&periodoDesde=202601&periodoHasta=202606
// GET /api/sunat/grebf?tipConsulta=02&periodo=202606  (single month, backwards compat)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipConsulta = searchParams.get('tipConsulta')
  const ubiPartida = searchParams.get('ubiPartida') ?? ''
  const ubiLlegada = searchParams.get('ubiLlegada') ?? ''

  // Support both single period and range
  const periodoSingle = searchParams.get('periodo')
  const periodoDesde = searchParams.get('periodoDesde') ?? periodoSingle
  const periodoHasta = searchParams.get('periodoHasta') ?? periodoSingle

  if (!tipConsulta || !periodoDesde || !periodoHasta) {
    return NextResponse.json({ error: 'Requerido: tipConsulta, periodoDesde, periodoHasta (AAAAMM)' }, { status: 400 })
  }

  if (!/^\d{6}$/.test(periodoDesde) || !/^\d{6}$/.test(periodoHasta)) {
    return NextResponse.json({ error: 'Formato de periodo inválido — usar AAAAMM' }, { status: 400 })
  }

  if (periodoDesde > periodoHasta) {
    return NextResponse.json({ error: 'periodoDesde debe ser <= periodoHasta' }, { status: 400 })
  }

  const tipoconsultaLabel = TIP_CONSULTA_LABELS[tipConsulta] ?? tipConsulta
  const meses = monthRange(periodoDesde, periodoHasta)

  try {
    const allItems: unknown[] = []
    for (const periodo of meses) {
      const rows = await queryOnePeriodo(tipoconsultaLabel, periodo, ubiPartida, ubiLlegada)
      allItems.push(...rows)
    }

    return NextResponse.json({
      ok: true,
      status: 200,
      meses: meses.length,
      items: allItems,
      total: allItems.length,
    })
  } catch (error: any) {
    console.error('[sunat/grebf GET]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
