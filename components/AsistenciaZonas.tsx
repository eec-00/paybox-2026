'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  MapPin, Plus, Trash2, ExternalLink, Loader2, LocateFixed, CheckCircle2, CircleSlash,
} from 'lucide-react'
import { toast } from 'sonner'

interface Ubicacion {
  id: string
  nombre: string
  lat: number
  lng: number
  radio_metros: number
  activo: boolean
}

type GeoLocation = { lat: number; lng: number }

function getLocation(): Promise<GeoLocation | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 0, enableHighAccuracy: true }
    )
  })
}

const EMPTY_FORM = { nombre: '', lat: '', lng: '', radio: '150' }

export function AsistenciaZonas() {
  const supabase = createClient()
  const [zonas, setZonas] = useState<Ubicacion[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteZona, setDeleteZona] = useState<Ubicacion | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchZonas = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('asistencia_ubicaciones')
        .select('id, nombre, lat, lng, radio_metros, activo')
        .order('created_at', { ascending: true })
      if (error) throw error
      setZonas(data || [])
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar zonas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchZonas() }, [])

  const handleUsarMiUbicacion = async () => {
    setLocating(true)
    try {
      const loc = await getLocation()
      if (!loc) { toast.error('No se pudo obtener tu ubicación'); return }
      setForm((f) => ({ ...f, lat: loc.lat.toFixed(6), lng: loc.lng.toFixed(6) }))
      toast.success('Ubicación capturada. Párate en el centro exacto de la zona antes de agregarla.')
    } finally {
      setLocating(false)
    }
  }

  const handleAgregar = async () => {
    const lat = parseFloat(form.lat)
    const lng = parseFloat(form.lng)
    const radio = parseInt(form.radio, 10)
    if (!form.nombre.trim()) { toast.error('Ponle un nombre a la zona'); return }
    if (isNaN(lat) || isNaN(lng)) { toast.error('Falta la ubicación (usa el botón o ingrésala manualmente)'); return }
    if (isNaN(radio) || radio <= 0) { toast.error('El radio debe ser un número mayor a 0'); return }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('asistencia_ubicaciones').insert({
        nombre: form.nombre.trim(),
        lat, lng,
        radio_metros: radio,
        created_by: user?.id ?? null,
      })
      if (error) throw error
      toast.success('Zona agregada')
      setForm(EMPTY_FORM)
      fetchZonas()
    } catch (err: any) {
      toast.error(err.message || 'Error al agregar la zona')
    } finally {
      setSaving(false)
    }
  }

  const toggleActivo = async (zona: Ubicacion) => {
    try {
      const { error } = await supabase
        .from('asistencia_ubicaciones')
        .update({ activo: !zona.activo })
        .eq('id', zona.id)
      if (error) throw error
      setZonas((prev) => prev.map((z) => (z.id === zona.id ? { ...z, activo: !z.activo } : z)))
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar la zona')
    }
  }

  const handleDelete = async () => {
    if (!deleteZona) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('asistencia_ubicaciones').delete().eq('id', deleteZona.id)
      if (error) throw error
      toast.success('Zona eliminada')
      setDeleteZona(null)
      fetchZonas()
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar la zona')
    } finally {
      setDeleting(false)
    }
  }

  const hayZonasActivas = zonas.some((z) => z.activo)

  return (
    <div className="space-y-3 bg-card/40 rounded-xl border border-border/50 shadow-sm p-4">
      <div className="flex items-start gap-2">
        <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">Zonas permitidas para marcar asistencia</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hayZonasActivas
              ? 'Los conductores solo pueden marcar entrada/salida dentro del radio de una zona activa. Se valida en el servidor: no se puede marcar "desde casa".'
              : 'Sin zonas activas todavía: cualquier conductor puede marcar desde cualquier lugar. Agrega al menos una para empezar a restringir.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando zonas...
        </div>
      ) : (
        <div className="space-y-2">
          {zonas.map((z) => (
            <div key={z.id} className="flex items-center justify-between gap-3 bg-background rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{z.nombre}</p>
                  <button
                    onClick={() => toggleActivo(z)}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${
                      z.activo ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {z.activo ? <CheckCircle2 className="h-3 w-3" /> : <CircleSlash className="h-3 w-3" />}
                    {z.activo ? 'Activa' : 'Inactiva'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {z.lat.toFixed(5)}, {z.lng.toFixed(5)} · radio {z.radio_metros}m
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={`https://www.google.com/maps?q=${z.lat},${z.lng}`}
                  target="_blank" rel="noopener noreferrer"
                  className="p-1.5 text-muted-foreground hover:text-primary"
                  title="Ver en Google Maps"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteZona(z)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
          {zonas.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-1">Todavía no hay zonas registradas.</p>
          )}
        </div>
      )}

      {/* Formulario para agregar zona */}
      <div className="border-t border-border/50 pt-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agregar zona</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="col-span-2 sm:col-span-2">
            <Label className="text-[11px] text-muted-foreground">Nombre</Label>
            <Input
              placeholder="Ej: Oficina Lima"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Latitud</Label>
            <Input
              placeholder="-12.0464"
              value={form.lat}
              onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
              className="h-9 text-sm font-mono"
              inputMode="decimal"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Longitud</Label>
            <Input
              placeholder="-77.0428"
              value={form.lng}
              onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
              className="h-9 text-sm font-mono"
              inputMode="decimal"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Radio (metros)</Label>
            <Input
              value={form.radio}
              onChange={(e) => setForm((f) => ({ ...f, radio: e.target.value }))}
              className="h-9 text-sm"
              inputMode="numeric"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline" size="sm"
              onClick={handleUsarMiUbicacion}
              disabled={locating}
              className="h-9 w-full gap-1.5 text-xs"
            >
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
              Usar mi ubicación
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Para capturar las coordenadas exactas, párate en el centro del área permitida (ej. la puerta de la oficina) y pulsa &quot;Usar mi ubicación&quot;.
        </p>
        <Button onClick={handleAgregar} disabled={saving} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Agregar zona
        </Button>
      </div>

      <AlertDialog open={!!deleteZona} onOpenChange={(o) => !o && setDeleteZona(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta zona?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteZona?.nombre}. Los conductores ya no podrán usarla como referencia para marcar. Esta acción no se puede deshacer.
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
