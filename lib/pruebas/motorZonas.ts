// ============================================================================
// Motor de tarifa base por zona Odoo + cliente + variante (módulo Pruebas).
//
// Ficha única PMO-69 (demo 13/11/2026) y hoja «13 · Reglas implementables»
// (07/11/2026). SOLO SIMULACIÓN: no escribe en Odoo, no paga, no descuenta.
//
// Algoritmo (pasos S1–S8 de la hoja 13):
//   S1  Identificar Sxxxxx y detectar campos nulos.
//   S2  Zona literal de la variante Odoo. Provincia ≠ Zona 0; Zona 0 exige ruta.
//   S4  Acuerdo de cliente (Crosland) antes que la tarifa ordinaria.
//   S5  Destino físico económico acreditado por Operaciones. Nunca por nombre
//       de tarea, depósito ni GPS.
//   S3  Coincidencia EXACTA de operación + modalidad + carga.
//   S6  Fecha del servicio contra la fecha de la fuente (sin retroactivo).
//   S7  Una regla inequívoca → PROPUESTO (importe referencial). Cero o varias,
//       o falta un dato → REQUIERE REVISIÓN sin importe (ni S/0).
//   S8  Sin duplicar líneas por tramo/conductor; sin efectos financieros.
//
// No hay fallback por zona: la zona solo filtra candidatos, el distrito físico
// decide. Ninguna regla está homologada todavía (DEC-01..DEC-10 pendientes),
// así que hoy ningún resultado llega a 'calculado'.
// ============================================================================

import { esFinalizado, esPuerto } from './adicionalesConductores'
import { servicioCodigo, type DevolucionPago, type ServicioPago } from './pagosConductores'

export const VERSION_TARIFARIO = 'v0.9 · 07/11/2026'

export type EstadoMotor = 'calculado' | 'propuesto' | 'requiere_revision'

export type TipoServicioOdoo = 'Importación' | 'Exportación' | 'Traslado Interno' | 'Despacho'
export type ModalidadOdoo = 'Contenedor 20' | 'Contenedor 40' | 'Carga Suelta' | 'Isotanque'
export type CargaOdoo = 'General' | 'IMO' | 'IQBF'

export interface Regla {
  id: string
  zona: string
  /** Distrito físico literal de la fuente */
  distrito: string
  operaciones: TipoServicioOdoo[]
  modalidades: ModalidadOdoo[]
  cargas: CargaOdoo[]
  monto: number
  fuente: string
  /**
   * Fecha del documento que respalda el importe. NO es una vigencia aprobada:
   * antes de esta fecha no hay respaldo y no se aplica retroactivo.
   */
  referenciaDesde: string
  /** Fin de vigencia aprobado; null mientras no exista acta */
  hasta: string | null
  /** true solo con acta (fecha K + evidencia M de la hoja 14). Hoy ninguna. */
  homologada: boolean
  estadoEconomico: string
}

// ── Catálogo ────────────────────────────────────────────────────────────

const FUENTE_ORD = 'Margiory tarifario literal (13/10) + zona Odoo catálogo 14/10'
const FUENTE_ITK = 'Tarifario literal Margiory 13/10'
const FUENTE_CR = 'Regla Crosland histórica consolidada con Rosario/Margiory (RF-006..009)'
const DESDE_ORD = '2026-10-13'
const DESDE_CR = '2026-10-20'

const CONTENEDOR: ModalidadOdoo[] = ['Contenedor 20', 'Contenedor 40']
const IMO: CargaOdoo[] = ['IMO', 'IQBF']
const TODAS: CargaOdoo[] = ['General', 'IMO', 'IQBF']

/** [zona, distrito, general, imo/iqbf, despacho carga suelta] — hoja 14 bloque B */
const LITERALES: [string, string, number, number, number][] = [
  ['Zona 1', 'Callao', 70, 70, 80],
  ['Zona 2', 'Lima', 80, 80, 90],
  ['Zona 3', 'Los Olivos', 80, 80, 90],
  ['Zona 3', 'Puente Piedra', 80, 80, 90],
  ['Zona 3', 'Ventanilla', 80, 80, 90],
  ['Zona 4', 'Ate', 80, 80, 90],
  ['Zona 4', 'San Juan de Lurigancho', 90, 90, 100],
  ['Zona 5', 'Ancón', 90, 90, 100],
  ['Zona 6', 'Chorrillos', 90, 90, 100],
  ['Zona 6', 'Huachipa', 90, 90, 100],
  ['Zona 6', 'Villa el Salvador', 90, 90, 100],
  ['Zona 7', 'Lurín', 100, 110, 110],
]

