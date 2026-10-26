'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Camera, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, ShieldAlert, Trash2, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fechaUTC, hoyLima, sumarDias } from '@/lib/fechas'
import {
  LABEL_MARCA, TIPOS_MARCA, fmtDuracion, horaLima, isoLima, resumirDia,
  type Aviso, type Marca, type OficinaConfig, type TipoMarca, type Trabajador,
} from '@/lib/oficina/calculos'
import { cargarMarcas, type PermisosOficina } from '@/components/OficinaAsistenciaSection'

const ESTILO_AVISO: Record<Aviso['tipo'], string> = {
  ausente: 'bg-red-100 text-red-800 border-red-200',
  falta_marca: 'bg-red-100 text-red-800 border-red-200',
  sospechosa: 'bg-red-600 text-white border-red-600',
  nocturno: 'bg-purple-100 text-purple-800 border-purple-200',
  tardanza: 'bg-amber-100 text-amber-800 border-amber-200',
  tarde_compenso: 'bg-sky-50 text-sky-700 border-sky-200',
  sin_almuerzo: 'bg-gray-100 text-gray-700 border-gray-200',
  almuerzo_corto: 'bg-orange-100 text-orange-800 border-orange-200',
  almuerzo_largo: 'bg-orange-100 text-orange-800 border-orange-200',
}

export function AvisoBadge({ aviso }: { aviso: Aviso }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', ESTILO_AVISO[aviso.tipo])}>
      {aviso.texto}
    </span>
  )
}

