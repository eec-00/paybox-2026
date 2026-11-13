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
// lo confirma Operaciones. 05 · Devolución posterior Crosland ya no se paga
// aparte: va en la tarifa (Rosario, 12/11/2026). El tramo base y el reparto Crosland A/B (06 · TDC
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
  cena: 'Guía §3.01 · S/20. Importación: I08 (Fin descarga) después de las 19:00; despacho: D10. Crosland: también si el mismo conductor devuelve (I12) después de las 19:00, porque la devolución va en su tarifa (Rosario, 12/11/2026). En otros clientes, si I08/D10 fue antes de las 19:00 pero el conductor siguió trabajando después (I09/D11, I10–I12), requiere revisión. Nunca I13/D12 ni hora de regreso a cochera.',
  adht: 'S/30. Regla de Margiory (10/11/2026), confirmada el 12/11/2026 en lugar de la guía §3.02: I10 (Llegada a depósito) a las 17:00 o después, con cita de devolución a las 17:00 o después acreditada como SSEE. Si el conductor ingresa (I11) antes de la cita, no corresponde: ya lo cubre la máquina. Crosland: el ADHT reemplaza a la cena (Rosario, 12/11/2026).',
  crosland_nocturno: 'Guía §3.03 · S/30 ref. Crosland, atención desde I06 (Ingreso cliente). Hito decisivo: I09 (Salida cliente) después de las 22:00, definido por Margiory el 10/11/2026. No usar I12 ni I13; no duplicar con ADHT.',
  crosland_medianoche: 'Guía §3.04 · S/50 ref. Crosland, atención desde I06. Hito decisivo: I09 (Salida cliente) después de las 00:00, igual que el nocturno (Margiory, 12/11/2026). Sustituye los S/30 nocturnos; no se suman (Rosario, 12/11/2026).',
  tdc: 'Guía §3.06 · Otros clientes: el conductor B que devuelve el contenedor de otro cobra S/30 si lo devuelve en APM o DPW y S/20 en cualquier otro almacén (Rosario, 12/11/2026). Basta I12 en la subtarea asignada. Crosland va en la tarifa base (CR-03/CR-04).',
  retiro_0300: 'Guía §3.07 · S/20. Cita original Odoo de RETIRO exactamente a las 03:00; contrastar I01 (Inicio ruta), I02/I03 y foto de salida de cochera. No aplica a cita 03:30 ni a I01 aislado. Revisar incompatibilidad con pernocte.',
  maquina: 'Guía §3.09 · S/5 por día válido, máximo S/30 por semana (seis días). Fuente: módulo Asistencia de la app (entrada/salida) con servicio asignado ese día. No aplica a días sin servicio.',
  bono: 'Guía §3.10 · S/100 semanal. Ocho Sxxxxx únicos y completos (sábado–viernes). Importación: I08/I09 + devolución propia I12. Despacho/exportación: flujo propio completo. Las entregas de isotanque lleno o vacío sí cuentan. NO son acumulables: traslados internos de isotanque (ITK), viajes a provincia (fuera de Lima) y devoluciones por terceros (Rosario, 11 y 12/11/2026).',
  viatico: 'Guía §3.11 · S/35. Despacho a provincia con D06/D07/D08/D11, destino físico Odoo, autorización previa y comprobante. Excluye Chancay. D07 solo no activa el viático.',
  gasto: 'Guía §3.12 · Importe realmente sustentado en el módulo Gastos de la app (comprobante). Diferenciar pendiente y pagado; no abonar dos veces lo ya desembolsado. Gastos en dólares: tipo de cambio venta de la SBS del día del gasto (Rosario, 12/11/2026), serie PD04640PD del BCRP; fin de semana o feriado: el último publicado.',
  no_devolucion: 'Guía §3.13 · Incidencia. Ausencia de I12 no prueba por sí sola la falta de devolución; Operaciones puede acreditarla. Descuento histórico S/20: PROHIBIDO AUTOMATIZAR.',
}

const ETAPA_FINALIZADA = 'Servicio Finalizado'
const MIN_19 = 19 * 60
const MIN_17 = 17 * 60
const MIN_22 = 22 * 60
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

