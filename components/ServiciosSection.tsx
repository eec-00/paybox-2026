'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw, Search, XCircle, Truck, CheckSquare, Square, Pencil, MapPin } from 'lucide-react'
import { ServiciosEditModal } from '@/components/ServiciosEditModal'
import { createClient } from '@/lib/supabase/client'

type LocationMap = Record<number, Record<number, { lat: number; lng: number }>>

interface OdooTask {
  id: number
  name: string
  stage_id: [number, string] | false
  partner_id: [number, string] | false
  date_deadline: string | false
  // OPERATIVA TRANSPORTE
  x_studio_fecha_de_la_programacin: string | false
  x_studio_hora_de_cita: number | false
  x_studio_placa_camin: string | false
  x_studio_placa_carreta: string | false
  x_studio_conductor: [number, string] | false
  x_studio_referencia_booking: string | false
  x_studio_agencia: string | false
  x_studio_nmero_de_contenedor: string | false
  x_studio_almacn_de_retiro: [number, string] | false
  x_studio_almacn_de_destino: [number, string] | false
  x_studio_es_importacin: boolean
  // TIEMPOS OPERATIVOS
  x_studio_ingreso_a_almacen_de_retiro: number | false
  x_studio_salida_de_almacen_de_retiro: number | false
  x_studio_llegada_a_cliente: number | false
  x_studio_ingreso_a_planta: number | false
  x_studio_inicio_carga_descarga: number | false
  x_studio_termino_de_carga_descarga: number | false
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

const STAGE_COLORS: Record<string, string> = {
  'nueva solicitud': 'bg-blue-100 text-blue-800',
  'pre-operativo': 'bg-amber-100 text-amber-800',
  'en ruta': 'bg-orange-100 text-orange-800',
  'en cliente': 'bg-green-100 text-green-800',
  facturación: 'bg-indigo-100 text-indigo-800',
  facturacion: 'bg-indigo-100 text-indigo-800',
  cerrado: 'bg-gray-200 text-gray-600',
}

function stageColor(name: string): string {
  const key = name.toLowerCase().trim()
  for (const [k, v] of Object.entries(STAGE_COLORS)) {
    if (key.includes(k)) return v
  }
  if (key.includes('pendiente') || key.includes('cierre') || key.includes('devolu')) {
    return 'bg-purple-100 text-purple-800'
  }
  return 'bg-gray-100 text-gray-700'
}

const PAGE_SIZE = 50

export function ServiciosSection() {
  const [tasks, setTasks] = useState<OdooTask[]>([])
  const [stages, setStages] = useState<OdooStage[]>([])
  const [validFields, setValidFields] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [importFilter, setImportFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [page, setPage] = useState(1)
  const [editingTask, setEditingTask] = useState<OdooTask | null>(null)
  const [locations, setLocations] = useState<LocationMap>({})

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/servicios')
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Error al cargar servicios')
      }
      const data = await res.json()
      const loadedTasks: OdooTask[] = data.tasks ?? []
      setTasks(loadedTasks)
      setStages(data.stages ?? [])
      setValidFields(data.validFields ?? [])

      // Fetch locations for all tasks
      if (loadedTasks.length > 0) {
        const supabase = createClient()
        const ids = loadedTasks.map(t => t.id)
        const { data: locs } = await supabase
          .from('service_locations')
          .select('task_id, step_index, lat, lng')
          .in('task_id', ids)
        if (locs) {
          const map: LocationMap = {}
          for (const l of locs) {
            if (!map[l.task_id]) map[l.task_id] = {}
            map[l.task_id][l.step_index] = { lat: l.lat, lng: l.lng }
          }
          setLocations(map)
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return tasks.filter((t) => {
      if (stageFilter !== 'all') {
        const stageName = t.stage_id ? t.stage_id[1] : ''
        if (stageName !== stageFilter) return false
      }
      if (importFilter === 'yes' && !t.x_studio_es_importacin) return false
      if (importFilter === 'no' && t.x_studio_es_importacin) return false
      if (!q) return true
      const searchable = [
        t.name,
        m2oName(t.partner_id),
        m2oName(t.x_studio_conductor),
        t.x_studio_nmero_de_contenedor || '',
        t.x_studio_referencia_booking || '',
        t.x_studio_placa_camin || '',
        t.x_studio_agencia || '',
      ].join(' ').toLowerCase()
      return searchable.includes(q)
    })
  }, [tasks, search, stageFilter, importFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSearch = (val: string) => { setSearch(val); setPage(1) }
  const handleStage = (val: string) => { setStageFilter(val); setPage(1) }
  const handleImport = (val: string) => { setImportFilter(val as 'all' | 'yes' | 'no'); setPage(1) }

  const clearFilters = () => { setSearch(''); setStageFilter('all'); setImportFilter('all'); setPage(1) }
  const hasFilters = search || stageFilter !== 'all' || importFilter !== 'all'

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
              Proyecto Odoo · {loading ? '...' : `${filtered.length} de ${tasks.length} registros`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          className="h-8 gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-card/40 p-3 rounded-xl border border-border/50 shadow-sm">
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px] bg-background border rounded-lg px-3 h-9">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar código, cliente, conductor, contenedor..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>

        <Select value={stageFilter} onValueChange={handleStage}>
          <SelectTrigger className="h-9 text-xs w-[180px]">
            <SelectValue placeholder="Todas las etapas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las etapas</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={importFilter} onValueChange={handleImport}>
          <SelectTrigger className="h-9 text-xs w-[140px]">
            <SelectValue placeholder="Importación" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Importación: Todos</SelectItem>
            <SelectItem value="yes">Solo Importación</SelectItem>
            <SelectItem value="no">No Importación</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-muted-foreground hover:text-destructive">
            <XCircle className="h-4 w-4" />
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
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-10" />
                  <TableHead className="whitespace-nowrap font-bold text-xs min-w-[200px]">Código / Nombre</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[160px]">Etapa</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[180px]">Cliente</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[110px]">F. Programación</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[90px]">Hora Cita</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[110px]">Placa Camión</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[110px]">Placa Carreta</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[180px]">Conductor</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[130px]">Ref/Booking</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[120px]">Agencia</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[140px]">N° Contenedor</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[200px]">Almacén Retiro</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[200px]">Almacén Destino</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[80px] text-center">Import.</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[90px] text-center">Ing. Almacén</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[90px] text-center">Sal. Almacén</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[90px] text-center">Llegada Cliente</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[90px] text-center">Ing. Planta</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[90px] text-center">Ini. C/D</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[90px] text-center">Tér. C/D</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={21} className="text-center py-12 text-muted-foreground text-sm">
                        No se encontraron servicios con los filtros aplicados
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((task) => {
                      const stageName = task.stage_id ? task.stage_id[1] : ''
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
                          <TableCell className="font-medium max-w-[280px]">
                            <span className="line-clamp-2 leading-snug" title={task.name}>
                              {task.name}
                            </span>
                          </TableCell>
                          <TableCell>
                            {stageName ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${stageColor(stageName)}`}>
                                {stageName}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{m2oName(task.partner_id)}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(task.x_studio_fecha_de_la_programacin)}</TableCell>
                          <TableCell className="text-center whitespace-nowrap">{formatOdooTime(task.x_studio_hora_de_cita)}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono">{task.x_studio_placa_camin || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono">{task.x_studio_placa_carreta || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">{m2oName(task.x_studio_conductor)}</TableCell>
                          <TableCell className="whitespace-nowrap">{task.x_studio_referencia_booking || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">{task.x_studio_agencia || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono">{task.x_studio_nmero_de_contenedor || '—'}</TableCell>
                          <TableCell className="max-w-[220px]">
                            <span className="line-clamp-2 leading-snug text-[11px]" title={m2oName(task.x_studio_almacn_de_retiro)}>
                              {m2oName(task.x_studio_almacn_de_retiro)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <span className="line-clamp-2 leading-snug text-[11px]" title={m2oName(task.x_studio_almacn_de_destino)}>
                              {m2oName(task.x_studio_almacn_de_destino)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {task.x_studio_es_importacin
                              ? <CheckSquare className="h-4 w-4 text-green-600 mx-auto" />
                              : <Square className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            }
                          </TableCell>
                          <TimeCell time={task.x_studio_ingreso_a_almacen_de_retiro} loc={locations[task.id]?.[0]} />
                          <TimeCell time={task.x_studio_salida_de_almacen_de_retiro}        loc={locations[task.id]?.[1]} />
                          <TimeCell time={task.x_studio_llegada_a_cliente}                  loc={locations[task.id]?.[2]} />
                          <TimeCell time={task.x_studio_ingreso_a_planta}                   loc={locations[task.id]?.[3]} />
                          <TimeCell time={task.x_studio_inicio_carga_descarga}              loc={locations[task.id]?.[4]} />
                          <TimeCell time={task.x_studio_termino_de_carga_descarga}          loc={locations[task.id]?.[5]} />
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
                Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
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

function TimeCell({ time, loc }: { time: number | false; loc?: { lat: number; lng: number } }) {
  const formatted = formatOdooTime(time)
  return (
    <TableCell className="text-center whitespace-nowrap">
      <span className="font-mono">{formatted}</span>
      {loc && (
        <a
          href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center ml-1 text-blue-500 hover:text-blue-700"
          title={`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}
        >
          <MapPin className="h-3 w-3" />
        </a>
      )}
    </TableCell>
  )
}
