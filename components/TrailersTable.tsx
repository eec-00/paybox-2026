'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2 } from 'lucide-react'

export function TrailersTable({ refresh, onEdit }: { refresh: number, onEdit?: (record: any) => void }) {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const supabase = createClient()
    const [deletingId, setDeletingId] = useState<string | null>(null)

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

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.')) return

        setDeletingId(id)
        const { error } = await supabase.from('servicios_trailers').delete().eq('id', id)

        if (error) {
            alert(`Error al eliminar: ${error.message}`)
        } else {
            setData(prev => prev.filter(item => item.id !== id))
        }
        setDeletingId(null)
    }

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
        <div className="bg-card border rounded-lg shadow-sm w-full overflow-hidden">
            <div className="overflow-x-auto w-full">
                <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                        <tr>
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
                            <th className="px-4 py-3 font-medium text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
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
                                <td className="px-4 py-3 text-right space-x-2">
                                    {onEdit && (
                                        <Button variant="ghost" size="icon" onClick={() => onEdit(row)} title="Editar registro">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDelete(row.id)}
                                        title="Eliminar registro"
                                        disabled={deletingId === row.id}
                                    >
                                        <Trash2 className={`h-4 w-4 ${deletingId === row.id ? 'animate-pulse' : ''}`} />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