/**
 * Clientes (partner_id de Odoo) que se pagan con la tarifa Crosland, confirmados
 * por Margiory el 12/11/2026: «aplica para todos», salvo Crosland Técnica (es
 * contacto, no almacén de entrega) y el contacto de facturación «Crossland Facturas».
 */
export const CROSLAND_ODOO_IDS: Record<number, string> = {
  308: 'CROSLAND MOTOS S.A.C',
  417: 'CROSLAND MOTOS · Akemi Kiwaki Arauco',
  964: 'CROSLAND MOTOS · Elevadores',
  1063: 'CROSLAND MOTOS · Santa Rosa',
  419: 'CROSLAND MOTOS · Sensores',
  420: 'CROSLAND REPUESTOS S.A.C.',
  421: 'CROSLAND REPUESTOS · Almacén Callao',
  317: 'HERTFORD AUTOMOTRIZ S.A.',
  360: 'HERTFORD AUTOMOTRIZ · entrega',
}

/** Excluidos expresamente por Margiory (12/11/2026) */
export const CROSLAND_EXCLUIDOS: Record<number, string> = {
  804: 'CROSLAND TECNICA S.A.',
  918: 'Crossland Facturas',
}

export function esCrosland(clienteId: number | null): boolean {
  return clienteId !== null && clienteId in CROSLAND_ODOO_IDS
}

/** Minutos de un hito marcado, o null */
export function hora(s: ServicioPago, key: string): number | null {
  return s.horarios.linea.find(h => h.key === key)?.min ?? null
}

/** ¿El hito quedó registrado con ubicación desde la app? (fuente de la marca, guía §2) */
function conUbicacion(s: ServicioPago, key: string): boolean {
  return s.horarios.linea.find(h => h.key === key)?.real ?? false
}

/** «I08 19:30» o «I08 19:30 (sin ubicación)» o «I08 —» */
function marca(s: ServicioPago, key: string, codigo: string): string {
  const m = hora(s, key)
  if (m === null) return `${codigo} —`
  return `${codigo} ${horaLabel(m)}${conUbicacion(s, key) ? '' : ' (sin ubicación)'}`
}

const RECONSTRUCCION: [string, string][] = [
  ['salida_cliente', 'I09'], ['llegada_devolucion', 'I10'], ['ingreso_devolucion', 'I11'], ['contenedor_devuelto', 'I12'],
]

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
    return sim({ ...base, monto: 20, detalle: `${marca(s, keyFin, codFin)} (Fin descarga)`, hitos: [codFin], claves: [keyFin] })
  }
  // Crosland: la devolución propia va en la tarifa; si termina después de las 19:00 se paga la cena
  const i12 = hora(s, 'contenedor_devuelto')
  if (s.flujo === 'importacion' && esCrosland(s.clienteId) && !s.devolucionOtroConductor && i12 !== null && i12 > MIN_19) {
    return sim({
      ...base, monto: 20, detalle: `${fin === null ? `${codFin} sin marcar` : marca(s, keyFin, codFin)}; ${marca(s, 'contenedor_devuelto', 'I12')} (devolución propia)`,
      hitos: [codFin, 'I12'], claves: [keyFin, 'contenedor_devuelto'],
    })
  }
  const posterior = def.despues.map(([k, c]) => [k, c, hora(s, k)] as const).find(([, , m]) => m !== null && m > MIN_19)
  if (!posterior) return null
  const [k, c] = posterior
  return rev(
    { ...base, detalle: `${fin === null ? `${codFin} sin marcar` : marca(s, keyFin, codFin)}; ${marca(s, k, c)}`, hitos: [codFin, c], claves: [keyFin, k] },
    fin === null ? `${codFin} sin marcar y siguió trabajando después de las 19:00` : `${codFin} antes de las 19:00 pero siguió trabajando después`,
  )
}

// ── 02 · ADHT ───────────────────────────────────────────────────────────

