// ============================================================================
// Formatos de exportación a Excel por cliente (panel admin → Servicios).
//
// Cada cliente tiene su propia plantilla de columnas, calcada de la hoja que
// ya usan manualmente hoy. Los datos salen de lo que ya trae Odoo/nuestro
// tracking de progreso — no hay ningún dato inventado.
//
// OJO — dos cosas que son un "mejor esfuerzo", no una copia exacta del
// formato a mano que ya manejan:
//  1. Nombres cortos de almacén (ALCONSA, CD LURIN, etc.): Odoo guarda estos
//     sitios como "Empresa Padre, Sede" (ej. "QUIMTIA S.A., Quimtia CD Lurín
//     Eucaliptos"). Acá se toma la parte después de la coma y se le quita el
//     nombre del cliente si se repite al inicio ("Quimtia CD Lurín
//     Eucaliptos" → "CD Lurín Eucaliptos"). No se acorta más que eso — si en
//     la práctica ese sitio siempre se anota como "CD LURIN" a secas, avisen
//     y se agrega a SITE_ABBREVIATIONS de una vez.
//  2. STATUS/ESTATUS ("unidad en cola de...", "unidad dentro de...", etc.):
//     se arma automáticamente según el último hito que el conductor marcó en
//     la app (ver estadoNarrativo). La redacción exacta es la que nos
//     pareció más parecida a los ejemplos que pasaron — es fácil de ajustar
//     acá si alguna frase no calza con lo que esperan.
// ============================================================================

import { getHitosForTask, detectTipoServicio, type TaskTypeFlags } from './hitos'
import { calcularProgreso } from './progreso'

/** Nombres de sitio ya confirmados que no siguen la regla genérica de
 * "quitar el nombre del cliente del inicio" — agregar acá cuando se
 * confirme una abreviatura exacta que el cliente espera. */
const SITE_ABBREVIATIONS: Record<string, string> = {}

export interface ExportTask extends TaskTypeFlags {
  id: number
  name: string
  partner_id: [number, string] | false
  x_studio_fecha_de_la_programacin: string | false
  x_studio_hora_de_cita: number | false
  x_studio_placa: [number, string] | false
  x_studio_placa_carreta: [number, string] | false
  x_studio_conductor: [number, string] | false
  x_studio_referenciabooking: string | false
  x_studio_agencia: string | false
  x_studio_nmero_de_contenedor: string | false
  x_studio_almacen_de_retiro: [number, string] | false
  x_studio_almacen_de_destino: [number, string] | false
  [key: string]: unknown
}

