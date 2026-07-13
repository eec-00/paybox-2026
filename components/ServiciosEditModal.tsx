'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Save, Truck, Clock, User, Package,
  Calendar, Hash, Building2, MapPin, Info,
} from 'lucide-react'
import { getHitosForTask, tipoServicioLabelFor, type HitoDef, type TaskTypeFlags } from '@/lib/servicios/hitos'

interface Stage { id: number; name: string }
interface Conductor { id: number; name: string }
interface Vehiculo { id: number; name: string; license_plate: string; category_id: [number, string] | false }

interface ServiciosEditModalProps {
  task: Record<string, unknown>
  validFields: string[]
  stages: Stage[]
  onClose: () => void
  onSaved: () => void
}

function pick(validFields: string[], ...candidates: string[]): string {
  return candidates.find(c => validFields.includes(c)) ?? candidates[0]
}

function floatToTime(val: unknown): string {
  if (typeof val !== 'number' || val === 0) return ''
  const h = Math.floor(val)
  const m = Math.round((val - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeToFloat(val: string): number | false {
  if (!val) return false
  const [h, m] = val.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return false
  return h + m / 60
}

function m2oId(val: unknown): number | false {
  if (Array.isArray(val) && val.length === 2) return val[0] as number
  return false
}

function m2oName(val: unknown): string {
  if (Array.isArray(val) && val.length === 2) return String(val[1])
  return '—'
}

// Detect whether a field value is many2one [id,name] or char string
function getPlacaValue(val: unknown): string {
  if (Array.isArray(val) && val.length === 2) return String(val[0]) // many2one → use id as string
  if (typeof val === 'string') return val
  return ''
}

function getPlacaDisplay(val: unknown): string {
  if (Array.isArray(val) && val.length === 2) return String(val[1])
  if (typeof val === 'string') return val
  return ''
}

const STAGE_COLORS: Record<string, string> = {
  'nueva solicitud': 'bg-blue-100 text-blue-800 border-blue-200',
  'pre-operativo': 'bg-amber-100 text-amber-800 border-amber-200',
  'en ruta': 'bg-orange-100 text-orange-800 border-orange-200',
  'en cliente': 'bg-green-100 text-green-800 border-green-200',
  'facturac': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'cerrado': 'bg-gray-200 text-gray-700 border-gray-300',
}

function stageColor(name: string): string {
  const k = name.toLowerCase()
  for (const [key, cls] of Object.entries(STAGE_COLORS)) {
    if (k.includes(key)) return cls
  }
  if (k.includes('pendiente') || k.includes('devolu')) return 'bg-purple-100 text-purple-800 border-purple-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.FC<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="p-1 bg-primary/10 rounded-md">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h3 className="text-xs font-bold text-primary uppercase tracking-wider">{title}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{children}</Label>
}

function ReadonlyField({ value }: { value: string }) {
  return (
    <div className="h-8 flex items-center text-xs px-3 border rounded-md bg-muted/30 text-muted-foreground truncate">
      {value || '—'}
    </div>
  )
}

// Vehicle combobox with native datalist autocomplete
function PlacaSelect({
  value,
  onChange,
  vehiculos,
  listId,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  vehiculos: Vehiculo[]
  listId: string
  placeholder: string
}) {
  return (
    <div className="relative">
      <Input
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-xs font-mono"
        autoComplete="off"
      />
      <datalist id={listId}>
        {vehiculos.map(v => {
          const label = v.name || v.license_plate
          return <option key={v.id} value={label} />
        })}
      </datalist>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function ServiciosEditModal({ task, validFields, stages, onClose, onSaved }: ServiciosEditModalProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conductores, setConductores] = useState<Conductor[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)

  const F = {
    programacion: pick(validFields, 'x_studio_fecha_de_la_programacin', 'x_studio_fecha_de_la_programacion'),
    horaCita:     pick(validFields, 'x_studio_hora_de_cita'),
    placaCamion:  pick(validFields, 'x_studio_placa', 'x_studio_placa_camion', 'x_studio_placa_camin'),
    placaCarreta: pick(validFields, 'x_studio_placa_carreta'),
    conductor:    pick(validFields, 'x_studio_conductor'),
    refBooking:   pick(validFields, 'x_studio_referenciabooking', 'x_studio_referencia_booking'),
    agencia:      pick(validFields, 'x_studio_agencia'),
    nContenedor:  pick(validFields, 'x_studio_numero_de_contenedor', 'x_studio_nmero_de_contenedor'),
    almRetiro:    pick(validFields, 'x_studio_almacen_de_retiro', 'x_studio_almacn_de_retiro'),
    almDestino:   pick(validFields, 'x_studio_almacen_de_destino', 'x_studio_almacn_de_destino'),
    esImport:     pick(validFields, 'x_studio_es_importacion', 'x_studio_es_importacin'),
  }

  // Hitos del tipo de servicio detectado (ver lib/servicios/hitos.ts), solo los que existen en Odoo
  const hitos: HitoDef[] = getHitosForTask(task as TaskTypeFlags)
    .filter(h => validFields.includes(h.field))

  // Whether placa fields are many2one (value is [id, name]) or char
  const placaCamionIsM2o = Array.isArray(task[F.placaCamion])
  const placaCarretaIsM2o = Array.isArray(task[F.placaCarreta])

  // Form state
  const [stageId,      setStageId]      = useState(String(m2oId(task.stage_id) || ''))
  const [programacion, setProgramacion] = useState((task[F.programacion] as string) || '')
  const [horaCita,     setHoraCita]     = useState(floatToTime(task[F.horaCita]))
  const [placaCamion,  setPlacaCamion]  = useState(getPlacaDisplay(task[F.placaCamion]))
  const [placaCarreta, setPlacaCarreta] = useState(getPlacaDisplay(task[F.placaCarreta]))
  const [conductorId,  setConductorId]  = useState(String(m2oId(task[F.conductor]) || ''))
  const [refBooking,   setRefBooking]   = useState((task[F.refBooking] as string) || '')
  const [agencia,      setAgencia]      = useState((task[F.agencia] as string) || '')
  const [nContenedor,  setNContenedor]  = useState((task[F.nContenedor] as string) || '')
  const [esImport,     setEsImport]     = useState(Boolean(task[F.esImport]))
  const [tiempos, setTiempos] = useState<Record<string, string>>(() =>
    Object.fromEntries(hitos.map(h => [h.field, floatToTime(task[h.field])]))
  )
  const setTiempoField = (field: string, value: string) =>
    setTiempos(prev => ({ ...prev, [field]: value }))

  useEffect(() => {
    const post = (action: string) =>
      fetch('/api/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).then(r => r.json())

    Promise.all([post('conductores'), post('flota')])
      .then(([condData, flotaData]) => {
        const cList: Conductor[] = condData.empleados ?? []
        const curCond = task[F.conductor]
        if (Array.isArray(curCond) && !cList.find(e => e.id === curCond[0])) {
          cList.unshift({ id: curCond[0] as number, name: curCond[1] as string })
        }
        setConductores(cList)
        setVehiculos(flotaData.vehiculos ?? [])
      })
      .catch(() => {})
      .finally(() => setLoadingLookups(false))
  }, [])

  const resolveVehicleWrite = (displayVal: string, isM2o: boolean): number | string | false => {
    if (!displayVal) return false
    const match = vehiculos.find(v => v.name === displayVal || v.license_plate === displayVal)
    if (match) return isM2o ? match.id : (match.name || match.license_plate)
    return displayVal // keep typed value if no match
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const orig = {
        stageId:      String(m2oId(task.stage_id) || ''),
        programacion: (task[F.programacion] as string) || '',
        horaCita:     floatToTime(task[F.horaCita]),
        placaCamion:  getPlacaDisplay(task[F.placaCamion]),
        placaCarreta: getPlacaDisplay(task[F.placaCarreta]),
        conductorId:  String(m2oId(task[F.conductor]) || ''),
        refBooking:   (task[F.refBooking] as string) || '',
        agencia:      (task[F.agencia] as string) || '',
        nContenedor:  (task[F.nContenedor] as string) || '',
        esImport:     Boolean(task[F.esImport]),
        tiempos: Object.fromEntries(hitos.map(h => [h.field, floatToTime(task[h.field])])) as Record<string, string>,
      }

      const fields: Record<string, unknown> = {}
      if (stageId !== orig.stageId && stageId) fields.stage_id = parseInt(stageId)
      if (programacion !== orig.programacion) fields[F.programacion] = programacion || false
      if (horaCita !== orig.horaCita) fields[F.horaCita] = timeToFloat(horaCita)
      if (placaCamion !== orig.placaCamion) fields[F.placaCamion] = resolveVehicleWrite(placaCamion, placaCamionIsM2o)
      if (placaCarreta !== orig.placaCarreta) fields[F.placaCarreta] = resolveVehicleWrite(placaCarreta, placaCarretaIsM2o)
      if (conductorId !== orig.conductorId && conductorId) fields[F.conductor] = parseInt(conductorId)
      if (refBooking !== orig.refBooking) fields[F.refBooking] = refBooking || false
      if (agencia !== orig.agencia) fields[F.agencia] = agencia || false
      if (nContenedor !== orig.nContenedor) fields[F.nContenedor] = nContenedor || false
      if (esImport !== orig.esImport) fields[F.esImport] = esImport
      for (const h of hitos) {
        const val = tiempos[h.field] ?? ''
        if (val !== (orig.tiempos[h.field] ?? '')) fields[h.field] = timeToFloat(val)
      }

      if (Object.keys(fields).length === 0) { onClose(); return }

      const res = await fetch('/api/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, fields }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar')
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const currentStage = stages.find(s => String(s.id) === stageId)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[72vw]! max-w-[72vw]! max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogTitle className="sr-only">{task.name as string}</DialogTitle>

        {/* ── Header ── */}
        <div className="bg-primary px-5 py-3 text-white shrink-0 flex items-center gap-3">
          <div className="p-1.5 bg-white/15 rounded-lg shrink-0">
            <Truck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-white/50 uppercase tracking-widest">Editar Servicio</p>
            <h2 className="text-sm font-semibold leading-tight truncate">{task.name as string}</h2>
          </div>
          {currentStage && (
            <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border shrink-0 ${stageColor(currentStage.name)}`}>
              {currentStage.name}
            </span>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-muted/20">

          {/* ① PROGRAMACIÓN — banda prominente */}
          <div className="bg-background rounded-xl border p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">① Programación</p>
            <div className="grid grid-cols-5 gap-3 items-end">
              <div className="space-y-1">
                <FieldLabel>Etapa</FieldLabel>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <FieldLabel>Fecha Programación</FieldLabel>
                <Input type="date" value={programacion} onChange={e => setProgramacion(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Hora de Cita</FieldLabel>
                <Input type="time" value={horaCita} onChange={e => setHoraCita(e.target.value)} className="h-9 text-sm font-mono" />
              </div>
              <div className="col-span-1 space-y-1">
                <FieldLabel>Cliente</FieldLabel>
                <ReadonlyField value={m2oName(task.partner_id)} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Importación</FieldLabel>
                <div className="h-9 flex items-center gap-2 px-3 border rounded-md bg-background cursor-pointer"
                     onClick={() => setEsImport(v => !v)}>
                  <Checkbox checked={esImport} onCheckedChange={v => setEsImport(Boolean(v))} id="chk-import" />
                  <label htmlFor="chk-import" className="text-sm cursor-pointer select-none">
                    {esImport ? 'Sí' : 'No'}
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* ② VEHÍCULOS & CONDUCTOR | ③ DETALLES LOGÍSTICOS — side by side */}
          <div className="grid grid-cols-2 gap-4">

            {/* Vehículos */}
            <div className="bg-background rounded-xl border p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">② Vehículos y Conductor</p>
              <div className="space-y-1">
                <FieldLabel>Camión / Tracto</FieldLabel>
                {loadingLookups
                  ? <Input disabled placeholder="Cargando flota..." className="h-9 text-sm" />
                  : <PlacaSelect value={placaCamion} onChange={setPlacaCamion} vehiculos={vehiculos} listId="tractos-list" placeholder="Buscar placa..." />
                }
              </div>
              <div className="space-y-1">
                <FieldLabel>Carreta / Semirremolque</FieldLabel>
                {loadingLookups
                  ? <Input disabled placeholder="Cargando flota..." className="h-9 text-sm" />
                  : <PlacaSelect value={placaCarreta} onChange={setPlacaCarreta} vehiculos={vehiculos} listId="carretas-list" placeholder="Buscar placa..." />
                }
              </div>
              <div className="space-y-1">
                <FieldLabel>Conductor</FieldLabel>
                <Select value={conductorId} onValueChange={setConductorId} disabled={loadingLookups}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={loadingLookups ? 'Cargando...' : 'Seleccionar conductor'} />
                  </SelectTrigger>
                  <SelectContent>
                    {conductores.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Detalles logísticos */}
            <div className="bg-background rounded-xl border p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">③ Detalles Logísticos</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <FieldLabel>Referencia / Booking</FieldLabel>
                  <Input value={refBooking} onChange={e => setRefBooking(e.target.value)} className="h-9 text-sm" placeholder="Ej. 5031" />
                </div>
                <div className="space-y-1">
                  <FieldLabel>N° Contenedor</FieldLabel>
                  <Input value={nContenedor} onChange={e => setNContenedor(e.target.value.toUpperCase())} className="h-9 text-sm font-mono" placeholder="Ej. MSDU7771463" />
                </div>
              </div>
              <div className="space-y-1">
                <FieldLabel>Agencia</FieldLabel>
                <Input value={agencia} onChange={e => setAgencia(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Almacén de Retiro</FieldLabel>
                <ReadonlyField value={m2oName(task[F.almRetiro])} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Almacén de Destino</FieldLabel>
                <ReadonlyField value={m2oName(task[F.almDestino])} />
              </div>
            </div>
          </div>

          {/* ④ TIEMPOS OPERATIVOS — fondo diferenciado */}
          <div className="bg-background rounded-xl border border-blue-100 dark:border-blue-900/40 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              ④ Tiempos Operativos · {tipoServicioLabelFor(task as TaskTypeFlags)}
            </p>
            <div className="grid grid-cols-6 gap-3">
              {hitos.map(h => (
                <div key={h.field} className="space-y-1 text-center">
                  <FieldLabel>{h.label}</FieldLabel>
                  <Input
                    type="time"
                    value={tiempos[h.field] ?? ''}
                    onChange={e => setTiempoField(h.field, e.target.value)}
                    className="h-9 text-sm font-mono text-center"
                  />
                  {h.foto !== 'no' && (
                    <p className="text-[9px] text-amber-600 font-medium uppercase tracking-wide">Foto: {h.foto}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t px-5 py-3 flex items-center justify-between shrink-0 bg-background">
          <p className="text-xs text-muted-foreground">Solo campos modificados → Odoo</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || loadingLookups} className="gap-2 min-w-[130px]">
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando...</>
                : <><Save className="h-3.5 w-3.5" /> Guardar en Odoo</>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
