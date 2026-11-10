// ============================================================================
// Adicionales del pago a conductores (módulo Pruebas · Pagos conductores).
//
// Fuente única: «Reglas de liquidación de conductores · Guía de implementación
// para Michael · Piloto v1.0 · 07/11/2026» (13 conceptos, §1–§4).
// SOLO SIMULACIÓN: no paga, no descuenta ni sincroniza con Odoo.
//
// Estados por línea: 'simulado' (importe propuesto), 'requiere_revision' (sin
// importe: falta dato, umbral o evidencia) y 'pagado' (gasto ya desembolsado:
// se muestra, nunca se vuelve a sumar).
//
// Hitos: los que marca el conductor en la app. I13/D12 («Servicio
// finalizado») son cierres administrativos y nunca activan un pago.
// Horarios en minutos desde la medianoche del día de programación (> 1440 =
// días después), ver lib/servicios/fechasHitos.ts.
//
// Fuera de cálculo automático: 08 · Pernocte (S/40) — no tiene hito disparador;
// lo confirma Operaciones. El tramo base y el reparto Crosland A/B (06 · TDC
// de Crosland) los calcula motorZonas.ts.
// ============================================================================

import {
  servicioCodigo, type AsistenciaPago, type DevolucionPago, type GastoPago, type ServicioPago,
} from './pagosConductores'

export type ConceptoAdicional =
  | 'cena'
  | 'adht'
  | 'crosland_nocturno'
  | 'crosland_medianoche'
  | 'crosland_devolucion'
  | 'tdc'
  | 'retiro_0300'
  | 'maquina'
  | 'bono'
  | 'viatico'
  | 'gasto'
  | 'no_devolucion'

export type EstadoAdicional = 'simulado' | 'requiere_revision' | 'pagado'

/** Número y nombre del concepto en la tabla-resumen de la guía (§1) */
export const CONCEPTO_LABEL: Record<ConceptoAdicional, string> = {
  cena: '01 · Cena ordinaria',
  adht: '02 · ADHT devolución tardía',
  crosland_nocturno: '03 · Crosland nocturno',
  crosland_medianoche: '04 · Crosland medianoche',
  crosland_devolucion: '05 · Crosland devolución posterior',
  tdc: '06 · TDC por otro conductor',
  retiro_0300: '07 · Retiro 03:00',
  maquina: '09 · Máquina',
  bono: '10 · Bono ocho integrales',
  viatico: '11 · Viático provincia',
  gasto: '12 · Gasto reembolsable',
  no_devolucion: '13 · No devolución',
}

export interface Adicional {
  concepto: ConceptoAdicional
  /** null si requiere revisión */
  monto: number | null
  estado: EstadoAdicional
  /** Fecha de programación (null para conceptos semanales) */
  fecha: string | null
  servicio: string | null
  /** Qué pasó, con horas */
  detalle: string
  /** Por qué requiere revisión (null si simulado) */
  motivo: string | null
  /** Regla de la guía v1.0 */
  regla: string
  /** Códigos de hito usados (I08, D10…) */
  hitos: string[]
  /** Tareas de Odoo que sustentan el adicional */
  servicioIds: number[]
  /** Claves de hito a resaltar en el detalle ('cita' = hora de cita) */
  claves: string[]
  umbral?: { min: number; label: string }
}