function ord(n: number, zona: string, distrito: string, rest: Pick<Regla, 'operaciones' | 'modalidades' | 'cargas' | 'monto'>): Regla {
  return {
    id: `ORD-${String(n).padStart(2, '0')}`, zona, distrito, ...rest,
    fuente: FUENTE_ORD, referenciaDesde: DESDE_ORD, hasta: null, homologada: false,
    estadoEconomico: 'LITERAL HISTÓRICO · VIGENCIA/ALCANCE SIN HOMOLOGAR',
  }
}

export const REGLAS_ORDINARIAS: Regla[] = LITERALES.flatMap(([zona, distrito, general, imo, despacho], i) => [
  // Exportación figura como «aplicabilidad pendiente» (DEC-02): no se incluye
  ord(i * 3 + 1, zona, distrito, { operaciones: ['Importación'], modalidades: CONTENEDOR, cargas: ['General'], monto: general }),
  ord(i * 3 + 2, zona, distrito, { operaciones: ['Importación'], modalidades: CONTENEDOR, cargas: IMO, monto: imo }),
  ord(i * 3 + 3, zona, distrito, { operaciones: ['Despacho'], modalidades: ['Carga Suelta'], cargas: TODAS, monto: despacho }),
])

function itk(id: string, operacion: TipoServicioOdoo, monto: number): Regla {
  return {
    id, zona: 'Zona 1', distrito: 'Callao', operaciones: [operacion], modalidades: ['Isotanque'], cargas: TODAS, monto,
    fuente: FUENTE_ITK, referenciaDesde: DESDE_ORD, hasta: null, homologada: false,
    estadoEconomico: 'LITERAL ITK SOLO CALLAO; NO APLICAR OTRAS ZONAS',
  }
}

export const REGLAS_ITK: Regla[] = [
  itk('ITK-01', 'Importación', 70),
  itk('ITK-02', 'Exportación', 60),
  itk('ITK-03', 'Traslado Interno', 60),
]

export const TARIFARIO: Regla[] = [...REGLAS_ORDINARIAS, ...REGLAS_ITK]

/** CR-01..CR-04: no dependen de distrito; zona original de la tarea (no forzar Z5) */
export const REGLAS_CROSLAND = {
  'CR-01': { monto: 90, concepto: 'A integral (principal + devolución)' },
  'CR-02': { monto: 70, concepto: 'A principal; B devuelve' },
  'CR-03': { monto: 20, concepto: 'B devuelve a depósito ordinario' },
  'CR-04': { monto: 30, concepto: 'B devuelve a DPW/APMT' },
} as const
export type ReglaCrosland = keyof typeof REGLAS_CROSLAND

export interface ClienteEspecial {
  clave: 'crosland'
  /** partner_id de Odoo; null hasta confirmarlo (se identifica por nombre exacto con alerta) */
  odooId: number | null
  nombreOdoo: string
}

export const CLIENTES_ESPECIALES: ClienteEspecial[] = [
  { clave: 'crosland', odooId: null, nombreOdoo: 'CROSLAND MOTOS S.A.C' },
]

// ── Entrada ─────────────────────────────────────────────────────────────

export interface TramoEntrada {
  conductorId: number | null
  conductor: string | null
  /** Hito real acreditado (I10/I11/I12 en el retorno). El cierre administrativo no cuenta */
  acreditado: boolean
  /** Solo retorno: depósito físico de devolución */
  almacen?: string | null
}

export interface EntradaMotor {
  /** Sxxxxx */
  servicio: string
  taskId: number | null
  clienteId: number | null
  cliente: string | null
  zona: string | null
  tipoServicio: string | null
  modalidad: string | null
  tipoCarga: string | null
  /** Fecha efectiva del servicio (YYYY-MM-DD) */
  fecha: string | null
  principal: TramoEntrada
  /** Devolución de vacío (Crosland); null si no hay subtarea */
  retorno: TramoEntrada | null
  /** Destino físico económico. Null si Operaciones no lo acreditó */
  destino: { distrito: string; acreditado: boolean; fuente: string } | null
  origen: 'odoo' | 'mock'
}

