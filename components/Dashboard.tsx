'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AlertCircle, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react'
import { fetchAllRows } from '@/lib/supabase/fetchAll'

interface Registro {
  fecha_y_hora_pago: string | null
  monto: number | null
  moneda: string | null
  metodo_pago: string | null
  categoria_id: string | number | null
  creado_por: string | null
}

/** Registro con su fecha ya pasada a día calendario de Lima (YYYY-MM-DD). */
interface Pago {
  dia: string
  monto: number
  dolares: boolean
  metodo: string
  categoria: string
  mio: boolean
}

type Periodo = 'mes' | 'todo'

// Las fechas se guardan en UTC: sin convertir, un pago de las 8 p. m. en Lima
// caía en el día (o mes) siguiente.
const fmtDiaLima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' })
const diaLima = (d: Date) => fmtDiaLima.format(d)

/** Suma/resta días a una fecha calendario (YYYY-MM-DD) sin depender de la zona del navegador. */
function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10)
}
const fechaUTC = (dia: string) => new Date(`${dia}T12:00:00Z`)

const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
const dolares = (n: number) => `$ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`

interface Totales { soles: number; dolares: number; count: number }
const vacio = (): Totales => ({ soles: 0, dolares: 0, count: 0 })
function totalizar(pagos: Pago[]): Totales {
  const t = vacio()
  for (const p of pagos) {
    t.count++
    if (p.dolares) t.dolares += p.monto
    else t.soles += p.monto
  }
  return t
}

/** Agrupa por una clave y ordena por monto en soles (la moneda principal). */
function agrupar(pagos: Pago[], clave: (p: Pago) => string) {
  const m = new Map<string, Totales>()
  for (const p of pagos) {
    const k = clave(p)
    const t = m.get(k) ?? vacio()
    t.count++
    if (p.dolares) t.dolares += p.monto
    else t.soles += p.monto
    m.set(k, t)
  }
  return Array.from(m, ([nombre, t]) => ({ nombre, ...t })).sort((a, b) => b.soles - a.soles || b.dolares - a.dolares)
}

