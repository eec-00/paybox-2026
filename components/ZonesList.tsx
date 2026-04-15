'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw, Search, AlertCircle, MapPin, Copy, CheckCircle, ExternalLink } from 'lucide-react'

interface Zone {
  id: number
  name: string
  lat: number | null
  lng: number | null
  area: number | null
}

export function ZonesList() {
  const [zones, setZones] = useState<Zone[]>([])
  const [filtered, setFiltered] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const fetchZones = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/navitel/zones')
      const data = await res.json()
      if (data.success) {
        setZones(data.zones)
        setFiltered(data.zones)
      } else {
        setError(data.error || 'Error al cargar geocercas')
      }
    } catch {
      setError('Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchZones() }, [])

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFiltered(zones)
    } else {
      const term = searchTerm.toLowerCase()
      setFiltered(zones.filter(z =>
        z.name.toLowerCase().includes(term) || z.id.toString().includes(term)
      ))
    }
  }, [searchTerm, zones])

  const copyId = async (id: number) => {
    try {
      await navigator.clipboard.writeText(id.toString())
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* ignore */ }
  }

  const formatArea = (area: number | null) => {
    if (area == null) return null
    if (area >= 1_000_000) return `${(area / 1_000_000).toFixed(2)} km²`
    if (area >= 10_000) return `${(area / 10_000).toFixed(1)} ha`
    return `${area.toLocaleString()} m²`
  }

  const mapsUrl = (lat: number, lng: number) =>
    `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}&z=15`

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground">
            Geocercas registradas en Navitel ({filtered.length} de {zones.length})
          </p>
          <div className="flex items-center gap-2">
            <div className="relative w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar geocerca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchZones} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Cargando geocercas...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? 'No se encontraron geocercas con ese criterio' : 'No hay geocercas registradas'}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="divide-y divide-border">
            {filtered.map((zone) => {
              const hasCoords = zone.lat != null && zone.lng != null
              return (
                <div
                  key={zone.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:bg-muted/30 px-2 -mx-2 rounded-md transition-colors"
                >
                  {/* Icono + info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 p-1.5 bg-primary/10 rounded-md shrink-0">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{zone.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">ID: {zone.id}</span>
                        {hasCoords && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {zone.lat!.toFixed(5)}, {zone.lng!.toFixed(5)}
                          </span>
                        )}
                        {zone.area != null && (
                          <span className="text-xs text-muted-foreground">
                            {formatArea(zone.area)}
                          </span>
                        )}
                        {!hasCoords && (
                          <span className="text-xs text-muted-foreground/50 italic">sin coordenadas</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-1 shrink-0">
                    {hasCoords && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Ver en Google Maps"
                        onClick={() => window.open(mapsUrl(zone.lat!, zone.lng!), '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Copiar ID"
                      onClick={() => copyId(zone.id)}
                    >
                      {copiedId === zone.id
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        : <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
