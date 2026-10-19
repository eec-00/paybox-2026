// ============================================================================
// Excel semanal de sobrecostos QUIMTIA — calcado del formato que ya usan a
// mano: tabla principal (ITEM … SOBRECOSTO) y, a la derecha, un recuadro de
// detalle de horas por cada servicio que pasó las 5 h libres, enlazado con
// el número verde junto a la fila. Los montos (SOBRECOSTO) quedan en blanco:
// los completa a mano quien revisa el Excel. Una hoja por tipo de servicio
// (Despachos, Recojos, Importaciones, Exportaciones), solo los que hay en la semana.
// ============================================================================

import ExcelJS from 'exceljs'
import { caps, m2oLast6, parseTaskNameParts, shortSiteName } from './exportFormats'
import {
  calcularSobrecosto, formatDuracion, formatFechaHora, HORAS_LIBRES, tipoCargaSobrecosto, tipoSobrecosto,
  type SobrecostoInfo, type SobrecostoTask, type TipoSobrecosto, type Tramo,
} from './sobrecostos'

const C = {
  titulo: 'FF1F4E79',
  header: 'FF44546A',
  headerHora: 'FF3F3F3F',
  headerSobrecosto: 'FF5B6B8C',
  costoServicio: 'FFB4A7D6',
  gris: 'FFD9D9D9',
  verde: 'FFC6E0B4',
  blanco: 'FFFFFFFF',
}

const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
}

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function m2o(val: unknown): [number, string] | false {
  return Array.isArray(val) ? (val as [number, string]) : false
}