export const REGLAS: Record<ConceptoAdicional, string> = {
  cena: 'Guía §3.01 · S/20. Importación: I08 (Fin descarga) después de las 19:00; despacho: D10. Si I08/D10 fue antes de las 19:00 pero el conductor siguió trabajando después (I09/D11, I10–I12), requiere revisión. Nunca I13/D12 ni hora de regreso a cochera.',
  adht: 'Guía §3.02 · S/30 histórico. Hitos I10 → I11 → I12. No existe umbral general homologado: se muestran los horarios y queda en revisión. SSEE del depósito, cita ≥17:00, fin de cita 23:00 y tolerancia de 35 min NO activan el bono.',
  crosland_nocturno: 'Guía §3.03 · S/30 ref. Crosland, intervalo I06 (Ingreso cliente) → I08 (Fin descarga): si la descarga se prolongó después de las 22:00. Casos frontera (I07 antes y I08 después de las 22:00) requieren revisión. No usar I12 ni I13; no duplicar con ADHT.',
  crosland_medianoche: 'Guía §3.04 · S/50 ref. Crosland, I06 → I08 con fecha completa: la descarga cruzó las 00:00. Sustituye los S/30 nocturnos; no se suman.',
  crosland_devolucion: 'Guía §3.05 · S/30. Único caso validado por Rosario: I08 = 21:30 y el mismo conductor devuelve hasta aprox. I12 = 23:00. No se extrapola 23:00 como umbral general.',
  tdc: 'Guía §3.06 · S/20 o S/30 según ruta y depósito. Repartos A/B documentados solo para Crosland; no se extrapolan a otros clientes ni a Chancay.',
  retiro_0300: 'Guía §3.07 · S/20. Cita original Odoo de RETIRO exactamente a las 03:00; contrastar I01 (Inicio ruta), I02/I03 y foto de salida de cochera. No aplica a cita 03:30 ni a I01 aislado. Revisar incompatibilidad con pernocte.',
  maquina: 'Guía §3.09 · S/5 por día válido, máximo S/30 por semana (seis días). Fuente: módulo Asistencia de la app (entrada/salida) con servicio asignado ese día. No aplica a días sin servicio.',
  bono: 'Guía §3.10 · S/100 semanal. Ocho Sxxxxx únicos y completos (sábado–viernes). Importación: I08/I09 + devolución propia I12. Despacho/exportación: flujo propio completo. ITK y devolución por B cuentan, pero quedan en revisión de elegibilidad.',
  viatico: 'Guía §3.11 · S/35. Despacho a provincia con D06/D07/D08/D11, destino físico Odoo, autorización previa y comprobante. Excluye Chancay. D07 solo no activa el viático.',
  gasto: 'Guía §3.12 · Importe realmente sustentado en el módulo Gastos de la app (comprobante). Diferenciar pendiente y pagado; no abonar dos veces lo ya desembolsado.',
  no_devolucion: 'Guía §3.13 · Incidencia. Ausencia de I12 no prueba por sí sola la falta de devolución; Operaciones puede acreditarla. Descuento histórico S/20: PROHIBIDO AUTOMATIZAR.',
}

const ETAPA_FINALIZADA = 'Servicio Finalizado'
const MIN_19 = 19 * 60
const MIN_2130 = 21 * 60 + 30
const MIN_22 = 22 * 60
const MIN_2230 = 22 * 60 + 30
const MIN_2330 = 23 * 60 + 30
const MIN_24 = 24 * 60
const CITA_0300 = 3 * 60
const MAQUINA_DIA = 5
const MAQUINA_DIAS_MAX = 6
const BONO_MIN = 8

export function horaLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  const txt = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return min >= 1440 ? `${txt} (+1 día)` : txt
}

export function esFinalizado(etapa: string | null): boolean {
  return etapa === ETAPA_FINALIZADA
}

export function esPuerto(almacen: string | null): boolean {
  const a = (almacen ?? '').toUpperCase()
  return a.includes('DPW') || a.includes('APMT') || a.includes('DP WORLD')
}

export function esCrosland(cliente: string | null): boolean {
  return (cliente ?? '').toUpperCase().includes('CROSLAND')
}

/** Minutos de un hito marcado, o null */
export function hora(s: ServicioPago, key: string): number | null {
  return s.horarios.linea.find(h => h.key === key)?.min ?? null
}

function sim(base: Omit<Adicional, 'estado' | 'motivo'>): Adicional {
  return { ...base, estado: 'simulado', motivo: null }
}
function rev(base: Omit<Adicional, 'estado' | 'motivo' | 'monto'>, motivo: string): Adicional {
  return { ...base, monto: null, estado: 'requiere_revision', motivo }
}

// ── 01 · Cena ───────────────────────────────────────────────────────────

const CENA: Record<string, { fin: [string, string]; despues: [string, string][] }> = {
  importacion: {
    fin: ['fin_descarga', 'I08'],
    despues: [['salida_cliente', 'I09'], ['llegada_devolucion', 'I10'], ['ingreso_devolucion', 'I11'], ['contenedor_devuelto', 'I12']],
  },
  despacho: { fin: ['fin_descarga', 'D10'], despues: [['salida_destino', 'D11']] },
}

