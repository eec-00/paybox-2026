// ============================================================================
// Motor de pago a conductores por tramo y lugar físico (módulo Pruebas).
//
// Funciones puras para demo y pruebas T-xx / HIST: NO se conecta a pantallas,
// pagos ni Odoo, y no reemplaza a pagosConductores.ts / adicionalesConductores.ts.
// Corrige en prototipo RF-040 (zona comercial), RF-041 (fecha programada en el
// retorno) y RF-042 (A integral + B sin repartir).
//
// Toda línea es 'simulado' o 'revision'. Una línea en revisión nunca tiene
// importe (ni S/0): falta un dato o una decisión, no significa que no se deba.
// ============================================================================

import { fechaUTC, sumarDias } from '@/lib/fechas'
import { concepto } from './glosarioConductores'
import { esPuerto } from './adicionalesConductores'

export type EstadoLinea = 'simulado' | 'revision'
export type TipoTramo = 'principal' | 'retorno'

export interface LineaPago {
  servicio: string
  tramo: TipoTramo | 'servicio'
  conductorId: number | null
  concepto: string
  monto: number | null
  /** Fecha real ejecutada (YYYY-MM-DD); define la semana */
  fecha: string | null
  /** Sábado que abre la semana de pago */
  semana: string | null
  estado: EstadoLinea
  motivo: string | null
}

export interface Tramo {
  servicio: string
  tipo: TipoTramo
  conductorId: number | null
  /** Ejecución real del tramo, nunca la programada del padre */
  fechaEjecucion: string | null
  acreditado: boolean
  almacen?: string | null
  extraordinario?: boolean
}

// ── Semana ──────────────────────────────────────────────────────────────

/** Sábado que abre la semana de pago (sábado a viernes) de una fecha. */
export function inicioSemanaPago(fecha: string): string {
  return sumarDias(fecha, -((fechaUTC(fecha).getUTCDay() + 1) % 7))
}

function linea(
  base: Pick<LineaPago, 'servicio' | 'tramo' | 'conductorId' | 'concepto' | 'fecha'>,
  monto: number,
): LineaPago {
  return {
    ...base, monto, estado: 'simulado', motivo: null,
    semana: base.fecha ? inicioSemanaPago(base.fecha) : null,
  }
}

function revision(
  base: Pick<LineaPago, 'servicio' | 'tramo' | 'conductorId' | 'concepto' | 'fecha'>,
  motivo: string,
): LineaPago {
  return {
    ...base, monto: null, estado: 'revision', motivo,
    semana: base.fecha ? inicioSemanaPago(base.fecha) : null,
  }
}

// ── Lugar físico y tarifa ───────────────────────────────────────────────

export type Operacion = 'importacion' | 'exportacion'
export type RolSitio = 'entrega_cargado' | 'recojo_cargado' | 'deposito_vacio' | 'puerto'

export interface SitioServicio {
  rol: RolSitio
  nombre: string
  direccion: string | null
  verificado: boolean
  /** Ruta física de tarifa asignada a esa dirección */
  ruta: string | null
  /** Etiqueta comercial de Odoo: se conserva, nunca decide la tarifa */
  zonaComercial?: string | null
}

export type ResultadoSitio =
  | { ok: true; sitio: SitioServicio; ruta: string }
  | { ok: false; motivo: string }

const ROL_TARIFA: Record<Operacion, RolSitio> = {
  importacion: 'entrega_cargado',
  exportacion: 'recojo_cargado',
}

/** RF-002/003/004: sitio que define la tarifa. Lo dudoso no se infiere. */
export function determinarSitioTarifa(operacion: Operacion, sitios: SitioServicio[]): ResultadoSitio {
  const candidatos = sitios.filter(s => s.rol === ROL_TARIFA[operacion])
  if (candidatos.length === 0) return { ok: false, motivo: 'Sin lugar físico cargado' }
  if (candidatos.length > 1) return { ok: false, motivo: 'Más de un lugar físico cargado: dirección ambigua' }
  const [sitio] = candidatos
  if (!sitio.verificado || !sitio.direccion || !sitio.ruta) {
    return { ok: false, motivo: 'Dirección física sin verificar' }
  }
  return { ok: true, sitio, ruta: sitio.ruta }
}

