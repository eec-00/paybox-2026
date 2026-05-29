'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Truck, Clock, Building2, RefreshCw, PackageSearch,
  Play, CheckCircle2, SkipForward, ArrowLeft,
  FileText, Download, Loader2, AlertCircle,
  Receipt, Plus, Trash2, Camera, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const STEPS = [
  { label: 'Saliendo de cochera',   field: 'x_studio_saliendo_de_la_cochera' },
  { label: 'En cola de ingreso',    field: 'x_studio_en_cola_de_ingreso' },
  { label: 'Llegué almacén',        field: 'x_studio_ingreso_a_almacen_de_retiro_1' },
  { label: 'Salida almacén',        field: 'x_studio_salida_de_almacen_de_retiro' },
  { label: 'Llegada a cliente',     field: 'x_studio_llegada_a_cliente' },
  { label: 'Ingreso a cliente',     field: 'x_studio_ingreso_a_planta' },
  { label: 'Inicio carga/descarga', field: 'x_studio_inicio_cargadescarga' },
  { label: 'Fin carga/descarga',    field: 'x_studio_termino_de_descarga' },
  { label: 'Salida de cliente',     field: 'x_studio_salida_cliente' },
]

interface GastoItem {
  id: string
  descripcion: string
  monto: string
  moneda: 'soles' | 'dolares'
  fotos: string[]
}

interface NewGastoForm {
  descripcion: string
  monto: string
  moneda: 'soles' | 'dolares'
  files: File[]
  previews: string[]
  uploading: boolean
}

interface GastoExistente {
  id: string
  descripcion: string
  monto: number
  moneda: 'soles' | 'dolares'
  fotos: string[]
  created_at: string
}

const EMPTY_GASTO: NewGastoForm = {
  descripcion: '',
  monto: '',
  moneda: 'soles',
  files: [],
  previews: [],
  uploading: false,
}