function formatFecha(value: string | false): string {
  if (!value) return ''
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

/** "25/09/2026 04:47 p.m." → "25/09/2026\n04:47 p.m." */
function dosLineas(s: string): string {
  return s.replace(' ', '\n')
}

const MAIN_HEADERS: { header: string; width: number }[] = [
  { header: 'ITEM', width: 6 },
  { header: 'FECHA', width: 11 },
  { header: 'PLACA', width: 10 },
  { header: 'CLIENTE', width: 22 },
  { header: 'REFERENCIA/\nBOOKING', width: 13 },
  { header: 'TIPO DE\nSERVICIO', width: 13 },
  { header: 'TIPO DE\nCARGA', width: 10 },
  { header: 'N° CNTR', width: 14 },
  { header: 'GUIA DE\nREMISION', width: 16 },
  { header: 'GUIA TRANSP.', width: 15 },
  { header: 'ALMACEN\nRETIRO', width: 15 },
  { header: 'ALMACEN\nLLEGADA', width: 15 },
  { header: 'SOBRECOSTO', width: 13 },
]

// Índices (1-based) derivados de la tabla principal: M = SOBRECOSTO,
// N = número verde, O = separación, P = número del recuadro, Q..X = recuadro
const COL_SOBRECOSTO = MAIN_HEADERS.length // M
const COL_MARKER = COL_SOBRECOSTO + 1 // N
const COL_NUM = COL_SOBRECOSTO + 3 // P
const COL_BOX = COL_SOBRECOSTO + 4 // Q

const HOJAS: { tipo: TipoSobrecosto; hoja: string; titulo: string }[] = [
  { tipo: 'importacion', hoja: 'Importaciones', titulo: 'SERVICIOS DE IMPORTACIÓN' },
  { tipo: 'despacho', hoja: 'Despachos', titulo: 'SERVICIOS DE DESPACHO' },
  { tipo: 'recojo', hoja: 'Recojos', titulo: 'SERVICIOS DE RECOJO' },
  { tipo: 'exportacion', hoja: 'Exportaciones', titulo: 'SERVICIOS DE EXPORTACIÓN' },
]

export async function exportarSobrecostosExcel(
  tasks: SobrecostoTask[],
  semana: { start: string; end: string },
  logoUrl = '/logo.png',
): Promise<Blob> {
  const wb = new ExcelJS.Workbook()

  let logoId: number | null = null
  try {
    const res = await fetch(logoUrl)
    if (res.ok) logoId = wb.addImage({ buffer: await res.arrayBuffer(), extension: 'png' })
  } catch { /* sin logo */ }

  for (const { tipo, hoja, titulo } of HOJAS) {
    const delTipo = tasks.filter((t) => tipoSobrecosto(t) === tipo)
    if (delTipo.length > 0) dibujarHoja(wb, hoja, titulo, delTipo, semana, logoId)
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function dibujarHoja(
  wb: ExcelJS.Workbook,
  nombreHoja: string,
  tituloHoja: string,
  tasks: SobrecostoTask[],
  semana: { start: string; end: string },
  logoId: number | null,
) {
  const ws = wb.addWorksheet(nombreHoja, { views: [{ showGridLines: false }] })

  MAIN_HEADERS.forEach((h, i) => { ws.getColumn(i + 1).width = h.width })
  ws.getColumn(COL_MARKER).width = 5 // número verde
  ws.getColumn(COL_MARKER + 1).width = 6 // separación
  ws.getColumn(COL_NUM).width = 6
  for (let c = COL_BOX; c < COL_BOX + 8; c++) ws.getColumn(c).width = 16

  // ── Encabezado: logo + título ─────────────────────────────────────────
  if (logoId !== null) ws.addImage(logoId, { tl: { col: 0.2, row: 0.1 }, ext: { width: 46, height: 46 } })
  ws.mergeCells('B1:C3')
  const marca = ws.getCell('B1')
  marca.value = {
    richText: [
      { text: 'EEMERSON\n', font: { bold: true, size: 14, color: { argb: 'FF1A2332' } } },
      { text: 'Transporte Logístico', font: { size: 8, color: { argb: 'FF7F7F7F' } } },
    ],
  }
  marca.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

  ws.mergeCells('D2:M2')
  const titulo = ws.getCell('D2')
  titulo.value = tituloHoja
  titulo.font = { bold: true, size: 13, color: { argb: C.blanco } }
  titulo.fill = fill(C.titulo)
  titulo.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(2).height = 24
  ws.getCell('D3').value = `Semana del ${formatFecha(semana.start)} al ${formatFecha(semana.end)}`
  ws.getCell('D3').font = { italic: true, size: 9, color: { argb: 'FF595959' } }
  ws.mergeCells('D4:L4')
  const beta = ws.getCell('D4')
  beta.value = 'BETA: tiempos calculados automáticamente con las marcas de los conductores. Revisar antes de cobrar.'
  beta.font = { bold: true, size: 8, color: { argb: 'FF9C5700' } }
  beta.fill = fill('FFFFEB9C')
  beta.alignment = { vertical: 'middle', horizontal: 'center' }

  const costo = ws.getCell('M4')
  costo.value = 'COSTO DEL SERVICIO'
  costo.font = { bold: true, size: 7 }
  costo.fill = fill(C.costoServicio)
  costo.alignment = { vertical: 'middle', horizontal: 'center' }

  // ── Tabla principal ───────────────────────────────────────────────────
  const HEADER_ROW = 5
  const hr = ws.getRow(HEADER_ROW)
  hr.height = 30
  MAIN_HEADERS.forEach((h, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = h.header
    cell.font = { bold: true, size: 8, color: { argb: C.blanco }, italic: i === COL_SOBRECOSTO - 1 }
    cell.fill = fill(C.header)
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thin
  })

  const filas = tasks.map((task) => ({ task, info: calcularSobrecosto(task) }))
  let nextFreeRow = HEADER_ROW // fila libre para el próximo recuadro de detalle
  let numRecuadro = 0

  filas.forEach(({ task, info }, idx) => {
    const rowNum = HEADER_ROW + 1 + idx
    const row = ws.getRow(rowNum)
    row.height = 30
    const parts = parseTaskNameParts(task.name)
    const cliente = task.partner_id ? task.partner_id[1] : ''
    const retiro = caps(shortSiteName(m2o(task.x_studio_almacen_de_retiro), cliente))
    const destino = caps(shortSiteName(m2o(task.x_studio_almacen_de_destino), cliente))
    const contenedor = (task.x_studio_nmero_de_contenedor as string | false) || ''
    const tipoTxt = info?.tipo === 'recojo' ? 'RECOJO' : parts ? caps(parts.tipo) : info ? caps(info.tipo) : ''

    const values = [
      idx + 1,
      formatFecha(task.x_studio_fecha_de_la_programacin),
      m2oLast6(m2o(task.x_studio_placa)),
      info?.tipo === 'exportacion' ? '' : destino,
      (task.x_studio_referenciabooking as string | false) || '-',
      tipoTxt,
      caps(tipoCargaSobrecosto(task)),
      contenedor || (info?.tipo === 'despacho' || info?.tipo === 'recojo' ? 'CARGA SUELTA' : ''),
      '', // guía de remisión: se llena a mano
      '', // guía transportista: se llena a mano
      retiro,
      destino,
      null, // SOBRECOSTO: se llena a mano
    ]
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1)
      cell.value = v
      cell.font = { size: 8, bold: i === 2 }
      cell.alignment = { vertical: 'bottom', horizontal: i === 3 ? 'left' : 'center', wrapText: true }
      cell.border = thin
      if (i === COL_SOBRECOSTO - 1) {
        cell.fill = fill(C.gris)
        cell.numFmt = '"S/." #,##0.00'
      }
    })

    if (!info?.alerta) return

    // Número verde junto a la fila + recuadro de detalle a la derecha
    numRecuadro++
    const marker = row.getCell(COL_MARKER)
    marker.value = numRecuadro
    marker.font = { bold: true, size: 8 }
    marker.fill = fill(C.verde)
    marker.alignment = { vertical: 'middle', horizontal: 'center' }

    const start = Math.max(rowNum, nextFreeRow)
    const usadas = dibujarRecuadro(ws, start, numRecuadro, task, info)
    nextFreeRow = start + usadas + 1
  })
}