export type NivelTarifa = 'cliente_ruta' | 'ruta' | 'ordinaria'

export interface ReglaTarifa {
  id: string
  nivel: NivelTarifa
  /** Requerido en 'cliente_ruta'; ID estable, no nombre libre */
  clienteId?: number
  ruta: string
  operacion: Operacion
  tipoCarga: string
  monto: number
  desde: string
  /** Último día vigente; null si sigue */
  hasta: string | null
  /** Aprobada por Margiory/Rosario. Una moda histórica nunca lo es */
  aprobada: boolean
}

export interface ConsultaTarifa {
  clienteId: number
  ruta: string
  operacion: Operacion
  tipoCarga: string
  fecha: string
}

export type ResultadoTarifa =
  | { estado: 'simulado'; monto: number; regla: ReglaTarifa }
  | { estado: 'revision'; monto: null; motivo: string }

const ORDEN_NIVEL: NivelTarifa[] = ['cliente_ruta', 'ruta', 'ordinaria']

/** RF-005: cliente + ruta > ruta especial > ordinaria, con vigencia por fecha. */
export function resolverTarifa(c: ConsultaTarifa, tarifario: ReglaTarifa[]): ResultadoTarifa {
  const aplicables = tarifario.filter(r =>
    r.ruta === c.ruta && r.operacion === c.operacion && r.tipoCarga === c.tipoCarga
    && r.desde <= c.fecha && (r.hasta === null || c.fecha <= r.hasta)
    && (r.nivel !== 'cliente_ruta' || r.clienteId === c.clienteId))

  for (const nivel of ORDEN_NIVEL) {
    const delNivel = aplicables.filter(r => r.nivel === nivel)
    if (delNivel.length > 1) return { estado: 'revision', monto: null, motivo: `Tarifas en conflicto (${delNivel.map(r => r.id).join(', ')})` }
    if (delNivel.length === 1) {
      const [regla] = delNivel
      if (!regla.aprobada) return { estado: 'revision', monto: null, motivo: `Tarifa ${regla.id} sin aprobar` }
      return { estado: 'simulado', monto: regla.monto, regla }
    }
  }
  return { estado: 'revision', monto: null, motivo: 'Sin tarifa vigente para esa fecha, cliente, ruta y carga' }
}

// ── Crosland ────────────────────────────────────────────────────────────

const MONTO_RETORNO_PUERTO = 30

function aptoParaPago(t: Tramo): boolean {
  return t.acreditado && t.conductorId !== null && t.fechaEjecucion !== null
}

/**
 * RF-006/007/008/009/036: reparte un servicio Crosland entre quienes
 * ejecutaron cada tramo. Nunca paga A integral + B, ni un segundo retorno a A.
 */
export function liquidarCrosland(principal: Tramo, retorno: Tramo | null): LineaPago[] {
  const basePrincipal = {
    servicio: principal.servicio, tramo: 'principal' as const,
    conductorId: principal.conductorId, fecha: principal.fechaEjecucion,
  }
  if (!aptoParaPago(principal)) {
    return [revision({ ...basePrincipal, concepto: 'crosland_principal' }, 'Tramo principal sin acreditar')]
  }
  if (!retorno || !aptoParaPago(retorno)) {
    return [revision({ ...basePrincipal, concepto: 'crosland_principal' }, 'Retorno sin acreditar: no se sabe si es integral o reparto')]
  }

  if (principal.conductorId === retorno.conductorId) {
    return [linea({ ...basePrincipal, concepto: 'crosland_integral' }, concepto('crosland_integral').monto!)]
  }

  const lineaA = linea({ ...basePrincipal, concepto: 'crosland_principal' }, concepto('crosland_principal').monto!)
  const baseB = {
    servicio: retorno.servicio, tramo: 'retorno' as const, conductorId: retorno.conductorId,
    concepto: 'crosland_retorno', fecha: retorno.fechaEjecucion,
  }
  if (!retorno.almacen) return [lineaA, revision(baseB, 'Depósito de devolución sin verificar')]
  if (retorno.extraordinario) return [lineaA, revision(baseB, 'Retorno extraordinario por otro conductor: condiciones por validar')]

  return [lineaA, linea(baseB, esPuerto(retorno.almacen) ? MONTO_RETORNO_PUERTO : concepto('crosland_retorno').monto!)]
}

