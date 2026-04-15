'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RefreshCw, AlertCircle, LogIn, LogOut, Search } from 'lucide-react'

interface ZoneEvent {
  id: string
  type: 'zone_in' | 'zone_out'
  tracker_id: number
  tracker_name: string
  zone_id: number | null
  zone_name: string
  time_display: string | null
  time_iso: string | null
}

export function ZoneEvents() {
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [events, setEvents] = useState<ZoneEvent[]>([])
  const [filtered, setFiltered] = useState<ZoneEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(sevenDaysAgo)
  const [to, setTo] = useState(today)
  const [type, setType] = useState<'zone_in' | 'zone_out' | 'all'>('zone_in')
  const [search, setSearch] = useState('')
  const [fetched, setFetched] = useState(false)

  const fetchEvents = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from, to, type })
      const res = await fetch(`/api/navitel/events?${params}`)
      const data = await res.json()
      if (data.success) {
        setEvents(data.events)
        setFiltered(data.events)
        setFetched(true)
      } else {
        setError(data.error || 'Error al cargar eventos')
      }
    } catch {
      setError('Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (term: string) => {
    setSearch(term)
    const t = term.toLowerCase()
    if (!t) {
      setFiltered(events)
    } else {
      setFiltered(events.filter(e =>
        e.tracker_name.toLowerCase().includes(t) ||
        e.zone_name.toLowerCase().includes(t)
      ))
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-muted-foreground">
            Historial de llegadas y salidas a geocercas
            {fetched && ` · ${filtered.length} eventos`}
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <div className="flex items-center gap-1.5 bg-background border rounded-lg px-2 py-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">Desde</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-7 w-32 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0"
            />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">Hasta</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-7 w-32 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0"
            />
          </div>

          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zone_in">Solo entradas</SelectItem>
              <SelectItem value="zone_out">Solo salidas</SelectItem>
              <SelectItem value="all">Entradas y salidas</SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" onClick={fetchEvents} disabled={loading} className="h-9">
            {loading
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Consultando...</>
              : <><Search className="h-4 w-4 mr-2" />Consultar</>
            }
          </Button>
        </div>

        {/* Buscador — solo cuando hay datos */}
        {fetched && events.length > 0 && (
          <div className="relative w-full sm:w-64 mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por vehículo o zona..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        )}
      </CardHeader>

      <CardContent>
        {!fetched && !loading && (
          <p className="text-center text-sm text-muted-foreground py-6">
            Selecciona el rango de fechas y presiona Consultar
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Consultando historial de todos los rastreadores...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {fetched && !loading && !error && filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {search ? 'No hay eventos con ese criterio' : 'No se encontraron eventos en el rango seleccionado'}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="divide-y divide-border">
            {filtered.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-muted/30 px-2 -mx-2 rounded-md transition-colors"
              >
                {/* Tipo de evento */}
                <div className={`p-1.5 rounded-md shrink-0 ${
                  ev.type === 'zone_in'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-orange-100 text-orange-700'
                }`}>
                  {ev.type === 'zone_in'
                    ? <LogIn className="h-3.5 w-3.5" />
                    : <LogOut className="h-3.5 w-3.5" />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{ev.tracker_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {ev.type === 'zone_in' ? 'entró a' : 'salió de'}
                    </span>
                    <span className="text-sm font-medium text-primary truncate">{ev.zone_name}</span>
                  </div>
                </div>

                {/* Hora */}
                <div className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  {ev.time_display ?? '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