function headerCell(cell: ExcelJS.Cell, text: string, argb = C.header, italic = false) {
  cell.value = text
  cell.font = { bold: true, size: 7, color: { argb: C.blanco }, italic }
  cell.fill = fill(argb)
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = thin
}

function valueCell(cell: ExcelJS.Cell, text: string, gris = false) {
  cell.value = text
  cell.font = { size: 8 }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = thin
  if (gris) cell.fill = fill(C.gris)
}

/** Nombre corto del sitio donde ocurre el tramo (ej. "CD LURIN EUCALIPTOS"). */
function lugarTramo(task: SobrecostoTask, t: Tramo): string {
  const cliente = task.partner_id ? task.partner_id[1] : ''
  const field = t.lugar === 'retiro' ? task.x_studio_almacen_de_retiro : t.lugar === 'destino' ? task.x_studio_almacen_de_destino : null
  const sitio = field ? caps(shortSiteName(m2o(field), cliente)) : ''
  return sitio || caps(t.label)
}

/**
 * Dibuja el recuadro de horas de un servicio (mismo formato para 1 o 2 tramos):
 *
 *   | LLEGADA A | SALIDA A | LLEGADA B | SALIDA B | TOTAL DE HORAS (2) | HORAS CON SOBRECOSTO | SOBRECOSTO TOTAL |
 *   |  fecha/h  |  fecha/h |  fecha/h  |  fecha/h | (5h51) | (-) 5 h  |        (51 min)      |     (a mano)     |
 *   |    (subtotal A)      |    (subtotal B)      |
 *
 * Devuelve cuántas filas usó.
 */
function dibujarRecuadro(ws: ExcelJS.Worksheet, top: number, num: number, task: SobrecostoTask, info: SobrecostoInfo): number {
  const fecha = task.x_studio_fecha_de_la_programacin
  const filas = 3
  const col = (offset: number) => COL_BOX + offset

  ws.getRow(top).height = 40
  for (let r = top + 1; r < top + filas; r++) {
    if ((ws.getRow(r).height ?? 0) < 30) ws.getRow(r).height = 30
  }

  ws.mergeCells(top, COL_NUM, top + 1, COL_NUM)
  const n = ws.getCell(top, COL_NUM)
  n.value = num
  n.font = { bold: true, size: 9 }
  n.fill = fill(C.verde)
  n.alignment = { vertical: 'middle', horizontal: 'center' }

  const fh = (min: number | null, enCurso: boolean) =>
    min !== null ? dosLineas(formatFechaHora(fecha, min)) : enCurso ? 'EN CURSO' : '—'

  let c = 0
  for (const t of info.tramos) {
    const lugar = lugarTramo(task, t)
    headerCell(ws.getCell(top, col(c)), `HORA DE ${t.inicioLabel.toUpperCase()} ${lugar}`, C.headerHora)
    headerCell(ws.getCell(top, col(c + 1)), `HORA DE ${t.finLabel.toUpperCase()} ${lugar}`, C.headerHora)
    valueCell(ws.getCell(top + 1, col(c)), fh(t.inicio, false))
    valueCell(ws.getCell(top + 1, col(c + 1)), fh(t.fin, t.enCurso))
    ws.mergeCells(top + 2, col(c), top + 2, col(c + 1))
    valueCell(ws.getCell(top + 2, col(c)), t.minutos !== null ? `(${formatDuracion(t.minutos)}${t.enCurso ? ' - en curso' : ''})` : '')
    c += 2
  }

  ws.mergeCells(top, col(c), top, col(c + 1))
  headerCell(ws.getCell(top, col(c)), 'TOTAL DE HORAS')
  valueCell(ws.getCell(top + 1, col(c)), `(${formatDuracion(info.totalMin)})`)
  valueCell(ws.getCell(top + 1, col(c + 1)), `(-) ${HORAS_LIBRES} HORAS
LIBRES`)
  headerCell(ws.getCell(top, col(c + 2)), 'HORAS CON SOBRECOSTO')
  valueCell(ws.getCell(top + 1, col(c + 2)), `(${formatDuracion(info.excesoMin)})`)
  headerCell(ws.getCell(top, col(c + 3)), 'SOBRECOSTO TOTAL', C.headerSobrecosto, true)
  valueCell(ws.getCell(top + 1, col(c + 3)), '', true)
  ws.getCell(top + 1, col(c + 3)).numFmt = '"S/." #,##0.00'
  return filas
}