// ── Salida ──────────────────────────────────────────────────────────────

export interface LineaMotor {
  tramo: 'principal' | 'retorno'
  conductorId: number | null
  conductor: string | null
  ruleId: string | null
  concepto: string
  monto: number | null
  estado: EstadoMotor
}

export interface PasoTraza {
  paso: string
  ok: boolean
  detalle: string
}

export interface ResultadoMotor {
  servicio: string
  origen: EntradaMotor['origen']
  estado: EstadoMotor
  /** Suma de líneas; null si alguna requiere revisión */
  total: number | null
  lineas: LineaMotor[]
  ruleIds: string[]
  fuente: string | null
  /** Por qué requiere revisión (vacío si propuesto) */
  motivos: string[]
  /** Advertencias aun cuando hay importe propuesto */
  alertas: string[]
  /** Reglas consideradas antes de decidir */
  candidatos: string[]
  traza: PasoTraza[]
  /** Siempre false: la simulación no genera pagos, descuentos ni sync */
  efectoFinanciero: false
}

// ── Utilidades ──────────────────────────────────────────────────────────

/** Mayúsculas, sin tildes ni espacios dobles: solo para comparar literales */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

const RE_SERVICIO = /^S\d{5}$/

const CAMPOS_REQUERIDOS: [keyof EntradaMotor, string][] = [
  ['clienteId', 'ID de cliente'],
  ['zona', 'zona Odoo'],
  ['tipoServicio', 'tipo de servicio'],
  ['modalidad', 'modalidad'],
  ['tipoCarga', 'tipo de carga'],
  ['fecha', 'fecha del servicio'],
]

/** Campos de Odoo nulos que impiden decidir la tarifa */
export function camposNulos(e: EntradaMotor): string[] {
  const faltan = CAMPOS_REQUERIDOS.filter(([k]) => e[k] === null || e[k] === '').map(([, label]) => label)
  if (e.principal.conductorId === null) faltan.push('conductor')
  return faltan
}

export function clienteEspecial(e: EntradaMotor): { cliente: ClienteEspecial; porNombre: boolean } | null {
  for (const c of CLIENTES_ESPECIALES) {
    if (c.odooId !== null && e.clienteId === c.odooId) return { cliente: c, porNombre: false }
    if (c.odooId === null && normalizar(e.cliente) === normalizar(c.nombreOdoo)) return { cliente: c, porNombre: true }
  }
  return null
}

function vigenciaOk(r: { referenciaDesde: string; hasta: string | null }, fecha: string): string | null {
  if (fecha < r.referenciaDesde) {
    return `Fecha ${fecha} anterior a la fuente (${r.referenciaDesde}): sin vigencia aprobada para esa fecha, no se aplica retroactivo`
  }
  if (r.hasta !== null && fecha > r.hasta) return `Fecha ${fecha} posterior al fin de vigencia (${r.hasta})`
  return null
}

// ── Motor ───────────────────────────────────────────────────────────────

class Construccion {
  traza: PasoTraza[] = []
  alertas: string[] = []
  candidatos: string[] = []
  constructor(readonly e: EntradaMotor) {}

  paso(paso: string, ok: boolean, detalle: string) {
    this.traza.push({ paso, ok, detalle })
  }

  revision(motivos: string[], lineas?: LineaMotor[]): ResultadoMotor {
    const base: LineaMotor = {
      tramo: 'principal', conductorId: this.e.principal.conductorId, conductor: this.e.principal.conductor,
      ruleId: null, concepto: 'Tarifa base', monto: null, estado: 'requiere_revision',
    }
    const ls = lineas ?? [base]
    return this.resultado('requiere_revision', ls, motivos, null)
  }

  resultado(estado: EstadoMotor, lineas: LineaMotor[], motivos: string[], fuente: string | null): ResultadoMotor {
    const dup = lineasDuplicadas(lineas)
    if (dup.length) {
      this.paso('S8', false, `Líneas duplicadas: ${dup.join(', ')}`)
      return this.resultado('requiere_revision', lineas.map(l => ({ ...l, monto: null, estado: 'requiere_revision' })),
        [...motivos, 'Pago duplicado detectado'], fuente)
    }
    const enRevision = estado === 'requiere_revision' || lineas.some(l => l.estado === 'requiere_revision')
    return {
      servicio: this.e.servicio, origen: this.e.origen,
      estado: enRevision ? 'requiere_revision' : estado,
      total: enRevision ? null : lineas.reduce((t, l) => t + (l.monto ?? 0), 0),
      lineas, ruleIds: lineas.flatMap(l => l.ruleId ? [l.ruleId] : []), fuente,
      motivos, alertas: this.alertas, candidatos: this.candidatos, traza: this.traza,
      efectoFinanciero: false,
    }
  }
}

