// ============================================================================
// Sobrecostos por estadía (solo cliente QUIMTIA).
//
// Reglas (definidas por operaciones):
//  - Despacho y Recojo vienen de Odoo con el mismo tipo (x_studio_es_despacho).
//    Se distinguen por el almacén de retiro: si es un CD de QUIMTIA (Lurín
//    Eucaliptos o Callao) es Despacho; cualquier otro es Recojo.
//  - Despacho:          desde "Llegada destino" hasta "Salida destino".
//  - Recojo:            desde "Llegada a punto de carga" hasta "Salida origen".
//  - Importación:       desde "Llegada a cliente" hasta "Salida de cliente".
//  - Exportación:       tramo 1 "Llegada a cliente" → "Salida de cliente"
//                       + tramo 2 "Ingreso terminal/almacén destino" →
//                       "Entrega contenedor lleno".
//  - Las primeras 5 horas (sumando los tramos) son libres; desde las 5 h se
//    genera alerta y todo lo que pase de ahí es tiempo con sobrecosto.
//
// El monto en soles NO se calcula acá: lo completa a mano quien revisa el
// Excel. Este módulo solo mide tiempos.
//
// Los hitos de Odoo son floats de hora del día (ej. 13.5 = 13:30) sin fecha:
// si el fin es menor que el inicio se asume que cruzó la medianoche.
// ============================================================================

import { detectTipoServicio, getHitosForTask, type TaskTypeFlags } from './hitos'

export const HORAS_LIBRES = 5
const MIN_LIBRES = HORAS_LIBRES * 60

export interface SobrecostoTask extends TaskTypeFlags {
  id: number
  name: string
  partner_id: [number, string] | false
  x_studio_fecha_de_la_programacin: string | false
  [key: string]: unknown
}

export type TipoSobrecosto = 'despacho' | 'recojo' | 'importacion' | 'exportacion'

/** Dónde ocurre el tramo — define el nombre del sitio en el Excel */
export type LugarTramo = 'retiro' | 'destino' | 'cliente'

export interface Tramo {
  label: string
  lugar: LugarTramo
  inicioLabel: string
  finLabel: string
  /** Minutos desde la medianoche del día de programación (fin puede pasar de 1440) */
  inicio: number | null
  fin: number | null
  /** Duración en minutos; null si falta el inicio. Si está en curso, se mide hasta `ahora`. */
  minutos: number | null
  enCurso: boolean
}

export interface SobrecostoInfo {
  tipo: TipoSobrecosto
  tramos: Tramo[]
  totalMin: number
  excesoMin: number
  /** Alcanzó las 5 h (aunque el servicio siga en curso) */
  alerta: boolean
  enCurso: boolean
  /** Todos los tramos tienen inicio y fin */
  completo: boolean
}

const REGLAS: Record<TipoSobrecosto, { label: string; lugar: LugarTramo; inicio: string; fin: string; inicioLabel: string; finLabel: string }[]> = {
  despacho: [
    { label: 'Destino', lugar: 'destino', inicio: 'llegada_destino', fin: 'salida_destino', inicioLabel: 'Llegada', finLabel: 'Salida' },
  ],
  recojo: [
    { label: 'Punto de carga', lugar: 'retiro', inicio: 'llegada_punto_carga', fin: 'salida_origen', inicioLabel: 'Llegada', finLabel: 'Salida' },
  ],
  importacion: [
    { label: 'Cliente', lugar: 'destino', inicio: 'llegada_cliente', fin: 'salida_cliente', inicioLabel: 'Llegada', finLabel: 'Salida' },
  ],
  exportacion: [
    { label: 'Cliente', lugar: 'cliente', inicio: 'llegada_cliente', fin: 'salida_cliente', inicioLabel: 'Llegada', finLabel: 'Salida' },
    { label: 'Almacén destino', lugar: 'destino', inicio: 'ingreso_terminal_destino', fin: 'entrega_contenedor_lleno', inicioLabel: 'Ingreso', finLabel: 'Fin' },
  ],
}

export function esQuimtia(task: { partner_id: [number, string] | false }): boolean {
  return !!task.partner_id && task.partner_id[1].toUpperCase().includes('QUIMTIA')
}

/** Almacenes de retiro propios de QUIMTIA: si el servicio sale de uno de
 * estos es un Despacho; si sale de cualquier otro sitio es un Recojo. */
const ALMACENES_DESPACHO = [
  'QUIMTIA S.A., Quimtia CD Lurín Eucaliptos',
  'QUIMTIA S.A., Quimtia CD Callao',
].map(normalizar)

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