async function uploadGastoFoto(file: File): Promise<string> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `gastos-conductor/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('comprobantes').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
  return data.publicUrl
}

interface ServicioTask {
  id: number
  name: string
  stage_id: [number, string] | false
  partner_id: [number, string] | false
  x_studio_fecha_de_la_programacin?: string
  x_studio_hora_de_cita?: number | false
  x_studio_placa?: [number, string] | false
  x_studio_placa_carreta?: [number, string] | false
  x_studio_referenciabooking?: string | false
  x_studio_nmero_de_contenedor?: string | false
  x_studio_agencia?: [number, string] | false
  x_studio_almacen_de_retiro?: [number, string] | false
  x_studio_almacen_de_destino?: [number, string] | false
  x_studio_es_importacion?: boolean
  x_studio_saliendo_de_la_cochera?: number | false
  x_studio_en_cola_de_ingreso?: number | false
  x_studio_ingreso_a_almacen_de_retiro_1?: number | false
  x_studio_salida_de_almacen_de_retiro?: number | false
  x_studio_llegada_a_cliente?: number | false
  x_studio_ingreso_a_planta?: number | false
  x_studio_inicio_cargadescarga?: number | false
  x_studio_termino_de_descarga?: number | false
  x_studio_salida_cliente?: number | false
}

interface Stats {
  total: number
  porEtapa: Record<string, number>
  clientes: string[]
}

type PendingConfirm = { taskId: number; stepIndex: number; action: 'start' | 'mark' | 'skip' }

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
function nowAsOdooFloat(): number {
  const now = new Date()
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
}

type GeoLocation = { lat: number; lng: number; accuracy: number }

function getLocation(): Promise<GeoLocation | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 0, enableHighAccuracy: true }
    )
  })
}
function formatTime(val: string | number | false | undefined): string {
  if (val === null || val === undefined || val === false || val === '' || val === 'false') return '—'
  const num = Number(val)
  if (!isNaN(num) && !String(val).includes(':')) {
    const h = Math.floor(num)
    const m = Math.round((num - h) * 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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
function getStageStyle(stage: string) {
  const lower = stage.toLowerCase()
  if (lower.includes('hecho') || lower.includes('complet') || lower.includes('finaliz'))
    return { badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' }
  if (lower.includes('proceso') || lower.includes('progress') || lower.includes('en curso'))
    return { badge: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' }
  if (lower.includes('cancel'))
    return { badge: 'bg-red-50 text-red-700 border border-red-200', dot: 'bg-red-500' }
  if (lower.includes('factura'))
    return { badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200', dot: 'bg-indigo-500' }
  if (lower.includes('nueva') || lower.includes('solicitud'))
    return { badge: 'bg-sky-50 text-sky-700 border border-sky-200', dot: 'bg-sky-500' }
  if (lower.includes('devolu') || lower.includes('cierre') || lower.includes('pendiente'))
    return { badge: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500' }
  return { badge: 'bg-gray-100 text-gray-600 border border-gray-200', dot: 'bg-gray-400' }
}
function extractName(val: unknown): string {
  if (!val || val === false) return '—'
  if (Array.isArray(val)) return String((val as [number, string])[1] || '') || '—'
  return String(val) || '—'
}
function extractPlaca(val: unknown): string {
  const name = extractName(val)
  if (name === '—') return '—'
  return name.split('/').pop()?.trim() || name
}
function getContainer(task: ServicioTask): string {
  return task.x_studio_nmero_de_contenedor || '—'
}
function getTracto(task: ServicioTask): string {
  return extractPlaca(task.x_studio_placa)
}
function getAlmacenRetiro(task: ServicioTask): string {
  return extractName(task.x_studio_almacen_de_retiro)
}
function getAlmacenDestino(task: ServicioTask): string {
  return extractName(task.x_studio_almacen_de_destino)
}
function getTiempos(task: ServicioTask) {
  return [
    { label: 'Saliendo de cochera',    value: formatTime(task.x_studio_saliendo_de_la_cochera) },
    { label: 'En cola de ingreso',     value: formatTime(task.x_studio_en_cola_de_ingreso) },
    { label: 'Ingreso almacén',        value: formatTime(task.x_studio_ingreso_a_almacen_de_retiro_1) },
    { label: 'Salida almacén',         value: formatTime(task.x_studio_salida_de_almacen_de_retiro) },
    { label: 'Llegada a cliente',      value: formatTime(task.x_studio_llegada_a_cliente) },
    { label: 'Ingreso a cliente',      value: formatTime(task.x_studio_ingreso_a_planta) },
    { label: 'Inicio carga/descarga',  value: formatTime(task.x_studio_inicio_cargadescarga) },
    { label: 'Fin carga/descarga',     value: formatTime(task.x_studio_termino_de_descarga) },
    { label: 'Salida de cliente',      value: formatTime(task.x_studio_salida_cliente) },
  ]
}

// ─── Guias Section ───────────────────────────────────────────────────────────

interface OdooAttachment {
  id: number | string
  name: string
  mimetype: string
  file_size: number
  fieldName?: string
  hasData: boolean
}

function GuiasSection({ taskId }: { taskId: number }) {
  const [attachments, setAttachments] = useState<OdooAttachment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/conductor/servicios/${taskId}/attachments`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.error) setError(data.error)
        else setAttachments(data.attachments || [])
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [taskId])

  const handleOpen = async (att: OdooAttachment) => {
    if (!att.hasData) return
    setDownloading(att.id)
    try {
      const res = await fetch(`/api/conductor/servicios/${taskId}/attachments/${att.id}`)
      if (!res.ok) throw new Error('Error al obtener archivo')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch {
      alert('No se pudo abrir el archivo')
    } finally {
      setDownloading(null)
    }
  }

  const handleDownload = async (att: OdooAttachment) => {
    if (!att.hasData) return
    setDownloading(att.id)
    try {
      const res = await fetch(`/api/conductor/servicios/${taskId}/attachments/${att.id}`)
      if (!res.ok) throw new Error('Error al descargar archivo')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = att.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch {
      alert('No se pudo descargar el archivo')
    } finally {
      setDownloading(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 px-3.5 py-3 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 text-gray-300 animate-spin shrink-0" />
        <span className="text-xs text-gray-400">Cargando documentos...</span>
      </div>
    )
  }

  if (error || !attachments || attachments.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100">
        <FileText className="h-3.5 w-3.5 text-[#f5a623]" />
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Documentos adjuntos</span>
      </div>
      <div className="divide-y divide-gray-50">
        {attachments.map(att => {
          const isPdf = att.mimetype === 'application/pdf'
          const isImage = att.mimetype.startsWith('image/')
          const isLoading = downloading === att.id
          // Strip extension from name for label, show it separately
          const label = att.name.replace(/\.[^.]+$/, '')
          const ext = att.name.match(/\.[^.]+$/)?.[0]?.toUpperCase().replace('.', '') || ''
          return (
            <div key={String(att.id)} className={`flex items-center gap-3 px-3.5 py-2.5 ${!att.hasData ? 'opacity-50' : ''}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${!att.hasData ? 'bg-gray-50' : isPdf ? 'bg-red-50' : isImage ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <FileText className={`h-3.5 w-3.5 ${!att.hasData ? 'text-gray-300' : isPdf ? 'text-red-500' : isImage ? 'text-blue-500' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold truncate ${att.hasData ? 'text-[#1a2332]' : 'text-gray-400'}`}>{label}</p>
                <p className="text-[10px] text-gray-400">
                  {att.hasData
                    ? att.file_size > 0 ? `${ext} · ${(att.file_size / 1024).toFixed(0)} KB` : ext
                    : 'Sin archivo'
                  }
                </p>
              </div>
              {att.hasData && (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleOpen(att)}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#f5a623] text-white text-[10px] font-bold disabled:opacity-50 active:scale-95 transition-transform"
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                    Ver
                  </button>
                  <button
                    onClick={() => handleDownload(att)}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[10px] font-bold disabled:opacity-50 active:scale-95 transition-transform"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ConductorServiciosPage() {
  const [currentMonth, setCurrentMonth] = useState(() => getMonthStr(new Date()))
  const [tasks, setTasks] = useState<ServicioTask[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [serviceSteps, setServiceSteps] = useState<Record<number, number>>({})
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null)

  // Gastos flow
  const [gastosForTaskId, setGastosForTaskId] = useState<number | null>(null)
  const [gastosItems, setGastosItems] = useState<GastoItem[]>([])
  const [gastosSubmitting, setGastosSubmitting] = useState(false)
  const [addingGasto, setAddingGasto] = useState(false)
  const [newGasto, setNewGasto] = useState<NewGastoForm>(EMPTY_GASTO)
  const [servicioGastosMap, setServicioGastosMap] = useState<Record<number, GastoExistente[]>>({})
  const [loadingGastosMap, setLoadingGastosMap] = useState<Record<number, boolean>>({})

  const fetchServicios = useCallback(async (month: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/conductor/servicios?month=${month}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar servicios')
      setTasks(data.tasks || [])
      setStats(data.stats || null)
      // Initialize completed services from DB
      if (data.completedServiceIds?.length) {
        setServiceSteps(prev => {
          const next = { ...prev }
          for (const id of data.completedServiceIds as number[]) {
            if ((prev[id] ?? -1) < STEPS.length) next[id] = STEPS.length
          }
          return next
        })
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchServicios(currentMonth) }, [currentMonth, fetchServicios])

  useEffect(() => {
    if (activeServiceId === null) return
    const step = serviceSteps[activeServiceId] ?? -1
    if (step >= STEPS.length && servicioGastosMap[activeServiceId] === undefined) {
      fetchGastosForService(activeServiceId)
    }
  }, [activeServiceId, serviceSteps])

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

  const handleConfirm = async () => {
    if (!pendingConfirm || saving) return
    const { taskId, stepIndex, action } = pendingConfirm

    if (action === 'start') {
      setServiceSteps(prev => ({ ...prev, [taskId]: 0 }))
      setActiveServiceId(taskId)
      setPendingConfirm(null)
      return
    }

    setSaving(true)
    try {
      if (action === 'mark') {
        const step = STEPS[stepIndex]
        const value = nowAsOdooFloat()

        // Capture location + save time in parallel
        const [res, location] = await Promise.all([
          fetch('/api/servicios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: taskId, fields: { [step.field]: value } }),
          }),
          getLocation(),
        ])

        if (res.ok) {
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [step.field]: value } : t))
        }

        if (location) {
          const supabase = createClient()
          supabase.from('service_locations').insert({
            task_id: taskId,
            step_index: stepIndex,
            step_label: step.label,
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
          }).then(() => {})
        }
      }
      const nextStep = stepIndex + 1
      setServiceSteps(prev => ({ ...prev, [taskId]: nextStep }))

      // Last step done → persist completion + change stage in Odoo
      if (nextStep >= STEPS.length) {
        createClient().auth.getUser().then(({ data: authData }) => {
          if (authData.user) {
            const t = tasks.find(x => x.id === taskId)
            const codigo = t ? (t.name.includes(' - ') ? t.name.split(' - ')[0] : t.name) : String(taskId)
            createClient()
              .from('conductor_servicios_completados')
              .upsert({ conductor_id: authData.user.id, servicio_id: taskId, servicio_nombre: codigo })
              .then(() => {})
          }
        })
        fetch('/api/servicios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: taskId, action: 'finalize' }),
        }).then(r => r.json()).then(data => {
          if (data.stageId) {
            setTasks(prev => prev.map(t =>
              t.id === taskId ? { ...t, stage_id: [data.stageId, data.stageName] as [number, string] } : t
            ))
          }
        }).catch(() => {})
      }
    } catch {
      setServiceSteps(prev => ({ ...prev, [taskId]: stepIndex + 1 }))
    } finally {
      setSaving(false)
      setPendingConfirm(null)
    }
  }

  const fetchGastosForService = async (taskId: number) => {
    setLoadingGastosMap(prev => ({ ...prev, [taskId]: true }))
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('gastos_conductor')
        .select('id, descripcion, monto, moneda, fotos, created_at')
        .eq('servicio_id', taskId)
        .order('created_at', { ascending: true })
      if (data) setServicioGastosMap(prev => ({ ...prev, [taskId]: data }))
    } finally {
      setLoadingGastosMap(prev => ({ ...prev, [taskId]: false }))
    }
  }

  const handleAgregarGastos = (taskId: number) => {
    setGastosItems([])
    setAddingGasto(false)
    setNewGasto(EMPTY_GASTO)
    setGastosForTaskId(taskId)
    setActiveServiceId(null)
  }

  const handleGastoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const remaining = 2 - newGasto.files.length
    const toAdd = files.slice(0, remaining)
    const previews = toAdd.map(f => URL.createObjectURL(f))
    setNewGasto(prev => ({
      ...prev,
      files: [...prev.files, ...toAdd],
      previews: [...prev.previews, ...previews],
    }))
    e.target.value = ''
  }

  const handleRemoveGastoFile = (idx: number) => {
    setNewGasto(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== idx),
      previews: prev.previews.filter((_, i) => i !== idx),
    }))
  }

  const handleAddGasto = async () => {
    if (!newGasto.descripcion.trim() || !newGasto.monto) return
    setNewGasto(prev => ({ ...prev, uploading: true }))
    try {
      const uploadedUrls: string[] = []
      for (const file of newGasto.files) {
        const url = await uploadGastoFoto(file)
        uploadedUrls.push(url)
      }
      setGastosItems(prev => [...prev, {
        id: crypto.randomUUID(),
        descripcion: newGasto.descripcion.trim(),
        monto: newGasto.monto,
        moneda: newGasto.moneda,
        fotos: uploadedUrls,
      }])
      setNewGasto(EMPTY_GASTO)
      setAddingGasto(false)
    } catch {
      alert('Error al subir las fotos. Inténtalo de nuevo.')
    } finally {
      setNewGasto(prev => ({ ...prev, uploading: false }))
    }
  }

  const handleRemoveGastoItem = (id: string) => {
    setGastosItems(prev => prev.filter(g => g.id !== id))
  }

  const handleSubmitGastos = async () => {
    if (!gastosForTaskId) return
    const task = tasks.find(t => t.id === gastosForTaskId)
    if (!task) return
    if (gastosItems.length === 0) {
      const tid = gastosForTaskId
      setGastosForTaskId(null)
      setActiveServiceId(tid)
      return
    }
    setGastosSubmitting(true)
    try {
      const servicioNombre = task.name
      for (const item of gastosItems) {
        await fetch('/api/conductor/gastos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            servicioId: gastosForTaskId,
            servicioNombre,
            descripcion: item.descripcion,
            monto: item.monto,
            moneda: item.moneda,
            fotos: item.fotos,
          }),
        })
      }
      await fetchGastosForService(gastosForTaskId)
    } catch {
      alert('Error al guardar gastos. Inténtalo de nuevo.')
    } finally {
      setGastosSubmitting(false)
      const tid = gastosForTaskId
      setGastosForTaskId(null)
      setGastosItems([])
      setActiveServiceId(tid)
    }
  }

  // id of the task currently in-progress (step 0-5), if any
  const inProgressId = Object.entries(serviceSteps).find(
    ([, step]) => step >= 0 && step < STEPS.length
  )?.[0]
  const inProgressTaskId = inProgressId ? Number(inProgressId) : null

  // ── Gastos registration view ─────────────────────────────────────────────
  if (gastosForTaskId !== null) {
    const task = tasks.find(t => t.id === gastosForTaskId)
    const serviceName = task ? task.name : `Servicio #${gastosForTaskId}`

    return (
      <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 4rem)' }}>
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            onClick={() => { const tid = gastosForTaskId; setGastosForTaskId(null); setGastosItems([]); setAddingGasto(false); setNewGasto(EMPTY_GASTO); setActiveServiceId(tid) }}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-medium">Gastos del servicio</p>
            <p className="text-sm font-bold text-[#1a2332] truncate">{serviceName}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-32">
          {/* Existing gastos (read-only) */}
          {(() => {
            const existing = servicioGastosMap[gastosForTaskId] || []
            const loadingEx = loadingGastosMap[gastosForTaskId]
            if (loadingEx) return (
              <div className="text-xs text-gray-400 text-center py-2">Cargando gastos anteriores...</div>
            )
            if (existing.length === 0) return null
            return (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ya registrados</p>
                {existing.map(g => (
                  <div key={g.id} className="bg-gray-50 rounded-xl border border-gray-100 px-3.5 py-2.5 flex gap-3 items-start">
                    {g.fotos?.length > 0 && (
                      <img src={g.fotos[0]} alt="foto" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#1a2332] line-clamp-1">{g.descripcion}</p>
                      <p className="text-xs font-bold text-[#f5a623] mt-0.5">
                        {g.moneda === 'soles' ? 'S/' : '$'} {g.monto.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-1" />
              </div>
            )
          })()}

          {/* Added gastos list */}
          {gastosItems.length > 0 && (
            <div className="space-y-2">
              {gastosItems.map((item, idx) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-100 px-3.5 py-3 flex gap-3 items-start">
                  {item.fotos.length > 0 && (
                    <img src={item.fotos[0]} alt="foto" className="w-12 h-12 rounded-lg object-cover border border-gray-100 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#1a2332] line-clamp-2">{item.descripcion}</p>
                    <p className="text-sm font-bold text-[#f5a623] mt-0.5">
                      {item.moneda === 'soles' ? 'S/' : '$'} {parseFloat(item.monto).toFixed(2)}
                    </p>
                    {item.fotos.length > 1 && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{item.fotos.length} fotos</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveGastoItem(item.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {gastosItems.length === 0 && !addingGasto && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-10 text-center">
              <Receipt className="h-8 w-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400 font-medium">Sin gastos agregados</p>
              <p className="text-xs text-gray-300 mt-1">Agrega cada compra por separado</p>
            </div>
          )}

          {/* Add gasto form */}
          {addingGasto ? (
            <div className="bg-white rounded-2xl border border-[#f5a623]/40 shadow-sm p-4 space-y-3">
              <p className="text-xs font-bold text-[#f5a623] uppercase tracking-widest">Nuevo gasto</p>

              {/* Photos */}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Foto(s) del comprobante (máx. 2)</p>
                <div className="flex gap-2 flex-wrap">
                  {newGasto.previews.map((src, i) => (
                    <div key={i} className="relative w-16 h-16">
                      <img src={src} alt={`foto ${i+1}`} className="w-full h-full object-cover rounded-lg border border-gray-100" />
                      <button
                        onClick={() => handleRemoveGastoFile(i)}
                        className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-red-500 rounded-full flex items-center justify-center"
                      >
                        <X className="h-2.5 w-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                  {newGasto.previews.length < 2 && (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-[#f5a623]/40 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:border-[#f5a623] transition-colors">
                      <Camera className="h-4 w-4 text-[#f5a623]/60" />
                      <span className="text-[9px] text-[#f5a623]/60 font-medium">Foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleGastoFileChange}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Descripción *</p>
                <textarea
                  rows={2}
                  placeholder="Ej: Almuerzo, peaje, hotel..."
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-[#f5a623]/60 focus:ring-1 focus:ring-[#f5a623]/20"
                  value={newGasto.descripcion}
                  onChange={e => setNewGasto(prev => ({ ...prev, descripcion: e.target.value }))}
                />
              </div>

              {/* Amount */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Monto *</p>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#f5a623]/60 focus:ring-1 focus:ring-[#f5a623]/20"
                    value={newGasto.monto}
                    onChange={e => setNewGasto(prev => ({ ...prev, monto: e.target.value }))}
                  />
                </div>
                <div className="w-24">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Moneda</p>
                  <select
                    className="w-full text-sm border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:border-[#f5a623]/60 bg-white"
                    value={newGasto.moneda}
                    onChange={e => setNewGasto(prev => ({ ...prev, moneda: e.target.value as 'soles' | 'dolares' }))}
                  >
                    <option value="soles">S/</option>
                    <option value="dolares">$</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setAddingGasto(false); setNewGasto(EMPTY_GASTO) }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddGasto}
                  disabled={newGasto.uploading || !newGasto.descripcion.trim() || !newGasto.monto}
                  className="flex-1 py-2.5 rounded-xl bg-[#f5a623] text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {newGasto.uploading ? (
                    <span className="flex items-center justify-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Subiendo...</span>
                  ) : 'Agregar'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingGasto(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#f5a623]/40 text-[#f5a623] text-sm font-semibold hover:bg-[#f5a623]/10 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar gasto
            </button>
          )}
        </div>

        {/* Bottom bar */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-4">
          <button
            onClick={handleSubmitGastos}
            disabled={gastosSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1a2332] text-white text-sm font-bold disabled:opacity-60 active:scale-95 transition-transform"
          >
            {gastosSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Guardando...</>
            ) : gastosItems.length === 0 ? (
              'Terminar sin gastos'
            ) : (
              <><CheckCircle2 className="h-4 w-4" />Guardar {gastosItems.length} gasto{gastosItems.length !== 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      </div>
    )
  }

  // ── Active service view ──────────────────────────────────────────────────
  if (activeServiceId !== null) {
    const task = tasks.find(t => t.id === activeServiceId)
    if (!task) {
      setActiveServiceId(null)
      return null
    }

    const currentStep = serviceSteps[task.id] ?? 0
    const isConfirming = pendingConfirm?.taskId === task.id
    const stage = Array.isArray(task.stage_id) ? task.stage_id[1] : 'Sin etapa'
    const client = Array.isArray(task.partner_id) ? task.partner_id[1] : '—'
    const stageStyle = getStageStyle(stage)
    const tracto = getTracto(task)
    const carreta = extractPlaca(task.x_studio_placa_carreta)
    const tiempos = getTiempos(task)
    const almacenRetiro = getAlmacenRetiro(task)
    const almacenDestino = getAlmacenDestino(task)
    const fecha = formatDate(task.x_studio_fecha_de_la_programacin)
    const horaCita = task.x_studio_hora_de_cita ? formatTime(task.x_studio_hora_de_cita) : null

    return (
      <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 4rem)' }}>
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            onClick={() => { setActiveServiceId(null); setPendingConfirm(null) }}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-medium">Servicio activo</p>
            <p className="text-sm font-bold text-[#1a2332] truncate">{client}</p>
          </div>
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold whitespace-nowrap shrink-0 ${stageStyle.badge}`}>
            {stage}
          </span>
        </div>

        {/* Scrollable detail */}
        <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
          {/* Service name + meta */}
          <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100 space-y-2">
            <p className="text-xs text-gray-400">{task.name}</p>
            <div className="flex gap-4 flex-wrap">
              {fecha !== '—' && (
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">F. Programación</p>
                  <p className="text-xs font-semibold text-[#1a2332]">{fecha}</p>
                </div>
              )}
              {horaCita && (
                <div>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Hora Cita</p>
                  <p className="text-xs font-semibold text-[#1a2332]">{horaCita}</p>
                </div>
              )}
              <div>
                <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Contenedor</p>
                <p className="text-xs font-mono font-semibold text-[#1a2332]">{getContainer(task)}</p>
              </div>
            </div>
          </div>

          {/* Vehicle */}
          {(tracto !== '—' || carreta !== '—') && (
            <div className="flex items-center gap-3 bg-white rounded-xl px-3.5 py-2.5 border border-gray-100">
              <Truck className="h-4 w-4 text-[#f5a623] shrink-0" />
              <div className="flex gap-4 text-xs">
                {tracto !== '—' && (
                  <div><span className="text-gray-400">Tracto </span><span className="font-bold text-[#1a2332]">{tracto}</span></div>
                )}
                {carreta !== '—' && (
                  <div><span className="text-gray-400">Carreta </span><span className="font-bold text-[#1a2332]">{carreta}</span></div>
                )}
              </div>
            </div>
          )}

          {/* Almacenes */}
          <div className="flex items-start gap-3 bg-white rounded-xl px-3.5 py-2.5 border border-gray-100">
            <Building2 className="h-4 w-4 text-[#f5a623] shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p><span className="text-gray-400">Retiro: </span><span className="font-semibold text-[#1a2332]">{almacenRetiro}</span></p>
              <p><span className="text-gray-400">Destino: </span><span className="font-semibold text-[#1a2332]">{almacenDestino}</span></p>
            </div>
          </div>

          {/* Tiempos */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100">
              <Clock className="h-3.5 w-3.5 text-[#f5a623]" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Tiempos operativos</span>
            </div>
            <div className="divide-y divide-gray-50">
              {tiempos.map((t, i) => (
                <div
                  key={t.label}
                  className={`flex items-center justify-between px-3.5 py-2 ${i === currentStep ? 'bg-amber-50' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    {i < currentStep && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                    {i === currentStep && <span className="w-1.5 h-1.5 rounded-full bg-[#f5a623] shrink-0" />}
                    {i > currentStep && <span className="w-1.5 h-1.5 rounded-full bg-gray-200 shrink-0" />}
                    <span className={`text-xs ${i === currentStep ? 'font-semibold text-[#1a2332]' : 'text-gray-400'}`}>{t.label}</span>
                  </div>
                  <span className="text-xs font-bold text-[#1a2332] tabular-nums">{t.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Documentos adjuntos */}
          <GuiasSection taskId={task.id} />
        </div>

        {/* Sticky workflow controls */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-4 space-y-2">
          {currentStep < STEPS.length ? (
            isConfirming ? (
              <ConfirmRow
                label={
                  pendingConfirm?.action === 'skip'
                    ? `¿Saltar "${STEPS[currentStep].label}"?`
                    : `¿Confirmar: ${STEPS[currentStep].label}?`
                }
                onConfirm={handleConfirm}
                onCancel={() => setPendingConfirm(null)}
                saving={saving}
              />
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingConfirm({ taskId: task.id, stepIndex: currentStep, action: 'mark' })}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#f5a623] text-white text-sm font-bold active:scale-95 transition-transform"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {STEPS[currentStep].label}
                </button>
                <button
                  onClick={() => setPendingConfirm({ taskId: task.id, stepIndex: currentStep, action: 'skip' })}
                  className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium active:scale-95 transition-transform"
                >
                  <SkipForward className="h-4 w-4" />
                  Saltar
                </button>
              </div>
            )
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 py-1 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-bold">Servicio completado</span>
              </div>
              {(() => {
                const existing = servicioGastosMap[task.id] || []
                const loadingEx = loadingGastosMap[task.id]
                if (loadingEx) return <p className="text-xs text-center text-gray-400">Cargando gastos...</p>
                if (existing.length > 0) return (
                  <p className="text-xs text-center text-gray-400">
                    {existing.length} gasto{existing.length !== 1 ? 's' : ''} registrado{existing.length !== 1 ? 's' : ''}
                  </p>
                )
                return null
              })()}
              <button
                onClick={() => handleAgregarGastos(task.id)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#f5a623]/40 text-[#f5a623] text-sm font-semibold hover:bg-[#f5a623]/10 active:scale-95 transition-transform"
              >
                <Receipt className="h-4 w-4" />
                {(servicioGastosMap[task.id]?.length ?? 0) > 0 ? 'Ver / Agregar gastos' : 'Registrar gastos'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────
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
        <button onClick={prevMonth} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all duration-200">
          <ChevronLeft className="h-4 w-4 text-gray-400" />
        </button>
        <span className="font-bold text-[#1a2332] text-base tracking-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          {formatMonthLabel(currentMonth)}
        </span>
        <button onClick={nextMonth} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all duration-200">
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1">
            <p className="text-5xl font-extrabold text-[#1a2332]" style={{ fontFamily: 'Montserrat, sans-serif' }}>{stats.total}</p>
            <p className="text-xs text-gray-400 font-medium">servicios este mes</p>
          </div>
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

      {/* Continuar servicio rápido */}
      {inProgressTaskId !== null && (() => {
        const t = tasks.find(x => x.id === inProgressTaskId)
        if (!t) return null
        const client = Array.isArray(t.partner_id) ? t.partner_id[1] : t.name
        return (
          <button
            onClick={() => setActiveServiceId(inProgressTaskId)}
            className="w-full flex items-center gap-3 bg-[#f5a623] text-white rounded-2xl px-4 py-3 shadow-sm active:scale-95 transition-transform"
          >
            <Play className="h-5 w-5 shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide">Servicio en curso</p>
              <p className="text-sm font-bold truncate">{client}</p>
            </div>
            <span className="text-xs font-semibold opacity-80">Continuar →</span>
          </button>
        )
      })()}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Loading */}
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
        const booking = extractName(task.x_studio_referenciabooking)
        const agencia = extractName(task.x_studio_agencia)
        const almacenRetiro = getAlmacenRetiro(task)
        const almacenDestino = getAlmacenDestino(task)
        const esImportacion = task.x_studio_es_importacion ?? null
        const fecha = formatDate(task.x_studio_fecha_de_la_programacin)
        const horaCita = task.x_studio_hora_de_cita ? formatTime(task.x_studio_hora_de_cita) : null
        const stageStyle = getStageStyle(stage)

        const taskStep = serviceSteps[task.id] ?? -1
        const isInProgress = taskStep >= 0 && taskStep < STEPS.length
        const isDone = taskStep >= STEPS.length
        const otherInProgress = inProgressTaskId !== null && inProgressTaskId !== task.id

        // Confirm pending for this card's "Iniciar" button in list view
        const isConfirmingStart = pendingConfirm?.taskId === task.id && pendingConfirm?.action === 'start'

        return (
          <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-shadow duration-200 hover:shadow-md">
            {/* Card header */}
            <button
              onClick={() => toggleExpand(task.id)}
              className="w-full text-left px-4 py-4 flex items-start justify-between gap-3 hover:bg-gray-50/50 transition-colors duration-150"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  {fecha !== '—' && (
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">F. Programación</p>
                        <p className="text-xs font-semibold text-[#1a2332]">{fecha}</p>
                      </div>
                      {horaCita && (
                        <div>
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Hora Cita</p>
                          <p className="text-xs font-semibold text-[#1a2332]">{horaCita}</p>
                        </div>
                      )}
                    </div>
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
                <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${stageStyle.badge}`}>{stage}</span>
                <span className="text-gray-300">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </div>
            </button>

            {/* Service action buttons (outside expand, always visible) */}
            {!isDone && (
              <div className="px-4 pb-3">
                {isInProgress ? (
                  <button
                    onClick={() => setActiveServiceId(task.id)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#f5a623] text-white text-sm font-bold active:scale-95 transition-transform"
                  >
                    <Play className="h-4 w-4" />
                    Continuar servicio
                  </button>
                ) : isConfirmingStart ? (
                  <ConfirmRow
                    label="¿Iniciar servicio?"
                    onConfirm={handleConfirm}
                    onCancel={() => setPendingConfirm(null)}
                    saving={saving}
                  />
                ) : (
                  <button
                    onClick={() => !otherInProgress && setPendingConfirm({ taskId: task.id, stepIndex: 0, action: 'start' })}
                    disabled={otherInProgress}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
                  >
                    <Play className="h-4 w-4" />
                    {otherInProgress ? 'Otro servicio en curso' : 'Iniciar servicio'}
                  </button>
                )}
              </div>
            )}

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50/50">
                <div className="px-4 py-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <InfoCell label="Contenedor" value={container} mono />
                    <InfoCell label="Booking" value={booking} mono />
                    <InfoCell label="Agencia" value={agencia} />
                  </div>

                  <div className="flex items-center gap-3 bg-white rounded-xl px-3.5 py-2.5 border border-gray-100">
                    <Truck className="h-4 w-4 text-[#f5a623] shrink-0" />
                    <div className="flex gap-4 text-xs">
                      {tracto !== '—' && (
                        <div><span className="text-gray-400">Tracto </span><span className="font-bold text-[#1a2332]">{tracto}</span></div>
                      )}
                      {carreta !== '—' && (
                        <div><span className="text-gray-400">Carreta </span><span className="font-bold text-[#1a2332]">{carreta}</span></div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-white rounded-xl px-3.5 py-2.5 border border-gray-100">
                    <Building2 className="h-4 w-4 text-[#f5a623] shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p><span className="text-gray-400">Retiro: </span><span className="font-semibold text-[#1a2332]">{almacenRetiro}</span></p>
                      <p><span className="text-gray-400">Destino: </span><span className="font-semibold text-[#1a2332]">{almacenDestino}</span></p>
                    </div>
                  </div>

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

                  <GuiasSection taskId={task.id} />
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div className="h-4" />
    </div>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-xl px-3 py-2.5 border border-gray-100">
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xs font-semibold text-[#1a2332] truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function ConfirmRow({ label, onConfirm, onCancel, saving }: {
  label: string
  onConfirm: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 text-center font-medium">{label}</p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform"
        >
          {saving ? 'Guardando...' : 'Confirmar'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
