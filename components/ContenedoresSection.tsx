'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, PackageSearch, Warehouse, Truck, ArrowRight, Circle } from 'lucide-react'
import { calcularProgreso, ProgresoBadge, type ProgresoServicio } from '@/lib/servicios/progreso'

interface OdooTask {
  id: number
  name: string
  parent_id: [number, string] | false
  partner_id: [number, string] | false
  x_studio_nmero_de_contenedor: string | false
  x_studio_fecha_de_la_programacin: string | false
  x_studio_es_import?: boolean
  x_studio_es_export?: boolean
  x_studio_subtarea_de_devolucion_creada?: boolean
  x_studio_subtarea_de_retiro_creada?: boolean
  [key: string]: unknown
}

// El sentido del tránsito por la cochera es opuesto según el tipo:
// - Importación (subtarea = devolución): el conductor principal DEJA el
//   contenedor en cochera al terminar; la subtarea lo recoge y lo devuelve.
// - Exportación (subtarea = retiro): la subtarea RETIRA el contenedor y lo
//   deja en cochera; el conductor principal lo recoge y sigue el servicio.
type TipoSubtarea = 'devolucion' | 'retiro'
type EstadoContenedor = 'pendiente' | 'en_transito' | 'en_cochera' | 'completado'

function estadoContenedor(tipo: TipoSubtarea, padre: ProgresoServicio, subtarea: ProgresoServicio): EstadoContenedor {
  if (tipo === 'devolucion') {
    if (subtarea.estado === 'completado') return 'completado'
    if (subtarea.estado === 'en_proceso') return 'en_transito'
    return padre.estado === 'completado' ? 'en_cochera' : 'en_transito'
  }
  // retiro (exportación)
  if (subtarea.estado === 'sin_iniciar') return 'pendiente'
  if (subtarea.estado === 'en_proceso') return 'en_transito'
  if (padre.estado === 'sin_iniciar') return 'en_cochera'
  if (padre.estado === 'en_proceso') return 'en_transito'
  return 'completado'
}

const ESTADO_INFO: Record<EstadoContenedor, { label: string; badgeClass: string; dotClass: string }> = {
  pendiente: { label: 'Pendiente de retiro', badgeClass: 'bg-gray-100 text-gray-600', dotClass: 'fill-gray-400 text-gray-400' },
  en_transito: { label: 'En tránsito', badgeClass: 'bg-blue-100 text-blue-700', dotClass: 'fill-blue-500 text-blue-500' },
  en_cochera: { label: 'En cochera', badgeClass: 'bg-amber-100 text-amber-800', dotClass: 'fill-amber-500 text-amber-500' },
  completado: { label: 'Entregado', badgeClass: 'bg-green-100 text-green-700', dotClass: 'fill-green-500 text-green-500' },
}

