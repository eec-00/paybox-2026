// Fechas de calendario (YYYY-MM-DD) en hora de Lima.
//
// `new Date().toISOString().slice(0, 10)` da la fecha en UTC: entre las 7 p. m.
// y la medianoche de Lima (UTC−5) ya es "mañana". Estas funciones no dependen
// de la zona del navegador ni del servidor (Netlify corre en UTC).

const fmtLima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' })

/** Fecha de hoy en Lima, YYYY-MM-DD. */
export function hoyLima(): string {
  return fmtLima.format(new Date())
}

/** Día calendario de Lima (YYYY-MM-DD) en que cae un instante (Date o timestamp ISO). */
export function diaLima(instante: Date | string): string {
  return fmtLima.format(typeof instante === 'string' ? new Date(instante) : instante)
}

/** Suma (o resta, con n negativo) días a una fecha YYYY-MM-DD. Aritmética de
 * calendario anclada al mediodía UTC: sin saltos por zona horaria. */
export function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10)
}

/** Date anclado al mediodía UTC de una fecha YYYY-MM-DD, para formatearla con
 * `timeZone: 'UTC'` (nombre del día, mes) sin que se corra un día. */
export function fechaUTC(fecha: string): Date {
  return new Date(`${fecha}T12:00:00Z`)
}

/** Último día para pagar un gasto de conductor registrado en `fecha`:
 * lunes a viernes, el sábado de esa semana; sábado y domingo, el de la siguiente. */
export function sabadoDePago(fecha: string): string {
  const dia = fechaUTC(fecha).getUTCDay()
  return sumarDias(fecha, dia === 6 ? 7 : 6 - dia)
}
