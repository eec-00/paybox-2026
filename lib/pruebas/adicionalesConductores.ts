// ============================================================================
// Adicionales del pago a conductores (módulo Pruebas), según la tabla de
// operaciones. Se calculan solo los que salen de datos que ya existen
// (hora de cita, horarios que el conductor marca en la app, cliente, zona y
// subtareas de devolución):
//
//   Programación 03:00   S/ 20  cita entre 03:00 y 03:29 y salida de cochera
//                               registrada. No acumulable con amanecida.
//   Bono                 S/ 100 8+ servicios integrales finalizados en la
//                               semana (sin traslados internos, provincia ni
//                               importaciones con devolución a cargo de otro)
//                               y sin importaciones propias pendientes.
//   Cena                 S/ 20  unidad aún en servicio después de las 19:00.
//                        S/ 30  primer servicio del día, iniciado hasta las
//                               06:00, con devolución desde las 17:00 (y
//                               antes de las 06:00 del día siguiente).
//                               Una cena por día (la mayor).
//   Amanecida CROSLAND   S/ 30  servicio CROSLAND que termina después de las 22:00.
//                        S/ 50  ... después de las 00:00. Una por día (la mayor).
//   Devolución de vacío  S/ 20  devolución de un servicio de otro compañero.
//                        S/ 30  ... si la devolución es en puerto (DPW/APMT).
//   Viático              S/ 35  servicio en Provincia: se lista "por validar"
//                               (requiere autorización previa y no aplica a
//                               Chancay) y no suma al total.
//
// No automáticos (no hay dato en el sistema): Máquina, Amanecida por
// permanencia en planta (S/ 40) y Otros adicionales.
//
// Horarios: minutos desde la medianoche del día de programación (> 1440 =
// días después). La fecha de cada hito es la real cuando el conductor lo
// marcó con ubicación, o estimada si no (ver lib/servicios/fechasHitos.ts).
// ============================================================================

import { servicioCodigo, type ServicioPago, type DevolucionPago } from './pagosConductores'

export type ConceptoAdicional =
  | 'programacion_0300'
  | 'bono'
  | 'cena'
  | 'amanecida'
  | 'devolucion_vacio'
  | 'viatico'

export const CONCEPTO_LABEL: Record<ConceptoAdicional, string> = {
  programacion_0300: 'Programación 03:00',
  bono: 'Bono semanal',
  cena: 'Cena',
  amanecida: 'Amanecida',
  devolucion_vacio: 'Devolución de contenedor vacío',
  viatico: 'Viático',
}

export interface Adicional {
  concepto: ConceptoAdicional
  monto: number
  /** Fecha de programación (vacío para el bono semanal) */
  fecha: string | null
  servicio: string | null
  detalle: string
  /** Regla de la tabla de operaciones que se aplicó */
  regla: string
  /** Servicios (tareas de Odoo) que sustentan el adicional */
  servicioIds: number[]
  /** Horas que justifican el adicional, para resaltarlas: claves de hito,
   * 'fin' (último hito operativo) o 'cita' (hora de cita) */
  claves: string[]
  /** Hora límite de la regla (ej. 19:00 para la cena), en minutos */
  umbral?: { min: number; label: string }
  /** Requiere validación manual: se muestra pero no suma */
  porValidar?: boolean
}

const REGLAS = {
  programacion_0300: 'S/ 20 con cita confirmada a las 03:00 (no aplica desde las 03:30). No acumulable con amanecida. Requisito: foto de salida de la cochera a las 03:00.',
  bono: `S/ 100 desde 8 servicios integrales completos en la semana. No incluye traslados internos, servicios a provincia, servicios incompletos ni devoluciones de contenedor vacío. Requisito: sin devoluciones pendientes.`,
  cena_20: 'S/ 20 si la unidad sigue en servicio después de las 19:00. No acumulable con amanecida (salvo CROSLAND después de las 22:00).',
  cena_30: 'S/ 30 por devolución desde las 17:00. No aplica si el servicio inició después de las 06:00 ni desde el segundo servicio del día. Requisito: horarios en la app y foto del EIR o evidencia.',
  amanecida_30: 'S/ 30 solo para servicios del cliente CROSLAND que terminan después de las 22:00. No acumulable con programación 03:00.',
  amanecida_50: 'S/ 50 solo para servicios del cliente CROSLAND que terminan después de las 00:00. No acumulable con programación 03:00.',
  devolucion_20: 'S/ 20 cuando la devolución del contenedor vacío es de otro compañero. No aplica si es su propio contenedor. Requisito: horarios en la app y foto del EIR o evidencia.',
  devolucion_30: 'S/ 30 cuando la devolución de otro compañero es en puerto (DPW/APMT). Requisito: horarios en la app y foto del EIR o evidencia.',
  viatico: 'S/ 35 por servicio fuera de Lima y Callao. Requiere autorización previa, no aplica en zonas urbanas ni a Chancay. Requisito: comprobantes (tickets, boletas, facturas).',
}

