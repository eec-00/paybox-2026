'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw, Wallet, ChevronLeft, ChevronRight, ChevronDown, AlertTriangle, Loader2 } from 'lucide-react'
import {
  COLUMNA_LABEL, calcularTarifa, rangoSemanaPago, sabadoDe, servicioCodigo,
  type ServicioPago, type TarifaResultado,
} from '@/lib/pruebas/pagosConductores'

const ETAPA_FINALIZADA = 'Servicio Finalizado'
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
}

export function PagosConductoresSection() {
  const [servicios, setServicios] = useState<ServicioPago[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sabado, setSabado] = useState(() => sabadoDe(new Date()))
  const [soloFinalizados, setSoloFinalizados] = useState(true)
  const [abiertos, setAbiertos] = useState<string[]>([])

  const semana = useMemo(() => rangoSemanaPago(sabado), [sabado])

  const fetchData = async ({ start, end }: { start: string; end: string }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/pruebas/pagos-conductores?start=${start}&end=${end}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar servicios')
      setServicios(data.servicios ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setServicios([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData(semana) }, [semana])

  const resumen = useMemo(() => {
    const porConductor = new Map<string, ResumenConductor>()
    for (const s of servicios) {
      if (soloFinalizados && s.etapa !== ETAPA_FINALIZADA) continue
      const key = s.conductorId ? String(s.conductorId) : 'sin'
      let r = porConductor.get(key)
      if (!r) {
        r = { key, conductor: s.conductor ?? 'Sin conductor', servicios: [], pagables: 0, sinTarifa: 0, subtotal: 0 }
        porConductor.set(key, r)
      }
      const tarifa = calcularTarifa(s.atributos)
      r.servicios.push({ servicio: s, tarifa })
      if (tarifa.monto !== null) {
        r.pagables++
        r.subtotal += tarifa.monto
      } else {
        r.sinTarifa++
      }
    }
    return Array.from(porConductor.values()).sort((a, b) => a.conductor.localeCompare(b.conductor))
  }, [servicios, soloFinalizados])

  const totalServicios = resumen.reduce((s, r) => s + r.servicios.length, 0)
  const totalSinTarifa = resumen.reduce((s, r) => s + r.sinTarifa, 0)
  const totalSubtotal = resumen.reduce((s, r) => s + r.subtotal, 0)

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
              Tarifa por servicio según zona y tipo de carga
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <p className="text-2xl font-extrabold tabular-nums">{soles(totalSubtotal)}</p>
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
              <TableHead className="text-right">Total a pagar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : resumen.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
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
                      <TableCell className="text-right tabular-nums font-bold">{soles(r.subtotal)}</TableCell>
                    </TableRow>
                    {abierto && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={4} className="p-0">
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

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        La zona, el tipo de servicio y el tipo de carga se toman del producto de la orden de venta en Odoo.
        Las devoluciones/retiros de vacío (subtareas) no se cuentan. Contenedor 20 y 40 pagan igual. La semana va de sábado a viernes; el básico mensual no se incluye.
      </p>
    </div>
  )
}
