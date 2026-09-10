'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronRight, RefreshCw, Truck, User, Phone, Mail, Briefcase,
  Calendar, Clock, Building2, Package, Hash, FileText, MapPin,
  IdCard, Globe, MapPinned, Camera, Link2, Copy, ExternalLink, Share2, CheckCircle,
} from 'lucide-react'
import { getHitosForTask, tipoServicioLabelFor } from '@/lib/servicios/hitos'

interface OdooTaskDetail {
  id: number
  name: string
  stage_id: [number, string] | false
  partner_id: [number, string] | false
  x_studio_fecha_de_la_programacin: string | false
  x_studio_hora_de_cita: number | false
  x_studio_placa: [number, string] | false
  x_studio_placa_carreta: [number, string] | false
  x_studio_conductor: [number, string] | false
  x_studio_referenciabooking: string | false
  x_studio_agencia: string | false
  x_studio_nmero_de_contenedor: string | false
  x_studio_almacen_de_retiro: [number, string] | false
  x_studio_almacen_de_destino: [number, string] | false
  x_studio_almacen_de_devolucion?: [number, string] | false
  x_studio_es_importacion: boolean
  x_studio_es_import?: boolean
  x_studio_es_export?: boolean
  x_studio_es_despacho?: boolean
  x_studio_es_itk?: boolean
  x_studio_es_isotanque_lleno?: boolean
  x_studio_es_isotanque_vacio?: boolean
  [key: string]: unknown
}

interface HitoFoto {
  hito_key: string
  hito_label: string
  foto_url: string
  created_at: string
}

interface Conductor {
  id: number
  name: string
  work_phone?: string | false
  mobile_phone?: string | false
  job_title?: string | false
  work_email?: string | false
}

interface Cliente {
  id: number
  name: string
  email?: string | false
  phone?: string | false
  mobile?: string | false
  vat?: string | false
  street?: string | false
  city?: string | false
  website?: string | false
}

interface LocationPoint { lat: number; lng: number }

interface GeoLinkMatch {
  url: string
  matchedPlaca: string
  createDate: string
  expiraAt: string | null // null = permanente
  expired: boolean
}

/** Normaliza una placa para comparar "AFQ-733" (Navitel) contra
 * "Freightliner/CL112/AFQ733" (Odoo, vía extractPlaca) sin depender de
 * guiones, marca/modelo u otro formato — solo letras y números. */