const ETAPA_FINALIZADA = 'Servicio Finalizado'
const MIN_19 = 19 * 60
const MIN_17 = 17 * 60
const MIN_06 = 6 * 60
const MIN_22 = 22 * 60
const MIN_24 = 24 * 60
const CITA_0300 = 3 * 60
const CITA_0330 = 3 * 60 + 30
const BONO_MIN_SERVICIOS = 8

export function horaLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  const txt = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return min >= 1440 ? `${txt} (+1 día)` : txt
}

export function esFinalizado(etapa: string | null): boolean {
  return etapa === ETAPA_FINALIZADA
}

/** Servicio integral para el bono: completo de punta a punta por el mismo conductor. */
function esIntegral(s: ServicioPago): boolean {
  if (!esFinalizado(s.etapa)) return false
  if (s.atributos.tipoServicio === 'Traslado Interno') return false
  if (s.atributos.zona === 'Provincia') return false
  if (s.flujo === 'importacion' && s.devolucionOtroConductor) return false
  return true
}

/** Importación propia (devuelve el mismo conductor) que aún no se cerró. */
function devolucionPendiente(s: ServicioPago): boolean {
  return s.flujo === 'importacion' && !s.devolucionOtroConductor && !esFinalizado(s.etapa)
}

function esPuerto(almacen: string | null): boolean {
  const a = (almacen ?? '').toUpperCase()
  return a.includes('DPW') || a.includes('APMT') || a.includes('DP WORLD')
}

/**
 * Adicionales de un conductor en la semana.
 * @param servicios     servicios del conductor que entran al pago (ya filtrados)
 * @param todos         todos sus servicios de la semana (para devoluciones pendientes)
 * @param devoluciones  subtareas de devolución que hizo este conductor (ya filtradas)
 */