export interface ProgresoCtx {
  progresoMap: Map<number, number>
  completadosSet: Set<number>
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function m2oFull(val: [number, string] | false): string {
  return val ? val[1] : ''
}
/** Mayúsculas sin tildes — el estilo que usan en estos reportes (ASCII
 * plano) para nombres, sedes y el texto de STATUS. */
function caps(s: string): string {
  return stripDiacritics(s).toUpperCase()
}
function m2oLast6(val: [number, string] | false): string {
  const full = m2oFull(val)
  if (!full) return ''
  return full.slice(-6).trim()
}

/** "QUIMTIA S.A., Quimtia CD Lurín Eucaliptos" → "CD Lurín Eucaliptos"
 * (toma lo de después de la coma y le saca el nombre del cliente si se
 * repite al inicio de la sede). */
function shortSiteName(val: [number, string] | false, clienteName: string): string {
  const full = m2oFull(val)
  if (!full) return ''
  if (SITE_ABBREVIATIONS[full]) return SITE_ABBREVIATIONS[full]
  const afterComma = full.includes(', ') ? full.split(', ').slice(1).join(', ') : full
  const clientePrefixes = [clienteName, clienteName.replace(/\s*S\.?A\.?C?\.?$/i, ''), clienteName.replace(/\s*S\.?R\.?L\.?$/i, '')]
    .map((p) => p.trim()).filter(Boolean)
  for (const prefix of clientePrefixes) {
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–]?\\s*`, 'i')
    if (re.test(afterComma)) return afterComma.replace(re, '').trim()
  }
  return afterComma.trim()
}

/** "Servicio de transporte (Importación, Contenedor 40, General, Zona 7)" →
 * { tipo: 'Importación', tamano: '40', carga: 'General', zona: 'Zona 7' }.
 * Las subtareas (ej. "Devolución de vacío") no siguen este patrón — para
 * esas devuelve null y el llamador deja esas columnas en blanco. */
function parseTaskNameParts(name: string): { tipo: string; tamano: string; carga: string; zona: string } | null {
  const match = name.match(/\(([^)]+)\)\s*$/)
  if (!match) return null
  const parts = match[1].split(',').map((p) => p.trim())
  if (parts.length < 3) return null
  const tamanoMatch = parts[1].match(/\d+/)
  return {
    tipo: parts[0] || '',
    tamano: tamanoMatch ? tamanoMatch[0] : parts[1] || '',
    carga: parts[2] || '',
    zona: parts[3] || '',
  }
}

/** Descripción operativa ("UNIDAD EN COLA DE...", "TERMINO DESCARGA", etc.)
 * a partir del último hito que el conductor marcó en la app. */
export function estadoNarrativo(task: ExportTask, ctx: ProgresoCtx): string {
  const tipo = detectTipoServicio(task)
  const esCarga = tipo === 'exportacion' || tipo === 'despacho' // "carga" en vez de "descarga"
  const hitos = getHitosForTask(task)
  const progreso = calcularProgreso(task, ctx.progresoMap, ctx.completadosSet)

  if (progreso.estado === 'sin_iniciar') return 'PENDIENTE'
  if (progreso.estado === 'completado') return 'SERVICIO FINALIZADO'

  const clienteNombre = m2oFull(task.partner_id)
  const almacenRetiro = caps(shortSiteName(task.x_studio_almacen_de_retiro, clienteNombre))
  const almacenDestino = caps(shortSiteName(task.x_studio_almacen_de_destino, clienteNombre))
  const lastKey = hitos[progreso.stepActual - 1]?.key

  switch (lastKey) {
    case 'inicio_ruta':
      return almacenRetiro ? `UNIDAD EN RUTA A ${almacenRetiro}` : 'UNIDAD EN RUTA'
    case 'llegada_cola_retiro':
      return almacenRetiro ? `UNIDAD EN COLA DE ${almacenRetiro}` : 'UNIDAD EN COLA'
    case 'ingreso_almacen_retiro':
      return almacenRetiro ? `UNIDAD DENTRO DE ${almacenRetiro}` : 'UNIDAD DENTRO DE ALMACEN'
    case 'salida_almacen_retiro':
      return almacenDestino ? `UNIDAD DIRIGIENDOSE A ${almacenDestino}` : 'UNIDAD DIRIGIENDOSE A CLIENTE'
    case 'llegada_cliente':
      return 'UNIDAD EN CLIENTE EN ESPERA DE INGRESO'
    case 'ingreso_cliente':
      return `UNIDAD EN EL CLIENTE EN ESPERA DE ${esCarga ? 'CARGA' : 'DESCARGA'}`
    case 'inicio_descarga':
      return 'UNIDAD EN EL CLIENTE DESCARGANDO'
    case 'inicio_carga':
      return 'UNIDAD EN EL CLIENTE CARGANDO'
    case 'fin_descarga':
      return 'TERMINO DESCARGA'
    case 'fin_carga':
      return 'TERMINO CARGA'
    case 'salida_cliente':
      return 'UNIDAD EN RETORNO'
    default:
      return `EN PROCESO (${progreso.stepActual}/${progreso.totalHitos})`
  }
}

function hitoTime(task: ExportTask, key: string): string {
  const hito = getHitosForTask(task).find((h) => h.key === key)
  if (!hito) return ''
  const value = task[hito.field]
  if (typeof value !== 'number' || value === 0) return ''
  const hours = Math.floor(value)
  const minutes = Math.round((value - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatFecha(value: string | false): string {
  if (!value) return ''
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function formatHora(value: number | false): string {
  if (typeof value !== 'number') return ''
  const hours = Math.floor(value)
  const minutes = Math.round((value - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// ── QUIMTIA ─────────────────────────────────────────────────────────────
export const QUIMTIA_COLUMNS = [
  { header: 'FECHA', key: 'fecha', width: 12 },
  { header: 'PLACA', key: 'placa', width: 12 },
  { header: 'CLIENTE', key: 'cliente', width: 20 },
  { header: 'TIPO DE SERVICIO', key: 'tipoServicio', width: 16 },
  { header: 'TIPO DE CARGA', key: 'tipoCarga', width: 14 },
  { header: 'HORA DE CITA', key: 'horaCita', width: 12 },
  { header: 'REFERENCIA / BOOKING', key: 'referencia', width: 22 },
  { header: 'TAMAÑO CNTR', key: 'tamano', width: 12 },
  { header: 'CNTR', key: 'contenedor', width: 16 },
  { header: 'AGENCIA', key: 'agencia', width: 16 },
  { header: 'ALMACEN DE RETIRO', key: 'almacenRetiro', width: 20 },
  { header: 'DESTINO', key: 'destino', width: 20 },
  { header: 'CONDUCTOR', key: 'conductor', width: 24 },
  { header: 'STATUS', key: 'status', width: 40 },
]

export function buildQuimtiaRow(task: ExportTask, ctx: ProgresoCtx) {
  const parts = parseTaskNameParts(task.name)
  const clienteNombre = m2oFull(task.partner_id)
  return {
    fecha: formatFecha(task.x_studio_fecha_de_la_programacin),
    placa: m2oLast6(task.x_studio_placa),
    cliente: clienteNombre,
    tipoServicio: parts ? caps(parts.tipo) : '',
    tipoCarga: parts ? caps(parts.carga) : '',
    horaCita: formatHora(task.x_studio_hora_de_cita),
    referencia: task.x_studio_referenciabooking || '',
    tamano: parts ? parts.tamano : '',
    contenedor: task.x_studio_nmero_de_contenedor || '',
    agencia: task.x_studio_agencia || '',
    almacenRetiro: caps(shortSiteName(task.x_studio_almacen_de_retiro, clienteNombre)),
    destino: caps(shortSiteName(task.x_studio_almacen_de_destino, clienteNombre)),
    conductor: caps(m2oFull(task.x_studio_conductor)),
    status: estadoNarrativo(task, ctx),
  }
}

// ── E & M ───────────────────────────────────────────────────────────────
export const EYM_COLUMNS = [
  { header: 'CLIENTE', key: 'cliente', width: 16 },
  { header: 'HORA DE RETIRO', key: 'horaRetiro', width: 14 },
  { header: 'REFERENCIA / ORDEN', key: 'referencia', width: 18 },
  { header: 'UNIDAD', key: 'unidad', width: 12 },
  { header: 'DESTINO', key: 'destino', width: 18 },
  { header: 'ESTATUS', key: 'status', width: 40 },
]

export function buildEyMRow(task: ExportTask, ctx: ProgresoCtx) {
  const clienteNombre = m2oFull(task.partner_id)
  return {
    cliente: clienteNombre,
    horaRetiro: formatHora(task.x_studio_hora_de_cita),
    referencia: task.x_studio_referenciabooking || '',
    unidad: m2oLast6(task.x_studio_placa),
    destino: caps(shortSiteName(task.x_studio_almacen_de_destino, clienteNombre)),
    status: estadoNarrativo(task, ctx),
  }
}

// ── CROSLAND ────────────────────────────────────────────────────────────
export const CROSLAND_COLUMNS = [
  { header: 'N°', key: 'n', width: 6 },
  { header: 'PLACA', key: 'placa', width: 12 },
  { header: 'CARRETA', key: 'carreta', width: 12 },
  { header: 'SOAT', key: 'soat', width: 12 },
  { header: 'CONDUCTOR', key: 'conductor', width: 24 },
  { header: 'NRO CTN', key: 'contenedor', width: 16 },
  { header: 'NRO PRECINTO', key: 'precinto', width: 14 },
  { header: 'H. LLEGADA T.A', key: 'hLlegadaTA', width: 14 },
  { header: 'H. INGRESO T.A', key: 'hIngresoTA', width: 14 },
  { header: 'H. SALIDA T.A', key: 'hSalidaTA', width: 14 },
  { header: 'H. LLEG. CLIENTE', key: 'hLlegCliente', width: 14 },
  { header: 'H. SAL. CLIENTE', key: 'hSalCliente', width: 14 },
  { header: 'STATUS', key: 'status', width: 40 },
]

export function buildCroslandRow(task: ExportTask, ctx: ProgresoCtx, n: number) {
  return {
    n,
    placa: m2oLast6(task.x_studio_placa),
    carreta: m2oLast6(task.x_studio_placa_carreta),
    soat: '', // no se registra en el sistema — se llena a mano
    conductor: caps(m2oFull(task.x_studio_conductor)),
    contenedor: task.x_studio_nmero_de_contenedor || '',
    precinto: '', // no se registra en el sistema — se llena a mano
    hLlegadaTA: hitoTime(task, 'llegada_cola_retiro'),
    hIngresoTA: hitoTime(task, 'ingreso_almacen_retiro'),
    hSalidaTA: hitoTime(task, 'salida_almacen_retiro'),
    hLlegCliente: hitoTime(task, 'llegada_cliente'),
    hSalCliente: hitoTime(task, 'salida_cliente'),
    status: estadoNarrativo(task, ctx),
  }
}

export type ExportClientFormat = 'quimtia' | 'eym' | 'crosland'

export const EXPORT_FORMATS: Record<ExportClientFormat, { label: string; matchClient: (partnerName: string) => boolean }> = {
  quimtia: { label: 'QUIMTIA', matchClient: (n) => n.toUpperCase().includes('QUIMTIA') },
  eym: { label: 'E & M', matchClient: (n) => n.toUpperCase().includes('E & M') || n.toUpperCase().includes('E&M') },
  crosland: { label: 'CROSLAND', matchClient: (n) => n.toUpperCase().includes('CROSLAND') },
}
