import { PDFParse } from 'pdf-parse'

export interface DetalleGreBF {
  placas: string
  conductor: string
  debugText?: string
}

const PLACA_RE = /\b(?=[A-Z0-9]{6}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{6}\b/g
// Fila del conductor viene como "DNI 07997733 ATUNCAR ORTIZ REYNALDO Q07997733" (doc, nombre, N° licencia) antes del tab/salto de línea.
const CONDUCTOR_ROW_RE = /(?:DNI|CE|RUC|PASAPORTE)\s+[A-Z0-9]{6,12}\s+([^\t\n]+)/
const LICENCIA_TOKEN_RE = /^[A-Z]{0,2}\d{5,10}$/

function between(text: string, startMarker: string, endMarkers: string[]): string | null {
  const startIdx = text.indexOf(startMarker)
  if (startIdx === -1) return null
  let endIdx = text.length
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker, startIdx + startMarker.length)
    if (idx !== -1 && idx < endIdx) endIdx = idx
  }
  return text.slice(startIdx + startMarker.length, endIdx)
}

export function extractDetalle(text: string): DetalleGreBF {
  const normalized = text.toUpperCase()

  const transporteBlock = between(normalized, 'DATOS DEL TRANSPORTE', ['DATOS DE(LOS) CONDUCTOR', 'DATOS DEL CONDUCTOR'])
  const conductorBlock = between(normalized, 'DATOS DE(LOS) CONDUCTOR', ['CÓDIGO DE VERIFICACIÓN', 'CODIGO DE VERIFICACION', 'OBSERVACIONES'])
    ?? between(normalized, 'DATOS DEL CONDUCTOR', ['CÓDIGO DE VERIFICACIÓN', 'CODIGO DE VERIFICACION', 'OBSERVACIONES'])

  const placas = transporteBlock
    ? Array.from(new Set(transporteBlock.match(PLACA_RE) ?? []))
    : []

  let conductor = ''
  const rowMatch = conductorBlock?.match(CONDUCTOR_ROW_RE)
  if (rowMatch) {
    const tokens = rowMatch[1].trim().replace(/\s+/g, ' ').split(' ')
    if (tokens.length > 1 && LICENCIA_TOKEN_RE.test(tokens[tokens.length - 1])) {
      tokens.pop()
    }
    conductor = tokens.join(' ')
  }

  return {
    placas: placas.join(' / '),
    conductor,
    ...(placas.length === 0 || !conductor ? { debugText: normalized.slice(0, 2000) } : {}),
  }
}

export async function extractDetalleFromPdf(buffer: ArrayBuffer): Promise<DetalleGreBF> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    return extractDetalle(result.text)
  } finally {
    await parser.destroy()
  }
}