function cenaDe(s: ServicioPago): Adicional | null {
  const def = CENA[s.flujo]
  if (!def || !s.fecha) return null
  const [keyFin, codFin] = def.fin
  const fin = hora(s, keyFin)
  const base = {
    concepto: 'cena' as const, fecha: s.fecha, servicio: servicioCodigo(s.name), regla: REGLAS.cena,
    servicioIds: [s.id], umbral: { min: MIN_19, label: 'Límite 19:00' },
  }
  if (fin !== null && fin > MIN_19) {
    return sim({ ...base, monto: 20, detalle: `${codFin} Fin descarga ${horaLabel(fin)}`, hitos: [codFin], claves: [keyFin] })
  }
  const posterior = def.despues.map(([k, c]) => [k, c, hora(s, k)] as const).find(([, , m]) => m !== null && m > MIN_19)
  if (!posterior) return null
  const [k, c, m] = posterior
  return rev(
    { ...base, detalle: `${fin === null ? `${codFin} sin marcar` : `${codFin} ${horaLabel(fin)}`}; ${c} ${horaLabel(m!)}`, hitos: [codFin, c], claves: [keyFin, k] },
    fin === null ? `${codFin} sin marcar y siguió trabajando después de las 19:00` : `${codFin} antes de las 19:00 pero siguió trabajando después`,
  )
}

// ── 02 · ADHT ───────────────────────────────────────────────────────────

function adhtDe(s: ServicioPago): Adicional | null {
  if (s.flujo !== 'importacion' || s.devolucionOtroConductor) return null
  const [i10, i11, i12] = ['llegada_devolucion', 'ingreso_devolucion', 'contenedor_devuelto'].map(k => hora(s, k))
  if (i12 === null) return null
  const txt = [['I10', i10], ['I11', i11], ['I12', i12]].map(([c, m]) => `${c} ${m === null ? '—' : horaLabel(m as number)}`).join(' → ')
  return rev({
    concepto: 'adht', fecha: s.fecha || null, servicio: servicioCodigo(s.name), detalle: txt, regla: REGLAS.adht,
    hitos: ['I10', 'I11', 'I12'], servicioIds: [s.id], claves: ['llegada_devolucion', 'ingreso_devolucion', 'contenedor_devuelto'],
  }, 'Sin umbral general de pago homologado')
}

// ── 03/04/05 · Crosland ─────────────────────────────────────────────────

function croslandDe(s: ServicioPago): Adicional | null {
  if (s.flujo !== 'importacion' || !esCrosland(s.cliente)) return null
  const [i06, i07, i08] = ['ingreso_cliente', 'inicio_descarga', 'fin_descarga'].map(k => hora(s, k))
  const base = { fecha: s.fecha || null, servicio: servicioCodigo(s.name), servicioIds: [s.id] }
  const intervalo = `I06 ${i06 === null ? '—' : horaLabel(i06)} → I07 ${i07 === null ? '—' : horaLabel(i07)} → I08 ${i08 === null ? '—' : horaLabel(i08)}`

  if (i08 !== null && i08 >= MIN_22) {
    const medianoche = i08 >= MIN_24
    const concepto = medianoche ? 'crosland_medianoche' as const : 'crosland_nocturno' as const
    const linea = {
      ...base, concepto, detalle: intervalo, regla: REGLAS[concepto], hitos: ['I06', 'I07', 'I08'],
      claves: ['ingreso_cliente', 'inicio_descarga', 'fin_descarga'],
      umbral: medianoche ? { min: MIN_24, label: 'Límite 00:00' } : { min: MIN_22, label: 'Límite 22:00' },
    }
    if (i06 === null) return rev(linea, 'Falta I06 (Ingreso cliente) para reconstruir el intervalo')
    if (!medianoche && i07 !== null && i07 < MIN_22) return rev(linea, 'Caso frontera: I07 antes y I08 después de las 22:00')
    return sim({ ...linea, monto: medianoche ? 50 : 30 })
  }

  // 05 · solo el caso validado (mismo conductor devuelve)
  const i12 = s.devolucionOtroConductor ? null : hora(s, 'contenedor_devuelto')
  if (i08 === null || i12 === null || i12 < MIN_22) return null
  const linea = {
    ...base, concepto: 'crosland_devolucion' as const, regla: REGLAS.crosland_devolucion,
    detalle: `I08 ${horaLabel(i08)} → I12 ${horaLabel(i12)}`, hitos: ['I08', 'I12'], claves: ['fin_descarga', 'contenedor_devuelto'],
  }
  if (i08 === MIN_2130 && i12 >= MIN_2230 && i12 <= MIN_2330) return sim({ ...linea, monto: 30 })
  return rev(linea, 'Solo el caso I08 21:30 → I12 23:00 está validado; no se extrapola')
}

