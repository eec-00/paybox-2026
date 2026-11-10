// ============================================================================
// Motor de tarifa base por zona Odoo (módulo Pruebas · Pagos conductores).
//
// Fuentes (únicas):
//   · Ficha única de ejecución · Motor de tarifas · Demo 13/11/2026
//   · Reglas de liquidación de conductores · Guía piloto v1.0 · 07/11/2026
//   · Tarifario de conductores por zonas Odoo v0.9 (Excel) · 07/11/2026
//
// SOLO SIMULACIÓN: no paga, no descuenta, no escribe en Odoo ni hace Sync.
//
// Algoritmo (ficha §3):
//   A. Leer zona Odoo + cliente (partner_id) y filtrar reglas candidatas.
//   B. Contrato especial de cliente → ruta exacta → distrito físico acreditado;
//      comprobar operación + modalidad + carga + vigencia + conductor/tramo.
//   C. Una regla inequívoca → SIMULADO con rule_id, fuente e importe histórico.
//      Falta dato, conflicto o vigencia no aplicable → REQUIERE REVISIÓN sin
//      importe (nunca S/0).
//   D. «Provincia» no es Zona 0; nunca precio por nombre de depósito, GPS o
//      tarifa genérica de zona.
//
// Acreditación de tramos (guía §2–§3): con hitos operativos de la app
// (I08/I09 principal, I12 devolución, D10/D11 despacho). El cierre
// administrativo (I13/D12, «Servicio finalizado») nunca acredita un pago.
// ============================================================================

import { sumarDias } from '@/lib/fechas'
import { esPuerto } from './adicionalesConductores'
import { servicioCodigo, type DevolucionPago, type ServicioPago } from './pagosConductores'

export const VERSION_TARIFARIO = 'Tarifario v0.9 · 07/11/2026'
/** Fecha de la fuente de los importes (Excel v0.9: Numbers «Tarifario Pago Conductores 2», 13/10/2026) */
export const FECHA_FUENTE = '2026-10-13'

const EXCEL = 'Excel tarifario v0.9'

export type EstadoMotor = 'simulado' | 'requiere_revision'

export type TipoServicioOdoo = 'Importación' | 'Exportación' | 'Traslado Interno' | 'Despacho'
export type ModalidadOdoo = 'Contenedor 20' | 'Contenedor 40' | 'Carga Suelta' | 'Isotanque'
export type CargaOdoo = 'General' | 'IMO' | 'IQBF'

const CONTENEDOR: ModalidadOdoo[] = ['Contenedor 20', 'Contenedor 40']
const TODAS: CargaOdoo[] = ['General', 'IMO', 'IQBF']

export interface Regla {
  id: string
  zona: string
  distrito: string
  /** Otros nombres del mismo distrito físico (no zonas ni depósitos) */
  alias: string[]
  operaciones: TipoServicioOdoo[]
  modalidades: ModalidadOdoo[]
  cargas: CargaOdoo[]
  monto: number
  fuente: string
  estadoFuente: string
  /** Alcance que el Excel marca «por confirmar»: simula, pero con alerta */
  alcancePorConfirmar: string | null
}

// ── Catálogo · hoja 00_TARIFARIO_MICHAEL ────────────────────────────────

/** [fila Excel, zona, distrito, alias, general, imo/iqbf, despacho] */
const FILAS: [number, string, string, string[], number, number, number][] = [
  [6, 'Zona 1', 'Callao', [], 70, 70, 80],
  [7, 'Zona 2', 'Lima (Cercado)', ['Lima', 'Cercado de Lima'], 80, 80, 90],
  [8, 'Zona 3', 'Los Olivos', [], 80, 80, 90],
  [9, 'Zona 3', 'Puente Piedra', [], 80, 80, 90],
  [10, 'Zona 3', 'Ventanilla', [], 80, 80, 90],
  [11, 'Zona 4', 'Ate', [], 80, 80, 90],
  [12, 'Zona 4', 'San Juan de Lurigancho', [], 90, 90, 100],
  [13, 'Zona 5', 'Ancón', [], 90, 90, 100],
  [14, 'Zona 6', 'Chorrillos', [], 90, 90, 100],
  [15, 'Zona 6', 'Huachipa', [], 90, 90, 100],
  [16, 'Zona 6', 'Villa el Salvador', [], 90, 90, 100],
  [17, 'Zona 7', 'Lurín', [], 100, 110, 110],
]

const ALCANCE_CONTENEDOR = 'Alcance 20/40 e importación/exportación por confirmar (Excel v0.9)'

