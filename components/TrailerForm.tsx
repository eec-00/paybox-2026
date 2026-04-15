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
import { Plus, Satellite, Link2, RefreshCw, CheckCircle, AlertCircle, Copy, ExternalLink } from "lucide-react"

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
    // Campos GPS Navitel
    navitel_tracker_id: z.string().optional().nullable(),
    navitel_tracker_label: z.string().optional().nullable(),
    navitel_zone_id: z.string().optional().nullable(),
    navitel_zone_name: z.string().optional().nullable(),
})

type TrailerFormValues = z.infer<typeof trailerSchema>

interface NavitelVehicle { id: number; label: string }
interface NavitelZone { id: number; name: string }

export function TrailerForm({ onSuccess, initialData, onCancel }: { onSuccess: () => void, initialData?: any, onCancel?: () => void }) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState('general')
    const supabase = createClient()

    const [clientes, setClientes] = useState<any[]>([])
    const [carretas, setCarretas] = useState<any[]>([])
    const [conductores, setConductores] = useState<any[]>([])
    const [locaciones, setLocaciones] = useState<any[]>([])

    // Navitel GPS state
    const [navitelVehicles, setNavitelVehicles] = useState<NavitelVehicle[]>([])
    const [navitelZones, setNavitelZones] = useState<NavitelZone[]>([])
    const [navitelLoading, setNavitelLoading] = useState(false)
    const [navitelError, setNavitelError] = useState<string | null>(null)
    const [creatingGeolink, setCreatingGeolink] = useState(false)
    const [geolinkPreview, setGeolinkPreview] = useState<{ url: string; expires: string } | null>(null)
    const [copiedGeolink, setCopiedGeolink] = useState(false)

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
            navitel_tracker_id: '',
            navitel_tracker_label: '',
            navitel_zone_id: '',
            navitel_zone_name: '',
        },
    })

    // Reset form when initialData changes
    useEffect(() => {
        if (initialData) {
            form.reset({
                ...form.getValues(),
                ...initialData,
                fecha: initialData.fecha ? new Date(initialData.fecha).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                linea_amarilla: initialData.linea_amarilla?.toString() || '',
                peajes: initialData.peajes?.toString() || '',
                adicionales: initialData.adicionales?.toString() || '',
                pago_conductor: initialData.pago_conductor?.toString() || '',
                navitel_tracker_id: initialData.navitel_tracker_id?.toString() || '',
                navitel_tracker_label: initialData.navitel_tracker_label || '',
                navitel_zone_id: initialData.navitel_zone_id?.toString() || '',
                navitel_zone_name: initialData.navitel_zone_name || '',
            })
            // Pre-fill geolink preview if exists and not expired
            if (initialData.geolink_url && initialData.geolink_expires_at) {
                const expires = new Date(initialData.geolink_expires_at)
                if (expires > new Date()) {
                    setGeolinkPreview({
                        url: initialData.geolink_url,
                        expires: expires.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
                    })
                }
            }
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
                console.error("No se pudieron cargar los datos maestros:", err)
            }
        }
        fetchData()
        fetchNavitelData()
    }, [supabase])

    async function fetchNavitelData() {
        setNavitelLoading(true)
        setNavitelError(null)
        try {
            const [vRes, zRes] = await Promise.all([
                fetch('/api/navitel'),
                fetch('/api/navitel/zones'),
            ])
            const vData = await vRes.json()
            const zData = await zRes.json()
            if (vData.success) setNavitelVehicles(vData.vehicles || [])
            if (zData.success) setNavitelZones(zData.zones || [])
            if (!vData.success && !zData.success) {
                setNavitelError('No se pudo conectar con Navitel GPS')
            }
        } catch {
            setNavitelError('Error de conexión con Navitel GPS')
        } finally {
            setNavitelLoading(false)
        }
    }

    const handleTrackerChange = (trackerId: string) => {
        form.setValue('navitel_tracker_id', trackerId)
        const vehicle = navitelVehicles.find(v => v.id.toString() === trackerId)
        form.setValue('navitel_tracker_label', vehicle?.label || '')
        // Al cambiar el tracker, limpiar el geolink previo para regenerarlo al guardar
        if (trackerId !== initialData?.navitel_tracker_id?.toString()) {
            setGeolinkPreview(null)
        }
    }

    const handleZoneChange = (zoneId: string) => {
        form.setValue('navitel_zone_id', zoneId)
        const zone = navitelZones.find(z => z.id.toString() === zoneId)
        form.setValue('navitel_zone_name', zone?.name || '')
    }

    const handleCreateGeolink = async () => {
        const trackerId = form.getValues('navitel_tracker_id')
        const trackerLabel = form.getValues('navitel_tracker_label')
        if (!trackerId) return

        setCreatingGeolink(true)
        try {
            const res = await fetch('/api/navitel/geolink', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracker_id: Number(trackerId), label: trackerLabel || 'Trailer' }),
            })
            const data = await res.json()
            if (data.success && data.data?.hash) {
                const url = `https://control.navitelgps.com/ls/${data.data.hash}`
                const expires = data.data.lifetime?.to
                    ? new Date(data.data.lifetime.to).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
                    : '6h'
                setGeolinkPreview({ url, expires })
            }
        } catch {
            // Silencioso — el form aún se puede guardar sin geolink
        } finally {
            setCreatingGeolink(false)
        }
    }

    const copyGeolink = async () => {
        if (!geolinkPreview?.url) return
        await navigator.clipboard.writeText(geolinkPreview.url)
        setCopiedGeolink(true)
        setTimeout(() => setCopiedGeolink(false), 2000)
    }

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
            if (createModal.type === 'clientes') setClientes(prev => [...prev, data])
            if (createModal.type === 'carretas') setCarretas(prev => [...prev, data])
            if (createModal.type === 'conductores') setConductores(prev => [...prev, data])
            if (createModal.type === 'locaciones') setLocaciones(prev => [...prev, data])
            form.setValue(createModal.field as any, data.id)
            setCreateModal({ isOpen: false, type: null, field: null })
            setCreateInputValue('')
        }
        setIsCreatingEntity(false)
    }

    const onSubmit = async (data: TrailerFormValues) => {
        setLoading(true)
        setError(null)

        const parseNumber = (val: string | undefined) => val ? parseFloat(val) : null
        const parseFk = (val: string | undefined | null) => val ? val : null
        const parseTime = (val: string | undefined | null) => (val && val.trim() !== '') ? val : null
        const parseIntFk = (val: string | undefined | null) => (val && val.trim() !== '') ? parseInt(val) : null

        // Construir payload base
        const payload: any = {
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
            hora_cita: parseTime(data.hora_cita),
            hora_devolucion: parseTime(data.hora_devolucion),
            llegada_almacen_retiro: parseTime(data.llegada_almacen_retiro),
            salida_almacen_retiro: parseTime(data.salida_almacen_retiro),
            llegada_cliente: parseTime(data.llegada_cliente),
            ingreso_planta: parseTime(data.ingreso_planta),
            inicio_carga: parseTime(data.inicio_carga),
            termino_descarga: parseTime(data.termino_descarga),
            // GPS Navitel
            navitel_tracker_id: parseIntFk(data.navitel_tracker_id),
            navitel_tracker_label: data.navitel_tracker_label || null,
            navitel_zone_id: parseIntFk(data.navitel_zone_id),
            navitel_zone_name: data.navitel_zone_name || null,
        }

        // Crear geoenlace automáticamente si hay tracker seleccionado
        const hasTracker = !!payload.navitel_tracker_id
        const geolinkExpired = !initialData?.geolink_expires_at || new Date(initialData.geolink_expires_at) < new Date()
        const trackerChanged = payload.navitel_tracker_id !== initialData?.navitel_tracker_id

        if (hasTracker && (geolinkExpired || trackerChanged)) {
            try {
                const glRes = await fetch('/api/navitel/geolink', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tracker_id: payload.navitel_tracker_id,
                        label: payload.navitel_tracker_label || payload.placa || 'Trailer',
                    }),
                })
                const glData = await glRes.json()
                if (glData.success && glData.data?.hash) {
                    payload.geolink_hash = glData.data.hash
                    payload.geolink_url = `https://control.navitelgps.com/ls/${glData.data.hash}`
                    payload.geolink_expires_at = glData.data.lifetime?.to || null
                    // Actualizar preview
                    setGeolinkPreview({
                        url: payload.geolink_url,
                        expires: glData.data.lifetime?.to
                            ? new Date(glData.data.lifetime.to).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
                            : '6h',
                    })
                }
            } catch {
                // No bloquear el guardado si falla el geolink
            }
        } else if (!hasTracker) {
            // Si se quitó el tracker, limpiar geolink
            payload.geolink_hash = null
            payload.geolink_url = null
            payload.geolink_expires_at = null
        }

        let saveError
        if (initialData?.id) {
            const { error } = await supabase.from('servicios_trailers').update(payload).eq('id', initialData.id)
            saveError = error
        } else {
            const { error } = await supabase.from('servicios_trailers').insert([payload])
            saveError = error
        }

        if (saveError) {
            console.error(saveError)
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
        setGeolinkPreview(null)
        onSuccess()
    }

    const selectedTrackerId = form.watch('navitel_tracker_id')
    const geolinkStillValid = initialData?.geolink_expires_at && new Date(initialData.geolink_expires_at) > new Date()

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex items-center justify-between border-b border-primary/20 mb-6">
                <div className="flex overflow-x-auto gap-4 px-2">
                    <button type="button" onClick={() => setActiveTab('general')} className={`px-4 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>General</button>
                    <button type="button" onClick={() => setActiveTab('logistica')} className={`px-4 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'logistica' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Logística</button>
                    <button type="button" onClick={() => setActiveTab('gps')} className={`px-4 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'gps' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                        <Satellite className="h-3.5 w-3.5" />
                        GPS
                        {selectedTrackerId && <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />}
                    </button>
                    <button type="button" onClick={() => setActiveTab('tiempos')} className={`px-4 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'tiempos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Tiempos</button>
                    <button type="button" onClick={() => setActiveTab('cierre')} className={`px-4 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'cierre' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Costos y Cierre</button>
                </div>
                {onCancel && (
                    <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="mb-2 mr-2 text-muted-foreground hover:text-foreground">
                        Cancelar
                    </Button>
                )}
            </div>

            {error && (
                <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm mb-4">
                    {error}
                </div>
            )}

            {/* TAB: GENERAL */}
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

            {/* TAB: LOGÍSTICA */}
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

            {/* TAB: GPS */}
            {activeTab === 'gps' && (
                <div className="space-y-6 animate-in fade-in">
                    {navitelError && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{navitelError} — Los campos GPS no están disponibles.</span>
                            <Button type="button" variant="ghost" size="sm" onClick={fetchNavitelData} className="ml-auto h-7 text-amber-700">
                                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reintentar
                            </Button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Rastreador GPS */}
                        <div className="space-y-2">
                            <Label htmlFor="navitel_tracker_id" className="flex items-center gap-1.5">
                                <Satellite className="h-4 w-4 text-primary" />
                                Rastreador GPS (Navitel)
                            </Label>
                            <div className="flex gap-2">
                                <select
                                    id="navitel_tracker_id"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    disabled={navitelLoading}
                                    value={form.watch('navitel_tracker_id') || ''}
                                    onChange={(e) => handleTrackerChange(e.target.value)}
                                >
                                    <option value="">{navitelLoading ? 'Cargando...' : 'Sin rastreador'}</option>
                                    {navitelVehicles.map(v => (
                                        <option key={v.id} value={v.id.toString()}>{v.label}</option>
                                    ))}
                                </select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={fetchNavitelData}
                                    disabled={navitelLoading}
                                    title="Actualizar lista de rastreadores"
                                >
                                    <RefreshCw className={`h-4 w-4 ${navitelLoading ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Al guardar, se generará automáticamente un geoenlace de seguimiento válido por 6 horas.
                            </p>
                        </div>

                        {/* Geocerca de llegada */}
                        <div className="space-y-2">
                            <Label htmlFor="navitel_zone_id" className="flex items-center gap-1.5">
                                Geocerca de Llegada
                                <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                            </Label>
                            <select
                                id="navitel_zone_id"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                disabled={navitelLoading}
                                value={form.watch('navitel_zone_id') || ''}
                                onChange={(e) => handleZoneChange(e.target.value)}
                            >
                                <option value="">{navitelLoading ? 'Cargando...' : 'Sin geocerca asignada'}</option>
                                {navitelZones.map(z => (
                                    <option key={z.id} value={z.id.toString()}>{z.name}</option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Define la zona donde se detectará la llegada del vehículo. Se usará para registrar la hora automáticamente.
                            </p>
                        </div>
                    </div>

                    {/* Geoenlace */}
                    {selectedTrackerId && (
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Link2 className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-sm">Geoenlace de Seguimiento</span>
                                </div>
                                {!geolinkPreview && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCreateGeolink}
                                        disabled={creatingGeolink}
                                        className="h-8"
                                    >
                                        {creatingGeolink ? (
                                            <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creando...</>
                                        ) : (
                                            <><Link2 className="h-3.5 w-3.5 mr-1.5" />Crear ahora</>
                                        )}
                                    </Button>
                                )}
                            </div>

                            {geolinkPreview ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 p-2 bg-green-50 text-green-700 rounded-md text-xs">
                                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                                        <span>Activo hasta las {geolinkPreview.expires}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input value={geolinkPreview.url} readOnly className="text-xs h-8" />
                                        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copyGeolink} title="Copiar">
                                            {copiedGeolink ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                                        </Button>
                                        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => window.open(geolinkPreview.url, '_blank')} title="Abrir">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {geolinkStillValid
                                        ? 'Se mantendrá el geoenlace actual al guardar (aún vigente).'
                                        : 'Se generará automáticamente al guardar el servicio.'}
                                </p>
                            )}
                        </div>
                    )}

                    {!selectedTrackerId && !navitelError && (
                        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                            <Satellite className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            Selecciona un rastreador para habilitar el seguimiento GPS
                        </div>
                    )}
                </div>
            )}

            {/* TAB: TIEMPOS */}
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

            {/* TAB: COSTOS Y CIERRE */}
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

            {/* Modal quick-create */}
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