// ── 06 · TDC fuera de Crosland ──────────────────────────────────────────

function tdcDe(d: DevolucionPago, padre: ServicioPago | undefined): Adicional | null {
  if (d.conductorId === null || d.conductorId === d.padreConductorId) return null
  if (padre && esCrosland(padre.cliente)) return null // CR-03/CR-04 en motorZonas
  return rev({
    concepto: 'tdc', fecha: d.fecha || null, servicio: servicioCodigo(d.padreName), regla: REGLAS.tdc,
    detalle: `Devolución de ${d.padreConductor ?? 'otro conductor'}${d.almacen ? ` en ${d.almacen}` : ''} · I12 ${d.devueltoMin === null ? 'sin marcar' : horaLabel(d.devueltoMin)}`,
    hitos: ['I12'], servicioIds: [d.padreId], claves: [],
  }, 'Reparto A/B solo documentado para Crosland: importe según ruta y depósito por definir')
}

// ── 07 · Retiro 03:00 ───────────────────────────────────────────────────

function retiroDe(s: ServicioPago): Adicional | null {
  if (s.horaCita !== CITA_0300) return null
  const i01 = hora(s, 'inicio_ruta')
  const linea = {
    concepto: 'retiro_0300' as const, fecha: s.fecha || null, servicio: servicioCodigo(s.name), regla: REGLAS.retiro_0300,
    detalle: `Cita ${horaLabel(s.horaCita)} · I01 ${i01 === null ? 'sin marcar' : horaLabel(i01)}`,
    hitos: ['Cita', 'I01'], servicioIds: [s.id], claves: ['cita', 'inicio_ruta'],
  }
  if (i01 === null) return rev(linea, 'Sin I01 (Inicio ruta) que respalde la salida')
  return sim({ ...linea, monto: 20 })
}

// ── 09 · Máquina ────────────────────────────────────────────────────────

function maquinaDe(servicios: ServicioPago[], asistencias: AsistenciaPago[]): Adicional | null {
  const conServicio = new Set(servicios.flatMap(s => s.fecha ? [s.fecha] : []))
  const dias = Array.from(new Set(asistencias.map(a => a.fecha))).sort()
  const validos = dias.filter(f => conServicio.has(f) && asistencias.some(a => a.fecha === f && a.salida))
  const sinSalida = dias.filter(f => conServicio.has(f) && !validos.includes(f))
  if (validos.length === 0 && sinSalida.length === 0) return null
  const contados = validos.slice(0, MAQUINA_DIAS_MAX)
  const base = {
    concepto: 'maquina' as const, fecha: null, servicio: null, regla: REGLAS.maquina, hitos: ['Asistencia'],
    servicioIds: servicios.filter(s => s.fecha && contados.includes(s.fecha)).map(s => s.id), claves: [],
    detalle: `${contados.length} día(s) con entrada, salida y servicio${sinSalida.length ? ` · sin salida marcada: ${sinSalida.join(', ')}` : ''}`,
  }
  if (contados.length === 0) return rev(base, 'Días con entrada y servicio pero sin salida en Asistencia')
  return sim({ ...base, monto: contados.length * MAQUINA_DIA })
}

// ── 10 · Bono ───────────────────────────────────────────────────────────

type Integralidad = 'integral' | 'revision' | 'no'

