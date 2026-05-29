'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Receipt, RefreshCw, CheckCircle2, AlertCircle, Eye, Camera, Search, XCircle, Trash2, Pencil } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { GastoConductor } from '@/lib/types/database.types'

export function GastosConductorSection() {
    const [gastos, setGastos] = useState<GastoConductor[]>([])
    const [loading, setLoading] = useState(true)
    const [estadoFilter, setEstadoFilter] = useState<'all' | 'pendiente' | 'pagado'>('all')
    const [search, setSearch] = useState('')

    // Detail modal
    const [detailGasto, setDetailGasto] = useState<GastoConductor | null>(null)

    // Delete
    const [deleteGasto, setDeleteGasto] = useState<GastoConductor | null>(null)
    const [deleting, setDeleting] = useState(false)

    // Edit
    const [editGasto, setEditGasto] = useState<GastoConductor | null>(null)
    const [editDesc, setEditDesc] = useState('')
    const [editMonto, setEditMonto] = useState('')
    const [editSaving, setEditSaving] = useState(false)

    const supabase = createClient()

    const fetchGastos = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('gastos_conductor')
                .select('*')
                .order('created_at', { ascending: false })
            if (error) throw error
            setGastos(data || [])
        } catch (err) {
            console.error('Error fetching gastos:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchGastos() }, [])

    const handleDelete = async () => {
        if (!deleteGasto) return
        setDeleting(true)
        try {
            await supabase.from('calendario_pagos').delete().eq('gasto_conductor_id', deleteGasto.id)
            const { error } = await supabase.from('gastos_conductor').delete().eq('id', deleteGasto.id)
            if (error) throw error
            setDeleteGasto(null)
            fetchGastos()
        } catch (err) {
            console.error('Error al eliminar:', err)
            alert('Error al eliminar el gasto.')
        } finally {
            setDeleting(false)
        }
    }

    const openEdit = (g: GastoConductor) => {
        setEditGasto(g)
        setEditDesc(g.descripcion)
        setEditMonto(g.monto.toString())
    }

    const handleSaveEdit = async () => {
        if (!editGasto) return
        setEditSaving(true)
        try {
            const { error } = await supabase
                .from('gastos_conductor')
                .update({ descripcion: editDesc.trim(), monto: parseFloat(editMonto) })
                .eq('id', editGasto.id)
            if (error) throw error
            // Also update the linked calendario_pagos monto + descripcion
            await supabase
                .from('calendario_pagos')
                .update({ monto: parseFloat(editMonto), descripcion: `${editDesc.trim()} | Servicio: ${editGasto.servicio_nombre}` })
                .eq('gasto_conductor_id', editGasto.id)
            setEditGasto(null)
            fetchGastos()
        } catch (err) {
            console.error('Error al editar:', err)
            alert('Error al guardar cambios.')
        } finally {
            setEditSaving(false)
        }
    }

    const filtered = gastos.filter(g => {
        if (estadoFilter !== 'all' && g.estado !== estadoFilter) return false
        if (search.trim()) {
            const q = search.toLowerCase()
            return (
                g.conductor_nombre.toLowerCase().includes(q) ||
                g.servicio_nombre.toLowerCase().includes(q) ||
                g.descripcion.toLowerCase().includes(q)
            )
        }
        return true
    })

    const pendientes = gastos.filter(g => g.estado === 'pendiente').length
    const totalPendiente = gastos
        .filter(g => g.estado === 'pendiente')
        .reduce((sum, g) => sum + g.monto, 0)

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Receipt className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">Gastos de Conductores</h2>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                            {pendientes} pendiente{pendientes !== 1 ? 's' : ''} · S/ {totalPendiente.toFixed(2)} por pagar
                        </p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={fetchGastos} disabled={loading} className="h-8 gap-1.5">
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
                        placeholder="Buscar conductor, servicio, descripción..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                </div>
                <Select value={estadoFilter} onValueChange={v => setEstadoFilter(v as typeof estadoFilter)}>
                    <SelectTrigger className="h-9 text-xs w-[150px]">
                        <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pendiente">Pendientes</SelectItem>
                        <SelectItem value="pagado">Pagados</SelectItem>
                    </SelectContent>
                </Select>
                {(search || estadoFilter !== 'all') && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setEstadoFilter('all') }} className="h-9 px-2 text-muted-foreground hover:text-destructive">
                        <XCircle className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Cargando gastos...
                </div>
            ) : (
                <div className="border rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="whitespace-nowrap font-bold text-xs">Fecha</TableHead>
                                    <TableHead className="whitespace-nowrap font-bold text-xs">Conductor</TableHead>
                                    <TableHead className="whitespace-nowrap font-bold text-xs">Servicio</TableHead>
                                    <TableHead className="whitespace-nowrap font-bold text-xs">Descripción</TableHead>
                                    <TableHead className="whitespace-nowrap font-bold text-xs text-right">Monto</TableHead>
                                    <TableHead className="whitespace-nowrap font-bold text-xs text-center">Estado</TableHead>
                                    <TableHead className="whitespace-nowrap font-bold text-xs text-center">Fotos</TableHead>
                                    <TableHead className="whitespace-nowrap font-bold text-xs text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                                            No se encontraron gastos
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map(gasto => (
                                        <TableRow key={gasto.id} className={`text-xs hover:bg-muted/30 ${gasto.estado === 'pendiente' ? 'bg-primary/5/30' : ''}`}>
                                            <TableCell className="whitespace-nowrap">{new Date(gasto.created_at).toLocaleDateString('es-PE')}</TableCell>
                                            <TableCell className="font-medium whitespace-nowrap">{gasto.conductor_nombre}</TableCell>
                                            <TableCell className="max-w-[160px]">
                                                <span className="line-clamp-1 text-[11px]" title={gasto.servicio_nombre}>{gasto.servicio_nombre}</span>
                                            </TableCell>
                                            <TableCell className="max-w-[200px]">
                                                <span className="line-clamp-2" title={gasto.descripcion}>{gasto.descripcion}</span>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold whitespace-nowrap">
                                                {gasto.moneda === 'soles' ? 'S/' : '$'} {gasto.monto.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {gasto.estado === 'pagado' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                                                        <CheckCircle2 className="w-3 h-3" /> Pagado
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                                                        <AlertCircle className="w-3 h-3" /> Pendiente
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {gasto.fotos?.length > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-primary font-semibold">
                                                        <Camera className="w-3 h-3" /> {gasto.fotos.length}
                                                    </span>
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => setDetailGasto(gasto)} title="Ver detalle">
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => openEdit(gasto)} title="Editar">
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteGasto(gasto)} title="Eliminar">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteGasto} onOpenChange={open => { if (!open) setDeleteGasto(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar gasto?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteGasto && (
                                <>
                                    <strong>{deleteGasto.conductor_nombre}</strong> · {deleteGasto.descripcion} ·{' '}
                                    {deleteGasto.moneda === 'soles' ? 'S/' : '$'} {deleteGasto.monto}
                                    <br />Esta acción no se puede deshacer. También eliminará la entrada del calendario de pagos.
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? 'Eliminando...' : 'Eliminar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Edit Modal */}
            <Dialog open={!!editGasto} onOpenChange={open => { if (!open) setEditGasto(null) }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Pencil className="w-4 h-4" /> Editar gasto
                        </DialogTitle>
                        <DialogDescription>
                            {editGasto?.conductor_nombre} · {editGasto?.servicio_nombre}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div>
                            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Descripción</Label>
                            <Textarea
                                className="mt-1.5 resize-none h-20"
                                value={editDesc}
                                onChange={e => setEditDesc(e.target.value)}
                                disabled={editSaving}
                            />
                        </div>
                        <div>
                            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Monto</Label>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-sm text-muted-foreground shrink-0">{editGasto?.moneda === 'soles' ? 'S/' : '$'}</span>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editMonto}
                                    onChange={e => setEditMonto(e.target.value)}
                                    disabled={editSaving}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button variant="outline" className="flex-1" onClick={() => setEditGasto(null)} disabled={editSaving}>Cancelar</Button>
                            <Button
                                className="flex-1"
                                onClick={handleSaveEdit}
                                disabled={editSaving || !editDesc.trim() || !editMonto}
                            >
                                {editSaving ? 'Guardando...' : 'Guardar cambios'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Detail Modal */}
            <Dialog open={!!detailGasto} onOpenChange={open => { if (!open) setDetailGasto(null) }}>
                <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-primary">
                            <Receipt className="w-5 h-5" /> Detalle del Gasto
                        </DialogTitle>
                        <DialogDescription>Información completa del gasto registrado.</DialogDescription>
                    </DialogHeader>
                    {detailGasto && (
                        <div className="space-y-4 pt-2">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Conductor</p><p className="font-semibold">{detailGasto.conductor_nombre}</p></div>
                                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Estado</p>
                                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${detailGasto.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {detailGasto.estado === 'pagado' ? <><CheckCircle2 className="w-3 h-3" />Pagado</> : <><AlertCircle className="w-3 h-3" />Pendiente</>}
                                    </span>
                                </div>
                                <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase tracking-wide">Servicio</p><p className="font-semibold">{detailGasto.servicio_nombre}</p></div>
                                <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase tracking-wide">Descripción</p><p className="font-medium">{detailGasto.descripcion}</p></div>
                                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Monto</p><p className="font-bold text-xl text-primary">{detailGasto.moneda === 'soles' ? 'S/' : '$'} {detailGasto.monto}</p></div>
                                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Registrado</p><p className="font-semibold">{new Date(detailGasto.created_at).toLocaleDateString('es-PE')}</p></div>
                                {detailGasto.pagado_at && (
                                    <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Pagado el</p><p className="font-semibold">{new Date(detailGasto.pagado_at).toLocaleDateString('es-PE')}</p></div>
                                )}
                            </div>
                            {detailGasto.fotos?.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Comprobantes del gasto</p>
                                    <div className="flex gap-2 flex-wrap">
                                        {detailGasto.fotos.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group">
                                                <img src={url} alt={`comprobante ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-primary/10 group-hover:opacity-80 transition-opacity" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {detailGasto.foto_pago && (
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Voucher de pago</p>
                                    <a href={detailGasto.foto_pago} target="_blank" rel="noopener noreferrer">
                                        <img src={detailGasto.foto_pago} alt="voucher pago" className="w-24 h-24 object-cover rounded-lg border border-green-200 hover:opacity-80 transition-opacity" />
                                    </a>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
