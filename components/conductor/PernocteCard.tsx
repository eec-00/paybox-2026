'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, CheckCircle2, Loader2, MapPin, Moon, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image/compress'
import { urlArchivo } from '@/lib/archivos'
import {
  ERROR_SIN_UBICACION, ESTADO_PERNOCTE_LABEL, MAX_EVIDENCIAS, MOTIVOS_PERNOCTE, type EstadoPernocte, type MotivoPernocte,
} from '@/lib/pernoctes/reglas'

interface PernocteConductor {
  id: string
  servicio_id: number
  noche: string
  motivo: MotivoPernocte
  motivo_detalle: string | null
  evidencias: string[]
  estado: EstadoPernocte
  observacion: string | null
  created_at: string
}

const ESTADO_ESTILO: Record<EstadoPernocte, string> = {
  pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  escalado: 'bg-amber-50 text-amber-700 border-amber-200',
  aprobado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rechazado: 'bg-red-50 text-red-700 border-red-200',
  anulado: 'bg-gray-50 text-gray-500 border-gray-200',
}

function fechaCorta(noche: string) {
  const [y, m, d] = noche.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

async function subirEvidencia(conductorId: string, original: File): Promise<string> {
  const supabase = createClient()
  const file = await compressImage(original)
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `pernoctes-conductor/${conductorId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('comprobantes').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return supabase.storage.from('comprobantes').getPublicUrl(path).data.publicUrl
}

function ubicacion(): Promise<{ lat: number; lng: number; precision: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      () => resolve(null),
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: true },
    )
  })
}

/**
 * «Voy a pernoctar» (ícono Moon) dentro del servicio activo. Una solicitud por
 * noche. El botón solo aparece con el servicio en curso; ya finalizado, solo
 * se ven los pernoctes registrados.
 */
export function PernocteCard({ servicioId, conductorId, enCurso }: { servicioId: number; conductorId: string | null; enCurso: boolean }) {
  const [pernoctes, setPernoctes] = useState<PernocteConductor[] | null>(null)
  const [nocheActual, setNocheActual] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState<MotivoPernocte | null>(null)
  const [detalle, setDetalle] = useState('')
  const [duerme, setDuerme] = useState(false)
  const [fotos, setFotos] = useState<{ file: File; preview: string }[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/conductor/pernoctes?servicioId=${servicioId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPernoctes(data.pernoctes)
      setNocheActual(data.nocheActual)
    } catch {
      setPernoctes([])
    }
  }, [servicioId])

  useEffect(() => { cargar() }, [cargar])

  const cerrar = () => {
    fotos.forEach(f => URL.revokeObjectURL(f.preview))
    setAbierto(false); setMotivo(null); setDetalle(''); setDuerme(false); setFotos([]); setError(null)
  }

  const elegirFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevos = Array.from(e.target.files ?? []).slice(0, MAX_EVIDENCIAS - fotos.length)
    setFotos(prev => [...prev, ...nuevos.map(file => ({ file, preview: URL.createObjectURL(file) }))])
    e.target.value = ''
  }

  const enviar = async () => {
    if (!motivo || !duerme || enviando) return
    if (motivo === 'otro' && !detalle.trim()) { setError('Cuenta brevemente el motivo'); return }
    setEnviando(true); setError(null)
    try {
      // La ubicación es obligatoria: sin ella no se suben fotos ni se registra
      const geo = await ubicacion()
      if (!geo) throw new Error(ERROR_SIN_UBICACION)
      const evidencias = await Promise.all(fotos.map(f => subirEvidencia(conductorId ?? 'sin-usuario', f.file)))
      const res = await fetch('/api/conductor/pernoctes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servicioId, motivo, motivoDetalle: detalle, duermeEnUnidad: duerme, evidencias,
          lat: geo.lat, lng: geo.lng, precision: geo.precision,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar')
      cerrar()
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  const anular = async (id: string) => {
    if (!confirm('¿Anular este pernocte? Operaciones ya no lo revisará.')) return
    const res = await fetch(`/api/conductor/pernoctes?id=${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) alert(data.error || 'No se pudo anular')
    await cargar()
  }

  if (pernoctes === null) return null
  // Servicio sin iniciar o ya finalizado: nada que pedir ni mostrar
  if (!enCurso && pernoctes.length === 0) return null
  const deEstaNoche = pernoctes.find(p => p.noche === nocheActual)

  return (
    <div className="bg-white rounded-xl border border-indigo-100 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-indigo-50">
        <Moon className="h-3.5 w-3.5 text-indigo-500" />
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Pernocte</span>
      </div>

      <div className="px-3.5 py-3 space-y-2.5">
        {pernoctes.map(p => (
          <div key={p.id} className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${ESTADO_ESTILO[p.estado]}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold capitalize">Noche del {fechaCorta(p.noche)}</span>
              <span className="font-bold whitespace-nowrap">{ESTADO_PERNOCTE_LABEL[p.estado]}</span>
            </div>
            <p className="text-gray-600">{MOTIVOS_PERNOCTE[p.motivo]}{p.motivo_detalle ? ` · ${p.motivo_detalle}` : ''}</p>
            {p.estado === 'rechazado' && p.observacion && <p className="text-red-700">Motivo: {p.observacion}</p>}
            {p.estado === 'pendiente' && (
              <button onClick={() => anular(p.id)} className="text-[11px] font-semibold text-gray-500 underline">
                Me equivoqué, anular
              </button>
            )}
          </div>
        ))}

        {enCurso && !abierto && !deEstaNoche && (
          <>
            <button
              onClick={() => setAbierto(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold active:scale-95 transition-transform"
            >
              <Moon className="h-4 w-4" />
              Voy a pernoctar
            </button>
            <p className="text-[11px] text-gray-400 text-center leading-snug">
              Solo si vas a dormir en la unidad por la operación. Operaciones lo revisa antes de pagarlo.
            </p>
          </>
        )}

        {enCurso && abierto && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-[#1a2332] mb-1.5">¿Por qué vas a pernoctar?</p>
              <div className="space-y-1.5">
                {(Object.entries(MOTIVOS_PERNOCTE) as [MotivoPernocte, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setMotivo(k)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${motivo === k ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-200 text-gray-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {motivo === 'otro' && (
                <textarea
                  value={detalle}
                  onChange={e => setDetalle(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Cuéntalo en pocas palabras"
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-400"
                />
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-[#1a2332] mb-1">Foto del lugar o de la unidad <span className="font-normal text-gray-400">(opcional)</span></p>
              <p className="text-[11px] text-gray-400 mb-1.5">Por ejemplo, la unidad estacionada o la cola. No hace falta que salgas tú.</p>
              <div className="flex gap-2 flex-wrap">
                {fotos.map((f, i) => (
                  <div key={f.preview} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.preview} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { URL.revokeObjectURL(f.preview); setFotos(prev => prev.filter((_, j) => j !== i)) }}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                      aria-label="Quitar foto"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
                {fotos.length < MAX_EVIDENCIAS && (
                  <label className="w-16 h-16 rounded-lg border border-dashed border-gray-300 flex items-center justify-center cursor-pointer">
                    <Camera className="h-5 w-5 text-gray-400" />
                    <input type="file" accept="image/*" capture="environment" multiple onChange={elegirFotos} className="hidden" />
                  </label>
                )}
              </div>
            </div>

            <label className="flex items-start gap-2 text-xs text-[#1a2332] cursor-pointer">
              <input type="checkbox" checked={duerme} onChange={e => setDuerme(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
              <span>Confirmo que voy a <strong>dormir en la unidad</strong> esta noche.</span>
            </label>

            <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <MapPin className="h-3 w-3" /> La hora y tu ubicación se guardan solas al enviar. Necesitas la ubicación activada.
            </p>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={cerrar}
                disabled={enviando}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={enviar}
                disabled={!motivo || !duerme || enviando}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40"
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Enviar
              </button>
            </div>
          </div>
        )}

        {pernoctes.some(p => p.evidencias.length) && !abierto && (
          <div className="flex gap-1.5 flex-wrap">
            {pernoctes.flatMap(p => p.evidencias).map(url => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={urlArchivo(url)} alt="" className="w-10 h-10 rounded-md object-cover border border-gray-100" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
