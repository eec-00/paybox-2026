'use client'

import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, ExternalLink, ImageOff, Loader2, MapPin, Moon, RefreshCw, Check } from 'lucide-react'
import { urlArchivo } from '@/lib/archivos'
import { servicioCodigo } from '@/lib/pruebas/pagosConductores'
import {
  ACCION_LABEL, CLAVES_EXCLUSION, ESTADO_PERNOCTE_LABEL, EXCLUSIONES_PERNOCTE, MONTO_PERNOCTE, MOTIVOS_PERNOCTE,
  exclusionesActivas, validarAccion,
  type AccionPernocte, type ChecklistPernocte, type EstadoPernocte, type MotivoPernocte,
} from '@/lib/pernoctes/reglas'

interface Historial {
  id: string
  accion: AccionPernocte | 'solicitar' | 'anular'
  estado_nuevo: EstadoPernocte
  observacion: string | null
  usuario_nombre: string | null
  created_at: string
}

interface Pernocte extends ChecklistPernocte {
  id: string
  conductor_nombre: string
  servicio_id: number
  servicio_nombre: string
  noche: string
  motivo: MotivoPernocte
  motivo_detalle: string | null
  lat: number | null
  lng: number | null
  precision_m: number | null
  evidencias: string[]
  estado: EstadoPernocte
  revisado_por_nombre: string | null
  revisado_at: string | null
  observacion: string | null
  created_at: string
  pernoctes_historial: Historial[]
}

type Filtro = 'por_revisar' | 'aprobado' | 'rechazado' | 'todos'
const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'por_revisar', label: 'Por revisar' },
  { id: 'aprobado', label: 'Aprobados' },
  { id: 'rechazado', label: 'Rechazados' },
  { id: 'todos', label: 'Todos' },
]

const ESTADO_CLASE: Record<EstadoPernocte, string> = {
  pendiente: 'bg-warning-soft text-warning-ink',
  escalado: 'bg-warning-soft text-warning-ink',
  aprobado: 'bg-success-soft text-success-ink',
  rechazado: 'bg-destructive-soft text-destructive-ink',
  anulado: 'bg-slate-200 text-slate-600',
}

