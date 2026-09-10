'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  RefreshCw, Search, XCircle, Truck, Pencil, Info, CornerDownRight, RotateCcw, Loader2,
  Columns, Filter, ArrowUp, ArrowDown, ArrowUpDown, Download, FileSpreadsheet, CalendarRange,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ServiciosEditModal } from '@/components/ServiciosEditModal'
import { tipoServicioLabelFor, TIPOS_SERVICIO } from '@/lib/servicios/hitos'
import { calcularProgreso, ProgresoBadge } from '@/lib/servicios/progreso'
import {
  EXPORT_FORMATS, buildQuimtiaRow, buildEyMRow, buildCroslandRow,
  QUIMTIA_COLUMNS, EYM_COLUMNS, CROSLAND_COLUMNS, type ExportClientFormat,
} from '@/lib/servicios/exportFormats'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

interface OdooTask {
  id: number
  name: string
  stage_id: [number, string] | false
  partner_id: [number, string] | false
  date_deadline: string | false
  // OPERATIVA TRANSPORTE
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
  x_studio_es_import?: boolean
  x_studio_es_export?: boolean
  x_studio_es_despacho?: boolean
  x_studio_es_itk?: boolean
  x_studio_es_isotanque_lleno?: boolean
  x_studio_es_isotanque_vacio?: boolean
  x_studio_almacen_de_devolucion?: [number, string] | false
  // Presente cuando la tarea es una subtarea (ej. "Devolución de vacío",
  // "Retiro de vacío – Exportación") vinculada a un servicio principal.
  parent_id?: [number, string] | false
  [key: string]: unknown
}

/** Código del servicio (ej. "S02459") a partir de su nombre completo. Para
 * una subtarea (parent_id seteado) usa el código del servicio padre, ya que
 * su propio nombre ("Devolución de vacío", "Retiro de vacío – Exportación")
 * no lo trae. */
function servicioCodigo(t: OdooTask): string {
  const nameSource = t.parent_id ? t.parent_id[1] : t.name
  return nameSource.includes(' - ') ? nameSource.split(' - ')[0] : nameSource
}

interface OdooStage { id: number; name: string }

