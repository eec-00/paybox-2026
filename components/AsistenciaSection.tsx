'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentUserProfile } from '@/lib/utils/auth'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Fingerprint, RefreshCw, XCircle, Trash2, MapPin, ExternalLink, Users, CheckCircle2, CircleDashed,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Marca {
  id: string
  conductor_id: string
  conductor_nombre: string | null
  conductor_dni: string | null
  lat: number
  lng: number
  accuracy: number | null
  created_at: string
  fecha: string
}

interface Conductor {
  id: string
  full_name: string | null
  dni: string | null
  odoo_employee_name: string | null
}

type Rango = 'hoy' | '7d' | '30d' | 'todo'

function cutoffFor(rango: Rango): string | null {
  if (rango === 'todo') return null
  const d = new Date()
  if (rango === 'hoy') d.setHours(0, 0, 0, 0)
  if (rango === '7d') d.setDate(d.getDate() - 7)
  if (rango === '30d') d.setDate(d.getDate() - 30)
  return d.toISOString()
}

function todayLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}

export function AsistenciaSection() {
  const supabase = createClient()

  const [marcas, setMarcas] = useState<Marca[]>([])
  const [conductores, setConductores] = useState<Conductor[]>([])
  const [loading, setLoading] = useState(true)
  const [rango, setRango] = useState<Rango>('hoy')
  const [conductorFiltro, setConductorFiltro] = useState<string>('__todos__')
  const [canDelete, setCanDelete] = useState(false)

  const [deleteMarca, setDeleteMarca] = useState<Marca | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    (async () => {
      const profile = await getCurrentUserProfile()
      const isPriv = profile?.role === 'admin' || profile?.role === 'developer'
      setCanDelete(isPriv || !!profile?.module_permissions?.rrhh?.can_delete)
    })()
    supabase.rpc('get_rrhh_usuarios').then(({ data }) => {
      if (data) setConductores((data as any[]).filter((u) => u.role === 'conductor'))
    })
  }, [])

  const fetchMarcas = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('asistencias_conductor')
        .select('id, conductor_id, conductor_nombre, conductor_dni, lat, lng, accuracy, created_at, fecha')
        .order('created_at', { ascending: false })
        .limit(500)

      const cutoff = cutoffFor(rango)
      if (cutoff) query = query.gte('created_at', cutoff)

      const { data, error } = await query
      if (error) throw error
      setMarcas(data || [])
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar asistencias')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMarcas() }, [rango])

  const marcasFiltradas = useMemo(() => {
    if (conductorFiltro === '__todos__') return marcas
    return marcas.filter((m) => m.conductor_id === conductorFiltro)
  }, [marcas, conductorFiltro])

  // Vista "Hoy": roster completo de conductores cruzado con la marca del día (o ausencia de ella).
  const rosterHoy = useMemo(() => {
    const marcasHoyPorConductor = new Map(
      marcas.filter((m) => m.fecha === todayLima()).map((m) => [m.conductor_id, m])
    )
    return conductores
      .filter((c) => conductorFiltro === '__todos__' || c.id === conductorFiltro)
      .map((c) => ({ conductor: c, marca: marcasHoyPorConductor.get(c.id) || null }))
      .sort((a, b) => {
        if (!!a.marca === !!b.marca) return (a.conductor.full_name || '').localeCompare(b.conductor.full_name || '')
        return a.marca ? 1 : -1 // sin marcar primero
      })
  }, [conductores, marcas, conductorFiltro])

  const marcaronHoy = rosterHoy.filter((r) => r.marca).length

  const handleDelete = async () => {
    if (!deleteMarca) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('asistencias_conductor').delete().eq('id', deleteMarca.id)
      if (error) throw error
      toast.success('Marca eliminada')
      setDeleteMarca(null)
      fetchMarcas()
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar la marca')
    } finally {
      setDeleting(false)
    }
  }

  const esHoy = rango === 'hoy'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Fingerprint className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">Asistencia</h2>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {esHoy
                ? `${marcaronHoy} de ${rosterHoy.length} conductor${rosterHoy.length !== 1 ? 'es' : ''} marcaron hoy`
                : `${marcasFiltradas.length} marca${marcasFiltradas.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchMarcas} disabled={loading} className="h-8 gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 bg-card/40 p-3 rounded-xl border border-border/50 shadow-sm">
        <Select value={conductorFiltro} onValueChange={setConductorFiltro}>
          <SelectTrigger className="h-9 text-xs flex-1 min-w-[200px]">
            <SelectValue placeholder="Todos los conductores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos__">Todos los conductores</SelectItem>
            {conductores.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.full_name || c.odoo_employee_name || c.dni}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rango} onValueChange={(v) => setRango(v as Rango)}>
          <SelectTrigger className="h-9 text-xs w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoy">Hoy</SelectItem>
            <SelectItem value="7d">Últimos 7 días</SelectItem>
            <SelectItem value="30d">Últimos 30 días</SelectItem>
            <SelectItem value="todo">Todo</SelectItem>
          </SelectContent>
        </Select>
        {conductorFiltro !== '__todos__' && (
          <Button variant="ghost" size="sm" onClick={() => setConductorFiltro('__todos__')} className="h-9 px-2 text-muted-foreground hover:text-destructive">
            <XCircle className="h-4 w-4" />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" /> Cargando asistencias...
        </div>
      ) : esHoy ? (
        // ---- Vista de hoy: roster completo, marcaron y no marcaron ----
        rosterHoy.length === 0 ? (
          <div className="text-center py-16 border rounded-xl">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">No hay conductores registrados en el sistema.</p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="whitespace-nowrap font-bold text-xs">Conductor</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs text-center">Estado</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs">Ubicación</TableHead>
                    <TableHead className="whitespace-nowrap font-bold text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rosterHoy.map(({ conductor, marca }) => (
                    <TableRow key={conductor.id} className={cn(!marca && 'bg-amber-50/40')}>
                      <TableCell>
                        <div className="font-medium">{conductor.full_name || conductor.odoo_employee_name || 'Sin nombre'}</div>
                        <div className="text-xs text-muted-foreground font-mono">{conductor.dni || '—'}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        {marca ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircle2 className="h-3 w-3" /> Marcó {fmtHora(marca.created_at)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                            <CircleDashed className="h-3 w-3" /> No marcó
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {marca && (
                          <a
                            href={`https://www.google.com/maps?q=${marca.lat},${marca.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <MapPin className="h-3.5 w-3.5" /> Ver mapa <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canDelete && marca && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeleteMarca(marca)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )
      ) : marcasFiltradas.length === 0 ? (
        // ---- Vista histórica: solo el registro de marcas ----
        <div className="text-center py-16 border rounded-xl">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">Sin marcas de asistencia en este rango.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="whitespace-nowrap font-bold text-xs">Conductor</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs">Fecha y hora</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs">Ubicación</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marcasFiltradas.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{m.conductor_nombre || 'Sin nombre'}</div>
                      <div className="text-xs text-muted-foreground font-mono">{m.conductor_dni || '—'}</div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{fmtFechaHora(m.created_at)}</TableCell>
                    <TableCell>
                      <a
                        href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <MapPin className="h-3.5 w-3.5" /> Ver mapa <ExternalLink className="h-3 w-3" />
                      </a>
                      {m.accuracy != null && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">±{Math.round(m.accuracy)}m</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeleteMarca(m)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteMarca} onOpenChange={(o) => !o && setDeleteMarca(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta marca de asistencia?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMarca?.conductor_nombre} · {deleteMarca && fmtFechaHora(deleteMarca.created_at)}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
