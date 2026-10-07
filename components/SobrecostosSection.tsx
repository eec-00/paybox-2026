'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw, Timer, ChevronLeft, ChevronRight, Download, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveAs } from 'file-saver'
import {
  calcularSobrecosto, esQuimtia, formatDuracion, formatHoraMin, lunesDe, rangoSemana, tipoSobrecosto,
  HORAS_LIBRES, type SobrecostoInfo, type SobrecostoTask,
} from '@/lib/servicios/sobrecostos'
import { exportarSobrecostosExcel } from '@/lib/servicios/sobrecostosExcel'
import { m2oLast6 } from '@/lib/servicios/exportFormats'

const TIPO_LABEL: Record<SobrecostoInfo['tipo'], string> = {
  despacho: 'Despacho',
  recojo: 'Recojo',
  importacion: 'Importación',
  exportacion: 'Exportación',
}

function formatFecha(value: string | false): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function servicioCodigo(name: string): string {
  return name.includes(' - ') ? name.split(' - ')[0] : name
}

function EstadoBadge({ info }: { info: SobrecostoInfo }) {
  if (info.alerta) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" /> {info.enCurso ? 'Pasó 5 h (en curso)' : 'Con sobrecosto'}
      </span>
    )
  }
  if (info.enCurso) {
    return <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">En curso</span>
  }
  if (info.totalMin > 0) {
    return <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Dentro de 5 h</span>
  }
  return <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">Sin horas</span>
}

export function SobrecostosSection() {
  const [tasks, setTasks] = useState<SobrecostoTask[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lunes, setLunes] = useState(() => lunesDe(new Date()))
  const [now, setNow] = useState(() => new Date())

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/servicios')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar servicios')
      setTasks(data.tasks ?? [])
      setNow(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Recalcula los servicios en curso cada minuto (el tiempo sigue corriendo)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const semana = useMemo(() => rangoSemana(lunes), [lunes])

  const filas = useMemo(() => {
    return tasks
      .filter((t) => {
        const f = t.x_studio_fecha_de_la_programacin
        return esQuimtia(t) && tipoSobrecosto(t) && f && f >= semana.start && f <= semana.end
      })
      .sort((a, b) =>
        String(a.x_studio_fecha_de_la_programacin).localeCompare(String(b.x_studio_fecha_de_la_programacin)) ||
        servicioCodigo(a.name).localeCompare(servicioCodigo(b.name), undefined, { numeric: true }))
      .map((task) => ({ task, info: calcularSobrecosto(task, now)! }))
  }, [tasks, semana, now])

  const conAlerta = filas.filter((f) => f.info.alerta).length
  const excesoTotal = filas.reduce((s, f) => s + f.info.excesoMin, 0)

  const moverSemana = (dias: number) => {
    const d = new Date(lunes)
    d.setDate(d.getDate() + dias)
    setLunes(d)
  }

  const exportar = async () => {
    if (filas.length === 0) {
      toast.error('No hay servicios de QUIMTIA en esta semana')
      return
    }
    setExporting(true)
    try {
      const blob = await exportarSobrecostosExcel(filas.map((f) => f.task), semana)
      saveAs(blob, `Sobrecostos QUIMTIA ${formatFecha(semana.start).replace(/\//g, '-')} al ${formatFecha(semana.end).replace(/\//g, '-')}.xlsx`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el Excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Timer className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight flex items-center gap-2">
              Sobrecostos
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">Beta</span>
            </h2>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              QUIMTIA · {HORAS_LIBRES} horas libres por servicio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="h-8 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={exportar} disabled={loading || exporting} className="h-8 gap-1.5">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar Excel
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          <strong>Módulo en prueba (beta).</strong> Los tiempos se calculan con las horas que marcan los conductores en la app
          y todavía se están validando. No los tomes como definitivos: revisa cada caso antes de cobrar un sobrecosto.
        </p>
      </div>

      {/* Semana (lunes a sábado) */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moverSemana(-7)} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-semibold tabular-nums">
          Lunes {formatFecha(semana.start)} — Sábado {formatFecha(semana.end)}
        </p>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moverSemana(7)} aria-label="Semana siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8" onClick={() => setLunes(lunesDe(new Date()))}>
          Esta semana
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card/40 border-border/50 p-3">
          <p className="text-2xl font-extrabold tabular-nums">{filas.length}</p>
          <p className="text-[11px] text-muted-foreground font-medium">Servicios QUIMTIA</p>
        </div>
        <div className={`rounded-xl border p-3 ${conAlerta > 0 ? 'border-red-300 bg-red-50/60' : 'bg-card/40 border-border/50'}`}>
          <p className="text-2xl font-extrabold tabular-nums">{conAlerta}</p>
          <p className="text-[11px] text-muted-foreground font-medium">Pasaron las {HORAS_LIBRES} h</p>
        </div>
        <div className="rounded-xl border bg-card/40 border-border/50 p-3">
          <p className="text-2xl font-extrabold tabular-nums">{excesoTotal > 0 ? formatDuracion(excesoTotal) : '—'}</p>
          <p className="text-[11px] text-muted-foreground font-medium">Tiempo con sobrecosto</p>
        </div>
      </div>

      {filas.some((f) => f.info.alerta && f.info.enCurso) && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>Hay servicios <strong>en curso</strong> que ya pasaron las {HORAS_LIBRES} horas libres y siguen sumando sobrecosto.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <div className="rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Servicio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Contenedor</TableHead>
              <TableHead>Tiempos</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Sobrecosto</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No hay servicios de QUIMTIA (despacho, recojo, importación o exportación) en esta semana.
                </TableCell>
              </TableRow>
            ) : (
              filas.map(({ task, info }) => (
                <TableRow key={task.id} className={info.alerta ? 'bg-red-50/40' : undefined}>
                  <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">{servicioCodigo(task.name)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatFecha(task.x_studio_fecha_de_la_programacin)}</TableCell>
                  <TableCell className="text-xs font-semibold whitespace-nowrap">{m2oLast6(Array.isArray(task.x_studio_placa) ? task.x_studio_placa as [number, string] : false) || '—'}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{TIPO_LABEL[info.tipo]}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{(task.x_studio_nmero_de_contenedor as string) || '—'}</TableCell>
                  <TableCell className="text-xs">
                    <div className="space-y-0.5">
                      {info.tramos.map((t) => (
                        <p key={t.label} className="whitespace-nowrap">
                          <span className="text-muted-foreground">{t.label}:</span>{' '}
                          {t.inicio === null ? '—' : (
                            <>
                              {formatHoraMin(t.inicio)} → {t.fin !== null ? formatHoraMin(t.fin) : <em>en curso</em>}
                              {t.minutos !== null && <span className="text-muted-foreground"> ({formatDuracion(t.minutos)})</span>}
                            </>
                          )}
                        </p>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums whitespace-nowrap">
                    {info.totalMin > 0 ? formatDuracion(info.totalMin) : '—'}
                  </TableCell>
                  <TableCell className={`text-right text-xs font-bold tabular-nums whitespace-nowrap ${info.excesoMin > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
                    {info.excesoMin > 0 ? formatDuracion(info.excesoMin) : '—'}
                  </TableCell>
                  <TableCell><EstadoBadge info={info} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Despacho / Recojo: llegada a salida del punto de carga + llegada a salida del destino. Importación: de llegada a salida del cliente.
        Exportación: llegada a salida del cliente + ingreso al almacén destino hasta la entrega del contenedor.
        Las primeras {HORAS_LIBRES} horas son libres. El monto en soles se completa en el Excel.
      </p>
    </div>
  )
}
