'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Plus } from "lucide-react"

const trailerSchema = z.object({
    fecha: z.string().min(1, 'La fecha es obligatoria'),
    guia_remision: z.string().optional(),
    guia_transportista: z.string().optional(),
    placa: z.string().optional(),
    carreta_id: z.string().optional().nullable(),
    cliente_id: z.string().optional().nullable(),
    sub_cliente_id: z.string().optional().nullable(),
    tipo_servicio: z.string().optional(),
    tipo_carga: z.string().optional(),
    hora_cita: z.string().optional(),
    referencia: z.string().optional(),
    tamano_cntr: z.string().optional(),
    agencia_id: z.string().optional().nullable(),
    almacen_retiro_id: z.string().optional().nullable(),
    destino_id: z.string().optional().nullable(),
    contenedor: z.string().optional(),
    almacen_devolucion_id: z.string().optional().nullable(),
    conductor_id: z.string().optional().nullable(),
    status_servicio: z.string().optional(),
    devolucion_vacio: z.string().optional(),
    conductor_devolucion_id: z.string().optional().nullable(),
    hora_devolucion: z.string().optional(),
    llegada_almacen_retiro: z.string().optional(),
    salida_almacen_retiro: z.string().optional(),
    llegada_cliente: z.string().optional(),
    ingreso_planta: z.string().optional(),
    inicio_carga: z.string().optional(),
    termino_descarga: z.string().optional(),
    observaciones: z.string().optional(),
    linea_amarilla: z.string().optional(),
    peajes: z.string().optional(),
    adicionales: z.string().optional(),
    pago_conductor: z.string().optional(),
    factura: z.string().optional(),
    estado_factura: z.string().optional(),
})

type TrailerFormValues = z.infer<typeof trailerSchema>

