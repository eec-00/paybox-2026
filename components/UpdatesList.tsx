'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SystemUpdate, UpdateCategory } from '@/lib/types/updates.types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle, ArrowLeft, ArrowRight, LayoutGrid, Users, Sparkles, Megaphone,
  Rocket, TrendingUp, Wrench, Info, CheckCheck, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { parseUpdateDescription, updateSummary, UPDATES_VIEWED_EVENT } from '@/lib/updates/parse'

// Estilo por tipo de actualización: colores suaves (fondo/borde/texto) e ícono.
const CATEGORY_STYLE: Record<UpdateCategory, {
  label: string
  icon: React.FC<{ className?: string }>
  dot: string
  soft: string
  band: string
}> = {
  feature: {
    label: 'Nueva funcionalidad', icon: Rocket,
    dot: 'bg-emerald-500 text-white',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    band: 'from-emerald-500 to-green-600',
  },
  improvement: {
    label: 'Mejora', icon: TrendingUp,
    dot: 'bg-sky-500 text-white',
    soft: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
    band: 'from-sky-500 to-blue-600',
  },
  bugfix: {
    label: 'Corrección', icon: Wrench,
    dot: 'bg-rose-500 text-white',
    soft: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    band: 'from-rose-500 to-pink-600',
  },
  general: {
    label: 'General', icon: Info,
    dot: 'bg-slate-500 text-white',
    soft: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800',
    band: 'from-slate-500 to-gray-600',
  },
}
const styleFor = (c: string) => CATEGORY_STYLE[(c as UpdateCategory)] ?? CATEGORY_STYLE.general

const FILTROS: { key: 'all' | 'unread' | UpdateCategory; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Sin leer' },
  { key: 'feature', label: 'Nuevas funcionalidades' },
  { key: 'improvement', label: 'Mejoras' },
  { key: 'bugfix', label: 'Correcciones' },
]

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface UpdatesListProps {
  /** Acción extra en el encabezado (ej. "Nueva actualización" para developers) */
  headerAction?: React.ReactNode
}