function normalizePlaca(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
function extractPlacaCandidate(val: [number, string] | false | undefined): string {
  if (!val) return ''
  const name = val[1]
  if (!name) return ''
  return name.includes('/') ? name.split('/').pop() || name : name
}
function formatOdooDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatOdooTime(value: number | false | undefined): string {
  if (!value && value !== 0) return '—'
  if (value === 0) return '00:00'
  const hours = Math.floor(value)
  const minutes = Math.round((value - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatDate(value: string | false): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function m2oName(value: [number, string] | false | undefined): string {
  if (!value) return '—'
  return value[1]
}

const STAGE_DOT_COLORS: Record<string, string> = {
  'nueva solicitud': 'bg-blue-500',
  'pre-operativo': 'bg-amber-500',
  'en ruta': 'bg-orange-500',
  'en cliente': 'bg-green-500',
  'facturación': 'bg-indigo-500',
  'facturacion': 'bg-indigo-500',
  'cerrado': 'bg-gray-400',
}

function stageDotColor(name: string): string {
  const key = name.toLowerCase().trim()
  for (const [k, v] of Object.entries(STAGE_DOT_COLORS)) {
    if (key.includes(k)) return v
  }
  if (key.includes('pendiente') || key.includes('cierre') || key.includes('devolu')) {
    return 'bg-purple-500'
  }
  return 'bg-gray-400'
}

function InfoField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

export default function ServicioDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const [task, setTask] = useState<OdooTaskDetail | null>(null)
  const [conductor, setConductor] = useState<Conductor | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [locations, setLocations] = useState<Record<number, LocationPoint>>({})
  const [hitoFotos, setHitoFotos] = useState<HitoFoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [geolink, setGeolink] = useState<GeoLinkMatch | null>(null)
  const [geolinkLoading, setGeolinkLoading] = useState(false)
  const [geolinkError, setGeolinkError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchDetail = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/servicios?id=${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar el servicio')
      setTask(data.task)
      setConductor(data.conductor)
      setCliente(data.cliente)

      const supabase = createClient()
      const [{ data: locs }, { data: fotos }] = await Promise.all([
        supabase.from('service_locations').select('step_index, lat, lng').eq('task_id', id),
        supabase.from('conductor_servicio_hito_fotos')
          .select('hito_key, hito_label, foto_url, created_at')
          .eq('servicio_id', id)
          .order('created_at', { ascending: true }),
      ])
      if (locs) {
        const map: Record<number, LocationPoint> = {}
        for (const l of locs) map[l.step_index] = { lat: l.lat, lng: l.lng }
        setLocations(map)
      }
      setHitoFotos(fotos ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (id) fetchDetail() }, [id])

  // Busca si la placa del camión (o, si no, la carreta) de este servicio
  // tiene un geoenlace de seguimiento GPS activo en Navitel, para no tener
  // que ir a buscarlo manualmente en Servicios > Geoenlaces.
  useEffect(() => {
    const placaCamion = extractPlacaCandidate(task?.x_studio_placa)
    const placaCarreta = extractPlacaCandidate(task?.x_studio_placa_carreta)
    if (!placaCamion && !placaCarreta) { setGeolink(null); return }

    let cancelled = false
    setGeolinkLoading(true)
    setGeolinkError(null)
    fetch('/api/navitel/geolink/list')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (!data.success) { setGeolinkError(data.error || 'Error al buscar geoenlaces'); return }

        const candidates = [placaCamion, placaCarreta].filter(Boolean).map(normalizePlaca)
        type RawGeolink = { url: string; create_date: string; lifetime?: { to: string } | null; trackers?: { alias: string }[] }
        const matches = (data.geolinks as RawGeolink[]).filter((g) =>
          g.trackers?.some((t) => candidates.includes(normalizePlaca(t.alias)))
        )
        if (matches.length === 0) { setGeolink(null); return }

        const withExpiry = matches.map((g) => ({
          g,
          expired: !!g.lifetime && new Date(g.lifetime.to) < new Date(),
        }))
        // Prioriza uno activo (no expirado); si no hay, el más reciente igual.
        const chosen = withExpiry.find((m) => !m.expired) || withExpiry[0]
        const matchedTracker = chosen.g.trackers?.find((t) => candidates.includes(normalizePlaca(t.alias)))

        setGeolink({
          url: chosen.g.url,
          matchedPlaca: matchedTracker?.alias || placaCamion || placaCarreta,
          createDate: chosen.g.create_date,
          expiraAt: chosen.g.lifetime?.to || null,
          expired: chosen.expired,
        })
      })
      .catch(() => { if (!cancelled) setGeolinkError('Error de conexión al buscar geoenlaces') })
      .finally(() => { if (!cancelled) setGeolinkLoading(false) })

    return () => { cancelled = true }
  }, [task?.x_studio_placa, task?.x_studio_placa_carreta])

  const copyGeolink = async () => {
    if (!geolink) return
    try {
      await navigator.clipboard.writeText(geolink.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent */ }
  }
  const shareGeolink = async () => {
    if (!geolink) return
    if (navigator.share) {
      try { await navigator.share({ title: `Geoenlace ${geolink.matchedPlaca}`, url: geolink.url }) }
      catch (err) { if ((err as Error).name !== 'AbortError') copyGeolink() }
    } else {
      copyGeolink()
    }
  }

  const code = task ? (task.name.includes(' - ') ? task.name.split(' - ')[0] : task.name) : `Servicio #${id}`
  const stageName = task?.stage_id ? task.stage_id[1] : ''
  const conductorName = conductor?.name || m2oName(task?.x_studio_conductor)

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        <Link href="/servicios/trailers" className="text-primary hover:underline font-medium">
          Servicios
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{loading ? '...' : `Servicio ${code}`}</span>
        {conductorName !== '—' && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{conductorName}</span>
          </>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Truck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">
              {loading ? 'Cargando...' : `Servicio ${code}`}
            </h2>
            {stageName && (
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${stageDotColor(stageName)}`} />
                {stageName}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={fetchDetail}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg p-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Cargando detalle del servicio...
        </div>
      )}

      {!loading && !error && task && (
        <div className="space-y-4">
          {/* General info */}
          <div className="bg-card border rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wide">Información General</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <InfoField icon={User} label="Cliente" value={m2oName(task.partner_id)} />
              <InfoField icon={Calendar} label="F. Programación" value={formatDate(task.x_studio_fecha_de_la_programacin)} />
              <InfoField icon={Clock} label="Hora Cita" value={formatOdooTime(task.x_studio_hora_de_cita)} />
              <InfoField icon={Truck} label="Placa Camión" value={m2oName(task.x_studio_placa)} />
              <InfoField icon={Truck} label="Placa Carreta" value={m2oName(task.x_studio_placa_carreta)} />
              <InfoField icon={FileText} label="Ref/Booking" value={task.x_studio_referenciabooking || '—'} />
              <InfoField icon={Building2} label="Agencia" value={task.x_studio_agencia || '—'} />
              <InfoField icon={Hash} label="N° Contenedor" value={task.x_studio_nmero_de_contenedor || '—'} />
              <InfoField icon={Package} label="Almacén Retiro" value={m2oName(task.x_studio_almacen_de_retiro)} />
              <InfoField icon={Package} label="Almacén Destino" value={m2oName(task.x_studio_almacen_de_destino)} />
              <InfoField icon={FileText} label="Tipo de Servicio" value={tipoServicioLabelFor(task)} />
            </div>
          </div>

          {/* Geoenlace GPS */}
          <div className="bg-card border rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Geoenlace GPS
            </h3>
            {geolinkLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Buscando geoenlace para este vehículo...
              </div>
            ) : geolinkError ? (
              <p className="text-sm text-destructive">{geolinkError}</p>
            ) : !geolink ? (
              <p className="text-sm text-muted-foreground">
                Sin geoenlace de seguimiento para este vehículo. Puedes crear uno en{' '}
                <Link href="/servicios/geoenlaces" className="text-primary hover:underline font-medium">
                  Servicios → Geoenlaces
                </Link>.
              </p>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-medium">
                      <Truck className="h-2.5 w-2.5" />
                      {geolink.matchedPlaca}
                    </span>
                    {geolink.expiraAt === null ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded text-xs">
                        ∞ Permanente
                      </span>
                    ) : geolink.expired ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-muted text-muted-foreground border border-border rounded text-xs">
                        Expirado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                        Activo hasta {formatOdooDateTime(geolink.expiraAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={copyGeolink}
                      title="Copiar enlace"
                      className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md border hover:bg-muted/50 transition-colors"
                    >
                      {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a
                      href={geolink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir en pestaña nueva"
                      className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md border hover:bg-muted/50 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={shareGeolink}
                      title="Compartir"
                      className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md border hover:bg-muted/50 transition-colors"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="rounded-lg overflow-hidden border">
                  <iframe
                    key={geolink.url}
                    src={geolink.url}
                    className="w-full h-[420px] border-0"
                    loading="lazy"
                    title={`Seguimiento GPS ${geolink.matchedPlaca}`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cliente */}
          <div className="bg-card border rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wide">Cliente</h3>
            {!cliente ? (
              <p className="text-sm text-muted-foreground">Sin información adicional del cliente.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <InfoField icon={User} label="Nombre" value={cliente.name || '—'} />
                <InfoField icon={Mail} label="Correo" value={cliente.email || '—'} />
                <InfoField icon={Phone} label="Teléfono" value={cliente.phone || cliente.mobile || '—'} />
                <InfoField icon={IdCard} label="RUC/VAT" value={cliente.vat || '—'} />
                <InfoField icon={MapPinned} label="Dirección" value={cliente.street || '—'} />
                <InfoField icon={Building2} label="Ciudad" value={cliente.city || '—'} />
                <InfoField icon={Globe} label="Sitio Web" value={cliente.website || '—'} />
              </div>
            )}
          </div>

          {/* Conductor */}
          <div className="bg-card border rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wide">Conductor</h3>
            {conductorName === '—' ? (
              <p className="text-sm text-muted-foreground">Sin conductor asignado.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <InfoField icon={User} label="Nombre" value={conductorName} />
                <InfoField icon={Briefcase} label="Cargo" value={conductor?.job_title || '—'} />
                <InfoField icon={Phone} label="Teléfono" value={conductor?.mobile_phone || conductor?.work_phone || '—'} />
                <InfoField icon={Mail} label="Correo" value={conductor?.work_email || '—'} />
              </div>
            )}
          </div>

          {/* Tiempos operativos */}
          <div className="bg-card border rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wide">
              Tiempos Operativos · {tipoServicioLabelFor(task)}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {getHitosForTask(task).map((hito, step) => {
                const time = formatOdooTime(task[hito.field] as number | false)
                const loc = locations[step]
                return (
                  <div key={hito.key} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
                      <span className="text-xs font-medium">{hito.label}</span>
                      <span className="text-xs font-mono font-bold">{time}</span>
                    </div>
                    {loc ? (
                      <a
                        href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir en Google Maps"
                      >
                        <iframe
                          className="w-full h-32 border-0"
                          loading="lazy"
                          src={`https://www.google.com/maps?q=${loc.lat},${loc.lng}&z=15&output=embed`}
                        />
                      </a>
                    ) : (
                      <div className="flex items-center justify-center h-16 text-xs text-muted-foreground gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        Sin ubicación registrada
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Fotos de hitos */}
          {hitoFotos.length > 0 && (
            <div className="bg-card border rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" />
                Evidencia Fotográfica ({hitoFotos.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {hitoFotos.map((f, i) => (
                  <a
                    key={`${f.hito_key}-${i}`}
                    href={f.foto_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
                  >
                    <img src={f.foto_url} alt={f.hito_label} className="w-full h-64 object-contain bg-muted/30" />
                    <p className="text-[11px] font-medium px-2 py-1.5 bg-muted/40 truncate" title={f.hito_label}>
                      {f.hito_label}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