function EstadoBadge({ estado }: { estado: EstadoContenedor }) {
  const info = ESTADO_INFO[estado]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${info.badgeClass}`}>
      <Circle className={`h-2 w-2 ${info.dotClass}`} /> {info.label}
    </span>
  )
}

function m2oName(val: [number, string] | false): string {
  return val ? val[1] : '—'
}
function servicioCodigo(name: string): string {
  return name.includes(' - ') ? name.split(' - ')[0] : name
}
function formatDate(value: string | false): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

interface ContenedorRow {
  padre: OdooTask
  subtarea: OdooTask
  tipo: TipoSubtarea
  progresoPadre: ProgresoServicio
  progresoSubtarea: ProgresoServicio
  estado: EstadoContenedor
}

export function ContenedoresSection() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<OdooTask[]>([])
  const [progresoMap, setProgresoMap] = useState<Map<number, number>>(new Map())
  const [completadosSet, setCompletadosSet] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [estadoFilter, setEstadoFilter] = useState<'activos' | 'todos'>('activos')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [res, progresoRes, completadosRes] = await Promise.all([
        fetch('/api/servicios'),
        supabase.from('conductor_servicios_progreso').select('servicio_id, step_actual'),
        supabase.from('conductor_servicios_completados').select('servicio_id'),
      ])
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Error al cargar servicios')
      }
      const data = await res.json()
      setTasks(data.tasks ?? [])
      setProgresoMap(new Map(
        (progresoRes.data ?? []).map((p: { servicio_id: number; step_actual: number }) => [p.servicio_id, p.step_actual])
      ))
      setCompletadosSet(new Set((completadosRes.data ?? []).map((c: { servicio_id: number }) => c.servicio_id)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Arma un par (servicio principal + subtarea) por cada servicio que haya
  // generado una subtarea de devolución (importación) o retiro (exportación).
  const contenedores = useMemo((): ContenedorRow[] => {
    const porPadreId = new Map<number, OdooTask[]>()
    for (const t of tasks) {
      if (Array.isArray(t.parent_id)) {
        const arr = porPadreId.get(t.parent_id[0]) || []
        arr.push(t)
        porPadreId.set(t.parent_id[0], arr)
      }
    }

    const rows: ContenedorRow[] = []
    for (const padre of tasks) {
      if (padre.parent_id) continue // solo servicios principales
      const tipo: TipoSubtarea | null = padre.x_studio_subtarea_de_devolucion_creada
        ? 'devolucion'
        : padre.x_studio_subtarea_de_retiro_creada
        ? 'retiro'
        : null
      if (!tipo) continue

      const subtarea = (porPadreId.get(padre.id) || [])[0]
      if (!subtarea) continue // la subtarea todavía no llegó en la respuesta de Odoo

      const progresoPadre = calcularProgreso(padre, progresoMap, completadosSet)
      const progresoSubtarea = calcularProgreso(subtarea, progresoMap, completadosSet)
      rows.push({
        padre, subtarea, tipo, progresoPadre, progresoSubtarea,
        estado: estadoContenedor(tipo, progresoPadre, progresoSubtarea),
      })
    }
    return rows.sort((a, b) => servicioCodigo(b.padre.name).localeCompare(servicioCodigo(a.padre.name), undefined, { numeric: true }))
  }, [tasks, progresoMap, completadosSet])

  const filtrados = useMemo(
    () => estadoFilter === 'activos' ? contenedores.filter((c) => c.estado !== 'completado') : contenedores,
    [contenedores, estadoFilter]
  )

  const enCochera = contenedores.filter((c) => c.estado === 'en_cochera').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <PackageSearch className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">Contenedores</h2>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Servicios con devolución/retiro a cargo de otro conductor
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="h-8 gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Resumen destacado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.keys(ESTADO_INFO) as EstadoContenedor[]).map((estado) => (
          <div key={estado} className={`rounded-xl border p-3 ${estado === 'en_cochera' ? 'border-amber-300 bg-amber-50/60' : 'bg-card/40 border-border/50'}`}>
            <p className="text-2xl font-extrabold text-foreground tabular-nums">
              {contenedores.filter((c) => c.estado === estado).length}
            </p>
            <p className="text-[11px] text-muted-foreground font-medium">{ESTADO_INFO[estado].label}</p>
          </div>
        ))}
      </div>

      {enCochera > 0 && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          <Warehouse className="h-4 w-4 shrink-0" />
          <p><strong>{enCochera}</strong> contenedor{enCochera !== 1 ? 'es' : ''} actualmente en la cochera, esperando que otro conductor complete su servicio.</p>
        </div>
      )}

      {/* Filtro */}
      <div className="flex items-center gap-2 bg-card/40 p-3 rounded-xl border border-border/50 shadow-sm">
        <Select value={estadoFilter} onValueChange={(v) => setEstadoFilter(v as 'activos' | 'todos')}>
          <SelectTrigger className="h-9 text-xs w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activos">Solo pendientes (ocultar entregados)</SelectItem>
            <SelectItem value="todos">Todos, incluidos entregados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg p-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Cargando contenedores...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 border rounded-xl">
          <PackageSearch className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">
            {contenedores.length === 0
              ? 'No hay servicios con devolución/retiro a cargo de otro conductor.'
              : 'No hay contenedores pendientes — todos fueron entregados.'}
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-bold">Servicio</TableHead>
                  <TableHead className="text-xs font-bold">Cliente</TableHead>
                  <TableHead className="text-xs font-bold">Contenedor</TableHead>
                  <TableHead className="text-xs font-bold">Tipo</TableHead>
                  <TableHead className="text-xs font-bold">Servicio principal</TableHead>
                  <TableHead className="text-xs font-bold text-center w-6" />
                  <TableHead className="text-xs font-bold">Subtarea</TableHead>
                  <TableHead className="text-xs font-bold text-center">Estado del contenedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map(({ padre, subtarea, tipo, progresoPadre, progresoSubtarea, estado }) => (
                  <TableRow key={padre.id} className="text-xs">
                    <TableCell className="font-medium whitespace-nowrap" title={padre.name}>
                      {servicioCodigo(padre.name)}
                      <p className="text-[10px] text-muted-foreground font-normal">{formatDate(padre.x_studio_fecha_de_la_programacin)}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{m2oName(padre.partner_id)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono">{padre.x_studio_nmero_de_contenedor || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {tipo === 'devolucion' ? 'Importación · Devolución' : 'Exportación · Retiro'}
                    </TableCell>
                    <TableCell>
                      <ProgresoBadge progreso={progresoPadre} />
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      <ArrowRight className="h-3.5 w-3.5 mx-auto" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                        <ProgresoBadge progreso={progresoSubtarea} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[160px]">{subtarea.name}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <EstadoBadge estado={estado} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
