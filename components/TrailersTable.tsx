'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Pencil, Trash2, Copy, Search, Satellite, Link2, ExternalLink, CheckCircle, Clock, AlertCircle, MapPin } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

function formatArrivalTime(ts: string | null): string | null {
    if (!ts) return null
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ts // ya es HH:MM
    return d.toLocaleTimeString('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
}

interface GeocercaResult {
    geocerca: any
    arrived: boolean | null
    time: string | null
    saving: boolean
    saved: boolean
}

interface ArrivalDialog {
    open: boolean
    row: any | null
    checking: boolean
    geocercaResults: GeocercaResult[]
    error: string | null
}

export function TrailersTable({ refresh, onEdit, onCopy, headerAction }: { refresh: number, onEdit?: (record: any) => void, onCopy?: (record: any) => void, headerAction?: React.ReactNode }) {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const supabase = createClient()
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [searchTerm, setSearchTerm] = useState('')
    const [isDeleteMode, setIsDeleteMode] = useState(false)
    const [copiedId, setCopiedId] = useState<number | null>(null)
    const [geocercasMap, setGeocercasMap] = useState<Record<string, any[]>>({})

    const [arrivalDialog, setArrivalDialog] = useState<ArrivalDialog>({
        open: false,
        row: null,
        checking: false,
        geocercaResults: [],
        error: null,
    })

    useEffect(() => {
        const fetchTrailers = async () => {
            setLoading(true)

            const { data: trailers, error } = await supabase
                .from('servicios_trailers')
                .select(`
          *,
          cliente:cliente_id(nombre),
          sub_cliente:sub_cliente_id(nombre),
          carreta:carreta_id(placa),
          conductor:conductor_id(nombre),
          agencia:agencia_id(nombre),
          almacen_retiro:almacen_retiro_id(nombre),
          destino:destino_id(nombre),
          almacen_devolucion:almacen_devolucion_id(nombre),
          conductor_devolucion:conductor_devolucion_id(nombre)
        `)
                .order('fecha', { ascending: false })
                .limit(100)

            if (error) {
                if (error.code === '42P01') {
                    setError('Las tablas no han sido creadas. Verifica la consola o corre el SQL en Supabase.')
                } else {
                    setError(`Error al cargar datos: ${error.message}`)
                }
                setLoading(false)
                return
            }

            setData(trailers || [])

            // Cargar geocercas de todos los servicios cargados
            if (trailers && trailers.length > 0) {
                const serviceIds = trailers.map((t) => t.id)
                const { data: geocercas } = await supabase
                    .from('trailer_geocercas')
                    .select('*')
                    .in('servicio_id', serviceIds)
                    .order('orden')

                if (geocercas) {
                    const map: Record<string, any[]> = {}
                    for (const g of geocercas) {
                        if (!map[g.servicio_id]) map[g.servicio_id] = []
                        map[g.servicio_id].push(g)
                    }
                    setGeocercasMap(map)
                }
            }

            setLoading(false)
        }

        fetchTrailers()
    }, [supabase, refresh])

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return
        if (!confirm(`¿Estás seguro de que deseas eliminar ${selectedIds.size} registro(s)? Esta acción no se puede deshacer.`)) return

        setDeletingId('bulk')
        const { error } = await supabase.from('servicios_trailers').delete().in('id', Array.from(selectedIds))

        if (error) {
            alert(`Error al eliminar: ${error.message}`)
        } else {
            setData(prev => prev.filter(item => !selectedIds.has(item.id)))
            setSelectedIds(new Set())
        }
        setDeletingId(null)
    }

    const toggleSelection = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedIds)
        if (checked) newSelected.add(id)
        else newSelected.delete(id)
        setSelectedIds(newSelected)
    }

    const handleTrashClick = () => {
        if (isDeleteMode) {
            setIsDeleteMode(false)
            setSelectedIds(new Set())
        } else {
            setIsDeleteMode(true)
            setSelectedIds(new Set())
        }
    }

    const filteredData = data.filter(item => {
        const term = searchTerm.toLowerCase()
        return (item.guia_remision?.toLowerCase().includes(term) ||
            item.guia_transportista?.toLowerCase().includes(term) ||
            item.placa?.toLowerCase().includes(term) ||
            item.cliente?.nombre?.toLowerCase().includes(term) ||
            item.agencia?.nombre?.toLowerCase().includes(term) ||
            item.referencia?.toLowerCase().includes(term) ||
            item.navitel_tracker_label?.toLowerCase().includes(term))
    })

    const toggleAll = (checked: boolean) => {
        if (checked) setSelectedIds(new Set(filteredData.map(item => item.id)))
        else setSelectedIds(new Set())
    }

    const copyGeolink = async (url: string, id: number) => {
        await navigator.clipboard.writeText(url)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const isGeolinkValid = (row: any) => {
        if (!row.geolink_url || !row.geolink_expires_at) return false
        return new Date(row.geolink_expires_at) > new Date()
    }

    // --- Verificar llegada ---
    const openArrivalDialog = (row: any) => {
        const serviceGeocercas = geocercasMap[row.id] || []
        const results: GeocercaResult[] = serviceGeocercas.map((g) => ({
            geocerca: g,
            arrived: g.arrived_at ? true : null,
            time: formatArrivalTime(g.arrived_at),
            saving: false,
            saved: !!g.arrived_at,
        }))
        setArrivalDialog({ open: true, row, checking: false, geocercaResults: results, error: null })
    }

    const checkAllArrivals = async () => {
        const { row, geocercaResults } = arrivalDialog
        if (!row || geocercaResults.length === 0) return

        setArrivalDialog(prev => ({ ...prev, checking: true, error: null }))

        try {
            const res = await fetch('/api/navitel/check-arrivals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tracker_id: row.navitel_tracker_id,
                    // Usar created_at (timestamp exacto de creación) para no detectar
                    // llegadas que ocurrieron ANTES de que se creara el servicio
                    from_date: row.created_at || row.fecha,
                    geocercas: geocercaResults.map((r) => ({
                        id: r.geocerca.id,
                        zone_id: r.geocerca.zone_id,
                        event_type: r.geocerca.event_type,
                    })),
                }),
            })
            const data = await res.json()
            if (!data.success) throw new Error(data.error || 'Error al verificar')

            setArrivalDialog(prev => ({
                ...prev,
                checking: false,
                geocercaResults: prev.geocercaResults.map((r) => {
                    const result = data.results?.find((x: any) => x.id === r.geocerca.id)
                    if (!result || r.saved) return r
                    return { ...r, arrived: result.arrived, time: result.time }
                }),
            }))
        } catch (err) {
            setArrivalDialog(prev => ({
                ...prev,
                checking: false,
                error: err instanceof Error ? err.message : 'Error al consultar Navitel',
            }))
        }
    }

    const saveGeocercaTime = async (geocercaId: string, time: string) => {
        setArrivalDialog(prev => ({
            ...prev,
            geocercaResults: prev.geocercaResults.map((r) =>
                r.geocerca.id === geocercaId ? { ...r, saving: true } : r,
            ),
        }))

        const { error } = await supabase
            .from('trailer_geocercas')
            .update({ arrived_at: time })
            .eq('id', geocercaId)

        if (error) {
            setArrivalDialog(prev => ({
                ...prev,
                geocercaResults: prev.geocercaResults.map((r) =>
                    r.geocerca.id === geocercaId ? { ...r, saving: false } : r,
                ),
                error: `Error al guardar: ${error.message}`,
            }))
        } else {
            setArrivalDialog(prev => ({
                ...prev,
                geocercaResults: prev.geocercaResults.map((r) =>
                    r.geocerca.id === geocercaId
                        ? { ...r, saving: false, saved: true }
                        : r,
                ),
            }))
            // Actualizar geocercasMap localmente
            setGeocercasMap(prev => {
                const { row } = arrivalDialog
                if (!row) return prev
                return {
                    ...prev,
                    [row.id]: (prev[row.id] || []).map((g) =>
                        g.id === geocercaId ? { ...g, arrived_at: time } : g,
                    ),
                }
            })
        }
    }

    const selectedCount = selectedIds.size
    const selectedRecord = data.find(item => selectedIds.has(item.id))

    if (loading) {
        return <div className="text-center py-8">Cargando registros...</div>
    }

    if (error) {
        return <div className="text-center text-destructive py-8">{error}</div>
    }

    if (data.length === 0) {
        return (
            <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
                <p className="text-muted-foreground">No hay registros de trailers aún.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-card p-3 rounded-lg border shadow-sm">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Buscar placa, guía, rastreador..."
                            className="pl-8 h-9"
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
                    {isDeleteMode ? (
                        <>
                            <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline-block mr-2">
                                {selectedCount} sel.
                            </span>
                            <Button
                                variant={selectedCount > 0 ? "destructive" : "secondary"}
                                size="sm"
                                disabled={deletingId !== null}
                                onClick={selectedCount > 0 ? handleDeleteSelected : handleTrashClick}
                                className="h-8 whitespace-nowrap"
                            >
                                {selectedCount > 0 ? (
                                    <><Trash2 className="h-4 w-4 mr-2" />Confirmar</>
                                ) : "Cancelar"}
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleTrashClick}
                            className="h-8 shrink-0 text-destructive border-transparent hover:bg-destructive/10"
                            title="Eliminar registros"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}

                    {!isDeleteMode && onCopy && selectedCount === 1 && (
                        <Button variant="secondary" size="sm" onClick={() => onCopy(selectedRecord)} className="h-8 shrink-0">
                            <Copy className="h-4 w-4 mr-2" />Copiar
                        </Button>
                    )}
                    {!isDeleteMode && onEdit && selectedCount === 1 && (
                        <Button variant="default" size="sm" onClick={() => onEdit(selectedRecord)} className="h-8 shrink-0">
                            <Pencil className="h-4 w-4 mr-2" />Editar
                        </Button>
                    )}
                    {!isDeleteMode && headerAction}
                </div>
            </div>

            <div className="bg-card border rounded-lg shadow-sm w-full overflow-hidden">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                            <tr>
                                {isDeleteMode && (
                                    <th className="px-4 py-3 font-medium w-10">
                                        <Checkbox
                                            checked={filteredData.length > 0 && selectedCount === filteredData.length}
                                            onCheckedChange={(checked: boolean | string) => toggleAll(!!checked)}
                                        />
                                    </th>
                                )}
                                <th className="px-4 py-3 font-medium">Fecha / Status</th>
                                <th className="px-4 py-3 font-medium">Guías</th>
                                <th className="px-4 py-3 font-medium">Placa / Carreta</th>
                                <th className="px-4 py-3 font-medium">Conductor</th>
                                <th className="px-4 py-3 font-medium">Cliente</th>
                                <th className="px-4 py-3 font-medium">Servicio / Carga</th>
                                <th className="px-4 py-3 font-medium">Booking / CNTR</th>
                                <th className="px-4 py-3 font-medium">Locaciones (Agencia/Retiro/Destino)</th>
                                <th className="px-4 py-3 font-medium">GPS / Rastreador</th>
                                <th className="px-4 py-3 font-medium">Tiempos Resumen</th>
                                <th className="px-4 py-3 font-medium">Facturación</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.map((row) => {
                                const isSelected = selectedIds.has(row.id)
                                const geolinkActive = isGeolinkValid(row)
                                const hasTracker = !!row.navitel_tracker_id
                                const canCheckArrival = hasTracker

                                return (
                                    <tr
                                        key={row.id}
                                        className={`border-b transition-colors cursor-pointer ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/30'}`}
                                        onClick={() => {
                                            if (isDeleteMode) {
                                                toggleSelection(row.id, !isSelected)
                                            } else {
                                                setSelectedIds(new Set([row.id]))
                                            }
                                        }}
                                    >
                                        {isDeleteMode && (
                                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={(checked: boolean | string) => toggleSelection(row.id, !!checked)}
                                                />
                                            </td>
                                        )}
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{row.fecha}</div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${row.status_servicio === 'FINALIZADO' ? 'bg-green-100 text-green-800' :
                                                row.status_servicio === 'EN PROCESO' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {row.status_servicio}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <div><span className="text-muted-foreground">R:</span> {row.guia_remision || '-'}</div>
                                            <div><span className="text-muted-foreground">T:</span> {row.guia_transportista || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{row.placa || '-'}</div>
                                            <div className="text-xs text-muted-foreground">{row.carreta?.placa || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {row.conductor?.nombre || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <div className="font-medium truncate max-w-[150px]" title={row.cliente?.nombre}>{row.cliente?.nombre || '-'}</div>
                                            <div className="text-muted-foreground truncate max-w-[150px]" title={row.sub_cliente?.nombre}>{row.sub_cliente?.nombre || ''}</div>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <div>{row.tipo_servicio || '-'}</div>
                                            <div className="text-muted-foreground">{row.tipo_carga || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <div>{row.referencia || '-'}</div>
                                            <div className="text-muted-foreground">CNTR: {row.contenedor || '-'} / {row.tamano_cntr || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <div className="truncate max-w-[180px]" title={`Agencia: ${row.agencia?.nombre}`}>A: {row.agencia?.nombre || '-'}</div>
                                            <div className="truncate max-w-[180px]" title={`Retiro: ${row.almacen_retiro?.nombre}`}>R: {row.almacen_retiro?.nombre || '-'}</div>
                                            <div className="truncate max-w-[180px]" title={`Destino: ${row.destino?.nombre}`}>D: {row.destino?.nombre || '-'}</div>
                                        </td>

                                        {/* Columna GPS */}
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            {hasTracker ? (
                                                <div className="flex flex-col gap-1.5 min-w-[150px]">
                                                    {/* Tracker badge */}
                                                    <div className="flex items-center gap-1 text-xs">
                                                        <Satellite className="h-3 w-3 text-primary shrink-0" />
                                                        <span className="font-medium truncate max-w-[110px]" title={row.navitel_tracker_label}>
                                                            {row.navitel_tracker_label || `ID: ${row.navitel_tracker_id}`}
                                                        </span>
                                                    </div>

                                                    {/* Geolink */}
                                                    {geolinkActive ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                                                <Link2 className="h-2.5 w-2.5" /> Activo
                                                            </span>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Copiar geoenlace" onClick={() => copyGeolink(row.geolink_url, row.id)}>
                                                                {copiedId === row.id ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Abrir geoenlace" onClick={() => window.open(row.geolink_url, '_blank')}>
                                                                <ExternalLink className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ) : row.geolink_url ? (
                                                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Geolink expirado</span>
                                                    ) : null}

                                                    {/* Geocercas con estado de llegada */}
                                                    {(() => {
                                                        const serviceGeocercas = geocercasMap[row.id] || []
                                                        if (serviceGeocercas.length > 0) {
                                                            return (
                                                                <div className="space-y-0.5 mt-0.5">
                                                                    {serviceGeocercas.map((g) => (
                                                                        <div key={g.id} className="flex items-center gap-1 text-[10px]">
                                                                            <MapPin className={`h-2.5 w-2.5 shrink-0 ${g.arrived_at ? 'text-green-600' : 'text-muted-foreground'}`} />
                                                                            <span className="truncate max-w-[95px]" title={g.zone_name}>{g.zone_name}</span>
                                                                            <span className="text-muted-foreground shrink-0">{g.event_type === 'zone_out' ? '↗' : '↘'}</span>
                                                                            {g.arrived_at && (
                                                                                <span className="font-semibold text-green-700 shrink-0">{formatArrivalTime(g.arrived_at)}</span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )
                                                        } else if (row.navitel_zone_name) {
                                                            return (
                                                                <span className="text-[10px] text-muted-foreground truncate max-w-[130px]" title={row.navitel_zone_name}>
                                                                    ⬡ {row.navitel_zone_name}
                                                                </span>
                                                            )
                                                        }
                                                        return null
                                                    })()}

                                                    {/* Verificar llegada */}
                                                    {canCheckArrival && row.status_servicio !== 'FINALIZADO' && (geocercasMap[row.id]?.length ?? 0) > 0 && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-6 text-[10px] px-2 py-0 border-primary/30 text-primary hover:bg-primary/5 mt-0.5"
                                                            onClick={() => openArrivalDialog(row)}
                                                        >
                                                            <Clock className="h-3 w-3 mr-1" />
                                                            Verificar llegada
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Sin GPS</span>
                                            )}
                                        </td>

                                        <td className="px-4 py-3 text-xs">
                                            <div>Cita: {row.hora_cita || '-'}</div>
                                            <div className="text-muted-foreground">Dev: {row.hora_devolucion || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <div>F: {row.factura || '-'}</div>
                                            <div className="text-muted-foreground">{row.estado_factura || '-'}</div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Dialog: Verificar llegada (múltiples geocercas) */}
            <Dialog open={arrivalDialog.open} onOpenChange={(open) => !open && setArrivalDialog(prev => ({ ...prev, open: false }))}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Satellite className="h-5 w-5 text-primary" />
                            Verificar llegada GPS
                        </DialogTitle>
                        <DialogDescription>
                            {arrivalDialog.row && (
                                <>Rastreador: <strong>{arrivalDialog.row.navitel_tracker_label || `ID ${arrivalDialog.row.navitel_tracker_id}`}</strong></>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        {/* Error */}
                        {arrivalDialog.error && (
                            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium">Error al consultar</p>
                                    <p className="text-xs mt-0.5">{arrivalDialog.error}</p>
                                </div>
                            </div>
                        )}

                        {/* Lista de geocercas */}
                        {arrivalDialog.geocercaResults.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                Este servicio no tiene geocercas asignadas.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {arrivalDialog.geocercaResults.map((r, i) => (
                                    <div key={r.geocerca.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                                        {/* Número */}
                                        <span className="text-xs font-medium text-muted-foreground w-4 shrink-0">#{i + 1}</span>

                                        {/* Zona + tipo */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{r.geocerca.zone_name}</p>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.geocerca.event_type === 'zone_out' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {r.geocerca.event_type === 'zone_out' ? '↗ Salida' : '↘ Entrada'}
                                            </span>
                                        </div>

                                        {/* Estado */}
                                        <div className="shrink-0 text-right">
                                            {r.saved ? (
                                                <div className="flex items-center gap-1 text-green-700">
                                                    <CheckCircle className="h-4 w-4" />
                                                    <span className="text-sm font-bold">{r.time}</span>
                                                </div>
                                            ) : r.arrived === null && !arrivalDialog.checking ? (
                                                <span className="text-xs text-muted-foreground">Sin verificar</span>
                                            ) : arrivalDialog.checking ? (
                                                <span className="text-xs text-muted-foreground animate-pulse">Consultando...</span>
                                            ) : r.arrived === false ? (
                                                <span className="text-xs text-muted-foreground">Sin registro</span>
                                            ) : r.time ? (
                                                <Button
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    disabled={r.saving}
                                                    onClick={() => saveGeocercaTime(r.geocerca.id, r.time!)}
                                                >
                                                    {r.saving ? 'Guardando...' : `Guardar ${r.time}`}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setArrivalDialog(prev => ({ ...prev, open: false }))}>
                            Cerrar
                        </Button>
                        {arrivalDialog.geocercaResults.length > 0 && (
                            <Button
                                onClick={checkAllArrivals}
                                disabled={arrivalDialog.checking}
                            >
                                {arrivalDialog.checking ? (
                                    <><Clock className="h-4 w-4 mr-2 animate-pulse" />Consultando Navitel...</>
                                ) : (
                                    <><Satellite className="h-4 w-4 mr-2" />Verificar todas</>
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
