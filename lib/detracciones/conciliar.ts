// Lógica de conciliación Detracciones SUNAT ↔ Movimientos Banco de la Nación.
// Cruce por llave RUC + Monto (2 decimales) — ver DetraccionesSection.tsx para el contexto de negocio.

export type SheetCell = string | number | boolean | Date | null | undefined
export type SheetRow = SheetCell[]

export interface DetraccionRecord {
  ruc: string
  monto: number
  serie: SheetCell
  numComp: SheetCell
  nombreAdq: SheetCell
  fechaPago: string
  constancia: SheetCell
  tipoComp: SheetCell
}

export interface BnRecord {
  ruc: string
  monto: number
  fecha: string
  documento: SheetCell
  trans: SheetCell
}

export interface MatchedRecord {
  det: DetraccionRecord
  bn: BnRecord
}

export interface ConciliacionResult {
  matched: MatchedRecord[]
  unDet: DetraccionRecord[]
  unBn: BnRecord[]
  debug: string
}

const DIACRITICS_RE = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g'
)

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_RE, '')
}

function norm(s: SheetCell): string {
  return stripAccents((s ?? '').toString()).toLowerCase().trim()
}

// Prueba cada keyword en orden de prioridad contra todos los headers antes de
// pasar al siguiente, para que ej. "Numero de Documento Adquiriente" no sea
// eclipsado por una coincidencia parcial de "Tipo de Documento Adquiriente".
function findHeaderCol(headers: SheetRow, keywords: string[]): number {
  for (const kw of keywords) {
    for (let i = 0; i < headers.length; i++) {
      const h = norm(headers[i])
      if (h && h.includes(kw)) return i
    }
  }
  return -1
}

function isRucLike(v: SheetCell): boolean {
  if (v === null || v === undefined) return false
  const s = v.toString().replace(/\.0$/, '').trim()
  return /^\d{11}$/.test(s)
}

function isAmountLike(v: SheetCell): boolean {
  if (v === null || v === undefined || v === '') return false
  const n = parseFloat(v.toString())
  if (isNaN(n)) return false
  return n >= 0 && n < 10_000_000
}

function toAmount(v: SheetCell): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(v.toString().replace(/,/g, ''))
  return isNaN(n) ? null : Math.round(n * 100) / 100
}

function toRuc(v: SheetCell): string | null {
  if (v === null || v === undefined) return null
  return v.toString().trim().replace(/\.0$/, '')
}

function excelDateToStr(v: SheetCell): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string') {
    const m = v.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    return v
  }
  return v ? v.toString() : ''
}

function keyOf(ruc: string, monto: number): string {
  return ruc + '_' + monto.toFixed(2)
}

export interface ParsedDetracciones {
  records: DetraccionRecord[]
  cols: { colRucAdq: number; colMonto: number }
}

export function parseDetracciones(rows: SheetRow[]): ParsedDetracciones {
  const headers = rows[0] ?? []
  const colRucAdq = findHeaderCol(headers, ['numero de documento adquiriente', 'documento adquiriente'])
  const colMonto = findHeaderCol(headers, ['monto deposito', 'monto depósito', 'monto'])
  const colSerie = findHeaderCol(headers, ['serie de comprobante', 'serie comprobante'])
  const colNumComp = findHeaderCol(headers, ['numero de comprobante', 'número de comprobante'])
  const colNombreAdq = findHeaderCol(headers, ['nombre/razon social del adquiriente', 'razon social del adquiriente', 'nombre razon social'])
  const colFechaPago = findHeaderCol(headers, ['fecha pago', 'fecha de pago'])
  const colConstancia = findHeaderCol(headers, ['numero constancia', 'número constancia'])
  const colTipoComp = findHeaderCol(headers, ['tipo de comprobante'])

  const out: DetraccionRecord[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every((c) => c === null || c === undefined || c === '')) continue
    const ruc = colRucAdq >= 0 ? toRuc(r[colRucAdq]) : null
    const monto = colMonto >= 0 ? toAmount(r[colMonto]) : null
    if (ruc === null || monto === null) continue
    out.push({
      ruc,
      monto,
      serie: colSerie >= 0 ? r[colSerie] : '',
      numComp: colNumComp >= 0 ? r[colNumComp] : '',
      nombreAdq: colNombreAdq >= 0 ? r[colNombreAdq] : '',
      fechaPago: colFechaPago >= 0 ? excelDateToStr(r[colFechaPago]) : '',
      constancia: colConstancia >= 0 ? r[colConstancia] : '',
      tipoComp: colTipoComp >= 0 ? r[colTipoComp] : '',
    })
  }
  return { records: out, cols: { colRucAdq, colMonto } }
}

