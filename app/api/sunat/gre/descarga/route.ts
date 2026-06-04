import { NextRequest, NextResponse } from 'next/server'
import { sunatFetch } from '@/lib/sunat/client'

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([^<]*)<`, 'i'))
  return m?.[1]?.trim() ?? ''
}

function xmlAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*${attr}="([^"]*)"`, 'i'))
  return m?.[1]?.trim() ?? ''
}

function parseGreXml(xml: string) {
  // Document number
  const serie = xmlVal(xml, 'ID')

  // Dates
  const fecEmision = xmlVal(xml, 'IssueDate')
  const fecTraslado = xmlVal(xml, 'ActualDeliveryDate') || xmlVal(xml, 'RequestedDeliveryPeriod')

  // Motivo traslado
  const motivoCod = xmlAttr(xml, 'DespatchAdviceTypeCode', 'listID') || xmlVal(xml, 'DespatchAdviceTypeCode')
  const motivo = xmlVal(xml, 'Note') || motivoCod

  // Remitente
  const remitenteName = (() => {
    const sup = xml.match(/<cac:DespatchSupplierParty[\s\S]*?<\/cac:DespatchSupplierParty>/i)?.[0] ?? ''
    return xmlVal(sup, 'RegistrationName') || xmlVal(sup, 'Name')
  })()
  const remitenteRuc = (() => {
    const sup = xml.match(/<cac:DespatchSupplierParty[\s\S]*?<\/cac:DespatchSupplierParty>/i)?.[0] ?? ''
    return xmlVal(sup, 'ID')
  })()

  // Destinatario
  const destinatarioName = (() => {
    const del = xml.match(/<cac:DeliveryCustomerParty[\s\S]*?<\/cac:DeliveryCustomerParty>/i)?.[0] ?? ''
    return xmlVal(del, 'RegistrationName') || xmlVal(del, 'Name')
  })()
  const destinatarioRuc = (() => {
    const del = xml.match(/<cac:DeliveryCustomerParty[\s\S]*?<\/cac:DeliveryCustomerParty>/i)?.[0] ?? ''
    return xmlVal(del, 'ID')
  })()

  // Shipment
  const shipment = xml.match(/<cac:Shipment[\s\S]*?<\/cac:Shipment>/i)?.[0] ?? ''
  const pesoTotal = xmlVal(shipment, 'GrossWeightMeasure')
  const pesUOM = xmlAttr(shipment, 'GrossWeightMeasure', 'unitCode')
  const nroContenedor = xmlVal(shipment, 'ID') || ''
  const tipoServicio = xmlVal(shipment, 'HandlingCode') || xmlVal(xml, 'TransportModeCode') || ''

  // Vehículo y carreta
  const transport = xml.match(/<cac:TransportMeans[\s\S]*?<\/cac:TransportMeans>/i)?.[0] ?? ''
  const vehiculo = xmlVal(transport, 'RegistrationNationalityID') || xmlVal(transport, 'JourneyID') || xmlVal(shipment, 'ShipmentStage')
  const carreta = (() => {
    const trailers = [...xml.matchAll(/<cac:TransportEquipment[\s\S]*?<\/cac:TransportEquipment>/gi)]
    return trailers.map(m => xmlVal(m[0], 'ID')).filter(Boolean).join(', ')
  })()

  // Conductor
  const driver = xml.match(/<cac:Driver[\s\S]*?<\/cac:Driver>/i)?.[0] ?? ''
  const conductorNombre = xmlVal(driver, 'FamilyName')
    ? `${xmlVal(driver, 'FirstName')} ${xmlVal(driver, 'FamilyName')}`.trim()
    : xmlVal(driver, 'RegistrationName')
  const conductorDoc = xmlVal(driver, 'ID')

  // GRE Remitente / GRE Transporte nums
  const greRemitente = xmlVal(xml, 'ReferencedConsignmentID') || ''
  const greTransporte = serie

  // Pagador
  const pagador = xmlVal(xml, 'FreightAllowanceCharge') || ''

  return {
    serie,
    fecEmision,
    fecTraslado,
    motivo,
    tipoServicio,
    greRemitente,
    greTransporte,
    remitente: remitenteName ? `${remitenteName} (${remitenteRuc})` : remitenteRuc,
    destinatario: destinatarioName ? `${destinatarioName} (${destinatarioRuc})` : destinatarioRuc,
    peso: pesoTotal ? `${pesoTotal} ${pesUOM}`.trim() : '',
    nroContenedor,
    vehiculo,
    carreta,
    conductor: conductorNombre ? `${conductorNombre} - ${conductorDoc}`.trim() : conductorDoc,
    pagador,
  }
}

// GET /api/sunat/gre/descarga?rucEmisor=...&codCpe=...&numSerie=...&numCpe=...&tipo=xml|pdf
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rucEmisor = searchParams.get('rucEmisor') ?? process.env.SUNAT_RUC!
  const codCpe = searchParams.get('codCpe') ?? '31'
  const numSerie = searchParams.get('numSerie')
  const numCpe = searchParams.get('numCpe')
  const tipo = searchParams.get('tipo') ?? 'xml'

  if (!numSerie || !numCpe) {
    return NextResponse.json({ error: 'numSerie y numCpe requeridos' }, { status: 400 })
  }

  const key = `${rucEmisor}-${codCpe}-${numSerie}-${numCpe}`
  const endpoint = `/v1/contribuyente/gre/comprobantes/${key}/descarga/${tipo}`

  try {
    const res = await sunatFetch(endpoint)
    const text = await res.text()
    console.log(`[gre/descarga] ${tipo} status:`, res.status, text.slice(0, 200))

    if (!res.ok) return NextResponse.json({ error: text, status: res.status }, { status: res.status })

    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }

    // Try to extract base64 XML and parse it
    if (tipo === 'xml') {
      const jsonData = parsed as any
      const b64 = jsonData?.xml ?? jsonData?.encodedDocument ?? jsonData?.documento ?? jsonData?.content ?? null
      if (b64) {
        const xmlStr = Buffer.from(b64, 'base64').toString('utf-8')
        const gre = parseGreXml(xmlStr)
        return NextResponse.json({ ok: true, parsed: gre, raw: xmlStr.slice(0, 2000) })
      }
      // If response is already XML
      if (text.startsWith('<?xml') || text.startsWith('<')) {
        const gre = parseGreXml(text)
        return NextResponse.json({ ok: true, parsed: gre, raw: text.slice(0, 2000) })
      }
    }

    return NextResponse.json({ ok: true, data: parsed })
  } catch (error: any) {
    console.error('[gre/descarga]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
