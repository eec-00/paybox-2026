'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MapPin, CheckCircle2, Loader2, RefreshCw, Clock, ExternalLink } from 'lucide-react'

type GeoLocation = { lat: number; lng: number; accuracy: number }

function getLocation(): Promise<GeoLocation | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 0, enableHighAccuracy: true }
    )
  })
}

interface Marca {
  id: string
  lat: number
  lng: number
  accuracy: number | null
  created_at: string
  fecha: string
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}
function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' })
}
// Día calendario de hoy en hora de Perú, formato YYYY-MM-DD (igual al que guarda la DB).
function todayLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}

export default function ConductorAsistenciaPage() {
  const supabase = createClient()
  const [conductorId, setConductorId] = useState<string | null>(null)
  const [conductorNombre, setConductorNombre] = useState<string | null>(null)
  const [conductorDni, setConductorDni] = useState<string | null>(null)
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [locationBlocked, setLocationBlocked] = useState(false)
  const [locationPermState, setLocationPermState] = useState<'prompt' | 'denied' | 'checking' | null>(null)
  const permStatusRef = useRef<PermissionStatus | null>(null)

  const fetchMarcas = useCallback(async (uid: string) => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('asistencias_conductor')
      .select('id, lat, lng, accuracy, created_at, fecha')
      .eq('conductor_id', uid)
      .order('created_at', { ascending: false })
      .limit(30)
    if (!fetchError) setMarcas(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return }
      setConductorId(data.user.id)
      fetchMarcas(data.user.id)

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, dni, odoo_employee_name')
        .eq('id', data.user.id)
        .single()
      setConductorNombre(profile?.full_name || profile?.odoo_employee_name || null)
      setConductorDni(profile?.dni || null)
    })
  }, [supabase, fetchMarcas])

  useEffect(() => {
    return () => {
      if (permStatusRef.current) permStatusRef.current.onchange = null
    }
  }, [])

  const doMarcar = useCallback(async () => {
    if (!conductorId) return
    setSaving(true)
    setError(null)
    try {
      const loc = await getLocation()
      if (!loc) throw new Error('No se pudo obtener tu ubicación. Intenta de nuevo.')
      const { error: insertError } = await supabase
        .from('asistencias_conductor')
        .insert({
          conductor_id: conductorId,
          conductor_nombre: conductorNombre,
          conductor_dni: conductorDni,
          lat: loc.lat,
          lng: loc.lng,
          accuracy: loc.accuracy,
        })
      if (insertError) {
        if (insertError.code === '23505') throw new Error('Ya marcaste tu asistencia hoy.')
        throw insertError
      }
      await fetchMarcas(conductorId)
    } catch (e: any) {
      setError(e.message || 'Error al marcar asistencia')
    } finally {
      setSaving(false)
      setLocationBlocked(false)
      setLocationPermState(null)
    }
  }, [conductorId, conductorNombre, conductorDni, supabase, fetchMarcas])

  const attachPermissionWatcher = useCallback((status: PermissionStatus) => {
    permStatusRef.current = status
    status.onchange = () => {
      if (status.state === 'granted') {
        permStatusRef.current = null
        doMarcar()
      } else {
        setLocationPermState(status.state === 'denied' ? 'denied' : 'prompt')
      }
    }
  }, [doMarcar])

  const yaMarcoHoy = marcas.some((m) => m.fecha === todayLima())

  const handleMarcarClick = useCallback(async () => {
    if (yaMarcoHoy) return
    setError(null)
    if (!navigator.geolocation) {
      setLocationBlocked(true)
      setLocationPermState('denied')
      return
    }
    if ('permissions' in navigator) {
      const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
      if (perm.state === 'granted') {
        doMarcar()
        return
      }
      setLocationBlocked(true)
      setLocationPermState(perm.state === 'denied' ? 'denied' : 'prompt')
      attachPermissionWatcher(perm)
      return
    }
    // Sin Permissions API (Firefox) — mostrar modal e intentar al pulsar
    setLocationBlocked(true)
    setLocationPermState('prompt')
  }, [doMarcar, attachPermissionWatcher, yaMarcoHoy])

  const handleRequestLocation = useCallback(async () => {
    setLocationPermState('checking')
    if ('permissions' in navigator) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
        if (perm.state === 'granted') { doMarcar(); return }
        if (perm.state === 'denied') {
          attachPermissionWatcher(perm)
          setLocationPermState('denied')
          return
        }
      } catch {}
    }
    navigator.geolocation.getCurrentPosition(
      () => doMarcar(),
      (err) => setLocationPermState(err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt'),
      { timeout: 15000, enableHighAccuracy: true }
    )
  }, [doMarcar, attachPermissionWatcher])

  const marcasHoy = marcas.filter((m) => m.fecha === todayLima())
  const ultimaHoy = marcasHoy[0]
  const historial = marcas.filter((m) => m.fecha !== todayLima())

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#1a2332]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Asistencia
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Marca tu ingreso con tu ubicación</p>
        </div>
        <button
          onClick={() => conductorId && fetchMarcas(conductorId)}
          className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-gray-200 transition-all duration-200"
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">
          {error}
        </div>
      )}

      {/* Tarjeta principal: marcar / estado de hoy */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center">
        {ultimaHoy ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-[#1a2332]">Asistencia marcada hoy</p>
            <p className="text-xs text-gray-400 mt-0.5">Marcaste a las {formatHora(ultimaHoy.created_at)}. Ya no puedes volver a marcar hasta mañana.</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-3">
              <MapPin className="h-7 w-7 text-[#f5a623]" />
            </div>
            <p className="text-sm font-semibold text-[#1a2332]">Aún no marcas asistencia hoy</p>
            <p className="text-xs text-gray-400 mt-0.5">Necesitarás dar acceso a tu ubicación.</p>
          </>
        )}

        {!yaMarcoHoy && (
          <button
            onClick={handleMarcarClick}
            disabled={saving || !conductorId}
            className="w-full mt-4 py-3.5 rounded-xl bg-[#f5a623] text-white font-bold text-sm disabled:opacity-60 active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" />Marcando...</>
              : <><MapPin className="h-4 w-4" />Marcar asistencia</>
            }
          </button>
        )}
      </div>

      {/* Marcas de hoy */}
      {marcasHoy.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">Hoy</p>
          <div className="space-y-2">
            {marcasHoy.map((m) => (
              <MarcaRow key={m.id} marca={m} />
            ))}
          </div>
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">Historial reciente</p>
          <div className="space-y-2">
            {historial.map((m) => (
              <MarcaRow key={m.id} marca={m} showFecha />
            ))}
          </div>
        </div>
      )}

      {!loading && marcas.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-10 text-center">
          <Clock className="h-8 w-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">Todavía no tienes marcas registradas.</p>
        </div>
      )}

      {/* Location permission modal — mismo formato obligatorio que Mis Servicios */}
      {locationBlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                <MapPin className="h-8 w-8 text-[#f5a623]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1a2332]">Ubicación requerida</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Para marcar tu asistencia debes permitir el acceso a tu ubicación.
                </p>
              </div>
              {locationPermState === 'denied' ? (
                <>
                  <div className="bg-red-50 rounded-xl px-4 py-3 text-xs text-red-600 text-left w-full space-y-1.5">
                    <p className="font-semibold">Permiso bloqueado</p>
                    <p>Marcaste &quot;Nunca&quot; o &quot;Bloquear&quot;. Para activarlo:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-red-500">
                      <li>Abre la <strong>configuración de tu navegador</strong></li>
                      <li>Busca <strong>Privacidad → Ubicación</strong> (o el ícono 🔒 en la barra de dirección)</li>
                      <li>Permite el acceso a este sitio</li>
                      <li>Vuelve aquí y pulsa <strong>Verificar permiso</strong></li>
                    </ol>
                    <p className="text-red-400 text-[10px]">La página detectará el cambio automáticamente si lo activas sin cerrarla.</p>
                  </div>
                  <button
                    onClick={handleRequestLocation}
                    className="w-full py-3 rounded-xl bg-[#f5a623] text-white font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    <MapPin className="h-4 w-4" />
                    Verificar permiso
                  </button>
                </>
              ) : (
                <button
                  onClick={handleRequestLocation}
                  disabled={locationPermState === 'checking'}
                  className="w-full py-3 rounded-xl bg-[#f5a623] text-white font-bold text-sm disabled:opacity-60 active:scale-95 transition-transform flex items-center justify-center gap-2"
                >
                  {locationPermState === 'checking'
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Verificando...</>
                    : <><MapPin className="h-4 w-4" />Dar acceso a ubicación</>
                  }
                </button>
              )}
              <button
                onClick={() => { setLocationBlocked(false); setLocationPermState(null) }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}

function MarcaRow({ marca, showFecha }: { marca: Marca; showFecha?: boolean }) {
  const mapsUrl = `https://www.google.com/maps?q=${marca.lat},${marca.lng}`
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1a2332]">{formatHora(marca.created_at)}</p>
          {showFecha && <p className="text-[11px] text-gray-400 capitalize">{formatFecha(marca.created_at)}</p>}
        </div>
      </div>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[11px] font-semibold text-[#f5a623] hover:underline shrink-0"
      >
        Ver mapa <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
