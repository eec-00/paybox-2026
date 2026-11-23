'use client'

import { PageHeader } from '@/components/ui/page-header'
import { useConfirm } from '@/components/ui/confirm'
import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  getCamposForTipo,
  isVehicleTipo,
  type AlertaThreshold,
  type AlertasConfig,
  type AutomatizacionConfig,
  getDaysUntil,
  getStatusColor,
  getStatusLabel,
  normalizeAlertas,
  diasANombre,
} from '@/lib/automatizacion/campos'
import { VencimientosFlyer, type FlyerRow } from '@/components/VencimientosFlyer'
import { hoyLima } from '@/lib/fechas'

interface Props {
  tipo: 'conductores' | 'tractos' | 'carretas'
}

interface PreviewItem {
  nombre: string
  email: string
  campos: { label: string; fecha: string; dias: number }[]
}

const DEFAULT_ALERTAS: AlertasConfig = {
  _global: [
    { dias: 7, activo: true, nombre: '1 semana' },
    { dias: 30, activo: true, nombre: '1 mes' },
    { dias: 90, activo: true, nombre: '3 meses' },
  ],
}

export function AutomatizacionSection({ tipo }: Props) {
  const esVehiculo = isVehicleTipo(tipo)
  const camposDeTipo = getCamposForTipo(tipo)
  const titulo = tipo === 'conductores' ? 'Conductores' : tipo === 'tractos' ? 'Tractos' : 'Carretas'
  const registroLabel = esVehiculo ? 'vehículos' : 'empleados'

  // Data
  const [registros, setRegistros] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Config
  const [config, setConfig] = useState<AutomatizacionConfig>({
    tipo,
    job_title: tipo === 'conductores' ? 'Conductor, Director Ejecutivo' : tipo === 'tractos' ? 'Camión' : 'Semirremolque Plataforma',
    alertas: DEFAULT_ALERTAS,
    activo: true,
    destination_email: '',
  })
  const [editConfig, setEditConfig] = useState<AutomatizacionConfig>(config)
  const [showConfig, setShowConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)
  const [expandedCampos, setExpandedCampos] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const flyerRef = useRef<HTMLDivElement>(null)

  // Filters
  const [busqueda, setBusqueda] = useState('')
  const [soloProximos, setSoloProximos] = useState(false)

  // Copy email feedback
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // Alerts actions
  const [preview, setPreview] = useState<PreviewItem[] | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<any | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/automatizacion/config?tipo=${tipo}`)
      if (res.ok) {
        const raw = await res.json()
        // Migración: config antigua solo tenía "Conductor"; incluir Director Ejecutivo automáticamente
        if (tipo === 'conductores' && raw.job_title === 'Conductor') {
          raw.job_title = 'Conductor, Director Ejecutivo'
        }
        const normalized = { ...raw, alertas: normalizeAlertas(raw.alertas) }
        setConfig(normalized)
        setEditConfig(normalized)
      }
    } catch {
      // Use defaults silently
    }
  }, [tipo])

  const loadRegistros = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let res: Response
      if (esVehiculo) {
        const filtro = config.job_title || tipo
        res = await fetch(`/api/automatizacion/vehiculos?tipo=${tipo}&filtro=${encodeURIComponent(filtro)}`)
        if (!res.ok) throw new Error((await res.json()).error || 'Error al cargar vehículos')
        const data = await res.json()
        setRegistros(data.vehiculos || [])
      } else {
        res = await fetch(`/api/automatizacion/empleados?job_title=${encodeURIComponent(config.job_title)}`)
        if (!res.ok) throw new Error((await res.json()).error || 'Error al cargar empleados')
        const data = await res.json()
        setRegistros(data.empleados || [])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [config.job_title, tipo, esVehiculo])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    loadRegistros()
  }, [loadRegistros])

  const saveConfig = async () => {
    setSavingConfig(true)
    try {
      const res = await fetch('/api/automatizacion/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editConfig),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `El servidor respondió ${res.status}`)
      }
      setConfig(editConfig)
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2500)
    } catch (e) {
      toast.error('No se guardó la configuración', { description: e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo.' })
    } finally {
      setSavingConfig(false)
    }
  }

  const confirmar = useConfirm()
  const handlePreview = async () => {
    setPreviewing(true)
    setPreview(null)
    try {
      const res = await fetch('/api/automatizacion/enviar-alertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, soloPreview: true }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPreview(data.detalle || [])
      setShowPreview(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  // Un solo camino para enviar (botón del encabezado o vista previa): siempre
  // confirma y dice cuántos correos van a salir.
  const handleSendAlerts = async () => {
    let cantidad = preview?.length ?? null
    if (cantidad === null) {
      try {
        const r = await fetch('/api/automatizacion/enviar-alertas', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo, soloPreview: true }),
        })
        const d = await r.json()
        if (!r.ok || d.error) throw new Error(d.error || `El servidor respondió ${r.status}`)
        cantidad = (d.detalle || []).length
      } catch (err) {
        toast.error('No se pudo calcular el envío', { description: err instanceof Error ? err.message : undefined })
        return
      }
    }
    if (cantidad === 0) {
      toast.info('No hay correos pendientes de enviar', { description: 'Todo lo que vence ya fue notificado en su umbral.' })
      return
    }
    const ok = await confirmar({
      title: `¿Enviar ${cantidad} correo${cantidad !== 1 ? 's' : ''} ahora?`,
      description: `Alertas de vencimiento de ${titulo}. Solo se envían los documentos que todavía no se notificaron en ese umbral.`,
      confirmText: 'Sí, enviar ahora',
    })
    if (!ok) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/automatizacion/enviar-alertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, soloPreview: false }),
      })
      const data = await res.json()
      if (!res.ok && data.error) throw new Error(data.error)
      setSendResult(data)
      setShowPreview(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  // --- Helpers globales ---
  const addGlobal = () => {
    setEditConfig((prev) => ({
      ...prev,
      alertas: { ...prev.alertas, _global: [...(prev.alertas._global || []), { dias: 60, activo: true }] },
    }))
  }
  const removeGlobal = (i: number) => {
    setEditConfig((prev) => ({
      ...prev,
      alertas: { ...prev.alertas, _global: (prev.alertas._global || []).filter((_, idx) => idx !== i) },
    }))
  }
  const updateGlobal = (i: number, field: keyof AlertaThreshold, value: any) => {
    setEditConfig((prev) => ({
      ...prev,
      alertas: {
        ...prev.alertas,
        _global: (prev.alertas._global || []).map((a, idx) => (idx === i ? { ...a, [field]: value } : a)),
      },
    }))
  }

  // --- Helpers por campo ---
  const addCampoAlerta = (campoKey: string) => {
    setEditConfig((prev) => ({
      ...prev,
      alertas: {
        ...prev.alertas,
        [campoKey]: [...(prev.alertas[campoKey] || []), { dias: 30, activo: true }],
      },
    }))
  }
  const removeCampoAlerta = (campoKey: string, i: number) => {
    setEditConfig((prev) => {
      const updated = (prev.alertas[campoKey] || []).filter((_, idx) => idx !== i)
      const alertas = { ...prev.alertas }
      if (updated.length === 0) delete alertas[campoKey]
      else alertas[campoKey] = updated
      return { ...prev, alertas }
    })
  }
  const updateCampoAlerta = (campoKey: string, i: number, field: keyof AlertaThreshold, value: any) => {
    setEditConfig((prev) => ({
      ...prev,
      alertas: {
        ...prev.alertas,
        [campoKey]: (prev.alertas[campoKey] || []).map((a, idx) => (idx === i ? { ...a, [field]: value } : a)),
      },
    }))
  }
  const addCampoOverride = (campoKey: string) => {
    if (editConfig.alertas[campoKey]) return
    setEditConfig((prev) => ({
      ...prev,
      alertas: { ...prev.alertas, [campoKey]: [{ dias: 30, activo: true }] },
    }))
    setExpandedCampos((prev) => new Set([...prev, campoKey]))
  }
  const removeCampoOverride = (campoKey: string) => {
    setEditConfig((prev) => {
      const alertas = { ...prev.alertas }
      delete alertas[campoKey]
      return { ...prev, alertas }
    })
  }
  const toggleExpanded = (campoKey: string) => {
    setExpandedCampos((prev) => {
      const next = new Set(prev)
      next.has(campoKey) ? next.delete(campoKey) : next.add(campoKey)
      return next
    })
  }

  // Derived data — normalize defensively in case DB still has old array format
  const safeConfigAlertas: Record<string, any> = Array.isArray(config.alertas)
    ? { _global: config.alertas }
    : (config.alertas as any ?? {})
  const safeEditAlertas: Record<string, any> = Array.isArray(editConfig.alertas)
    ? { _global: editConfig.alertas }
    : (editConfig.alertas as any ?? {})

  const allGlobalDias = (safeConfigAlertas._global || []).filter((a: any) => a.activo).map((a: any) => a.dias as number)
  const maxAlertaDias = Math.max(...allGlobalDias, 0)
  const camposConOverride = Object.keys(safeEditAlertas).filter((k) => k !== '_global')

  // Filas para el flyer — solo dentro del umbral activo más alto
  const flyerDias = maxAlertaDias
  const flyerRows: FlyerRow[] = []
  for (const reg of registros) {
    for (const campo of camposDeTipo) {
      const fecha = reg[campo.key]
      const dias = getDaysUntil(fecha)
      if (dias === null || dias > flyerDias) continue
      flyerRows.push({ unidad: reg.name, documento: campo.label, fecha: fecha as string, dias })
    }
  }
  flyerRows.sort((a, b) => a.dias - b.dias)

  const handleDescargarFlyer = async () => {
    if (!flyerRef.current) return
    setDownloading(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(flyerRef.current, { pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `vencimientos-${tipo}-${hoyLima()}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Error generando imagen:', err)
    } finally {
      setDownloading(false)
    }
  }

  const registrosFiltrados = registros.filter((reg) => {
    // Odoo devuelve `false` para campos vacíos — normalizar a string vacío
    const nameStr = (reg.name || '') as string
    const secondField = esVehiculo
      ? ((reg.license_plate || '') as string)
      : ((reg.work_email || '') as string)
    const q = busqueda.toLowerCase()
    const matchBusqueda =
      !busqueda ||
      nameStr.toLowerCase().includes(q) ||
      secondField.toLowerCase().includes(q)

    if (!matchBusqueda) return false

    if (soloProximos) {
      return camposDeTipo.some((campo) => {
        const dias = getDaysUntil(reg[campo.key])
        if (dias === null) return false
        if (maxAlertaDias > 0 && dias <= maxAlertaDias) return true
        const campoMax = Math.max(...((safeConfigAlertas[campo.key] as any[] | undefined) || []).filter((a: any) => a.activo).map((a: any) => a.dias as number), 0)
        return campoMax > 0 && dias <= campoMax
      })
    }

    return true
  })

  // Stats
  const stats = {
    total: registros.length,
    vencidos: 0,
    proximos30: 0,
    proximos90: 0,
  }
  for (const reg of registros) {
    for (const campo of camposDeTipo) {
      const dias = getDaysUntil(reg[campo.key])
      if (dias === null) continue
      if (dias < 0) stats.vencidos++
      else if (dias <= 30) stats.proximos30++
      else if (dias <= 90) stats.proximos90++
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={Zap}
        title={<>Automatización — {titulo}</>}
        description="Vencimientos de documentos · Alertas automáticas por correo"
        actions={
          <>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowConfig(!showConfig); setEditConfig(config) }}
                className="gap-1.5"
              >
                <Settings className="h-4 w-4" />
                Configurar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadRegistros}
                disabled={loading}
                className="gap-1.5"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Actualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreview}
                disabled={previewing || loading}
                className="gap-1.5 text-info-ink border-info/30 hover:bg-info-soft"
              >
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                Vista previa
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDescargarFlyer}
                disabled={downloading || loading}
                className="gap-1.5 text-warning-ink border-warning/40 hover:bg-warning-soft"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Descargar vencimientos
              </Button>
              <Button size="sm" onClick={handleSendAlerts} disabled={sending || loading} className="gap-1.5">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Enviar correos
              </Button>
            </div>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: titulo, value: stats.total, tono: 'text-primary' },
          { label: 'Vencidos', value: stats.vencidos, tono: stats.vencidos ? 'text-destructive-ink' : 'text-primary' },
          { label: 'Vencen en 30 días', value: stats.proximos30, tono: stats.proximos30 ? 'text-warning-ink' : 'text-primary' },
          { label: 'Vencen en 90 días', value: stats.proximos90, tono: 'text-primary' },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg border bg-card p-3 ${s.value && s.tono !== 'text-primary' ? (s.tono === 'text-destructive-ink' ? 'border-destructive/30 bg-destructive-soft/40' : 'border-warning/40 bg-warning-soft/40') : ''}`}>
            <p className={`text-2xl font-bold tabular-nums ${s.tono}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="border rounded-xl p-4 bg-card space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" /> Configuración de alertas
            </h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowConfig(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Activo + filtro + destination_email */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={editConfig.activo}
                onCheckedChange={(v: boolean) => setEditConfig((p) => ({ ...p, activo: v }))}
                id="activo-switch"
              />
              <Label htmlFor="activo-switch" className="text-sm">Automatización activa</Label>
            </div>
            <div className="flex flex-col gap-1 ml-auto">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                {esVehiculo ? 'Filtro nombre:' : 'Puesto(s) Odoo:'}
              </Label>
              <Input
                value={editConfig.job_title}
                onChange={(e) => setEditConfig((p) => ({ ...p, job_title: e.target.value }))}
                placeholder={esVehiculo ? 'Ej: Tracto' : 'Ej: Conductor, Director Ejecutivo'}
                className="h-7 text-xs w-64"
              />
              {!esVehiculo && (
                <span className="text-2xs text-muted-foreground">Separa múltiples puestos con coma</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                {esVehiculo ? 'Correos destino:' : 'Correos jefes (copia):'}
              </Label>
              <Input
                value={editConfig.destination_email || ''}
                onChange={(e) => setEditConfig((p) => ({ ...p, destination_email: e.target.value }))}
                placeholder="admin@empresa.com, gerente@empresa.com"
                type="text"
                className="h-7 text-xs w-72"
              />
              <span className="text-2xs text-muted-foreground">
                {esVehiculo
                  ? 'Separa múltiples correos con coma'
                  : 'Recibirán un resumen consolidado de todos los conductores'}
              </span>
            </div>
          </div>

          {/* Alertas globales */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                Alertas globales
                <span className="font-normal text-muted-foreground ml-1">(aplican a todos los campos)</span>
              </Label>
              <Button variant="outline" size="sm" onClick={addGlobal} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Agregar
              </Button>
            </div>
            {(safeEditAlertas._global || []).length === 0 && (
              <p className="text-xs text-muted-foreground italic py-1">Sin alertas globales</p>
            )}
            {(safeEditAlertas._global || []).map((alerta: any, i: number) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-info-soft/50 border border-info/30 rounded-lg">
                <Checkbox
                  checked={alerta.activo}
                  onCheckedChange={(v: boolean) => updateGlobal(i, 'activo', v)}
                  className="shrink-0"
                />
                <Input
                  type="number"
                  value={alerta.dias}
                  onChange={(e) => updateGlobal(i, 'dias', parseInt(e.target.value) || 0)}
                  className="h-7 w-20 text-sm"
                  min={1}
                />
                <span className="text-xs text-muted-foreground shrink-0">días antes</span>
                <span className="text-xs font-medium text-info-ink flex-1">{diasANombre(alerta.dias)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeGlobal(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Alertas por campo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                Alertas por campo específico
                <span className="font-normal text-muted-foreground ml-1">(se suman a las globales)</span>
              </Label>
              <select
                className="h-7 text-xs border rounded-md px-2 bg-background text-foreground"
                value=""
                onChange={(e) => { if (e.target.value) addCampoOverride(e.target.value) }}
              >
                <option value="">+ Agregar campo…</option>
                {camposDeTipo.filter((c) => !safeEditAlertas[c.key]).map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>

            {camposConOverride.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-1">
                Sin configuración específica por campo. Selecciona un campo para personalizar sus alertas.
              </p>
            )}

            {camposConOverride.map((campoKey) => {
              const campo = camposDeTipo.find((c) => c.key === campoKey)
              const alertas = (safeEditAlertas[campoKey] as any[] | undefined) || []
              const expanded = expandedCampos.has(campoKey)
              return (
                <div key={campoKey} className="border border-warning/40 bg-warning-soft/40 rounded-lg overflow-hidden">
                  <div
                    className="flex items-center gap-2 p-2 cursor-pointer hover:bg-warning-soft transition-colors"
                    onClick={() => toggleExpanded(campoKey)}
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-xs font-medium flex-1">{campo?.label ?? campoKey}</span>
                    <Badge variant="outline" className="text-2xs h-4 border-warning/40 text-warning-ink">
                      {alertas.length} alerta{alertas.length !== 1 ? 's' : ''}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={(e) => { e.stopPropagation(); removeCampoOverride(campoKey) }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {expanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-warning/40 pt-2">
                      {alertas.map((alerta, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-background rounded-md">
                          <Checkbox
                            checked={alerta.activo}
                            onCheckedChange={(v: boolean) => updateCampoAlerta(campoKey, i, 'activo', v)}
                            className="shrink-0"
                          />
                          <Input
                            type="number"
                            value={alerta.dias}
                            onChange={(e) => updateCampoAlerta(campoKey, i, 'dias', parseInt(e.target.value) || 0)}
                            className="h-7 w-20 text-sm"
                            min={1}
                          />
                          <span className="text-xs text-muted-foreground shrink-0">días antes</span>
                          <span className="text-xs font-medium text-warning-ink flex-1">{diasANombre(alerta.dias)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCampoAlerta(campoKey, i)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addCampoAlerta(campoKey)} className="h-7 text-xs gap-1">
                        <Plus className="h-3 w-3" /> Agregar alerta
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-2 pt-1 border-t">
            <Button size="sm" onClick={saveConfig} disabled={savingConfig} className="gap-1.5">
              {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </Button>
            {configSaved && <span className="text-xs text-success-ink font-medium">✓ Guardado</span>}
            <p className="text-xs text-muted-foreground ml-auto">
              SMTP: configura SMTP_HOST, SMTP_USER, SMTP_PASS en .env.local
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive-soft border border-destructive/30 rounded-lg text-sm text-destructive-ink">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto" onClick={() => setError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Send result */}
      {sendResult && (
        <div className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${sendResult.error ? 'bg-destructive-soft border-destructive/30 text-destructive-ink' : 'bg-success-soft border-success/30 text-success-ink'}`}>
          {sendResult.error ? (
            <><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{sendResult.error}</>
          ) : (
            <div className="space-y-1 flex-1">
              <p className="font-semibold">
                ✓ {sendResult.enviados} correo(s) enviado(s) · {sendResult.errores} error(es)
              </p>
              {sendResult.detalles?.map((d: any, i: number) => (
                <p key={i} className="text-xs opacity-80">
                  {d.status === 'enviado' ? '✓' : '✗'} {d.nombre} &lt;{d.email}&gt;
                  {d.campos ? ` — ${d.campos} campo(s)` : ''}
                  {d.error ? ` — ${d.error}` : ''}
                </p>
              ))}
            </div>
          )}
          <button onClick={() => setSendResult(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && preview !== null && (
        <div className="border rounded-xl p-4 bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Bell className="h-4 w-4 text-info-ink" />
              Vista previa — {preview.length} {esVehiculo ? 'consolidado' : `${registroLabel} recibirán alertas`}
            </h3>
            <button onClick={() => setShowPreview(false)}><X className="h-4 w-4" /></button>
          </div>
          {preview.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No hay alertas pendientes de envío.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {preview.map((item, i) => (
                <div key={i} className="p-2 bg-muted/40 rounded-lg text-xs">
                  <p className="font-semibold">{item.nombre} &lt;{item.email}&gt;</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.campos.map((c, j) => (
                      <Badge
                        key={j}
                        variant="outline"
                        className={`text-2xs ${c.dias < 0 ? 'border-red-400 text-destructive-ink' : c.dias <= 30 ? 'border-orange-400 text-warning-ink' : 'border-yellow-400 text-warning-ink'}`}
                      >
                        {c.label}: {c.dias < 0 ? 'vencido' : `${c.dias}d`}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {preview.length > 0 && (
            <Button size="sm" onClick={handleSendAlerts} disabled={sending} className="gap-1.5">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Confirmar y enviar
            </Button>
          )}
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={esVehiculo ? 'Buscar por nombre o placa…' : 'Buscar por nombre o correo…'}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {busqueda && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setBusqueda('')}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="solo-proximos"
            checked={soloProximos}
            onCheckedChange={(v: boolean) => setSoloProximos(v)}
          />
          <Label htmlFor="solo-proximos" className="text-xs cursor-pointer">
            Solo con vencimientos próximos
          </Label>
        </div>
        <span className="text-xs text-muted-foreground">
          {registrosFiltrados.length} de {registros.length} {registroLabel}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando {registroLabel} desde Odoo…
        </div>
      ) : registrosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No se encontraron {registroLabel} con filtro "{config.job_title}".
          <br />Verifica el filtro en Configurar.
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-max">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="sticky left-0 z-20 bg-primary px-3 py-2.5 text-left font-semibold min-w-40">
                    {esVehiculo ? 'Unidad' : 'Empleado'}
                  </th>
                  <th className="sticky left-40 z-20 bg-primary px-3 py-2.5 text-left font-semibold min-w-[140px]">
                    {esVehiculo ? 'Placa' : 'Correo'}
                  </th>
                  {camposDeTipo.map((c) => (
                    <th
                      key={c.key}
                      className="px-2 py-2.5 text-center font-semibold whitespace-nowrap min-w-[90px]"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.map((reg, i) => {
                  const stickyBg = i % 2 === 0 ? 'bg-background' : 'bg-muted/60'
                  return (
                    <tr key={reg.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                      <td
                        title={reg.name}
                        className={`sticky left-0 z-20 px-3 py-2 font-medium border-r border-border/50 whitespace-nowrap max-w-40 truncate ${stickyBg}`}
                      >
                        {reg.name}
                      </td>
                      <td className={`sticky left-40 z-20 px-3 py-2 border-r border-border/50 whitespace-nowrap max-w-[160px] ${stickyBg}`}>
                        <div className="flex items-center gap-1">
                          {!esVehiculo && reg.work_email && (
                            <button
                              title="Copiar correo"
                              onClick={() => {
                                navigator.clipboard.writeText(reg.work_email)
                                setCopiedId(reg.id)
                                setTimeout(() => setCopiedId(null), 1800)
                              }}
                              className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            >
                              {copiedId === reg.id
                                ? <Check className="h-3 w-3 text-success-ink" />
                                : <Copy className="h-3 w-3" />
                              }
                            </button>
                          )}
                          <span className="truncate text-muted-foreground text-xs">
                            {esVehiculo ? (reg.license_plate || '—') : (reg.work_email || '—')}
                          </span>
                        </div>
                      </td>
                      {camposDeTipo.map((campo) => {
                        const fecha = reg[campo.key]
                        const dias = getDaysUntil(fecha)
                        const colorClass = getStatusColor(dias)
                        return (
                          <td
                            key={campo.key}
                            className={`px-2 py-2 text-center whitespace-nowrap ${colorClass} border-r border-border/20`}
                            title={fecha ? `${fecha} (${getStatusLabel(dias)})` : 'Sin fecha'}
                          >
                            {fecha ? (
                              <div className="flex flex-col items-center">
                                <span>{fecha as string}</span>
                                <span className="text-2xs opacity-75">{getStatusLabel(dias)}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {[
          { color: 'bg-destructive-soft', label: 'Vencido' },
          { color: 'bg-warning-soft', label: '≤ 30 días' },
          { color: 'bg-warning-soft', label: '≤ 90 días' },
          { color: 'bg-success-soft', label: '> 90 días' },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm ${l.color}`} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Flyer oculto para captura de imagen */}
      <div style={{ position: 'absolute', left: -9999, top: 0, pointerEvents: 'none' }}>
        <VencimientosFlyer ref={flyerRef} rows={flyerRows} />
      </div>
    </div>
  )
}