export function calcularAdicionales(
  servicios: ServicioPago[],
  todos: ServicioPago[],
  devoluciones: DevolucionPago[],
): Adicional[] {
  const out: Adicional[] = []

  // ── Por día ────────────────────────────────────────────────────────────
  const porDia = new Map<string, ServicioPago[]>()
  for (const s of servicios) {
    if (!s.fecha) continue
    const lista = porDia.get(s.fecha) ?? []
    lista.push(s)
    porDia.set(s.fecha, lista)
  }

  for (const [fecha, delDia] of Array.from(porDia.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    // Amanecida CROSLAND (la mayor del día)
    let amanecida: Adicional | null = null
    for (const s of delDia) {
      if (!(s.cliente ?? '').toUpperCase().includes('CROSLAND') || s.horarios.fin === null) continue
      const fin = s.horarios.fin
      const monto = fin > MIN_24 ? 50 : fin > MIN_22 ? 30 : 0
      if (monto && (!amanecida || monto > amanecida.monto)) {
        amanecida = {
          concepto: 'amanecida', monto, fecha, servicio: servicioCodigo(s.name),
          detalle: `Cliente CROSLAND, terminó ${horaLabel(fin)}`,
          regla: monto === 50 ? REGLAS.amanecida_50 : REGLAS.amanecida_30, servicioIds: [s.id],
          claves: ['fin'], umbral: monto === 50 ? { min: MIN_24, label: 'Límite 00:00' } : { min: MIN_22, label: 'Límite 22:00' },
        }
      }
    }

    // Programación 03:00 (no acumulable con amanecida)
    if (!amanecida) {
      const s = delDia.find(x => x.horaCita !== null && x.horaCita >= CITA_0300 && x.horaCita < CITA_0330 && x.horarios.inicio !== null)
      if (s) {
        out.push({
          concepto: 'programacion_0300', monto: 20, fecha, servicio: servicioCodigo(s.name),
          detalle: `Cita ${horaLabel(s.horaCita!)}, salió de cochera ${horaLabel(s.horarios.inicio!)}`,
          regla: REGLAS.programacion_0300, servicioIds: [s.id], claves: ['cita', 'inicio_ruta'],
        })
      }
    }

    // Cena (una por día, la mayor)
    let cena: Adicional | null = null
    const conInicio = delDia.filter(s => s.horarios.inicio !== null).sort((a, b) => a.horarios.inicio! - b.horarios.inicio!)
    const primero = conInicio[0]
    const dev = primero?.horarios.devolucion ?? null
    if (primero && primero.horarios.inicio! <= MIN_06 && dev !== null && dev >= MIN_17 && dev < MIN_24 + MIN_06) {
      cena = {
        concepto: 'cena', monto: 30, fecha, servicio: servicioCodigo(primero.name),
        detalle: `Inició ${horaLabel(primero.horarios.inicio!)}, devolvió ${horaLabel(dev)}`,
        regla: REGLAS.cena_30, servicioIds: [primero.id], claves: ['inicio_ruta', 'contenedor_devuelto'],
        umbral: { min: MIN_17, label: 'Devolución desde 17:00' },
      }
    }
    if (!cena) {
      const tarde = delDia.find(s => s.horarios.fin !== null && s.horarios.fin > MIN_19)
      if (tarde) {
        cena = {
          concepto: 'cena', monto: 20, fecha, servicio: servicioCodigo(tarde.name),
          detalle: `En servicio hasta ${horaLabel(tarde.horarios.fin!)}`,
          regla: REGLAS.cena_20, servicioIds: [tarde.id], claves: ['fin'],
          umbral: { min: MIN_19, label: 'Límite 19:00' },
        }
      }
    }
    if (cena) out.push(cena)
    if (amanecida) out.push(amanecida)

    // Viático (por validar)
    for (const s of delDia) {
      if (s.atributos.zona !== 'Provincia') continue
      out.push({
        concepto: 'viatico', monto: 35, fecha, servicio: servicioCodigo(s.name), porValidar: true,
        detalle: 'Provincia: requiere autorización previa y comprobantes (no aplica a Chancay)',
        regla: REGLAS.viatico, servicioIds: [s.id], claves: [],
      })
    }
  }

  // ── Devoluciones de vacío de otro compañero ────────────────────────────
  for (const d of devoluciones) {
    if (d.conductorId === null || d.conductorId === d.padreConductorId) continue
    const puerto = esPuerto(d.almacen)
    out.push({
      concepto: 'devolucion_vacio', monto: puerto ? 30 : 20, fecha: d.fecha || null,
      servicio: servicioCodigo(d.padreName),
      detalle: `${puerto ? 'En puerto' : 'Devolución'}${d.almacen ? ` · ${d.almacen}` : ''}${d.padreConductor ? ` · servicio de ${d.padreConductor}` : ''}`,
      regla: puerto ? REGLAS.devolucion_30 : REGLAS.devolucion_20, servicioIds: [d.padreId], claves: [],
    })
  }

  // ── Bono semanal ───────────────────────────────────────────────────────
  const integrales = servicios.filter(esIntegral)
  const pendientes = todos.filter(devolucionPendiente).length
  if (integrales.length >= BONO_MIN_SERVICIOS && pendientes === 0) {
    out.push({
      concepto: 'bono', monto: 100, fecha: null, servicio: null,
      detalle: `${integrales.length} servicios integrales completos en la semana`,
      regla: REGLAS.bono, servicioIds: integrales.map(s => s.id), claves: [],
    })
  }

  return out
}

export function totalAdicionales(adicionales: Adicional[]): number {
  return adicionales.reduce((s, a) => s + (a.porValidar ? 0 : a.monto), 0)
}
