'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Copy, Loader2, Nfc, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  ALMUERZO_REFERENCIA_MIN, DIAS_SEMANA, LABEL_MARCA, TIPOS_MARCA, fmtDuracion, hhmmAMin,
  type Horario, type OficinaConfig, type Trabajador,
} from '@/lib/oficina/calculos'
import type { PermisosOficina } from '@/components/OficinaAsistenciaSection'

const URL_STICKER = 'https://paybox.eemersonsac.com/oficina/marcar?m='

interface Sticker { uid: string; nombre: string; activo: boolean; max_contador: number }

/** Horas semanales que suma un horario (sin el almuerzo de referencia). */
function horasHorario(h: Horario): number {
  return Object.values(h).reduce((acc, d) => acc + (d ? hhmmAMin(d.salida) - hhmmAMin(d.entrada) - ALMUERZO_REFERENCIA_MIN : 0), 0)
}

export function OficinaConfiguracion({ config, trabajadores, permisos, onCambio }: {
  config: OficinaConfig
  trabajadores: Trabajador[]
  permisos: PermisosOficina
  onCambio: () => void
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Parametros config={config} puedeEditar={permisos.canEdit} onCambio={onCambio} />
        <Stickers permisos={permisos} />
      </div>
      <Trabajadores config={config} trabajadores={trabajadores} permisos={permisos} onCambio={onCambio} />
    </div>
  )
}

