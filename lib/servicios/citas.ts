// ============================================================================
// Cita de devolución = «Fecha de Devolucion» (date) + «Hora de Devolucion»
// (float, hora suelta), ambos en project.task. Igual que el retiro, que usa
// «Fecha de Recojo» (x_studio_fecha_de_la_programacin) + «Hora de Recojo»
// (x_studio_hora_de_cita).
//
// Por ahora SOLO lo usa Pruebas > Pagos conductores (docs/CITAS_FECHA_HORA.md).
// ============================================================================

export const CAMPO_FECHA_DEVOLUCION = 'x_studio_fecha_de_devolucion'
export const CAMPO_HORA_DEVOLUCION = 'x_studio_hora_de_devolucion'

/** Días calendario de `desde` a `hasta` (YYYY-MM-DD) */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)
}

/**
 * Cita de devolución en minutos desde la medianoche del día de recojo
 * (> 1440 si es otro día). Sin hora → null. Sin «Fecha de Devolucion» (o sin
 * día de recojo) se asume el mismo día del recojo.
 */
export function citaDevolucionMin(
  fechaRecojo: unknown, fechaDevolucion: unknown, horaDevolucion: unknown,
): number | null {
  if (typeof horaDevolucion !== 'number' || horaDevolucion === 0) return null
  const dias = typeof fechaRecojo === 'string' && typeof fechaDevolucion === 'string' && fechaRecojo && fechaDevolucion
    ? diasEntre(fechaRecojo, fechaDevolucion)
    : 0
  return dias * 1440 + Math.round(horaDevolucion * 60)
}