/** S8 / RF-001: un tramo admite una sola línea por conductor */
export function lineasDuplicadas(lineas: LineaMotor[]): string[] {
  const vistas = new Set<string>()
  const dup: string[] = []
  for (const l of lineas) {
    const clave = `${l.tramo}|${l.conductorId}`
    if (vistas.has(clave)) dup.push(clave)
    vistas.add(clave)
  }
  return dup
}

export function simularTarifa(e: EntradaMotor, tarifario: Regla[] = TARIFARIO): ResultadoMotor {
  const c = new Construccion(e)

  // S1 · servicio y campos nulos
  if (!RE_SERVICIO.test(e.servicio)) {
    c.paso('S1', false, `Código de servicio inválido: «${e.servicio}»`)
    return c.revision(['Servicio sin código Sxxxxx'])
  }
  const nulos = camposNulos(e)
  if (nulos.length) {
    c.paso('S1', false, `Campos nulos en Odoo: ${nulos.join(', ')}`)
    return c.revision([`Faltan datos de Odoo: ${nulos.join(', ')}`])
  }
  c.paso('S1', true, `${e.servicio} · cliente ${e.clienteId} · ${e.fecha}`)

  // S2 · zona literal
  if (e.zona === 'Provincia') {
    c.paso('S2', false, 'Zona «Provincia»')
    return c.revision(['«Provincia» no equivale a Zona 0 sin mapeo aprobado (DEC-08)'])
  }
  if (e.zona === 'Zona 0') {
    c.paso('S2', false, 'Zona 0: rutas especiales')
    return c.revision(['Zona 0 exige itinerario exacto (RT01–RT13) acreditado por Operaciones; no se asigna por ciudad'])
  }
  c.paso('S2', true, `Zona literal Odoo: ${e.zona}`)

  // S4 · acuerdo de cliente antes que la ordinaria
  const especial = clienteEspecial(e)
  if (especial) {
    if (especial.porNombre) c.alertas.push(`Cliente identificado por nombre exacto «${especial.cliente.nombreOdoo}»: falta registrar su ID de Odoo`)
    c.paso('S4', true, `Acuerdo de cliente: ${especial.cliente.nombreOdoo} (prima sobre la tarifa zonal)`)
    return simularCrosland(c)
  }
  c.paso('S4', true, 'Sin acuerdo especial de cliente: tarifa ordinaria')

  // S5 · destino físico
  if (!e.destino) {
    c.paso('S5', false, 'Sin destino físico económico')
    c.candidatos = tarifario.filter(r => r.zona === e.zona).map(r => r.id)
    return c.revision(['Destino físico económico sin acreditar (lo confirma Operaciones): la zona sola no decide el importe'])
  }
  if (!e.destino.acreditado) {
    c.paso('S5', false, `Destino «${e.destino.distrito}» sin acreditar (${e.destino.fuente})`)
    return c.revision([`Destino «${e.destino.distrito}» no acreditado por Operaciones`])
  }
  const distrito = normalizar(e.destino.distrito)
  const delDistrito = tarifario.filter(r => normalizar(r.distrito) === distrito)
  if (delDistrito.length === 0) {
    c.paso('S5', false, `Distrito «${e.destino.distrito}» sin importe literal`)
    return c.revision([`«${e.destino.distrito}» no tiene tarifa literal (propuesta sin respaldo, DEC-04)`])
  }
  const delaZona = delDistrito.filter(r => r.zona === e.zona)
  if (delaZona.length === 0) {
    c.paso('S5', false, `«${e.destino.distrito}» figura en ${delDistrito[0].zona}, la tarea dice ${e.zona}`)
    return c.revision([`Zona de la tarea (${e.zona}) y destino físico (${e.destino.distrito}, ${delDistrito[0].zona}) no coinciden: no se corrige la zona por deducción`])
  }
  c.paso('S5', true, `Destino acreditado: ${e.destino.distrito} (${e.destino.fuente})`)
  c.candidatos = delaZona.map(r => r.id)

  // S3 · variante exacta
  const exactas = delaZona.filter(r =>
    r.operaciones.includes(e.tipoServicio as TipoServicioOdoo)
    && r.modalidades.includes(e.modalidad as ModalidadOdoo)
    && r.cargas.includes(e.tipoCarga as CargaOdoo))
  if (exactas.length === 0) {
    c.paso('S3', false, `Sin regla para ${e.tipoServicio} · ${e.modalidad} · ${e.tipoCarga}`)
    const motivo = e.tipoServicio === 'Exportación' && e.modalidad !== 'Isotanque'
      ? 'Aplicabilidad de la tarifa a Exportación pendiente (DEC-02)'
      : `Ninguna regla de ${e.destino.distrito} coincide con ${e.tipoServicio} · ${e.modalidad} · ${e.tipoCarga}`
    return c.revision([motivo])
  }
  if (exactas.length > 1) {
    c.paso('S3', false, `Varias reglas compatibles: ${exactas.map(r => r.id).join(', ')}`)
    return c.revision([`Reglas en conflicto (${exactas.map(r => r.id).join(', ')})`])
  }
  const [regla] = exactas
  c.paso('S3', true, `${regla.id}: ${e.tipoServicio} · ${e.modalidad} · ${e.tipoCarga}`)
  if (e.modalidad !== 'Isotanque' && CONTENEDOR.includes(e.modalidad as ModalidadOdoo)) {
    c.alertas.push('Aplicabilidad a 20 y 40 pies por confirmar (DEC-02)')
  }

  // S6 · vigencia
  const fueraVigencia = vigenciaOk(regla, e.fecha!)
  if (fueraVigencia) {
    c.paso('S6', false, fueraVigencia)
    return c.revision([fueraVigencia, 'Vigencia de precios pendiente de Rosario y Margiory (DEC-03)'])
  }
  c.paso('S6', true, `Fecha ${e.fecha} ≥ fuente ${regla.referenciaDesde}`)

  // S7 · resultado
  if (!regla.homologada) c.alertas.push(`Importe de referencia histórica, vigencia sin homologar: ${regla.estadoEconomico}`)
  c.paso('S7', true, `${regla.homologada ? 'Calculado' : 'Propuesto'} S/${regla.monto} por ${regla.id}`)
  return c.resultado(regla.homologada ? 'calculado' : 'propuesto', [{
    tramo: 'principal', conductorId: e.principal.conductorId, conductor: e.principal.conductor,
    ruleId: regla.id, concepto: `Tarifa ${e.destino.distrito}`, monto: regla.monto,
    estado: regla.homologada ? 'calculado' : 'propuesto',
  }], [], regla.fuente)
}