function adhtDe(s: ServicioPago): Adicional | null {
  if (s.flujo !== 'importacion' || s.devolucionOtroConductor) return null
  const i10 = hora(s, 'llegada_devolucion')
  if (i10 === null || i10 < MIN_17) return null
  const cita = s.citaDevolucion ?? null
  // Cita sin día en Odoo: se asume el día de programación hasta tener «Cita de devolución» con fecha y hora
  if (cita !== null && cita < MIN_17) return null
  const i11 = hora(s, 'ingreso_devolucion')
  if (cita !== null && i11 !== null && i11 < cita) return null
  const linea = {
    concepto: 'adht' as const, fecha: s.fecha || null, servicio: servicioCodigo(s.name), regla: REGLAS.adht,
    detalle: `Cita ${cita === null ? 'sin hora en Odoo' : horaLabel(cita)} · ${RECONSTRUCCION.slice(1).map(([k, c]) => marca(s, k, c)).join(' → ')}`,
    hitos: ['Cita', 'I10', 'I11', 'I12'], servicioIds: [s.id], claves: ['llegada_devolucion', 'ingreso_devolucion', 'contenedor_devuelto'],
    umbral: { min: MIN_17, label: 'Límite 17:00' },
  }
  if (cita === null) return rev(linea, 'Falta la hora de la cita de devolución en Odoo (hoy la cita solo se adjunta como archivo)')
  if (s.citaDevolucionSsee !== true) return rev(linea, 'Falta acreditar que la cita de devolución es SSEE: Odoo todavía no tiene dónde registrarlo')
  return sim({ ...linea, monto: 30 })
}

// ── 03/04 · Crosland ─────────────────────────────────────────────────

function croslandDe(s: ServicioPago): Adicional | null {
  if (s.flujo !== 'importacion' || !esCrosland(s.clienteId)) return null
  const [i06, i09] = ['ingreso_cliente', 'salida_cliente'].map(k => hora(s, k))
  const base = { fecha: s.fecha || null, servicio: servicioCodigo(s.name), servicioIds: [s.id] }
  const intervalo = [['ingreso_cliente', 'I06'], ['inicio_descarga', 'I07'], ['fin_descarga', 'I08'], ['salida_cliente', 'I09']]
    .map(([k, c]) => marca(s, k, c)).join(' → ')

  // 04 · medianoche y 03 · nocturno: decide I09 Salida cliente, después de las
  // 00:00 o de las 22:00 (Margiory, 10/11 y 12/11/2026)
  const medianoche = i09 !== null && i09 >= MIN_24
  const nocturno = !medianoche && i09 !== null && i09 >= MIN_22
  if (medianoche || nocturno) {
    const concepto = medianoche ? 'crosland_medianoche' as const : 'crosland_nocturno' as const
    const linea = {
      ...base, concepto, detalle: intervalo, regla: REGLAS[concepto],
      hitos: ['I06', 'I09'],
      claves: ['ingreso_cliente', 'salida_cliente'],
      umbral: medianoche ? { min: MIN_24, label: 'Límite 00:00' } : { min: MIN_22, label: 'Límite 22:00' },
    }
    if (i06 === null) return rev(linea, 'Falta I06 (Ingreso cliente) para reconstruir la atención en el cliente')
    return sim({ ...linea, monto: medianoche ? 50 : 30 })
  }

  // 05 · la devolución propia no se paga aparte: va en la tarifa y suma la cena (Rosario, 12/11/2026)
  return null
}

// ── 06 · TDC fuera de Crosland ──────────────────────────────────────────

function tdcDe(d: DevolucionPago, padre: ServicioPago | undefined): Adicional | null {
  if (d.conductorId === null || d.conductorId === d.padreConductorId) return null
  if (padre && esCrosland(padre.clienteId)) return null // CR-03/CR-04 en motorZonas
  const linea = {
    concepto: 'tdc' as const, fecha: d.fecha || null, servicio: servicioCodigo(d.padreName), regla: REGLAS.tdc,
    detalle: `Devolución de ${d.padreConductor ?? 'otro conductor'}${d.almacen ? ` en ${d.almacen}` : ''} · I12 ${d.devueltoMin === null ? 'sin marcar' : horaLabel(d.devueltoMin)}`,
    hitos: ['I12'], servicioIds: [d.padreId], claves: [],
  }
  if (d.devueltoMin === null) return rev(linea, 'Sin I12 en la subtarea de devolución')
  return sim({ ...linea, monto: esPuerto(d.almacen) ? 30 : 20 })
}

// ── 07 · Retiro 03:00 ───────────────────────────────────────────────────

