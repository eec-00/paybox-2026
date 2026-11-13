// ============================================================================
// Tipo de cambio venta SBS para los gastos en dólares (Pruebas · Pagos
// conductores). Regla de Rosario (12/11/2026): tipo de cambio venta de la SBS
// del día en que se realizó el gasto.
//
// Fuente: API pública del BCRP, serie PD04640PD «Tipo de cambio - TC Sistema
// bancario SBS (S/ por US$) - Venta». Sin clave. Sábados, domingos y feriados
// no figuran (rige el último publicado); el día en curso sale «n.d.» hasta que
// se publica, y ese caso queda en revisión.
// ============================================================================

export const SERIE_TC_SBS_VENTA = 'PD04640PD'

export interface TipoCambio {
  valor: number
  /** Fecha (YYYY-MM-DD) del tipo de cambio usado; puede ser anterior al gasto */
  fecha: string
}

const MESES: Record<string, string> = {
  ene: '01', jan: '01', feb: '02', mar: '03', abr: '04', apr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', aug: '08', set: '09', sep: '09', oct: '10', nov: '11', dic: '12', dec: '12',
}

/** «26.Oct.26» → «2026-10-26» (null si no se reconoce) */
export function fechaBcrp(nombre: string): string | null {
  const m = /^(\d{2})\.([A-Za-z]{3})\.(\d{2})$/.exec(nombre.trim())
  const mes = m && MESES[m[2].toLowerCase()]
  return m && mes ? `20${m[3]}-${mes}-${m[1]}` : null
}

/** Fecha → valor; null = día hábil aún sin publicar («n.d.») */
export type SerieTc = Map<string, number | null>

export function parsearSerieBcrp(json: unknown): SerieTc {
  const serie: SerieTc = new Map()
  const periods = (json as { periods?: { name?: string; values?: unknown[] }[] })?.periods
  if (!Array.isArray(periods)) return serie
  for (const p of periods) {
    const fecha = fechaBcrp(String(p.name ?? ''))
    if (!fecha) continue
    const v = Number(Array.isArray(p.values) ? p.values[0] : NaN)
    serie.set(fecha, Number.isFinite(v) && v > 0 ? v : null)
  }
  return serie
}

function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function restarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const r = new Date(Date.UTC(y, m - 1, d - n))
  return r.toISOString().slice(0, 10)
}

/**
 * Tipo de cambio para un gasto del día `fecha`:
 * - día publicado → ese valor;
 * - día hábil «n.d.» → null (aún no publicado: queda en revisión);
 * - día sin publicación (fin de semana o feriado, es decir, hay fechas
 *   posteriores publicadas o cae sábado/domingo) → el último publicado antes,
 *   hasta 7 días atrás.
 */
export function tipoCambioDelDia(serie: SerieTc, fecha: string): TipoCambio | null {
  if (serie.has(fecha)) {
    const v = serie.get(fecha)
    return v ? { valor: v, fecha } : null
  }
  const finDeSemana = [0, 6].includes(diaSemana(fecha))
  const hayPosterior = Array.from(serie.keys()).some(f => f > fecha)
  if (!finDeSemana && !hayPosterior) return null
  for (let i = 1; i <= 7; i++) {
    const f = restarDias(fecha, i)
    const v = serie.get(f)
    if (v) return { valor: v, fecha: f }
  }
  return null
}

/** Consulta la serie entre dos fechas (YYYY-MM-DD). Ante un error devuelve una serie vacía. */
export async function consultarSerieTcSbs(desde: string, hasta: string): Promise<SerieTc> {
  const url = `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/${SERIE_TC_SBS_VENTA}/json/${desde}/${hasta}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } } as RequestInit)
    if (!res.ok) return new Map()
    return parsearSerieBcrp(JSON.parse(await res.text()))
  } catch {
    return new Map()
  }
}
