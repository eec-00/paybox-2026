// ============================================================================
// Pago a conductores por servicio (módulo Pruebas).
//
// La clasificación del servicio NO está en un campo de la tarea: sale del
// producto (variante) de la línea de venta asociada. Ese producto
// "Servicio de transporte" tiene 4 atributos en Odoo:
//   Tipo de Servicio:   Importación | Exportación | Traslado Interno | Despacho
//   Modalidad de Carga: Isotanque | Carga Suelta | Contenedor 20 | Contenedor 40
//   Tipo de Carga:      General | IMO | IQBF
//   Zona:               Zona 1..7 | Provincia
//
// El pago se calcula por semana de sábado a viernes. El básico mensual
// (S/ 1300) no entra en este cálculo.
//
// Tarifas (tabla de operaciones). Por ahora solo Zona 1 a 4; Zona 5, 6, 7 y
// Provincia quedan "sin tarifa" hasta definir su equivalencia con las rutas
// con nombre de la tabla (Chilca, Chancay, Huacho, etc.).
// ============================================================================

export interface AtributosServicio {
  tipoServicio: string | null
  modalidad: string | null
  tipoCarga: string | null
  zona: string | null
}

/** Servicio del mes tal como lo devuelve /api/pruebas/pagos-conductores */
export interface ServicioPago {
  id: number
  name: string
  fecha: string | false
  etapa: string | null
  cliente: string | null
  conductorId: number | null
  conductor: string | null
  placa: string | null
  atributos: AtributosServicio
}

/** Nombre del atributo en Odoo → clave en AtributosServicio */
export const ATRIBUTOS_ODOO: Record<string, keyof AtributosServicio> = {
  'Tipo de Servicio': 'tipoServicio',
  'Modalidad de Carga': 'modalidad',
  'Tipo de Carga': 'tipoCarga',
  'Zona': 'zona',
}

export type ColumnaTarifa =
  | 'contenedor_general'
  | 'contenedor_imo'
  | 'carga_suelta'
  | 'isotanque_importacion'
  | 'isotanque_exportacion'
  | 'isotanque_traslado'

export const COLUMNA_LABEL: Record<ColumnaTarifa, string> = {
  contenedor_general: 'Contenedor carga general',
  contenedor_imo: 'Contenedor IMO / IQBF',
  carga_suelta: 'Carga suelta',
  isotanque_importacion: 'Isotanque importación (lleno)',
  isotanque_exportacion: 'Isotanque exportación (vacío)',
  isotanque_traslado: 'Traslado isotanque',
}

export const ZONAS_CON_TARIFA = ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4'] as const

export const TARIFAS: Record<ColumnaTarifa, Partial<Record<string, number>>> = {
  contenedor_general:    { 'Zona 1': 70, 'Zona 2': 80, 'Zona 3': 90,  'Zona 4': 100 },
  contenedor_imo:        { 'Zona 1': 70, 'Zona 2': 80, 'Zona 3': 90,  'Zona 4': 110 },
  carga_suelta:          { 'Zona 1': 80, 'Zona 2': 90, 'Zona 3': 100, 'Zona 4': 110 },
  isotanque_importacion: { 'Zona 1': 70 },
  isotanque_exportacion: { 'Zona 1': 60 },
  isotanque_traslado:    { 'Zona 1': 60 },
}

export interface TarifaResultado {
  columna: ColumnaTarifa | null
  monto: number | null
  /** Por qué no tiene monto (si monto es null) */
  motivo: string | null
}

function columnaPara(a: AtributosServicio): ColumnaTarifa | null {
  switch (a.modalidad) {
    case 'Contenedor 20':
    case 'Contenedor 40':
      if (a.tipoCarga === 'General') return 'contenedor_general'
      if (a.tipoCarga === 'IMO' || a.tipoCarga === 'IQBF') return 'contenedor_imo'
      return null
    case 'Carga Suelta':
      return 'carga_suelta'
    case 'Isotanque':
      if (a.tipoServicio === 'Importación') return 'isotanque_importacion'
      if (a.tipoServicio === 'Exportación') return 'isotanque_exportacion'
      if (a.tipoServicio === 'Traslado Interno') return 'isotanque_traslado'
      return null
    default:
      return null
  }
}

export function calcularTarifa(a: AtributosServicio): TarifaResultado {
  if (!a.zona || !a.modalidad) {
    return { columna: null, monto: null, motivo: 'Sin producto/atributos en Odoo' }
  }
  const columna = columnaPara(a)
  if (!columna) {
    return { columna: null, monto: null, motivo: `Sin tarifa para ${a.tipoServicio ?? '—'} · ${a.modalidad}` }
  }
  if (!(ZONAS_CON_TARIFA as readonly string[]).includes(a.zona)) {
    return { columna, monto: null, motivo: `${a.zona} aún sin tarifa` }
  }
  const monto = TARIFAS[columna][a.zona]
  if (monto === undefined) {
    return { columna, monto: null, motivo: `${COLUMNA_LABEL[columna]} sin tarifa en ${a.zona}` }
  }
  return { columna, monto, motivo: null }
}

/** "S01189 - Servicio de transporte (...)" → "S01189" */
export function servicioCodigo(name: string): string {
  return name.includes(' - ') ? name.split(' - ')[0] : name
}

// ── Semana de pago (sábado a viernes) ───────────────────────────────────

export function sabadoDe(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  r.setDate(r.getDate() - ((r.getDay() + 1) % 7))
  return r
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function rangoSemanaPago(sabado: Date): { start: string; end: string } {
  const viernes = new Date(sabado)
  viernes.setDate(sabado.getDate() + 6)
  return { start: toDateStr(sabado), end: toDateStr(viernes) }
}
