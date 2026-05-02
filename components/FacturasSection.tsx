'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'

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

const PAGE_SIZE = 65

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

function EstadoBadge({ state, isSent }: { state: string; isSent: boolean | false }) {
  if (state === 'cancel') {
    return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Cancelado</Badge>
  }
  if (state === 'posted') {
    if (isSent) {
      return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Enviado</Badge>
    }
    return <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">Registrado</Badge>
  }
  return <Badge variant="outline">Borrador</Badge>
}

function EnviadoBadge({ isSent }: { isSent: boolean | false }) {
  if (isSent) {
    return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Enviado</Badge>
  }
  return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Sin enviar</Badge>
}

export function FacturasSection() {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaInput, setBusquedaInput] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'all' | 'posted' | 'cancel'>('all')
  const [page, setPage] = useState(0)

  const load = useCallback(async (q: string, estado: string, pageNum: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageNum * PAGE_SIZE),
        estado,
      })
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

  useEffect(() => {
    load(busqueda, estadoFiltro, page)
  }, [load, busqueda, estadoFiltro, page])

  const handleSearch = () => {
    setBusqueda(busquedaInput)
    setPage(0)
  }

  const handleEstado = (v: 'all' | 'posted' | 'cancel') => {
    setEstadoFiltro(v)
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Stats from current page
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
            <p className="text-xs text-muted-foreground">Facturas de clientes desde Odoo</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(busqueda, estadoFiltro, page)}
          disabled={loading}
          className="gap-1.5 self-start sm:self-auto"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
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
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => { setBusquedaInput(''); setBusqueda(''); setPage(0) }}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={handleSearch}>
          Buscar
        </Button>
        <div className="flex items-center gap-1 ml-auto">
          {(['all', 'posted', 'cancel'] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={estadoFiltro === v ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => handleEstado(v)}
            >
              {v === 'all' ? 'Todos' : v === 'posted' ? 'Registradas' : 'Canceladas'}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {facturas.length} de {total}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando facturas desde Odoo…
        </div>
      ) : facturas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No se encontraron facturas.
        </div>
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
                  const dueColor =
                    f.state === 'cancel' || dias === null
                      ? 'text-muted-foreground'
                      : dias < 0
                      ? 'bg-red-100 text-red-700 font-semibold'
                      : dias <= 7
                      ? 'bg-orange-100 text-orange-700 font-semibold'
                      : dias <= 14
                      ? 'bg-yellow-100 text-yellow-700 font-medium'
                      : dias <= 30
                      ? 'bg-green-100 text-green-700'
                      : 'text-muted-foreground'

                  return (
                    <tr key={f.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                      <td className={`sticky left-0 z-20 px-3 py-2 font-medium border-r border-border/50 whitespace-nowrap ${stickyBg}`}>
                        {f.name}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" title={f.partner_id ? f.partner_id[1] : ''}>
                        {f.partner_id ? f.partner_id[1] : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {f.invoice_date || '—'}
                      </td>
                      <td className={`px-3 py-2 whitespace-nowrap ${dueColor}`}>
                        {formatDue(f.invoice_date_due)}
                      </td>
                      <td
                        className="px-3 py-2 max-w-[200px] truncate text-muted-foreground"
                        title={f.ref || ''}
                      >
                        {f.ref || '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {f.invoice_user_id ? f.invoice_user_id[1] : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                        {formatMoney(f.amount_untaxed)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-muted-foreground">
                        {formatMoney(f.amount_tax)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">
                        {formatMoney(f.amount_total)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <EstadoBadge state={f.state} isSent={f.is_move_sent} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <EnviadoBadge isSent={f.is_move_sent} />
                      </td>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="h-8 gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Pág. {page + 1} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
            className="h-8 gap-1"
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