export function integralidad(s: ServicioPago): Integralidad {
  const operativos = s.horarios.linea.filter(h => h.key !== 'servicio_finalizado')
  const completo = operativos.length > 0 && operativos.every(h => h.min !== null)
  switch (s.flujo) {
    case 'importacion': {
      const principal = hora(s, 'fin_descarga') !== null || hora(s, 'salida_cliente') !== null
      if (!principal) return 'no'
      if (s.devolucionOtroConductor) return 'revision'
      return hora(s, 'contenedor_devuelto') !== null ? 'integral' : 'no'
    }
    case 'despacho':
    case 'exportacion':
      return completo ? 'integral' : 'no'
    case 'traslado_interno':
    case 'isotanque_lleno':
    case 'isotanque_vacio':
      return completo ? 'revision' : 'no'
    default:
      return 'no'
  }
}

function bonoDe(servicios: ServicioPago[]): Adicional | null {
  const porCodigo = new Map<string, { s: ServicioPago; i: Integralidad }>()
  for (const s of servicios) {
    const i = integralidad(s)
    if (i === 'no') continue
    const cod = servicioCodigo(s.name)
    const prev = porCodigo.get(cod)
    if (!prev || (prev.i === 'revision' && i === 'integral')) porCodigo.set(cod, { s, i })
  }
  const integrales = Array.from(porCodigo.values()).filter(x => x.i === 'integral')
  const enRevision = Array.from(porCodigo.values()).filter(x => x.i === 'revision')
  if (integrales.length + enRevision.length < BONO_MIN) return null
  const base = {
    concepto: 'bono' as const, fecha: null, servicio: null, regla: REGLAS.bono, hitos: ['I08/I09', 'I12', 'flujo completo'],
    servicioIds: [...integrales, ...enRevision].map(x => x.s.id), claves: [],
    detalle: `${integrales.length} integrales completos${enRevision.length ? ` + ${enRevision.length} por revisar (ITK / devolución por B)` : ''}`,
  }
  if (integrales.length >= BONO_MIN) return sim({ ...base, monto: 100 })
  return rev(base, 'Llega a 8 solo contando ITK o devoluciones por B: elegibilidad la revisan Rosario y Margiory')
}

// ── 11 · Viático ────────────────────────────────────────────────────────

function viaticoDe(s: ServicioPago): Adicional | null {
  if (s.atributos.zona !== 'Provincia') return null
  const marcas = [['salida_origen', 'D06'], ['llegada_destino', 'D07'], ['ingreso_destino', 'D08'], ['salida_destino', 'D11']] as const
  const detalle = s.flujo === 'despacho'
    ? marcas.map(([k, c]) => `${c} ${hora(s, k) === null ? '—' : horaLabel(hora(s, k)!)}`).join(' · ')
    : `${s.atributos.tipoServicio ?? 'Servicio'} a provincia`
  return rev({
    concepto: 'viatico', fecha: s.fecha || null, servicio: servicioCodigo(s.name), detalle, regla: REGLAS.viatico,
    hitos: s.flujo === 'despacho' ? marcas.map(([, c]) => c) : [], servicioIds: [s.id], claves: marcas.map(([k]) => k),
  }, s.flujo === 'despacho'
    ? 'Requiere destino físico, autorización previa y comprobante (no aplica a Chancay)'
    : 'Importación/exportación a provincia: consultar el mapa operativo; sin equivalencia definida')
}

// ── 12 · Gastos ─────────────────────────────────────────────────────────

function gastoDe(g: GastoPago, servicios: ServicioPago[]): Adicional {
  const s = servicios.find(x => x.id === g.servicioId)
  const base = {
    concepto: 'gasto' as const, fecha: g.fecha, servicio: g.servicio ? servicioCodigo(g.servicio) : (s ? servicioCodigo(s.name) : null),
    regla: REGLAS.gasto, hitos: ['App Gastos'], servicioIds: s ? [s.id] : [], claves: [],
    detalle: `${g.descripcion ?? 'Gasto'} · ${g.moneda === 'dolares' ? 'US$' : 'S/'} ${g.monto.toFixed(2)} · ${g.fotos} comprobante(s)`,
  }
  if (g.estado === 'pagado') return { ...base, monto: g.monto, estado: 'pagado', motivo: null }
  if (g.moneda !== 'soles') return rev(base, 'Gasto en dólares: conversión por definir')
  if (g.fotos === 0) return rev(base, 'Sin comprobante adjunto')
  return sim({ ...base, monto: g.monto })
}

