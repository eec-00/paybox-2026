'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, RefreshCw, AlertTriangle, Clock, CheckCircle2, ShieldAlert } from 'lucide-react'

interface Documento {
  key: string
  label: string
  fecha: string | null
  dias: number | null
}

interface Stats {
  vencidos: number
  proximos: number
  vigentes: number
}

interface StatusConfig {
  color: string
  bar: string
  barBg: string
  text: string
  textColor: string
  icon: string | null
}

function getStatusConfig(dias: number | null): StatusConfig {
  if (dias === null)
    return { color: 'text-gray-400', bar: 'bg-gray-200', barBg: 'bg-gray-50', text: 'Sin fecha', textColor: 'text-gray-400', icon: null }
  if (dias < 0)
    return { color: 'text-red-600', bar: 'bg-red-500', barBg: 'bg-red-50', text: `Venc. hace ${Math.abs(dias)}d`, textColor: 'text-red-600', icon: 'danger' }
  if (dias === 0)
    return { color: 'text-red-600', bar: 'bg-red-500', barBg: 'bg-red-50', text: 'Vence HOY', textColor: 'text-red-600', icon: 'danger' }
  if (dias <= 7)
    return { color: 'text-red-500', bar: 'bg-red-400', barBg: 'bg-red-50', text: `${dias}d`, textColor: 'text-red-500', icon: 'danger' }
  if (dias <= 30)
    return { color: 'text-orange-600', bar: 'bg-orange-400', barBg: 'bg-orange-50', text: `${dias}d`, textColor: 'text-orange-600', icon: 'warning' }
  if (dias <= 90)
    return { color: 'text-amber-600', bar: 'bg-amber-400', barBg: 'bg-amber-50', text: `${dias}d`, textColor: 'text-amber-600', icon: 'warning' }
  return { color: 'text-emerald-600', bar: 'bg-emerald-500', barBg: 'bg-emerald-50', text: `${dias}d`, textColor: 'text-emerald-600', icon: 'ok' }
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return ''
  const d = new Date(fecha)
  if (isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ConductorDocumentosPage() {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDocumentos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/conductor/documentos')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar documentos')
      setDocumentos(data.documentos || [])
      setStats(data.stats || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDocumentos() }, [fetchDocumentos])

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#1a2332]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Mis Documentos
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Fechas de vencimiento</p>
        </div>
        <button
          onClick={fetchDocumentos}
          className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-gray-200 transition-all duration-200"
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            value={stats.vencidos}
            label="Vencidos"
            valueColor="text-red-600"
            bg="bg-red-50"
            border="border-red-100"
          />
          <StatCard
            value={stats.proximos}
            label="Próx. 30d"
            valueColor="text-orange-600"
            bg="bg-orange-50"
            border="border-orange-100"
          />
          <StatCard
            value={stats.vigentes}
            label="Vigentes"
            valueColor="text-emerald-600"
            bg="bg-emerald-50"
            border="border-emerald-100"
          />
        </div>
      )}

      {/* Alert banner */}
      {stats && stats.vencidos > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-4 w-4 text-red-600" />
          </div>
          <p className="text-sm text-red-700 font-medium">
            {stats.vencidos} documento{stats.vencidos > 1 ? 's' : ''} vencido{stats.vencidos > 1 ? 's' : ''}.
            <span className="font-normal text-red-500 ml-1">Contacta al administrador.</span>
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && !error && (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-24 animate-pulse border border-gray-100 shadow-sm" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && documentos.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-7 w-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">No hay documentos registrados</p>
        </div>
      )}

      {/* Document cards */}
      {!loading && documentos.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {documentos.map(doc => {
            const status = getStatusConfig(doc.dias)
            return (
              <div key={doc.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Top color bar */}
                <div className={`h-1 w-full ${status.bar}`} />
                <div className="p-3.5">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-1.5 mb-3">
                    <p className="text-xs font-semibold text-[#1a2332] leading-tight">{doc.label}</p>
                    {status.icon === 'danger' && (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    {status.icon === 'warning' && (
                      <Clock className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                    )}
                    {status.icon === 'ok' && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    )}
                  </div>

                  {/* Days badge */}
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${status.barBg} ${status.textColor}`}>
                    {status.text}
                  </div>

                  {/* Date */}
                  {doc.fecha && (
                    <p className="text-[11px] text-gray-400 mt-2 leading-tight">{formatFecha(doc.fecha)}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}

function StatCard({
  value, label, valueColor, bg, border,
}: {
  value: number
  label: string
  valueColor: string
  bg: string
  border: string
}) {
  return (
    <div className={`${bg} border ${border} rounded-2xl p-4 text-center`}>
      <p className={`text-3xl font-extrabold ${valueColor}`} style={{ fontFamily: 'Montserrat, sans-serif' }}>
        {value}
      </p>
      <p className={`text-xs mt-1 font-medium ${valueColor} opacity-80`}>{label}</p>
    </div>
  )
}
