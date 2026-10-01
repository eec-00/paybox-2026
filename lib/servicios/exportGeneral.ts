// ============================================================================
// Exportación general/personalizada de Servicios (panel admin → Trailers).
//
// A diferencia de exportFormats.ts (una plantilla fija por cliente), acá el
// usuario arma el Excel: rango de fechas (hoy, semana, mes, personalizado),
// filtros (conductor, cliente, tipo, etapa, progreso), qué columnas incluir y
// cómo separarlo (una sola hoja, o una hoja por conductor/cliente/semana/día
// con una hoja "Resumen" al inicio).
// ============================================================================

import { getHitosForTask, tipoServicioLabelFor } from './hitos'
import { calcularProgreso, ultimoHitoMarcado } from './progreso'
import { estadoNarrativo, type ExportTask, type ProgresoCtx } from './exportFormats'

export interface GeneralExportTask extends ExportTask {
  stage_id: [number, string] | false
  parent_id?: [number, string] | false
}

// ── Fechas ──────────────────────────────────────────────────────────────

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatFecha(value: string | false): string {
  if (!value) return ''
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function formatHora(value: unknown): string {
  if (typeof value !== 'number' || value === 0) return ''
  const hours = Math.floor(value)
  const minutes = Math.round((value - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** Lunes de la semana (lunes a domingo) que contiene la fecha. */
function mondayOf(d: Date): Date {
  const dow = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return monday
}

export type RangePreset = 'hoy' | 'ayer' | 'semana' | 'semana_pasada' | 'mes' | 'mes_pasado' | 'custom'

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'ayer', label: 'Ayer' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'semana_pasada', label: 'Semana pasada' },
  { value: 'mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Mes pasado' },
  { value: 'custom', label: 'Personalizado' },
]

export function rangeForPreset(preset: RangePreset, custom: { start: string; end: string }): { start: string; end: string } {
  const now = new Date()
  switch (preset) {
    case 'hoy': {
      const t = toDateStr(now)
      return { start: t, end: t }
    }
    case 'ayer': {
      const y = new Date(now)
      y.setDate(now.getDate() - 1)
      const t = toDateStr(y)
      return { start: t, end: t }
    }
    case 'semana':
    case 'semana_pasada': {
      const monday = mondayOf(now)
      if (preset === 'semana_pasada') monday.setDate(monday.getDate() - 7)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      return { start: toDateStr(monday), end: toDateStr(sunday) }
    }
    case 'mes':
      return {
        start: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      }
    case 'mes_pasado':
      return {
        start: toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: toDateStr(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    default:
      return custom
  }
}

/** "Semana 29/09 – 05/10/2026" (lunes a domingo) — misma etiqueta para todos
 * los servicios de esa semana, y ordenable por la fecha del lunes. */
function semanaDe(fecha: string): { key: string; label: string } {
  const monday = mondayOf(parseDate(fecha))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return { key: toDateStr(monday), label: `Semana ${dm(monday)} – ${dm(sunday)}/${sunday.getFullYear()}` }
}

// ── Datos auxiliares ────────────────────────────────────────────────────

function m2o(val: unknown): string {
  return Array.isArray(val) ? String(val[1] ?? '') : ''
}

function placaLast6(val: unknown): string {
  return m2o(val).slice(-6).trim()
}

export function servicioCodigo(t: GeneralExportTask): string {
  const nameSource = t.parent_id ? t.parent_id[1] : t.name
  return nameSource.includes(' - ') ? nameSource.split(' - ')[0] : nameSource
}

const PROGRESO_LABEL = { sin_iniciar: 'Sin iniciar', en_proceso: 'En proceso', completado: 'Acabada' } as const

/** Hora marcada del primer hito (de la cola de este servicio) cuya key esté
 * en `keys` — así una sola columna cubre "Inicio carga" e "Inicio descarga". */
function horaHito(t: GeneralExportTask, keys: string[]): string {
  const hito = getHitosForTask(t).find((h) => keys.includes(h.key))
  return hito ? formatHora(t[hito.field]) : ''
}

// ── Columnas ────────────────────────────────────────────────────────────

export interface GeneralColumn {
  key: string
  header: string
  width: number
  /** Agrupa las columnas en el selector del diálogo */
  section: 'general' | 'operativa' | 'horas'
  value: (t: GeneralExportTask, ctx: ProgresoCtx) => string
}

export const GENERAL_COLUMNS: GeneralColumn[] = [
  { key: 'codigo', header: 'CÓDIGO', width: 12, section: 'general', value: (t) => servicioCodigo(t) },
  { key: 'fecha', header: 'F. PROGRAMACIÓN', width: 15, section: 'general', value: (t) => formatFecha(t.x_studio_fecha_de_la_programacin) },
  { key: 'semana', header: 'SEMANA', width: 26, section: 'general', value: (t) => (t.x_studio_fecha_de_la_programacin ? semanaDe(t.x_studio_fecha_de_la_programacin).label : '') },
  { key: 'horaCita', header: 'HORA CITA', width: 11, section: 'general', value: (t) => formatHora(t.x_studio_hora_de_cita) },
  { key: 'cliente', header: 'CLIENTE', width: 28, section: 'general', value: (t) => m2o(t.partner_id) },
  { key: 'tipo', header: 'TIPO DE SERVICIO', width: 26, section: 'general', value: (t) => tipoServicioLabelFor(t) },
  { key: 'etapa', header: 'ETAPA', width: 20, section: 'general', value: (t) => m2o(t.stage_id) },
  { key: 'progreso', header: 'PROGRESO', width: 13, section: 'general', value: (t, ctx) => PROGRESO_LABEL[calcularProgreso(t, ctx.progresoMap, ctx.completadosSet).estado] },
  { key: 'fase', header: 'FASE', width: 30, section: 'general', value: (t, ctx) => ultimoHitoMarcado(t, ctx.progresoMap, ctx.completadosSet) ?? '' },
  { key: 'status', header: 'STATUS', width: 40, section: 'general', value: (t, ctx) => estadoNarrativo(t, ctx) },

  { key: 'conductor', header: 'CONDUCTOR', width: 28, section: 'operativa', value: (t) => m2o(t.x_studio_conductor) },
  { key: 'placa', header: 'PLACA CAMIÓN', width: 13, section: 'operativa', value: (t) => placaLast6(t.x_studio_placa) },
  { key: 'carreta', header: 'PLACA CARRETA', width: 13, section: 'operativa', value: (t) => placaLast6(t.x_studio_placa_carreta) },
  { key: 'referencia', header: 'REF / BOOKING', width: 20, section: 'operativa', value: (t) => t.x_studio_referenciabooking || '' },
  { key: 'agencia', header: 'AGENCIA', width: 16, section: 'operativa', value: (t) => t.x_studio_agencia || '' },
  { key: 'contenedor', header: 'N° CONTENEDOR', width: 16, section: 'operativa', value: (t) => t.x_studio_nmero_de_contenedor || '' },
  { key: 'almacenRetiro', header: 'ALMACÉN RETIRO', width: 30, section: 'operativa', value: (t) => m2o(t.x_studio_almacen_de_retiro) },
  { key: 'almacenDestino', header: 'ALMACÉN DESTINO', width: 30, section: 'operativa', value: (t) => m2o(t.x_studio_almacen_de_destino) },

  { key: 'hInicioRuta', header: 'H. INICIO RUTA', width: 13, section: 'horas', value: (t) => horaHito(t, ['inicio_ruta']) },
  { key: 'hLlegadaRetiro', header: 'H. LLEGADA RETIRO', width: 15, section: 'horas', value: (t) => horaHito(t, ['llegada_cola_retiro', 'llegada_retiro', 'llegada_punto_carga', 'llegada_punto_a', 'en_cola_ingreso']) },
  { key: 'hSalidaRetiro', header: 'H. SALIDA RETIRO', width: 15, section: 'horas', value: (t) => horaHito(t, ['salida_almacen_retiro', 'salida_retiro', 'salida_origen', 'salida_punto_a', 'salida_almacen']) },
  { key: 'hLlegadaCliente', header: 'H. LLEGADA CLIENTE', width: 16, section: 'horas', value: (t) => horaHito(t, ['llegada_cliente', 'llegada_destino', 'llegada_punto_b']) },
  { key: 'hInicioCD', header: 'H. INICIO CARGA/DESC.', width: 18, section: 'horas', value: (t) => horaHito(t, ['inicio_descarga', 'inicio_carga', 'inicio_descarga_entrega', 'inicio_operacion_b', 'inicio_cd']) },
  { key: 'hFinCD', header: 'H. FIN CARGA/DESC.', width: 17, section: 'horas', value: (t) => horaHito(t, ['fin_descarga', 'fin_carga', 'fin_descarga_entrega', 'fin_operacion_b', 'fin_cd']) },
  { key: 'hSalidaCliente', header: 'H. SALIDA CLIENTE', width: 15, section: 'horas', value: (t) => horaHito(t, ['salida_cliente', 'salida_destino']) },
  { key: 'hFinalizado', header: 'H. FINALIZADO', width: 13, section: 'horas', value: (t) => horaHito(t, ['servicio_finalizado', 'contenedor_dejado_cochera']) },
]

export const DEFAULT_GENERAL_COLUMNS = [
  'codigo', 'fecha', 'horaCita', 'cliente', 'tipo', 'etapa', 'progreso', 'status',
  'conductor', 'placa', 'contenedor', 'almacenRetiro', 'almacenDestino',
]

// ── Agrupación ──────────────────────────────────────────────────────────

export type GroupBy = 'ninguno' | 'conductor' | 'cliente' | 'semana' | 'dia' | 'tipo'

export const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'ninguno', label: 'Una sola hoja' },
  { value: 'conductor', label: 'Por conductor' },
  { value: 'cliente', label: 'Por cliente' },
  { value: 'semana', label: 'Por semana' },
  { value: 'dia', label: 'Por día' },
  { value: 'tipo', label: 'Por tipo de servicio' },
]

/** { key para ordenar, nombre visible } del grupo al que pertenece el servicio */
export function groupOf(t: GeneralExportTask, by: GroupBy): { key: string; label: string } {
  switch (by) {
    case 'conductor': {
      const n = m2o(t.x_studio_conductor) || 'Sin conductor'
      return { key: n, label: n }
    }
    case 'cliente': {
      const n = m2o(t.partner_id) || 'Sin cliente'
      return { key: n, label: n }
    }
    case 'semana':
      return t.x_studio_fecha_de_la_programacin ? semanaDe(t.x_studio_fecha_de_la_programacin) : { key: '~', label: 'Sin fecha' }
    case 'dia':
      return t.x_studio_fecha_de_la_programacin
        ? { key: t.x_studio_fecha_de_la_programacin, label: formatFecha(t.x_studio_fecha_de_la_programacin) }
        : { key: '~', label: 'Sin fecha' }
    case 'tipo': {
      const n = tipoServicioLabelFor(t)
      return { key: n, label: n }
    }
    default:
      return { key: '', label: 'Servicios' }
  }
}

/** Nombre de hoja válido para Excel (máx. 31 caracteres, sin : \ / ? * [ ])
 * y único dentro del libro. */
export function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31).trim() || 'Hoja'
  let candidate = base
  let i = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
  }
  used.add(candidate.toLowerCase())
  return candidate
}
