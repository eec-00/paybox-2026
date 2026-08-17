'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Trash2, CalendarPlus, Plane, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  getAvisos, getSaldo, getEstado, getEstadoColor, getEstadoLabel,
} from '@/lib/vacaciones/calculos'
import type {
  VacacionEmpleadoConDetalle, VacacionSolicitudTipo, VacacionSolicitudModalidad,
} from '@/lib/types/vacaciones.types'

function fmt(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-PE')
}

function diasEntre(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0
  const a = new Date(inicio + 'T00:00:00')
  const b = new Date(fin + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
}

interface Props {
  empleado: VacacionEmpleadoConDetalle
  open: boolean
  onClose: () => void
  onChanged: () => void
  canCreate: boolean
  /** Reservado para futuras acciones de edición dentro del detalle. */
  canEdit: boolean
  canDelete: boolean
}

export function VacacionEmpleadoDetalle({ empleado, open, onClose, onChanged, canCreate, canDelete }: Props) {
  const supabase = createClient()
  const registros = [...empleado.registros].sort((a, b) => (a.fecha_record < b.fecha_record ? 1 : -1))
  const solicitudes = empleado.solicitudes

  const [nuevoRecordOpen, setNuevoRecordOpen] = useState(false)
  const [nuevoRecordFecha, setNuevoRecordFecha] = useState('')
  const [nuevoRecordDias, setNuevoRecordDias] = useState('15')
  const [savingRecord, setSavingRecord] = useState(false)

  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null)
  const [deletingRecord, setDeletingRecord] = useState(false)

  const [salidaOpen, setSalidaOpen] = useState(false)
  const [salidaRegistroId, setSalidaRegistroId] = useState<string>('')
  const [salidaTipo, setSalidaTipo] = useState<VacacionSolicitudTipo>('reglamentarias')
  const [salidaModalidad, setSalidaModalidad] = useState<VacacionSolicitudModalidad>('total')
  const [salidaInicio, setSalidaInicio] = useState('')
  const [salidaFin, setSalidaFin] = useState('')
  const [salidaObs, setSalidaObs] = useState('')
  const [savingSalida, setSavingSalida] = useState(false)

  const dias = diasEntre(salidaInicio, salidaFin)

  const openNuevoRecord = () => {
    setNuevoRecordFecha('')
    setNuevoRecordDias('15')
    setNuevoRecordOpen(true)
  }

  const handleCrearRecord = async () => {
    if (!nuevoRecordFecha) { toast.error('Indica la fecha del récord'); return }
    setSavingRecord(true)
    try {
      const { error } = await supabase.from('vacaciones_registros').insert({
        empleado_id: empleado.id,
        fecha_record: nuevoRecordFecha,
        dias_correspondientes: parseFloat(nuevoRecordDias) || 15,
      })
      if (error) throw error
      toast.success('Récord vacacional creado')
      setNuevoRecordOpen(false)
      onChanged()
    } catch (err: any) {
      toast.error(err.message || 'Error al crear el récord')
    } finally {
      setSavingRecord(false)
    }
  }

  const handleEliminarRecord = async () => {
    if (!deleteRecordId) return
    setDeletingRecord(true)
    try {
      const { error } = await supabase.from('vacaciones_registros').delete().eq('id', deleteRecordId)
      if (error) throw error
      toast.success('Récord eliminado')
      setDeleteRecordId(null)
      onChanged()
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar el récord')
    } finally {
      setDeletingRecord(false)
    }
  }

  const openSalida = () => {
    setSalidaRegistroId(registros[0]?.id || '')
    setSalidaTipo('reglamentarias')
    setSalidaModalidad('total')
    setSalidaInicio('')
    setSalidaFin('')
    setSalidaObs('')
    setSalidaOpen(true)
  }

  const handleRegistrarSalida = async () => {
    const registro = registros.find((r) => r.id === salidaRegistroId)
    if (!registro) { toast.error('Selecciona el récord al que corresponde esta salida'); return }
    if (!salidaInicio || !salidaFin) { toast.error('Indica fecha de inicio y fin'); return }
    if (salidaFin < salidaInicio) { toast.error('La fecha de fin no puede ser antes que la de inicio'); return }

    // Determina en qué tramo (1 o 2) queda esta salida, según lo ya gozado.
    const slot: 1 | 2 | null = registro.dias_gozados_1 === 0 ? 1 : (registro.dias_gozados_2 === 0 ? 2 : null)
    if (slot === null) {
      toast.error('Este récord ya tiene 2 salidas registradas (el máximo permitido para fraccionar).')
      return
    }

    setSavingSalida(true)
    try {
      const { error: errSolicitud } = await supabase.from('vacaciones_solicitudes').insert({
        empleado_id: empleado.id,
        registro_id: registro.id,
        tipo: salidaTipo,
        modalidad: salidaModalidad,
        fecha_inicio: salidaInicio,
        fecha_fin: salidaFin,
        dias,
        observaciones: salidaObs.trim() || null,
      })
      if (errSolicitud) throw errSolicitud

      const patch = slot === 1
        ? { dias_gozados_1: dias, fecha_salida_1: salidaInicio }
        : { dias_gozados_2: dias, fecha_salida_2: salidaInicio }
      const { error: errRegistro } = await supabase.from('vacaciones_registros').update(patch).eq('id', registro.id)
      if (errRegistro) throw errRegistro

      toast.success('Salida de vacaciones registrada')
      setSalidaOpen(false)
      onChanged()
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar la salida')
    } finally {
      setSavingSalida(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{empleado.nombre_completo}</DialogTitle>
            <DialogDescription>
              {empleado.empresa} · {empleado.cargo || 'Sin cargo'} · DNI {empleado.dni || '—'} · Ingreso {fmt(empleado.fecha_ingreso)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Récords vacacionales</h3>
                {canCreate && (
                  <Button size="sm" variant="outline" onClick={openNuevoRecord}>
                    <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Nuevo récord
                  </Button>
                )}
              </div>

              {registros.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                  Sin récords registrados todavía.
                </p>
              ) : (
                <div className="space-y-2">
                  {registros.map((r) => {
                    const saldo = getSaldo(r)
                    const estado = getEstado(r, solicitudes)
                    const avisos = getAvisos(r.fecha_record)
                    return (
                      <div key={r.id} className="border rounded-md p-3 text-sm">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="font-medium">Récord {fmt(r.fecha_record)}</div>
                          <div className="flex items-center gap-2">
                            <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', getEstadoColor(estado))}>
                              {getEstadoLabel(estado)}
                            </span>
                            {canDelete && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteRecordId(r.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-muted-foreground">
                          <div>Días MYPE: <span className="text-foreground font-medium">{r.dias_correspondientes}</span></div>
                          <div>Gozados 1: <span className="text-foreground font-medium">{r.dias_gozados_1}</span></div>
                          <div>Gozados 2: <span className="text-foreground font-medium">{r.dias_gozados_2}</span></div>
                          <div>Saldo: <span className="text-foreground font-medium">{saldo}</span></div>
                        </div>
                        {estado === 'pendiente' && (
                          <p className="mt-2 text-xs text-yellow-800">
                            Límite legal para programar: {fmt(avisos.limite.toISOString().slice(0, 10))}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Solicitudes / salidas</h3>
                {canCreate && registros.length > 0 && (
                  <Button size="sm" variant="outline" onClick={openSalida}>
                    <Plane className="h-3.5 w-3.5 mr-1" /> Registrar salida
                  </Button>
                )}
              </div>

              {solicitudes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                  Sin salidas registradas todavía.
                </p>
              ) : (
                <div className="space-y-2">
                  {[...solicitudes]
                    .sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : -1))
                    .map((s) => (
                      <div key={s.id} className="border rounded-md p-3 text-sm flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <div className="font-medium">{fmt(s.fecha_inicio)} → {fmt(s.fecha_fin)} ({s.dias} días)</div>
                          <div className="text-xs text-muted-foreground">
                            {s.tipo} · {s.modalidad} · Reincorporación: {fmt(s.fecha_reincorporacion)}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{s.estado}</span>
                      </div>
                    ))}
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nuevo récord */}
      <Dialog open={nuevoRecordOpen} onOpenChange={setNuevoRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo récord vacacional</DialogTitle>
            <DialogDescription>Fecha del aniversario que da origen al récord (normalmente ingreso + N años).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Fecha del récord</Label>
              <Input type="date" value={nuevoRecordFecha} onChange={(e) => setNuevoRecordFecha(e.target.value)} />
            </div>
            <div>
              <Label>Días correspondientes</Label>
              <Input type="number" value={nuevoRecordDias} onChange={(e) => setNuevoRecordDias(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setNuevoRecordOpen(false)}>Cancelar</Button>
            <Button onClick={handleCrearRecord} disabled={savingRecord}>
              {savingRecord ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear récord'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Registrar salida */}
      <Dialog open={salidaOpen} onOpenChange={setSalidaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar salida de vacaciones</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Récord</Label>
              <Select value={salidaRegistroId} onValueChange={setSalidaRegistroId}>
                <SelectTrigger><SelectValue placeholder="Selecciona el récord" /></SelectTrigger>
                <SelectContent>
                  {registros.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Récord {fmt(r.fecha_record)} · saldo {getSaldo(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={salidaTipo} onValueChange={(v) => setSalidaTipo(v as VacacionSolicitudTipo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reglamentarias">Reglamentarias</SelectItem>
                    <SelectItem value="atrasadas">Atrasadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modalidad</Label>
                <Select value={salidaModalidad} onValueChange={(v) => setSalidaModalidad(v as VacacionSolicitudModalidad)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total</SelectItem>
                    <SelectItem value="fraccionado">Fraccionado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha inicio</Label>
                <Input type="date" value={salidaInicio} onChange={(e) => setSalidaInicio(e.target.value)} />
              </div>
              <div>
                <Label>Fecha fin</Label>
                <Input type="date" value={salidaFin} onChange={(e) => setSalidaFin(e.target.value)} />
              </div>
            </div>
            {salidaInicio && salidaFin && salidaFin >= salidaInicio && (
              <p className="text-xs text-muted-foreground">{dias} día(s) · Reincorporación: {fmt(new Date(new Date(salidaFin + 'T00:00:00').getTime() + 86_400_000).toISOString().slice(0, 10))}</p>
            )}
            <div>
              <Label>Observaciones (opcional)</Label>
              <Textarea value={salidaObs} onChange={(e) => setSalidaObs(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSalidaOpen(false)}>Cancelar</Button>
            <Button onClick={handleRegistrarSalida} disabled={savingSalida}>
              {savingSalida ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar salida'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRecordId} onOpenChange={(o) => !o && setDeleteRecordId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar récord vacacional?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el récord y las salidas asociadas quedarán sin récord vinculado. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingRecord}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminarRecord} disabled={deletingRecord} className="bg-red-600 hover:bg-red-700">
              {deletingRecord ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
