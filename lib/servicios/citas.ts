// ============================================================================
// Citas de retiro y devolución con fecha y hora (campos nuevos de Odoo).
//
// Odoo tenía «Hora de cita» y «Hora de Devolución» como hora suelta (float, sin
// día). Ahora existen «Fecha y hora de cita de retiro» y «Fecha y hora de cita
// de devolución» (datetime). Mientras conviven, se lee primero el campo nuevo y,
// si está vacío, el antiguo: así nada que lea «Hora de cita» se rompe.
//
// Odoo guarda los datetime en UTC («YYYY-MM-DD HH:MM:SS»). Perú es UTC−5 todo
// el año (sin horario de verano).
// ============================================================================

export const CAMPO_CITA_RETIRO = 'x_studio_fecha_y_hora_de_cita_de_retiro'
export const CAMPO_CITA_DEVOLUCION = 'x_studio_fecha_y_hora_de_cita_de_devolucion'
export const CAMPOS_CITA = [CAMPO_CITA_RETIRO, CAMPO_CITA_DEVOLUCION]

const OFFSET_LIMA_MS = 5 * 60 * 60 * 1000

/** Instante UTC de un datetime de Odoo, o null si está vacío o es inválido */
export function instanteOdoo(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(`${v.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Datetime de Odoo → fecha (YYYY-MM-DD) y hora (en horas, como el float de Odoo) en Lima */
export function citaLima(v: unknown): { fecha: string; hora: number } | null {
  const d = instanteOdoo(v)
  if (!d) return null
  const lima = new Date(d.getTime() - OFFSET_LIMA_MS)
  return { fecha: lima.toISOString().slice(0, 10), hora: lima.getUTCHours() + lima.getUTCMinutes() / 60 }
}

/**
 * Si la tarea tiene las citas nuevas, pone su hora (Lima) en los campos antiguos
 * («Hora de cita», «Hora de Devolución») para que todo lo que los lee use el
 * dato nuevo. Si el campo nuevo está vacío, deja el antiguo como está.
 */
export function aplicarCitasNuevas<T extends Record<string, unknown>>(t: T): T {
  const retiro = citaLima(t[CAMPO_CITA_RETIRO])
  if (retiro) (t as Record<string, unknown>).x_studio_hora_de_cita = retiro.hora
  const devolucion = citaLima(t[CAMPO_CITA_DEVOLUCION])
  if (devolucion) (t as Record<string, unknown>).x_studio_hora_de_devolucion = devolucion.hora
  return t
}

/** Días calendario de `desde` a `hasta` (YYYY-MM-DD) */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)
}