export function TrailerForm({ onSuccess, initialData }: { onSuccess: () => void, initialData?: any }) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState('general')
    const supabase = createClient()

    const [clientes, setClientes] = useState<any[]>([])
    const [carretas, setCarretas] = useState<any[]>([])
    const [conductores, setConductores] = useState<any[]>([])
    const [locaciones, setLocaciones] = useState<any[]>([])

    // Quick create state
    const [createModal, setCreateModal] = useState<{
        isOpen: boolean;
        type: 'clientes' | 'carretas' | 'conductores' | 'locaciones' | null;
        field: string | null;
    }>({ isOpen: false, type: null, field: null })
    const [createInputValue, setCreateInputValue] = useState('')
    const [isCreatingEntity, setIsCreatingEntity] = useState(false)

    const form = useForm<TrailerFormValues>({
        resolver: zodResolver(trailerSchema),
        defaultValues: {
            fecha: new Date().toISOString().split('T')[0],
            guia_remision: '',
            guia_transportista: '',
            placa: '',
            carreta_id: '',
            cliente_id: '',
            sub_cliente_id: '',
            tipo_servicio: '',
            tipo_carga: '',
            hora_cita: '',
            referencia: '',
            tamano_cntr: '',
            agencia_id: '',
            almacen_retiro_id: '',
            destino_id: '',
            contenedor: '',
            almacen_devolucion_id: '',
            conductor_id: '',
            status_servicio: 'POR COORDINAR',
            devolucion_vacio: '',
            conductor_devolucion_id: '',
            hora_devolucion: '',
            llegada_almacen_retiro: '',
            salida_almacen_retiro: '',
            llegada_cliente: '',
            ingreso_planta: '',
            inicio_carga: '',
            termino_descarga: '',
            observaciones: '',
            linea_amarilla: '',
            peajes: '',
            adicionales: '',
            pago_conductor: '',
            factura: '',
            estado_factura: 'PENDIENTE',
        },
    })

    // Reset form when initialData changes
    useEffect(() => {
        if (initialData) {
            form.reset({
                ...form.getValues(),
                ...initialData,
                // Make sure date format is YYYY-MM-DD
                fecha: initialData.fecha ? new Date(initialData.fecha).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                // Set default handling for null numerical values
                linea_amarilla: initialData.linea_amarilla?.toString() || '',
                peajes: initialData.peajes?.toString() || '',
                adicionales: initialData.adicionales?.toString() || '',
                pago_conductor: initialData.pago_conductor?.toString() || '',
            })
        }
    }, [initialData, form])

    useEffect(() => {
        async function fetchData() {
            try {
                const [cli, car, con, loc] = await Promise.all([
                    supabase.from('clientes').select('id, nombre'),
                    supabase.from('carretas').select('id, placa'),
                    supabase.from('conductores').select('id, nombre'),
                    supabase.from('locaciones').select('id, nombre')
                ])

                if (cli.data) setClientes(cli.data)
                if (car.data) setCarretas(car.data)
                if (con.data) setConductores(con.data)
                if (loc.data) setLocaciones(loc.data)
            } catch (err) {
                console.error("No se pudieron cargar los datos maestros. Probablemente falte crear las tablas:", err)
            }
        }
        fetchData()
    }, [supabase])

    const handleCreateEntity = async () => {
        if (!createModal.type || !createInputValue.trim() || !createModal.field) return

        setIsCreatingEntity(true)
        const columnName = createModal.type === 'carretas' ? 'placa' : 'nombre'

        const { data, error } = await supabase
            .from(createModal.type)
            .insert([{ [columnName]: createInputValue.trim() }])
            .select()
            .single()

        if (error) {
            console.error("Error creating entity:", error)
            alert("No se pudo crear. Asegúrese de que no exista ya y haya ejecutado los SQL.")
        } else if (data) {
            // Update local state
            if (createModal.type === 'clientes') setClientes(prev => [...prev, data])
            if (createModal.type === 'carretas') setCarretas(prev => [...prev, data])
            if (createModal.type === 'conductores') setConductores(prev => [...prev, data])
            if (createModal.type === 'locaciones') setLocaciones(prev => [...prev, data])

            // Auto select
            form.setValue(createModal.field as any, data.id)
            setCreateModal({ isOpen: false, type: null, field: null })
            setCreateInputValue('')
        }
        setIsCreatingEntity(false)
    }

    const onSubmit = async (data: TrailerFormValues) => {
        setLoading(true)
        setError(null)

        // Convert string empty values to null for foreign keys if necessary
        const parseNumber = (val: string | undefined) => val ? parseFloat(val) : null
        const parseFk = (val: string | undefined | null) => val ? val : null

        const payload = {
            ...data,
            carreta_id: parseFk(data.carreta_id),
            cliente_id: parseFk(data.cliente_id),
            sub_cliente_id: parseFk(data.sub_cliente_id),
            agencia_id: parseFk(data.agencia_id),
            almacen_retiro_id: parseFk(data.almacen_retiro_id),
            destino_id: parseFk(data.destino_id),
            almacen_devolucion_id: parseFk(data.almacen_devolucion_id),
            conductor_id: parseFk(data.conductor_id),
            conductor_devolucion_id: parseFk(data.conductor_devolucion_id),
            linea_amarilla: parseNumber(data.linea_amarilla),
            peajes: parseNumber(data.peajes),
            adicionales: parseNumber(data.adicionales),
            pago_conductor: parseNumber(data.pago_conductor),
        }

        let saveError;
        if (initialData?.id) {
            const { error } = await supabase
                .from('servicios_trailers')
                .update(payload)
                .eq('id', initialData.id)
            saveError = error;
        } else {
            const { error } = await supabase
                .from('servicios_trailers')
                .insert([payload])
            saveError = error;
        }

        if (saveError) {
            console.error(saveError)
            // Check if table missing
            if (saveError.code === '42P01') {
                setError("Error: La tabla 'servicios_trailers' (o una relacionada) no existe. ¿Has ejecutado las consultas SQL?")
            } else {
                setError(`Error al guardar: ${saveError.message}`)
            }
            setLoading(false)
            return
        }

        setLoading(false)
        form.reset()
        onSuccess()
    }

    const tabClasses = (tab: string) => `px-4 py-2 font-medium rounded-t-lg transition-colors border-b-2 ${activeTab === tab ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:bg-muted'}`

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex border-b mb-6 overflow-x-auto">
                <button type="button" onClick={() => setActiveTab('general')} className={tabClasses('general')}>General</button>
                <button type="button" onClick={() => setActiveTab('logistica')} className={tabClasses('logistica')}>Logística</button>
                <button type="button" onClick={() => setActiveTab('tiempos')} className={tabClasses('tiempos')}>Tiempos</button>
                <button type="button" onClick={() => setActiveTab('cierre')} className={tabClasses('cierre')}>Costos y Cierre</button>
            </div>

            {error && (
                <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm mb-4">
                    {error}
                </div>
            )}

            {/* TABS CONTENT */}
            {activeTab === 'general' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
                    <div className="space-y-2">
                        <Label htmlFor="fecha">Fecha *</Label>
                        <Input id="fecha" type="date" {...form.register('fecha')} />
                        {form.formState.errors.fecha && <p className="text-sm text-destructive">{form.formState.errors.fecha.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="guia_remision">Guía de Remisión</Label>
                        <Input id="guia_remision" placeholder="Ej: 001-00123" {...form.register('guia_remision')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="guia_transportista">Guía de Transportista</Label>
                        <Input id="guia_transportista" placeholder="Ej: T01-00456" {...form.register('guia_transportista')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="cliente_id">Cliente</Label>
                        <div className="flex gap-2">
                            <select id="cliente_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50" {...form.register('cliente_id')}>
                                <option value="">Seleccione...</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                            <Button type="button" variant="outline" size="icon" onClick={() => setCreateModal({ isOpen: true, type: 'clientes', field: 'cliente_id' })}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="sub_cliente_id">Sub Cliente</Label>
                        <div className="flex gap-2">
                            <select id="sub_cliente_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:opacity-50" {...form.register('sub_cliente_id')}>
                                <option value="">Seleccione...</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                            <Button type="button" variant="outline" size="icon" onClick={() => setCreateModal({ isOpen: true, type: 'clientes', field: 'sub_cliente_id' })}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="tipo_servicio">Tipo de Servicio</Label>
                        <select id="tipo_servicio" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('tipo_servicio')}>
                            <option value="">Seleccione...</option>
                            <option value="IMPORTACION">IMPORTACION</option>
                            <option value="DEVOLUCION VACIO">DEVOLUCION VACIO</option>
                            <option value="DEVOLUCION VACIO (De otra Unidad)">DEVOLUCION VACIO (Otra P.)</option>
                            <option value="DESPACHO">DESPACHO</option>
                            <option value="RECOJO">RECOJO</option>
                            <option value="TRASLADO">TRASLADO</option>
                            <option value="ISOTANQUE VACIO">ISOTANQUE VACIO</option>
                            <option value="ISOTANQUE LLENO">ISOTANQUE LLENO</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="status_servicio">Status del Servicio</Label>
                        <select id="status_servicio" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('status_servicio')}>
                            <option value="POR COORDINAR">POR COORDINAR</option>
                            <option value="EN PROCESO">EN PROCESO</option>
                            <option value="FINALIZADO">FINALIZADO</option>
                        </select>
                    </div>
                </div>
            )}

            {activeTab === 'logistica' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
                    <div className="space-y-2">
                        <Label htmlFor="placa">Placa Unidad</Label>
                        <Input id="placa" placeholder="ABC-123" {...form.register('placa')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="carreta_id">Carreta (Placa)</Label>
                        <div className="flex gap-2">
                            <select id="carreta_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('carreta_id')}>
                                <option value="">Seleccione...</option>
                                {carretas.map(c => <option key={c.id} value={c.id}>{c.placa}</option>)}
                            </select>
                            <Button type="button" variant="outline" size="icon" onClick={() => setCreateModal({ isOpen: true, type: 'carretas', field: 'carreta_id' })}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="conductor_id">Conductor</Label>
                        <div className="flex gap-2">
                            <select id="conductor_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('conductor_id')}>
                                <option value="">Seleccione...</option>
                                {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                            <Button type="button" variant="outline" size="icon" onClick={() => setCreateModal({ isOpen: true, type: 'conductores', field: 'conductor_id' })}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="tipo_carga">Tipo de Carga</Label>
                        <select id="tipo_carga" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('tipo_carga')}>
                            <option value="">Seleccione...</option>
                            <option value="IMO">IMO</option>
                            <option value="GENERAL">GENERAL</option>
                            <option value="IQBF">IQBF</option>
                            <option value="IMO IQBF">IMO IQBF</option>
                            <option value="IMPORTACION">IMPORTACION</option>
                            <option value="MSBU4122925">MSBU4122925</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="tamano_cntr">Tamaño CNTR</Label>
                        <select id="tamano_cntr" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('tamano_cntr')}>
                            <option value="">Seleccione...</option>
                            <option value="20">20</option>
                            <option value="40">40</option>
                            <option value="ITK">ITK</option>
                            <option value="CARGA SUELTA">CARGA SUELTA</option>
                            <option value="IBC">IBC</option>
                            <option value="02*20">02*20</option>
                            <option value="14618">14618</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="contenedor">Contenedor</Label>
                        <Input id="contenedor" placeholder="Número contenedor" {...form.register('contenedor')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="referencia">Referencia / Booking</Label>
                        <Input id="referencia" placeholder="Booking..." {...form.register('referencia')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="agencia_id">Agencia</Label>
                        <div className="flex gap-2">
                            <select id="agencia_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('agencia_id')}>
                                <option value="">Seleccione...</option>
                                {locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                            </select>
                            <Button type="button" variant="outline" size="icon" onClick={() => setCreateModal({ isOpen: true, type: 'locaciones', field: 'agencia_id' })}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="almacen_retiro_id">Almacén de Retiro</Label>
                        <div className="flex gap-2">
                            <select id="almacen_retiro_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('almacen_retiro_id')}>
                                <option value="">Seleccione...</option>
                                {locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                            </select>
                            <Button type="button" variant="outline" size="icon" onClick={() => setCreateModal({ isOpen: true, type: 'locaciones', field: 'almacen_retiro_id' })}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="destino_id">Destino</Label>
                        <div className="flex gap-2">
                            <select id="destino_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('destino_id')}>
                                <option value="">Seleccione...</option>
                                {locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                            </select>
                            <Button type="button" variant="outline" size="icon" onClick={() => setCreateModal({ isOpen: true, type: 'locaciones', field: 'destino_id' })}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'tiempos' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
                    <div className="space-y-2">
                        <Label htmlFor="hora_cita">Hora de Cita</Label>
                        <Input id="hora_cita" type="time" {...form.register('hora_cita')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="llegada_almacen_retiro">Llegada Almacén Retiro</Label>
                        <Input id="llegada_almacen_retiro" type="time" {...form.register('llegada_almacen_retiro')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="salida_almacen_retiro">Salida Almacén Retiro</Label>
                        <Input id="salida_almacen_retiro" type="time" {...form.register('salida_almacen_retiro')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="llegada_cliente">Llegada Cliente</Label>
                        <Input id="llegada_cliente" type="time" {...form.register('llegada_cliente')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="ingreso_planta">Ingreso a Planta</Label>
                        <Input id="ingreso_planta" type="time" {...form.register('ingreso_planta')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="inicio_carga">Inicio Carga/Descarga</Label>
                        <Input id="inicio_carga" type="time" {...form.register('inicio_carga')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="termino_descarga">Término de Descarga</Label>
                        <Input id="termino_descarga" type="time" {...form.register('termino_descarga')} />
                    </div>
                </div>
            )}

            {activeTab === 'cierre' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="almacen_devolucion_id">Almacén de Devolución</Label>
                            <div className="flex gap-2">
                                <select id="almacen_devolucion_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('almacen_devolucion_id')}>
                                    <option value="">Seleccione...</option>
                                    {locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                                </select>
                                <Button type="button" variant="outline" size="icon" onClick={() => setCreateModal({ isOpen: true, type: 'locaciones', field: 'almacen_devolucion_id' })}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="devolucion_vacio">Devolución Vacio</Label>
                            <select id="devolucion_vacio" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('devolucion_vacio')}>
                                <option value="">Seleccione...</option>
                                <option value="DEVUELTO POR EL CONDUCTOR">DEVUELTO POR EL CONDUCTOR</option>
                                <option value="DEVUELTO POR OTRO CONDUCTOR">DEVUELTO POR OTRO CONDUCTOR</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="conductor_devolucion_id">Conductor Devolución</Label>
                            <div className="flex gap-2">
                                <select id="conductor_devolucion_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('conductor_devolucion_id')}>
                                    <option value="">Seleccione...</option>
                                    {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                                <Button type="button" variant="outline" size="icon" onClick={() => setCreateModal({ isOpen: true, type: 'conductores', field: 'conductor_devolucion_id' })}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="hora_devolucion">Hora Devolución</Label>
                            <Input id="hora_devolucion" type="time" {...form.register('hora_devolucion')} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="linea_amarilla">Línea Amarilla (S/)</Label>
                            <Input id="linea_amarilla" type="number" step="0.01" {...form.register('linea_amarilla')} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="peajes">Peajes (S/)</Label>
                            <Input id="peajes" type="number" step="0.01" {...form.register('peajes')} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="adicionales">Adicionales (S/)</Label>
                            <Input id="adicionales" type="number" step="0.01" {...form.register('adicionales')} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pago_conductor">Pago Conductor (S/)</Label>
                            <Input id="pago_conductor" type="number" step="0.01" {...form.register('pago_conductor')} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="factura">Factura</Label>
                            <Input id="factura" placeholder="F001-XXXX" {...form.register('factura')} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="estado_factura">Estado Factura</Label>
                            <select id="estado_factura" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register('estado_factura')}>
                                <option value="PENDIENTE">PENDIENTE</option>
                                <option value="FACTURADO">FACTURADO</option>
                                <option value="PAGADO">PAGADO</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="observaciones">Observaciones</Label>
                        <Input id="observaciones" placeholder="Detalles extra..." {...form.register('observaciones')} />
                    </div>
                </div>
            )}

            <div className="flex justify-end pt-4 border-t">
                <Button type="submit" disabled={loading}>
                    {loading ? 'Guardando...' : 'Guardar Registro'}
                </Button>
            </div>

            <Dialog open={createModal.isOpen} onOpenChange={(open) => !open && setCreateModal({ isOpen: false, type: null, field: null })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Registrar {createModal.type === 'carretas' ? 'nueva Carreta' :
                                createModal.type === 'clientes' ? 'nuevo Cliente' :
                                    createModal.type === 'conductores' ? 'nuevo Conductor' :
                                        'nueva Locación (Agencia/Almacén)'}
                        </DialogTitle>
                        <DialogDescription>
                            Ingrese el dato. Esto se guardará en la base de datos y estará disponible para futuros usos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="entity_value">
                                {createModal.type === 'carretas' ? 'Placa de la Carreta (Ej: ABC-123)' : 'Nombre'}
                            </Label>
                            <Input
                                id="entity_value"
                                value={createInputValue}
                                onChange={(e) => setCreateInputValue(e.target.value)}
                                placeholder="Escriba aquí..."
                                autoFocus
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateModal({ isOpen: false, type: null, field: null })} disabled={isCreatingEntity}>Cancelar</Button>
                        <Button onClick={handleCreateEntity} disabled={isCreatingEntity || !createInputValue.trim()}>
                            {isCreatingEntity ? 'Guardando...' : 'Crear y Seleccionar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </form>
    )
}
