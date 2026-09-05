'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart3, Download, Loader2, Clock, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { format, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays } from 'date-fns'

interface Conductor {
  id: string
  full_name: string | null
  dni: string | null
  odoo_employee_name: string | null
}

interface Marca {
  id: string
  conductor_id: string
  created_at: string
  fecha: string
  salida_at: string | null
}

type RangoStats = 'this_month' | 'last_month' | 'custom'

interface DiaCalculado {
  conductor: Conductor
  fecha: string
  ingreso: string
  salida: string | null
  horasBrutas: number | null
  horasAlmuerzo: number
  horasNetas: number | null
}

interface ResumenConductor {
  conductor: Conductor
  diasConEntrada: number
  diasCompletos: number
  horasNetasTotal: number
  horasAlmuerzoTotal: number
  promedioHorasDia: number
  promedioHorasSemana: number
}

function nombreConductor(c: Conductor): string {
  return c.full_name || c.odoo_employee_name || c.dni || 'Sin nombre'
}

export function AsistenciaEstadisticas({ conductores }: { conductores: Conductor[] }) {
  const supabase = createClient()

  const [rango, setRango] = useState<RangoStats>('this_month')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [horasAlmuerzo, setHorasAlmuerzo] = useState('1')
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const now = new Date()
    if (rango === 'this_month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'))
      setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'))
    } else if (rango === 'last_month') {
      const lastMonth = subMonths(now, 1)
      setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'))
      setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'))
    }
  }, [rango])

  const fetchDatos = async () => {
    setLoading(true)
    try {
      const rows = await fetchAllRows<Marca>((from, to) =>
        supabase
          .from('asistencias_conductor')
          .select('id, conductor_id, created_at, fecha, salida_at')
          .gte('fecha', startDate)
          .lte('fecha', endDate)
          .order('fecha', { ascending: true })
          .range(from, to)
      )
      setMarcas(rows)
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar estadísticas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDatos() }, [startDate, endDate])

  const lunchHours = useMemo(() => {
    const n = parseFloat(horasAlmuerzo)
    return isNaN(n) || n < 0 ? 0 : n
  }, [horasAlmuerzo])

  const diasEnRango = Math.max(1, differenceInCalendarDays(new Date(`${endDate}T00:00:00`), new Date(`${startDate}T00:00:00`)) + 1)
  const semanasEnRango = diasEnRango / 7

  const conductorPorId = useMemo(() => new Map(conductores.map((c) => [c.id, c])), [conductores])

  // Un día calculado por cada marca, con el descuento de almuerzo aplicado
  // (solo a días completos: sin hora de salida no hay horas que descontar).
  const diasCalculados = useMemo((): DiaCalculado[] => {
    return marcas
      .map((m) => {
        const conductor = conductorPorId.get(m.conductor_id)
        if (!conductor) return null
        let horasBrutas: number | null = null
        let horasNetas: number | null = null
        let horasAlmuerzoAplicadas = 0
        if (m.salida_at) {
          horasBrutas = (new Date(m.salida_at).getTime() - new Date(m.created_at).getTime()) / 3_600_000
          horasAlmuerzoAplicadas = Math.min(lunchHours, Math.max(0, horasBrutas))
          horasNetas = Math.max(0, horasBrutas - horasAlmuerzoAplicadas)
        }
        return {
          conductor, fecha: m.fecha, ingreso: m.created_at, salida: m.salida_at,
          horasBrutas, horasAlmuerzo: horasAlmuerzoAplicadas, horasNetas,
        }
      })
      .filter((d): d is DiaCalculado => d !== null)
  }, [marcas, conductorPorId, lunchHours])

  const resumen = useMemo((): ResumenConductor[] => {
    const byConductor = new Map<string, DiaCalculado[]>()
    for (const d of diasCalculados) {
      const arr = byConductor.get(d.conductor.id) || []
      arr.push(d)
      byConductor.set(d.conductor.id, arr)
    }
    return conductores
      .map((conductor) => {
        const dias = byConductor.get(conductor.id) || []
        const completos = dias.filter((d) => d.horasNetas !== null)
        const horasNetasTotal = completos.reduce((s, d) => s + (d.horasNetas || 0), 0)
        const horasAlmuerzoTotal = completos.reduce((s, d) => s + d.horasAlmuerzo, 0)
        return {
          conductor,
          diasConEntrada: dias.length,
          diasCompletos: completos.length,
          horasNetasTotal,
          horasAlmuerzoTotal,
          promedioHorasDia: completos.length > 0 ? horasNetasTotal / completos.length : 0,
          promedioHorasSemana: horasNetasTotal / semanasEnRango,
        }
      })
      .sort((a, b) => b.horasNetasTotal - a.horasNetasTotal)
  }, [diasCalculados, conductores, semanasEnRango])

  const totalHoras = resumen.reduce((s, r) => s + r.horasNetasTotal, 0)

  const handleExport = async () => {
    setExporting(true)
    try {
      if (diasCalculados.length === 0) {
        toast.error('No hay marcas de asistencia en este rango para exportar.')
        return
      }

      const workbook = new ExcelJS.Workbook()

      // ── Hoja 1: Resumen por conductor ──────────────────────────────────
      // Se arma con filas manuales (arrays, no `worksheet.columns`): asignar
      // `.columns` con `header` en ExcelJS escribe/pisa la fila 1 siempre,
      // lo que borraría esta fila de título si se usara ese atajo acá.
      const wsResumen = workbook.addWorksheet('Resumen')
      const anchosResumen = [32, 14, 14, 15, 20, 15, 18]
      anchosResumen.forEach((w, i) => { wsResumen.getColumn(i + 1).width = w })

      wsResumen.addRow([`Periodo: ${format(new Date(`${startDate}T00:00:00`), 'dd/MM/yyyy')} al ${format(new Date(`${endDate}T00:00:00`), 'dd/MM/yyyy')}   ·   Horas de almuerzo descontadas por día: ${lunchHours}h`])
      wsResumen.mergeCells('A1:G1')
      wsResumen.getCell('A1').font = { italic: true, size: 10, color: { argb: 'FF666666' } }

      wsResumen.addRow(['Conductor', 'DNI', 'Días marcados', 'Días completos', 'Horas totales (netas)', 'Promedio h/día', 'Promedio h/semana'])

      resumen.forEach((r, idx) => {
        const row = wsResumen.addRow([
          nombreConductor(r.conductor),
          r.conductor.dni || '—',
          r.diasConEntrada,
          r.diasCompletos,
          Number(r.horasNetasTotal.toFixed(2)),
          Number(r.promedioHorasDia.toFixed(2)),
          Number(r.promedioHorasSemana.toFixed(2)),
        ])
        if (idx % 2 === 1) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
        }
      })

      const headerRowResumen = wsResumen.getRow(2)
      headerRowResumen.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2332' } }
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })
      headerRowResumen.height = 25

      // ── Hoja 2: Detalle diario (una fila por marca) ────────────────────
      const wsDetalle = workbook.addWorksheet('Detalle diario')
      wsDetalle.columns = [
        { header: 'Conductor', key: 'conductor', width: 32 },
        { header: 'DNI', key: 'dni', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Ingreso', key: 'ingreso', width: 12 },
        { header: 'Salida', key: 'salida', width: 12 },
        { header: 'Horas brutas', key: 'brutas', width: 14 },
        { header: 'Horas almuerzo', key: 'almuerzo', width: 15 },
        { header: 'Horas netas', key: 'netas', width: 14 },
      ]

      const diasOrdenados = [...diasCalculados].sort((a, b) =>
        nombreConductor(a.conductor).localeCompare(nombreConductor(b.conductor)) || a.fecha.localeCompare(b.fecha)
      )

      diasOrdenados.forEach((d, idx) => {
        const row = wsDetalle.addRow({
          conductor: nombreConductor(d.conductor),
          dni: d.conductor.dni || '—',
          fecha: format(new Date(`${d.fecha}T00:00:00`), 'dd/MM/yyyy'),
          ingreso: format(new Date(d.ingreso), 'HH:mm'),
          salida: d.salida ? format(new Date(d.salida), 'HH:mm') : 'Sin marcar',
          brutas: d.horasBrutas != null ? Number(d.horasBrutas.toFixed(2)) : '—',
          almuerzo: d.horasBrutas != null ? Number(d.horasAlmuerzo.toFixed(2)) : '—',
          netas: d.horasNetas != null ? Number(d.horasNetas.toFixed(2)) : '—',
        })
        if (idx % 2 === 1) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
        }
      })

      const headerRowDetalle = wsDetalle.getRow(1)
      headerRowDetalle.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2332' } }
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })
      headerRowDetalle.height = 25

      for (const ws of [wsResumen, wsDetalle]) {
        ws.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFECF0F1' } } }
          })
        })
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const fileName = `Asistencia_Estadisticas_${startDate}_a_${endDate}.xlsx`
      saveAs(new Blob([buffer]), fileName)
      toast.success('Excel generado')
    } catch (err: any) {
      toast.error(err.message || 'Error al exportar el Excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-3 bg-card/40 rounded-xl border border-border/50 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <BarChart3 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Estadísticas de asistencia</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Horas trabajadas por conductor, con descuento de almuerzo configurable.
            </p>
          </div>
        </div>
        <Button onClick={handleExport} disabled={exporting || loading || resumen.length === 0} size="sm" className="gap-1.5">
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Periodo</Label>
          <Select value={rango} onValueChange={(v) => setRango(v as RangoStats)}>
            <SelectTrigger className="h-9 text-xs w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">Este mes</SelectItem>
              <SelectItem value="last_month">Mes pasado</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {rango === 'custom' && (
          <>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Desde</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-xs w-[150px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Hasta</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-xs w-[150px]" />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Utensils className="h-3 w-3" /> Almuerzo a descontar (h/día)
          </Label>
          <Input
            type="number" min={0} step={0.5} value={horasAlmuerzo}
            onChange={(e) => setHorasAlmuerzo(e.target.value)}
            className="h-9 text-xs w-[110px]"
          />
        </div>
        <p className="text-[11px] text-muted-foreground pb-2">
          {diasEnRango} días · {semanasEnRango.toFixed(1)} semanas en el periodo
        </p>
      </div>

      {/* Tabla resumen */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando estadísticas...
        </div>
      ) : resumen.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">Sin marcas de asistencia en este periodo.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-background">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-bold">Conductor</TableHead>
                  <TableHead className="text-xs font-bold text-center">Días marcados</TableHead>
                  <TableHead className="text-xs font-bold text-center">Días completos</TableHead>
                  <TableHead className="text-xs font-bold text-right">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Horas totales</span>
                  </TableHead>
                  <TableHead className="text-xs font-bold text-right">Prom. h/día</TableHead>
                  <TableHead className="text-xs font-bold text-right">Prom. h/semana</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumen.map((r) => (
                  <TableRow key={r.conductor.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{nombreConductor(r.conductor)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.conductor.dni || '—'}</div>
                    </TableCell>
                    <TableCell className="text-center text-sm">{r.diasConEntrada}</TableCell>
                    <TableCell className="text-center text-sm">{r.diasCompletos}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{r.horasNetasTotal.toFixed(1)}h</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{r.promedioHorasDia.toFixed(1)}h</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{r.promedioHorasSemana.toFixed(1)}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground text-right">
            Total: <span className="font-semibold text-foreground">{totalHoras.toFixed(1)}h</span> entre {resumen.length} conductor{resumen.length !== 1 ? 'es' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
