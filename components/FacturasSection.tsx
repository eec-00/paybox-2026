'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { type AlertaThreshold, type AlertasConfig, normalizeAlertas, diasANombre } from '@/lib/automatizacion/campos'

interface Factura {
  id: number
  name: string
  move_type: string
  partner_id: [number, string] | false
  invoice_date: string | false
  invoice_date_due: string | false
  ref: string | false
  invoice_user_id: [number, string] | false
  amount_untaxed: number
  amount_tax: number
  amount_total: number
  state: 'draft' | 'posted' | 'cancel'
  payment_state: string
  is_move_sent: boolean | false
}

interface FacturasConfig {
  tipo: 'facturas'
  job_title: string
  alertas: AlertasConfig
  activo: boolean
  destination_email: string
}

interface PreviewItem {
  nombre: string
  cliente: string
  vencimiento: string
  total: number
  dias: number
  diasAlerta: number
}

const PAGE_SIZE = 65

const DEFAULT_CONFIG: FacturasConfig = {
  tipo: 'facturas',
  job_title: 'facturas',
  alertas: { _global: [{ dias: 7, activo: true, nombre: '1 semana' }, { dias: 14, activo: true, nombre: '2 semanas' }, { dias: 30, activo: true, nombre: '1 mes' }] },
  activo: true,
  destination_email: '',
}

function daysUntil(dateStr: string | false): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function formatDue(dateStr: string | false): string {
  if (!dateStr) return '—'
  const days = daysUntil(dateStr)
  if (days === null) return '—'
  if (days === 0) return 'Hoy'
  if (days < 0) return `Hace ${Math.abs(days)} días`
  return `En ${days} días`
}