function retiroDe(s: ServicioPago): Adicional | null {
  if (s.horaCita !== CITA_0300) return null
  const i01 = hora(s, 'inicio_ruta')
  const linea = {
    concepto: 'retiro_0300' as const, fecha: s.fecha || null, servicio: servicioCodigo(s.name), regla: REGLAS.retiro_0300,
    detalle: `Cita ${horaLabel(s.horaCita)} · ${marca(s, 'inicio_ruta', 'I01')} · ${marca(s, 'llegada_cola_retiro', 'I02')} · ${marca(s, 'ingreso_almacen_retiro', 'I03')}`,
    hitos: ['Cita', 'I01', 'I02', 'I03'], servicioIds: [s.id], claves: ['cita', 'inicio_ruta', 'llegada_cola_retiro', 'ingreso_almacen_retiro'],
  }
  if (i01 === null) return rev(linea, 'Sin I01 (Inicio ruta) que respalde la salida')
  // La app no pide foto en I01: la hora de salida se acepta solo si quedó registrada con ubicación
  if (!conUbicacion(s, 'inicio_ruta')) return rev(linea, 'Salida de cochera sin ubicación registrada ni foto: hay que comprobarla, no asumirla')
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
    detalle: `${contados.length} día(s) con entrada, salida y servicio${sinSalida.length ? ` · sin salida marcada: ${sinSalida.join(', ')}` : ''} · actividad efectiva por contrastar con Operaciones`,
  }
  if (contados.length === 0) return rev(base, 'Días con entrada y servicio pero sin salida en Asistencia')
  return sim({ ...base, monto: contados.length * MAQUINA_DIA })
}

// ── 10 · Bono ───────────────────────────────────────────────────────────

/** 'excluido': completo, pero Rosario (11 y 12/11) lo deja fuera del bono (ITK, provincia o devolución por tercero) */
type Integralidad = 'integral' | 'excluido' | 'no'

export function integralidad(s: ServicioPago): Integralidad {
  const i = integralidadFlujo(s)
  return i === 'integral' && s.atributos.zona === 'Provincia' ? 'excluido' : i
}

function integralidadFlujo(s: ServicioPago): Integralidad {
  const operativos = s.horarios.linea.filter(h => h.key !== 'servicio_finalizado')
  const completo = operativos.length > 0 && operativos.every(h => h.min !== null)
  switch (s.flujo) {
    case 'importacion': {
      const principal = hora(s, 'fin_descarga') !== null || hora(s, 'salida_cliente') !== null
      if (!principal) return 'no'
      if (s.devolucionOtroConductor) return 'excluido'
      return hora(s, 'contenedor_devuelto') !== null ? 'integral' : 'no'
    }
    case 'despacho':
    case 'exportacion':
    case 'isotanque_lleno':
    case 'isotanque_vacio':
      return completo ? 'integral' : 'no'
    case 'traslado_interno':
      return completo ? 'excluido' : 'no'
    default:
      return 'no'
  }
}

