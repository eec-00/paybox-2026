'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pencil, Trash2, Copy, Search } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

export function TrailersTable({ refresh, onEdit, onCopy, headerAction }: { refresh: number, onEdit?: (record: any) => void, onCopy?: (record: any) => void, headerAction?: React.ReactNode }) {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const supabase = createClient()
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [searchTerm, setSearchTerm] = useState('')
    const [isDeleteMode, setIsDeleteMode] = useState(false)

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
            item.referencia?.toLowerCase().includes(term))
    })

    const toggleAll = (checked: boolean) => {
        if (checked) setSelectedIds(new Set(filteredData.map(item => item.id)))
        else setSelectedIds(new Set())
    }

    // derived states for top bar
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
            {/* Top Bar for Actions */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-card p-3 rounded-lg border shadow-sm">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Buscar placa, guía o cliente..."
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
                                    <>
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Confirmar
                                    </>
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
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onCopy(selectedRecord)}
                            className="h-8 shrink-0"
                        >
                            <Copy className="h-4 w-4 mr-2" />
                            Copiar
                        </Button>
                    )}
                    {!isDeleteMode && onEdit && selectedCount === 1 && (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => onEdit(selectedRecord)}
                            className="h-8 shrink-0"
                        >
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
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
                                <th className="px-4 py-3 font-medium">Tiempos Resumen</th>
                                <th className="px-4 py-3 font-medium">Facturación</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.map((row) => {
                                const isSelected = selectedIds.has(row.id)
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
        </div>
    )
}
