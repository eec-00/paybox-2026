'use client'

import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw, Timer, ChevronLeft, ChevronRight, Download, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveAs } from 'file-saver'
import {
  calcularSobrecosto, esQuimtia, formatDuracion, formatHoraMin, lunesDe, rangoSemana, tipoCargaSobrecosto, tipoSobrecosto,
  HORAS_LIBRES, type SobrecostoInfo, type SobrecostoTask,
} from '@/lib/servicios/sobrecostos'
import { m2oLast6 } from '@/lib/servicios/exportFormats'
import { fechaCorte, serviciosUrl } from '@/lib/servicios/rango'
import { useServiciosLista } from '@/lib/servicios/useServicios'

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
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive-soft px-2.5 py-1 text-xs font-semibold text-destructive-ink">
        <AlertTriangle className="h-3 w-3" /> {info.enCurso ? 'Pasó 5 h (en curso)' : 'Con sobrecosto'}
      </span>
    )
  }
  if (info.enCurso) {
    return <span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-semibold text-info-ink">En curso</span>
  }
  if (info.totalMin > 0) {
    return <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-ink">Dentro de 5 h</span>
  }
  return <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">Sin horas</span>
}

const EMPTY_TASKS: SobrecostoTask[] = []

export function SobrecostosSection() {
  const [exporting, setExporting] = useState(false)
  const [lunes, setLunes] = useState(() => lunesDe(new Date()))
  const [now, setNow] = useState(() => new Date())

  // Recalcula los servicios en curso cada minuto (el tiempo sigue corriendo)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const semana = useMemo(() => rangoSemana(lunes), [lunes])

  // Se bajan solo los últimos DIAS_RECIENTES días, salvo que se navegue a una
  // semana más antigua: ahí se carga el histórico completo.
  const historico = semana.start < fechaCorte()

  const lista = useServiciosLista<SobrecostoTask>(serviciosUrl(historico))
  const tasks = lista.data?.tasks ?? EMPTY_TASKS
  const loading = lista.loading
  const error = lista.error
  const refrescando = lista.refreshing
  const fetchData = () => lista.refresh()

  // Al llegar datos nuevos se recalcula "ahora" (tiempos en curso)
  useEffect(() => { setNow(new Date()) }, [lista.data])

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
      // Se carga al exportar: arrastra ExcelJS (~900 KB)
      const { exportarSobrecostosExcel } = await import('@/lib/servicios/sobrecostosExcel')
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
      <PageHeader
        icon={Timer}
        title="Sobrecostos"
        badge={<Badge variant="warning">Beta</Badge>}
        description={<>QUIMTIA · {HORAS_LIBRES} horas libres por servicio</>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={refrescando} className="h-8 gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${refrescando ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button size="sm" onClick={exportar} disabled={loading || exporting} className="h-8 gap-1.5">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Exportar Excel
            </Button>
          </>
        }
      />

      <div className="flex items-start gap-2.5 bg-warning-soft border border-warning/40 text-warning-ink px-4 py-3 rounded-xl text-sm">
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
          <p className="text-xs text-muted-foreground font-medium">Servicios QUIMTIA</p>
        </div>
        <div className={`rounded-xl border p-3 ${conAlerta > 0 ? 'border-destructive/30 bg-destructive-soft/60' : 'bg-card/40 border-border/50'}`}>
          <p className="text-2xl font-extrabold tabular-nums">{conAlerta}</p>
          <p className="text-xs text-muted-foreground font-medium">Pasaron las {HORAS_LIBRES} h</p>
        </div>
        <div className="rounded-xl border bg-card/40 border-border/50 p-3">
          <p className="text-2xl font-extrabold tabular-nums">{excesoTotal > 0 ? formatDuracion(excesoTotal) : '—'}</p>
          <p className="text-xs text-muted-foreground font-medium">Tiempo con sobrecosto</p>
        </div>
      </div>

      {filas.some((f) => f.info.alerta && f.info.enCurso) && (
        <div className="flex items-center gap-2.5 bg-destructive-soft border border-destructive/30 text-destructive-ink px-4 py-3 rounded-xl text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>Hay servicios <strong>en curso</strong> que ya pasaron las {HORAS_LIBRES} horas libres y siguen sumando sobrecosto.</p>
        </div>
      )}

      {error && (
        <div className="bg-destructive-soft border border-destructive/30 text-destructive-ink px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <div className="rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Servicio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Tipo de Servicio</TableHead>
              <TableHead>Tipo de Carga</TableHead>
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
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                  No hay servicios de QUIMTIA (despacho, recojo, importación o exportación) en esta semana.
                </TableCell>
              </TableRow>
            ) : (
              filas.map(({ task, info }) => (
                <TableRow key={task.id} className={info.alerta ? 'bg-destructive-soft/40' : undefined}>
                  <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">{servicioCodigo(task.name)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatFecha(task.x_studio_fecha_de_la_programacin)}</TableCell>
                  <TableCell className="text-xs font-semibold whitespace-nowrap">{m2oLast6(Array.isArray(task.x_studio_placa) ? task.x_studio_placa as [number, string] : false) || '—'}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{TIPO_LABEL[info.tipo]}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{tipoCargaSobrecosto(task) || '—'}</TableCell>
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
                  <TableCell className={`text-right text-xs font-bold tabular-nums whitespace-nowrap ${info.excesoMin > 0 ? 'text-destructive-ink' : 'text-muted-foreground'}`}>
                    {info.excesoMin > 0 ? formatDuracion(info.excesoMin) : '—'}
                  </TableCell>
                  <TableCell><EstadoBadge info={info} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Despacho / Recojo: llegada a salida del punto de carga + llegada a salida del destino. Importación: de llegada a salida del cliente.
        Exportación: llegada a salida del cliente + ingreso al almacén destino hasta la entrega del contenedor.
        Las primeras {HORAS_LIBRES} horas son libres. El monto en soles se completa en el Excel.
      </p>
    </div>
  )
}