export function UpdatesList({ headerAction }: UpdatesListProps) {
  const [updates, setUpdates] = useState<SystemUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUpdate, setSelectedUpdate] = useState<SystemUpdate | null>(null)
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['key']>('all')
  const [marcandoTodas, setMarcandoTodas] = useState(false)
  const router = useRouter()
  // ?id=... llega desde la campanita: abre esa actualización directamente
  const idParam = useSearchParams().get('id')

  const supabase = createClient()

  const loadUpdates = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('system_updates')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      setUpdates(data || [])

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: views } = await supabase.from('user_update_views').select('update_id').eq('user_id', user.id)
        // Las publicadas antes de que existiera la cuenta no se marcan como
        // nuevas (mismo criterio que el contador de la campanita).
        const anteriores = (data || []).filter((u) => new Date(u.created_at) < new Date(user.created_at)).map((u) => u.id)
        setViewedIds(new Set([...(views ?? []).map((v) => v.update_id), ...anteriores]))
      }
    } catch (err) {
      console.error('Error loading updates:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar actualizaciones')
    } finally {
      setLoading(false)
    }
  }

  const markAsViewed = async (ids: string[]) => {
    if (!ids.length) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const now = new Date().toISOString()
      await supabase
        .from('user_update_views')
        .upsert(ids.map((update_id) => ({ user_id: user.id, update_id, viewed_at: now })), {
          onConflict: 'user_id,update_id'
        })
      setViewedIds((prev) => new Set([...prev, ...ids]))
      window.dispatchEvent(new Event(UPDATES_VIEWED_EVENT))
    } catch (err) {
      console.error('Error marking update as viewed:', err)
    }
  }

  const abrir = (update: SystemUpdate) => {
    setSelectedUpdate(update)
    if (!viewedIds.has(update.id)) markAsViewed([update.id])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBack = () => {
    setSelectedUpdate(null)
    if (idParam) router.replace('/updates')
  }

  const unreadIds = useMemo(() => updates.filter((u) => !viewedIds.has(u.id)).map((u) => u.id), [updates, viewedIds])

  const marcarTodas = async () => {
    setMarcandoTodas(true)
    await markAsViewed(unreadIds)
    setMarcandoTodas(false)
  }

  useEffect(() => {
    loadUpdates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!idParam || !updates.length) return
    const found = updates.find((u) => u.id === idParam)
    if (found) abrir(found)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam, updates])

  const conteo = useMemo(() => {
    const c: Record<string, number> = { all: updates.length, unread: unreadIds.length }
    for (const u of updates) c[u.category] = (c[u.category] ?? 0) + 1
    return c
  }, [updates, unreadIds])

  const filtradas = useMemo(() => updates.filter((u) => {
    if (filtro === 'all') return true
    if (filtro === 'unread') return !viewedIds.has(u.id)
    return u.category === filtro
  }), [updates, filtro, viewedIds])

  // Agrupadas por mes de publicación, de la más reciente a la más antigua
  const porMes = useMemo(() => {
    const grupos: { mes: string; items: SystemUpdate[] }[] = []
    for (const u of filtradas) {
      const mes = capitalizar(format(new Date(u.created_at), 'MMMM yyyy', { locale: es }))
      const ultimo = grupos[grupos.length - 1]
      if (ultimo?.mes === mes) ultimo.items.push(u)
      else grupos.push({ mes, items: [u] })
    }
    return grupos
  }, [filtradas])

  // ─── Encabezado ──────────────────────────────────────────────────────────
  const hero = (
    <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-lg">
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" aria-hidden />
      <div className="absolute right-24 -bottom-16 h-40 w-40 rounded-full bg-white/5" aria-hidden />
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-7">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Megaphone className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Novedades de PayBox</h2>
            <p className="text-sm text-primary-foreground/75">Mejoras, nuevas funciones y correcciones del sistema</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!loading && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium ring-1 ring-white/20">
              {unreadIds.length > 0 ? (
                <><span className="h-2 w-2 rounded-full bg-orange-400" />{unreadIds.length} sin leer</>
              ) : (
                <><CheckCheck className="h-4 w-4" />Estás al día</>
              )}
            </span>
          )}
          {headerAction}
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        {hero}
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl border bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        {hero}
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      </div>
    )
  }

  // ─── Detalle ─────────────────────────────────────────────────────────────
  if (selectedUpdate) {
    const st = styleFor(selectedUpdate.category)
    const Icon = st.icon
    const secciones = parseUpdateDescription(selectedUpdate.description)
    const idx = updates.findIndex((u) => u.id === selectedUpdate.id)
    const masNueva = idx > 0 ? updates[idx - 1] : null
    const masAntigua = idx >= 0 && idx < updates.length - 1 ? updates[idx + 1] : null

    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <Button onClick={handleBack} variant="ghost" className="-ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Todas las novedades
        </Button>

        <Card className="overflow-hidden border-0 shadow-lg py-0 gap-0">
          <div className={`h-2 bg-linear-to-r ${st.band}`} />
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${st.soft}`}>
                <Icon className="h-3.5 w-3.5" />{st.label}
              </span>
              {selectedUpdate.version && (
                <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">{selectedUpdate.version}</span>
              )}
              <span className="text-sm text-muted-foreground">
                {format(new Date(selectedUpdate.created_at), "d 'de' MMMM, yyyy", { locale: es })}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {selectedUpdate.title}
            </h1>
          </CardContent>
        </Card>

        {secciones ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {secciones.modulo && (
                <Card className="py-0">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      <LayoutGrid className="h-3.5 w-3.5" /> Dónde
                    </div>
                    <p className="text-foreground font-medium leading-snug">{secciones.modulo}</p>
                  </CardContent>
                </Card>
              )}
              {secciones.usuarios && (
                <Card className="py-0">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      <Users className="h-3.5 w-3.5" /> Para quién
                    </div>
                    <p className="text-foreground font-medium leading-snug">{secciones.usuarios}</p>
                  </CardContent>
                </Card>
              )}
            </div>
            <Card className="py-0 border-primary/25 bg-primary/3">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary mb-3">
                  <Sparkles className="h-3.5 w-3.5" /> Qué cambió
                </div>
                <p className="text-foreground whitespace-pre-wrap leading-relaxed text-[15px] sm:text-base">{secciones.cosasNuevas}</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="py-0">
            <CardContent className="p-6 sm:p-8">
              <p className="text-foreground whitespace-pre-wrap leading-relaxed">{selectedUpdate.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Navegar a la novedad anterior / siguiente sin volver a la lista */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          {masAntigua ? (
            <button onClick={() => abrir(masAntigua)} className="group text-left rounded-xl border p-4 hover:bg-muted/50 transition-colors">
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><ChevronLeft className="h-3.5 w-3.5" />Anterior</span>
              <span className="mt-1 block text-sm font-medium line-clamp-2 group-hover:text-primary">{masAntigua.title}</span>
            </button>
          ) : <div />}
          {masNueva ? (
            <button onClick={() => abrir(masNueva)} className="group text-right rounded-xl border p-4 hover:bg-muted/50 transition-colors">
              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">Siguiente<ChevronRight className="h-3.5 w-3.5" /></span>
              <span className="mt-1 block text-sm font-medium line-clamp-2 group-hover:text-primary">{masNueva.title}</span>
            </button>
          ) : <div />}
        </div>
      </div>
    )
  }

  // ─── Lista ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {hero}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTROS.map((f) => {
            const n = conteo[f.key] ?? 0
            if (f.key !== 'all' && f.key !== 'unread' && n === 0) return null
            const activo = filtro === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  activo ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background hover:bg-muted text-foreground/80'
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-xs ${activo ? 'bg-white/20' : 'bg-muted text-muted-foreground'}`}>{n}</span>
              </button>
            )
          })}
        </div>
        {unreadIds.length > 0 && (
          <Button variant="outline" size="sm" onClick={marcarTodas} disabled={marcandoTodas} className="shrink-0 gap-1.5">
            {marcandoTodas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Marcar todas como leídas
          </Button>
        )}
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-16 text-center">
          <CheckCheck className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm text-muted-foreground">
            {filtro === 'unread' ? 'No tienes novedades sin leer.' : 'No hay actualizaciones en esta categoría.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {porMes.map(({ mes, items }) => (
            <section key={mes}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{mes}</h3>
              <ol className="relative space-y-3 border-l border-border ml-4">
                {items.map((u) => {
                  const st = styleFor(u.category)
                  const Icon = st.icon
                  const nueva = !viewedIds.has(u.id)
                  const modulo = parseUpdateDescription(u.description)?.modulo
                  return (
                    <li key={u.id} className="relative pl-7">
                      <span className={`absolute -left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-background ${st.dot}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <button
                        onClick={() => abrir(u)}
                        className={`group w-full text-left rounded-xl border bg-card p-4 sm:p-5 transition-all hover:shadow-md hover:-translate-y-0.5 ${
                          nueva ? 'border-primary/40 ring-1 ring-primary/15' : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.soft}`}>{st.label}</span>
                          {modulo && <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[60%]">{modulo}</span>}
                          {nueva && (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              Nuevo
                            </span>
                          )}
                        </div>
                        <h4 className={`text-base text-foreground leading-snug group-hover:text-primary transition-colors ${nueva ? 'font-bold' : 'font-semibold'}`}>
                          {u.title}
                        </h4>
                        <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2 leading-relaxed">{updateSummary(u.description)}</p>
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{format(new Date(u.created_at), "d 'de' MMMM", { locale: es })}</span>
                          <span className="inline-flex items-center gap-1 font-medium text-primary sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            Leer más <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