function bonoDe(servicios: ServicioPago[]): Adicional | null {
  const porCodigo = new Map<string, Integralidad>()
  const ids = new Map<string, number>()
  for (const s of servicios) {
    const i = integralidad(s)
    if (i === 'no') continue
    const cod = servicioCodigo(s.name)
    if (porCodigo.get(cod) !== 'integral') { porCodigo.set(cod, i); ids.set(cod, s.id) }
  }
  const integrales = Array.from(porCodigo).filter(([, i]) => i === 'integral').map(([cod]) => cod)
  const excluidos = Array.from(porCodigo.values()).filter(i => i === 'excluido').length
  if (integrales.length < BONO_MIN) return null
  return sim({
    concepto: 'bono' as const, fecha: null, servicio: null, regla: REGLAS.bono, hitos: ['I08/I09', 'I12', 'flujo completo'],
    servicioIds: integrales.map(cod => ids.get(cod)!), claves: [], monto: 100,
    detalle: `${integrales.length} integrales completos${excluidos ? ` · ${excluidos} no acumulable(s) (ITK / provincia / devolución por tercero)` : ''} · evidencia EIR/ticket/portal por contrastar`,
  })
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

/** « × TC SBS 3.414 (11/11) = S/ 42.68» para gastos en dólares con tipo de cambio */
function conversion(g: GastoPago): string {
  const tc = g.moneda === 'dolares' ? g.tipoCambio : null
  if (!tc) return ''
  const [, m, d] = tc.fecha.split('-')
  const nota = tc.fecha !== g.fecha ? ', último publicado' : ''
  return ` × TC venta SBS ${tc.valor.toFixed(3)} (${d}/${m}${nota}) = S/ ${(Math.round(g.monto * tc.valor * 100) / 100).toFixed(2)}`
}

function gastoDe(g: GastoPago, servicios: ServicioPago[]): Adicional {
  const s = servicios.find(x => x.id === g.servicioId)
  const base = {
    concepto: 'gasto' as const, fecha: g.fecha, servicio: g.servicio ? servicioCodigo(g.servicio) : (s ? servicioCodigo(s.name) : null),
    regla: REGLAS.gasto, hitos: ['App Gastos'], servicioIds: s ? [s.id] : [], claves: [],
    detalle: `${g.descripcion ?? 'Gasto'} · ${g.moneda === 'dolares' ? 'US$' : 'S/'} ${g.monto.toFixed(2)}${conversion(g)} · ${g.fotos} comprobante(s)`,
  }
  const tc = g.moneda === 'dolares' ? g.tipoCambio ?? null : null
  const soles = tc ? Math.round(g.monto * tc.valor * 100) / 100 : g.monto
  if (g.estado === 'pagado') return { ...base, monto: soles, estado: 'pagado', motivo: null }
  if (g.moneda !== 'soles' && !tc) return rev(base, `Gasto en dólares: aún no hay tipo de cambio venta SBS publicado para el ${g.fecha}`)
  if (g.fotos === 0) return rev(base, 'Sin comprobante adjunto')
  return sim({ ...base, monto: soles })
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
    detalle: `Servicio cerrado sin I12 · ${RECONSTRUCCION.slice(0, 3).map(([k, c]) => marca(s, k, c)).join(' → ')} · responsable de la devolución: ${responsable}`,
    hitos: ['I09', 'I10', 'I11', 'I12'],
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
  'cena', 'adht', 'crosland_nocturno', 'crosland_medianoche', 'tdc', 'retiro_0300',
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
    // No reconocer dos veces el mismo trabajo como ADHT y Crosland nocturno/medianoche
    if (!crosland) {
      const a = adhtDe(s)
      if (a) out.push(a)
      // Crosland: el ADHT (S/30) reemplaza a la cena (Rosario, 12/11/2026)
      if (a?.estado === 'simulado' && esCrosland(s.clienteId)) {
        const i = out.findIndex(x => x.concepto === 'cena' && x.servicioIds.includes(s.id) && x.estado === 'simulado')
        if (i >= 0) out.splice(i, 1)
      }
    }
    const r = retiroDe(s); if (r) out.push(r)
    const v = viaticoDe(s); if (v) out.push(v)
    const n = noDevolucionDe(s, e.devoluciones); if (n) out.push(n)
  }

  for (const d of e.devoluciones) {
    if (d.conductorId !== e.conductorId) continue
    const t = tdcDe(d, e.todos.find(s => s.id === d.padreId)); if (t) out.push(t)
  }

  // Máquina: día con servicio realmente asignado, finalizado o no (guía §3.09)
  const asignados = e.todos.filter(s => s.conductorId === e.conductorId)
  const m = maquinaDe(asignados, e.asistencias.filter(a => a.conductorId === e.conductorId)); if (m) out.push(m)
  const b = bonoDe(e.servicios); if (b) out.push(b)
  for (const g of e.gastos) if (g.conductorId === e.conductorId) out.push(gastoDe(g, e.todos))

  return out.sort((a, b) => ORDEN.indexOf(a.concepto) - ORDEN.indexOf(b.concepto) || String(a.fecha).localeCompare(String(b.fecha)))
}

/** Solo suma lo simulado: lo que requiere revisión y lo ya pagado no entran */
export function totalAdicionales(adicionales: Adicional[]): number {
  return adicionales.reduce((t, a) => t + (a.estado === 'simulado' ? a.monto ?? 0 : 0), 0)
}