export function fmtDiaLargo(fecha: string): string {
  const s = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(fechaUTC(fecha))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface CeldaSeleccionada { trabajador: Trabajador; tipo: TipoMarca; marca: Marca | null }

export function OficinaDiario({ config, trabajadores, permisos, fechaInicial }: {
  config: OficinaConfig
  trabajadores: Trabajador[]
  permisos: PermisosOficina
  fechaInicial: string | null
}) {
  const hoy = hoyLima()
  const [fecha, setFecha] = useState(fechaInicial ?? hoy)
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [loading, setLoading] = useState(true)
  const [celda, setCelda] = useState<CeldaSeleccionada | null>(null)

  useEffect(() => { if (fechaInicial) setFecha(fechaInicial) }, [fechaInicial])

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      setMarcas(await cargarMarcas(fecha, fecha))
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar marcas')
    } finally {
      setLoading(false)
    }
  }, [fecha])

  useEffect(() => { cargar() }, [cargar])

  const filas = useMemo(() => trabajadores.map((t) => ({
    trabajador: t,
    dia: resumirDia(fecha, marcas.filter((m) => m.user_id === t.user_id), t, config, hoy),
  })), [trabajadores, marcas, fecha, config, hoy])

  const marcaron = filas.filter((f) => f.dia.marcas.entrada).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setFecha(sumarDias(fecha, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            className="h-9 w-40"
          />
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={fecha >= hoy} onClick={() => setFecha(sumarDias(fecha, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {fecha !== hoy && (
            <Button variant="ghost" size="sm" onClick={() => setFecha(hoy)}>Hoy</Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {fmtDiaLargo(fecha)} · <span className="font-medium text-foreground">{marcaron} de {filas.length}</span> marcaron entrada
          </p>
          <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">Trabajador</TableHead>
              {TIPOS_MARCA.map((t) => <TableHead key={t} className="text-center whitespace-nowrap">{LABEL_MARCA[t]}</TableHead>)}
              <TableHead className="text-center">Almuerzo</TableHead>
              <TableHead className="text-center">Trabajado</TableHead>
              <TableHead className="min-w-48">Avisos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No hay trabajadores de oficina activos. Agrégalos en Configuración.
                </TableCell>
              </TableRow>
            )}
            {filas.map(({ trabajador, dia }) => (
              <TableRow key={trabajador.user_id}>
                <TableCell>
                  <p className="font-medium">{trabajador.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {dia.horario ? `Horario ${dia.horario.entrada}–${dia.horario.salida}` : 'No trabaja este día'}
                  </p>
                </TableCell>
                {TIPOS_MARCA.map((t) => {
                  const m = dia.marcas[t] ?? null
                  const tarde = t === 'entrada' && dia.minutosTarde > 0
                  return (
                    <TableCell key={t} className="text-center p-1">
                      <button
                        onClick={() => (m || permisos.canEdit) && setCelda({ trabajador, tipo: t, marca: m })}
                        className={cn(
                          'w-full rounded-md px-2 py-1.5 text-sm tabular-nums transition-colors inline-flex items-center justify-center gap-1',
                          m ? 'hover:bg-muted font-medium' : 'text-muted-foreground/50',
                          !m && permisos.canEdit && 'hover:bg-muted hover:text-muted-foreground',
                          m?.sospechosa && 'bg-red-50 text-red-700 ring-1 ring-red-300',
                          tarde && !m?.sospechosa && 'text-amber-700',
                        )}
                        title={m?.sospechosa ? m.motivo_sospecha ?? 'Sospechosa' : m?.manual ? 'Corregida a mano por RRHH' : undefined}
                      >
                        {m ? (
                          <>
                            {horaLima(m.marcado_at)}
                            {m.sospechosa && <ShieldAlert className="h-3.5 w-3.5" />}
                            {m.selfie_path && !m.sospechosa && <Camera className="h-3 w-3 opacity-40" />}
                            {m.manual && <PenLine className="h-3 w-3 opacity-50" />}
                          </>
                        ) : '—'}
                      </button>
                    </TableCell>
                  )
                })}
                <TableCell className="text-center tabular-nums text-sm">{fmtDuracion(dia.almuerzo)}</TableCell>
                <TableCell className="text-center tabular-nums text-sm font-medium">
                  {dia.enCurso ? <span className="text-muted-foreground font-normal">En curso</span> : fmtDuracion(dia.trabajado)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {dia.avisos.map((a) => <AvisoBadge key={a.tipo} aviso={a} />)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Toca una hora para ver la selfie{permisos.canEdit ? ', corregirla o agregar una marca que faltó' : ''}.
        <Camera className="inline h-3 w-3 mx-1" /> con selfie · <PenLine className="inline h-3 w-3 mx-1" /> corregida por RRHH ·
        <ShieldAlert className="inline h-3 w-3 mx-1 text-red-600" /> sospechosa
      </p>

      {celda && (
        <MarcaDialog
          celda={celda}
          fecha={fecha}
          permisos={permisos}
          onClose={() => setCelda(null)}
          onGuardado={() => { setCelda(null); cargar() }}
        />
      )}
    </div>
  )
}

function MarcaDialog({ celda, fecha, permisos, onClose, onGuardado }: {
  celda: CeldaSeleccionada
  fecha: string
  permisos: PermisosOficina
  onClose: () => void
  onGuardado: () => void
}) {
  const supabase = createClient()
  const { trabajador, tipo, marca } = celda
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [hora, setHora] = useState(marca ? horaLima(marca.marcado_at) : '')
  const [guardando, setGuardando] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)

  useEffect(() => {
    if (!marca?.selfie_path) return
    supabase.storage.from('asistencia-oficina').createSignedUrl(marca.selfie_path, 600)
      .then(({ data }) => setSelfieUrl(data?.signedUrl ?? null))
  }, [marca?.selfie_path])

  const guardar = async () => {
    if (!/^\d{2}:\d{2}$/.test(hora)) { toast.error('Ingresa una hora válida'); return }
    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const marcado_at = isoLima(fecha, hora)
      const { error } = marca
        ? await supabase.from('oficina_marcas').update({ marcado_at, manual: true, editado_por: user?.id }).eq('id', marca.id)
        : await supabase.from('oficina_marcas').insert({
            user_id: trabajador.user_id, nombre: trabajador.nombre, fecha, tipo, marcado_at, manual: true, editado_por: user?.id,
          })
      if (error) throw error
      toast.success(marca ? 'Marca corregida' : 'Marca agregada')
      onGuardado()
    } catch (e: any) {
      toast.error(e.message || 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async () => {
    if (!marca) return
    setGuardando(true)
    const { error } = await supabase.from('oficina_marcas').delete().eq('id', marca.id)
    setGuardando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Marca eliminada')
    onGuardado()
  }

  const quitarSospecha = async () => {
    if (!marca) return
    setGuardando(true)
    const { error } = await supabase.from('oficina_marcas').update({ sospechosa: false }).eq('id', marca.id)
    setGuardando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Marca revisada')
    onGuardado()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{LABEL_MARCA[tipo]} · {trabajador.nombre}</DialogTitle>
          <DialogDescription>{fmtDiaLargo(fecha)}</DialogDescription>
        </DialogHeader>

        {marca && (
          <div className="space-y-3">
            {marca.sospechosa && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Marca sospechosa</p>
                  <p>{marca.motivo_sospecha}</p>
                </div>
              </div>
            )}
            {marca.selfie_path ? (
              selfieUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={selfieUrl} alt="Selfie" className="w-full max-h-96 object-contain rounded-lg bg-muted" />
                : <div className="h-64 rounded-lg bg-muted flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {marca.manual ? 'Sin selfie (marca registrada a mano por RRHH).' : 'Sin selfie (la selfie obligatoria estaba apagada).'}
              </p>
            )}
            <p className="text-sm">
              Registrada a las <span className="font-semibold tabular-nums">{horaLima(marca.marcado_at)}</span>
              {marca.manual && <span className="text-muted-foreground"> · corregida por RRHH</span>}
            </p>
          </div>
        )}

        {permisos.canEdit && (
          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor="hora-marca">{marca ? 'Corregir hora' : 'Agregar marca que faltó'}</Label>
            <div className="flex gap-2">
              <Input id="hora-marca" type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-36" />
              <Button onClick={guardar} disabled={guardando || !hora}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : marca ? 'Guardar' : <><Plus className="h-4 w-4 mr-1" />Agregar</>}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Queda registrada como corregida a mano.</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {marca && permisos.canDelete && (
              confirmarBorrar ? (
                <Button variant="destructive" size="sm" onClick={borrar} disabled={guardando}>¿Seguro? Eliminar</Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmarBorrar(true)}>
                  <Trash2 className="h-4 w-4 mr-1" />Eliminar
                </Button>
              )
            )}
            {marca?.sospechosa && permisos.canEdit && (
              <Button variant="outline" size="sm" onClick={quitarSospecha} disabled={guardando}>Marcar como revisada</Button>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
