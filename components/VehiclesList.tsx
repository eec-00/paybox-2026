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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Car, RefreshCw, Search, AlertCircle, Link2, ExternalLink, Clock, Copy, CheckCircle, Share2 } from 'lucide-react'

interface Vehicle {
  id: number
  label: string
}

interface GeoLinkData {
  id: number
  hash: string
  description: string
  url: string
  create_date: string
  lifetime?: {
    from: string
    to: string
  } | null
  trackers: Array<{
    alias: string
    tracker_id: number
  }>
  enabled: boolean
}

export function VehiclesList() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Estados para geoenlace
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<string>('')
  const [creatingLink, setCreatingLink] = useState(false)
  const [geoLinkResult, setGeoLinkResult] = useState<GeoLinkData | null>(null)
  const [geoLinkError, setGeoLinkError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // Estados para lista de geoenlaces
  const [geolinks, setGeolinks] = useState<GeoLinkData[]>([])
  const [loadingGeolinks, setLoadingGeolinks] = useState(true)
  const [geolinksError, setGeolinksError] = useState<string | null>(null)

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

  useEffect(() => {
    fetchVehicles()
    fetchGeolinks()
  }, [])

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredVehicles(vehicles)
    } else {
      const filtered = vehicles.filter((vehicle) =>
        vehicle.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredVehicles(filtered)
    }
  }, [searchTerm, vehicles])

  const handleCreateGeoLink = async () => {
    if (!selectedVehicle) return

    const vehicle = vehicles.find(v => v.id.toString() === selectedVehicle)
    if (!vehicle) return

    setCreatingLink(true)
    setGeoLinkError(null)
    setGeoLinkResult(null)

    try {
      // Crear geoenlace
      const createResponse = await fetch('/api/navitel/geolink', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tracker_id: vehicle.id,
          label: vehicle.label
        }),
      })

      const createData = await createResponse.json()

      if (!createData.success) {
        throw new Error(createData.error || 'Error al crear geoenlace')
      }

      // Construir resultado con URL
      const linkHash = createData.data?.hash
      const result: GeoLinkData = {
        id: createData.data?.id || createData.linkId,
        hash: linkHash,
        description: `Geoenlace de ${vehicle.label}`,
        url: linkHash ? `https://control.navitelgps.com/ls/${linkHash}` : '',
        create_date: new Date().toISOString(),
        lifetime: createData.data?.lifetime,
        trackers: [{ alias: vehicle.label, tracker_id: vehicle.id }],
        enabled: true
      }
      
      setGeoLinkResult(result)
      // Actualizar lista de geoenlaces
      fetchGeolinks()
    } catch (err) {
      setGeoLinkError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setCreatingLink(false)
    }
  }

  const copyToClipboard = async (text: string, id?: number) => {
    try {
      await navigator.clipboard.writeText(text)
      if (id) {
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
      }
    } catch (err) {
      console.error('Error al copiar:', err)
    }
  }

  const shareLink = async (url: string, description: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: description,
          text: `Seguimiento GPS: ${description}`,
          url: url,
        })
      } catch (err) {
        // Si el usuario cancela el share, no mostrar error
        if ((err as Error).name !== 'AbortError') {
          console.error('Error al compartir:', err)
        }
      }
    } else {
      // Fallback: copiar al portapapeles
      copyToClipboard(url)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  }

  const resetDialog = () => {
    setSelectedVehicle('')
    setGeoLinkResult(null)
    setGeoLinkError(null)
  }

  return (
    <>
      {/* Card de Vehículos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Vehículos registrados en Navitel GPS ({filteredVehicles.length} de {vehicles.length})
            </p>
            <div className="flex items-center gap-2">
              {/* Buscador */}
              <div className="relative w-48">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar placa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              
              {/* Botón Crear Geoenlace */}
              <Dialog open={dialogOpen} onOpenChange={(open) => {
                setDialogOpen(open)
                if (!open) resetDialog()
              }}>
                <DialogTrigger asChild>
                  <Button variant="default" size="sm">
                    <Link2 className="h-4 w-4 mr-2" />
                    Crear Geoenlace
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    Crear Geoenlace
                  </DialogTitle>
                  <DialogDescription>
                    Selecciona un vehículo para generar un enlace de seguimiento GPS válido por 6 horas.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Selector de vehículo */}
                  {!geoLinkResult && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Vehículo</label>
                        <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un vehículo" />
                          </SelectTrigger>
                          <SelectContent>
                            {vehicles.map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                                <div className="flex items-center gap-2">
                                  <Car className="h-4 w-4" />
                                  {vehicle.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {geoLinkError && (
                        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{geoLinkError}</span>
                        </div>
                      )}

                      <Button
                        onClick={handleCreateGeoLink}
                        disabled={!selectedVehicle || creatingLink}
                        className="w-full"
                      >
                        {creatingLink ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Creando...
                          </>
                        ) : (
                          <>
                            <Link2 className="h-4 w-4 mr-2" />
                            Generar Geoenlace
                          </>
                        )}
                      </Button>
                    </>
                  )}

                  {/* Resultado del geoenlace */}
                  {geoLinkResult && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 p-3 bg-green-100 text-green-800 rounded-lg">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">¡Geoenlace creado exitosamente!</span>
                      </div>

                      <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                        {/* Descripción */}
                        <div className="flex items-start gap-2">
                          <Link2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Descripción</p>
                            <p className="text-sm font-medium">{geoLinkResult.description}</p>
                          </div>
                        </div>

                        {/* Vigencia */}
                        {geoLinkResult.lifetime && (
                          <div className="flex items-start gap-2">
                            <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">Vigencia</p>
                              <p className="text-sm">
                                {formatDate(geoLinkResult.lifetime.from)} - {formatDate(geoLinkResult.lifetime.to)}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* URL del geoenlace */}
                        {geoLinkResult.url && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Enlace de seguimiento</p>
                            <div className="flex items-center gap-2">
                              <Input
                                value={geoLinkResult.url}
                                readOnly
                                className="text-xs"
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => copyToClipboard(geoLinkResult.url!, geoLinkResult.id)}
                                title="Copiar enlace"
                              >
                                {copiedId === geoLinkResult.id ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => window.open(geoLinkResult.url, '_blank')}
                                title="Abrir enlace"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => shareLink(geoLinkResult.url!, geoLinkResult.description)}
                                title="Compartir"
                              >
                                <Share2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* ID del geoenlace */}
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          ID: {geoLinkResult.id}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        onClick={resetDialog}
                        className="w-full"
                      >
                        Crear otro geoenlace
                      </Button>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Botón Actualizar */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchVehicles(); fetchGeolinks(); }}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Estados */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Cargando vehículos...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && filteredVehicles.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? 'No se encontraron vehículos con ese criterio' : 'No hay vehículos registrados'}
          </div>
        )}

        {/* Grid de vehículos */}
        {!loading && !error && filteredVehicles.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredVehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="flex items-center gap-2 p-3 bg-primary/5 hover:bg-primary/10 rounded-lg border border-primary/20 transition-colors cursor-pointer"
                title={`Clic para crear geoenlace - ID: ${vehicle.id}`}
                onClick={() => {
                  setSelectedVehicle(vehicle.id.toString())
                  setDialogOpen(true)
                }}
              >
                <Car className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium text-sm truncate">{vehicle.label}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Card de Geoenlaces */}
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <CardTitle>Geoenlaces Activos</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchGeolinks}
            disabled={loadingGeolinks}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingGeolinks ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Enlaces de seguimiento GPS ({geolinks.length})
        </p>
      </CardHeader>
      <CardContent>
        {/* Estados */}
        {loadingGeolinks && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Cargando geoenlaces...</span>
          </div>
        )}

        {geolinksError && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-5 w-5" />
            <span>{geolinksError}</span>
          </div>
        )}

        {!loadingGeolinks && !geolinksError && geolinks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No hay geoenlaces creados
          </div>
        )}

        {/* Lista de geoenlaces */}
        {!loadingGeolinks && !geolinksError && geolinks.length > 0 && (
          <div className="space-y-3">
            {geolinks.map((geolink) => (
              <div
                key={geolink.id}
                className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium">
                      {geolink.trackers?.[0]?.alias || geolink.description || 'Sin nombre'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span>Creado: {formatDate(geolink.create_date)}</span>
                    {geolink.lifetime && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Hasta: {formatDate(geolink.lifetime.to)}
                      </span>
                    )}
                    {!geolink.lifetime && (
                      <span className="text-green-600">Sin expiración</span>
                    )}
                  </div>
                  {geolink.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {geolink.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(geolink.url, geolink.id)}
                    title="Copiar enlace"
                    className="h-8 w-8"
                  >
                    {copiedId === geolink.id ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(geolink.url, '_blank')}
                    title="Abrir en web"
                    className="h-8 w-8"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => shareLink(geolink.url, geolink.description || geolink.trackers?.[0]?.alias || 'Geoenlace')}
                    title="Compartir"
                    className="h-8 w-8"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </>
  )
}