function formatMoney(amount: number): string {
  return `S/ ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const CLOSED_PAYMENT_STATES = new Set(['paid', 'reversed', 'in_payment'])

function isDueClosed(state: string, paymentState: string): boolean {
  return state === 'cancel' || CLOSED_PAYMENT_STATES.has(paymentState)
}

function dueCellClass(state: string, paymentState: string, dias: number | null): string {
  if (isDueClosed(state, paymentState) || dias === null) return 'text-muted-foreground'
  if (dias < 0) return 'bg-red-100 text-red-700 font-semibold'
  if (dias <= 7) return 'bg-orange-100 text-orange-700 font-semibold'
  if (dias <= 14) return 'bg-yellow-100 text-yellow-700 font-medium'
  if (dias <= 30) return 'bg-green-100 text-green-700'
  return 'text-muted-foreground'
}

function EstadoBadge({ state, paymentState, isSent }: { state: string; paymentState: string; isSent: boolean | false }) {
  if (state === 'cancel') return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Cancelado</Badge>
  if (state === 'posted') {
    if (paymentState === 'paid') return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">Pagado</Badge>
    if (paymentState === 'reversed') return <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100">Revertido</Badge>
    if (paymentState === 'in_payment') return <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 hover:bg-cyan-100">En proceso de pago</Badge>
    if (paymentState === 'partial') return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100">Pago parcial</Badge>
    if (isSent) return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Enviado</Badge>
    return <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">Registrado</Badge>
  }
  return <Badge variant="outline">Borrador</Badge>
}

function EnviadoBadge({ isSent }: { isSent: boolean | false }) {
  return isSent
    ? <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Enviado</Badge>
    : <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Sin enviar</Badge>
}

export function FacturasSection() {
  // Data
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [busquedaInput, setBusquedaInput] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'all' | 'posted' | 'cancel'>('all')
  const [page, setPage] = useState(0)

  // Config
  const [config, setConfig] = useState<FacturasConfig>(DEFAULT_CONFIG)
  const [editConfig, setEditConfig] = useState<FacturasConfig>(DEFAULT_CONFIG)
  const [showConfig, setShowConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  // Alerts
  const [preview, setPreview] = useState<PreviewItem[] | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<any | null>(null)

  const loadFacturas = useCallback(async (q: string, estado: string, pageNum: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageNum * PAGE_SIZE), estado })
      if (q) params.set('q', q)
      const res = await fetch(`/api/automatizacion/facturas?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar facturas')
      setFacturas(data.facturas || [])
      setTotal(data.total || 0)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/automatizacion/config?tipo=facturas')
      if (res.ok) {
        const raw = await res.json()
        const normalized = { ...DEFAULT_CONFIG, ...raw, alertas: normalizeAlertas(raw.alertas) }
        setConfig(normalized)
        setEditConfig(normalized)
      }
    } catch { /* use defaults */ }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => { loadFacturas(busqueda, estadoFiltro, page) }, [loadFacturas, busqueda, estadoFiltro, page])

  const saveConfig = async () => {
    setSavingConfig(true)
    try {
      await fetch('/api/automatizacion/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editConfig),
      })
      setConfig(editConfig)
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2500)
    } catch { /* noop */ } finally { setSavingConfig(false) }
  }

  const handlePreview = async () => {
    setPreviewing(true)
    setPreview(null)
    try {
      const res = await fetch('/api/automatizacion/facturas-alertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soloPreview: true }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPreview(data.detalle || [])
      setShowPreview(true)
    } catch (err: any) { setError(err.message) }
    finally { setPreviewing(false) }
  }

  const handleSendAlerts = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/automatizacion/facturas-alertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soloPreview: false }),
      })
      const data = await res.json()
      setSendResult(data)
      setShowPreview(false)
    } catch (err: any) { setError(err.message) }
    finally { setSending(false) }
  }

  // Config helpers — global alertas
  const safeEdit = Array.isArray(editConfig.alertas) ? { _global: editConfig.alertas } : (editConfig.alertas ?? {})
  const globalAlertas: AlertaThreshold[] = (safeEdit._global || [])

  const addGlobal = () => setEditConfig((p) => ({
    ...p, alertas: { ...safeEdit, _global: [...globalAlertas, { dias: 60, activo: true }] },
  }))
  const removeGlobal = (i: number) => setEditConfig((p) => ({
    ...p, alertas: { ...safeEdit, _global: globalAlertas.filter((_, idx) => idx !== i) },
  }))
  const updateGlobal = (i: number, field: keyof AlertaThreshold, value: any) => setEditConfig((p) => ({
    ...p, alertas: { ...safeEdit, _global: globalAlertas.map((a, idx) => idx === i ? { ...a, [field]: value } : a) },
  }))

  const handleSearch = () => { setBusqueda(busquedaInput); setPage(0) }
  const handleEstado = (v: 'all' | 'posted' | 'cancel') => { setEstadoFiltro(v); setPage(0) }
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const stats = {
    total,
    enviadas: facturas.filter((f) => f.is_move_sent).length,
    canceladas: facturas.filter((f) => f.state === 'cancel').length,
    montoTotal: facturas.reduce((s, f) => s + (f.state !== 'cancel' ? f.amount_total : 0), 0),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Facturas</h2>
            <p className="text-xs text-muted-foreground">Facturas de clientes · Alertas de vencimiento por correo</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { setShowConfig(!showConfig); setEditConfig(config) }} className="gap-1.5">
            <Settings className="h-4 w-4" /> Configurar
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadFacturas(busqueda, estadoFiltro, page)} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={previewing || loading}
            className="gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
          >
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Vista previa
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={sending || loading} className="gap-1.5 bg-primary hover:bg-primary/90">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Enviar correos
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Confirmar envío de correos?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se enviará un correo consolidado a los destinatarios configurados con todas las facturas
                  próximas a vencer según los umbrales configurados. Solo se enviarán facturas que aún no
                  hayan sido notificadas en ese umbral.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleSendAlerts}>Sí, enviar ahora</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total facturas', value: total, color: 'bg-primary/10 text-primary' },
          { label: 'Enviadas (pág.)', value: stats.enviadas, color: 'bg-green-100 text-green-700' },
          { label: 'Canceladas (pág.)', value: stats.canceladas, color: 'bg-red-100 text-red-700' },
          { label: 'Monto (pág.)', value: formatMoney(stats.montoTotal), color: 'bg-blue-100 text-blue-700' },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg p-3 ${s.color}`}>
            <p className="text-lg font-bold leading-tight">{s.value}</p>
            <p className="text-xs font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="border rounded-xl p-4 bg-card space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" /> Configuración de alertas — Facturas
            </h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowConfig(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Destination email */}
          <div className="flex flex-col gap-1 max-w-sm">
            <Label className="text-xs text-muted-foreground">Correos destino</Label>
            <Input
              value={editConfig.destination_email || ''}
              onChange={(e) => setEditConfig((p) => ({ ...p, destination_email: e.target.value }))}
              placeholder="admin@empresa.com, gerente@empresa.com"
              className="h-7 text-xs"
            />
            <span className="text-[10px] text-muted-foreground">Separa múltiples correos con coma. Recibirán un resumen consolidado.</span>
          </div>

          {/* Global alertas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                Umbrales de alerta
                <span className="font-normal text-muted-foreground ml-1">(días antes del vencimiento)</span>
              </Label>
              <Button variant="outline" size="sm" onClick={addGlobal} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Agregar
              </Button>
            </div>
            {globalAlertas.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-1">Sin umbrales. Agrega al menos uno.</p>
            )}
            {globalAlertas.map((alerta, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-blue-50/50 border border-blue-100 rounded-lg">
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
                <span className="text-xs font-medium text-blue-700 flex-1">{diasANombre(alerta.dias)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeGlobal(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1 border-t">
            <Button size="sm" onClick={saveConfig} disabled={savingConfig} className="gap-1.5">
              {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </Button>
            {configSaved && <span className="text-xs text-green-600 font-medium">✓ Guardado</span>}
            <p className="text-xs text-muted-foreground ml-auto">
              SMTP: configura SMTP_HOST, SMTP_USER, SMTP_PASS en .env.local
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto" onClick={() => setError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Send result */}
      {sendResult && (
        <div className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${sendResult.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {sendResult.error ? (
            <><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{sendResult.error}</>
          ) : (
            <div className="space-y-1 flex-1">
              <p className="font-semibold">✓ {sendResult.enviados} correo(s) enviado(s) · {sendResult.errores} error(es)</p>
              {sendResult.detalles?.map((d: any, i: number) => (
                <p key={i} className="text-xs opacity-80">
                  {d.status === 'enviado' ? '✓' : '✗'} {d.nombre} — {d.email}
                  {d.campos ? ` — ${d.campos} factura(s)` : ''}
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
              <Bell className="h-4 w-4 text-blue-600" />
              Vista previa — {preview.length} factura(s) pendientes de notificar
            </h3>
            <button onClick={() => setShowPreview(false)}><X className="h-4 w-4" /></button>
          </div>
          {preview.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No hay facturas pendientes de notificar con los umbrales configurados.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-2 py-1.5 text-left font-semibold">Factura</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Cliente</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Vencimiento</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Total</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => {
                    const colorClass = p.dias < 0
                      ? 'text-red-600 font-semibold'
                      : p.dias <= 7 ? 'text-orange-600 font-semibold'
                      : p.dias <= 14 ? 'text-yellow-700 font-medium'
                      : 'text-green-700'
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{p.nombre}</td>
                        <td className="px-2 py-1.5 max-w-40 truncate text-muted-foreground" title={p.cliente}>{p.cliente}</td>
                        <td className="px-2 py-1.5 text-center whitespace-nowrap text-muted-foreground">{p.vencimiento}</td>
                        <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">{formatMoney(p.total)}</td>
                        <td className={`px-2 py-1.5 text-center whitespace-nowrap ${colorClass}`}>
                          {p.dias < 0 ? `vencido ${Math.abs(p.dias)}d` : `${p.dias}d`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar número o cliente…"
            value={busquedaInput}
            onChange={(e) => setBusquedaInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-8 h-8 text-sm"
          />
          {busquedaInput && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => { setBusquedaInput(''); setBusqueda(''); setPage(0) }}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={handleSearch}>Buscar</Button>
        <div className="flex items-center gap-1 ml-auto">
          {(['all', 'posted', 'cancel'] as const).map((v) => (
            <Button key={v} size="sm" variant={estadoFiltro === v ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => handleEstado(v)}>
              {v === 'all' ? 'Todos' : v === 'posted' ? 'Registradas' : 'Canceladas'}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{facturas.length} de {total}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando facturas desde Odoo…
        </div>
      ) : facturas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No se encontraron facturas.</div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-max">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="sticky left-0 z-20 bg-primary px-3 py-2.5 text-left font-semibold min-w-[130px]">Número</th>
                  <th className="px-3 py-2.5 text-left font-semibold min-w-[180px]">Cliente</th>
                  <th className="px-3 py-2.5 text-left font-semibold min-w-[100px]">Fecha</th>
                  <th className="px-3 py-2.5 text-left font-semibold min-w-[130px]">Vencimiento</th>
                  <th className="px-3 py-2.5 text-left font-semibold min-w-[180px]">Referencia</th>
                  <th className="px-3 py-2.5 text-left font-semibold min-w-[130px]">Vendedor</th>
                  <th className="px-3 py-2.5 text-right font-semibold min-w-[110px]">Imp. no inc.</th>
                  <th className="px-3 py-2.5 text-right font-semibold min-w-[90px]">Impuesto</th>
                  <th className="px-3 py-2.5 text-right font-semibold min-w-[110px]">Total</th>
                  <th className="px-3 py-2.5 text-center font-semibold min-w-[100px]">Estado</th>
                  <th className="px-3 py-2.5 text-center font-semibold min-w-[90px]">Enviado</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f, i) => {
                  const stickyBg = i % 2 === 0 ? 'bg-background' : 'bg-muted/60'
                  const dias = daysUntil(f.invoice_date_due)
                  const closed = isDueClosed(f.state, f.payment_state)
                  return (
                    <tr key={f.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                      <td className={`sticky left-0 z-20 px-3 py-2 font-medium border-r border-border/50 whitespace-nowrap ${stickyBg}`}>
                        {f.name}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" title={f.partner_id ? f.partner_id[1] : ''}>
                        {f.partner_id ? f.partner_id[1] : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{f.invoice_date || '—'}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${dueCellClass(f.state, f.payment_state, dias)}`}>
                        {closed ? '—' : formatDue(f.invoice_date_due)}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground" title={f.ref || ''}>
                        {f.ref || '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {f.invoice_user_id ? f.invoice_user_id[1] : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(f.amount_untaxed)}</td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-muted-foreground">{formatMoney(f.amount_tax)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">{formatMoney(f.amount_total)}</td>
                      <td className="px-3 py-2 text-center"><EstadoBadge state={f.state} paymentState={f.payment_state} isSent={f.is_move_sent} /></td>
                      <td className="px-3 py-2 text-center"><EnviadoBadge isSent={f.is_move_sent} /></td>
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
          { color: 'bg-red-100', label: 'Vencido' },
          { color: 'bg-orange-100', label: '≤ 7 días' },
          { color: 'bg-yellow-100', label: '≤ 14 días' },
          { color: 'bg-green-100', label: '≤ 30 días' },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm ${l.color}`} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading} className="h-8 gap-1">
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">Pág. {page + 1} de {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1 || loading} className="h-8 gap-1">
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