function formatOdooTime(value: number | false): string {
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

function m2oName(value: [number, string] | false): string {
  if (!value) return '—'
  return value[1]
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr(): string {
  return toDateStr(new Date())
}
/** Lunes a domingo de la semana en curso (hora local del dispositivo). */
function currentWeekRange(): { start: string; end: string } {
  const now = new Date()
  const dow = now.getDay() // 0 domingo .. 6 sábado
  const monday = new Date(now)
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: toDateStr(monday), end: toDateStr(sunday) }
}
function matchesDateRange(t: OdooTask, start: string, end: string): boolean {
  const fecha = t.x_studio_fecha_de_la_programacin
  return typeof fecha === 'string' && fecha >= start && fecha <= end
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

function extractPlacaLast6(val: [number, string] | false): string {
  if (!val) return '—'
  const name = val[1]
  if (!name) return '—'
  return name.slice(-6).trim() || '—'
}

const PAGE_SIZE = 50
const PROGRESO_RANK: Record<string, number> = { sin_iniciar: 0, en_proceso: 1, completado: 2 }
const HIDDEN_COLUMNS_STORAGE_KEY = 'paybox_servicios_columnas_ocultas'

type ProgresoCtx = { progresoMap: Map<number, number>; completadosSet: Set<number> }

// Columnas "de datos" — ordenables y ocultables. El Código y las 3 acciones
// (editar/ver/reiniciar) quedan fijas fuera de esta lista: son la forma de
// identificar y operar cada fila, no tendría sentido poder esconderlas.
interface ColumnDef {
  key: string
  label: string
  headClass?: string
  cellClass?: string
  sortValue: (t: OdooTask, ctx: ProgresoCtx) => string | number
  render: (t: OdooTask, ctx: ProgresoCtx) => React.ReactNode
}

const COLUMNS: ColumnDef[] = [
  {
    key: 'etapa', label: 'Etapa', headClass: 'w-10 text-center', cellClass: 'text-center',
    sortValue: (t) => (t.stage_id ? t.stage_id[1] : ''),
    render: (t) => {
      const stageName = t.stage_id ? t.stage_id[1] : ''
      return stageName ? <span className={`inline-block w-3 h-3 rounded-full ${stageDotColor(stageName)}`} title={stageName} /> : '—'
    },
  },
  {
    key: 'tipo', label: 'Tipo de Servicio', headClass: 'min-w-[150px]',
    sortValue: (t) => tipoServicioLabelFor(t),
    render: (t) => tipoServicioLabelFor(t),
  },
  {
    key: 'progreso', label: 'Progreso', headClass: 'min-w-[130px]',
    sortValue: (t, ctx) => {
      const p = calcularProgreso(t, ctx.progresoMap, ctx.completadosSet)
      return PROGRESO_RANK[p.estado] * 1000 + (p.totalHitos > 0 ? p.stepActual / p.totalHitos : 0)
    },
    render: (t, ctx) => <ProgresoBadge progreso={calcularProgreso(t, ctx.progresoMap, ctx.completadosSet)} />,
  },
  {
    key: 'cliente', label: 'Cliente', headClass: 'min-w-[180px]',
    sortValue: (t) => m2oName(t.partner_id),
    render: (t) => m2oName(t.partner_id),
  },
  {
    key: 'fecha', label: 'F. Programación', headClass: 'min-w-[110px]',
    sortValue: (t) => t.x_studio_fecha_de_la_programacin || '',
    render: (t) => formatDate(t.x_studio_fecha_de_la_programacin),
  },
  {
    key: 'horaCita', label: 'Hora Cita', headClass: 'min-w-[90px] text-center', cellClass: 'text-center',
    sortValue: (t) => (typeof t.x_studio_hora_de_cita === 'number' ? t.x_studio_hora_de_cita : -1),
    render: (t) => formatOdooTime(t.x_studio_hora_de_cita),
  },
  {
    key: 'placaCamion', label: 'Placa Camión', headClass: 'min-w-[80px]', cellClass: 'font-mono',
    sortValue: (t) => extractPlacaLast6(t.x_studio_placa),
    render: (t) => extractPlacaLast6(t.x_studio_placa),
  },
  {
    key: 'placaCarreta', label: 'Placa Carreta', headClass: 'min-w-[80px]', cellClass: 'font-mono',
    sortValue: (t) => extractPlacaLast6(t.x_studio_placa_carreta),
    render: (t) => extractPlacaLast6(t.x_studio_placa_carreta),
  },
  {
    key: 'conductor', label: 'Conductor', headClass: 'min-w-[180px]',
    sortValue: (t) => m2oName(t.x_studio_conductor),
    render: (t) => m2oName(t.x_studio_conductor),
  },
  {
    key: 'refBooking', label: 'Ref/Booking', headClass: 'min-w-[130px]',
    sortValue: (t) => t.x_studio_referenciabooking || '',
    render: (t) => t.x_studio_referenciabooking || '—',
  },
  {
    key: 'agencia', label: 'Agencia', headClass: 'min-w-[120px]',
    sortValue: (t) => t.x_studio_agencia || '',
    render: (t) => t.x_studio_agencia || '—',
  },
  {
    key: 'contenedor', label: 'N° Contenedor', headClass: 'min-w-[140px]', cellClass: 'font-mono',
    sortValue: (t) => t.x_studio_nmero_de_contenedor || '',
    render: (t) => t.x_studio_nmero_de_contenedor || '—',
  },
  {
    key: 'almacenRetiro', label: 'Almacén Retiro', headClass: 'min-w-[200px]',
    sortValue: (t) => m2oName(t.x_studio_almacen_de_retiro),
    render: (t) => (
      <span className="line-clamp-2 leading-snug text-[11px] max-w-[220px] block" title={m2oName(t.x_studio_almacen_de_retiro)}>
        {m2oName(t.x_studio_almacen_de_retiro)}
      </span>
    ),
  },
  {
    key: 'almacenDestino', label: 'Almacén Destino', headClass: 'min-w-[200px]',
    sortValue: (t) => m2oName(t.x_studio_almacen_de_destino),
    render: (t) => (
      <span className="line-clamp-2 leading-snug text-[11px] max-w-[220px] block" title={m2oName(t.x_studio_almacen_de_destino)}>
        {m2oName(t.x_studio_almacen_de_destino)}
      </span>
    ),
  },
]

export function ServiciosSection() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<OdooTask[]>([])
  const [stages, setStages] = useState<OdooStage[]>([])
  const [validFields, setValidFields] = useState<string[]>([])
  const [progresoMap, setProgresoMap] = useState<Map<number, number>>(new Map())
  const [completadosSet, setCompletadosSet] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [tipoFilter, setTipoFilter] = useState('all')
  const [progresoFilter, setProgresoFilter] = useState('all')
  const [conductorFilter, setConductorFilter] = useState('all')
  const [clienteFilter, setClienteFilter] = useState('all')
  const [fechaFilter, setFechaFilter] = useState('')
  const [almacenDestinoFilter, setAlmacenDestinoFilter] = useState('all')
  const [almacenRetiroFilter, setAlmacenRetiroFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [editingTask, setEditingTask] = useState<OdooTask | null>(null)
  const [resetTask, setResetTask] = useState<OdooTask | null>(null)
  const [resetting, setResetting] = useState(false)

  // Móvil: los filtros ocupan mucho espacio y estorban — quedan colapsados
  // detrás de un botón "Filtros" salvo que el usuario los abra.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Ordenar por columna (clic en el encabezado) — no se persiste, es por sesión.
  // Por defecto ordenado por fecha de programación, de más reciente a más
  // antigua — el usuario puede cambiarlo tocando cualquier encabezado.
  const [sortKey, setSortKey] = useState<string | null>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Columnas ocultas — se guardan en localStorage por dispositivo, para que
  // cada quien vea la tabla como prefiere sin afectar a los demás.
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [columnsPrefsLoaded, setColumnsPrefsLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY)
      if (raw) setHiddenColumns(new Set(JSON.parse(raw)))
    } catch { /* localStorage no disponible o dato corrupto: se ignora */ }
    setColumnsPrefsLoaded(true)
  }, [])

  useEffect(() => {
    if (!columnsPrefsLoaded) return // evita pisar lo guardado con el estado inicial vacío
    try {
      localStorage.setItem(HIDDEN_COLUMNS_STORAGE_KEY, JSON.stringify(Array.from(hiddenColumns)))
    } catch { /* ignorar */ }
  }, [hiddenColumns, columnsPrefsLoaded])

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  const visibleColumns = useMemo(() => COLUMNS.filter((c) => !hiddenColumns.has(c.key)), [hiddenColumns])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [res, progresoRes, completadosRes] = await Promise.all([
        fetch('/api/servicios'),
        supabase.from('conductor_servicios_progreso').select('servicio_id, step_actual'),
        supabase.from('conductor_servicios_completados').select('servicio_id'),
      ])
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Error al cargar servicios')
      }
      const data = await res.json()
      const loadedTasks: OdooTask[] = data.tasks ?? []
      // Orden por código de servicio, no alfabético por nombre completo: una
      // subtarea no trae el "S0XXXX" en su propio nombre, así que ordenar por
      // nombre la manda siempre al final de la lista, lejos de su servicio.
      // Este es el orden por defecto; el usuario puede cambiarlo tocando los
      // encabezados de la tabla.
      loadedTasks.sort((a, b) => servicioCodigo(b).localeCompare(servicioCodigo(a), undefined, { numeric: true }))
      setTasks(loadedTasks)
      setStages(data.stages ?? [])
      setValidFields(data.validFields ?? [])
      setProgresoMap(new Map(
        (progresoRes.data ?? []).map((p: { servicio_id: number; step_actual: number }) => [p.servicio_id, p.step_actual])
      ))
      setCompletadosSet(new Set((completadosRes.data ?? []).map((c: { servicio_id: number }) => c.servicio_id)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleConfirmReset = async () => {
    if (!resetTask) return
    setResetting(true)
    try {
      const res = await fetch('/api/servicios/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resetTask.id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Error al reiniciar el servicio')
      toast.success('Servicio reiniciado — el conductor puede volver a marcar sus horas desde cero')
      setResetTask(null)
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Error al reiniciar el servicio')
    } finally {
      setResetting(false)
    }
  }

  // Exportar Excel por cliente — cada uno tiene su propia plantilla de
  // columnas (ver lib/servicios/exportFormats). Antes de generar el archivo
  // se pregunta el rango de fechas (hoy / esta semana / personalizado);
  // además de la fecha, siempre filtra por el cliente elegido y respeta los
  // demás filtros que ya tenga puesta la tabla (conductor, etapa, etc.).
  const [exportingFormat, setExportingFormat] = useState<ExportClientFormat | null>(null)
  const [exportDialogFormat, setExportDialogFormat] = useState<ExportClientFormat | null>(null)
  const [exportRangeMode, setExportRangeMode] = useState<'hoy' | 'semana' | 'custom'>('hoy')
  const [exportStart, setExportStart] = useState(todayStr())
  const [exportEnd, setExportEnd] = useState(todayStr())

  const openExportDialog = (formatKey: ExportClientFormat) => {
    setExportRangeMode('hoy')
    setExportStart(todayStr())
    setExportEnd(todayStr())
    setExportDialogFormat(formatKey)
  }

  const activeExportRange = (): { start: string; end: string } => {
    if (exportRangeMode === 'hoy') { const t = todayStr(); return { start: t, end: t } }
    if (exportRangeMode === 'semana') return currentWeekRange()
    return { start: exportStart, end: exportEnd }
  }

  const handleConfirmExport = async () => {
    if (!exportDialogFormat) return
    const formatKey = exportDialogFormat
    const { start, end } = activeExportRange()
    if (!start || !end) { toast.error('Selecciona un rango de fechas válido'); return }

    setExportingFormat(formatKey)
    try {
      const format = EXPORT_FORMATS[formatKey]
      const rows = sorted.filter((t) => format.matchClient(m2oName(t.partner_id)) && matchesDateRange(t, start, end))
      if (rows.length === 0) {
        toast.error(`No hay servicios de ${format.label} en ese rango de fechas`)
        return
      }

      const ctx: ProgresoCtx = { progresoMap, completadosSet }
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet(format.label)

      if (formatKey === 'quimtia') {
        worksheet.columns = QUIMTIA_COLUMNS
        rows.forEach((t) => worksheet.addRow(buildQuimtiaRow(t, ctx)))
      } else if (formatKey === 'eym') {
        worksheet.columns = EYM_COLUMNS
        rows.forEach((t) => worksheet.addRow(buildEyMRow(t, ctx)))
      } else {
        worksheet.columns = CROSLAND_COLUMNS
        rows.forEach((t, i) => worksheet.addRow(buildCroslandRow(t, ctx, i + 1)))
      }

      // Estilo de cabecera (igual al resto de exportaciones del sistema)
      const headerRow = worksheet.getRow(1)
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2332' } }
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })
      headerRow.height = 25
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle' }
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFECF0F1' } } }
        })
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const rango = start === end ? start.replace(/-/g, '') : `${start.replace(/-/g, '')}_a_${end.replace(/-/g, '')}`
      saveAs(new Blob([buffer]), `Servicios_${format.label.replace(/\s/g, '')}_${rango}.xlsx`)
      toast.success(`Excel de ${format.label} generado (${rows.length} servicios)`)
      setExportDialogFormat(null)
    } catch (err: any) {
      toast.error(err.message || 'Error al exportar')
    } finally {
      setExportingFormat(null)
    }
  }

  const conductorOptions = useMemo(() => {
    const names = new Set(tasks.map((t) => m2oName(t.x_studio_conductor)).filter((n) => n !== '—'))
    return Array.from(names).sort()
  }, [tasks])

  const clienteOptions = useMemo(() => {
    const names = new Set(tasks.map((t) => m2oName(t.partner_id)).filter((n) => n !== '—'))
    return Array.from(names).sort()
  }, [tasks])

  const almacenDestinoOptions = useMemo(() => {
    const names = new Set(tasks.map((t) => m2oName(t.x_studio_almacen_de_destino)).filter((n) => n !== '—'))
    return Array.from(names).sort()
  }, [tasks])

  const almacenRetiroOptions = useMemo(() => {
    const names = new Set(tasks.map((t) => m2oName(t.x_studio_almacen_de_retiro)).filter((n) => n !== '—'))
    return Array.from(names).sort()
  }, [tasks])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return tasks.filter((t) => {
      if (stageFilter !== 'all') {
        const stageName = t.stage_id ? t.stage_id[1] : ''
        if (stageName !== stageFilter) return false
      }
      if (tipoFilter !== 'all' && tipoServicioLabelFor(t) !== tipoFilter) return false
      if (progresoFilter !== 'all' && calcularProgreso(t, progresoMap, completadosSet).estado !== progresoFilter) return false
      if (conductorFilter !== 'all' && m2oName(t.x_studio_conductor) !== conductorFilter) return false
      if (clienteFilter !== 'all' && m2oName(t.partner_id) !== clienteFilter) return false
      if (almacenDestinoFilter !== 'all' && m2oName(t.x_studio_almacen_de_destino) !== almacenDestinoFilter) return false
      if (almacenRetiroFilter !== 'all' && m2oName(t.x_studio_almacen_de_retiro) !== almacenRetiroFilter) return false
      if (fechaFilter && t.x_studio_fecha_de_la_programacin !== fechaFilter) return false
      if (!q) return true
      const searchable = [
        t.name,
        servicioCodigo(t),
        m2oName(t.partner_id),
        m2oName(t.x_studio_conductor),
        t.x_studio_nmero_de_contenedor || '',
        t.x_studio_referenciabooking || '',
        Array.isArray(t.x_studio_placa) ? t.x_studio_placa[1] : '',
        t.x_studio_agencia || '',
      ].join(' ').toLowerCase()
      return searchable.includes(q)
    })
  }, [tasks, search, stageFilter, tipoFilter, progresoFilter, progresoMap, completadosSet, conductorFilter, clienteFilter, almacenDestinoFilter, almacenRetiroFilter, fechaFilter])

  // Orden elegido por el usuario tocando un encabezado. "Código" se ordena
  // con el mismo criterio numérico que el orden por defecto de fetchData.
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const dirMul = sortDir === 'asc' ? 1 : -1
    const ctx: ProgresoCtx = { progresoMap, completadosSet }
    if (sortKey === 'codigo') {
      return [...filtered].sort((a, b) => servicioCodigo(a).localeCompare(servicioCodigo(b), undefined, { numeric: true }) * dirMul)
    }
    const col = COLUMNS.find((c) => c.key === sortKey)
    if (!col) return filtered
    return [...filtered].sort((a, b) => {
      const va = col.sortValue(a, ctx)
      const vb = col.sortValue(b, ctx)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dirMul
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dirMul
    })
  }, [filtered, sortKey, sortDir, progresoMap, completadosSet])

  const exportPreviewCount = useMemo(() => {
    if (!exportDialogFormat) return 0
    const { start, end } = activeExportRange()
    if (!start || !end) return 0
    const format = EXPORT_FORMATS[exportDialogFormat]
    return sorted.filter((t) => format.matchClient(m2oName(t.partner_id)) && matchesDateRange(t, start, end)).length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportDialogFormat, exportRangeMode, exportStart, exportEnd, sorted])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  function SortIcon({ colKey }: { colKey: string }) {
    if (sortKey !== colKey) return <ArrowUpDown className="h-3 w-3 opacity-30" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
  }

  const handleSearch = (val: string) => { setSearch(val); setPage(1) }
  const handleStage = (val: string) => { setStageFilter(val); setPage(1) }
  const handleTipo = (val: string) => { setTipoFilter(val); setPage(1) }
  const handleProgreso = (val: string) => { setProgresoFilter(val); setPage(1) }
  const handleConductor = (val: string) => { setConductorFilter(val); setPage(1) }
  const handleCliente = (val: string) => { setClienteFilter(val); setPage(1) }
  const handleFecha = (val: string) => { setFechaFilter(val); setPage(1) }
  const handleAlmacenDestino = (val: string) => { setAlmacenDestinoFilter(val); setPage(1) }
  const handleAlmacenRetiro = (val: string) => { setAlmacenRetiroFilter(val); setPage(1) }

  const clearFilters = () => {
    setSearch('')
    setStageFilter('all')
    setTipoFilter('all')
    setProgresoFilter('all')
    setConductorFilter('all')
    setClienteFilter('all')
    setFechaFilter('')
    setAlmacenDestinoFilter('all')
    setAlmacenRetiroFilter('all')
    setPage(1)
  }
  const activeFilterCount = [
    stageFilter !== 'all', tipoFilter !== 'all', progresoFilter !== 'all',
    conductorFilter !== 'all', clienteFilter !== 'all', !!fechaFilter,
    almacenDestinoFilter !== 'all', almacenRetiroFilter !== 'all',
  ].filter(Boolean).length
  const hasFilters = !!search || activeFilterCount > 0

  return (
    <>
    {editingTask && (
      <ServiciosEditModal
        task={editingTask as unknown as Record<string, unknown>}
        validFields={validFields}
        stages={stages}
        onClose={() => setEditingTask(null)}
        onSaved={() => { setEditingTask(null); fetchData() }}
      />
    )}
    <AlertDialog open={!!resetTask} onOpenChange={(o) => !o && !resetting && setResetTask(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Reiniciar este servicio?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{resetTask && servicioCodigo(resetTask)}</strong> — {resetTask?.x_studio_conductor ? m2oName(resetTask.x_studio_conductor) : 'sin conductor'}.
            Se borrarán todas las horas que el conductor ya marcó y el servicio vuelve a la primera etapa, para que pueda empezar a marcar de cero.
            Esta acción <strong>no se puede deshacer</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmReset} disabled={resetting} className="bg-amber-600 hover:bg-amber-700">
            {resetting ? <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reiniciando...</span> : 'Sí, reiniciar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={!!exportDialogFormat} onOpenChange={(o) => !o && !exportingFormat && setExportDialogFormat(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Exportar {exportDialogFormat && EXPORT_FORMATS[exportDialogFormat].label}
          </DialogTitle>
          <DialogDescription>
            Elige el rango de fechas de programación a incluir en el Excel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'hoy', label: 'Hoy' },
              { value: 'semana', label: 'Esta semana' },
              { value: 'custom', label: 'Personalizado' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setExportRangeMode(opt.value)}
                className={`px-3 py-2 text-sm rounded-md border transition-all font-medium ${
                  exportRangeMode === opt.value
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background hover:bg-muted border-border text-foreground/80'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {exportRangeMode === 'custom' && (
            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Desde</label>
                <input
                  type="date"
                  value={exportStart}
                  onChange={(e) => setExportStart(e.target.value)}
                  className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Hasta</label>
                <input
                  type="date"
                  value={exportEnd}
                  min={exportStart}
                  onChange={(e) => setExportEnd(e.target.value)}
                  className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                />
              </div>
            </div>
          )}

          {exportRangeMode !== 'custom' && (
            <p className="text-xs text-muted-foreground">
              {(() => {
                const { start, end } = activeExportRange()
                return start === end ? `Fecha: ${formatDate(start)}` : `Del ${formatDate(start)} al ${formatDate(end)}`
              })()}
            </p>
          )}

          <p className="text-xs font-medium text-foreground bg-muted/40 rounded-md px-3 py-2">
            {exportPreviewCount} servicio{exportPreviewCount !== 1 ? 's' : ''} coinciden con este rango
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setExportDialogFormat(null)} disabled={!!exportingFormat}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmExport} disabled={!!exportingFormat || exportPreviewCount === 0} className="gap-1.5">
            {exportingFormat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Truck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">Servicios de Transporte</h2>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Proyecto Odoo · {loading ? '...' : `${sorted.length} de ${tasks.length} registros`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Móvil: botón para mostrar/ocultar los filtros */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className="h-8 gap-1.5 sm:hidden"
          >
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={!!exportingFormat}>
                {exportingFormat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Exportar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Exportar Excel por cliente</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(EXPORT_FORMATS) as ExportClientFormat[]).map((key) => (
                <DropdownMenuItem key={key} onClick={() => openExportDialog(key)} disabled={!!exportingFormat} className="gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Formato {EXPORT_FORMATS[key].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Columns className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Columnas</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
              <DropdownMenuLabel>Mostrar/ocultar columnas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!hiddenColumns.has(c.key)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggleColumn(c.key)}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
              {hiddenColumns.size > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <button
                    onClick={() => setHiddenColumns(new Set())}
                    className="w-full text-left px-2 py-1.5 text-xs text-primary hover:underline"
                  >
                    Mostrar todas
                  </button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="h-8 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
      </div>

      {/* Buscador — siempre visible, es el control más usado */}
      <div className="flex items-center gap-1.5 bg-background border rounded-lg px-3 h-9 shadow-sm">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Buscar código, cliente, conductor, contenedor..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Filtros — en móvil quedan colapsados detrás del botón "Filtros" */}
      <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} sm:flex flex-wrap items-center gap-2 bg-card/40 p-3 rounded-xl border border-border/50 shadow-sm`}>
        <Select value={stageFilter} onValueChange={handleStage}>
          <SelectTrigger className="h-9 text-xs w-full sm:w-[180px]">
            <SelectValue placeholder="Todas las etapas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las etapas</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tipoFilter} onValueChange={handleTipo}>
          <SelectTrigger className="h-9 text-xs w-full sm:w-[190px]">
            <SelectValue placeholder="Tipo de Servicio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tipo de Servicio: Todos</SelectItem>
            {Object.values(TIPOS_SERVICIO).map((t) => (
              <SelectItem key={t.key} value={t.label}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={progresoFilter} onValueChange={handleProgreso}>
          <SelectTrigger className="h-9 text-xs w-full sm:w-[160px]">
            <SelectValue placeholder="Progreso del conductor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Progreso: Todos</SelectItem>
            <SelectItem value="sin_iniciar">🔴 Sin iniciar</SelectItem>
            <SelectItem value="en_proceso">🟡 En proceso</SelectItem>
            <SelectItem value="completado">🟢 Acabada</SelectItem>
          </SelectContent>
        </Select>

        <Select value={conductorFilter} onValueChange={handleConductor}>
          <SelectTrigger className="h-9 text-xs w-full sm:w-40">
            <SelectValue placeholder="Por Conductor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los conductores</SelectItem>
            {conductorOptions.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={clienteFilter} onValueChange={handleCliente}>
          <SelectTrigger className="h-9 text-xs w-full sm:w-40">
            <SelectValue placeholder="Por Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los clientes</SelectItem>
            {clienteOptions.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          type="date"
          value={fechaFilter}
          onChange={(e) => handleFecha(e.target.value)}
          className="h-9 text-xs border rounded-lg px-2 bg-background text-muted-foreground focus:text-foreground outline-none w-full sm:w-auto"
          title="Por Fecha"
        />

        <Select value={almacenRetiroFilter} onValueChange={handleAlmacenRetiro}>
          <SelectTrigger className="h-9 text-xs w-full sm:w-[180px]">
            <SelectValue placeholder="Por Almacén de Retiro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos (Retiro)</SelectItem>
            {almacenRetiroOptions.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={almacenDestinoFilter} onValueChange={handleAlmacenDestino}>
          <SelectTrigger className="h-9 text-xs w-full sm:w-[180px]">
            <SelectValue placeholder="Por Almacén de Destino" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos (Destino)</SelectItem>
            {almacenDestinoOptions.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-muted-foreground hover:text-destructive">
            <XCircle className="h-4 w-4 sm:mr-0 mr-1.5" />
            <span className="sm:hidden">Limpiar filtros</span>
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg p-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Cargando servicios desde Odoo...
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
          {/* Stage legend */}
          {stages.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-1 text-[11px] text-muted-foreground">
              {stages.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${stageDotColor(s.name)}`} />
                  {s.name}
                </span>
              ))}
            </div>
          )}

          <div className="border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-10" />
                    <TableHead className="w-10" />
                    <TableHead className="w-10" />
                    <TableHead
                      className="whitespace-nowrap font-bold text-xs min-w-[100px] cursor-pointer select-none hover:text-primary transition-colors"
                      onClick={() => handleSort('codigo')}
                    >
                      <span className="inline-flex items-center gap-1">Código <SortIcon colKey="codigo" /></span>
                    </TableHead>
                    {visibleColumns.map((c) => (
                      <TableHead
                        key={c.key}
                        className={`whitespace-nowrap font-bold text-xs cursor-pointer select-none hover:text-primary transition-colors ${c.headClass || ''}`}
                        onClick={() => handleSort(c.key)}
                      >
                        <span className="inline-flex items-center gap-1">{c.label} <SortIcon colKey={c.key} /></span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4 + visibleColumns.length} className="text-center py-12 text-muted-foreground text-sm">
                        No se encontraron servicios con los filtros aplicados
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((task) => {
                      const code = servicioCodigo(task)
                      const ctx: ProgresoCtx = { progresoMap, completadosSet }
                      return (
                        <TableRow key={task.id} className="hover:bg-muted/30 text-xs">
                          <TableCell className="p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => setEditingTask(task)}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                          <TableCell className="p-1">
                            <Link href={`/servicios/trailers/${task.id}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                title="Ver detalle"
                              >
                                <Info className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </TableCell>
                          <TableCell className="p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                              onClick={() => setResetTask(task)}
                              title="Reiniciar servicio (borra las horas marcadas por el conductor)"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap" title={task.name}>
                            {code}
                            {task.parent_id && (
                              <div className="flex items-center gap-1 text-[10px] font-normal text-amber-600" title={`Subtarea vinculada a ${code}`}>
                                <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate max-w-[140px]">{task.name}</span>
                              </div>
                            )}
                          </TableCell>
                          {visibleColumns.map((c) => (
                            <TableCell key={c.key} className={`whitespace-nowrap ${c.cellClass || ''}`}>
                              {c.render(task, ctx)}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} de {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPage(1)} disabled={page === 1}>«</Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</Button>
                <span className="px-2 font-medium">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </>
  )
}
