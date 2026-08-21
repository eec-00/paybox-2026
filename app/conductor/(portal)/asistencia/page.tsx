'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MapPin, CheckCircle2, Loader2, RefreshCw, Clock, ExternalLink, LogOut, Info } from 'lucide-react'

type GeoLocation = { lat: number; lng: number; accuracy: number }
type Accion = 'entrada' | 'salida'

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
  salida_at: string | null
  salida_lat: number | null
  salida_lng: number | null
  salida_accuracy: number | null
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
  const [zonasActivas, setZonasActivas] = useState<{ nombre: string; radio_metros: number }[]>([])

  const [locationBlocked, setLocationBlocked] = useState(false)
  const [locationPermState, setLocationPermState] = useState<'prompt' | 'denied' | 'checking' | null>(null)
  const permStatusRef = useRef<PermissionStatus | null>(null)
  // Qué acción disparar una vez que se conceda el permiso de ubicación
  // (el modal es compartido entre "marcar entrada" y "marcar salida").
  const pendingAccionRef = useRef<Accion>('entrada')

  const fetchMarcas = useCallback(async (uid: string) => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('asistencias_conductor')
      .select('id, lat, lng, accuracy, created_at, fecha, salida_at, salida_lat, salida_lng, salida_accuracy')
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

    supabase
      .from('asistencia_ubicaciones')
      .select('nombre, radio_metros')
      .eq('activo', true)
      .then(({ data }) => setZonasActivas(data || []))
  }, [supabase, fetchMarcas])

  useEffect(() => {
    return () => {
      if (permStatusRef.current) permStatusRef.current.onchange = null
    }
  }, [])

  const marcasHoy = marcas.filter((m) => m.fecha === todayLima())
  const ultimaHoy = marcasHoy[0] || null
  const historial = marcas.filter((m) => m.fecha !== todayLima())

  const yaMarcoEntradaHoy = !!ultimaHoy
  const yaMarcoSalidaHoy = !!ultimaHoy?.salida_at

  const doMarcar = useCallback(async (accion: Accion) => {
    if (!conductorId) return
    setSaving(true)
    setError(null)
    try {
      const loc = await getLocation()
      if (!loc) throw new Error('No se pudo obtener tu ubicación. Intenta de nuevo.')

      if (accion === 'entrada') {
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
          if (insertError.code === '23505') throw new Error('Ya marcaste tu entrada hoy.')
          throw insertError
        }
      } else {
        if (!ultimaHoy) throw new Error('Primero debes marcar tu entrada.')
        if (ultimaHoy.salida_at) throw new Error('Ya marcaste tu salida hoy.')
        const { error: updateError } = await supabase
          .from('asistencias_conductor')
          .update({
            salida_at: new Date().toISOString(),
            salida_lat: loc.lat,
            salida_lng: loc.lng,
            salida_accuracy: loc.accuracy,
          })
          .eq('id', ultimaHoy.id)
        if (updateError) throw updateError
      }
      await fetchMarcas(conductorId)
    } catch (e: any) {
      setError(e.message || 'Error al marcar asistencia')
    } finally {
      setSaving(false)
      setLocationBlocked(false)
      setLocationPermState(null)
    }
  }, [conductorId, conductorNombre, conductorDni, supabase, fetchMarcas, ultimaHoy])

  const attachPermissionWatcher = useCallback((status: PermissionStatus) => {
    permStatusRef.current = status
    status.onchange = () => {
      if (status.state === 'granted') {
        permStatusRef.current = null
        doMarcar(pendingAccionRef.current)
      } else {
        setLocationPermState(status.state === 'denied' ? 'denied' : 'prompt')
      }
    }
  }, [doMarcar])

  const handleMarcarClick = useCallback(async (accion: Accion) => {
    if (accion === 'entrada' && yaMarcoEntradaHoy) return
    if (accion === 'salida' && (!yaMarcoEntradaHoy || yaMarcoSalidaHoy)) return
    pendingAccionRef.current = accion
    setError(null)
    if (!navigator.geolocation) {
      setLocationBlocked(true)
      setLocationPermState('denied')
      return
    }
    if ('permissions' in navigator) {
      const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
      if (perm.state === 'granted') {
        doMarcar(accion)
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
  }, [doMarcar, attachPermissionWatcher, yaMarcoEntradaHoy, yaMarcoSalidaHoy])

  const handleRequestLocation = useCallback(async () => {
    setLocationPermState('checking')
    const accion = pendingAccionRef.current
    if ('permissions' in navigator) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
        if (perm.state === 'granted') { doMarcar(accion); return }
        if (perm.state === 'denied') {
          attachPermissionWatcher(perm)
          setLocationPermState('denied')
          return
        }
      } catch {}
    }
    navigator.geolocation.getCurrentPosition(
      () => doMarcar(accion),
      (err) => setLocationPermState(err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt'),
      { timeout: 15000, enableHighAccuracy: true }
    )
  }, [doMarcar, attachPermissionWatcher])

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#1a2332]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Asistencia
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Marca tu entrada y salida con tu ubicación</p>
        </div>
        <button
          onClick={() => conductorId && fetchMarcas(conductorId)}
          className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-gray-200 transition-all duration-200"
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {zonasActivas.length > 0 && (
        <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-100 text-sky-700 px-4 py-3 rounded-2xl text-xs">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Solo puedes marcar dentro de: {zonasActivas.map((z, i) => (
              <span key={z.nombre + i} className="font-semibold">
                {z.nombre} ({z.radio_metros}m){i < zonasActivas.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">
          {error}
        </div>
      )}

      {/* Tarjeta principal: marcar / estado de hoy */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center">
        {yaMarcoSalidaHoy ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-[#1a2332]">Jornada completa</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Entrada {formatHora(ultimaHoy!.created_at)} · Salida {formatHora(ultimaHoy!.salida_at!)}. Ya no puedes volver a marcar hasta mañana.
            </p>
          </>
        ) : yaMarcoEntradaHoy ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-3">
              <LogOut className="h-7 w-7 text-[#f5a623]" />
            </div>
            <p className="text-sm font-semibold text-[#1a2332]">Entrada marcada a las {formatHora(ultimaHoy!.created_at)}</p>
            <p className="text-xs text-gray-400 mt-0.5">Falta marcar tu salida. Necesitarás dar acceso a tu ubicación.</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-3">
              <MapPin className="h-7 w-7 text-[#f5a623]" />
            </div>
            <p className="text-sm font-semibold text-[#1a2332]">Aún no marcas entrada hoy</p>
            <p className="text-xs text-gray-400 mt-0.5">Necesitarás dar acceso a tu ubicación.</p>
          </>
        )}

        {!yaMarcoSalidaHoy && (
          <button
            onClick={() => handleMarcarClick(yaMarcoEntradaHoy ? 'salida' : 'entrada')}
            disabled={saving || !conductorId}
            className="w-full mt-4 py-3.5 rounded-xl bg-[#f5a623] text-white font-bold text-sm disabled:opacity-60 active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" />Marcando...</>
              : yaMarcoEntradaHoy
                ? <><LogOut className="h-4 w-4" />Marcar salida</>
                : <><MapPin className="h-4 w-4" />Marcar entrada</>
            }
          </button>
        )}
      </div>

      {/* Marca de hoy */}
      {ultimaHoy && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">Hoy</p>
          <MarcaRow marca={ultimaHoy} />
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
                  Para marcar tu {pendingAccionRef.current === 'salida' ? 'salida' : 'entrada'} debes permitir el acceso a tu ubicación.
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
  const mapsUrlEntrada = `https://www.google.com/maps?q=${marca.lat},${marca.lng}`
  const mapsUrlSalida = marca.salida_lat != null && marca.salida_lng != null
    ? `https://www.google.com/maps?q=${marca.salida_lat},${marca.salida_lng}`
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5 space-y-2">
      {showFecha && <p className="text-[11px] text-gray-400 capitalize">{formatFecha(marca.created_at)}</p>}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-[11px] text-gray-400">Entrada</p>
            <p className="text-sm font-semibold text-[#1a2332]">{formatHora(marca.created_at)}</p>
          </div>
        </div>
        <a
          href={mapsUrlEntrada}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] font-semibold text-[#f5a623] hover:underline shrink-0"
        >
          Ver mapa <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-50">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${marca.salida_at ? 'bg-sky-50 border border-sky-100' : 'bg-gray-50 border border-gray-100'}`}>
            <LogOut className={`h-4 w-4 ${marca.salida_at ? 'text-sky-500' : 'text-gray-300'}`} />
          </div>
          <div>
            <p className="text-[11px] text-gray-400">Salida</p>
            <p className={`text-sm font-semibold ${marca.salida_at ? 'text-[#1a2332]' : 'text-gray-300'}`}>
              {marca.salida_at ? formatHora(marca.salida_at) : 'Sin marcar'}
            </p>
          </div>
        </div>
        {mapsUrlSalida && (
          <a
            href={mapsUrlSalida}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-semibold text-[#f5a623] hover:underline shrink-0"
          >
            Ver mapa <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  )
}