export interface ParsedBn {
  records: BnRecord[]
  cols: { colRuc: number; colAbono: number }
  headers: SheetRow
}

export function parseBN(rows: SheetRow[]): ParsedBn {
  const headers = rows[0] ?? []
  let colRuc = findHeaderCol(headers, ['ruc'])
  let colAbono = findHeaderCol(headers, ['abono', 'credito', 'crédito'])
  const colFecha = findHeaderCol(headers, ['fecha'])
  const colDoc = findHeaderCol(headers, ['documento', 'nro. doc', 'operacion'])
  const colTrans = findHeaderCol(headers, ['trans'])

  const dataRows = rows.slice(1).filter((r) => r && !r.every((c) => c === null || c === undefined || c === ''))

  // Si no hay match por nombre de columna, detecta por contenido (RUC = 11 dígitos, Abono = importe)
  if (colRuc === -1) {
    const ncols = headers.length
    let bestCol = -1
    let bestScore = 0
    for (let c = 0; c < ncols; c++) {
      let score = 0
      let total = 0
      for (const r of dataRows) {
        if (r[c] === null || r[c] === undefined || r[c] === '') continue
        total++
        if (isRucLike(r[c])) score++
      }
      if (total > 0 && score / total > 0.5 && score > bestScore) {
        bestScore = score
        bestCol = c
      }
    }
    colRuc = bestCol
  }
  if (colAbono === -1) {
    const ncols = headers.length
    let bestCol = -1
    let bestScore = 0
    for (let c = 0; c < ncols; c++) {
      if (c === colRuc) continue
      let score = 0
      let total = 0
      for (const r of dataRows) {
        if (r[c] === null || r[c] === undefined || r[c] === '') continue
        total++
        if (isAmountLike(r[c]) && !isRucLike(r[c])) score++
      }
      if (total > 0 && score / total > 0.6 && score > bestScore) {
        bestScore = score
        bestCol = c
      }
    }
    colAbono = bestCol
  }

  const out: BnRecord[] = []
  for (const r of dataRows) {
    const ruc = colRuc >= 0 ? toRuc(r[colRuc]) : null
    const monto = colAbono >= 0 ? toAmount(r[colAbono]) : null
    if (ruc === null || monto === null || !isRucLike(ruc)) continue
    out.push({
      ruc,
      monto,
      fecha: colFecha >= 0 ? excelDateToStr(r[colFecha]) : '',
      documento: colDoc >= 0 ? r[colDoc] : '',
      trans: colTrans >= 0 ? r[colTrans] : '',
    })
  }
  return { records: out, cols: { colRuc, colAbono }, headers }
}

export function conciliar(detRows: SheetRow[], bnRows: SheetRow[]): ConciliacionResult & { detCols: ParsedDetracciones['cols']; bnCols: ParsedBn['cols']; bnHeaders: SheetRow } {
  const det = parseDetracciones(detRows)
  const bn = parseBN(bnRows)

  // Bolsa de comprobantes por llave RUC+Monto: cuando hay montos duplicados del
  // mismo proveedor, cada abono del BN "consume" uno de la bolsa (FIFO) — no hay
  // forma de saber cuál-es-cuál si son idénticos en RUC+monto.
  const pool: Record<string, number[]> = {}
  det.records.forEach((rec, idx) => {
    const k = keyOf(rec.ruc, rec.monto)
    if (!pool[k]) pool[k] = []
    pool[k].push(idx)
  })

  const usedDet = new Set<number>()
  const matched: MatchedRecord[] = []
  const unBn: BnRecord[] = []

  bn.records.forEach((bnRec) => {
    const k = keyOf(bnRec.ruc, bnRec.monto)
    const bucket = pool[k]
    if (bucket && bucket.length) {
      const idx = bucket.shift() as number
      usedDet.add(idx)
      matched.push({ det: det.records[idx], bn: bnRec })
    } else {
      unBn.push(bnRec)
    }
  })

  const unDet = det.records.filter((_, idx) => !usedDet.has(idx))

  const debug =
    `Detección de columnas — Detracciones: RUC adquiriente col ${det.cols.colRucAdq}, Monto col ${det.cols.colMonto}` +
    ` | BN: RUC col ${bn.cols.colRuc} (${bn.headers[bn.cols.colRuc] ?? '?'}), Abono col ${bn.cols.colAbono} (${bn.headers[bn.cols.colAbono] ?? '?'})`

  return { matched, unDet, unBn, debug, detCols: det.cols, bnCols: bn.cols, bnHeaders: bn.headers }
}
