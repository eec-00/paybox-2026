'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileSpreadsheet, Loader2, Calendar as CalendarIcon, Users, Truck, Filter } from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import type { GastoConductor } from '@/lib/types/database.types'

export type DatosServicio = { placa: string | null; contenedor: string | null; guia: string | null }

// La semana operativa de la empresa va de sábado a viernes
const WEEK_OPTS = { weekStartsOn: 6 as const }

type Periodo = 'semana_actual' | 'semana_anterior' | 'semana' | 'mes_actual' | 'mes_anterior' | 'mes' | 'rango' | 'todo'

function etiquetaSemana(inicio: Date) {
    const fin = addDays(inicio, 6)
    return `Sáb ${format(inicio, 'dd/MM')} – Vie ${format(fin, 'dd/MM/yyyy')}`
}

interface Props {
    gastos: GastoConductor[]
    datosServicio: Record<number, DatosServicio>
}

export function GastosConductorExportModal({ gastos, datosServicio }: Props) {
    const [open, setOpen] = useState(false)
    const [exporting, setExporting] = useState(false)

    const [periodo, setPeriodo] = useState<Periodo>('semana_actual')
    const semanas = useMemo(() => {
        const actual = startOfWeek(new Date(), WEEK_OPTS)
        return Array.from({ length: 26 }, (_, i) => subWeeks(actual, i))
    }, [])
    const [semanaSel, setSemanaSel] = useState(format(semanas[1], 'yyyy-MM-dd'))
    const [mesSel, setMesSel] = useState(format(new Date(), 'yyyy-MM'))
    const [desde, setDesde] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
    const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))

    const [conductoresSel, setConductoresSel] = useState<string[]>([]) // vacío = todos
    const [placasSel, setPlacasSel] = useState<string[]>([]) // vacío = todas
    const [estado, setEstado] = useState<'all' | 'pendiente' | 'pagado'>('all')
    const [moneda, setMoneda] = useState<'all' | 'soles' | 'dolares'>('all')
    const [buscarConductor, setBuscarConductor] = useState('')

    const conductores = useMemo(
        () => Array.from(new Set(gastos.map(g => g.conductor_nombre))).sort((a, b) => a.localeCompare(b)),
        [gastos]
    )
    const placas = useMemo(
        () => Array.from(new Set(
            gastos.map(g => datosServicio[g.servicio_id]?.placa).filter((p): p is string => !!p)
        )).sort(),
        [gastos, datosServicio]
    )

    // Rango [inicio, fin] en hora local; null = sin límite
    const rango = useMemo((): { inicio: Date | null; fin: Date | null; etiqueta: string } => {
        const now = new Date()
        const finDelDia = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }
        switch (periodo) {
            case 'semana_actual': {
                const i = startOfWeek(now, WEEK_OPTS)
                return { inicio: i, fin: endOfWeek(now, WEEK_OPTS), etiqueta: `Semana ${etiquetaSemana(i)}` }
            }
            case 'semana_anterior': {
                const i = startOfWeek(subWeeks(now, 1), WEEK_OPTS)
                return { inicio: i, fin: endOfWeek(i, WEEK_OPTS), etiqueta: `Semana ${etiquetaSemana(i)}` }
            }
            case 'semana': {
                const i = new Date(`${semanaSel}T00:00:00`)
                return { inicio: i, fin: endOfWeek(i, WEEK_OPTS), etiqueta: `Semana ${etiquetaSemana(i)}` }
            }
            case 'mes_actual':
                return { inicio: startOfMonth(now), fin: endOfMonth(now), etiqueta: format(now, 'MMMM yyyy', { locale: es }) }
            case 'mes_anterior': {
                const m = subMonths(now, 1)
                return { inicio: startOfMonth(m), fin: endOfMonth(m), etiqueta: format(m, 'MMMM yyyy', { locale: es }) }
            }
            case 'mes': {
                const m = new Date(`${mesSel}-01T00:00:00`)
                return { inicio: startOfMonth(m), fin: endOfMonth(m), etiqueta: format(m, 'MMMM yyyy', { locale: es }) }
            }
            case 'rango': {
                const i = desde ? new Date(`${desde}T00:00:00`) : null
                const f = hasta ? finDelDia(new Date(`${hasta}T00:00:00`)) : null
                const etiqueta = `${i ? format(i, 'dd/MM/yyyy') : 'inicio'} – ${f ? format(f, 'dd/MM/yyyy') : 'hoy'}`
                return { inicio: i, fin: f, etiqueta }
            }
            default:
                return { inicio: null, fin: null, etiqueta: 'Todo el historial' }
        }
    }, [periodo, semanaSel, mesSel, desde, hasta])

    const seleccion = useMemo(() => gastos.filter(g => {
        const fecha = new Date(g.created_at)
        if (rango.inicio && fecha < rango.inicio) return false
        if (rango.fin && fecha > rango.fin) return false
        if (conductoresSel.length > 0 && !conductoresSel.includes(g.conductor_nombre)) return false
        if (placasSel.length > 0 && !placasSel.includes(datosServicio[g.servicio_id]?.placa ?? '')) return false
        if (estado !== 'all' && g.estado !== estado) return false
        if (moneda !== 'all' && g.moneda !== moneda) return false
        return true
    }).sort((a, b) => a.created_at.localeCompare(b.created_at)), [gastos, rango, conductoresSel, placasSel, estado, moneda, datosServicio])

    const totalSoles = seleccion.filter(g => g.moneda === 'soles').reduce((s, g) => s + Number(g.monto), 0)
    const totalDolares = seleccion.filter(g => g.moneda === 'dolares').reduce((s, g) => s + Number(g.monto), 0)

    const toggle = (lista: string[], set: (v: string[]) => void, valor: string) =>
        set(lista.includes(valor) ? lista.filter(v => v !== valor) : [...lista, valor])

    const estilarCabecera = (row: ExcelJS.Row) => {
        row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2332' } }
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
        })
        row.height = 25
    }

    const handleExport = async () => {
        setExporting(true)
        try {
            const workbook = new ExcelJS.Workbook()

            // ── Hoja 1: detalle ──────────────────────────────────────────────
            const ws = workbook.addWorksheet('Gastos')
            ws.columns = [
                { header: 'Fecha', key: 'fecha', width: 12 },
                { header: 'Conductor', key: 'conductor', width: 30 },
                { header: 'Servicio', key: 'servicio', width: 40 },
                { header: 'Placa', key: 'placa', width: 12 },
                { header: 'Contenedor', key: 'contenedor', width: 16 },
                { header: 'N° Guía', key: 'guia', width: 16 },
                { header: 'Descripción', key: 'descripcion', width: 45 },
                { header: 'Moneda', key: 'moneda', width: 10 },
                { header: 'Monto', key: 'monto', width: 12 },
                { header: 'Estado', key: 'estado', width: 12 },
                { header: 'Fecha de pago', key: 'pagado', width: 14 },
            ]
            seleccion.forEach((g, i) => {
                const d = datosServicio[g.servicio_id]
                const row = ws.addRow({
                    fecha: format(new Date(g.created_at), 'dd/MM/yyyy'),
                    conductor: g.conductor_nombre,
                    servicio: g.servicio_nombre,
                    placa: d?.placa ?? '',
                    contenedor: d?.contenedor ?? '',
                    guia: d?.guia ?? '',
                    descripcion: g.descripcion,
                    moneda: g.moneda === 'soles' ? 'S/' : 'US$',
                    monto: Number(g.monto),
                    estado: g.estado === 'pagado' ? 'Pagado' : 'Pendiente',
                    pagado: g.pagado_at ? format(new Date(g.pagado_at), 'dd/MM/yyyy') : '',
                })
                if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
            })
            ws.getColumn('monto').numFmt = '#,##0.00'
            estilarCabecera(ws.getRow(1))

            ws.addRow({})
            if (totalSoles > 0 || moneda !== 'dolares') {
                const r = ws.addRow({ descripcion: 'TOTAL SOLES', moneda: 'S/', monto: totalSoles })
                r.font = { bold: true }
            }
            if (totalDolares > 0 || moneda === 'dolares') {
                const r = ws.addRow({ descripcion: 'TOTAL DÓLARES', moneda: 'US$', monto: totalDolares })
                r.font = { bold: true }
            }
            ws.views = [{ state: 'frozen', ySplit: 1 }]

            // ── Hoja 2: resumen por conductor ────────────────────────────────
            const wr = workbook.addWorksheet('Resumen por conductor')
            wr.addRow([`Gastos de conductores — ${rango.etiqueta}`]).font = { bold: true, size: 13 }
            wr.addRow([`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')} · ${seleccion.length} gasto(s)`]).font = { italic: true, color: { argb: 'FF666666' } }
            wr.addRow([])
            estilarCabecera(wr.addRow(['Conductor', 'N° gastos', 'Total S/', 'Pendiente S/', 'Pagado S/', 'Total US$']))
            const porConductor = new Map<string, GastoConductor[]>()
            for (const g of seleccion) porConductor.set(g.conductor_nombre, [...(porConductor.get(g.conductor_nombre) ?? []), g])
            const suma = (l: GastoConductor[], f: (g: GastoConductor) => boolean) => l.filter(f).reduce((s, g) => s + Number(g.monto), 0)
            Array.from(porConductor.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .forEach(([nombre, lista]) => {
                    wr.addRow([
                        nombre,
                        lista.length,
                        suma(lista, g => g.moneda === 'soles'),
                        suma(lista, g => g.moneda === 'soles' && g.estado === 'pendiente'),
                        suma(lista, g => g.moneda === 'soles' && g.estado === 'pagado'),
                        suma(lista, g => g.moneda === 'dolares'),
                    ])
                })
            const totalRow = wr.addRow([
                'TOTAL',
                seleccion.length,
                totalSoles,
                suma(seleccion, g => g.moneda === 'soles' && g.estado === 'pendiente'),
                suma(seleccion, g => g.moneda === 'soles' && g.estado === 'pagado'),
                totalDolares,
            ])
            totalRow.font = { bold: true }
            wr.getColumn(1).width = 32
            wr.getColumn(2).width = 11
            for (const c of [3, 4, 5, 6]) { wr.getColumn(c).width = 14; wr.getColumn(c).numFmt = '#,##0.00' }

            const buffer = await workbook.xlsx.writeBuffer()
            const sufijo = conductoresSel.length === 1 ? `_${conductoresSel[0].replace(/\s+/g, '_')}` : ''
            const periodoArchivo = rango.inicio ? `${format(rango.inicio, 'yyyyMMdd')}-${format(rango.fin ?? new Date(), 'yyyyMMdd')}` : 'historico'
            saveAs(new Blob([buffer]), `Gastos_Conductores_${periodoArchivo}${sufijo}.xlsx`)
            setOpen(false)
        } catch (err) {
            console.error('Error exportando gastos:', err)
            alert('Hubo un error al exportar: ' + (err instanceof Error ? err.message : String(err)))
        } finally {
            setExporting(false)
        }
    }

    const conductoresVisibles = conductores.filter(c => c.toLowerCase().includes(buscarConductor.toLowerCase()))

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Exportar
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary">
                        <FileSpreadsheet className="w-5 h-5" /> Exportar gastos de conductores
                    </DialogTitle>
                    <DialogDescription>Elige el período y los filtros. Las semanas van de sábado a viernes.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-5 md:grid-cols-2 pt-2">
                    {/* Período */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-primary" /> Período</h3>
                        <Select value={periodo} onValueChange={v => setPeriodo(v as Periodo)}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="semana_actual">Esta semana (sáb–vie)</SelectItem>
                                <SelectItem value="semana_anterior">Semana anterior</SelectItem>
                                <SelectItem value="semana">Elegir semana…</SelectItem>
                                <SelectItem value="mes_actual">Este mes</SelectItem>
                                <SelectItem value="mes_anterior">Mes anterior</SelectItem>
                                <SelectItem value="mes">Elegir mes…</SelectItem>
                                <SelectItem value="rango">Rango personalizado</SelectItem>
                                <SelectItem value="todo">Todo el historial</SelectItem>
                            </SelectContent>
                        </Select>
                        {periodo === 'semana' && (
                            <Select value={semanaSel} onValueChange={setSemanaSel}>
                                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {semanas.map(s => (
                                        <SelectItem key={s.toISOString()} value={format(s, 'yyyy-MM-dd')}>{etiquetaSemana(s)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {periodo === 'mes' && (
                            <Input type="month" className="h-9 text-xs" value={mesSel} onChange={e => setMesSel(e.target.value)} />
                        )}
                        {periodo === 'rango' && (
                            <div className="grid grid-cols-2 gap-2">
                                <div><Label className="text-[10px] uppercase text-muted-foreground">Desde</Label><Input type="date" className="h-9 text-xs" value={desde} onChange={e => setDesde(e.target.value)} /></div>
                                <div><Label className="text-[10px] uppercase text-muted-foreground">Hasta</Label><Input type="date" className="h-9 text-xs" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground first-letter:uppercase">{rango.etiqueta}</p>

                        <h3 className="text-sm font-semibold flex items-center gap-2 pt-2"><Filter className="w-4 h-4 text-primary" /> Otros filtros</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-[10px] uppercase text-muted-foreground">Estado</Label>
                                <Select value={estado} onValueChange={v => setEstado(v as typeof estado)}>
                                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="pendiente">Pendientes</SelectItem>
                                        <SelectItem value="pagado">Pagados</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-[10px] uppercase text-muted-foreground">Moneda</Label>
                                <Select value={moneda} onValueChange={v => setMoneda(v as typeof moneda)}>
                                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas</SelectItem>
                                        <SelectItem value="soles">Soles</SelectItem>
                                        <SelectItem value="dolares">Dólares</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {placas.length > 0 && (
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" /> Placas</Label>
                                    <span className="text-[10px] text-muted-foreground">{placasSel.length === 0 ? 'Todas' : `${placasSel.length} elegida(s)`}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {placas.map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => toggle(placasSel, setPlacasSel, p)}
                                            className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${placasSel.includes(p) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Conductores */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Conductores</h3>
                            <div className="flex gap-1">
                                <button type="button" onClick={() => setConductoresSel([])} className={`text-[10px] px-2 py-1 rounded ${conductoresSel.length === 0 ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'}`}>Todos</button>
                            </div>
                        </div>
                        <Input placeholder="Buscar conductor..." className="h-8 text-xs" value={buscarConductor} onChange={e => setBuscarConductor(e.target.value)} />
                        <div className="border rounded-lg max-h-[300px] overflow-y-auto divide-y">
                            {conductoresVisibles.length === 0 ? (
                                <p className="text-xs text-muted-foreground p-3 text-center">Sin conductores</p>
                            ) : conductoresVisibles.map(c => (
                                <label key={c} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50">
                                    <Checkbox checked={conductoresSel.includes(c)} onCheckedChange={() => toggle(conductoresSel, setConductoresSel, c)} />
                                    <span className={`text-xs select-none ${conductoresSel.includes(c) ? 'font-medium text-primary' : ''}`}>{c}</span>
                                </label>
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            {conductoresSel.length === 0 ? 'Sin selección = todos los conductores' : `${conductoresSel.length} conductor(es) elegido(s)`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t pt-4 mt-2 flex-wrap">
                    <div className="text-xs">
                        <span className="font-semibold">{seleccion.length}</span> gasto(s)
                        {totalSoles > 0 && <> · <span className="font-semibold">S/ {totalSoles.toFixed(2)}</span></>}
                        {totalDolares > 0 && <> · <span className="font-semibold">US$ {totalDolares.toFixed(2)}</span></>}
                    </div>
                    <Button onClick={handleExport} disabled={exporting || seleccion.length === 0} className="gap-2">
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                        Descargar Excel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
