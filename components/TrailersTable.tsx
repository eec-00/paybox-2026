'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Pencil, Trash2, Copy, Search, Satellite, Link2, ExternalLink, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

// Campos de tiempo disponibles para registrar llegada
const TIME_FIELDS: { value: string; label: string }[] = [
    { value: 'llegada_almacen_retiro', label: 'Llegada Almacén Retiro' },
    { value: 'salida_almacen_retiro', label: 'Salida Almacén Retiro' },
    { value: 'llegada_cliente', label: 'Llegada Cliente' },
    { value: 'ingreso_planta', label: 'Ingreso a Planta' },
    { value: 'inicio_carga', label: 'Inicio Carga/Descarga' },
    { value: 'termino_descarga', label: 'Término de Descarga' },
    { value: 'hora_devolucion', label: 'Hora Devolución' },
]

interface ArrivalDialog {
    open: boolean
    row: any | null
    checking: boolean
    arrived: boolean | null
    detectedTime: string | null
    error: string | null
    selectedField: string
    saving: boolean
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

    const [arrivalDialog, setArrivalDialog] = useState<ArrivalDialog>({
        open: false,
        row: null,
        checking: false,
        arrived: null,
        detectedTime: null,
        error: null,
        selectedField: 'llegada_cliente',
        saving: false,
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
            } else {
                setData(trailers || [])
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
        setArrivalDialog({
            open: true,
            row,
            checking: false,
            arrived: null,
            detectedTime: null,
            error: null,
            selectedField: 'llegada_cliente',
            saving: false,
        })
    }

    const checkArrival = async () => {
        const { row } = arrivalDialog
        if (!row) return

        setArrivalDialog(prev => ({ ...prev, checking: true, error: null, arrived: null, detectedTime: null }))

        try {
            const res = await fetch('/api/navitel/check-arrival', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tracker_id: row.navitel_tracker_id,
                    zone_id: row.navitel_zone_id || undefined,
                    from_date: row.fecha,
                }),
            })
            const data = await res.json()

            if (!data.success) throw new Error(data.error || 'Error al verificar')