function claveDistrito(d: string): string {
  return normalizar(d).replace(/\(.*\)/, '').trim().replace(/ /g, '-')
}

export const REGLAS_ORDINARIAS: Regla[] = FILAS.flatMap(([fila, zona, distrito, alias, general, imo, despacho]) => {
  const id = `${zona.replace('Zona ', 'Z')}-${claveDistrito(distrito)}`
  const base = {
    zona, distrito, alias,
    fuente: `${EXCEL} · 00_TARIFARIO_MICHAEL fila ${fila}`,
    estadoFuente: 'HISTÓRICA · NO APROBADA',
  }
  return [
    { ...base, id: `${id}-GEN`, operaciones: ['Importación', 'Exportación'], modalidades: CONTENEDOR, cargas: ['General'], monto: general, alcancePorConfirmar: ALCANCE_CONTENEDOR },
    { ...base, id: `${id}-IMO`, operaciones: ['Importación', 'Exportación'], modalidades: CONTENEDOR, cargas: ['IMO', 'IQBF'], monto: imo, alcancePorConfirmar: ALCANCE_CONTENEDOR },
    { ...base, id: `${id}-DES`, operaciones: ['Despacho'], modalidades: ['Carga Suelta'], cargas: TODAS, monto: despacho, alcancePorConfirmar: null },
  ] satisfies Regla[]
})

// ── Catálogo · hoja 02_RUTAS_Y_EXCEPCIONES ──────────────────────────────

function itk(id: string, fila: number, operacion: TipoServicioOdoo, monto: number): Regla {
  return {
    id, zona: 'Zona 1', distrito: 'Callao', alias: [], operaciones: [operacion], modalidades: ['Isotanque'],
    cargas: TODAS, monto, fuente: `${EXCEL} · 02_RUTAS_Y_EXCEPCIONES fila ${fila}`,
    estadoFuente: 'LITERAL HISTÓRICO · NO HOMOLOGADO', alcancePorConfirmar: null,
  }
}

export const REGLAS_ITK: Regla[] = [
  itk('ITK-01', 22, 'Importación', 70),
  itk('ITK-02', 23, 'Exportación', 60),
  itk('ITK-03', 24, 'Traslado Interno', 60),
]

export const TARIFARIO: Regla[] = [...REGLAS_ORDINARIAS, ...REGLAS_ITK]

export type ConceptoRuta = 'Contenedor general' | 'Despacho carga suelta' | 'Traslado isotanque'

export interface RutaEspecial {
  id: string
  fila: number
  ruta: string
  concepto: ConceptoRuta
  monto: number
  estadoFuente: string
  /** Solo «MATCH EXACTO / POR APROBAR» se simula; el resto queda en revisión */
  simulable: boolean
}

const ruta = (id: string, fila: number, r: string, concepto: ConceptoRuta, monto: number, estadoFuente: string): RutaEspecial =>
  ({ id, fila, ruta: r, concepto, monto, estadoFuente, simulable: estadoFuente === 'RUTA HISTÓRICA · MATCH EXACTO / POR APROBAR' })

const NO_ACTIVAR = 'RUTA HISTÓRICA · PRUEBA / NO ACTIVAR'
const MANUAL = 'RUTA HISTÓRICA · MANUAL HASTA DEFINIR'
const POR_APROBAR = 'RUTA HISTÓRICA · MATCH EXACTO / POR APROBAR'

export const RUTAS_ESPECIALES: RutaEspecial[] = [
  ruta('RT01', 5, 'CALLAO - CHANCAY - CALLAO', 'Contenedor general', 130, NO_ACTIVAR),
  ruta('RT02', 6, 'CALLAO - CHANCAY - CALLAO - CHANCAY', 'Contenedor general', 200, NO_ACTIVAR),
  ruta('RT03', 7, 'CALLAO - CHANCAY - LURÍN', 'Contenedor general', 180, NO_ACTIVAR),
  ruta('RT04', 8, 'CALLAO - CHANCAY - LURÍN - CHANCAY', 'Contenedor general', 250, NO_ACTIVAR),
  ruta('RT05', 9, 'CALLAO - HUACHO', 'Despacho carga suelta', 150, NO_ACTIVAR),
  ruta('RT06', 10, 'LURÍN - HUACHO', 'Despacho carga suelta', 200, NO_ACTIVAR),
  ruta('RT07', 11, 'CHILCA Y PUNTA HERMOSA', 'Contenedor general', 120, MANUAL),
  ruta('RT08', 12, 'CALLAO - MELCHORITA', 'Contenedor general', 200, POR_APROBAR),
  ruta('RT09', 13, 'NEXA', 'Traslado isotanque', 110, MANUAL),
  ruta('RT10', 14, 'CALLAO - CHANCAY - PUCUSANA', 'Despacho carga suelta', 130, POR_APROBAR),
  ruta('RT11', 15, 'LURÍN - CHANCAY', 'Despacho carga suelta', 180, POR_APROBAR),
  ruta('RT12', 16, 'CIENEGUILLA', 'Despacho carga suelta', 110, MANUAL),
  ruta('RT13', 17, 'CALERA', 'Despacho carga suelta', 220, MANUAL),
]

