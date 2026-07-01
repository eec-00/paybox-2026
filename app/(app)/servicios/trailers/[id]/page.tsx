'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronRight, RefreshCw, Truck, User, Phone, Mail, Briefcase,
  Calendar, Clock, Building2, Package, Hash, FileText, MapPin,
  IdCard, Globe, MapPinned,
} from 'lucide-react'

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
  x_studio_es_importacion: boolean
  x_studio_saliendo_de_la_cochera: number | false
  x_studio_en_cola_de_ingreso: number | false
  x_studio_ingreso_a_almacen_de_retiro_1: number | false
  x_studio_salida_de_almacen_de_retiro: number | false
  x_studio_llegada_a_cliente: number | false
  x_studio_ingreso_a_planta: number | false
  x_studio_inicio_cargadescarga: number | false
  x_studio_termino_de_descarga: number | false
  x_studio_salida_cliente: number | false
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

const TIEMPOS_FIELDS: { key: keyof OdooTaskDetail; label: string; step: number }[] = [
  { key: 'x_studio_saliendo_de_la_cochera', label: 'Saliendo de Cochera', step: 0 },
  { key: 'x_studio_en_cola_de_ingreso', label: 'Cola de Ingreso', step: 1 },
  { key: 'x_studio_ingreso_a_almacen_de_retiro_1', label: 'Ingreso a Almacén', step: 2 },
  { key: 'x_studio_salida_de_almacen_de_retiro', label: 'Salida de Almacén', step: 3 },
  { key: 'x_studio_llegada_a_cliente', label: 'Llegada a Cliente', step: 4 },
  { key: 'x_studio_ingreso_a_planta', label: 'Ingreso a Cliente', step: 5 },
  { key: 'x_studio_inicio_cargadescarga', label: 'Inicio Carga/Descarga', step: 6 },
  { key: 'x_studio_termino_de_descarga', label: 'Término Carga/Descarga', step: 7 },
  { key: 'x_studio_salida_cliente', label: 'Salida de Cliente', step: 8 },
]

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const { data: locs } = await supabase
        .from('service_locations')
        .select('step_index, lat, lng')
        .eq('task_id', id)
      if (locs) {
        const map: Record<number, LocationPoint> = {}
        for (const l of locs) map[l.step_index] = { lat: l.lat, lng: l.lng }
        setLocations(map)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (id) fetchDetail() }, [id])

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
              <InfoField icon={FileText} label="Importación" value={task.x_studio_es_importacion ? 'Sí' : 'No'} />
            </div>
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
            <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wide">Tiempos Operativos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TIEMPOS_FIELDS.map(({ key, label, step }) => {
                const time = formatOdooTime(task[key] as number | false)
                const loc = locations[step]
                return (
                  <div key={key} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
                      <span className="text-xs font-medium">{label}</span>
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
        </div>
      )}
    </div>
  )
}