/** CR-01..CR-04: líneas por ejecutor, sin integral + retorno al mismo A ni precio Ancón por defecto */
function simularCrosland(c: Construccion): ResultadoMotor {
  const e = c.e
  c.candidatos = Object.keys(REGLAS_CROSLAND)
  c.alertas.push('Excepción de cliente: vigencia y sede pendientes (DEC-05)')

  if (e.tipoServicio !== 'Importación' || !CONTENEDOR.includes(e.modalidad as ModalidadOdoo)) {
    c.paso('S3', false, `Crosland solo cubre Importación en contenedor; llegó ${e.tipoServicio} · ${e.modalidad}`)
    return c.revision(['Variante fuera de las reglas Crosland CR-01..CR-04'])
  }
  c.paso('S3', true, `${e.tipoServicio} · ${e.modalidad} · ${e.tipoCarga}`)

  const fueraVigencia = vigenciaOk({ referenciaDesde: DESDE_CR, hasta: null }, e.fecha!)
  if (fueraVigencia) {
    c.paso('S6', false, fueraVigencia)
    return c.revision([fueraVigencia, 'Crosland cambió en 2026: validar fecha efectiva (DEC-03)'])
  }
  c.paso('S6', true, `Fecha ${e.fecha} ≥ fuente ${DESDE_CR}`)

  const A = e.principal
  const B = e.retorno
  const linea = (tramo: LineaMotor['tramo'], t: TramoEntrada, ruleId: ReglaCrosland | null, monto: number | null): LineaMotor => ({
    tramo, conductorId: t.conductorId, conductor: t.conductor, ruleId,
    concepto: ruleId ? REGLAS_CROSLAND[ruleId].concepto : (tramo === 'principal' ? 'Crosland principal' : 'Crosland devolución'),
    monto, estado: monto === null ? 'requiere_revision' : 'propuesto',
  })

  if (!A.acreditado) {
    c.paso('S1', false, 'Tramo principal sin hito real')
    return c.revision(['Tramo principal de A sin acreditar'], [linea('principal', A, null, null)])
  }
  if (!B || !B.acreditado || B.conductorId === null) {
    c.paso('S1', false, 'Devolución sin acreditar')
    return c.revision(['Devolución sin acreditar: no se sabe si es integral (CR-01) o reparto (CR-02 + CR-03/04)'],
      [linea('principal', A, null, null)])
  }

  if (B.conductorId === A.conductorId) {
    c.paso('S7', true, 'A hizo principal y devolución → CR-01')
    return c.resultado('propuesto', [linea('principal', A, 'CR-01', REGLAS_CROSLAND['CR-01'].monto)], [], FUENTE_CR)
  }

  const lineaA = linea('principal', A, 'CR-02', REGLAS_CROSLAND['CR-02'].monto)
  if (!B.almacen) {
    c.paso('S5', false, 'Depósito de devolución de B sin registrar')
    return c.revision(['Depósito de devolución de B sin verificar'], [lineaA, linea('retorno', B, null, null)])
  }
  const ruleB: ReglaCrosland = esPuerto(B.almacen) ? 'CR-04' : 'CR-03'
  c.paso('S5', true, `B devolvió en ${B.almacen} → ${ruleB}`)
  c.paso('S7', true, `A S/${REGLAS_CROSLAND['CR-02'].monto} + B S/${REGLAS_CROSLAND[ruleB].monto}, sin integral para A`)
  return c.resultado('propuesto', [lineaA, linea('retorno', B, ruleB, REGLAS_CROSLAND[ruleB].monto)], [], FUENTE_CR)
}