/** CR-01..CR-04 (Excel 02 filas 18–21; guía §3.06 TDC). Zona original del Sxxxxx. */
export const REGLAS_CROSLAND = {
  'CR-01': { fila: 18, monto: 90, concepto: 'Integral A (principal + devolución)' },
  'CR-02': { fila: 19, monto: 70, concepto: 'Tramo principal A' },
  'CR-03': { fila: 20, monto: 20, concepto: 'Retorno B a depósito ordinario' },
  'CR-04': { fila: 21, monto: 30, concepto: 'Retorno B a DPW/APMT' },
} as const
export type ReglaCrosland = keyof typeof REGLAS_CROSLAND

export interface ClienteEspecial {
  clave: 'crosland'
  /** partner_id de Odoo; null hasta registrarlo (se identifica por nombre exacto, con alerta) */
  odooId: number | null
  nombreOdoo: string
}

export const CLIENTES_ESPECIALES: ClienteEspecial[] = [
  { clave: 'crosland', odooId: null, nombreOdoo: 'CROSLAND MOTOS S.A.C' },
]

// ── Entrada ─────────────────────────────────────────────────────────────

/** Marca de hito de la app que acredita un tramo */
export interface HitoMarca {
  /** Código de la guía (I08, I12, D10…) o clave de la app si la guía no lo codifica */
  codigo: string
  etiqueta: string
  /** 'YYYY-MM-DD HH:mm' */
  momento: string
}

export interface TramoEntrada {
  conductorId: number | null
  conductor: string | null
  /** Hito operativo que acredita el tramo; null si no está marcado */
  hito: HitoMarca | null
  /** Solo devolución: depósito físico */
  almacen?: string | null
}

export interface EntradaMotor {
  servicio: string
  taskId: number | null
  clienteId: number | null
  cliente: string | null
  zona: string | null
  tipoServicio: string | null
  modalidad: string | null
  tipoCarga: string | null
  fecha: string | null
  principal: TramoEntrada
  /** Devolución del vacío (importación); null si no hay tramo de retorno */
  retorno: TramoEntrada | null
  /** Distrito físico económico acreditado por Operaciones; null si no hay */
  destino: { distrito: string; acreditado: boolean; fuente: string } | null
  /** Itinerario completo acreditado (rutas especiales); null si no hay */
  itinerario: string | null
  origen: 'odoo' | 'mock'
}

// ── Salida ──────────────────────────────────────────────────────────────

/** Línea de liquidación simulada (guía §4) */
export interface LineaMotor {
  servicio: string
  tramo: 'principal' | 'retorno'
  conductorId: number | null
  conductor: string | null
  concepto: string
  ruleId: string | null
  monto: number | null
  estado: EstadoMotor
  version: string
  hito: HitoMarca | null
  fuente: string | null
}

export interface PasoTraza {
  paso: 'A' | 'B' | 'C' | 'D'
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
  motivos: string[]
  alertas: string[]
  candidatos: string[]
  traza: PasoTraza[]
  /** Siempre false: no hay pagos, descuentos ni sincronización */
  efectoFinanciero: false
}

// ── Utilidades ──────────────────────────────────────────────────────────

/** Mayúsculas, sin tildes, guiones con un espacio a cada lado */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim()
}

const RE_SERVICIO = /^S\d{5}$/

const CAMPOS: [keyof EntradaMotor, string][] = [
  ['clienteId', 'ID de cliente (partner_id)'],
  ['zona', 'zona Odoo'],
  ['tipoServicio', 'tipo de servicio'],
  ['modalidad', 'modalidad'],
  ['tipoCarga', 'tipo de carga'],
  ['fecha', 'fecha del servicio'],
]

