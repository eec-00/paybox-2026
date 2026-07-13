'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw, Search, XCircle, Truck, Pencil, Info } from 'lucide-react'
import { ServiciosEditModal } from '@/components/ServiciosEditModal'
import { tipoServicioLabelFor, TIPOS_SERVICIO } from '@/lib/servicios/hitos'

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
  [key: string]: unknown
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

export function ServiciosSection() {
  const [tasks, setTasks] = useState<OdooTask[]>([])
  const [stages, setStages] = useState<OdooStage[]>([])
  const [validFields, setValidFields] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [tipoFilter, setTipoFilter] = useState('all')
  const [conductorFilter, setConductorFilter] = useState('all')
  const [clienteFilter, setClienteFilter] = useState('all')
  const [fechaFilter, setFechaFilter] = useState('')
  const [almacenDestinoFilter, setAlmacenDestinoFilter] = useState('all')
  const [almacenRetiroFilter, setAlmacenRetiroFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [editingTask, setEditingTask] = useState<OdooTask | null>(null)

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

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
      if (conductorFilter !== 'all' && m2oName(t.x_studio_conductor) !== conductorFilter) return false
      if (clienteFilter !== 'all' && m2oName(t.partner_id) !== clienteFilter) return false
      if (almacenDestinoFilter !== 'all' && m2oName(t.x_studio_almacen_de_destino) !== almacenDestinoFilter) return false
      if (almacenRetiroFilter !== 'all' && m2oName(t.x_studio_almacen_de_retiro) !== almacenRetiroFilter) return false
      if (fechaFilter && t.x_studio_fecha_de_la_programacin !== fechaFilter) return false
      if (!q) return true
      const searchable = [
        t.name,
        m2oName(t.partner_id),
        m2oName(t.x_studio_conductor),
        t.x_studio_nmero_de_contenedor || '',
        t.x_studio_referenciabooking || '',
        Array.isArray(t.x_studio_placa) ? t.x_studio_placa[1] : '',
        t.x_studio_agencia || '',
      ].join(' ').toLowerCase()
      return searchable.includes(q)
    })
  }, [tasks, search, stageFilter, tipoFilter, conductorFilter, clienteFilter, almacenDestinoFilter, almacenRetiroFilter, fechaFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSearch = (val: string) => { setSearch(val); setPage(1) }
  const handleStage = (val: string) => { setStageFilter(val); setPage(1) }
  const handleTipo = (val: string) => { setTipoFilter(val); setPage(1) }
  const handleConductor = (val: string) => { setConductorFilter(val); setPage(1) }
  const handleCliente = (val: string) => { setClienteFilter(val); setPage(1) }
  const handleFecha = (val: string) => { setFechaFilter(val); setPage(1) }
  const handleAlmacenDestino = (val: string) => { setAlmacenDestinoFilter(val); setPage(1) }
  const handleAlmacenRetiro = (val: string) => { setAlmacenRetiroFilter(val); setPage(1) }

  const clearFilters = () => {
    setSearch('')
    setStageFilter('all')
    setTipoFilter('all')
    setConductorFilter('all')
    setClienteFilter('all')
    setFechaFilter('')
    setAlmacenDestinoFilter('all')
    setAlmacenRetiroFilter('all')
    setPage(1)
  }
  const hasFilters = search || stageFilter !== 'all' || tipoFilter !== 'all' ||
    conductorFilter !== 'all' || clienteFilter !== 'all' || fechaFilter ||
    almacenDestinoFilter !== 'all' || almacenRetiroFilter !== 'all'

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

        <Select value={tipoFilter} onValueChange={handleTipo}>
          <SelectTrigger className="h-9 text-xs w-[190px]">
            <SelectValue placeholder="Tipo de Servicio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tipo de Servicio: Todos</SelectItem>
            {Object.values(TIPOS_SERVICIO).map((t) => (
              <SelectItem key={t.key} value={t.label}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={conductorFilter} onValueChange={handleConductor}>
          <SelectTrigger className="h-9 text-xs w-40">
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
          <SelectTrigger className="h-9 text-xs w-40">
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
          className="h-9 text-xs border rounded-lg px-2 bg-background text-muted-foreground focus:text-foreground outline-none"
          title="Por Fecha"
        />

        <Select value={almacenRetiroFilter} onValueChange={handleAlmacenRetiro}>
          <SelectTrigger className="h-9 text-xs w-[180px]">
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
          <SelectTrigger className="h-9 text-xs w-[180px]">
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
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[100px]">Código</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs w-10 text-center">Etapa</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[150px]">Tipo de Servicio</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[180px]">Cliente</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[110px]">F. Programación</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[90px]">Hora Cita</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[80px]">Placa Camión</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[80px]">Placa Carreta</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[180px]">Conductor</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[130px]">Ref/Booking</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[120px]">Agencia</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[140px]">N° Contenedor</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[200px]">Almacén Retiro</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs min-w-[200px]">Almacén Destino</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={16} className="text-center py-12 text-muted-foreground text-sm">
                        No se encontraron servicios con los filtros aplicados
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((task) => {
                      const stageName = task.stage_id ? task.stage_id[1] : ''
                      const code = task.name.includes(' - ') ? task.name.split(' - ')[0] : task.name
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
                          <TableCell className="font-medium whitespace-nowrap" title={task.name}>
                            {code}
                          </TableCell>
                          <TableCell className="text-center">
                            {stageName ? (
                              <span
                                className={`inline-block w-3 h-3 rounded-full ${stageDotColor(stageName)}`}
                                title={stageName}
                              />
                            ) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{tipoServicioLabelFor(task)}</TableCell>
                          <TableCell className="whitespace-nowrap">{m2oName(task.partner_id)}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(task.x_studio_fecha_de_la_programacin)}</TableCell>
                          <TableCell className="text-center whitespace-nowrap">{formatOdooTime(task.x_studio_hora_de_cita)}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono">{extractPlacaLast6(task.x_studio_placa)}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono">{extractPlacaLast6(task.x_studio_placa_carreta)}</TableCell>
                          <TableCell className="whitespace-nowrap">{m2oName(task.x_studio_conductor)}</TableCell>
                          <TableCell className="whitespace-nowrap">{task.x_studio_referenciabooking || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">{task.x_studio_agencia || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono">{task.x_studio_nmero_de_contenedor || '—'}</TableCell>
                          <TableCell className="max-w-[220px]">
                            <span className="line-clamp-2 leading-snug text-[11px]" title={m2oName(task.x_studio_almacen_de_retiro)}>
                              {m2oName(task.x_studio_almacen_de_retiro)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <span className="line-clamp-2 leading-snug text-[11px]" title={m2oName(task.x_studio_almacen_de_destino)}>
                              {m2oName(task.x_studio_almacen_de_destino)}
                            </span>
                          </TableCell>
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