export function Dashboard() {
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const supabase = createClient()

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const [registros, categoriasRes] = await Promise.all([
        fetchAllRows<Registro>((from, to) =>
          supabase
            .from('registros')
            .select('fecha_y_hora_pago, monto, moneda, metodo_pago, categoria_id, creado_por')
            .order('fecha_y_hora_pago', { ascending: false })
            .range(from, to)
        ),
        supabase.from('categorias').select('id, categoria_nombre'),
      ])
      if (categoriasRes.error) throw categoriasRes.error

      const categorias = new Map((categoriasRes.data ?? []).map((c) => [c.id, c.categoria_nombre as string]))

      setPagos(registros
        .filter((r) => r.fecha_y_hora_pago)
        .map((r) => ({
          dia: diaLima(new Date(r.fecha_y_hora_pago!)),
          monto: r.monto || 0,
          dolares: r.moneda === 'dolares',
          metodo: r.metodo_pago || 'Sin especificar',
          categoria: (r.categoria_id != null && categorias.get(r.categoria_id)) || 'Sin categoría',
          mio: !!user && r.creado_por === user.id,
        })))
      setActualizado(new Date())
    } catch (e) {
      console.error('Error fetching stats:', e)
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const hoy = diaLima(new Date())
  const mes = hoy.slice(0, 7)

  const resumen = useMemo(() => {
    const delMes = pagos.filter((p) => p.dia.startsWith(mes))

    // Mismo tramo del mes anterior (día 1 al día de hoy) para que la
    // comparación sea justa a mitad de mes.
    const [y, m, d] = hoy.split('-').map(Number)
    const mesAnt = new Date(Date.UTC(y, m - 2, 1, 12))
    const ultimoDiaAnt = new Date(Date.UTC(mesAnt.getUTCFullYear(), mesAnt.getUTCMonth() + 1, 0, 12)).getUTCDate()
    const prefAnt = mesAnt.toISOString().slice(0, 7)
    const corteAnt = `${prefAnt}-${String(Math.min(d, ultimoDiaAnt)).padStart(2, '0')}`
    const tramoAnt = pagos.filter((p) => p.dia.startsWith(prefAnt) && p.dia <= corteAnt)

    const semana = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6))
    const porDia = semana.map((dia) => ({ dia, ...totalizar(pagos.filter((p) => p.dia === dia)) }))

    const base = periodo === 'mes' ? delMes : pagos
    return {
      mes: totalizar(delMes),
      mesAnterior: totalizar(tramoAnt),
      nombreMesAnt: mesAnt.toLocaleDateString('es-PE', { month: 'long', timeZone: 'UTC' }),
      hoy: totalizar(pagos.filter((p) => p.dia === hoy)),
      historico: totalizar(pagos),
      mios: totalizar(pagos.filter((p) => p.mio)),
      semana: porDia,
      totalSemana: totalizar(pagos.filter((p) => p.dia >= semana[0] && p.dia <= hoy)),
      metodos: agrupar(base, (p) => p.metodo),
      categorias: agrupar(base, (p) => p.categoria),
      base: totalizar(base),
    }
  }, [pagos, periodo, hoy, mes])

  const nombreMes = fechaUTC(hoy).toLocaleDateString('es-PE', { month: 'long', timeZone: 'UTC' })

  // ─── Encabezado ──────────────────────────────────────────────────────────
  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">Resumen de pagos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading && !actualizado
            ? 'Cargando información…'
            : actualizado
              ? `Actualizado a las ${actualizado.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
              : 'Registros de pagos del sistema'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="gap-1.5 self-start sm:self-auto">
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        Actualizar
      </Button>
    </div>
  )

  if (error && !pagos.length) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">No se pudo cargar el resumen.</p>
            <p className="text-sm text-muted-foreground">{error.replace(/\.$/, '')}. Revisa tu conexión e inténtalo de nuevo.</p>
            <Button size="sm" variant="outline" onClick={fetchStats}>Reintentar</Button>
          </div>
        </div>
      </div>
    )
  }

  if (loading && !actualizado) {
    return (
      <div className="space-y-6" aria-busy="true">
        {header}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl border bg-border overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-card p-4 sm:p-5 space-y-3">
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
              <div className="h-7 w-28 rounded bg-muted animate-pulse" />
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1].map((i) => <div key={i} className="h-72 rounded-xl border bg-card animate-pulse" />)}
        </div>
        <div className="h-64 rounded-xl border bg-card animate-pulse" />
      </div>
    )
  }

  const r = resumen
  const variacion = r.mesAnterior.soles > 0 ? ((r.mes.soles - r.mesAnterior.soles) / r.mesAnterior.soles) * 100 : null

  return (
    <div className="space-y-6">
      {header}

      {/* ─── Indicadores ─────────────────────────────────────────────────── */}
      <section
        aria-label="Indicadores principales"
        className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl border bg-border shadow-sm overflow-hidden"
      >
        <Kpi etiqueta={`Este mes · ${nombreMes}`} valor={soles(r.mes.soles)} dolares={r.mes.dolares}>
          {variacion !== null ? (
            <span className={`inline-flex items-center gap-0.5 font-medium ${variacion >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
              {variacion >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {Math.abs(variacion).toLocaleString('es-PE', { maximumFractionDigits: 0 })}%
              <span className="font-normal text-muted-foreground">&nbsp;vs. {r.nombreMesAnt} a la fecha</span>
            </span>
          ) : (
            <span>{r.mes.count} pagos</span>
          )}
        </Kpi>
        <Kpi etiqueta="Hoy" valor={soles(r.hoy.soles)} dolares={r.hoy.dolares}>
          {r.hoy.count === 0 ? 'Sin pagos registrados' : `${r.hoy.count} pago${r.hoy.count !== 1 ? 's' : ''}`}
        </Kpi>
        <Kpi etiqueta="Histórico" valor={soles(r.historico.soles)} dolares={r.historico.dolares}>
          {r.historico.count.toLocaleString('es-PE')} registros
        </Kpi>
        <Kpi etiqueta="Mis registros" valor={r.mios.count.toLocaleString('es-PE')}>
          {soles(r.mios.soles)}{r.mios.dolares > 0 && ` · ${dolares(r.mios.dolares)}`}
        </Kpi>
      </section>

      {/* ─── Desgloses ───────────────────────────────────────────────────── */}
      <section aria-labelledby="desglose-titulo" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="desglose-titulo" className="text-base font-semibold text-foreground">
            Distribución {periodo === 'mes' ? `de ${nombreMes}` : 'histórica'}
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {soles(r.base.soles)}{r.base.dolares > 0 && ` · ${dolares(r.base.dolares)}`}
            </span>
          </h3>
          <div role="radiogroup" aria-label="Período" className="inline-flex rounded-lg border bg-muted/50 p-0.5">
            {([['mes', 'Este mes'], ['todo', 'Histórico']] as const).map(([k, label]) => (
              <button
                key={k}
                role="radio"
                aria-checked={periodo === k}
                onClick={() => setPeriodo(k)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  periodo === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Desglose titulo="Por método de pago" filas={r.metodos} totalSoles={r.base.soles} max={6} />
          <Desglose titulo="Por categoría" filas={r.categorias} totalSoles={r.base.soles} max={6} />
        </div>
      </section>

      {/* ─── Últimos 7 días ──────────────────────────────────────────────── */}
      <Semana dias={r.semana} hoy={hoy} total={r.totalSemana} />
    </div>
  )
}

// ─── Piezas ──────────────────────────────────────────────────────────────

function Kpi({ etiqueta, valor, dolares: usd, children }: { etiqueta: string; valor: string; dolares?: number; children?: React.ReactNode }) {
  return (
    <div className="bg-card p-4 sm:p-5 min-w-0">
      <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{etiqueta}</p>
      <p className="mt-1.5 text-xl sm:text-[1.75rem] font-semibold tracking-tight text-foreground tabular-nums leading-none">
        {valor}
      </p>
      {!!usd && usd > 0 && (
        <p className="mt-1 text-sm font-medium text-foreground/80 tabular-nums">+ {dolares(usd)}</p>
      )}
      <div className="mt-2 text-xs text-muted-foreground tabular-nums">{children}</div>
    </div>
  )
}

function Desglose({ titulo, filas, totalSoles, max }: {
  titulo: string
  filas: ({ nombre: string } & Totales)[]
  totalSoles: number
  max: number
}) {
  // Lo que no entra en el top se pliega en "Otros" para no perder el total.
  const visibles = filas.length > max ? filas.slice(0, max - 1) : filas
  const resto = filas.length > max ? filas.slice(max - 1) : []
  const lista = resto.length
    ? [...visibles, { nombre: `Otros (${resto.length})`, ...resto.reduce((a, f) => ({ soles: a.soles + f.soles, dolares: a.dolares + f.dolares, count: a.count + f.count }), vacio()) }]
    : visibles

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm">
      <h4 className="text-sm font-semibold text-foreground">{titulo}</h4>
      {lista.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No hay pagos en este período.</p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {lista.map((f) => {
            const pct = totalSoles > 0 ? (f.soles / totalSoles) * 100 : 0
            return (
              <li key={f.nombre}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-foreground" title={f.nombre}>{f.nombre}</span>
                  <span className="shrink-0 tabular-nums font-semibold text-foreground">{soles(f.soles)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, pct > 0 ? 1 : 0)}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {pct.toLocaleString('es-PE', { maximumFractionDigits: pct < 10 ? 1 : 0 })}% · {f.count} pago{f.count !== 1 ? 's' : ''}
                  </span>
                </div>
                {f.dolares > 0 && (
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">además {dolares(f.dolares)}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Semana({ dias, hoy, total }: { dias: ({ dia: string } & Totales)[]; hoy: string; total: Totales }) {
  const [activo, setActivo] = useState<string | null>(null)
  const maxSoles = Math.max(...dias.map((d) => d.soles), 0)
  const detalle = dias.find((d) => d.dia === activo)

  return (
    <section aria-labelledby="semana-titulo" className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="semana-titulo" className="text-base font-semibold text-foreground">Últimos 7 días</h3>
        <p className="text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{soles(total.soles)}</span>
          {total.dolares > 0 && ` · ${dolares(total.dolares)}`} · {total.count} pagos
        </p>
      </div>

      {/* Detalle del día enfocado (mouse, teclado o toque) */}
      <p className="mt-1 h-5 text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {detalle
          ? `${fechaUTC(detalle.dia).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}: ${
              detalle.count === 0 ? 'sin pagos' : `${soles(detalle.soles)}${detalle.dolares > 0 ? ` · ${dolares(detalle.dolares)}` : ''} en ${detalle.count} pago${detalle.count !== 1 ? 's' : ''}`
            }`
          : 'Pasa el cursor o toca un día para ver el detalle'}
      </p>

      <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-3" onMouseLeave={() => setActivo(null)}>
        {dias.map((d) => {
          const alto = maxSoles > 0 ? (d.soles / maxSoles) * 100 : 0
          const esHoy = d.dia === hoy
          const esMax = d.soles > 0 && d.soles === maxSoles
          const f = fechaUTC(d.dia)
          const nombre = f.toLocaleDateString('es-PE', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
          return (
            <button
              key={d.dia}
              type="button"
              onMouseEnter={() => setActivo(d.dia)}
              onFocus={() => setActivo(d.dia)}
              onBlur={() => setActivo(null)}
              onClick={() => setActivo((a) => (a === d.dia ? null : d.dia))}
              aria-label={`${f.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', timeZone: 'UTC' })}: ${soles(d.soles)}, ${d.count} pagos`}
              className="group flex flex-col items-stretch gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative h-32 sm:h-40 flex items-end border-b border-border">
                {/* Única etiqueta directa: el día con más monto */}
                {esMax && (
                  <span className="absolute inset-x-0 text-center text-[10px] sm:text-xs font-semibold tabular-nums text-foreground" style={{ bottom: `calc(${alto}% + 4px)` }}>
                    {d.soles >= 1000 ? `${(d.soles / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}k` : Math.round(d.soles)}
                  </span>
                )}
                {d.soles > 0 && (
                  <div
                    className={`w-full rounded-t-lg transition-opacity bg-primary ${activo && activo !== d.dia ? 'opacity-40' : 'opacity-100'}`}
                    style={{ height: `${Math.max(alto, 2)}%` }}
                  />
                )}
              </div>
              <span className={`text-center text-[11px] sm:text-xs capitalize leading-tight ${esHoy ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {esHoy ? 'Hoy' : nombre}
                <span className="block tabular-nums">{f.getUTCDate()}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Montos en soles. Los pagos en dólares se muestran en el detalle de cada día.</p>
    </section>
  )
}
