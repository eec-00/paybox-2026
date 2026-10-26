'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronLeft, ChevronRight, Download, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { saveAs } from 'file-saver'
import { cn } from '@/lib/utils'
import { fechaUTC, hoyLima, sumarDias } from '@/lib/fechas'
import {
  DIAS_SEMANA, LABEL_MARCA, TIPOS_MARCA, fmtDuracion, horaLima, lunesDe, rangoFechas, resumirPeriodo,
  type Marca, type OficinaConfig, type ResumenPeriodo, type Trabajador,
} from '@/lib/oficina/calculos'
import { cargarMarcas } from '@/components/OficinaAsistenciaSection'
import { AvisoBadge, fmtDiaLargo } from '@/components/OficinaDiario'

type Periodo = 'semana' | 'mes'

interface Intento { id: string; nombre: string | null; motivo: string; created_at: string }

function limitesPeriodo(periodo: Periodo, ancla: string): { desde: string; hasta: string } {
  if (periodo === 'semana') {
    const desde = lunesDe(ancla)
    return { desde, hasta: sumarDias(desde, 6) }
  }
  const [y, m] = ancla.split('-').map(Number)
  const desde = `${y}-${String(m).padStart(2, '0')}-01`
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { desde, hasta: `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}` }
}

function etiquetaPeriodo(periodo: Periodo, desde: string, hasta: string): string {
  if (periodo === 'mes') {
    const s = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(fechaUTC(desde))
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  const f = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  return `Semana del ${f.format(fechaUTC(desde))} al ${f.format(fechaUTC(hasta))}`
}

const horas = (min: number) => Math.round((min / 60) * 10) / 10

export function OficinaResumen({ modo, config, trabajadores, onVerDia }: {
  modo: 'resumen' | 'avisos'
  config: OficinaConfig
  trabajadores: Trabajador[]
  onVerDia: (fecha: string) => void
}) {
  const hoy = hoyLima()
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [ancla, setAncla] = useState(hoy)
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [intentos, setIntentos] = useState<Intento[]>([])
  const [loading, setLoading] = useState(true)
  const [exportando, setExportando] = useState(false)

  const { desde, hasta } = limitesPeriodo(periodo, ancla)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [ms, ints] = await Promise.all([
        cargarMarcas(desde, hasta),
        createClient()
          .from('oficina_intentos')
          .select('id, nombre, motivo, created_at')
          .gte('created_at', new Date(`${desde}T00:00:00-05:00`).toISOString())
          .lt('created_at', new Date(`${sumarDias(hasta, 1)}T00:00:00-05:00`).toISOString())
          .order('created_at', { ascending: false }),
      ])
      setMarcas(ms)
      setIntentos((ints.data ?? []) as Intento[])
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => { cargar() }, [cargar])

  const fechas = useMemo(() => rangoFechas(desde, hasta), [desde, hasta])

  const resumenes = useMemo(() => trabajadores.map((t) => {
    const porDia = new Map<string, Marca[]>()
    for (const m of marcas) {
      if (m.user_id !== t.user_id) continue
      porDia.set(m.fecha, [...(porDia.get(m.fecha) ?? []), m])
    }
    return resumirPeriodo(t, fechas, porDia, config, hoy)
  }), [trabajadores, marcas, fechas, config, hoy])

  const mover = (delta: number) => {
    if (periodo === 'semana') { setAncla(sumarDias(desde, delta * 7)); return }
    const [y, m] = desde.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    setAncla(d.toISOString().slice(0, 10))
  }

  const exportar = async () => {
    setExportando(true)
    try {
      await exportarExcel(resumenes, desde, hasta, config, etiquetaPeriodo(periodo, desde, hasta))
    } catch (e: any) {
      toast.error(e.message || 'No se pudo exportar')
    } finally {
      setExportando(false)
    }
  }

  const avisosDias = useMemo(() => resumenes
    .flatMap((r) => r.dias.filter((d) => d.avisos.length > 0).map((d) => ({ trabajador: r.trabajador, dia: d })))
    .sort((a, b) => b.dia.fecha.localeCompare(a.dia.fecha) || a.trabajador.nombre.localeCompare(b.trabajador.nombre)),
  [resumenes])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <div className="flex rounded-md border overflow-hidden mr-1">
            {(['semana', 'mes'] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={cn('px-3 py-1.5 text-sm', periodo === p ? 'bg-primary text-primary-foreground' : 'bg-white hover:bg-muted')}
              >
                {p === 'semana' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => mover(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium px-2 min-w-48 text-center">{etiquetaPeriodo(periodo, desde, hasta)}</span>
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={hasta >= hoy} onClick={() => mover(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {modo === 'resumen' && (
          <Button variant="outline" size="sm" onClick={exportar} disabled={exportando || loading}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
            Exportar Excel
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : modo === 'resumen' ? (
        <>
          <div className="rounded-lg border bg-white overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">Trabajador</TableHead>
                  {periodo === 'semana' && fechas.map((f, i) => (
                    <TableHead key={f} className="text-center">{DIAS_SEMANA[i].corto}</TableHead>
                  ))}
                  {periodo === 'mes' && <TableHead className="text-center">Días</TableHead>}
                  <TableHead className="text-center">Horas</TableHead>
                  <TableHead className="text-center">Meta</TableHead>
                  <TableHead className="text-center">Diferencia</TableHead>
                  <TableHead className="text-center">Tardanzas</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Faltas / marcas faltantes</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Almuerzo fuera de rango</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Después {config.hora_limite}</TableHead>
                  <TableHead className="text-center">Sospechosas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumenes.map((r) => {
                  const dif = r.minutosTrabajados - r.metaMin
                  return (
                    <TableRow key={r.trabajador.user_id}>
                      <TableCell className="font-medium">{r.trabajador.nombre}</TableCell>
                      {periodo === 'semana' && r.dias.map((d) => (
                        <TableCell key={d.fecha} className="text-center p-1">
                          <button
                            onClick={() => onVerDia(d.fecha)}
                            className={cn(
                              'rounded px-1.5 py-1 text-xs tabular-nums hover:bg-muted w-full',
                              d.avisos.some((a) => a.grave) && 'text-red-700 font-semibold',
                              !d.marcas.entrada && 'text-muted-foreground/50',
                            )}
                          >
                            {d.trabajado !== null ? horas(d.trabajado).toFixed(1) : d.enCurso ? '…' : '—'}
                          </button>
                        </TableCell>
                      ))}
                      {periodo === 'mes' && <TableCell className="text-center tabular-nums">{r.diasTrabajados}</TableCell>}
                      <TableCell className="text-center tabular-nums font-semibold">{fmtDuracion(r.minutosTrabajados)}</TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">{fmtDuracion(r.metaMin)}</TableCell>
                      <TableCell className={cn('text-center tabular-nums font-medium', dif >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                        {dif >= 0 ? '+' : ''}{fmtDuracion(dif)}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {r.tardanzas + r.tardanzasCompensadas === 0 ? '—' : (
                          <span title={`${r.minutosTarde} min tarde en total`}>
                            <span className={cn(r.tardanzas > 0 && 'text-amber-700 font-semibold')}>{r.tardanzas}</span>
                            {r.tardanzasCompensadas > 0 && <span className="text-sky-700"> +{r.tardanzasCompensadas} comp.</span>}
                          </span>
                        )}
                      </TableCell>
                      <Conteo n={r.ausencias + r.faltasMarca} grave />
                      <Conteo n={r.almuerzosFuera} />
                      <Conteo n={r.nocturnos} grave />
                      <Conteo n={r.sospechosas} grave />
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Horas trabajadas sin contar el almuerzo. Meta: {config.meta_semanal_horas} h por semana
            {periodo === 'mes' ? ' (proporcional a los días del mes)' : ''}, o la propia de cada trabajador.
            Solo suman los días con entrada y salida marcadas. &quot;Comp.&quot; = llegó tarde pero completó sus horas ese día.
          </p>
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white divide-y">
            {avisosDias.length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-sm">Sin avisos en este período.</p>
            )}
            {avisosDias.map(({ trabajador, dia }) => (
              <button
                key={`${trabajador.user_id}-${dia.fecha}`}
                onClick={() => onVerDia(dia.fecha)}
                className="w-full text-left px-4 py-3 hover:bg-muted/50 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
              >
                <span className="text-sm text-muted-foreground sm:w-56 shrink-0">{fmtDiaLargo(dia.fecha)}</span>
                <span className="font-medium sm:w-44 shrink-0">{trabajador.nombre}</span>
                <span className="flex flex-wrap gap-1">{dia.avisos.map((a) => <AvisoBadge key={a.tipo} aviso={a} />)}</span>
              </button>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-red-600" /> Intentos rechazados
            </h3>
            <div className="rounded-lg border bg-white divide-y">
              {intentos.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">Ninguno en este período.</p>
              )}
              {intentos.map((i) => (
                <div key={i.id} className="px-4 py-2.5 text-sm flex flex-col sm:flex-row gap-1 sm:gap-4">
                  <span className="text-muted-foreground sm:w-40 shrink-0 tabular-nums">
                    {new Date(i.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="font-medium sm:w-44 shrink-0">{i.nombre ?? '—'}</span>
                  <span>{i.motivo}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Links del sticker que se intentaron usar más de una vez (reabiertos del historial o pasados a otra persona).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function Conteo({ n, grave = false }: { n: number; grave?: boolean }) {
  return (
    <TableCell className={cn('text-center tabular-nums text-sm', n > 0 && (grave ? 'text-red-700 font-semibold' : 'text-orange-700 font-medium'))}>
      {n || '—'}
    </TableCell>
  )
}

async function exportarExcel(resumenes: ResumenPeriodo[], desde: string, hasta: string, config: OficinaConfig, titulo: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()

  const hoja = wb.addWorksheet('Resumen')
  hoja.addRow([`Asistencia oficina — ${titulo}`]).font = { bold: true, size: 13 }
  hoja.addRow([])
  const cab = hoja.addRow([
    'Trabajador', 'Días trabajados', 'Horas trabajadas', 'Meta (h)', 'Diferencia (h)', 'Tardanzas',
    'Tardanzas compensadas', 'Minutos tarde', 'Ausencias', 'Marcas faltantes', 'Almuerzo fuera de rango',
    `Después de ${config.hora_limite}`, 'Sospechosas',
  ])
  cab.font = { bold: true }
  for (const r of resumenes) {
    hoja.addRow([
      r.trabajador.nombre, r.diasTrabajados, horas(r.minutosTrabajados), horas(r.metaMin),
      horas(r.minutosTrabajados - r.metaMin), r.tardanzas, r.tardanzasCompensadas, r.minutosTarde,
      r.ausencias, r.faltasMarca, r.almuerzosFuera, r.nocturnos, r.sospechosas,
    ])
  }
  hoja.columns.forEach((c, i) => { c.width = i === 0 ? 28 : 16 })

  const det = wb.addWorksheet('Detalle')
  const cabDet = det.addRow([
    'Fecha', 'Trabajador', 'Horario', ...TIPOS_MARCA.map((t) => LABEL_MARCA[t]),
    'Almuerzo (min)', 'Trabajado (h)', 'Minutos tarde', 'Avisos',
  ])
  cabDet.font = { bold: true }
  for (const f of rangoFechas(desde, hasta)) {
    for (const r of resumenes) {
      const d = r.dias.find((x) => x.fecha === f)!
      if (!d.marcas.entrada && d.avisos.length === 0) continue
      det.addRow([
        f, r.trabajador.nombre, d.horario ? `${d.horario.entrada}-${d.horario.salida}` : '',
        ...TIPOS_MARCA.map((t) => (d.marcas[t] ? horaLima(d.marcas[t]!.marcado_at) : '')),
        d.almuerzo ?? '', d.trabajado !== null ? horas(d.trabajado) : '', d.minutosTarde || '',
        d.avisos.map((a) => a.texto).join('; '),
      ])
    }
  }
  det.columns.forEach((c, i) => { c.width = [12, 28, 13, 10, 10, 10, 10, 14, 13, 13, 50][i] ?? 14 })

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer]), `asistencia-oficina_${desde}_${hasta}.xlsx`)
}