// ── Casos de demostración (mock controlado, NO datos reales) ────────────

const tramo = (conductorId: number, conductor: string, extra: Partial<TramoEntrada> = {}): TramoEntrada =>
  ({ conductorId, conductor, acreditado: true, ...extra })

const mock = (over: Partial<EntradaMotor> & Pick<EntradaMotor, 'servicio'>): EntradaMotor => ({
  taskId: null, clienteId: 9001, cliente: 'CLIENTE ORDINARIO (mock)', zona: 'Zona 4',
  tipoServicio: 'Importación', modalidad: 'Contenedor 40', tipoCarga: 'General', fecha: '2026-11-10',
  principal: tramo(101, 'Conductor A (mock)'), retorno: null,
  destino: null, origen: 'mock', ...over,
})

const acreditado = (distrito: string) => ({ distrito, acreditado: true, fuente: 'Caso de prueba controlado' })
const CROSLAND = { clienteId: 9002, cliente: 'CROSLAND MOTOS S.A.C', zona: 'Zona 5' }

export interface CasoDemo {
  prueba: 'P1' | 'P2' | 'P3' | 'Bloqueo'
  titulo: string
  esperado: string
  entrada: EntradaMotor
}

export const CASOS_DEMO: CasoDemo[] = [
  { prueba: 'P1', titulo: 'Zona 4 · Ate · carga general', esperado: 'S/80 propuesto (ORD-16)',
    entrada: mock({ servicio: 'S90001', destino: acreditado('Ate') }) },
  { prueba: 'P1', titulo: 'Zona 4 · San Juan de Lurigancho · carga general', esperado: 'S/90 propuesto (ORD-19), no reutiliza Ate',
    entrada: mock({ servicio: 'S90002', destino: acreditado('San Juan de Lurigancho') }) },
  { prueba: 'P1', titulo: 'Zona 4 sin dirección acreditada', esperado: 'Requiere revisión',
    entrada: mock({ servicio: 'S90003' }) },
  { prueba: 'P2', titulo: 'Crosland · A integral', esperado: 'A S/90 (CR-01)',
    entrada: mock({ servicio: 'S90011', ...CROSLAND, retorno: tramo(101, 'Conductor A (mock)', { almacen: 'Depósito Ancón' }) }) },
  { prueba: 'P2', titulo: 'Crosland · A principal + B devolución ordinaria', esperado: 'A S/70 + B S/20 (CR-02 + CR-03)',
    entrada: mock({ servicio: 'S90012', ...CROSLAND, retorno: tramo(102, 'Conductor B (mock)', { almacen: 'Depósito Ancón' }) }) },
  { prueba: 'P2', titulo: 'Crosland · B devuelve en DPW', esperado: 'A S/70 + B S/30 (CR-02 + CR-04)',
    entrada: mock({ servicio: 'S90013', ...CROSLAND, retorno: tramo(102, 'Conductor B (mock)', { almacen: 'DPW Callao' }) }) },
  { prueba: 'P2', titulo: 'Crosland · devolución sin acreditar', esperado: 'Requiere revisión, sin pago a A ni B',
    entrada: mock({ servicio: 'S90014', ...CROSLAND, retorno: tramo(102, 'Conductor B (mock)', { acreditado: false, almacen: 'DPW Callao' }) }) },
  { prueba: 'P3', titulo: 'Zona 7 · Lurín · contenedor general', esperado: 'S/100 propuesto (ORD-34)',
    entrada: mock({ servicio: 'S90021', zona: 'Zona 7', destino: acreditado('Lurín') }) },
  { prueba: 'P3', titulo: 'Zona 7 · Lurín · IMO', esperado: 'S/110 propuesto (ORD-35): cambia por carga',
    entrada: mock({ servicio: 'S90022', zona: 'Zona 7', tipoCarga: 'IMO', destino: acreditado('Lurín') }) },
  { prueba: 'P3', titulo: 'Zona 7 · Lurín · febrero 2026', esperado: 'Requiere revisión: sin vigencia para esa fecha',
    entrada: mock({ servicio: 'S90023', zona: 'Zona 7', fecha: '2026-02-12', destino: acreditado('Lurín') }) },
  { prueba: 'P3', titulo: 'Zona 7 · otra sede (Chilca)', esperado: 'Requiere revisión: Lurín no se traslada a toda la Zona 7',
    entrada: mock({ servicio: 'S90024', zona: 'Zona 7', destino: acreditado('Chilca') }) },
  { prueba: 'Bloqueo', titulo: 'Zona de tarea 1 con destino Lurín', esperado: 'Requiere revisión: zona y sede discordantes',
    entrada: mock({ servicio: 'S90031', zona: 'Zona 1', destino: acreditado('Lurín') }) },
  { prueba: 'Bloqueo', titulo: 'Variante «Provincia»', esperado: 'Requiere revisión: Provincia ≠ Zona 0',
    entrada: mock({ servicio: 'S90032', zona: 'Provincia', tipoServicio: 'Despacho', modalidad: 'Carga Suelta' }) },
  { prueba: 'Bloqueo', titulo: 'Servicio sin variante en Odoo', esperado: 'Requiere revisión: campos nulos',
    entrada: mock({ servicio: 'S90033', zona: null, modalidad: null, tipoCarga: null }) },
]