function EstadoBadge({ estado }: { estado: EstadoPernocte }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide whitespace-nowrap ${ESTADO_CLASE[estado]}`}>
      {ESTADO_PERNOCTE_LABEL[estado]}
    </span>
  )
}

function fechaNoche(noche: string) {
  const [y, m, d] = noche.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const hace = (dias: number) => {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

export function PernoctesSection() {
  const [pernoctes, setPernoctes] = useState<Pernocte[]>([])
  const [esAdmin, setEsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('por_revisar')
  const [desde, setDesde] = useState(() => hace(45))
  const [abiertoId, setAbiertoId] = useState<string | null>(null)

  const cargar = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/pruebas/pernoctes?desde=${desde}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar pernoctes')
      setPernoctes(data.pernoctes)
      setEsAdmin(data.esAdmin)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [desde])

  const visibles = useMemo(() => pernoctes.filter(p => {
    if (filtro === 'por_revisar') return p.estado === 'pendiente' || p.estado === 'escalado'
    if (filtro === 'todos') return true
    return p.estado === filtro
  }), [pernoctes, filtro])

  const cuenta = (f: Filtro) => pernoctes.filter(p =>
    f === 'por_revisar' ? p.estado === 'pendiente' || p.estado === 'escalado' : f === 'todos' ? true : p.estado === f,
  ).length

  const abierto = pernoctes.find(p => p.id === abiertoId) ?? null

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Moon}
        title="Pernoctes"
        badge={<Badge variant="warning">Prueba</Badge>}
        description="Solicitudes «Voy a pernoctar» enviadas desde la app del conductor"
        actions={
          <Button variant="outline" size="sm" onClick={cargar} disabled={loading} className="h-8 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        }
      />

      <div className="flex items-start gap-2.5 bg-warning-soft border border-warning/40 text-warning-ink px-4 py-3 rounded-xl text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Pernocte = el conductor <strong>duerme en su camión</strong> por la operación. S/ {MONTO_PERNOCTE} por noche aprobada.
          No corresponde si volvió a su casa dejando la unidad, si se le depositó hotel o movilidad de retorno, o si es viaje a
          provincia. Charito aprueba si la evidencia es clara; si no, se escala a Emerson. Los aprobados aparecen como
          «08 · Pernocte» en Pagos conductores (simulación): <strong>no se paga automáticamente</strong>.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {FILTROS.map(f => (
          <Button key={f.id} size="sm" variant={filtro === f.id ? 'default' : 'outline'} className="h-8" onClick={() => setFiltro(f.id)}>
            {f.label} <span className="ml-1.5 tabular-nums opacity-70">{cuenta(f.id)}</span>
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Desde la noche del
          <input type="date" value={desde} onChange={e => e.target.value && setDesde(e.target.value)} className="h-8 rounded-md border px-2 text-sm text-foreground bg-background" />
        </label>
      </div>

      {error && <div className="bg-destructive-soft border border-destructive/30 text-destructive-ink px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Noche</TableHead>
              <TableHead>Conductor</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Evidencia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : visibles.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No hay pernoctes en esta vista.</TableCell></TableRow>
            ) : visibles.map(p => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => setAbiertoId(p.id)}>
                <TableCell className="whitespace-nowrap">
                  <p className="font-medium capitalize">{fechaNoche(p.noche)}</p>
                  <p className="text-xs text-muted-foreground">Pedido {fechaHora(p.created_at)}</p>
                </TableCell>
                <TableCell className="font-medium">{p.conductor_nombre}</TableCell>
                <TableCell className="font-mono text-xs">{servicioCodigo(p.servicio_nombre)}</TableCell>
                <TableCell className="text-sm max-w-[260px]">
                  {MOTIVOS_PERNOCTE[p.motivo]}
                  {p.motivo_detalle && <span className="block text-xs text-muted-foreground truncate">{p.motivo_detalle}</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {p.evidencias.length ? `${p.evidencias.length} foto(s)` : 'Sin foto'}
                  {p.lat === null && <span className="block text-warning-ink">Sin ubicación</span>}
                </TableCell>
                <TableCell><EstadoBadge estado={p.estado} /></TableCell>
                <TableCell><Button size="sm" variant="ghost" className="h-7" aria-label={`Revisar pernocte de ${p.conductor_nombre}`} onClick={e => { e.stopPropagation(); setAbiertoId(p.id) }}>Revisar</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RevisionDialog
        pernocte={abierto}
        esAdmin={esAdmin}
        onClose={() => setAbiertoId(null)}
        onHecho={async () => { await cargar() }}
      />
    </div>
  )
}

// ── Revisión de una solicitud ────────────────────────────────────────────

function RevisionDialog({ pernocte: p, esAdmin, onClose, onHecho }: {
  pernocte: Pernocte | null
  esAdmin: boolean
  onClose: () => void
  onHecho: () => Promise<void>
}) {
  const [checklist, setChecklist] = useState<Partial<ChecklistPernocte>>({})
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState<AccionPernocte | null>(null)

  useEffect(() => {
    if (!p) return
    setChecklist(Object.fromEntries(CLAVES_EXCLUSION.map(k => [k, p[k]])))
    setObservacion('')
  }, [p?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return null

  const problema = (a: AccionPernocte) => validarAccion(p.estado, a, checklist, observacion, { esAdmin })
  const excl = exclusionesActivas(checklist)
  const historial = [...p.pernoctes_historial].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const ejecutar = async (accion: AccionPernocte) => {
    setEnviando(accion)
    try {
      const res = await fetch('/api/pruebas/pernoctes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, accion, checklist, observacion }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success(accion === 'comentar' ? 'Observación guardada' : `Pernocte: ${ESTADO_PERNOCTE_LABEL[data.estado as EstadoPernocte]}`)
      setObservacion('')
      await onHecho()
      if (accion !== 'comentar') onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(null)
    }
  }

  const BotonAccion = ({ accion, label, variant }: { accion: AccionPernocte; label: string; variant: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost' }) => {
    const motivo = problema(accion)
    return (
      <Button variant={variant} size="sm" disabled={!!motivo || enviando !== null} title={motivo ?? undefined} onClick={() => ejecutar(accion)}>
        {enviando === accion && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
        {label}
      </Button>
    )
  }

  const decidido = p.estado === 'aprobado' || p.estado === 'rechazado' || p.estado === 'anulado'

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Moon className="h-4 w-4 text-indigo-600" />
            {p.conductor_nombre} · <span className="capitalize">{fechaNoche(p.noche)}</span>
            <EstadoBadge estado={p.estado} />
          </DialogTitle>
          <DialogDescription>
            {p.servicio_nombre} · pedido el {fechaHora(p.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Motivo</p>
              <p className="font-medium">{MOTIVOS_PERNOCTE[p.motivo]}</p>
              {p.motivo_detalle && <p className="text-muted-foreground mt-1">{p.motivo_detalle}</p>}
              <p className="text-xs text-muted-foreground mt-2">Confirmó que duerme en la unidad.</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Ubicación al pedir</p>
              {p.lat !== null && p.lng !== null ? (
                <a
                  href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary font-medium hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" /> Ver en el mapa <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p className="text-warning-ink">El celular no compartió la ubicación.</p>
              )}
              {p.precision_m !== null && <p className="text-xs text-muted-foreground mt-1">Precisión ±{Math.round(p.precision_m)} m</p>}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Evidencia</p>
            {p.evidencias.length ? (
              <div className="flex gap-2 flex-wrap">
                {p.evidencias.map(url => (
                  <a key={url} href={urlArchivo(url)} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urlArchivo(url)} alt="Evidencia del pernocte" className="h-28 w-28 rounded-lg object-cover border" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-muted-foreground"><ImageOff className="h-4 w-4" /> Sin fotos (no es obligatoria).</p>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p id={`checklist-${p.id}`} className="text-sm font-semibold">Antes de aprobar</p>
              {!(decidido && !esAdmin) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setChecklist(Object.fromEntries(CLAVES_EXCLUSION.map(k => [k, false])) as Partial<ChecklistPernocte>)}
                >
                  Ninguna aplica
                </Button>
              )}
            </div>
            {CLAVES_EXCLUSION.map(k => (
              <div
                key={k}
                role="radiogroup"
                aria-labelledby={`excl-${p.id}-${k}`}
                className={`flex items-center justify-between gap-3 rounded-md px-1.5 py-1 ${checklist[k] === null || checklist[k] === undefined ? 'bg-warning-soft/50' : ''}`}
              >
                <span id={`excl-${p.id}-${k}`}>{EXCLUSIONES_PERNOCTE[k]}</span>
                <div className="flex gap-1 shrink-0">
                  {([['Sí', true], ['No', false]] as const).map(([label, v]) => (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      aria-checked={checklist[k] === v}
                      disabled={decidido && !esAdmin}
                      onClick={() => setChecklist(c => ({ ...c, [k]: v }))}
                      className={`px-2.5 py-1 rounded-md border text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checklist[k] === v ? (v ? 'bg-destructive border-destructive text-white' : 'bg-success border-success text-white') : 'bg-background hover:bg-muted'}`}
                    >
                      <span className="inline-flex items-center gap-1">{checklist[k] === v && <Check className="h-3 w-3" aria-hidden />}{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {excl.length > 0 && (
              <p className="text-xs text-destructive-ink font-medium">No corresponde pernocte con estas respuestas: se puede rechazar.</p>
            )}
          </div>

          <div className="space-y-2">
            <Textarea
              value={observacion}
              onChange={e => setObservacion(e.target.value)}
              placeholder="Observación (obligatoria para rechazar o escalar)"
              rows={2}
              maxLength={1000}
            />
            <div className="flex gap-2 flex-wrap">
              <BotonAccion accion="aprobar" label={`Aprobar · S/ ${MONTO_PERNOCTE}`} variant="default" />
              <BotonAccion accion="rechazar" label="Rechazar" variant="destructive" />
              {p.estado !== 'escalado' && !decidido && <BotonAccion accion="escalar" label="Escalar a Emerson" variant="outline" />}
              <BotonAccion accion="comentar" label="Solo guardar observación" variant="ghost" />
            </div>
            {/* Por qué está deshabilitado Aprobar: antes solo estaba en un tooltip que no se mostraba */}
            {!enviando && problema('aprobar') && !(decidido && !esAdmin) && p.estado !== 'escalado' && (
              <p className="text-xs text-muted-foreground" role="status">Para aprobar: {problema('aprobar')}</p>
            )}
            {p.estado === 'escalado' && !esAdmin && (
              <p className="text-xs text-warning-ink">Escalado a Emerson: lo decide un administrador. Puedes dejar observaciones.</p>
            )}
            {decidido && !esAdmin && p.estado !== 'anulado' && (
              <p className="text-xs text-muted-foreground">Ya decidido. Solo un administrador puede cambiarlo.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Historial</p>
            <ol className="space-y-1.5 border-l pl-3">
              {historial.map(h => (
                <li key={h.id} className="text-xs">
                  <span className="text-muted-foreground tabular-nums">{fechaHora(h.created_at)}</span>{' · '}
                  <strong>{h.usuario_nombre ?? '—'}</strong> {ACCION_LABEL[h.accion].toLowerCase()}
                  {h.observacion && <span className="block text-muted-foreground">«{h.observacion}»</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