            setArrivalDialog(prev => ({
                ...prev,
                checking: false,
                arrived: data.arrived,
                detectedTime: data.time,
            }))
        } catch (err) {
            setArrivalDialog(prev => ({
                ...prev,
                checking: false,
                error: err instanceof Error ? err.message : 'Error al consultar Navitel',
            }))
        }
    }

    const saveArrivalTime = async () => {
        const { row, detectedTime, selectedField } = arrivalDialog
        if (!row || !detectedTime || !selectedField) return

        setArrivalDialog(prev => ({ ...prev, saving: true }))

        const { error } = await supabase
            .from('servicios_trailers')
            .update({ [selectedField]: detectedTime })
            .eq('id', row.id)

        if (error) {
            setArrivalDialog(prev => ({ ...prev, saving: false, error: `Error al guardar: ${error.message}` }))
        } else {
            // Actualizar dato localmente
            setData(prev => prev.map(item =>
                item.id === row.id ? { ...item, [selectedField]: detectedTime } : item
            ))
            setArrivalDialog(prev => ({ ...prev, open: false, saving: false }))
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
                                                <div className="flex flex-col gap-1.5 min-w-[140px]">
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
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6"
                                                                title="Copiar geoenlace"
                                                                onClick={() => copyGeolink(row.geolink_url, row.id)}
                                                            >
                                                                {copiedId === row.id
                                                                    ? <CheckCircle className="h-3 w-3 text-green-600" />
                                                                    : <Copy className="h-3 w-3" />}
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6"
                                                                title="Abrir geoenlace"
                                                                onClick={() => window.open(row.geolink_url, '_blank')}
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ) : row.geolink_url ? (
                                                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                            Geolink expirado
                                                        </span>
                                                    ) : null}

                                                    {/* Verificar llegada */}
                                                    {canCheckArrival && row.status_servicio !== 'FINALIZADO' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-6 text-[10px] px-2 py-0 border-primary/30 text-primary hover:bg-primary/5"
                                                            onClick={() => openArrivalDialog(row)}
                                                        >
                                                            <Clock className="h-3 w-3 mr-1" />
                                                            Verificar llegada
                                                        </Button>
                                                    )}

                                                    {/* Geocerca asignada */}
                                                    {row.navitel_zone_name && (
                                                        <span className="text-[10px] text-muted-foreground truncate max-w-[130px]" title={row.navitel_zone_name}>
                                                            ⬡ {row.navitel_zone_name}
                                                        </span>
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

            {/* Dialog: Verificar llegada */}
            <Dialog open={arrivalDialog.open} onOpenChange={(open) => !open && setArrivalDialog(prev => ({ ...prev, open: false }))}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Satellite className="h-5 w-5 text-primary" />
                            Verificar llegada GPS
                        </DialogTitle>
                        <DialogDescription>
                            {arrivalDialog.row && (
                                <>
                                    Rastreador: <strong>{arrivalDialog.row.navitel_tracker_label || `ID ${arrivalDialog.row.navitel_tracker_id}`}</strong>
                                    {arrivalDialog.row.navitel_zone_name && (
                                        <> · Zona: <strong>{arrivalDialog.row.navitel_zone_name}</strong></>
                                    )}
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Botón verificar */}
                        {arrivalDialog.arrived === null && !arrivalDialog.error && (
                            <Button
                                onClick={checkArrival}
                                disabled={arrivalDialog.checking}
                                className="w-full"
                            >
                                {arrivalDialog.checking ? (
                                    <><Clock className="h-4 w-4 mr-2 animate-pulse" />Consultando Navitel...</>
                                ) : (
                                    <><Satellite className="h-4 w-4 mr-2" />Consultar llegada</>
                                )}
                            </Button>
                        )}

                        {/* Error */}
                        {arrivalDialog.error && (
                            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium">Error al consultar</p>
                                    <p className="text-xs mt-0.5">{arrivalDialog.error}</p>
                                    <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={checkArrival}>
                                        Reintentar
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Resultado: no llegó */}
                        {arrivalDialog.arrived === false && (
                            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                                <Clock className="h-4 w-4 shrink-0" />
                                <div>
                                    <p className="font-medium text-foreground">Sin registro de llegada</p>
                                    <p className="text-xs mt-0.5">
                                        No se encontraron eventos de entrada a zona para este rastreador en la fecha del servicio.
                                        {!arrivalDialog.row?.navitel_zone_id && ' (Sin geocerca asignada: se buscaron todos los eventos de zona)'}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Resultado: llegó */}
                        {arrivalDialog.arrived === true && arrivalDialog.detectedTime && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 p-3 bg-green-50 text-green-800 rounded-lg">
                                    <CheckCircle className="h-5 w-5 shrink-0" />
                                    <div>
                                        <p className="font-semibold">¡Llegada detectada!</p>
                                        <p className="text-2xl font-bold mt-0.5">{arrivalDialog.detectedTime}</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Guardar en el campo:</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={arrivalDialog.selectedField}
                                        onChange={(e) => setArrivalDialog(prev => ({ ...prev, selectedField: e.target.value }))}
                                    >
                                        {TIME_FIELDS.map(f => (
                                            <option key={f.value} value={f.value}>{f.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setArrivalDialog(prev => ({ ...prev, open: false }))}
                            disabled={arrivalDialog.saving}
                        >
                            Cerrar
                        </Button>
                        {arrivalDialog.arrived && arrivalDialog.detectedTime && (
                            <Button
                                onClick={saveArrivalTime}
                                disabled={arrivalDialog.saving}
                            >
                                {arrivalDialog.saving ? 'Guardando...' : `Guardar ${arrivalDialog.detectedTime}`}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
