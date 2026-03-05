'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar as CalendarIcon, List, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { CalendarioPago } from '@/lib/types/database.types'
import { getUserPermissions } from '@/lib/utils/auth'

export function CalendarSection() {
    const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
    const [pagos, setPagos] = useState<CalendarioPago[]>([])
    const [loading, setLoading] = useState(true)
    const [canCreate, setCanCreate] = useState(false)

    // Date states for the calendar
    const [currentDate, setCurrentDate] = useState(new Date())

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Delete Modal State
    const [deleteConfig, setDeleteConfig] = useState<{ open: boolean, payment: CalendarioPago | null, isRecurring: boolean }>({
        open: false,
        payment: null,
        isRecurring: false
    })

    // Form State
    const [formData, setFormData] = useState({
        fecha: new Date().toISOString().split('T')[0],
        nombre_pago: '',
        monto: '',
        moneda: 'soles',
        numero_factura: '',
        descripcion: '',
        frecuencia: 'unica',
        monto_variable: false,
        fecha_limite: ''
    })

    const supabase = createClient()

    useEffect(() => {
        fetchPagos()
        checkPermissions()
    }, [])

    const checkPermissions = async () => {
        const permissions = await getUserPermissions()
        setCanCreate(permissions.can_create)
    }

    const fetchPagos = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('calendario_pagos')
                .select('*')
                .order('fecha', { ascending: true })

            if (error) throw error
            setPagos(data || [])
        } catch (err) {
            console.error('Error fetching calendar payments:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleCreatePago = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuario no autenticado')

            let currentDate = new Date(formData.fecha + 'T00:00:00')

            let endLimit = new Date(currentDate)
            endLimit.setFullYear(endLimit.getFullYear() + 1) // default 1 año si no hay límite

            if (formData.fecha_limite) {
                endLimit = new Date(formData.fecha_limite + 'T00:00:00')
            }

            // Safeguard total max items
            const newPagos = []
            let safeCount = 0

            const grupoId = crypto.randomUUID()

            // Generator loop
            while (currentDate <= endLimit && safeCount < 100) {
                newPagos.push({
                    fecha: currentDate.toISOString().split('T')[0],
                    nombre_pago: formData.nombre_pago,
                    monto: formData.monto_variable ? 0 : parseFloat(formData.monto),
                    moneda: formData.moneda,
                    numero_factura: formData.numero_factura || null,
                    descripcion: formData.descripcion || null,
                    frecuencia: formData.frecuencia,
                    monto_variable: formData.monto_variable,
                    fecha_limite: formData.fecha_limite || null,
                    creado_por: user.id,
                    grupo_id: grupoId
                })

                if (formData.frecuencia === 'unica') break

                if (formData.frecuencia === 'semanal') {
                    currentDate.setDate(currentDate.getDate() + 7)
                } else if (formData.frecuencia === 'quincenal') {
                    currentDate.setDate(currentDate.getDate() + 14)
                } else if (formData.frecuencia === 'mensual') {
                    currentDate.setMonth(currentDate.getMonth() + 1)
                } else if (formData.frecuencia === 'anual') {
                    currentDate.setFullYear(currentDate.getFullYear() + 1)
                }
                safeCount++
            }

            const { error: insertError } = await supabase
                .from('calendario_pagos')
                .insert(newPagos)

            if (insertError) throw insertError

            setIsModalOpen(false)
            fetchPagos()

            // Reset form
            setFormData({
                fecha: new Date().toISOString().split('T')[0],
                nombre_pago: '',
                monto: '',
                moneda: 'soles',
                numero_factura: '',
                descripcion: '',
                frecuencia: 'unica',
                monto_variable: false,
                fecha_limite: ''
            })
        } catch (err: any) {
            setError(err.message || 'Error al crear el pago')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDeleteClick = (pagoRef: CalendarioPago) => {
        const isRecurring = !!(pagoRef.grupo_id || pagoRef.frecuencia !== 'unica');
        setDeleteConfig({ open: true, payment: pagoRef, isRecurring });
    }

    const confirmDelete = async (deleteGroup: boolean) => {
        const pagoRef = deleteConfig.payment;
        if (!pagoRef) return;

        setDeleteConfig({ open: false, payment: null, isRecurring: false });

        try {
            if (deleteGroup && (pagoRef.grupo_id || pagoRef.frecuencia !== 'unica')) {
                if (pagoRef.grupo_id) {
                    // Delete by grupo_id (modern way)
                    const { error } = await supabase
                        .from('calendario_pagos')
                        .delete()
                        .eq('grupo_id', pagoRef.grupo_id)
                    if (error) throw error
                } else {
                    // Legacy bulk delete (for older payments without grupo_id)
                    const { error } = await supabase
                        .from('calendario_pagos')
                        .delete()
                        .eq('nombre_pago', pagoRef.nombre_pago)
                        .eq('monto', pagoRef.monto)
                        .eq('moneda', pagoRef.moneda)
                        .eq('frecuencia', pagoRef.frecuencia)
                        .eq('monto_variable', pagoRef.monto_variable)
                    if (error) throw error
                }
            } else {
                // Delete only this specific one
                const { error } = await supabase
                    .from('calendario_pagos')
                    .delete()
                    .eq('id', pagoRef.id)
                if (error) throw error
            }
            fetchPagos()
        } catch (err) {
            console.error('Error deleting payment:', err)
        }
    }

    // Helper functions for Calendar
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

    const formatter = new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN'
    })

    const renderCalendar = () => {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth()

        const daysInMonth = getDaysInMonth(year, month)
        const firstDay = getFirstDayOfMonth(year, month)

        const days = []

        // Add empty cells for days before the 1st
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-32 border border-muted/50 bg-muted/10 rounded-sm w-full"></div>)
        }

        // Add actual days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayPagos = pagos.filter(p => p.fecha === dateStr)
            const isToday = new Date().toISOString().split('T')[0] === dateStr

            days.push(
                <div key={day} className={`h-32 border border-muted/50 rounded-sm p-1 overflow-hidden flex flex-col ${isToday ? 'bg-primary/5 ring-1 ring-primary' : 'bg-card'}`}>
                    <div className="flex justify-between items-center mb-1 shrink-0">
                        <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                            {day}
                        </span>
                    </div>
                    <div className="space-y-1 flex-1">
                        {dayPagos.slice(0, 3).map(pago => (
                            <div key={pago.id} className={`text-[10px] p-1 rounded-sm flex flex-col gap-0.5 ${pago.estado === 'pagado' ? 'bg-green-100/50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-blue-100/50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                                <div className="font-semibold truncate" title={pago.nombre_pago}>{pago.nombre_pago}</div>
                                <div className="flex justify-between items-center">
                                    <span>
                                        {pago.monto_variable ? 'Variable' : `${pago.moneda === 'soles' ? 'S/' : '$'} ${pago.monto}`}
                                    </span>
                                    <div className="flex gap-1">
                                        {pago.frecuencia !== 'unica' && <RefreshCw className="w-3 h-3 text-muted-foreground mr-1" />}
                                        {pago.estado === 'pagado' && <CheckCircle2 className="w-3 h-3" />}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {dayPagos.length > 3 && (
                            <Dialog>
                                <DialogTrigger asChild>
                                    <div className="text-[10px] font-bold text-center text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors py-0.5 cursor-pointer rounded-sm mt-0.5">
                                        + {dayPagos.length - 3} más
                                    </div>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle>Pagos del {day} de {currentDate.toLocaleString('es-PE', { month: 'long' })}</DialogTitle>
                                        <DialogDescription>Listado completo de pagos para este día.</DialogDescription>
                                    </DialogHeader>
                                    <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-2 my-2">
                                        {dayPagos.map(pago => (
                                            <div key={pago.id} className={`text-sm p-3 rounded-md flex flex-col gap-1.5 border ${pago.estado === 'pagado' ? 'bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800' : 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800'}`}>
                                                <div className="font-semibold">{pago.nombre_pago}</div>
                                                {pago.descripcion && (
                                                    <div className="text-xs text-muted-foreground line-clamp-2">{pago.descripcion}</div>
                                                )}
                                                <div className="flex justify-between items-center mt-1 pt-1 border-t border-border/50">
                                                    <span className="font-medium text-foreground">
                                                        {pago.monto_variable ? 'Monto Variable' : `${pago.moneda === 'soles' ? 'S/' : '$'} ${pago.monto}`}
                                                    </span>
                                                    <div className="flex gap-2 items-center">
                                                        {pago.frecuencia !== 'unica' && <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title={pago.frecuencia}><RefreshCw className="w-3 h-3" /> Repetitivo</span>}
                                                        {pago.estado === 'pagado' ? (
                                                            <span className="flex items-center gap-1 text-[11px] text-green-600 font-semibold"><CheckCircle2 className="w-3 h-3" /> Pagado</span>
                                                        ) : (
                                                            <span className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold"><AlertCircle className="w-3 h-3" /> Pendiente</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </div >
            )
        }

        return (
            <div className="w-full">
                <div className="flex justify-between items-center mb-4">
                    <Button variant="outline" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>Anterior</Button>
                    <h3 className="text-lg font-bold">
                        {currentDate.toLocaleString('es-PE', { month: 'long', year: 'numeric' }).toUpperCase()}
                    </h3>
                    <Button variant="outline" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>Siguiente</Button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                        <div key={d} className="text-center text-sm font-semibold text-muted-foreground py-2">{d}</div>
                    ))}
                    {days}
                </div>
            </div>
        )
    }

    const renderList = () => {
        return (
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Factura</TableHead>
                            <TableHead>Estado</TableHead>
                            {canCreate && <TableHead className="text-right">Acciones</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pagos.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No hay pagos programados.
                                </TableCell>
                            </TableRow>
                        ) : (
                            pagos.map(pago => (
                                <TableRow key={pago.id}>
                                    <TableCell className="font-medium">{new Date(pago.fecha + 'T12:00:00').toLocaleDateString('es-PE')}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            {pago.nombre_pago}
                                            {pago.frecuencia !== 'unica' && <span title={pago.frecuencia}><RefreshCw className="w-3 h-3 text-muted-foreground" /></span>}
                                        </div>
                                        {pago.descripcion && <div className="text-xs text-muted-foreground">{pago.descripcion}</div>}
                                    </TableCell>
                                    <TableCell>
                                        {pago.monto_variable ? <span className="text-muted-foreground italic text-xs">A definir</span> : `${pago.moneda === 'soles' ? 'S/' : '$'} ${pago.monto}`}
                                    </TableCell>
                                    <TableCell>{pago.numero_factura || '-'}</TableCell>
                                    <TableCell>
                                        {pago.estado === 'pagado' ? (
                                            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                                <CheckCircle2 className="w-4 h-4" /> Pagado
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                                                <AlertCircle className="w-4 h-4" /> Pendiente
                                            </span>
                                        )}
                                    </TableCell>
                                    {canCreate && (
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => handleDeleteClick(pago)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CalendarIcon className="h-6 w-6 text-primary" />
                    <div>
                        <h2 className="text-2xl font-bold text-primary">Calendario de Pagos</h2>
                        <p className="text-muted-foreground">Gestiona los pagos recurrentes y programados</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="bg-muted p-1 rounded-md flex">
                        <Button
                            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('calendar')}
                            className="h-8"
                        >
                            <CalendarIcon className="w-4 h-4 mr-1" /> Calendario
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('list')}
                            className="h-8"
                        >
                            <List className="w-4 h-4 mr-1" /> Lista
                        </Button>
                    </div>

                    {canCreate && (
                        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="h-8 ml-2">
                                    <Plus className="w-4 h-4 mr-1" /> Programar Pago
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto w-[95vw]">
                                <DialogHeader>
                                    <DialogTitle className="text-xl text-primary flex items-center gap-2">
                                        <CalendarIcon className="w-5 h-5" /> Programar Nuevo Pago
                                    </DialogTitle>
                                    <DialogDescription>
                                        Registra un pago que debe realizarse en una fecha o frecuencia específica.
                                    </DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleCreatePago} className="space-y-6 pt-2">

                                    {/* SECCIÓN: INFORMACIÓN GENERAL */}
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-semibold uppercase text-muted-foreground border-b pb-1">1. Información del Gasto</h4>
                                        <div className="space-y-2">
                                            <Label htmlFor="nombre_pago">Nombre / Concepto *</Label>
                                            <Input
                                                id="nombre_pago"
                                                placeholder="Ej. Alquiler de oficina"
                                                required
                                                className="bg-muted/30 focus:bg-background transition-colors"
                                                value={formData.nombre_pago}
                                                onChange={e => setFormData({ ...formData, nombre_pago: e.target.value })}
                                            />
                                        </div>

                                        <div className="p-3 bg-secondary/5 border border-secondary/20 rounded-lg space-y-3">
                                            <div className="flex items-center space-x-2 pb-2 border-b border-border/50">
                                                <Checkbox
                                                    id="monto_variable"
                                                    checked={formData.monto_variable}
                                                    onCheckedChange={(c) => setFormData({ ...formData, monto_variable: !!c, monto: !!c ? '' : formData.monto })}
                                                />
                                                <Label htmlFor="monto_variable" className="cursor-pointer font-medium text-sm text-secondary-foreground">
                                                    El monto es variable (A definir luego)
                                                </Label>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="monto">Monto {!formData.monto_variable && '*'}</Label>
                                                    <Input
                                                        id="monto"
                                                        type="number"
                                                        step="0.01"
                                                        placeholder={formData.monto_variable ? "Sin monto definido" : "0.00"}
                                                        required={!formData.monto_variable}
                                                        className={formData.monto_variable ? 'opacity-50 pointer-events-none' : ''}
                                                        tabIndex={formData.monto_variable ? -1 : 0}
                                                        value={formData.monto_variable ? '' : formData.monto}
                                                        onChange={e => setFormData({ ...formData, monto: e.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="moneda">Moneda *</Label>
                                                    <Select
                                                        value={formData.moneda}
                                                        onValueChange={v => setFormData({ ...formData, moneda: v })}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="soles">Soles (S/)</SelectItem>
                                                            <SelectItem value="dolares">Dólares ($)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECCIÓN: PROGRAMACIÓN */}
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-semibold uppercase text-muted-foreground border-b pb-1">2. Programación</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="fecha_programada">Primer Pago / Fecha *</Label>
                                                <Input
                                                    id="fecha_programada"
                                                    type="date"
                                                    required
                                                    value={formData.fecha}
                                                    onChange={e => setFormData({ ...formData, fecha: e.target.value })}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Frecuencia de Repetición</Label>
                                                <Select
                                                    value={formData.frecuencia}
                                                    onValueChange={v => setFormData({ ...formData, frecuencia: v })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="unica">Un solo pago</SelectItem>
                                                        <SelectItem value="semanal">Semanal</SelectItem>
                                                        <SelectItem value="quincenal">Quincenal</SelectItem>
                                                        <SelectItem value="mensual">Mensual</SelectItem>
                                                        <SelectItem value="anual">Anual</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {formData.frecuencia !== 'unica' && (
                                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-md border border-blue-200 dark:border-blue-800 flex items-start gap-2">
                                                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                                <div className="space-y-2 w-full">
                                                    <p className="text-xs">
                                                        Al elegir un pago repetitivo, lo agendaremos en tu calendario de forma sucesiva. Por defecto generamos pagos hasta **1 año**, a menos que especifiques una fecha límite:
                                                    </p>
                                                    <div>
                                                        <Label htmlFor="fecha_limite" className="text-[11px] uppercase font-bold tracking-wider opacity-80">Fecha de Fin (Opcional)</Label>
                                                        <Input
                                                            id="fecha_limite"
                                                            type="date"
                                                            className="h-8 mt-1 border-blue-300 dark:border-blue-700 bg-white dark:bg-background"
                                                            value={formData.fecha_limite}
                                                            onChange={e => setFormData({ ...formData, fecha_limite: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* SECCIÓN: COMPROBANTE/DETALLES */}
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-semibold uppercase text-muted-foreground border-b pb-1">3. Detalles Opcionales</h4>
                                        <div className="space-y-2">
                                            <Label htmlFor="numero_factura">Número de Factura o Recibo</Label>
                                            <Input
                                                id="numero_factura"
                                                placeholder="Ej. F001-000001"
                                                value={formData.numero_factura}
                                                onChange={e => setFormData({ ...formData, numero_factura: e.target.value })}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="descripcion">Descripción adicional</Label>
                                            <Textarea
                                                id="descripcion"
                                                placeholder="Detalles sobre por qué se realiza este gasto..."
                                                className="resize-none h-16"
                                                value={formData.descripcion}
                                                onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" /> {error}
                                        </div>
                                    )}

                                    <div className="pt-2 border-t flex justify-end gap-3">
                                        <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                                            Cancelar
                                        </Button>
                                        <Button type="submit" className="min-w-[150px] shadow-md hover:shadow-lg transition-all" disabled={isSubmitting}>
                                            {isSubmitting ? 'Guardando...' : 'Guardar y Programar'}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    {loading ? (
                        <div className="py-20 text-center text-muted-foreground">Cargando pagos programados...</div>
                    ) : viewMode === 'calendar' ? (
                        renderCalendar()
                    ) : (
                        renderList()
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={deleteConfig.open} onOpenChange={(open) => setDeleteConfig(prev => ({ ...prev, open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {deleteConfig.isRecurring ? 'Eliminar pago recurrente' : 'Eliminar pago programado'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteConfig.isRecurring
                                ? 'Este pago es parte de una serie repetitiva. ¿Qué deseas eliminar?'
                                : '¿Estás seguro de que deseas eliminar este pago programado? Esta acción no se puede deshacer.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="sm:justify-between items-center sm:flex-row flex-col gap-3 mt-4">
                        <AlertDialogCancel className="w-full sm:w-auto m-0">Cancelar</AlertDialogCancel>
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                            {deleteConfig.isRecurring && (
                                <AlertDialogAction
                                    className="w-full sm:w-auto bg-destructive hover:bg-destructive/90"
                                    onClick={() => confirmDelete(true)}
                                >
                                    Eliminar todos
                                </AlertDialogAction>
                            )}
                            <AlertDialogAction
                                className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                                onClick={() => confirmDelete(false)}
                            >
                                {deleteConfig.isRecurring ? 'Eliminar solo este' : 'Eliminar'}
                            </AlertDialogAction>
                        </div>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