// ── Adicionales ─────────────────────────────────────────────────────────

const MIN_17 = 17 * 60
const MIN_2130 = 21 * 60 + 30
const MIN_23 = 23 * 60

export interface ContextoAdicional {
  servicio: string
  conductorId: number
  fecha: string
}

function baseAdicional(c: ContextoAdicional, codigo: string) {
  return { servicio: c.servicio, tramo: 'servicio' as const, conductorId: c.conductorId, concepto: codigo, fecha: c.fecha }
}

/** C02/RF-034: un solo S/30. Manda la cita de devolución, no la llegada. */
export function evaluarCenaSsee(
  c: ContextoAdicional,
  ev: { citaDevolucion: number | null; i11: boolean; eir: boolean },
): LineaPago {
  const base = baseAdicional(c, 'cena_ssee')
  if (ev.citaDevolucion === null || !ev.i11 || !ev.eir) return revision(base, 'Falta cita, I11 o EIR')
  if (ev.citaDevolucion < MIN_17) return revision(base, 'Cita de devolución antes de las 17:00')
  return linea(base, concepto('cena_ssee').monto!)
}

/** C03/RF-035: solo el caso 21:30 → 23:00 está confirmado; no fija un umbral. */
export function evaluarNocturnoCrosland(
  c: ContextoAdicional,
  ev: { finDescarga: number | null; finDevolucion: number | null; conCenaSsee: boolean },
): LineaPago {
  const base = baseAdicional(c, 'crosland_nocturno')
  if (ev.conCenaSsee) return revision(base, 'No asumir dos S/30 con la Cena SSEE')
  if (ev.finDescarga === MIN_2130 && ev.finDevolucion === MIN_23) return linea(base, concepto('crosland_nocturno').monto!)
  return revision(base, 'Regla general C03 sin cerrar')
}

/** Conceptos bloqueados: C01, C06, C07, 03:00, pernocte y viático. */
export function conceptoEnRevision(c: ContextoAdicional, codigo: string): LineaPago {
  const def = concepto(codigo)
  if (def.activacion !== 'revision') throw new Error(`${codigo} no está bloqueado`)
  return revision(baseAdicional(c, codigo), `${def.cierre ?? def.nombre}: ${def.estadoFuente}`)
}

export interface DiaMaquina {
  fecha: string
  asistencia: boolean
  servicio: boolean
  mantenimiento?: boolean
  evidenciaDudosa?: boolean
}

const TOPE_MAQUINA = 30

/** C05/RF-037: S/5 por día con asistencia y servicio, máximo S/30 por semana. */
export function calcularMaquina(servicio: string, conductorId: number, dias: DiaMaquina[]): LineaPago[] {
  const fecha = dias[0]?.fecha ?? null
  if (!fecha) return []
  const base = { servicio, tramo: 'servicio' as const, conductorId, concepto: 'maquina', fecha }

  const dudosos = dias.filter(d => d.evidenciaDudosa)
  if (dudosos.length) return [revision(base, `Evidencia por revisar: ${dudosos.map(d => d.fecha).join(', ')}`)]

  const validos = new Set(dias.filter(d => d.asistencia && d.servicio && !d.mantenimiento).map(d => d.fecha))
  if (validos.size === 0) return []
  return [linea(base, Math.min(validos.size * concepto('maquina').monto!, TOPE_MAQUINA))]
}

