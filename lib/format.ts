// ============================================================================
// Formato de montos y fechas para toda la app (es-PE).
// Un solo lugar para que S/ y US$ se vean igual en todas las pantallas:
// separador de miles, 2 decimales y el símbolo correcto.
// ============================================================================

export type Moneda = 'soles' | 'dolares' | 'PEN' | 'USD'

const esDolar = (m: Moneda | string | null | undefined) =>
  m === 'dolares' || m === 'USD' || m === 'dólares' || m === 'usd'

const fmtNumero = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Símbolo de la moneda: «S/» o «US$» */
export function simboloMoneda(moneda: Moneda | string | null | undefined = 'soles'): string {
  return esDolar(moneda) ? 'US$' : 'S/'
}

/** «S/ 1,240.50» o «US$ 80.00». Un valor no numérico se muestra como «—». */
export function formatMoney(monto: number | string | null | undefined, moneda: Moneda | string | null | undefined = 'soles'): string {
  const n = typeof monto === 'string' ? Number(monto) : monto
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${simboloMoneda(moneda)} ${fmtNumero.format(n)}`
}

/**
 * Suma montos separando por moneda, para no mezclar soles con dólares.
 * Devuelve «S/ 1,240.00 · US$ 80.00» (solo las monedas con monto), o «S/ 0.00» si no hay nada.
 */
export function totalPorMoneda<T>(items: T[], monto: (x: T) => number, moneda: (x: T) => Moneda | string | null | undefined): string {
  let soles = 0
  let dolares = 0
  for (const it of items) {
    const n = monto(it)
    if (!Number.isFinite(n)) continue
    if (esDolar(moneda(it))) dolares += n
    else soles += n
  }
  const partes: string[] = []
  if (soles || !dolares) partes.push(formatMoney(soles, 'soles'))
  if (dolares) partes.push(formatMoney(dolares, 'dolares'))
  return partes.join(' · ')
}

const fmtFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' })

/** «17/11/2026» en hora de Lima. Acepta ISO o «YYYY-MM-DD» (este último se toma como fecha local, sin desfase). */
export function formatFecha(valor: string | Date | null | undefined): string {
  if (!valor) return '—'
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [y, m, d] = valor.split('-')
    return `${d}/${m}/${y}`
  }
  const f = typeof valor === 'string' ? new Date(valor) : valor
  return Number.isNaN(f.getTime()) ? '—' : fmtFecha.format(f)
}
