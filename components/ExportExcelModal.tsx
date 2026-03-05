'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, FileSpreadsheet, AlertTriangle, Loader2, Calendar as CalendarIcon, Users, Settings2, Columns, Tags, Info, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

interface ExportExcelModalProps {
    buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    buttonSize?: "default" | "sm" | "lg" | "icon"
    buttonClass?: string
}

export function ExportExcelModal({ buttonVariant = "default", buttonSize = "sm", buttonClass = "" }: ExportExcelModalProps) {
    const supabase = createClient()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)

    const [dateRangeType, setDateRangeType] = useState('this_month') // 'custom', 'this_month', 'last_month', 'all'
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
    const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

    const [users, setUsers] = useState<{ id: string, full_name: string }[]>([])
    const [selectedUserFilter, setSelectedUserFilter] = useState('all') // 'all', 'me', or user.id
    const [currentUser, setCurrentUser] = useState<any>(null)

    const [categories, setCategories] = useState<{ id: string, categoria_nombre: string }[]>([])
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])

    // Options
    const [includeUploadTime, setIncludeUploadTime] = useState(true)
    const [includeUploader, setIncludeUploader] = useState(true)
    const [includeCategoryInfo, setIncludeCategoryInfo] = useState(true)
    const [includeImages, setIncludeImages] = useState(false)

    // Standard columns
    const [columns, setColumns] = useState({
        fecha_y_hora_pago: true,
        beneficiario: true,
        monto: true,
        moneda: true,
        metodo_pago: true,
        tipo_documento: true,
        numero_documento: true,
        banco_cuenta: true,
        ruc: true,
        descripcion: true,
    })

    useEffect(() => {
        if (open) {
            loadInitialData()
        }
    }, [open])

    useEffect(() => {
        const now = new Date()
        if (dateRangeType === 'this_month') {
            setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'))
            setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'))
        } else if (dateRangeType === 'last_month') {
            const lastMonth = subMonths(now, 1)
            setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'))
            setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'))
        } else if (dateRangeType === 'all') {
            setStartDate('')
            setEndDate('')
        }
    }, [dateRangeType])

    const loadInitialData = async () => {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUser(user)

            const [usersRes, catsRes] = await Promise.all([
                supabase.from('user_profiles').select('id, full_name'),
                supabase.from('categorias').select('id, categoria_nombre')
            ])

            if (usersRes.data) setUsers(usersRes.data)
            if (catsRes.data) {
                setCategories(catsRes.data)
                setSelectedCategories(catsRes.data.map(c => c.id)) // All selected by default
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleToggleColumn = (col: keyof typeof columns) => {
        setColumns(prev => ({ ...prev, [col]: !prev[col] }))
    }

    const handleSelectAllCategories = (select: boolean) => {
        if (select) {
            setSelectedCategories(categories.map(c => c.id))
        } else {
            setSelectedCategories([])
        }
    }

    const handleToggleCategory = (id: string) => {
        setSelectedCategories(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        )
    }

    const handleExport = async () => {
        setExporting(true)
        try {
            let query = supabase
                .from('registros')
                .select(`
          *,
          categoria:categoria_id (
            id,
            categoria_id_texto,
            categoria_nombre
          )
        `)
                .order('fecha_y_hora_pago', { ascending: false })

            // Date filter
            if (dateRangeType !== 'all') {
                if (startDate) query = query.gte('fecha_y_hora_pago', startDate)
                if (endDate) query = query.lte('fecha_y_hora_pago', `${endDate}T23:59:59`)
            }

            // User filter
            if (selectedUserFilter === 'me' && currentUser) {
                query = query.eq('creado_por', currentUser.id)
            } else if (selectedUserFilter !== 'all') {
                query = query.eq('creado_por', selectedUserFilter)
            }

            // Categories filter
            // If not all categories are selected, apply filter
            if (selectedCategories.length === 0) {
                alert("Debe seleccionar al menos una categoría.")
                setExporting(false)
                return
            }

            if (selectedCategories.length !== categories.length) {
                query = query.in('categoria_id', selectedCategories)
            }

            const { data: registros, error } = await query

            if (error) throw error

            if (!registros || registros.length === 0) {
                alert("No hay registros para exportar con los filtros seleccionados.")
                setExporting(false)
                return
            }

            // Formatear datos para Excel
            const userMap = new Map(users.map(u => [u.id, u.full_name]))

            // Crear libro de Excel con ExcelJS
            const workbook = new ExcelJS.Workbook()
            const worksheet = workbook.addWorksheet('Pagos')

            // Definir columnas y encabezados
            const columnsConfig = []
            if (columns.fecha_y_hora_pago) columnsConfig.push({ header: 'Fecha y Hora Pago', key: 'fecha_y_hora_pago', width: 22 })
            if (columns.beneficiario) columnsConfig.push({ header: 'Beneficiario', key: 'beneficiario', width: 35 })
            if (columns.monto) columnsConfig.push({ header: 'Monto', key: 'monto', width: 12 })
            if (columns.moneda) columnsConfig.push({ header: 'Moneda', key: 'moneda', width: 12 })
            if (columns.metodo_pago) columnsConfig.push({ header: 'Método de Pago', key: 'metodo_pago', width: 20 })
            if (columns.tipo_documento) columnsConfig.push({ header: 'Tipo de Documento', key: 'tipo_documento', width: 20 })
            if (columns.numero_documento) columnsConfig.push({ header: 'Nro Documento', key: 'numero_documento', width: 18 })
            if (columns.banco_cuenta) columnsConfig.push({ header: 'Banco/Cuenta', key: 'banco_cuenta', width: 25 })
            if (columns.ruc) columnsConfig.push({ header: 'RUC', key: 'ruc', width: 15 })
            if (columns.descripcion) columnsConfig.push({ header: 'Descripción', key: 'descripcion', width: 45 })

            if (includeCategoryInfo) {
                columnsConfig.push({ header: 'Categoría ID', key: 'cat_id', width: 25 })
                columnsConfig.push({ header: 'Categoría Nombre', key: 'cat_nombre', width: 25 })
                columnsConfig.push({ header: 'Datos Dinámicos', key: 'datos_dinamicos', width: 65 })
            }

            if (includeUploadTime) columnsConfig.push({ header: 'Fecha Subida (Sistema)', key: 'fecha_subida', width: 22 })
            if (includeUploader) columnsConfig.push({ header: 'Subido Por', key: 'subido_por', width: 25 })
            if (includeImages) columnsConfig.push({ header: 'Imágenes (URLs)', key: 'imagenes', width: 50 })

            worksheet.columns = columnsConfig

            // Agregar filas
            registros.forEach((r, index) => {
                const rowData: any = {}
                if (columns.fecha_y_hora_pago) rowData.fecha_y_hora_pago = r.fecha_y_hora_pago ? format(new Date(r.fecha_y_hora_pago), 'dd/MM/yyyy HH:mm') : ''
                if (columns.beneficiario) rowData.beneficiario = r.beneficiario || ''
                if (columns.monto) rowData.monto = r.monto || 0
                if (columns.moneda) rowData.moneda = (r.moneda || 'soles').toUpperCase()
                if (columns.metodo_pago) rowData.metodo_pago = r.metodo_pago || ''
                if (columns.tipo_documento) rowData.tipo_documento = r.tipo_documento || ''
                if (columns.numero_documento) rowData.numero_documento = r.numero_documento || ''
                if (columns.banco_cuenta) rowData.banco_cuenta = r.banco_cuenta || ''
                if (columns.ruc) rowData.ruc = r.ruc || ''
                if (columns.descripcion) rowData.descripcion = r.descripcion || ''

                if (includeCategoryInfo) {
                    rowData.cat_id = r.categoria?.categoria_id_texto || ''
                    rowData.cat_nombre = r.categoria?.categoria_nombre || ''
                    rowData.datos_dinamicos = r.datos_dinamicos ? Object.entries(r.datos_dinamicos).map(([k, v]) => `${k}: ${v}`).join(' | ') : ''
                }

                if (includeUploadTime) rowData.fecha_subida = r.created_at ? format(new Date(r.created_at), 'dd/MM/yyyy HH:mm') : ''
                if (includeUploader) rowData.subido_por = userMap.get(r.creado_por) || 'Usuario desconocido'
                if (includeImages) rowData.imagenes = (r.comprobantes && r.comprobantes.length > 0) ? r.comprobantes.join(', ') : 'Sin imágenes'

                const row = worksheet.addRow(rowData)

                // Estilos para filas alternas
                if (index % 2 === 1) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF2F2F2' }
                    }
                }
            })

            // Estilos para la cabecera (Azul Marino Corporativo)
            const headerRow = worksheet.getRow(1)
            headerRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1A2332' } // Color #1a2332
                }
                cell.font = {
                    color: { argb: 'FFFFFFFF' },
                    bold: true,
                    size: 11
                }
                cell.alignment = { vertical: 'middle', horizontal: 'center' }
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'FFBDC3C7' } }
                }
            })
            headerRow.height = 25

            // Alineación para todas las celdas
            worksheet.eachRow((row, rowNumber) => {
                row.height = 25 // Forzar altura uniforme para todas las filas
                if (rowNumber > 1) {
                    row.eachCell((cell) => {
                        cell.alignment = { vertical: 'middle', wrapText: false } // Deshabilitar wrap para mantener altura fija
                        cell.border = {
                            bottom: { style: 'thin', color: { argb: 'FFECF0F1' } }
                        }
                    })
                }
            })

            // Generar archivo y descargar
            const buffer = await workbook.xlsx.writeBuffer()
            const fileName = `Exportacion_Pagos_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`
            saveAs(new Blob([buffer]), fileName)

            setOpen(false)

        } catch (err: any) {
            console.error('Error exportando Excel:', err)
            alert("Hubo un error al exportar: " + err.message)
        } finally {
            setExporting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant={buttonVariant} size={buttonSize} className={buttonClass}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Exportar Excel
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-[95vw] lg:max-w-[1100px] max-h-[90vh] w-full overflow-y-auto p-0 gap-0">
                <DialogHeader className="p-6 pb-4 border-b bg-muted/20 sticky top-0 z-10 backdrop-blur-sm">
                    <DialogTitle className="flex items-center gap-2 text-primary text-xl">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <FileSpreadsheet className="h-5 w-5 text-primary" />
                        </div>
                        Exportación Personalizada
                    </DialogTitle>
                    <DialogDescription className="text-base mt-1.5">
                        Configura detalladamente los parámetros y filtros para descargar tu reporte de pagos en formato Excel.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex flex-col justify-center items-center py-20 gap-4">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="text-muted-foreground font-medium">Cargando opciones...</p>
                    </div>
                ) : (
                    <div className="p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                            {/* Columna Izquierda (Filtros Principales) */}
                            <div className="lg:col-span-7 space-y-6">

                                {/* Filtros Básicos (Fecha y Usuario) */}
                                <div className="bg-white rounded-xl border shadow-xs overflow-hidden">
                                    <div className="p-4 border-b bg-muted/10">
                                        <h3 className="font-semibold flex items-center gap-2 text-foreground">
                                            <CalendarIcon className="h-4 w-4 text-primary" />
                                            Filtros Principales
                                        </h3>
                                    </div>
                                    <div className="p-5 space-y-5">
                                        <div className="space-y-3">
                                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Periodo de Tiempo</Label>
                                            <Select value={dateRangeType} onValueChange={setDateRangeType}>
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Selecciona un rango" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="this_month">Este mes</SelectItem>
                                                    <SelectItem value="last_month">Mes pasado</SelectItem>
                                                    <SelectItem value="custom">Personalizado</SelectItem>
                                                    <SelectItem value="all">Todo el historial</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            {dateRangeType === 'custom' && (
                                                <div className="flex items-center gap-3 mt-3 animate-in fade-in slide-in-from-top-1">
                                                    <div className="flex-1 space-y-1.5">
                                                        <Label className="text-xs text-muted-foreground">Desde</Label>
                                                        <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-10" />
                                                    </div>
                                                    <div className="flex-1 space-y-1.5">
                                                        <Label className="text-xs text-muted-foreground">Hasta</Label>
                                                        <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-10" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="h-px bg-border w-full" />

                                        <div className="space-y-3">
                                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                <Users className="h-3.5 w-3.5" />
                                                Filtrar por Usuario
                                            </Label>
                                            <Select value={selectedUserFilter} onValueChange={setSelectedUserFilter}>
                                                <SelectTrigger className="w-full h-10">
                                                    <SelectValue placeholder="Seleccionar usuario" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Todos los usuarios</SelectItem>
                                                    <SelectItem value="me">Solo mis registros</SelectItem>
                                                    {users.map(u => (
                                                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                {/* Metadatos Adicionales */}
                                <div className="bg-white rounded-xl border shadow-xs overflow-hidden">
                                    <div className="p-4 border-b bg-muted/10">
                                        <h3 className="font-semibold flex items-center gap-2 text-foreground">
                                            <Settings2 className="h-4 w-4 text-primary" />
                                            Metadata Adicional
                                        </h3>
                                    </div>
                                    <div className="p-3">
                                        <div className="space-y-1">
                                            <label className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors">
                                                <Checkbox id="chk-upload-time" checked={includeUploadTime} onCheckedChange={(c) => setIncludeUploadTime(!!c)} className="mt-0.5" />
                                                <div className="space-y-1">
                                                    <span className="text-sm font-medium leading-none block">Incluir fecha y hora de subida</span>
                                                    <span className="text-xs text-muted-foreground block">Muestra exactamente cuándo se registró en el sistema</span>
                                                </div>
                                            </label>

                                            <label className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors">
                                                <Checkbox id="chk-uploader" checked={includeUploader} onCheckedChange={(c) => setIncludeUploader(!!c)} className="mt-0.5" />
                                                <div className="space-y-1">
                                                    <span className="text-sm font-medium leading-none block">Incluir nombre de quien subió el pago</span>
                                                    <span className="text-xs text-muted-foreground block">Agrega la columna del autor del registro</span>
                                                </div>
                                            </label>

                                            <label className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors">
                                                <Checkbox id="chk-cat-info" checked={includeCategoryInfo} onCheckedChange={(c) => setIncludeCategoryInfo(!!c)} className="mt-0.5" />
                                                <div className="space-y-1">
                                                    <span className="text-sm font-medium leading-none block">Incluir toda la información de la categoría</span>
                                                    <span className="text-xs text-muted-foreground block">Incluye Nombre, ID y los datos obligatorios específicos</span>
                                                </div>
                                            </label>

                                            <div className="mx-3 mt-2 mb-1 border rounded-lg bg-orange-50/50 border-orange-200/60 overflow-hidden">
                                                <label className="flex items-start space-x-3 p-3 cursor-pointer hover:bg-orange-50 transition-colors">
                                                    <Checkbox id="chk-images" checked={includeImages} onCheckedChange={(c) => setIncludeImages(!!c)} className="mt-0.5 border-orange-400 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500 text-white" />
                                                    <div className="space-y-1.5">
                                                        <span className="text-sm font-semibold text-orange-900 flex items-center gap-1.5">
                                                            <ImageIcon className="h-3.5 w-3.5" />
                                                            Incluir comprobantes / URLs de imágenes
                                                        </span>
                                                        <p className="text-xs text-orange-700/90 leading-relaxed max-w-[95%]">
                                                            Precaución: Seleccionar esta opción puede hacer que el archivo resultante sea considerablemente más pesado si estás exportando muchos registros.
                                                        </p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>

                            {/* Columna Derecha (Columnas y Categorías) */}
                            <div className="lg:col-span-5 space-y-6">

                                {/* Columnas Visibles */}
                                <div className="bg-white rounded-xl border shadow-xs overflow-hidden">
                                    <div className="p-4 border-b bg-muted/10 flex items-center justify-between">
                                        <h3 className="font-semibold flex items-center gap-2 text-foreground">
                                            <Columns className="h-4 w-4 text-primary" />
                                            Columnas Estándar
                                        </h3>
                                    </div>
                                    <div className="p-4">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                            {[
                                                { id: 'col-fecha', state: columns.fecha_y_hora_pago, action: 'fecha_y_hora_pago', label: 'Fecha del Pago' },
                                                { id: 'col-monto', state: columns.monto, action: 'monto', label: 'Monto' },
                                                { id: 'col-beneficiario', state: columns.beneficiario, action: 'beneficiario', label: 'Beneficiario' },
                                                { id: 'col-moneda', state: columns.moneda, action: 'moneda', label: 'Moneda' },
                                                { id: 'col-metodo', state: columns.metodo_pago, action: 'metodo_pago', label: 'Método Pago' },
                                                { id: 'col-tipo_doc', state: columns.tipo_documento, action: 'tipo_documento', label: 'Tipo Documento' },
                                                { id: 'col-num_doc', state: columns.numero_documento, action: 'numero_documento', label: 'Nro Documento' },
                                                { id: 'col-banco', state: columns.banco_cuenta, action: 'banco_cuenta', label: 'Banco / Cta' },
                                                { id: 'col-ruc', state: columns.ruc, action: 'ruc', label: 'RUC' },
                                                { id: 'col-desc', state: columns.descripcion, action: 'descripcion', label: 'Descripción' }
                                            ].map((item) => (
                                                <label key={item.id} className="flex items-center space-x-2.5 p-1.5 rounded hover:bg-muted/40 cursor-pointer transition-colors group">
                                                    <Checkbox
                                                        id={item.id}
                                                        checked={item.state}
                                                        onCheckedChange={() => handleToggleColumn(item.action as keyof typeof columns)}
                                                    />
                                                    <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors select-none">{item.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Selección de Categorías */}
                                <div className="bg-white rounded-xl border shadow-xs overflow-hidden flex flex-col h-[320px]">
                                    <div className="p-4 border-b bg-muted/10 flex items-center justify-between shrink-0">
                                        <h3 className="font-semibold flex items-center gap-2 text-foreground">
                                            <Tags className="h-4 w-4 text-primary" />
                                            Filtro de Categorías
                                        </h3>
                                        <div className="flex items-center space-x-1 bg-white rounded-md border border-border/50 p-0.5 shadow-sm">
                                            <button
                                                onClick={() => handleSelectAllCategories(true)}
                                                className={`text-[10px] font-medium px-2 py-1 rounded transition-colors ${selectedCategories.length === categories.length && categories.length > 0 ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
                                            >
                                                Todas
                                            </button>
                                            <button
                                                onClick={() => handleSelectAllCategories(false)}
                                                className={`text-[10px] font-medium px-2 py-1 rounded transition-colors ${selectedCategories.length === 0 ? 'bg-muted text-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                                            >
                                                Ninguna
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                                        <div className="space-y-1">
                                            {categories.map(c => (
                                                <label key={c.id} className={`flex items-center space-x-3 p-2.5 rounded-lg cursor-pointer transition-all border border-transparent ${selectedCategories.includes(c.id) ? 'bg-primary/5 border-primary/10' : 'hover:bg-muted/50'}`}>
                                                    <Checkbox
                                                        id={`cat-${c.id}`}
                                                        checked={selectedCategories.includes(c.id)}
                                                        onCheckedChange={() => handleToggleCategory(c.id)}
                                                    />
                                                    <span className={`text-sm select-none ${selectedCategories.includes(c.id) ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
                                                        {c.categoria_nombre}
                                                    </span>
                                                </label>
                                            ))}
                                            {categories.length === 0 && (
                                                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                                    <Info className="h-8 w-8 text-muted-foreground/50 mb-2" />
                                                    <span className="text-sm">No hay categorías disponibles</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-3 border-t bg-muted/5 shrink-0">
                                        <div className="text-xs text-center text-muted-foreground">
                                            {selectedCategories.length} de {categories.length} categorías seleccionadas
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}

                <div className="p-4 border-t bg-muted/10 sticky bottom-0 z-10 flex justify-end gap-3 backdrop-blur-sm">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={exporting} className="w-32">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleExport}
                        disabled={exporting || loading || selectedCategories.length === 0}
                        className="w-48 font-semibold shadow-md"
                    >
                        {exporting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4 mr-2" />
                                Generar Excel
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
