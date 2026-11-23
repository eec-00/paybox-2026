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
// El pago se calcula por semana de sábado a viernes. La tarifa base la da
// motorZonas.ts (ficha, guía v1.0 y tarifario v0.9) y los adicionales
// adicionalesConductores.ts (guía v1.0). El básico mensual no entra.
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
  /** partner_id de Odoo (null si la tarea no tiene cliente) */
  clienteId: number | null
  conductorId: number | null
  conductor: string | null
  placa: string | null
  atributos: AtributosServicio
  /** Hora de cita en minutos desde la medianoche (null si no tiene) */
  horaCita: number | null
  /** Flujo de hitos de la app (importacion, exportacion, despacho, ...) */
  flujo: string
  /** Importación cuya devolución de vacío queda a cargo de otro conductor */
  devolucionOtroConductor: boolean
  horarios: HorariosServicio
  /** Hora de la cita de devolución en minutos (Fecha de Devolucion + Hora de Devolucion de Odoo, contada desde la medianoche del día de recojo). null si no hay */
  citaDevolucion?: number | null
  /** «Almacén de Destino» de la tarea en Odoo (dirección de entrega del cliente) con su distrito */
  almacenDestino?: { id: number; nombre: string; distrito: string | null } | null
}

/** Horarios marcados por el conductor, en minutos desde la medianoche del
 * día de programación (> 1440 si cruzó la medianoche). */
export interface HorariosServicio {
  /** Salida de cochera (inicio de ruta) */
  inicio: number | null
  /** Último hito operativo marcado (sin contar "Servicio finalizado") */
  fin: number | null
  /** Contenedor vacío devuelto */
  devolucion: number | null
  /** Todos los hitos del flujo en orden, con su hora (null = sin marcar) */
  linea: { key: string; label: string; min: number | null; real: boolean }[]
}

/** Subtarea de devolución de vacío de un servicio de la semana */
export interface DevolucionPago {
  id: number
  name: string
  etapa: string | null
  conductorId: number | null
  conductor: string | null
  almacen: string | null
  /** Fecha de programación del servicio padre */
  fecha: string | false
  /** Hora del hito «Contenedor vacío devuelto» (I12) de la subtarea, en minutos; null si no está marcado */
  devueltoMin: number | null
  padreId: number
  padreName: string
  padreConductorId: number | null
  padreConductor: string | null
}

/** Día con marca de entrada en el módulo Asistencia de la app (guía v1.0 §3.09) */
export interface AsistenciaPago {
  /** Empleado de Odoo (x_studio_conductor) */
  conductorId: number
  /** Fecha en Lima (YYYY-MM-DD) */
  fecha: string
  /** Marcó también la salida del día */
  salida: boolean
}

/** Gasto registrado por el conductor en el módulo Gastos de la app (guía v1.0 §3.12) */
export interface GastoPago {
  id: string
  /** Tarea de Odoo del servicio */
  servicioId: number
  servicio: string | null
  conductorId: number | null
  conductor: string | null
  descripcion: string | null
  monto: number
  moneda: string
  /** 'pendiente' | 'pagado' */
  estado: string
  /** Fotos de comprobante adjuntas */
  fotos: number
  /** Fecha de registro en Lima */
  fecha: string
  /** Solo dólares: tipo de cambio venta SBS aplicable (null si aún no está publicado) */
  tipoCambio?: { valor: number; fecha: string } | null
}

/**
 * Desde qué fecha de programación rigen las reglas de la respuesta de Margiory
 * al correo de Mirella (nov. 2026): cena por devolución efectiva, ADHT con
 * retiro antes de las 06:00, Zona 4 unificada en S/90 y tarifa de zona para
 * distritos nuevos. Lo anterior conserva las reglas viejas.
 * Desde la semana de pago del sábado 14/11/2026 (confirmado por Michael el
 * 18/11/2026): lo programado antes conserva las reglas viejas.
 */
export const VIGENCIA_REGLAS_NOV = '2026-11-14'

/** ¿El servicio se liquida con las reglas nuevas? (sin fecha → reglas viejas) */
export function reglasNuevas(fecha: string | false | null | undefined): boolean {
  return !!fecha && fecha >= VIGENCIA_REGLAS_NOV
}

/** Tarifa de un distrito nuevo validada por Administración (tabla pruebas_tarifas_distrito) */
export interface TarifaAprobada {
  id: string
  zona: string
  distrito: string
  /** GEN contenedor carga general · IMO contenedor IMO/IQBF · DES despacho carga suelta */
  producto: 'GEN' | 'IMO' | 'DES'
  monto: number
  aprobadoPor: string | null
  aprobadoAt: string
}

/** Solicitud «Voy a pernoctar» de la app, revisada en Pruebas > Pernoctes (08 · S/40) */
export interface PernoctePago {
  id: string
  /** Tarea de Odoo del servicio */
  servicioId: number
  servicio: string
  /** Empleado de Odoo (x_studio_conductor) */
  conductorId: number | null
  conductor: string
  /** Día en que empieza la noche (Lima, YYYY-MM-DD) */
  noche: string
  /** 'pendiente' | 'escalado' | 'aprobado' | 'rechazado' (las anuladas no llegan) */
  estado: string
  motivo: string
  /** Exclusiones marcadas con «sí» por quien revisó */
  exclusiones: string[]
  revisadoPor: string | null
  evidencias: number
}

/** Nombre del atributo en Odoo → clave en AtributosServicio */
export const ATRIBUTOS_ODOO: Record<string, keyof AtributosServicio> = {
  'Tipo de Servicio': 'tipoServicio',
  'Modalidad de Carga': 'modalidad',
  'Tipo de Carga': 'tipoCarga',
  'Zona': 'zona',
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
