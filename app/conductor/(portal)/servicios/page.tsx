'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Truck, Clock, Building2, RefreshCw, PackageSearch } from 'lucide-react'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

interface ServicioTask {
  id: number
  name: string
  stage_id: [number, string] | false
  partner_id: [number, string] | false
  x_studio_fecha_de_la_programacin?: string
  x_studio_hora_de_cita?: string
  x_studio_placa_camion?: string
  x_studio_placa_camin?: string
  x_studio_placa_carreta?: string
  x_studio_referencia_booking?: string
  x_studio_nmero_de_contenedor?: string
  x_studio_numero_de_contenedor?: string
  x_studio_agencia?: string
  x_studio_almacn_de_retiro?: string
  x_studio_almacen_de_retiro?: string
  x_studio_almacn_de_destino?: string
  x_studio_almacen_de_destino?: string
  x_studio_es_importacin?: boolean
  x_studio_es_importacion?: boolean
  x_studio_ingreso_a_almacen_de_retiro?: string | number | false
  x_studio_salida_de_almacen_de_retiro?: string | number | false
  x_studio_llegada_a_cliente?: string | number | false
  x_studio_ingreso_a_planta?: string | number | false
  x_studio_inicio_carga_descarga?: string | number | false
  x_studio_termino_de_carga_descarga?: string | number | false
}

interface Stats {
  total: number
  porEtapa: Record<string, number>
  clientes: string[]
}

function getMonthStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function parseMonth(str: string): Date {
  const [y, m] = str.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

function formatMonthLabel(str: string) {
  const [y, m] = str.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

function formatTime(val: string | number | false | undefined): string {
  if (val === null || val === undefined || val === false || val === '' || val === 'false') return '—'
  const num = Number(val)
  if (!isNaN(num) && !String(val).includes(':')) {
    const hours = Math.floor(num)
    const minutes = Math.round((num - hours) * 60)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }
  const match = String(val).match(/(\d{2}:\d{2})/)
  return match ? match[1] : String(val)
}

function formatDate(val: string | false | undefined): string {
  if (!val || val === 'false') return '—'
  const d = new Date(String(val))
  if (isNaN(d.getTime())) return String(val)
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

interface StageStyle {
  badge: string
  dot: string
}

function getStageStyle(stage: string): StageStyle {
  const lower = stage.toLowerCase()
  if (lower.includes('hecho') || lower.includes('complet') || lower.includes('finaliz'))
    return { badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' }
  if (lower.includes('proceso') || lower.includes('progress') || lower.includes('en curso'))
    return { badge: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' }
  if (lower.includes('cancel'))
    return { badge: 'bg-red-50 text-red-700 border border-red-200', dot: 'bg-red-500' }
  if (lower.includes('factura'))
    return { badge: 'bg-violet-50 text-violet-700 border border-violet-200', dot: 'bg-violet-500' }
  if (lower.includes('nueva') || lower.includes('solicitud'))
    return { badge: 'bg-sky-50 text-sky-700 border border-sky-200', dot: 'bg-sky-500' }
  if (lower.includes('devolu') || lower.includes('cierre') || lower.includes('pendiente'))
    return { badge: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500' }
  return { badge: 'bg-gray-100 text-gray-600 border border-gray-200', dot: 'bg-gray-400' }
}

function getContainer(task: ServicioTask): string {
  return task.x_studio_nmero_de_contenedor || task.x_studio_numero_de_contenedor || '—'
}

function extractPlaca(val: unknown): string {
  if (!val || val === false) return '—'
  const str = Array.isArray(val) ? String((val as [number, string])[1] || '') : String(val)
  return str.split('/').pop()?.trim() || str
}

function getTracto(task: ServicioTask): string {
  return extractPlaca(task.x_studio_placa_camion || task.x_studio_placa_camin)
}

function getAlmacenRetiro(task: ServicioTask): string {
  return task.x_studio_almacn_de_retiro || task.x_studio_almacen_de_retiro || '—'
}

function getAlmacenDestino(task: ServicioTask): string {
  return task.x_studio_almacn_de_destino || task.x_studio_almacen_de_destino || '—'
}

function getTiempos(task: ServicioTask) {
  return [
    { label: 'Ingreso almacén', value: formatTime(task.x_studio_ingreso_a_almacen_de_retiro) },
    { label: 'Salida almacén', value: formatTime(task.x_studio_salida_de_almacen_de_retiro) },
    { label: 'Llegada a cliente', value: formatTime(task.x_studio_llegada_a_cliente) },
    { label: 'Ingreso a planta', value: formatTime(task.x_studio_ingreso_a_planta) },
    { label: 'Inicio carga/descarga', value: formatTime(task.x_studio_inicio_carga_descarga) },
    { label: 'Fin carga/descarga', value: formatTime(task.x_studio_termino_de_carga_descarga) },
  ]
}

export default function ConductorServiciosPage() {
  const [currentMonth, setCurrentMonth] = useState(() => getMonthStr(new Date()))
  const [tasks, setTasks] = useState<ServicioTask[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const fetchServicios = useCallback(async (month: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/conductor/servicios?month=${month}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar servicios')
      setTasks(data.tasks || [])
      setStats(data.stats || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchServicios(currentMonth) }, [currentMonth, fetchServicios])

  const prevMonth = () => {
    const d = parseMonth(currentMonth)
    d.setMonth(d.getMonth() - 1)
    setCurrentMonth(getMonthStr(d))
  }
  const nextMonth = () => {
    const d = parseMonth(currentMonth)
    d.setMonth(d.getMonth() + 1)
    setCurrentMonth(getMonthStr(d))
  }

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const stageEntries = stats ? Object.entries(stats.porEtapa) : []

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#1a2332] leading-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Mis Servicios
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Servicios asignados por mes</p>
        </div>
        <button
          onClick={() => fetchServicios(currentMonth)}
          className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-gray-200 transition-all duration-200"
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
        <button
          onClick={prevMonth}
          className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all duration-200"
        >
          <ChevronLeft className="h-4 w-4 text-gray-400" />
        </button>
        <span
          className="font-bold text-[#1a2332] text-base tracking-tight"
          style={{ fontFamily: 'Montserrat, sans-serif' }}
        >
          {formatMonthLabel(currentMonth)}
        </span>
        <button
          onClick={nextMonth}
          className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all duration-200"
        >
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          {/* Total */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1">
            <p className="text-5xl font-extrabold text-[#1a2332]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              {stats.total}
            </p>
            <p className="text-xs text-gray-400 font-medium">servicios este mes</p>
          </div>

          {/* By stage */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
            {stageEntries.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Sin etapas</p>
            ) : stageEntries.map(([stage, count]) => {
              const style = getStageStyle(stage)
              return (
                <div key={stage} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                    <span className="text-[11px] text-gray-600 truncate">{stage}</span>
                  </div>
                  <span className="text-sm font-bold text-[#1a2332] tabular-nums shrink-0">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              <div className="px-4 py-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-14 bg-gray-100 rounded-full animate-pulse" />
                  <div className="h-3 w-8 bg-gray-100 rounded-full animate-pulse" />
                </div>
                <div className="h-4 w-48 bg-gray-100 rounded-full animate-pulse" />
                <div className="h-3 w-64 bg-gray-100 rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && tasks.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-4">
            <PackageSearch className="h-7 w-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">Sin servicios en {formatMonthLabel(currentMonth)}</p>
          <p className="text-xs text-gray-300 mt-1">Intenta con otro mes</p>
        </div>
      )}

      {/* Service cards */}
      {!loading && tasks.map(task => {
        const stage = Array.isArray(task.stage_id) ? task.stage_id[1] : 'Sin etapa'
        const client = Array.isArray(task.partner_id) ? task.partner_id[1] : '—'
        const isExpanded = expanded.has(task.id)
        const tiempos = getTiempos(task)
        const container = getContainer(task)
        const tracto = getTracto(task)
        const carreta = extractPlaca(task.x_studio_placa_carreta)
        const booking = task.x_studio_referencia_booking || '—'
        const agencia = task.x_studio_agencia || '—'
        const almacenRetiro = getAlmacenRetiro(task)
        const almacenDestino = getAlmacenDestino(task)
        const esImportacion = task.x_studio_es_importacin ?? task.x_studio_es_importacion ?? null
        const fecha = formatDate(task.x_studio_fecha_de_la_programacin)
        const hora = task.x_studio_hora_de_cita ? formatTime(task.x_studio_hora_de_cita) : null
        const stageStyle = getStageStyle(stage)

        return (
          <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-shadow duration-200 hover:shadow-md">
            {/* Card header button */}
            <button
              onClick={() => toggleExpand(task.id)}
              className="w-full text-left px-4 py-4 flex items-start justify-between gap-3 hover:bg-gray-50/50 transition-colors duration-150"
            >
              <div className="flex-1 min-w-0">
                {/* Meta row */}
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {fecha !== '—' && (
                    <span className="text-xs text-gray-400 font-medium">
                      {fecha}{hora ? ` · ${hora}` : ''}
                    </span>
                  )}
                  {esImportacion !== null && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold tracking-wide ${
                      esImportacion
                        ? 'bg-purple-50 text-purple-600 border border-purple-200'
                        : 'bg-orange-50 text-orange-600 border border-orange-200'
                    }`}>
                      {esImportacion ? 'IMP' : 'EXP'}
                    </span>
                  )}
                </div>
                <p className="font-bold text-[#1a2332] text-sm leading-tight truncate">{client}</p>
                <p className="text-xs text-gray-400 mt-1 truncate">{task.name}</p>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${stageStyle.badge}`}>
                  {stage}
                </span>
                <span className="text-gray-300">
                  {isExpanded
                    ? <ChevronUp className="h-4 w-4" />
                    : <ChevronDown className="h-4 w-4" />
                  }
                </span>
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50/50">
                <div className="px-4 py-4 space-y-3">
                  {/* Main info grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <InfoCell label="Contenedor" value={container} mono />
                    <InfoCell label="Booking" value={booking} mono />
                    <InfoCell label="Agencia" value={agencia} />
                  </div>

                  {/* Vehicles */}
                  <div className="flex items-center gap-3 bg-white rounded-xl px-3.5 py-2.5 border border-gray-100">
                    <Truck className="h-4 w-4 text-[#f5a623] shrink-0" />
                    <div className="flex gap-4 text-xs">
                      {tracto !== '—' && (
                        <div>
                          <span className="text-gray-400">Tracto </span>
                          <span className="font-bold text-[#1a2332]">{tracto}</span>
                        </div>
                      )}
                      {carreta !== '—' && (
                        <div>
                          <span className="text-gray-400">Carreta </span>
                          <span className="font-bold text-[#1a2332]">{carreta}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Almacenes */}
                  <div className="flex items-start gap-3 bg-white rounded-xl px-3.5 py-2.5 border border-gray-100">
                    <Building2 className="h-4 w-4 text-[#f5a623] shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p>
                        <span className="text-gray-400">Retiro: </span>
                        <span className="font-semibold text-[#1a2332]">{almacenRetiro}</span>
                      </p>
                      <p>
                        <span className="text-gray-400">Destino: </span>
                        <span className="font-semibold text-[#1a2332]">{almacenDestino}</span>
                      </p>
                    </div>
                  </div>

                  {/* Tiempos operativos */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100">
                        <Clock className="h-3.5 w-3.5 text-[#f5a623]" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Tiempos operativos</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {tiempos.map(t => (
                          <div key={t.label} className="flex items-center justify-between px-3.5 py-2">
                            <span className="text-xs text-gray-400">{t.label}</span>
                            <span className="text-xs font-bold text-[#1a2332] tabular-nums">{t.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Bottom spacing */}
      <div className="h-4" />
    </div>
  )
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-xl px-3 py-2.5 border border-gray-100">
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xs font-semibold text-[#1a2332] truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  )
}