// ── 13 · No devolución ──────────────────────────────────────────────────

function noDevolucionDe(s: ServicioPago, devoluciones: DevolucionPago[]): Adicional | null {
  if (s.flujo !== 'importacion' || !esFinalizado(s.etapa)) return null
  const subtareas = devoluciones.filter(d => d.padreId === s.id)
  const i12 = s.devolucionOtroConductor ? subtareas.find(d => d.devueltoMin !== null) : hora(s, 'contenedor_devuelto')
  if (i12 !== null && i12 !== undefined) return null
  const responsable = s.devolucionOtroConductor ? (subtareas[0]?.conductor ?? 'sin asignar') : (s.conductor ?? '—')
  return rev({
    concepto: 'no_devolucion', fecha: s.fecha || null, servicio: servicioCodigo(s.name), regla: REGLAS.no_devolucion,
    detalle: `Servicio cerrado sin I12 · responsable de la devolución: ${responsable}`, hitos: ['I09', 'I10', 'I11', 'I12'],
    servicioIds: [s.id], claves: ['salida_cliente', 'llegada_devolucion', 'ingreso_devolucion', 'contenedor_devuelto'],
  }, 'Incidencia: Operaciones debe acreditar la devolución. No se descuenta')
}

// ── Consolidado por conductor ───────────────────────────────────────────

export interface EntradaAdicionales {
  /** Servicios del conductor que entran al cálculo */
  servicios: ServicioPago[]
  /** Todas las subtareas de devolución de la semana */
  devoluciones: DevolucionPago[]
  /** Todos los servicios de la semana (para ubicar el padre de una subtarea) */
  todos: ServicioPago[]
  /** Id del conductor (empleado Odoo) */
  conductorId: number
  asistencias: AsistenciaPago[]
  gastos: GastoPago[]
}

const ORDEN: ConceptoAdicional[] = [
  'cena', 'adht', 'crosland_nocturno', 'crosland_medianoche', 'crosland_devolucion', 'tdc', 'retiro_0300',
  'maquina', 'bono', 'viatico', 'gasto', 'no_devolucion',
]

export function calcularAdicionales(e: EntradaAdicionales): Adicional[] {
  const out: Adicional[] = []
  const ordenados = [...e.servicios].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))

  // 01 · una cena simulada por día; otra el mismo día queda en revisión
  const cenaDia = new Set<string>()
  for (const s of ordenados) {
    const c = cenaDe(s)
    if (!c) continue
    if (c.estado === 'simulado' && cenaDia.has(c.fecha!)) {
      out.push({ ...c, monto: null, estado: 'requiere_revision', motivo: 'Segunda cena el mismo día' })
      continue
    }
    if (c.estado === 'simulado') cenaDia.add(c.fecha!)
    out.push(c)
  }

  for (const s of ordenados) {
    const crosland = croslandDe(s)
    if (crosland) out.push(crosland)
    // No reconocer dos veces el mismo trabajo como ADHT y Crosland
    if (!crosland) { const a = adhtDe(s); if (a) out.push(a) }
    const r = retiroDe(s); if (r) out.push(r)
    const v = viaticoDe(s); if (v) out.push(v)
    const n = noDevolucionDe(s, e.devoluciones); if (n) out.push(n)
  }

  for (const d of e.devoluciones) {
    if (d.conductorId !== e.conductorId) continue
    const t = tdcDe(d, e.todos.find(s => s.id === d.padreId)); if (t) out.push(t)
  }

  const m = maquinaDe(e.servicios, e.asistencias.filter(a => a.conductorId === e.conductorId)); if (m) out.push(m)
  const b = bonoDe(e.servicios); if (b) out.push(b)
  for (const g of e.gastos) if (g.conductorId === e.conductorId) out.push(gastoDe(g, e.todos))

  return out.sort((a, b) => ORDEN.indexOf(a.concepto) - ORDEN.indexOf(b.concepto) || String(a.fecha).localeCompare(String(b.fecha)))
}

/** Solo suma lo simulado: lo que requiere revisión y lo ya pagado no entran */
export function totalAdicionales(adicionales: Adicional[]): number {
  return adicionales.reduce((t, a) => t + (a.estado === 'simulado' ? a.monto ?? 0 : 0), 0)
}
