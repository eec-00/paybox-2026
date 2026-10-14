// ============================================================================
// Fecha y hora de cada hito de un servicio.
//
// Los hitos en Odoo son solo hora del día (float, sin fecha). La fecha sale de:
//  1. service_locations.created_at: cuando el conductor marca un hito desde la
//     app con ubicación, queda la fecha/hora real del registro (la más
//     reciente por hito, por si se reinició y volvió a marcar).
//  2. Si no hay ubicación, se estima desde la fecha de programación (o la del
//     hito real anterior), sumando un día cada vez que la hora es menor que la
//     del hito anterior (se asume que cruzó la medianoche).
//
// Ojo: el conductor no siempre marca en orden (ej. "Ingreso a cliente" antes
// que "Llegada a cliente"), por eso la fecha real tiene prioridad sobre la
// estimación.
// ============================================================================

/** Fecha (YYYY-MM-DD) en hora de Lima de un timestamp */
export function fechaLima(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(iso))
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((new Date(`${hasta}T12:00:00Z`).getTime() - new Date(`${desde}T12:00:00Z`).getTime()) / 86400000)
}

export interface TiempoHito {
  /** Minutos desde la medianoche del día de programación (> 1440 = días después) */
  min: number
  fecha: string
  /** true = fecha real (registro con ubicación); false = estimada */
  real: boolean
}

/**
 * @param valores            hora Odoo de cada hito, en el orden del flujo (0/false = sin marcar)
 * @param fechaProgramacion  fecha de programación del servicio
 * @param registros          step_index → created_at del registro de ubicación
 * @param noEncadena         índices que no mueven la secuencia (ej. "Servicio finalizado",
 *                           que muchas veces se marca después desde la tabla)
 */
export function tiemposHitos(
  valores: (number | false | null | undefined)[],
  fechaProgramacion: string | false | null,
  registros: Record<number, string | undefined>,
  noEncadena: (step: number) => boolean = () => false,
): (TiempoHito | null)[] {
  let prev: number | null = null
  let offset = 0
  return valores.map((v, step) => {
    if (typeof v !== 'number' || v === 0) return null
    const hora = Math.round(v * 60)
    const real = registros[step]

    if (real) {
      const fecha = fechaLima(real)
      const dias = fechaProgramacion ? diasEntre(fechaProgramacion, fecha) : 0
      const min = hora + dias * 1440
      if (!noEncadena(step)) { offset = dias; prev = min }
      return { min, fecha, real: true }
    }

    if (!fechaProgramacion) return null
    let dias = offset
    while (prev !== null && hora + dias * 1440 < prev) dias++
    const min = hora + dias * 1440
    if (!noEncadena(step)) { offset = dias; prev = min }
    return { min, fecha: sumarDias(fechaProgramacion, dias), real: false }
  })
}

/** Último created_at por step_index (filas en cualquier orden) */
export function registrosPorStep(rows: { step_index: number; created_at: string }[]): Record<number, string> {
  const out: Record<number, string> = {}
  for (const r of rows) {
    if (!out[r.step_index] || r.created_at > out[r.step_index]) out[r.step_index] = r.created_at
  }
  return out
}
