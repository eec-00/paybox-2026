'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Download, Loader2, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { TIPOS_SERVICIO, tipoServicioLabelFor } from '@/lib/servicios/hitos'
import { calcularProgreso } from '@/lib/servicios/progreso'
import {
  GENERAL_COLUMNS, DEFAULT_GENERAL_COLUMNS, GROUP_OPTIONS, RANGE_PRESETS,
  rangeForPreset, groupOf, safeSheetName, toDateStr,
  type GeneralExportTask, type GroupBy, type RangePreset,
} from '@/lib/servicios/exportGeneral'

const COLUMNS_STORAGE_KEY = 'paybox_servicios_export_columnas'

const SECTION_LABELS = {
  general: 'Datos del servicio',
  operativa: 'Operativa',
  horas: 'Horas marcadas por el conductor',
} as const

export interface ServiciosExportDefaults {
  conductor: string
  cliente: string
  tipo: string
  etapa: string
  progreso: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: GeneralExportTask[]
  stages: { id: number; name: string }[]
  progresoMap: Map<number, number>
  completadosSet: Set<number>
  /** Filtros que ya tiene puestos la tabla — se usan como punto de partida */
  defaults: ServiciosExportDefaults
}

function m2o(val: unknown): string {
  return Array.isArray(val) ? String(val[1] ?? '') : ''
}

