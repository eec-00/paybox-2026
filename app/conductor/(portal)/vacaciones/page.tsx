'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CalendarClock, RefreshCw, Plane, CheckCircle2, Clock, AlertTriangle, UserX } from 'lucide-react'
import {
  getSaldo, getEstado, getProximoAviso, getRegistroVigente,
} from '@/lib/vacaciones/calculos'
import type { VacacionEmpleadoConDetalle, VacacionEstado } from '@/lib/types/vacaciones.types'

function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return ''
  const d = new Date(fecha + 'T00:00:00')
  if (isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADO_VISUAL: Record<VacacionEstado, { bar: string; bg: string; text: string; label: string; icon: React.ReactNode }> = {
  completo: { bar: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Completo', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  programado: { bar: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-600', label: 'Programado', icon: <Plane className="h-3.5 w-3.5" /> },
  pendiente: { bar: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-600', label: 'Pendiente de programar', icon: <Clock className="h-3.5 w-3.5" /> },
  vencido: { bar: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-600', label: 'Aviso vencido', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
}

export default function ConductorVacacionesPage() {
  const [empleado, setEmpleado] = useState<VacacionEmpleadoConDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchVacaciones = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const { data, error: fetchError } = await supabase
        .from('vacaciones_empleados')
        .select('*, registros:vacaciones_registros(*), solicitudes:vacaciones_solicitudes(*)')
        .eq('user_id', user.id)
        .maybeSingle()

      if (fetchError) throw fetchError
      setEmpleado(data as any)
    } catch (e: any) {
      setError(e.message || 'Error al cargar tus vacaciones')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { fetchVacaciones() }, [fetchVacaciones])

  const registro = empleado ? getRegistroVigente(empleado.registros) : null
  const estado = registro && empleado ? getEstado(registro, empleado.solicitudes) : null
  const proximoAviso = registro ? getProximoAviso(registro) : null
  const visual = estado ? ESTADO_VISUAL[estado] : null

  const solicitudes = empleado
    ? [...empleado.solicitudes].sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : -1))
    : []

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#1a2332]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Vacaciones
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Días disponibles</p>
        </div>
        <button
          onClick={fetchVacaciones}
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

      {loading && !error && (
        <div className="grid grid-cols-1 gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-28 animate-pulse border border-gray-100 shadow-sm" />
          ))}
        </div>
      )}

      {!loading && !error && !empleado && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-4">
            <UserX className="h-7 w-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">Aún no tienes registro de vacaciones</p>
          <p className="text-xs text-gray-400 mt-1">Contacta a Recursos Humanos para que lo habiliten.</p>
        </div>
      )}

      {!loading && !error && empleado && !registro && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-4">
            <CalendarClock className="h-7 w-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">Aún no tienes un récord vacacional registrado</p>
        </div>
      )}

      {!loading && !error && empleado && registro && visual && (
        <>
          {/* Récord vigente */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className={`h-1 w-full ${visual.bar}`} />
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Récord vigente</p>
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${visual.bg} ${visual.text}`}>
                  {visual.icon} {visual.label}
                </div>
              </div>
              <p className="text-sm font-semibold text-[#1a2332]">{formatFecha(registro.fecha_record)}</p>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-[#1a2332]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                    {getSaldo(registro)}
                  </p>
                  <p className="text-[11px] text-gray-400 font-medium">Días disponibles</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-gray-500" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                    {registro.dias_gozados_1 + registro.dias_gozados_2}
                  </p>
                  <p className="text-[11px] text-gray-400 font-medium">Días gozados</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-gray-500" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                    {registro.dias_correspondientes}
                  </p>
                  <p className="text-[11px] text-gray-400 font-medium">Días del año</p>
                </div>
              </div>

              {proximoAviso && (estado === 'pendiente' || estado === 'vencido') && (
                <p className="text-[11px] text-gray-400 pt-1 border-t border-gray-50">
                  {estado === 'vencido' ? 'Debiste programar tus vacaciones antes del' : 'Programa tus vacaciones antes del'} {formatFecha(proximoAviso.toISOString().slice(0, 10))}.
                </p>
              )}
            </div>
          </div>

          {/* Historial de salidas */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">Historial de salidas</p>
            {solicitudes.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-8 text-center">
                <p className="text-sm text-gray-400">Sin salidas registradas todavía.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {solicitudes.map((s) => (
                  <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#1a2332]">
                        {formatFecha(s.fecha_inicio)} — {formatFecha(s.fecha_fin)}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{s.dias} día(s) · {s.tipo} · {s.modalidad}</p>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-gray-50 text-gray-500">{s.estado}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-4" />
    </div>
  )
}
