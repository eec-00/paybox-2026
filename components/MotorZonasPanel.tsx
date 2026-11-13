'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  CASOS_DEMO, VERSION_TARIFARIO, entradaDesdeOdoo, simularTarifa, type ResultadoMotor,
} from '@/lib/pruebas/motorZonas'
import type { DevolucionPago, ServicioPago } from '@/lib/pruebas/pagosConductores'

function soles(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function EstadoBadge({ r }: { r: ResultadoMotor }) {
  if (r.estado === 'requiere_revision') {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-800">Requiere revisión</span>
  }
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">Simulado</span>
}

interface Fila {
  key: string
  etiqueta: string | null
  titulo: string
  esperado: string | null
  r: ResultadoMotor
}

function TablaResultados({ filas }: { filas: Fila[] }) {
  const [abiertos, setAbiertos] = useState<string[]>([])
  const toggle = (k: string) => setAbiertos(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Servicio</TableHead>
          <TableHead>Caso</TableHead>
          <TableHead>Resultado</TableHead>
          <TableHead className="text-right">Importe</TableHead>
          <TableHead>Regla</TableHead>
          <TableHead>Motivo / alerta</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map(({ key, etiqueta, titulo, esperado, r }) => {
          const abierto = abiertos.includes(key)
          return (
            <Fragment key={key}>
              <TableRow className="cursor-pointer" onClick={() => toggle(key)}>
                <TableCell>
                  {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap">
                  {etiqueta && <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold">{etiqueta}</span>}
                  {r.servicio}
                  {r.origen === 'mock' && <span className="ml-1.5 text-[11px] text-muted-foreground">(mock)</span>}
                </TableCell>
                <TableCell className="text-sm whitespace-normal min-w-[220px]">
                  {titulo}
                  {esperado && <p className="text-[11px] text-muted-foreground">Esperado: {esperado}</p>}
                </TableCell>
                <TableCell><EstadoBadge r={r} /></TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {r.total === null ? '—' : soles(r.total)}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">{r.ruleIds.length ? r.ruleIds.join(' + ') : '—'}</TableCell>
                <TableCell className="text-xs whitespace-normal min-w-[260px] max-w-[420px]">
                  {r.motivos.length > 0
                    ? <span className="text-red-800">{r.motivos[0]}</span>
                    : r.alertas.length > 0
                      ? <span className="text-amber-800">{r.alertas[0]}{r.alertas.length > 1 && ` (+${r.alertas.length - 1} alertas)`}</span>
                      : '—'}
                </TableCell>
              </TableRow>
              {abierto && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell />
                  <TableCell colSpan={6} className="py-3 text-xs space-y-2 whitespace-normal">
                    <div>
                      <p className="font-semibold mb-1">Líneas de liquidación (simuladas)</p>
                      <ul className="space-y-1">
                        {r.lineas.map(l => (
                          <li key={`${l.tramo}-${l.conductorId}`} className="rounded border border-border/50 bg-background/60 px-2 py-1">
                            <span className="font-medium">{l.servicio} · {l.tramo === 'principal' ? 'Principal' : 'Retorno'} · {l.conductor ?? 'sin conductor'}</span>
                            {' · '}{l.concepto}{' · '}
                            <span className="font-semibold">{l.monto === null ? 'sin importe' : soles(l.monto)}</span>
                            <br />
                            <span className="text-muted-foreground">
                              Regla: {l.ruleId ?? '—'} · Hito: {l.hito ? `${l.hito.codigo} ${l.hito.etiqueta} · ${l.hito.momento}` : 'sin hito operativo'}
                              {' · '}Versión: {l.version}{l.fuente ? ` · Fuente: ${l.fuente}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {r.candidatos.length > 0 && <p><span className="font-semibold">Reglas candidatas:</span> {r.candidatos.join(', ')}</p>}
                    {r.motivos.length > 0 && <p><span className="font-semibold">Requiere revisión porque:</span> {r.motivos.join(' · ')}</p>}
                    {r.alertas.length > 0 && <p><span className="font-semibold">Alertas:</span> {r.alertas.join(' · ')}</p>}
                    <div>
                      <p className="font-semibold mb-1">Traza del motor (ficha §3, pasos A–D)</p>
                      <ol className="space-y-0.5">
                        {r.traza.map((t, i) => (
                          <li key={i} className={t.ok ? '' : 'text-red-700'}>
                            <span className="font-mono">{t.paso}</span> {t.ok ? '✓' : '✗'} {t.detalle}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function MotorZonasPanel({ servicios, devoluciones }: { servicios: ServicioPago[]; devoluciones: DevolucionPago[] }) {
  const [abierto, setAbierto] = useState(true)
  const [verSemana, setVerSemana] = useState(false)

  const demo: Fila[] = useMemo(() => CASOS_DEMO.map(c => ({
    key: c.entrada.servicio, etiqueta: c.prueba, titulo: c.titulo, esperado: c.esperado, r: simularTarifa(c.entrada),
  })), [])

  const reales: Fila[] = useMemo(() => servicios.map(s => {
    const a = s.atributos
    return {
      key: `odoo-${s.id}`, etiqueta: null, esperado: null, r: simularTarifa(entradaDesdeOdoo(s, devoluciones)),
      titulo: `${s.cliente ?? 'Sin cliente'} · ${[a.zona, a.tipoServicio, a.modalidad, a.tipoCarga].filter(Boolean).join(' · ') || 'sin variante'}`,
    }
  }), [servicios, devoluciones])

  const simulados = reales.filter(f => f.r.estado === 'simulado').length

  return (
    <div className="rounded-xl border border-primary/30">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? '' : '-rotate-90'}`} />
        Motor de tarifas · casos de prueba
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">Simulación</span>
      </button>
      {abierto && (
        <div className="border-t border-primary/20 space-y-3 pb-3">
          <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <p>
              <strong>No es monto de pago.</strong> Importes históricos del {VERSION_TARIFARIO}, vigentes desde enero 2026
              según Margiory; se simulan hasta el cierre del piloto (Rosario contrasta liquidaciones). No paga, no descuenta
              ni escribe en Odoo. «Requiere revisión» significa que falta un dato o una decisión, no S/ 0.
            </p>
          </div>

          <div className="overflow-x-auto">
            <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Casos de prueba controlados (datos mock)
            </p>
            <p className="px-4 pb-2 text-xs text-muted-foreground">
              <strong>P1–P3:</strong> las tres pruebas obligatorias de la ficha (Ate vs. SJL, Crosland A/B, Lurín General vs. IMO).{' '}
              <strong>Ruta:</strong> ruta especial con itinerario exacto del Excel.{' '}
              <strong>Bloqueo:</strong> controles que deben frenar el cálculo cuando falta un dato o una decisión.
            </p>
            <TablaResultados filas={demo} />
          </div>

          <div className="overflow-x-auto">
            <button
              type="button"
              onClick={() => setVerSemana(v => !v)}
              aria-expanded={verSemana}
              className="flex items-center gap-1.5 px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verSemana ? '' : '-rotate-90'}`} />
              Servicios reales de la semana ({reales.length}) · {simulados} simulados
            </button>
            {verSemana && (
              <>
                <p className="px-4 pb-1 text-xs text-muted-foreground">
                  El destino físico y el itinerario todavía no son datos estructurados en Odoo: hasta que Operaciones confirme
                  la fuente, los servicios ordinarios quedan en revisión. Los tramos se acreditan con hitos de la app
                  (I08/I09, I12, D10/D11), nunca con el cierre administrativo.
                </p>
                {reales.length > 0
                  ? <TablaResultados filas={reales} />
                  : <p className="px-4 py-4 text-sm text-muted-foreground">Sin servicios en la semana.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