function formatFecha(value: string): string {
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

export function ServiciosExportDialog({ open, onOpenChange, tasks, stages, progresoMap, completadosSet, defaults }: Props) {
  const [preset, setPreset] = useState<RangePreset>('semana')
  const [customStart, setCustomStart] = useState(toDateStr(new Date()))
  const [customEnd, setCustomEnd] = useState(toDateStr(new Date()))
  const [conductor, setConductor] = useState('all')
  const [cliente, setCliente] = useState('all')
  const [tipo, setTipo] = useState('all')
  const [etapa, setEtapa] = useState('all')
  const [progreso, setProgreso] = useState('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('ninguno')
  const [columns, setColumns] = useState<Set<string>>(new Set(DEFAULT_GENERAL_COLUMNS))
  const [exporting, setExporting] = useState(false)

  // Al abrir: arranca con los filtros de la tabla y las columnas que el
  // usuario eligió la última vez (por dispositivo).
  useEffect(() => {
    if (!open) return
    setConductor(defaults.conductor)
    setCliente(defaults.cliente)
    setTipo(defaults.tipo)
    setEtapa(defaults.etapa)
    setProgreso(defaults.progreso)
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY)
      if (raw) {
        const saved = (JSON.parse(raw) as string[]).filter((k) => GENERAL_COLUMNS.some((c) => c.key === k))
        if (saved.length) setColumns(new Set(saved))
      }
    } catch { /* ignorar */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const conductorOptions = useMemo(
    () => Array.from(new Set(tasks.map((t) => m2o(t.x_studio_conductor)).filter(Boolean))).sort(),
    [tasks]
  )
  const clienteOptions = useMemo(
    () => Array.from(new Set(tasks.map((t) => m2o(t.partner_id)).filter(Boolean))).sort(),
    [tasks]
  )

  const range = rangeForPreset(preset, { start: customStart, end: customEnd })

  const rows = useMemo(() => {
    if (!range.start || !range.end) return []
    return tasks
      .filter((t) => {
        const fecha = t.x_studio_fecha_de_la_programacin
        if (typeof fecha !== 'string' || fecha < range.start || fecha > range.end) return false
        if (conductor !== 'all' && m2o(t.x_studio_conductor) !== conductor) return false
        if (cliente !== 'all' && m2o(t.partner_id) !== cliente) return false
        if (tipo !== 'all' && tipoServicioLabelFor(t) !== tipo) return false
        if (etapa !== 'all' && m2o(t.stage_id) !== etapa) return false
        if (progreso !== 'all' && calcularProgreso(t, progresoMap, completadosSet).estado !== progreso) return false
        return true
      })
      .sort((a, b) =>
        String(a.x_studio_fecha_de_la_programacin).localeCompare(String(b.x_studio_fecha_de_la_programacin)) ||
        (Number(a.x_studio_hora_de_cita) || 0) - (Number(b.x_studio_hora_de_cita) || 0)
      )
  }, [tasks, range.start, range.end, conductor, cliente, tipo, etapa, progreso, progresoMap, completadosSet])

  const groupCount = useMemo(
    () => (groupBy === 'ninguno' ? 1 : new Set(rows.map((t) => groupOf(t, groupBy).key)).size),
    [rows, groupBy]
  )

  const toggleColumn = (key: string) => {
    setColumns((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleExport = async () => {
    const cols = GENERAL_COLUMNS.filter((c) => columns.has(c.key))
    if (cols.length === 0) { toast.error('Elige al menos una columna'); return }
    if (rows.length === 0) { toast.error('No hay servicios con esos filtros'); return }

    setExporting(true)
    try {
      try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(cols.map((c) => c.key))) } catch { /* ignorar */ }

      const ctx = { progresoMap, completadosSet }
      const workbook = new ExcelJS.Workbook()
      const usedNames = new Set<string>()

      const styleSheet = (ws: ExcelJS.Worksheet) => {
        const headerRow = ws.getRow(1)
        headerRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2332' } }
          cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        })
        headerRow.height = 25
        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return
          row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle' }
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFECF0F1' } } }
          })
        })
        ws.views = [{ state: 'frozen', ySplit: 1 }]
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
      }

      const addDataSheet = (name: string, data: GeneralExportTask[]) => {
        const ws = workbook.addWorksheet(safeSheetName(name, usedNames))
        ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }))
        data.forEach((t) => ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.value(t, ctx)]))))
        styleSheet(ws)
      }

      if (groupBy === 'ninguno') {
        addDataSheet('Servicios', rows)
      } else {
        const groups = new Map<string, { label: string; items: GeneralExportTask[] }>()
        for (const t of rows) {
          const g = groupOf(t, groupBy)
          if (!groups.has(g.key)) groups.set(g.key, { label: g.label, items: [] })
          groups.get(g.key)!.items.push(t)
        }
        const ordered = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))

        // Hoja "Resumen" primero: cuántos servicios por grupo y cómo van
        const grupoHeader = GROUP_OPTIONS.find((o) => o.value === groupBy)!.label.replace(/^Por /, '').toUpperCase()
        const resumen = workbook.addWorksheet(safeSheetName('Resumen', usedNames))
        resumen.columns = [
          { header: grupoHeader, key: 'grupo', width: 34 },
          { header: 'SERVICIOS', key: 'total', width: 12 },
          { header: 'ACABADAS', key: 'completado', width: 12 },
          { header: 'EN PROCESO', key: 'en_proceso', width: 12 },
          { header: 'SIN INICIAR', key: 'sin_iniciar', width: 12 },
        ]
        const totals = { total: 0, completado: 0, en_proceso: 0, sin_iniciar: 0 }
        for (const [, g] of ordered) {
          const counts = { completado: 0, en_proceso: 0, sin_iniciar: 0 }
          g.items.forEach((t) => { counts[calcularProgreso(t, progresoMap, completadosSet).estado]++ })
          resumen.addRow({ grupo: g.label, total: g.items.length, ...counts })
          totals.total += g.items.length
          totals.completado += counts.completado
          totals.en_proceso += counts.en_proceso
          totals.sin_iniciar += counts.sin_iniciar
        }
        styleSheet(resumen)
        const totalRow = resumen.addRow({ grupo: 'TOTAL', ...totals })
        totalRow.font = { bold: true }

        for (const [, g] of ordered) addDataSheet(g.label, g.items)
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const rango = range.start === range.end
        ? range.start.replace(/-/g, '')
        : `${range.start.replace(/-/g, '')}_a_${range.end.replace(/-/g, '')}`
      const sufijo = groupBy === 'ninguno' ? '' : `_${groupBy}`
      saveAs(new Blob([buffer]), `Servicios_${rango}${sufijo}.xlsx`)
      toast.success(`Excel generado (${rows.length} servicios)`)
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || 'Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  const selectClass = 'h-9 text-xs w-full'

  return (
    <Dialog open={open} onOpenChange={(o) => !exporting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Exportación personalizada
          </DialogTitle>
          <DialogDescription>
            Elige el período, filtra lo que necesites, decide cómo separar el Excel y qué columnas incluir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Período */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Período (fecha de programación)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {RANGE_PRESETS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPreset(opt.value)}
                  className={`px-3 py-2 text-xs rounded-md border transition-all font-medium ${
                    preset === opt.value
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background hover:bg-muted border-border text-foreground/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {preset === 'custom' ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Desde</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Hasta</label>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {range.start === range.end ? `Fecha: ${formatFecha(range.start)}` : `Del ${formatFecha(range.start)} al ${formatFecha(range.end)}`}
              </p>
            )}
          </section>

          {/* Filtros */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtros</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Select value={conductor} onValueChange={setConductor}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los conductores</SelectItem>
                  {conductorOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={cliente} onValueChange={setCliente}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los clientes</SelectItem>
                  {clienteOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos de servicio</SelectItem>
                  {Object.values(TIPOS_SERVICIO).map((t) => <SelectItem key={t.key} value={t.label}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={etapa} onValueChange={setEtapa}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las etapas</SelectItem>
                  {stages.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={progreso} onValueChange={setProgreso}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Progreso: Todos</SelectItem>
                  <SelectItem value="sin_iniciar">🔴 Sin iniciar</SelectItem>
                  <SelectItem value="en_proceso">🟡 En proceso</SelectItem>
                  <SelectItem value="completado">🟢 Acabada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Agrupar */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Separar en hojas</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GROUP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setGroupBy(opt.value)}
                  className={`px-3 py-2 text-xs rounded-md border transition-all font-medium ${
                    groupBy === opt.value
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background hover:bg-muted border-border text-foreground/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {groupBy !== 'ninguno' && (
              <p className="text-xs text-muted-foreground">
                Una hoja &quot;Resumen&quot; con el conteo por grupo, y luego una hoja por cada uno ({groupCount}).
              </p>
            )}
          </section>

          {/* Columnas */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Columnas</h4>
              <div className="flex gap-3 text-xs">
                <button className="text-primary hover:underline" onClick={() => setColumns(new Set(GENERAL_COLUMNS.map((c) => c.key)))}>Todas</button>
                <button className="text-primary hover:underline" onClick={() => setColumns(new Set(DEFAULT_GENERAL_COLUMNS))}>Por defecto</button>
                <button className="text-primary hover:underline" onClick={() => setColumns(new Set())}>Ninguna</button>
              </div>
            </div>
            {(Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[]).map((section) => (
              <div key={section} className="space-y-1.5">
                <p className="text-[11px] font-medium text-foreground/70">{SECTION_LABELS[section]}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
                  {GENERAL_COLUMNS.filter((c) => c.section === section).map((c) => (
                    <label key={c.key} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox checked={columns.has(c.key)} onCheckedChange={() => toggleColumn(c.key)} />
                      {c.header}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <p className="text-xs font-medium text-foreground bg-muted/40 rounded-md px-3 py-2">
            {rows.length} servicio{rows.length !== 1 ? 's' : ''} coinciden · {columns.size} columna{columns.size !== 1 ? 's' : ''}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={exporting || rows.length === 0 || columns.size === 0} className="gap-1.5">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