function Parametros({ config, puedeEditar, onCambio }: { config: OficinaConfig; puedeEditar: boolean; onCambio: () => void }) {
  const [form, setForm] = useState(config)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setForm(config), [config])

  const campo = (k: Exclude<keyof OficinaConfig, 'selfie_tipos'>, label: string, ayuda: string, type: 'number' | 'time' = 'number') => (
    <div className="space-y-1">
      <Label htmlFor={k}>{label}</Label>
      <Input
        id={k}
        type={type}
        value={form[k]}
        disabled={!puedeEditar}
        onChange={(e) => setForm({ ...form, [k]: type === 'number' ? Number(e.target.value) : e.target.value })}
      />
      <p className="text-xs text-muted-foreground">{ayuda}</p>
    </div>
  )

  const guardar = async () => {
    if (form.almuerzo_min > form.almuerzo_max) { toast.error('El almuerzo mínimo no puede ser mayor que el máximo'); return }
    setGuardando(true)
    const { error } = await createClient().from('oficina_config')
      .update({ ...form, updated_at: new Date().toISOString() }).eq('id', 1)
    setGuardando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Parámetros guardados')
    onCambio()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parámetros</CardTitle>
        <CardDescription>Se aplican a todo el personal de oficina.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {campo('meta_semanal_horas', 'Meta semanal (horas)', 'Sin contar el almuerzo. Cada trabajador puede tener la suya.')}
          {campo('tolerancia_min', 'Tolerancia (minutos)', 'Hasta cuántos minutos después de su hora de entrada no cuenta como tarde.')}
          {campo('almuerzo_min', 'Almuerzo mínimo (minutos)', 'Menos que esto genera aviso.')}
          {campo('almuerzo_max', 'Almuerzo máximo (minutos)', 'Más que esto genera aviso.')}
          {campo('hora_limite', 'Hora límite', 'Marcas desde esta hora se avisan como horario nocturno. No se bloquean.', 'time')}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Selfie obligatoria en</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TIPOS_MARCA.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.selfie_tipos.includes(t)}
                  disabled={!puedeEditar}
                  onCheckedChange={(c) => setForm({
                    ...form,
                    selfie_tipos: c ? TIPOS_MARCA.filter((x) => x === t || form.selfie_tipos.includes(x)) : form.selfie_tipos.filter((x) => x !== t),
                  })}
                />
                {LABEL_MARCA[t]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            En las marcas sin selfie, el personal marca solo con el sticker. El link de un solo uso y la detección de
            marcas sospechosas siguen funcionando, pero en esas marcas no queda prueba de que la persona estaba en la oficina.
          </p>
        </div>
        {puedeEditar && (
          <Button onClick={guardar} disabled={guardando} size="sm">
            {guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Guardar parámetros
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function Trabajadores({ config, trabajadores, permisos, onCambio }: {
  config: OficinaConfig
  trabajadores: Trabajador[]
  permisos: PermisosOficina
  onCambio: () => void
}) {
  const supabase = createClient()
  const [editando, setEditando] = useState<Trabajador | null>(null)
  const [usuarios, setUsuarios] = useState<{ id: string; full_name: string | null; role: string }[]>([])
  const [nuevo, setNuevo] = useState('')

  useEffect(() => {
    supabase.rpc('get_rrhh_usuarios').then(({ data }) => setUsuarios((data ?? []) as any[]))
  }, [])

  const disponibles = usuarios.filter((u) => u.role !== 'conductor' && !trabajadores.some((t) => t.user_id === u.id))

  const agregar = async () => {
    const u = usuarios.find((x) => x.id === nuevo)
    if (!u) return
    const { error } = await supabase.from('oficina_trabajadores').insert({ user_id: u.id, nombre: u.full_name ?? 'Sin nombre' })
    if (error) { toast.error(error.message); return }
    setNuevo('')
    toast.success(`${u.full_name} agregado`)
    onCambio()
  }

  const toggleActivo = async (t: Trabajador) => {
    const { error } = await supabase.from('oficina_trabajadores').update({ activo: !t.activo }).eq('user_id', t.user_id)
    if (error) { toast.error(error.message); return }
    onCambio()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Personal de oficina</CardTitle>
        <CardDescription>
          Quiénes marcan con el sticker y su horario de referencia. Llegar después de su hora de entrada
          cuenta como tardanza, salvo que ese día completen sus horas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y rounded-lg border">
          {trabajadores.map((t) => {
            const dias = DIAS_SEMANA.filter((d) => t.horario?.[d.key])
            return (
              <div key={t.user_id} className={cn('px-3 py-2.5 flex items-center gap-3', !t.activo && 'opacity-50')}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{t.nombre}{!t.activo && ' (inactivo)'}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {dias.length === 0 ? 'Sin horario' : dias.map((d) => `${d.corto} ${t.horario[d.key]!.entrada}–${t.horario[d.key]!.salida}`).join(' · ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Horario: {fmtDuracion(horasHorario(t.horario ?? {}))} por semana · Meta: {t.meta_semanal_horas ?? config.meta_semanal_horas} h
                    {t.meta_semanal_horas === null && ' (general)'}
                  </p>
                </div>
                {permisos.canEdit && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivo(t)}>{t.activo ? 'Desactivar' : 'Activar'}</Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setEditando(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {permisos.canEdit && disponibles.length > 0 && (
          <div className="flex gap-2">
            <Select value={nuevo} onValueChange={setNuevo}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Agregar a alguien con usuario en PayBox…" /></SelectTrigger>
              <SelectContent>
                {disponibles.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.id}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={agregar} disabled={!nuevo}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
          </div>
        )}
      </CardContent>

      {editando && (
        <HorarioDialog
          trabajador={editando}
          config={config}
          puedeBorrar={permisos.canDelete}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); onCambio() }}
        />
      )}
    </Card>
  )
}

function HorarioDialog({ trabajador, config, puedeBorrar, onClose, onGuardado }: {
  trabajador: Trabajador
  config: OficinaConfig
  puedeBorrar: boolean
  onClose: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(trabajador.nombre)
  const [horario, setHorario] = useState<Horario>(() => {
    const h: Horario = {}
    for (const d of DIAS_SEMANA) h[d.key] = trabajador.horario?.[d.key] ?? null
    return h
  })
  const [metaPropia, setMetaPropia] = useState(trabajador.meta_semanal_horas !== null)
  const [meta, setMeta] = useState(Number(trabajador.meta_semanal_horas ?? config.meta_semanal_horas))
  const [guardando, setGuardando] = useState(false)

  const setDia = (key: string, valor: Horario[string]) => setHorario((h) => ({ ...h, [key]: valor }))

  const guardar = async () => {
    for (const d of DIAS_SEMANA) {
      const h = horario[d.key]
      if (h && hhmmAMin(h.salida) <= hhmmAMin(h.entrada)) { toast.error(`${d.label}: la salida debe ser después de la entrada`); return }
    }
    setGuardando(true)
    const { error } = await createClient().from('oficina_trabajadores').update({
      nombre: nombre.trim() || trabajador.nombre,
      horario,
      meta_semanal_horas: metaPropia ? meta : null,
    }).eq('user_id', trabajador.user_id)
    setGuardando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Horario guardado')
    onGuardado()
  }

  const quitar = async () => {
    if (!confirm(`¿Quitar a ${trabajador.nombre} del personal de oficina? Sus marcas anteriores se conservan.`)) return
    const { error } = await createClient().from('oficina_trabajadores').delete().eq('user_id', trabajador.user_id)
    if (error) { toast.error(error.message); return }
    onGuardado()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Horario de {trabajador.nombre}</DialogTitle>
          <DialogDescription>
            Horario de referencia. Las horas esperadas por día descuentan {ALMUERZO_REFERENCIA_MIN} min de almuerzo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="nombre-trab">Nombre</Label>
          <Input id="nombre-trab" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          {DIAS_SEMANA.map((d) => {
            const h = horario[d.key]
            return (
              <div key={d.key} className="flex items-center gap-2">
                <label className="flex items-center gap-2 w-28 text-sm">
                  <Checkbox
                    checked={!!h}
                    onCheckedChange={(c) => setDia(d.key, c ? { entrada: '09:00', salida: d.key === '6' ? '13:00' : '19:00' } : null)}
                  />
                  {d.label}
                </label>
                {h ? (
                  <>
                    <Input type="time" value={h.entrada} onChange={(e) => setDia(d.key, { ...h, entrada: e.target.value })} className="h-8 w-28" />
                    <span className="text-muted-foreground text-sm">a</span>
                    <Input type="time" value={h.salida} onChange={(e) => setDia(d.key, { ...h, salida: e.target.value })} className="h-8 w-28" />
                  </>
                ) : <span className="text-sm text-muted-foreground">No trabaja</span>}
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground pt-1">Total del horario: {fmtDuracion(horasHorario(horario))} por semana.</p>
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={metaPropia} onCheckedChange={(c) => setMetaPropia(!!c)} />
            Meta semanal propia (si no, usa la general de {config.meta_semanal_horas} h)
          </label>
          {metaPropia && (
            <Input type="number" value={meta} onChange={(e) => setMeta(Number(e.target.value))} className="w-28" />
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {puedeBorrar ? (
            <Button variant="ghost" size="sm" className="text-red-600" onClick={quitar}><Trash2 className="h-4 w-4 mr-1" />Quitar</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stickers({ permisos }: { permisos: PermisosOficina }) {
  const supabase = createClient()
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('oficina_stickers').select('uid, nombre, activo, max_contador').order('created_at')
    setStickers((data ?? []) as Sticker[])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const toggle = async (s: Sticker) => {
    const { error } = await supabase.from('oficina_stickers').update({ activo: !s.activo }).eq('uid', s.uid)
    if (error) { toast.error(error.message); return }
    cargar()
  }

  const borrar = async (s: Sticker) => {
    if (!confirm(`¿Eliminar el sticker "${s.nombre}"? Ya no se podrá marcar con él.`)) return
    const { error } = await supabase.from('oficina_stickers').delete().eq('uid', s.uid)
    if (error) { toast.error(error.message); return }
    cargar()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Nfc className="h-4 w-4" />Stickers NFC</CardTitle>
        <CardDescription>Solo se puede marcar con stickers registrados y activos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : stickers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay stickers registrados.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {stickers.map((s) => (
              <div key={s.uid} className={cn('px-3 py-2.5 flex items-center gap-3', !s.activo && 'opacity-50')}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{s.nombre}{!s.activo && ' (desactivado)'}</p>
                  <p className="text-xs text-muted-foreground font-mono">{s.uid} · {s.max_contador + 1} toques</p>
                </div>
                {permisos.canEdit && <Button variant="ghost" size="sm" onClick={() => toggle(s)}>{s.activo ? 'Desactivar' : 'Activar'}</Button>}
                {permisos.canDelete && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => borrar(s)}><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
          </div>
        )}

        <details className="rounded-lg bg-muted/50 p-3 text-sm">
          <summary className="font-medium cursor-pointer">Cómo preparar un sticker nuevo (una sola vez)</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1.5 text-muted-foreground">
            <li>Usa un sticker <b>NTAG213, NTAG215 o NTAG216</b> e instala la app gratuita <b>NXP TagWriter</b> en un celular Android.</li>
            <li>
              En TagWriter: <i>Write tags → New dataset → Link</i> y pega este link:
              <span className="flex items-center gap-1 mt-1">
                <code className="bg-white border rounded px-2 py-1 text-xs text-foreground break-all">{URL_STICKER}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(URL_STICKER); toast.success('Link copiado') }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </span>
            </li>
            <li>Activa <b>Add UID mirror</b> y <b>Add counter mirror</b> (agregan al final del link el número de serie y el contador de toques).</li>
            <li>En <i>Configure protection</i>, activa la protección contra escritura con contraseña para que nadie pueda reescribirlo.</li>
            <li>Graba el sticker y pégalo en la oficina.</li>
            <li>Con tu sesión de PayBox iniciada, acerca tu celular al sticker: como administras RRHH, te ofrecerá <b>registrarlo</b>.</li>
          </ol>
        </details>
      </CardContent>
    </Card>
  )
}