export function tipoSobrecosto(task: TaskTypeFlags & { x_studio_almacen_de_retiro?: unknown }): TipoSobrecosto | null {
  const tipo = detectTipoServicio(task)
  if (tipo === 'despacho') {
    const retiro = task.x_studio_almacen_de_retiro
    const nombre = Array.isArray(retiro) && typeof retiro[1] === 'string' ? normalizar(retiro[1]) : ''
    return ALMACENES_DESPACHO.includes(nombre) ? 'despacho' : 'recojo'
  }
  return tipo === 'importacion' || tipo === 'exportacion' ? tipo : null
}

/** "S01152 - Servicio de transporte (Importación, Contenedor 20, IMO, Zona 1)"
 * → "IMO". Las subtareas no lo traen en su nombre: se toma del servicio padre. */
export function tipoCargaSobrecosto(task: { name: string; parent_id?: unknown }): string {
  const fromName = (name: string) => {
    const m = name.match(/\(([^()]*,[^()]*,[^()]*)\)/)
    return m?.[1].split(',')[2]?.trim() || ''
  }
  const parent = task.parent_id
  return fromName(task.name) || (Array.isArray(parent) && typeof parent[1] === 'string' ? fromName(parent[1]) : '')
}

function horaMin(task: SobrecostoTask, key: string): number | null {
  const hito = getHitosForTask(task).find(h => h.key === key)
  if (!hito) return null
  const v = task[hito.field]
  if (typeof v !== 'number' || v === 0) return null
  return Math.round(v * 60)
}

/** Minutos transcurridos hoy, solo si el servicio está programado para hoy. */
function ahoraMin(fecha: string | false, now: Date): number | null {
  if (!fecha) return null
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return fecha === hoy ? now.getHours() * 60 + now.getMinutes() : null
}

export function calcularSobrecosto(task: SobrecostoTask, now = new Date()): SobrecostoInfo | null {
  const tipo = tipoSobrecosto(task)
  if (!tipo) return null

  const ahora = ahoraMin(task.x_studio_fecha_de_la_programacin, now)
  let base = 0 // fin del tramo anterior: el siguiente tramo no puede empezar antes (cruce de medianoche)
  const tramos: Tramo[] = REGLAS[tipo].map((r) => {
    let inicio = horaMin(task, r.inicio)
    let fin = horaMin(task, r.fin)
    if (inicio !== null) {
      while (inicio < base) inicio += 1440
    }
    if (inicio !== null && fin !== null) {
      while (fin < inicio) fin += 1440
      base = fin
    }
    const enCurso = inicio !== null && fin === null && ahora !== null && ahora >= inicio
    const minutos = inicio === null ? null : fin !== null ? fin - inicio : enCurso ? ahora! - inicio : null
    return { label: r.label, lugar: r.lugar, inicioLabel: r.inicioLabel, finLabel: r.finLabel, inicio, fin, minutos, enCurso }
  })

  const totalMin = tramos.reduce((s, t) => s + (t.minutos ?? 0), 0)
  return {
    tipo,
    tramos,
    totalMin,
    excesoMin: Math.max(0, totalMin - MIN_LIBRES),
    alerta: totalMin >= MIN_LIBRES,
    enCurso: tramos.some(t => t.enCurso),
    completo: tramos.every(t => t.inicio !== null && t.fin !== null),
  }
}

// ── Formatos ────────────────────────────────────────────────────────────

/** 161 → "02 hrs. 41 min" · 51 → "51 min" */
export function formatDuracion(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return `${String(h).padStart(2, '0')} hrs. ${String(m).padStart(2, '0')} min`
}

/** 1007 → "16:47" (minutos del día, ignora días extra) */
export function formatHoraMin(min: number | null): string {
  if (min === null) return ''
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** "2026-09-25" + 1007 → "25/09/2026 04:47 p.m." (suma el día si pasó la medianoche) */
export function formatFechaHora(fecha: string | false, min: number | null): string {
  if (!fecha || min === null) return ''
  const [y, mo, d] = fecha.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  dt.setDate(dt.getDate() + Math.floor(min / 1440))
  const m = ((min % 1440) + 1440) % 1440
  const h24 = Math.floor(m / 60)
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const ampm = h24 < 12 ? 'a.m.' : 'p.m.'
  const dd = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
  return `${dd} ${String(h12).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} ${ampm}`
}

// ── Semana (lunes a sábado) ─────────────────────────────────────────────

export function lunesDe(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = r.getDay()
  r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow))
  return r
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function rangoSemana(lunes: Date): { start: string; end: string } {
  const sabado = new Date(lunes)
  sabado.setDate(lunes.getDate() + 5)
  return { start: toDateStr(lunes), end: toDateStr(sabado) }
}