// ── Consolidado ─────────────────────────────────────────────────────────

/** RF-001: un tramo admite una sola línea por conductor y concepto. */
export function lineasDuplicadas(lineas: LineaPago[]): string[] {
  const vistas = new Set<string>()
  const dup: string[] = []
  for (const l of lineas) {
    const clave = [l.servicio, l.tramo, l.conductorId, l.concepto].join('|')
    if (vistas.has(clave)) dup.push(clave)
    vistas.add(clave)
  }
  return dup
}

export interface ResumenSemana {
  conductorId: number
  semana: string
  simulado: number
  enRevision: number
}

/** RF-023: lo que va a revisión no bloquea las líneas correctas. */
export function resumirSemanas(lineas: LineaPago[]): ResumenSemana[] {
  const dup = lineasDuplicadas(lineas)
  if (dup.length) throw new Error(`Líneas duplicadas: ${dup.join(', ')}`)

  const grupos = new Map<string, ResumenSemana>()
  for (const l of lineas) {
    if (l.conductorId === null || l.semana === null) continue
    const clave = `${l.conductorId}|${l.semana}`
    const g = grupos.get(clave) ?? { conductorId: l.conductorId, semana: l.semana, simulado: 0, enRevision: 0 }
    if (l.estado === 'simulado') g.simulado += l.monto!
    else g.enRevision += 1
    grupos.set(clave, g)
  }
  return Array.from(grupos.values())
}

// ── Contraste con históricos de Rosario ─────────────────────────────────

export type ClaseHistorica =
  | 'cuadra'
  | 'base_no_numerica'
  | 'texto_no_sumado'
  | 'texto_sumado'
  | 'descuadre'

export interface FilaHistorica {
  hoja: string
  fila: number
  fecha: string | null
  /** Tal cual en el Excel: nunca se reemplaza por lo interpretado */
  anotacion: string | number | null
  base: number | null
  total: number | null
  /** Corte del archivo y mes-año que cubre la hoja (YYYY-MM) */
  corte: string
  mesHoja: string
}

export interface ClasificacionHistorica {
  origen: string
  anotacionOriginal: string | number | null
  componentes: number[]
  clase: ClaseHistorica
  diferencia: number | null
  alertas: string[]
  /** Siempre true salvo que cuadre: la clasificación jamás genera un pago */
  requiereRevision: boolean
}

/** Cifras de una anotación libre ('30 CENA SSEE', '20 + 30'). Solo sugerencia. */
export function componentesAnotacion(anotacion: string | number | null): number[] {
  if (anotacion === null || anotacion === '') return []
  if (typeof anotacion === 'number') return [anotacion]
  return (anotacion.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
}

export function clasificarFilaHistorica(f: FilaHistorica): ClasificacionHistorica {
  const componentes = componentesAnotacion(f.anotacion)
  const suma = componentes.reduce((s, n) => s + n, 0)
  const esTexto = typeof f.anotacion === 'string' && f.anotacion !== ''
  const diferencia = f.base === null || f.total === null ? null : f.total - f.base

  const alertas: string[] = []
  if (f.fecha && f.fecha > f.corte) alertas.push('Fecha posterior al corte')
  if (f.fecha && f.fecha.slice(0, 7) !== f.mesHoja) alertas.push('Fecha fuera del mes de la hoja')
  if (componentes.length > 1) alertas.push('Varias cifras: posible acumulación incompatible')

  let clase: ClaseHistorica
  if (diferencia === null) clase = 'base_no_numerica'
  else if (diferencia === suma) clase = esTexto ? 'texto_sumado' : 'cuadra'
  else if (esTexto && diferencia === 0) clase = 'texto_no_sumado'
  else clase = 'descuadre'

  return {
    origen: `${f.hoja}!${f.fila}`,
    anotacionOriginal: f.anotacion,
    componentes,
    clase,
    diferencia,
    alertas,
    requiereRevision: clase !== 'cuadra' || alertas.length > 0,
  }
}
