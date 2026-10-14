'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RefreshCw, Wallet, ChevronLeft, ChevronRight, ChevronDown, AlertTriangle, Loader2, Info, ExternalLink, AlarmClock, Trophy, UtensilsCrossed, Moon, Undo2, MapPin } from 'lucide-react'
import {
  COLUMNA_LABEL, calcularTarifa, rangoSemanaPago, sabadoDe, servicioCodigo,
  type DevolucionPago, type ServicioPago, type TarifaResultado,
} from '@/lib/pruebas/pagosConductores'
import {
  CONCEPTO_LABEL, calcularAdicionales, esFinalizado, horaLabel, totalAdicionales, type Adicional,
} from '@/lib/pruebas/adicionalesConductores'

function formatFecha(value: string | false): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function soles(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface FilaServicio { servicio: ServicioPago; tarifa: TarifaResultado }

interface ResumenConductor {
  key: string
  conductor: string
  servicios: FilaServicio[]
  pagables: number
  sinTarifa: number
  subtotal: number
  adicionales: Adicional[]
  totalAdicionales: number
}

export function PagosConductoresSection() {
  const [servicios, setServicios] = useState<ServicioPago[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionPago[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sabado, setSabado] = useState(() => sabadoDe(new Date()))
  const [soloFinalizados, setSoloFinalizados] = useState(true)
  const [abiertos, setAbiertos] = useState<string[]>([])
  const [detalle, setDetalle] = useState<{ adicional: Adicional; conductor: string } | null>(null)

  const semana = useMemo(() => rangoSemanaPago(sabado), [sabado])

  const fetchData = async ({ start, end }: { start: string; end: string }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/pruebas/pagos-conductores?start=${start}&end=${end}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar servicios')
      setServicios(data.servicios ?? [])
      setDevoluciones(data.devoluciones ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setServicios([])
      setDevoluciones([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData(semana) }, [semana])

  const resumen = useMemo(() => {
    const porConductor = new Map<string, ResumenConductor>()
    const obtener = (id: number | null, nombre: string | null) => {
      const key = id ? String(id) : 'sin'
      let r = porConductor.get(key)
      if (!r) {
        r = { key, conductor: nombre ?? 'Sin conductor', servicios: [], pagables: 0, sinTarifa: 0, subtotal: 0, adicionales: [], totalAdicionales: 0 }
        porConductor.set(key, r)
      }
      return r
    }
    for (const s of servicios) {
      if (soloFinalizados && !esFinalizado(s.etapa)) continue
      const r = obtener(s.conductorId, s.conductor)
      const tarifa = calcularTarifa(s.atributos)
      r.servicios.push({ servicio: s, tarifa })
      if (tarifa.monto !== null) {
        r.pagables++
        r.subtotal += tarifa.monto
      } else {
        r.sinTarifa++
      }
    }

    // Devoluciones de vacío hechas por otro conductor: adicional para quien la hizo
    const devolucionesPorConductor = new Map<string, DevolucionPago[]>()
    for (const d of devoluciones) {
      if (!d.conductorId || d.conductorId === d.padreConductorId) continue
      if (soloFinalizados && !esFinalizado(d.etapa)) continue
      const r = obtener(d.conductorId, d.conductor)
      devolucionesPorConductor.set(r.key, [...(devolucionesPorConductor.get(r.key) ?? []), d])
    }
    for (const r of Array.from(porConductor.values())) {
      if (r.key === 'sin') continue
      const todos = servicios.filter(s => String(s.conductorId) === r.key)
      r.adicionales = calcularAdicionales(r.servicios.map(f => f.servicio), todos, devolucionesPorConductor.get(r.key) ?? [])
      r.totalAdicionales = totalAdicionales(r.adicionales)
    }
    return Array.from(porConductor.values()).sort((a, b) => a.conductor.localeCompare(b.conductor))
  }, [servicios, devoluciones, soloFinalizados])

  const totalServicios = resumen.reduce((s, r) => s + r.servicios.length, 0)
  const totalSinTarifa = resumen.reduce((s, r) => s + r.sinTarifa, 0)
  const totalSubtotal = resumen.reduce((s, r) => s + r.subtotal, 0)
  const totalAdic = resumen.reduce((s, r) => s + r.totalAdicionales, 0)

  const moverSemana = (dias: number) => {
    const d = new Date(sabado)
    d.setDate(d.getDate() + dias)
    setSabado(d)
  }
  const toggle = (key: string) =>
    setAbiertos(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight flex items-center gap-2">
              Pagos a conductores
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">Prueba</span>
            </h2>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Tarifa por servicio según zona y tipo de carga, más adicionales
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData(semana)} disabled={loading} className="h-8 gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          <strong>Módulo en prueba.</strong> Por ahora solo se calculan las tarifas de Zona 1 a 4.
          Los servicios de Zona 5, 6, 7 y Provincia aparecen como &quot;sin tarifa&quot; y no suman al total.
          Los adicionales se calculan con la hora de cita y los horarios que el conductor marca en la app. Máquina,
          Amanecida por permanencia en planta (S/ 40) y Otros adicionales se coordinan aparte; el Viático queda &quot;por validar&quot;.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moverSemana(-7)} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-semibold tabular-nums">
          Sábado {formatFecha(semana.start)} — Viernes {formatFecha(semana.end)}
        </p>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moverSemana(7)} aria-label="Semana siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8" onClick={() => setSabado(sabadoDe(new Date()))}>
          Esta semana
        </Button>
        <label className="ml-2 flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={soloFinalizados} onChange={e => setSoloFinalizados(e.target.checked)} className="h-4 w-4" />
          Solo servicios finalizados
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border bg-card/40 border-border/50 p-3">
          <p className="text-2xl font-extrabold tabular-nums">{resumen.length}</p>
          <p className="text-[11px] text-muted-foreground font-medium">Conductores</p>
        </div>
        <div className="rounded-xl border bg-card/40 border-border/50 p-3">
          <p className="text-2xl font-extrabold tabular-nums">{totalServicios}</p>
          <p className="text-[11px] text-muted-foreground font-medium">Servicios</p>
        </div>
        <div className={`rounded-xl border p-3 ${totalSinTarifa > 0 ? 'border-amber-300 bg-amber-50/60' : 'bg-card/40 border-border/50'}`}>
          <p className="text-2xl font-extrabold tabular-nums">{totalSinTarifa}</p>
          <p className="text-[11px] text-muted-foreground font-medium">Sin tarifa</p>
        </div>
        <div className="rounded-xl border bg-card/40 border-border/50 p-3">
          <p className="text-2xl font-extrabold tabular-nums">{soles(totalAdic)}</p>
          <p className="text-[11px] text-muted-foreground font-medium">Adicionales</p>
        </div>
        <div className="rounded-xl border bg-card/40 border-border/50 p-3">
          <p className="text-2xl font-extrabold tabular-nums">{soles(totalSubtotal + totalAdic)}</p>
          <p className="text-[11px] text-muted-foreground font-medium">Total de la semana</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <div className="rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conductor</TableHead>
              <TableHead className="text-right">Servicios</TableHead>
              <TableHead className="text-right">Sin tarifa</TableHead>
              <TableHead className="text-right">Tarifas</TableHead>
              <TableHead className="text-right">Adicionales</TableHead>
              <TableHead className="text-right">Total a pagar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : resumen.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No hay servicios en esta semana.
                </TableCell>
              </TableRow>
            ) : (
              resumen.map(r => {
                const abierto = abiertos.includes(r.key)
                return (
                  <Fragment key={r.key}>
                    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggle(r.key)}>
                      <TableCell className="text-sm font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {r.conductor}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.servicios.length}</TableCell>
                      <TableCell className={`text-right tabular-nums ${r.sinTarifa > 0 ? 'text-amber-700 font-semibold' : 'text-muted-foreground'}`}>
                        {r.sinTarifa || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{soles(r.subtotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.totalAdicionales ? soles(r.totalAdicionales) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold">{soles(r.subtotal + r.totalAdicionales)}</TableCell>
                    </TableRow>
                    {abierto && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={6} className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="pl-10">Servicio</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Zona</TableHead>
                                <TableHead>Tarifa aplicada</TableHead>
                                <TableHead className="text-right">Monto</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {r.servicios.map(({ servicio: s, tarifa }) => (
                                <TableRow key={s.id} className={tarifa.monto === null ? 'bg-amber-50/50' : undefined}>
                                  <TableCell className="pl-10 font-mono text-xs font-semibold whitespace-nowrap">{servicioCodigo(s.name)}</TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">{formatFecha(s.fecha)}</TableCell>
                                  <TableCell className="text-xs max-w-[200px] truncate" title={s.cliente ?? ''}>{s.cliente ?? '—'}</TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {[s.atributos.tipoServicio, s.atributos.modalidad, s.atributos.tipoCarga].filter(Boolean).join(' · ') || '—'}
                                  </TableCell>
                                  <TableCell className="text-xs font-semibold whitespace-nowrap">{s.atributos.zona ?? '—'}</TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {tarifa.monto !== null && tarifa.columna
                                      ? COLUMNA_LABEL[tarifa.columna]
                                      : <span className="text-amber-700">{tarifa.motivo}</span>}
                                  </TableCell>
                                  <TableCell className="text-right text-xs font-semibold tabular-nums whitespace-nowrap">
                                    {tarifa.monto !== null ? soles(tarifa.monto) : '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {r.adicionales.length > 0 && (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="pl-10">Adicional</TableHead>
                                  <TableHead>Fecha</TableHead>
                                  <TableHead>Servicio</TableHead>
                                  <TableHead>Detalle</TableHead>
                                  <TableHead className="text-right">Monto</TableHead>
                                  <TableHead className="w-10" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {r.adicionales.map((a, i) => (
                                  <TableRow key={i} className={a.porValidar ? 'bg-amber-50/50' : undefined}>
                                    <TableCell className="pl-10 text-xs font-semibold whitespace-nowrap">
                                      {CONCEPTO_LABEL[a.concepto]}
                                      {a.porValidar && (
                                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Por validar</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs whitespace-nowrap">{a.fecha ? formatFecha(a.fecha) : 'Semana'}</TableCell>
                                    <TableCell className="font-mono text-xs whitespace-nowrap">{a.servicio ?? '—'}</TableCell>
                                    <TableCell className="text-xs">{a.detalle}</TableCell>
                                    <TableCell className={`text-right text-xs font-semibold tabular-nums whitespace-nowrap ${a.porValidar ? 'text-muted-foreground line-through' : ''}`}>
                                      {soles(a.monto)}
                                    </TableCell>
                                    <TableCell className="w-10 pr-3">
                                      <Button
                                        variant="ghost" size="icon" className="h-7 w-7"
                                        onClick={() => setDetalle({ adicional: a, conductor: r.conductor })}
                                        aria-label="Ver detalle del adicional"
                                      >
                                        <Info className="h-4 w-4 text-primary" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DetalleAdicionalDialog
        detalle={detalle}
        servicios={servicios}
        onClose={() => setDetalle(null)}
      />

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        La zona, el tipo de servicio y el tipo de carga se toman del producto de la orden de venta en Odoo.
        Las devoluciones/retiros de vacío (subtareas) no se cuentan. Contenedor 20 y 40 pagan igual. La semana va de sábado a viernes; el básico mensual no se incluye.
        Adicionales: Programación 03:00 (cita 03:00–03:29, no acumula con amanecida), Cena (S/ 20 en servicio después de las 19:00;
        S/ 30 si el primer servicio del día inició hasta las 06:00 y devolvió desde las 17:00), Amanecida CROSLAND (S/ 30 después de
        las 22:00, S/ 50 después de las 00:00), Devolución de vacío de otro compañero (S/ 20; S/ 30 en DPW/APMT) y Bono S/ 100 desde
        8 servicios integrales finalizados en la semana (sin traslados internos, provincia ni devoluciones pendientes).
      </p>
    </div>
  )
}

// ── Detalle de un adicional (modal) ──────────────────────────────────────

interface EstiloConcepto {
  icon: typeof Info
  /** Fondo suave + texto (ícono del encabezado, distintivos) */
  soft: string
  /** Texto en el color del acento */
  text: string
  /** Borde + fondo para resaltar recuadros y filas */
  highlight: string
  /** Color sólido (punto de la línea, barra) */
  solid: string
  /** Color sólido suave (tramo de la barra antes del límite) */
  solidSoft: string
}

const CONCEPTO_ESTILO: Record<Adicional['concepto'], EstiloConcepto> = {
  programacion_0300: { icon: AlarmClock, soft: 'bg-sky-100 text-sky-700', text: 'text-sky-700', highlight: 'border-sky-400 bg-sky-50', solid: 'bg-sky-500', solidSoft: 'bg-sky-200' },
  bono: { icon: Trophy, soft: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700', highlight: 'border-emerald-400 bg-emerald-50', solid: 'bg-emerald-500', solidSoft: 'bg-emerald-200' },
  cena: { icon: UtensilsCrossed, soft: 'bg-orange-100 text-orange-700', text: 'text-orange-700', highlight: 'border-orange-400 bg-orange-50', solid: 'bg-orange-500', solidSoft: 'bg-orange-200' },
  amanecida: { icon: Moon, soft: 'bg-indigo-100 text-indigo-700', text: 'text-indigo-700', highlight: 'border-indigo-400 bg-indigo-50', solid: 'bg-indigo-500', solidSoft: 'bg-indigo-200' },
  devolucion_vacio: { icon: Undo2, soft: 'bg-teal-100 text-teal-700', text: 'text-teal-700', highlight: 'border-teal-400 bg-teal-50', solid: 'bg-teal-500', solidSoft: 'bg-teal-200' },
  viatico: { icon: MapPin, soft: 'bg-amber-100 text-amber-800', text: 'text-amber-800', highlight: 'border-amber-400 bg-amber-50', solid: 'bg-amber-500', solidSoft: 'bg-amber-200' },
}

function duracion(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

/** Hora del día (sin el "+1 día") y cuántos días pasaron desde la programación */
function partesHora(min: number): { hora: string; dias: number } {
  const dias = Math.floor(min / 1440)
  return { hora: horaLabel(min - dias * 1440), dias }
}

function Hora({ min, className = '', estimada = false }: { min: number | null; className?: string; estimada?: boolean }) {
  if (min === null) return <span className={`text-muted-foreground/60 ${className}`}>—</span>
  const { hora, dias } = partesHora(min)
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap tabular-nums ${className}`}>
      {hora}
      {dias !== 0 && (
        <span
          className={`rounded px-1 py-px text-[10px] font-bold leading-none ${estimada ? 'border border-dashed border-foreground/30 text-foreground/50' : 'bg-foreground/10 text-foreground/70'}`}
          title={`${Math.abs(dias)} día(s) ${dias > 0 ? 'después' : 'antes'} de la programación${estimada ? ' (estimado: el hito no tiene ubicación registrada)' : ''}`}
        >
          {dias > 0 ? '+' : ''}{dias}d
        </span>
      )}
    </span>
  )
}

/** ¿El último horario del servicio tiene fecha real (registro con ubicación)? */
function finEsReal(s: ServicioPago): boolean {
  return s.horarios.linea.some(h => h.key !== 'servicio_finalizado' && h.min === s.horarios.fin && h.real)
}

/** Clave del hito que quedó como "último horario" (fin) del servicio */
function claveFin(s: ServicioPago): string | null {
  const ult = [...s.horarios.linea].reverse().find(h => h.key !== 'servicio_finalizado' && h.min !== null)
  return ult?.key ?? null
}

function esClaveDe(s: ServicioPago, claves: Set<string>) {
  const fin = claveFin(s)
  return (key: string) => claves.has(key) || (claves.has('fin') && key === fin)
}

function HoraTile({ label, value, destacado, estilo, nota }: {
  label: string; value: number | null; destacado: boolean; estilo: EstiloConcepto; nota?: string
}) {
  return (
    <div className={`rounded-lg border p-2.5 ${destacado ? `border-2 ${estilo.highlight}` : 'bg-card/40'}`}>
      <p className={`text-[11px] font-medium ${destacado ? `${estilo.text} font-semibold` : 'text-muted-foreground'}`}>{label}</p>
      <Hora min={value} className="text-base font-extrabold" />
      {nota && <span className="ml-1.5 text-[10px] text-muted-foreground">{nota}</span>}
    </div>
  )
}

/** Franja de la jornada: de la salida al último horario, con la hora límite
 * de la regla marcada y el tramo que la supera pintado en el color del adicional. */
function BarraJornada({ servicio: s, umbral, estilo, cita }: {
  servicio: ServicioPago
  umbral?: { min: number; label: string }
  estilo: EstiloConcepto
  cita: boolean
}) {
  const marcados = s.horarios.linea.filter(h => h.min !== null && h.key !== 'servicio_finalizado').map(h => h.min!)
  if (marcados.length === 0) return null
  const inicio = Math.min(...marcados)
  const fin = Math.max(...marcados)
  const puntos = [inicio, fin, ...(umbral ? [umbral.min] : []), ...(cita && s.horaCita !== null ? [s.horaCita] : [])]
  const desde = Math.floor(Math.min(...puntos) / 60) * 60
  const hasta = Math.ceil(Math.max(...puntos) / 60) * 60
  const rango = Math.max(hasta - desde, 60)
  const pct = (m: number) => ((m - desde) / rango) * 100
  const corte = umbral ? Math.min(Math.max(umbral.min, inicio), fin) : fin
  const medianoches = Array.from({ length: Math.floor(hasta / 1440) }, (_, i) => (i + 1) * 1440).filter(m => m > desde && m < hasta)

  return (
    <div className="rounded-xl border p-3.5">
      <div className="mb-3 flex items-center justify-between text-[11px]">
        <p className="font-bold uppercase tracking-wider text-muted-foreground">Jornada</p>
        <p className="text-muted-foreground">Duración: <span className="font-semibold text-foreground">{duracion(fin - inicio)}</span></p>
      </div>
      <div className="relative h-14">
        {/* pista */}
        <div className="absolute inset-x-0 top-5 h-3 rounded-full bg-muted" />
        {/* tramo antes del límite */}
        <div className={`absolute top-5 h-3 rounded-l-full ${estilo.solidSoft}`} style={{ left: `${pct(inicio)}%`, width: `${pct(corte) - pct(inicio)}%` }} />
        {/* tramo que supera el límite */}
        {umbral && fin > umbral.min && (
          <div className={`absolute top-5 h-3 rounded-r-full ${estilo.solid}`} style={{ left: `${pct(corte)}%`, width: `${pct(fin) - pct(corte)}%` }} />
        )}
        {!umbral && (
          <div className={`absolute top-5 h-3 rounded-full ${estilo.solid}`} style={{ left: `${pct(inicio)}%`, width: `${Math.max(pct(fin) - pct(inicio), 1)}%` }} />
        )}
        {/* medianoches */}
        {medianoches.map(m => (
          <div key={m} className="absolute top-3 h-7 border-l border-foreground/20" style={{ left: `${pct(m)}%` }}>
            {/* Sin texto si queda pegada a la etiqueta del límite */}
            {!(umbral && Math.abs(pct(m) - pct(umbral.min)) < 15) && (
              <span className="absolute -top-3.5 -translate-x-1/2 whitespace-nowrap text-[9px] text-muted-foreground">00:00</span>
            )}
          </div>
        ))}
        {/* límite de la regla */}
        {umbral && (
          <div className="absolute top-1 h-11 border-l-2 border-dashed border-foreground/60" style={{ left: `${pct(umbral.min)}%` }}>
            <span className="absolute -top-1 left-1 whitespace-nowrap rounded bg-foreground px-1 text-[9px] font-bold text-background">{umbral.label}</span>
          </div>
        )}
        {/* cita */}
        {cita && s.horaCita !== null && (
          <div className="absolute top-3.5 h-0 w-0" style={{ left: `${pct(s.horaCita)}%` }}>
            <span className={`absolute -translate-x-1/2 h-2.5 w-2.5 rotate-45 ${estilo.solid}`} title="Hora de cita" />
          </div>
        )}
        {/* etiquetas inicio / fin */}
        <div className="absolute top-9 -translate-x-1/2 text-[10px] font-semibold" style={{ left: `${Math.min(Math.max(pct(inicio), 6), 94)}%` }}>
          <Hora min={inicio} />
        </div>
        <div className={`absolute top-9 -translate-x-1/2 text-[10px] font-extrabold ${estilo.text}`} style={{ left: `${Math.min(Math.max(pct(fin), 6), 94)}%` }}>
          <Hora min={fin} />
        </div>
      </div>
    </div>
  )
}

function LineaTiempo({ servicio, claves, umbral, estilo }: {
  servicio: ServicioPago
  claves: Set<string>
  umbral?: { min: number; label: string }
  estilo: EstiloConcepto
}) {
  const [verSinMarcar, setVerSinMarcar] = useState(false)
  const esClave = esClaveDe(servicio, claves)
  const lista = servicio.horarios.linea
  const sinMarcar = lista.filter(h => h.min === null).length
  const primeroSobreUmbral = umbral
    ? lista.find(x => x.min !== null && x.key !== 'servicio_finalizado' && x.min >= umbral.min)
    : undefined

  const filas = lista
    .map((h, i) => {
      const anterior = lista.slice(0, i).reverse().find(x => x.min !== null && x.key !== 'servicio_finalizado')
      const finalizadoAparte = h.key === 'servicio_finalizado'
      return {
        h, finalizadoAparte,
        marcado: h.min !== null,
        clave: h.min !== null && esClave(h.key),
        delta: h.min !== null && !finalizadoAparte && anterior ? h.min - anterior.min! : null,
        mostrarUmbral: primeroSobreUmbral?.key === h.key,
      }
    })
    .filter(f => f.marcado || verSinMarcar)

  // Lleva la vista a la primera hora clave al abrir
  const refClave = (el: HTMLLIElement | null) => {
    if (el && !el.dataset.visto) {
      el.dataset.visto = '1'
      el.scrollIntoView({ block: 'center' })
    }
  }
  const primeraClave = filas.find(f => f.clave)?.h.key

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Horarios marcados</p>
        {sinMarcar > 0 && (
          <button
            type="button" onClick={() => setVerSinMarcar(v => !v)}
            className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {verSinMarcar ? 'Ocultar' : 'Mostrar'} {sinMarcar} sin marcar
          </button>
        )}
      </div>
      <ol>
        {filas.map(({ h, marcado, finalizadoAparte, clave, delta, mostrarUmbral }, i) => (
          <Fragment key={h.key}>
            {mostrarUmbral && umbral && (
              <li className="flex items-center gap-2 py-1.5 pl-6">
                <span className="flex-1 border-t-2 border-dashed border-foreground/30" />
                <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background">{umbral.label}</span>
                <span className="flex-1 border-t-2 border-dashed border-foreground/30" />
              </li>
            )}
            <li ref={h.key === primeraClave ? refClave : undefined} className="flex gap-3">
              <div className="flex w-3 flex-col items-center">
                <span className={`mt-3 shrink-0 rounded-full ${
                  clave ? `h-3.5 w-3.5 ${estilo.solid} ring-4 ring-offset-0 ring-black/5`
                    : finalizadoAparte ? 'h-2.5 w-2.5 border-2 border-muted-foreground/40 bg-background'
                    : marcado ? 'h-2.5 w-2.5 bg-emerald-500'
                    : 'h-2.5 w-2.5 border-2 border-muted-foreground/30 bg-background'
                }`} />
                {i < filas.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className={`mb-1 flex flex-1 items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 ${clave ? `border-2 ${estilo.highlight}` : ''}`}>
                <div className="min-w-0">
                  <p className={`text-xs ${clave ? `font-bold ${estilo.text}` : marcado && !finalizadoAparte ? 'font-medium' : 'text-muted-foreground'}`}>
                    {h.label}
                  </p>
                  {finalizadoAparte && marcado && (
                    <p className="text-[10px] text-muted-foreground">Se marca aparte, no cuenta para el cálculo</p>
                  )}
                  {delta !== null && delta > 0 && (
                    <p className="text-[10px] text-muted-foreground">+{duracion(delta)}</p>
                  )}
                </div>
                {marcado
                  ? <Hora min={h.min} estimada={!h.real} className={`text-xs ${clave ? `font-extrabold ${estilo.text}` : finalizadoAparte ? 'text-muted-foreground' : 'font-semibold'}`} />
                  : <span className="text-[11px] italic text-muted-foreground/60">sin marcar</span>}
              </div>
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  )
}

function DatosServicio({ servicio: s }: { servicio: ServicioPago }) {
  const datos: [string, string | null][] = [
    ['Cliente', s.cliente],
    ['Conductor', s.conductor],
    ['Placa', s.placa],
    ['Programación', formatFecha(s.fecha)],
    ['Zona', s.atributos.zona],
    ['Tipo', [s.atributos.tipoServicio, s.atributos.modalidad, s.atributos.tipoCarga].filter(Boolean).join(' · ')],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
      {datos.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="truncate font-semibold" title={value ?? ''}>{value || '—'}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

function DetalleAdicionalDialog({ detalle, servicios, onClose }: {
  detalle: { adicional: Adicional; conductor: string } | null
  servicios: ServicioPago[]
  onClose: () => void
}) {
  const a = detalle?.adicional
  const relacionados = a ? a.servicioIds.map(id => servicios.find(s => s.id === id)).filter((s): s is ServicioPago => !!s) : []
  const estilo = a ? CONCEPTO_ESTILO[a.concepto] : null
  const Icono = estilo?.icon ?? Info
  const unico = relacionados.length === 1 ? relacionados[0] : null
  const claves = new Set(a?.claves ?? [])
  const esClave = unico ? esClaveDe(unico, claves) : () => false
  const duracionTotal = unico && unico.horarios.inicio !== null && unico.horarios.fin !== null
    ? unico.horarios.fin - unico.horarios.inicio : null

  return (
    <Dialog open={!!detalle} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {a && detalle && estilo && (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
              <div className="flex items-center gap-3 pr-8">
                <div className={`rounded-xl p-2.5 ${estilo.soft}`}>
                  <Icono className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="flex items-center gap-2 flex-wrap text-lg">
                    {CONCEPTO_LABEL[a.concepto]}
                    {a.porValidar && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Por validar</span>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {detalle.conductor} · {a.fecha ? formatFecha(a.fecha) : 'Semana completa'}
                  </DialogDescription>
                </div>
                <p className={`shrink-0 text-2xl font-extrabold tabular-nums ${a.porValidar ? 'text-muted-foreground line-through' : estilo.text}`}>
                  {soles(a.monto)}
                </p>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:overflow-hidden">
              {/* Resumen */}
              <div className="space-y-4 p-6 md:overflow-y-auto">
                <div className={`rounded-xl border-2 p-4 ${estilo.highlight}`}>
                  <p className={`mb-1 text-[11px] font-bold uppercase tracking-wider ${estilo.text}`}>Por qué aplica</p>
                  <p className="text-base font-bold leading-snug">{a.detalle}</p>
                  <details className="group mt-2">
                    <summary className="cursor-pointer list-none text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                      <span className="group-open:hidden">Ver regla de operaciones ▸</span>
                      <span className="hidden group-open:inline">Ocultar regla ▾</span>
                    </summary>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{a.regla}</p>
                  </details>
                </div>

                {duracionTotal !== null && duracionTotal > 1440 && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      <strong>Servicio de más de 24 h ({duracion(duracionTotal)}).</strong>{' '}
                      {unico && finEsReal(unico)
                        ? 'Según los registros de la app, el servicio pasó de un día a otro; puede que el contenedor haya pasado la noche parado. Conviene validar este adicional antes de pagarlo.'
                        : 'La fecha del último horario es estimada (el hito no tiene ubicación registrada), así que puede no ser exacta. Conviene validar este adicional antes de pagarlo.'}
                    </p>
                  </div>
                )}

                {unico && (
                  <>
                    <BarraJornada servicio={unico} umbral={a.umbral} estilo={estilo} cita={claves.has('cita')} />

                    <div className="grid grid-cols-2 gap-2">
                      {/* En Odoo 00:00 y "sin cita" se guardan igual (0): se muestra 00:00 como en la ficha del servicio */}
                      <HoraTile
                        label="Hora de cita" value={unico.horaCita ?? 0} destacado={claves.has('cita')} estilo={estilo}
                        nota={unico.horaCita === null ? 'o sin cargar en Odoo' : undefined}
                      />
                      <HoraTile label="Salida de cochera" value={unico.horarios.inicio} destacado={esClave('inicio_ruta')} estilo={estilo} />
                      <HoraTile label="Contenedor devuelto" value={unico.horarios.devolucion} destacado={esClave('contenedor_devuelto')} estilo={estilo} />
                      <HoraTile label="Último horario" value={unico.horarios.fin} destacado={claves.has('fin')} estilo={estilo} />
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-mono text-sm font-bold">{servicioCodigo(unico.name)}</p>
                          {unico.etapa && (
                            <span className={`truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${esFinalizado(unico.etapa) ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                              {unico.etapa}
                            </span>
                          )}
                        </div>
                        <a
                          href={`/servicios/trailers/${unico.id}`} target="_blank" rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold hover:bg-muted"
                        >
                          Ver servicio <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      {a.concepto === 'devolucion_vacio' && (
                        <p className="mb-2 text-[11px] text-muted-foreground">Servicio original del compañero, del que se hizo la devolución.</p>
                      )}
                      <DatosServicio servicio={unico} />
                    </div>
                  </>
                )}

                {relacionados.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Se cuentan {relacionados.length} servicios integrales finalizados. Haz clic en cualquiera para abrirlo.
                  </p>
                )}
              </div>

              {/* Horarios / servicios */}
              <div className="border-t bg-muted/20 p-6 md:overflow-y-auto md:border-t-0 md:border-l">
                {unico ? (
                  <LineaTiempo servicio={unico} claves={claves} umbral={a.umbral} estilo={estilo} />
                ) : relacionados.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Servicios que cuentan ({relacionados.length})
                    </p>
                    {relacionados.map(s => (
                      <a
                        key={s.id} href={`/servicios/trailers/${s.id}`} target="_blank" rel="noreferrer"
                        className="group flex items-center justify-between gap-3 rounded-lg border bg-background p-3 hover:border-foreground/30"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold">{servicioCodigo(s.name)}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{s.cliente ?? '—'}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px]">
                            {formatFecha(s.fecha)} · {s.atributos.zona ?? '—'}
                            {s.horarios.inicio !== null && s.horarios.fin !== null && (
                              <> · <Hora min={s.horarios.inicio} /> → <Hora min={s.horarios.fin} /></>
                            )}
                          </p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No se encontró el servicio en esta semana.</p>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
