'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface ResultadoItem {
  id: number
  ok: boolean
  odooId?: number
  beneficiario: string
  error?: string
}

interface SyncResult {
  total: number
  exitosos: number
  fallidos: number
  resultados: ResultadoItem[]
  message?: string
}

export function SyncOdooModal() {
  const [open, setOpen] = useState(false)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSync = async () => {
    if (!fechaDesde || !fechaHasta) return

    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/sync-odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaDesde, fechaHasta }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al sincronizar con Odoo')
        return
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setOpen(false)
    setResult(null)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true) }}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 sm:h-9 px-2 sm:px-4 bg-blue-50 text-blue-700 hover:text-blue-800 hover:bg-blue-100 border-blue-200 shadow-sm font-semibold text-xs rounded-lg"
        >
          <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Sync Odoo</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-600" />
            Sincronizar con Odoo
          </DialogTitle>
          <DialogDescription>
            Sube los pagos del rango de fechas seleccionado como gastos en Odoo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Selección de fechas */}
          {!result && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sync-desde" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Desde
                </Label>
                <Input
                  id="sync-desde"
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sync-hasta" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Hasta
                </Label>
                <Input
                  id="sync-hasta"
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {/* Error general */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-foreground">{result.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-2xl font-bold text-green-700">{result.exitosos}</p>
                  <p className="text-xs text-green-600 mt-0.5">Subidos</p>
                </div>
                <div className={`rounded-lg border p-3 ${result.fallidos > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                  <p className={`text-2xl font-bold ${result.fallidos > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
                    {result.fallidos}
                  </p>
                  <p className={`text-xs mt-0.5 ${result.fallidos > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    Fallidos
                  </p>
                </div>
              </div>

              {/* Sin registros */}
              {result.total === 0 && (
                <p className="text-sm text-center text-muted-foreground py-2">
                  No hay registros en ese rango de fechas.
                </p>
              )}

              {/* Lista de resultados con errores */}
              {result.resultados.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {result.resultados.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-start gap-2 p-2 rounded text-xs ${
                        r.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                      }`}
                    >
                      {r.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <span className="font-medium">{r.beneficiario}</span>
                        {r.ok && (
                          <span className="ml-1 text-green-600">→ Odoo #{r.odooId}</span>
                        )}
                        {!r.ok && (
                          <p className="text-red-600 mt-0.5 break-words">{r.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              {result ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!result && (
              <Button
                onClick={handleSync}
                disabled={loading || !fechaDesde || !fechaHasta}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sincronizar
                  </>
                )}
              </Button>
            )}
            {result && result.fallidos > 0 && (
              <Button
                onClick={() => { setResult(null); setError(null) }}
                variant="outline"
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                Reintentar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
