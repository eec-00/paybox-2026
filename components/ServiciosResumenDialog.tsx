'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  buildResumenHtml, calcularResumen, periodoTexto, type FotoHito, type ResumenTask,
} from '@/lib/servicios/resumenConductores'
import { toast } from 'sonner'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Lunes a sábado de la semana en curso, desplazada `offset` semanas (-1 = la pasada). */
function semanaLunSab(offset: number): { start: string; end: string } {
  const now = new Date()
  const dow = now.getDay() // 0 domingo .. 6 sábado
  const monday = new Date(now)
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7)
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  return { start: toDateStr(monday), end: toDateStr(saturday) }
}

/** Abre el diálogo de impresión del navegador con el reporte (desde ahí se guarda como PDF). */
function imprimirHtml(html: string) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()
  const win = iframe.contentWindow!
  // El <title> del iframe no siempre llega como nombre de archivo — se usa el de la página
  const prevTitle = document.title
  document.title = doc.title
  setTimeout(() => {
    win.focus()
    win.print()
    document.title = prevTitle
    setTimeout(() => iframe.remove(), 1000)
  }, 300)
}

const FOTOS_CHUNK = 200

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: ResumenTask[]
  progresoMap: Map<number, number>
  completadosSet: Set<number>
}

export function ServiciosResumenDialog({ open, onOpenChange, tasks, progresoMap, completadosSet }: Props) {
  const supabase = createClient()
  const [mode, setMode] = useState<'semana' | 'custom'>('semana')
  const [weekOffset, setWeekOffset] = useState(0)
  const [customStart, setCustomStart] = useState(() => semanaLunSab(0).start)
  const [customEnd, setCustomEnd] = useState(() => semanaLunSab(0).end)
  const [generating, setGenerating] = useState(false)

  const { start, end } = mode === 'semana' ? semanaLunSab(weekOffset) : { start: customStart, end: customEnd }
  const rangoValido = !!start && !!end && start <= end

  const cantidad = useMemo(() => {
    if (!rangoValido) return 0
    return tasks.filter((t) => {
      const f = t.x_studio_fecha_de_la_programacin
      return typeof f === 'string' && f >= start && f <= end
    }).length
  }, [tasks, start, end, rangoValido])

  const handleGenerar = async () => {
    if (!rangoValido) { toast.error('Selecciona un rango de fechas válido'); return }
    setGenerating(true)
    try {
      const ids = tasks
        .filter((t) => typeof t.x_studio_fecha_de_la_programacin === 'string'
          && t.x_studio_fecha_de_la_programacin >= start && t.x_studio_fecha_de_la_programacin <= end)
        .map((t) => t.id)

      const fotos: FotoHito[] = []
      for (let i = 0; i < ids.length; i += FOTOS_CHUNK) {
        const { data, error } = await supabase
          .from('conductor_servicio_hito_fotos')
          .select('servicio_id, hito_key')
          .in('servicio_id', ids.slice(i, i + FOTOS_CHUNK))
        if (error) throw new Error(error.message)
        fotos.push(...(data ?? []))
      }

      const resumen = calcularResumen(tasks, progresoMap, completadosSet, fotos, start, end)
      imprimirHtml(buildResumenHtml(resumen))
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al generar el resumen')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !generating && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Exportar resumen
          </DialogTitle>
          <DialogDescription>
            Reporte en PDF del cumplimiento de los conductores: servicios hechos en la app vs. Odoo, hitos, fotos y detalle por conductor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'semana', label: 'Por semana' },
              { value: 'custom', label: 'Rango de fechas' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={`px-3 py-2 text-sm rounded-md border transition-all font-medium ${
                  mode === opt.value
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background hover:bg-muted border-border text-foreground/80'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'semana' ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setWeekOffset((w) => w - 1)} title="Semana anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 text-center">
                <p className="text-sm font-medium">
                  {weekOffset === 0 ? 'Esta semana' : weekOffset === -1 ? 'Semana pasada' : `Hace ${-weekOffset} semanas`}
                </p>
                <p className="text-xs text-muted-foreground">Lunes a sábado · {periodoTexto(start, end)}</p>
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setWeekOffset((w) => w + 1)} disabled={weekOffset >= 0} title="Semana siguiente">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
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
          )}

          <p className="text-xs font-medium text-foreground bg-muted/40 rounded-md px-3 py-2">
            {cantidad} servicio{cantidad !== 1 ? 's' : ''} en este periodo
          </p>
          <p className="text-[11px] text-muted-foreground">
            Se abrirá la ventana de impresión: elige &quot;Guardar como PDF&quot; como destino.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerar} disabled={generating || cantidad === 0} className="gap-1.5">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Generar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