export function camposNulos(e: EntradaMotor): string[] {
  const faltan = CAMPOS.filter(([k]) => e[k] === null || e[k] === '').map(([, l]) => l)
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

function coincideDistrito(r: Regla, distrito: string): boolean {
  const d = normalizar(distrito)
  return [r.distrito, ...r.alias].some(n => normalizar(n) === d)
}

function conceptoCompatible(c: ConceptoRuta, e: EntradaMotor): boolean {
  switch (c) {
    case 'Contenedor general': return CONTENEDOR.includes(e.modalidad as ModalidadOdoo) && e.tipoCarga === 'General'
    case 'Despacho carga suelta': return e.tipoServicio === 'Despacho' && e.modalidad === 'Carga Suelta'
    case 'Traslado isotanque': return e.tipoServicio === 'Traslado Interno' && e.modalidad === 'Isotanque'
  }
}

/** Sin vigencia aprobada: no se aplica antes de la fecha de la fuente (sin retroactivo) */
function fueraDeVigencia(fecha: string): string | null {
  return fecha < FECHA_FUENTE
    ? `Fecha ${fecha} anterior a la fuente del tarifario (${FECHA_FUENTE}): sin vigencia para esa fecha, no se aplica retroactivo`
    : null
}

const ALERTA_VIGENCIA = 'Importe histórico no aprobado: faltan vigencia y aprobación (Margiory valida importes y fechas)'

/** RF guía §4: un tramo admite una sola línea por conductor */
export function lineasDuplicadas(lineas: LineaMotor[]): string[] {
  const vistas = new Set<string>()
  const dup: string[] = []
  for (const l of lineas) {
    const k = `${l.servicio}|${l.tramo}|${l.conductorId}`
    if (vistas.has(k)) dup.push(k)
    vistas.add(k)
  }
  return dup
}

// ── Motor ───────────────────────────────────────────────────────────────

class Corrida {
  traza: PasoTraza[] = []
  alertas: string[] = []
  candidatos: string[] = []
  constructor(readonly e: EntradaMotor) {}

  paso(paso: PasoTraza['paso'], ok: boolean, detalle: string) {
    this.traza.push({ paso, ok, detalle })
  }

  linea(tramo: LineaMotor['tramo'], t: TramoEntrada, concepto: string, ruleId: string | null, monto: number | null, fuente: string | null): LineaMotor {
    return {
      servicio: this.e.servicio, tramo, conductorId: t.conductorId, conductor: t.conductor, concepto, ruleId, monto,
      estado: monto === null ? 'requiere_revision' : 'simulado', version: VERSION_TARIFARIO, hito: t.hito, fuente,
    }
  }

  revision(motivos: string[], lineas?: LineaMotor[]): ResultadoMotor {
    return this.cerrar(lineas ?? [this.linea('principal', this.e.principal, 'Tarifa base', null, null, null)], motivos)
  }

  cerrar(lineas: LineaMotor[], motivos: string[] = []): ResultadoMotor {
    const dup = lineasDuplicadas(lineas)
    if (dup.length) {
      this.paso('C', false, `Líneas duplicadas: ${dup.join(', ')}`)
      lineas = lineas.map(l => ({ ...l, monto: null, estado: 'requiere_revision' }))
      motivos = [...motivos, 'Pago duplicado detectado']
    }
    const revision = motivos.length > 0 || lineas.some(l => l.estado === 'requiere_revision')
    if (!revision) this.paso('C', true, `SIMULADO: ${lineas.map(l => `${l.ruleId} S/${l.monto}`).join(' + ')}`)
    return {
      servicio: this.e.servicio, origen: this.e.origen,
      estado: revision ? 'requiere_revision' : 'simulado',
      total: revision ? null : lineas.reduce((t, l) => t + l.monto!, 0),
      lineas, ruleIds: lineas.flatMap(l => l.ruleId ? [l.ruleId] : []),
      motivos, alertas: this.alertas, candidatos: this.candidatos, traza: this.traza, efectoFinanciero: false,
    }
  }
}

export function simularTarifa(e: EntradaMotor): ResultadoMotor {
  const c = new Corrida(e)

  // A · servicio, zona y cliente
  if (!RE_SERVICIO.test(e.servicio)) {
    c.paso('A', false, `Código de servicio inválido: «${e.servicio}»`)
    return c.revision(['Servicio sin código Sxxxxx'])
  }
  const nulos = camposNulos(e)
  if (nulos.length) {
    c.paso('A', false, `Campos nulos: ${nulos.join(', ')}`)
    return c.revision([`Faltan datos de Odoo: ${nulos.join(', ')}`])
  }
  c.paso('A', true, `${e.servicio} · cliente ${e.clienteId} (${e.cliente}) · ${e.zona} · ${e.fecha}`)

  // B1 · contrato especial de cliente
  const especial = clienteEspecial(e)
  if (especial) {
    if (especial.porNombre) c.alertas.push(`Cliente identificado por nombre exacto «${especial.cliente.nombreOdoo}»: falta registrar su partner_id`)
    c.paso('B', true, `Contrato especial ${especial.cliente.nombreOdoo}: prima sobre la tarifa de zona`)
    return simularCrosland(c)
  }

  // B2 · ruta exacta
  if (e.itinerario) return simularRuta(c, e.itinerario)

  // D · Provincia
  if (e.zona === 'Provincia') {
    c.paso('D', false, '«Provincia» sin itinerario acreditado')
    return c.revision(['«Provincia» no tiene tarifa ordinaria ni equivale a Zona 0: requiere ruta especial con itinerario completo acreditado'])
  }

  // B3 · distrito físico acreditado
  c.candidatos = TARIFARIO.filter(r => r.zona === e.zona).map(r => r.id)
  if (!e.destino) {
    c.paso('B', false, 'Sin destino físico económico acreditado')
    return c.revision(['Destino físico sin acreditar (lo verifica Operaciones): la zona sola no determina el importe'])
  }
  if (!e.destino.acreditado) {
    c.paso('B', false, `Destino «${e.destino.distrito}» sin acreditar (${e.destino.fuente})`)
    return c.revision([`Destino «${e.destino.distrito}» no acreditado por Operaciones`])
  }
  const delDistrito = TARIFARIO.filter(r => coincideDistrito(r, e.destino!.distrito))
  if (delDistrito.length === 0) {
    c.paso('B', false, `«${e.destino.distrito}» sin importe literal en el Excel`)
    return c.revision([`«${e.destino.distrito}» no tiene importe literal en el tarifario: no se extiende la tarifa de otro distrito de la zona`])
  }
  const enZona = delDistrito.filter(r => r.zona === e.zona)
  if (enZona.length === 0) {
    c.paso('B', false, `«${e.destino.distrito}» es ${delDistrito[0].zona}; la tarea dice ${e.zona}`)
    return c.revision([`Zona de la tarea (${e.zona}) y destino (${e.destino.distrito}, ${delDistrito[0].zona}) no coinciden: no se corrige la zona por deducción`])
  }
  c.candidatos = enZona.map(r => r.id)
  c.paso('B', true, `Destino acreditado: ${e.destino.distrito} (${e.destino.fuente})`)

  const exactas = enZona.filter(r =>
    r.operaciones.includes(e.tipoServicio as TipoServicioOdoo)
    && r.modalidades.includes(e.modalidad as ModalidadOdoo)
    && r.cargas.includes(e.tipoCarga as CargaOdoo))
  if (exactas.length !== 1) {
    const detalle = exactas.length === 0
      ? `Ninguna regla de ${e.destino.distrito} cubre ${e.tipoServicio} · ${e.modalidad} · ${e.tipoCarga}`
      : `Reglas en conflicto: ${exactas.map(r => r.id).join(', ')}`
    c.paso('B', false, detalle)
    return c.revision([detalle])
  }
  const [regla] = exactas
  c.paso('B', true, `${regla.id}: ${e.tipoServicio} · ${e.modalidad} · ${e.tipoCarga}`)

  const vig = fueraDeVigencia(e.fecha!)
  if (vig) {
    c.paso('B', false, vig)
    return c.revision([vig])
  }
  if (!e.principal.hito) {
    c.paso('B', false, 'Tramo sin hito operativo marcado')
    return c.revision(['Tramo del conductor sin hito operativo acreditado (el cierre administrativo no cuenta)'])
  }
  c.paso('B', true, `Tramo acreditado por ${e.principal.hito.codigo} ${e.principal.hito.momento}`)

  if (regla.alcancePorConfirmar) c.alertas.push(regla.alcancePorConfirmar)
  c.alertas.push(`${regla.estadoFuente}. ${ALERTA_VIGENCIA}`)
  return c.cerrar([c.linea('principal', e.principal, `Tarifa ${regla.distrito}`, regla.id, regla.monto, regla.fuente)])
}

function simularRuta(c: Corrida, itinerario: string): ResultadoMotor {
  const e = c.e
  const r = RUTAS_ESPECIALES.find(x => normalizar(x.ruta) === normalizar(itinerario))
  c.candidatos = RUTAS_ESPECIALES.map(x => x.id)
  if (!r) {
    c.paso('B', false, `Itinerario «${itinerario}» sin coincidencia exacta`)
    return c.revision([`El itinerario «${itinerario}» no coincide exactamente con ninguna ruta especial`])
  }
  c.candidatos = [r.id]
  if (!conceptoCompatible(r.concepto, e)) {
    c.paso('B', false, `${r.id} es «${r.concepto}»; el producto es ${e.tipoServicio} · ${e.modalidad} · ${e.tipoCarga}`)
    return c.revision([`Producto distinto al de la ruta ${r.id} (${r.concepto})`])
  }
  if (!r.simulable) {
    c.paso('B', false, `${r.id}: ${r.estadoFuente}`)
    return c.revision([`Ruta ${r.id} en estado «${r.estadoFuente}»: no se simula importe`])
  }
  const vig = fueraDeVigencia(e.fecha!)
  if (vig) {
    c.paso('B', false, vig)
    return c.revision([vig])
  }
  if (!e.principal.hito) {
    c.paso('B', false, 'Ruta sin hito operativo marcado')
    return c.revision(['Tramo del conductor sin hito operativo acreditado'])
  }
  c.paso('B', true, `${r.id} ${r.ruta} · ${r.concepto}`)
  c.alertas.push(`${r.estadoFuente}. ${ALERTA_VIGENCIA}`)
  return c.cerrar([c.linea('principal', e.principal, `Ruta ${r.ruta}`, r.id, r.monto, `${EXCEL} · 02_RUTAS_Y_EXCEPCIONES fila ${r.fila}`)])
}

/** Guía §3.06: líneas por ejecutor; A integral nunca recibe otro tramo base */
function simularCrosland(c: Corrida): ResultadoMotor {
  const e = c.e
  c.candidatos = Object.keys(REGLAS_CROSLAND)
  const fuente = (id: ReglaCrosland) => `${EXCEL} · 02_RUTAS_Y_EXCEPCIONES fila ${REGLAS_CROSLAND[id].fila} · Guía v1.0 §3.06`
  const linea = (tramo: LineaMotor['tramo'], t: TramoEntrada, id: ReglaCrosland | null) =>
    c.linea(tramo, t, id ? REGLAS_CROSLAND[id].concepto : (tramo === 'principal' ? 'Crosland principal' : 'Crosland retorno'),
      id, id ? REGLAS_CROSLAND[id].monto : null, id ? fuente(id) : null)

  if (e.tipoServicio !== 'Importación') {
    c.paso('B', false, `Crosland con ${e.tipoServicio}: los repartos A/B son de importación`)
    return c.revision(['Los repartos Crosland (CR-01..CR-04) cubren importación con devolución del vacío'])
  }
  const vig = fueraDeVigencia(e.fecha!)
  if (vig) {
    c.paso('B', false, vig)
    return c.revision([vig])
  }

  const A = e.principal
  const B = e.retorno
  if (!A.hito) {
    c.paso('B', false, 'Principal sin I08/I09')
    return c.revision(['Tramo principal de A sin I08/I09 acreditado'], [linea('principal', A, null)])
  }
  c.paso('B', true, `Principal de ${A.conductor} acreditado por ${A.hito.codigo} ${A.hito.momento}`)
  if (!B || !B.hito || B.conductorId === null) {
    c.paso('B', false, 'Devolución sin I12')
    return c.revision(['Devolución sin I12 acreditado: no se sabe si es integral (CR-01) o reparto A/B'], [linea('principal', A, null)])
  }
  c.alertas.push('Excepción de cliente pendiente de vigencia y sede (Excel v0.9); B requiere constancia de Operaciones')

  if (B.conductorId === A.conductorId) {
    c.paso('B', true, `Mismo conductor devolvió (${B.hito.codigo} ${B.hito.momento}) → CR-01`)
    return c.cerrar([linea('principal', A, 'CR-01')])
  }
  const lineaA = linea('principal', A, 'CR-02')
  if (!B.almacen) {
    c.paso('B', false, `Devolución de ${B.conductor} sin depósito físico`)
    return c.revision(['Depósito de devolución de B sin registrar'], [lineaA, linea('retorno', B, null)])
  }
  const idB: ReglaCrosland = esPuerto(B.almacen) ? 'CR-04' : 'CR-03'
  c.paso('B', true, `${B.conductor} devolvió en ${B.almacen} (${B.hito.codigo} ${B.hito.momento}) → ${idB}`)
  return c.cerrar([lineaA, linea('retorno', B, idB)])
}

// ── Servicios reales de Odoo ────────────────────────────────────────────

/** Hito que acredita el tramo principal por flujo (guía §2–§3), con su código */
const HITOS_PRINCIPAL: Record<string, [string, string][]> = {
  importacion: [['salida_cliente', 'I09'], ['fin_descarga', 'I08']],
  despacho: [['salida_destino', 'D11'], ['fin_descarga', 'D10']],
  exportacion: [['entrega_contenedor_lleno', 'Entrega contenedor lleno']],
  traslado_interno: [['fin_operacion_b', 'Fin operación punto B']],
  isotanque_lleno: [['fin_descarga_entrega', 'Fin descarga/entrega']],
  isotanque_vacio: [['entrega_vacio', 'Entrega isotanque vacío']],
}

function momento(fecha: string | false, min: number): string {
  const base = fecha || '1970-01-01'
  const dia = sumarDias(base, Math.floor(min / 1440))
  const m = ((min % 1440) + 1440) % 1440
  return `${dia} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function hitoDe(s: ServicioPago, opciones: [string, string][]): HitoMarca | null {
  for (const [key, codigo] of opciones) {
    const h = s.horarios.linea.find(x => x.key === key)
    if (h && h.min !== null) return { codigo, etiqueta: h.label, momento: momento(s.fecha, h.min) }
  }
  return null
}

/**
 * Servicio de /api/pruebas/pagos-conductores → entrada del motor. El destino
 * físico y el itinerario no son datos estructurados en Odoo: quedan null y el
 * motor pide revisión (salvo el contrato Crosland, que no depende del distrito).
 */
export function entradaDesdeOdoo(s: ServicioPago, devoluciones: DevolucionPago[]): EntradaMotor {
  const [d] = devoluciones.filter(x => x.padreId === s.id)
  let retorno: TramoEntrada | null = null
  if (d) {
    retorno = {
      conductorId: d.conductorId, conductor: d.conductor, almacen: d.almacen,
      hito: d.devueltoMin === null ? null : { codigo: 'I12', etiqueta: 'Contenedor vacío devuelto (subtarea)', momento: momento(d.fecha, d.devueltoMin) },
    }
  } else if (s.flujo === 'importacion' && !s.devolucionOtroConductor) {
    retorno = { conductorId: s.conductorId, conductor: s.conductor, almacen: null, hito: hitoDe(s, [['contenedor_devuelto', 'I12']]) }
  }
  return {
    servicio: servicioCodigo(s.name), taskId: s.id, clienteId: s.clienteId, cliente: s.cliente,
    zona: s.atributos.zona, tipoServicio: s.atributos.tipoServicio, modalidad: s.atributos.modalidad,
    tipoCarga: s.atributos.tipoCarga, fecha: s.fecha || null,
    principal: { conductorId: s.conductorId, conductor: s.conductor, hito: hitoDe(s, HITOS_PRINCIPAL[s.flujo] ?? []) },
    retorno, destino: null, itinerario: null, origen: 'odoo',
  }
}

// ── Casos de demostración (mock controlado, NO datos reales) ────────────

const I08: HitoMarca = { codigo: 'I08', etiqueta: 'Fin descarga', momento: '2026-11-10 14:20' }
const I12: HitoMarca = { codigo: 'I12', etiqueta: 'Contenedor vacío devuelto', momento: '2026-11-10 18:05' }
const D10: HitoMarca = { codigo: 'D10', etiqueta: 'Fin descarga', momento: '2026-11-10 15:00' }

const A = (hito: HitoMarca | null = I08): TramoEntrada => ({ conductorId: 101, conductor: 'Conductor A (mock)', hito })
const B = (almacen: string | null, hito: HitoMarca | null = I12): TramoEntrada => ({ conductorId: 102, conductor: 'Conductor B (mock)', hito, almacen })

const mock = (over: Partial<EntradaMotor> & Pick<EntradaMotor, 'servicio'>): EntradaMotor => ({
  taskId: null, clienteId: 9001, cliente: 'CLIENTE ORDINARIO (mock)', zona: 'Zona 4',
  tipoServicio: 'Importación', modalidad: 'Contenedor 40', tipoCarga: 'General', fecha: '2026-11-10',
  principal: A(), retorno: null, destino: null, itinerario: null, origen: 'mock', ...over,
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
  { prueba: 'P1', titulo: 'Zona 4 · Ate · carga general', esperado: 'SIMULADO S/80',
    entrada: mock({ servicio: 'S90001', destino: acreditado('Ate') }) },
  { prueba: 'P1', titulo: 'Zona 4 · San Juan de Lurigancho · carga general', esperado: 'SIMULADO S/90 (misma zona, distinto destino)',
    entrada: mock({ servicio: 'S90002', destino: acreditado('San Juan de Lurigancho') }) },
  { prueba: 'P1', titulo: 'Zona 4 sin dirección acreditada', esperado: 'REQUIERE REVISIÓN',
    entrada: mock({ servicio: 'S90003' }) },
  { prueba: 'P2', titulo: 'Crosland · A hace el integral', esperado: 'SIMULADO A S/90 (CR-01)',
    entrada: mock({ servicio: 'S90011', ...CROSLAND, retorno: { ...A(I12), almacen: 'Depósito ordinario' } }) },
  { prueba: 'P2', titulo: 'Crosland · A principal + B devolución ordinaria', esperado: 'SIMULADO A S/70 + B S/20',
    entrada: mock({ servicio: 'S90012', ...CROSLAND, retorno: B('Depósito ordinario') }) },
  { prueba: 'P2', titulo: 'Crosland · B devuelve en DPW', esperado: 'SIMULADO A S/70 + B S/30',
    entrada: mock({ servicio: 'S90013', ...CROSLAND, retorno: B('DPW Callao') }) },
  { prueba: 'P2', titulo: 'Crosland · B sin I12', esperado: 'REQUIERE REVISIÓN, sin pago a A ni B',
    entrada: mock({ servicio: 'S90014', ...CROSLAND, retorno: B('DPW Callao', null) }) },
  { prueba: 'P3', titulo: 'Zona 7 · Lurín · contenedor general', esperado: 'SIMULADO S/100',
    entrada: mock({ servicio: 'S90021', zona: 'Zona 7', destino: acreditado('Lurín') }) },
  { prueba: 'P3', titulo: 'Zona 7 · Lurín · IMO', esperado: 'SIMULADO S/110 (cambia por carga)',
    entrada: mock({ servicio: 'S90022', zona: 'Zona 7', tipoCarga: 'IMO', destino: acreditado('Lurín') }) },
  { prueba: 'P3', titulo: 'Zona 7 · Lurín · servicio de febrero 2026', esperado: 'REQUIERE REVISIÓN por vigencia',
    entrada: mock({ servicio: 'S90023', zona: 'Zona 7', fecha: '2026-02-12', destino: acreditado('Lurín') }) },
  { prueba: 'P3', titulo: 'Zona 7 · Pachacamac', esperado: 'REQUIERE REVISIÓN: Lurín no se traslada a toda la Zona 7',
    entrada: mock({ servicio: 'S90024', zona: 'Zona 7', destino: acreditado('Pachacamac') }) },
  { prueba: 'Bloqueo', titulo: 'Tarea en Zona 1 con destino Lurín', esperado: 'REQUIERE REVISIÓN: zona y destino discordantes',
    entrada: mock({ servicio: 'S90031', zona: 'Zona 1', destino: acreditado('Lurín') }) },
  { prueba: 'Bloqueo', titulo: 'Provincia sin itinerario', esperado: 'REQUIERE REVISIÓN: Provincia ≠ Zona 0',
    entrada: mock({ servicio: 'S90032', zona: 'Provincia', tipoServicio: 'Despacho', modalidad: 'Carga Suelta', principal: A(D10) }) },
  { prueba: 'Bloqueo', titulo: 'Provincia · ruta CALLAO - MELCHORITA', esperado: 'SIMULADO S/200 (RT08, match exacto)',
    entrada: mock({ servicio: 'S90033', zona: 'Provincia', itinerario: 'CALLAO - MELCHORITA' }) },
  { prueba: 'Bloqueo', titulo: 'Provincia · ruta CALLAO - HUACHO', esperado: 'REQUIERE REVISIÓN: ruta «no activar»',
    entrada: mock({ servicio: 'S90034', zona: 'Provincia', tipoServicio: 'Despacho', modalidad: 'Carga Suelta', itinerario: 'CALLAO - HUACHO', principal: A(D10) }) },
  { prueba: 'Bloqueo', titulo: 'Ate sin hito operativo (solo cierre administrativo)', esperado: 'REQUIERE REVISIÓN',
    entrada: mock({ servicio: 'S90035', destino: acreditado('Ate'), principal: A(null) }) },
  { prueba: 'Bloqueo', titulo: 'Servicio sin variante en Odoo', esperado: 'REQUIERE REVISIÓN: campos nulos',
    entrada: mock({ servicio: 'S90036', zona: null, modalidad: null, tipoCarga: null }) },
]
