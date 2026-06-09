import { NextRequest, NextResponse } from 'next/server'
import { sunatFetch } from '@/lib/sunat/client'

// Extracts value handling both plain text and CDATA
function v(scope: string, tag: string): string {
  const cd = scope.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'))
  if (cd) return cd[1].trim()
  const pl = scope.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([^<]+)<`, 'i'))
  return pl?.[1]?.trim() ?? ''
}

// Extracts a full XML section (first match)
function sec(scope: string, tag: string): string {
  const m = scope.match(new RegExp(`<(?:[^:>]+:)?${tag}[\\s\\S]*?</(?:[^:>]+:)?${tag}>`, 'i'))
  return m?.[0] ?? ''
}

function formatPlate(raw: string): string {
  if (!raw || raw === '-') return ''
  // ATV751 → ATV-751 | B3J123 → B3J-123
  return raw.replace(/^([A-Z]{1,3})(\d+)([A-Z]*)$/, (_, a, b, c) => c ? `${a}${b}-${c}` : `${a}-${b}`)
}

function parseGreXml(xml: string) {
  // Strip signature block to avoid false ID matches
  const body = xml.replace(/<(?:[^:>]+:)?UBLExtensions[\s\S]*?<\/(?:[^:>]+:)?UBLExtensions>/i, '')

  // Document ID (EG03-7356)
  const greTransporte = v(body, 'ID')

  // GRE Remitente from AdditionalDocumentReference
  const addRef = sec(body, 'AdditionalDocumentReference')
  const greRemitente = v(addRef, 'ID')

  // Dates
  const fecEmision = v(body, 'IssueDate')

  // Shipment block
  const shipment = sec(body, 'Shipment')

  // Peso
  const pesoM = shipment.match(/<(?:[^:>]+:)?GrossWeightMeasure[^>]*unitCode="([^"]*)"[^>]*>([^<]*)</)
  const peso = pesoM ? `${parseFloat(pesoM[2]).toLocaleString('es-PE')} ${pesoM[1]}` : ''

  // Pagador indicator
  const pagadorInd = shipment.includes('IndicadorPagadorFlete_Tercero') ? 'Tercero' :
    shipment.includes('IndicadorPagadorFlete_Remitente') ? 'Remitente' :
    shipment.includes('IndicadorPagadorFlete_Destinatario') ? 'Destinatario' : ''

  // ShipmentStage
  const stage = sec(shipment, 'ShipmentStage')

  // Fecha traslado
  const transitPeriod = sec(stage, 'TransitPeriod')
  const fecTraslado = v(transitPeriod, 'StartDate')

  // Conductor
  const driver = sec(stage, 'DriverPerson')
  const conductorNombre = v(driver, 'FirstName') || v(driver, 'RegistrationName')
  const conductorDni = v(driver, 'ID')

  // Remitente: inside Delivery > Despatch > DispatchParty
  const delivery = sec(shipment, 'Delivery')
  const despatch = sec(delivery, 'Despatch')
  const dispatchParty = sec(despatch, 'DespatchParty')
  const remitenteName = v(sec(dispatchParty, 'PartyLegalEntity'), 'RegistrationName')

  // Destinatario: DeliveryCustomerParty
  const delivCustomer = sec(body, 'DeliveryCustomerParty')
  const destinatarioName = v(sec(delivCustomer, 'PartyLegalEntity'), 'RegistrationName')

  // Pagador: OriginatorCustomerParty
  const originator = sec(body, 'OriginatorCustomerParty')
  const pagadorName = v(sec(originator, 'PartyLegalEntity'), 'RegistrationName')

  // Vehículo: TransportHandlingUnit > TransportEquipment > ID
  const thu = sec(shipment, 'TransportHandlingUnit')
  const nroContenedorRaw = v(thu, 'ID')
  const equip = sec(thu, 'TransportEquipment')
  const vehiculoPlate = v(equip, 'ID')
  const vehiculo = formatPlate(vehiculoPlate)

  // Carreta: AttachedTransportEquipment nested inside TransportEquipment
  const attached = sec(equip, 'AttachedTransportEquipment')
  const carretaPlate = attached ? v(attached, 'ID') : ''
  const carreta = formatPlate(carretaPlate)

  // Tipo servicio from Note
  // Note formats: "IMPORTACION" | "IMPORTACION según contenedor: MSCU123" | "Label: IMPORTACION"
  const nota = v(body, 'Note')
  let tipoServicio = ''
  if (nota && nota.toLowerCase() !== 'false') {
    // Strip container/isotank suffix before extracting type
    const stripped = nota.replace(/\s*seg[uú]n\s+(?:contenedor|nro\.?\s*(?:de\s*isotanque)?)[:\s.]*[A-Z0-9]*/i, '').trim()
    tipoServicio = stripped.includes(':') ? stripped.split(':').slice(1).join(':').trim() : stripped
  }

  // Container: prefer TransportHandlingUnit ID, fallback to scanning entire XML
  // Handles: "según contenedor: XXX" | "según NRO. XXX" | "según NRO.\nXXX" (anywhere in doc)
  const CONT_RE = /seg[uú]n\s+(?:contenedor|nro\.?\s*(?:de\s*isotanque)?)[:\s.\n\r]*([A-Z]{3,4}\d{6,7})/i
  let nroContenedor = nroContenedorRaw === '-' ? '' : nroContenedorRaw
  if (!nroContenedor) {
    const contMatch = body.match(CONT_RE)
    if (contMatch) nroContenedor = contMatch[1].replace(/\.+$/, '')
  }

  return {
    serie: greTransporte,
    fecEmision,
    fecTraslado,
    motivo: v(body, 'DespatchAdviceTypeCode'),
    tipoServicio,
    greRemitente,
    greTransporte,
    remitente: remitenteName,
    destinatario: destinatarioName,
    peso,
    nroContenedor,
    vehiculo,
    carreta,
    conductor: conductorNombre,
    conductorDni,
    pagador: pagadorName || pagadorInd,
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
        return NextResponse.json({ ok: true, parsed: gre, rawXml: xmlStr })
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