// ── Servicios reales de Odoo ────────────────────────────────────────────

/**
 * Servicio de /api/pruebas/pagos-conductores → entrada del motor. El destino
 * físico no es un dato estructurado en Odoo todavía: queda null y el motor
 * pide revisión (salvo acuerdos de cliente que no dependen del distrito).
 */
export function entradaDesdeOdoo(s: ServicioPago, devoluciones: DevolucionPago[]): EntradaMotor {
  const [d] = devoluciones.filter(x => x.padreId === s.id)
  const finalizado = esFinalizado(s.etapa)
  let retorno: TramoEntrada | null = null
  if (d) retorno = { conductorId: d.conductorId, conductor: d.conductor, acreditado: esFinalizado(d.etapa), almacen: d.almacen }
  else if (!s.devolucionOtroConductor && s.flujo === 'importacion') {
    retorno = { conductorId: s.conductorId, conductor: s.conductor, acreditado: finalizado, almacen: null }
  }
  return {
    servicio: servicioCodigo(s.name), taskId: s.id, clienteId: s.clienteId, cliente: s.cliente,
    zona: s.atributos.zona, tipoServicio: s.atributos.tipoServicio, modalidad: s.atributos.modalidad,
    tipoCarga: s.atributos.tipoCarga, fecha: s.fecha || null,
    principal: { conductorId: s.conductorId, conductor: s.conductor, acreditado: finalizado },
    retorno, destino: null, origen: 'odoo',
  }
}
