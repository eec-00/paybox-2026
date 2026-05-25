'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Car, RefreshCw, Search, AlertCircle, Link2, ExternalLink, Clock,
  Copy, CheckCircle, Share2, Calendar, Zap, Trash2, History, User,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Vehicle {
  id: number
  label: string
}

interface HistorialEntry {
  id: string
  created_at: string
  user_email: string
  user_name: string | null
  vehiculos: string
  duracion_horas: number | null
  expira_at: string | null
}

interface GeoLinkData {
  id: number
  hash: string
  description: string
  url: string
  create_date: string
  lifetime?: { from: string; to: string } | null
  trackers: Array<{ alias: string; tracker_id: number }>
  enabled: boolean
}

const DURATION_PRESETS = [
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '4h', hours: 4 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
]

export function VehiclesList() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [creatingLink, setCreatingLink] = useState(false)
  const [geoLinkResult, setGeoLinkResult] = useState<GeoLinkData | null>(null)
  const [geoLinkError, setGeoLinkError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const [durationMode, setDurationMode] = useState<'preset' | 'custom'>('preset')
  const [presetHours, setPresetHours] = useState(6)
  const [customEndDate, setCustomEndDate] = useState('')

  const [geolinks, setGeolinks] = useState<GeoLinkData[]>([])
  const [loadingGeolinks, setLoadingGeolinks] = useState(true)
  const [geolinksError, setGeolinksError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [historial, setHistorial] = useState<HistorialEntry[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [historialError, setHistorialError] = useState<string | null>(null)
  const [historialOpen, setHistorialOpen] = useState(false)

  const fetchVehicles = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/navitel')
      const data = await response.json()
      if (data.success) {
        setVehicles(data.vehicles)
        setFilteredVehicles(data.vehicles)
      } else {
        setError(data.error || 'Error al cargar vehículos')
      }
    } catch {
      setError('Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  const fetchGeolinks = async () => {
    setLoadingGeolinks(true)
    setGeolinksError(null)
    try {
      const response = await fetch('/api/navitel/geolink/list')
      const data = await response.json()
      if (data.success) {
        setGeolinks(data.geolinks)
      } else {
        setGeolinksError(data.error || 'Error al cargar geoenlaces')
      }
    } catch {
      setGeolinksError('Error de conexión con el servidor')
    } finally {
      setLoadingGeolinks(false)
    }
  }

  const fetchHistorial = async () => {
    setLoadingHistorial(true)
    setHistorialError(null)
    try {
      const response = await fetch('/api/navitel/geolink/historial')
      const data = await response.json()
      if (data.success) {
        setHistorial(data.historial)
      } else {
        setHistorialError(data.error || 'Error al cargar historial')
      }
    } catch {
      setHistorialError('Error de conexión con el servidor')
    } finally {
      setLoadingHistorial(false)
    }
  }

  useEffect(() => {
    fetchVehicles()
    fetchGeolinks()
  }, [])

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredVehicles(vehicles)
    } else {
      setFilteredVehicles(
        vehicles.filter(v => v.label.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    }
  }, [searchTerm, vehicles])

  const toggleVehicle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(filteredVehicles.map(v => v.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const getMinDateTime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  }

  const getEndDate = (): Date => {
    if (durationMode === 'custom' && customEndDate) {
      return new Date(customEndDate)
    }
    return new Date(Date.now() + presetHours * 60 * 60 * 1000)
  }

  const formatEndDatePreview = () =>
    getEndDate().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })

  const handleCreateGeoLink = async () => {
    const selectedVehicles = vehicles.filter(v => selectedIds.has(v.id))
    if (selectedVehicles.length === 0) return

    setCreatingLink(true)
    setGeoLinkError(null)
    setGeoLinkResult(null)

    try {
      const response = await fetch('/api/navitel/geolink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackers: selectedVehicles.map(v => ({ id: v.id, label: v.label })),
          end_date: getEndDate().toISOString(),
        }),
      })

      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Error al crear geoenlace')

      const linkHash = data.data?.hash
      const result: GeoLinkData = {
        id: data.data?.id || data.linkId,
        hash: linkHash,
        description: selectedVehicles.length === 1
          ? `Geoenlace de ${selectedVehicles[0].label}`
          : `Geoenlace: ${selectedVehicles.map(v => v.label).join(', ')}`,
        url: linkHash ? `https://control.navitelgps.com/ls/${linkHash}` : '',
        create_date: new Date().toISOString(),
        lifetime: data.data?.lifetime,
        trackers: selectedVehicles.map(v => ({ alias: v.label, tracker_id: v.id })),
        enabled: true,
      }

      setGeoLinkResult(result)
      fetchGeolinks()
    } catch (err) {
      setGeoLinkError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setCreatingLink(false)
    }
  }

  const handleDeleteGeolink = async (id: number) => {
    setDeletingId(id)
    try {
      const response = await fetch('/api/navitel/geolink/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Error al eliminar')
      setGeolinks(prev => prev.filter(g => g.id !== id))
    } catch (err) {
      setGeolinksError(err instanceof Error ? err.message : 'Error al eliminar geoenlace')
    } finally {
      setDeletingId(null)
    }
  }

  const copyToClipboard = async (text: string, id?: number) => {
    try {
      await navigator.clipboard.writeText(text)
      if (id !== undefined) {
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
      }
    } catch { /* silent */ }
  }

  const shareLink = async (url: string, description: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: description, text: `Seguimiento GPS: ${description}`, url })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') copyToClipboard(url)
      }
    } else {
      copyToClipboard(url)
    }
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })

  const formatDuration = (horas: number | null) => {
    if (horas === null) return '—'
    if (horas < 1) return `${Math.round(horas * 60)} min`
    if (horas % 1 === 0) return `${horas}h`
    return `${horas.toFixed(1)}h`
  }

  const isExpired = (geolink: GeoLinkData) =>
    !!geolink.lifetime && new Date(geolink.lifetime.to) < new Date()

  const resetDialog = () => {
    setGeoLinkResult(null)
    setGeoLinkError(null)
    setDurationMode('preset')
    setPresetHours(6)
    setCustomEndDate('')
  }

  const selectedVehicles = vehicles.filter(v => selectedIds.has(v.id))
  const canCreate = selectedIds.size > 0
  const isCustomValid = durationMode !== 'custom' || !!customEndDate

  return (
    <>
      {/* Flota GPS */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-primary/10 rounded-md">
                <Car className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Flota GPS</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {vehicles.length} vehículos
                  {selectedIds.size > 0 && (
                    <> · <span className="text-primary font-medium">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span></>
                  )}
                  {selectedIds.size === 0 && ' · Selecciona para crear geoenlace'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar placa..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 w-40 text-sm"
                />
              </div>

              {!loading && vehicles.length > 0 && (
                selectedIds.size > 0 ? (
                  <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={clearSelection}>
                    Limpiar
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={selectAll}>
                    Selec. todos
                  </Button>
                )
              )}

              <Button
                variant="default"
                size="sm"
                className="h-8 gap-1.5"
                disabled={!canCreate}
                onClick={() => { resetDialog(); setDialogOpen(true) }}
              >
                <Link2 className="h-3.5 w-3.5" />
                Crear Geoenlace
                {selectedIds.size > 0 && (
                  <span className="ml-0.5 bg-primary-foreground/20 text-primary-foreground text-xs font-semibold rounded px-1.5 py-0.5 leading-none">
                    {selectedIds.size}
                  </span>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => { fetchVehicles(); fetchGeolinks() }}
                disabled={loading}
                title="Actualizar"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando flota...</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && filteredVehicles.length === 0 && (
            <p className="text-center py-10 text-sm text-muted-foreground">
              {searchTerm ? 'Sin resultados para esa búsqueda' : 'No hay vehículos registrados'}
            </p>
          )}
          {!loading && !error && filteredVehicles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {filteredVehicles.map(vehicle => {
                const selected = selectedIds.has(vehicle.id)
                return (
                  <button
                    key={vehicle.id}
                    onClick={() => toggleVehicle(vehicle.id)}
                    className={cn(
                      'relative flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all select-none',
                      selected
                        ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/20 shadow-sm'
                        : 'bg-muted/20 border-border/60 hover:bg-muted/40 hover:border-border'
                    )}
                  >
                    {selected && (
                      <span className="absolute top-1 right-1">
                        <CheckCircle className="h-3 w-3 text-primary" />
                      </span>
                    )}
                    <Car className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
                    <span className={cn('text-xs font-medium truncate', selected ? 'text-primary' : 'text-foreground')}>
                      {vehicle.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Crear Geoenlace */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetDialog() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Crear Geoenlace
            </DialogTitle>
            <DialogDescription>
              {selectedVehicles.length === 1
                ? '1 vehículo seleccionado'
                : `${selectedVehicles.length} vehículos seleccionados`}
            </DialogDescription>
          </DialogHeader>

          {!geoLinkResult ? (
            <div className="space-y-5 py-1">
              {/* Vehículos */}
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Vehículos</p>
                <div className="flex flex-wrap gap-1.5 p-3 bg-muted/30 rounded-lg min-h-10 border border-border/60">
                  {selectedVehicles.map(v => (
                    <span
                      key={v.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-medium"
                    >
                      <Car className="h-2.5 w-2.5" />
                      {v.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Duración */}
              <div className="space-y-2.5">
                <p className="text-sm font-medium">Duración</p>
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_PRESETS.map(({ label, hours }) => (
                    <button
                      key={hours}
                      onClick={() => { setDurationMode('preset'); setPresetHours(hours) }}
                      className={cn(
                        'px-3 py-1.5 text-sm rounded-md border transition-all font-medium',
                        durationMode === 'preset' && presetHours === hours
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background hover:bg-muted border-border text-foreground/80'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={() => setDurationMode('custom')}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-md border transition-all font-medium inline-flex items-center gap-1.5',
                      durationMode === 'custom'
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background hover:bg-muted border-border text-foreground/80'
                    )}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Personalizado
                  </button>
                </div>

                {durationMode === 'custom' && (
                  <Input
                    type="datetime-local"
                    value={customEndDate}
                    min={getMinDateTime()}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="w-full text-sm"
                  />
                )}

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    Expira:{' '}
                    <span className="text-foreground font-medium">{formatEndDatePreview()}</span>
                  </span>
                </div>
              </div>

              {geoLinkError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{geoLinkError}</span>
                </div>
              )}

              <Button
                onClick={handleCreateGeoLink}
                disabled={!canCreate || creatingLink || !isCustomValid}
                className="w-full"
              >
                {creatingLink ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Generar Geoenlace
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">Geoenlace creado exitosamente</span>
              </div>

              <div className="space-y-3 p-4 bg-muted/40 rounded-lg border border-border/60">
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Vehículos</p>
                  <div className="flex flex-wrap gap-1">
                    {geoLinkResult.trackers.map(t => (
                      <span
                        key={t.tracker_id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-medium"
                      >
                        <Car className="h-2.5 w-2.5" />
                        {t.alias}
                      </span>
                    ))}
                  </div>
                </div>

                {geoLinkResult.lifetime && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Vigencia</p>
                    <p className="text-sm flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(geoLinkResult.lifetime.from)} → {formatDate(geoLinkResult.lifetime.to)}
                    </p>
                  </div>
                )}

                {geoLinkResult.url && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Enlace de seguimiento</p>
                    <div className="flex items-center gap-1.5">
                      <Input value={geoLinkResult.url} readOnly className="text-xs h-8 flex-1" />
                      <Button
                        variant="outline" size="icon" className="h-8 w-8 shrink-0"
                        onClick={() => copyToClipboard(geoLinkResult!.url, geoLinkResult!.id)}
                        title="Copiar"
                      >
                        {copiedId === geoLinkResult.id
                          ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                          : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="outline" size="icon" className="h-8 w-8 shrink-0"
                        onClick={() => window.open(geoLinkResult!.url, '_blank')}
                        title="Abrir"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline" size="icon" className="h-8 w-8 shrink-0"
                        onClick={() => shareLink(geoLinkResult!.url, geoLinkResult!.description)}
                        title="Compartir"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Button variant="outline" onClick={resetDialog} className="w-full">
                Crear otro geoenlace
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Historial */}
      <Dialog open={historialOpen} onOpenChange={setHistorialOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Historial de geoenlaces
            </DialogTitle>
            <DialogDescription>
              Registro de creación — solo lectura
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingHistorial && (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span className="text-sm">Cargando historial...</span>
              </div>
            )}
            {historialError && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{historialError}</span>
              </div>
            )}
            {!loadingHistorial && !historialError && historial.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <History className="h-8 w-8 opacity-30" />
                <p className="text-sm">Sin registros aún</p>
              </div>
            )}
            {!loadingHistorial && !historialError && historial.length > 0 && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Usuario</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Vehículo(s)</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Duración</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Fecha y hora</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map(entry => (
                    <tr key={entry.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div>
                            {entry.user_name && (
                              <p className="text-xs font-medium leading-tight">{entry.user_name}</p>
                            )}
                            <p className="text-xs text-muted-foreground leading-tight">{entry.user_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {entry.vehiculos.split(', ').map((v, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-medium"
                            >
                              <Car className="h-2.5 w-2.5" />
                              {v}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 text-xs text-foreground">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatDuration(entry.duracion_horas)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(entry.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Geoenlaces Activos */}
      <Card className="mt-4 border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-primary/10 rounded-md">
                <Link2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Geoenlaces Activos</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {geolinks.length} enlace{geolinks.length !== 1 ? 's' : ''} de seguimiento
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm" className="h-8 w-8 p-0"
                onClick={fetchGeolinks} disabled={loadingGeolinks}
                title="Actualizar"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loadingGeolinks && 'animate-spin')} />
              </Button>
              <Button
                variant="outline" size="sm" className="h-8 w-8 p-0"
                onClick={() => {
                  setHistorialOpen(true)
                  if (historial.length === 0 && !loadingHistorial) fetchHistorial()
                }}
                title="Ver historial"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loadingGeolinks && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando...</span>
            </div>
          )}
          {geolinksError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{geolinksError}</span>
            </div>
          )}
          {!loadingGeolinks && !geolinksError && geolinks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Link2 className="h-8 w-8 opacity-30" />
              <p className="text-sm">Sin geoenlaces creados</p>
            </div>
          )}
          {!loadingGeolinks && !geolinksError && geolinks.length > 0 && (
            <div className="space-y-2">
              {geolinks.map(geolink => {
                const expired = isExpired(geolink)
                return (
                  <div
                    key={geolink.id}
                    className={cn(
                      'flex items-center justify-between p-3.5 rounded-lg border transition-colors',
                      expired
                        ? 'bg-muted/10 border-border/30 opacity-55'
                        : 'bg-muted/25 border-border/60 hover:bg-muted/40'
                    )}
                  >
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {geolink.trackers?.length > 0 ? (
                          geolink.trackers.map((t, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-medium"
                            >
                              <Car className="h-2.5 w-2.5" />
                              {t.alias}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm font-medium">{geolink.description || 'Sin nombre'}</span>
                        )}

                        {!geolink.lifetime && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded text-xs">
                            ∞ Permanente
                          </span>
                        )}
                        {geolink.lifetime && !expired && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                            Activo
                          </span>
                        )}
                        {geolink.lifetime && expired && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-muted text-muted-foreground border border-border rounded text-xs">
                            Expirado
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>Creado: {formatDate(geolink.create_date)}</span>
                        {geolink.lifetime && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {expired ? 'Expiró' : 'Hasta'}: {formatDate(geolink.lifetime.to)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 ml-3 shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => copyToClipboard(geolink.url, geolink.id)}
                        title="Copiar enlace"
                      >
                        {copiedId === geolink.id
                          ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                          : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => window.open(geolink.url, '_blank')}
                        title="Abrir en web"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => shareLink(geolink.url, geolink.description || geolink.trackers?.[0]?.alias || 'Geoenlace')}
                        title="Compartir"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteGeolink(geolink.id)}
                        disabled={deletingId === geolink.id}
                        title="Eliminar geoenlace"
                      >
                        {deletingId === geolink.id
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
