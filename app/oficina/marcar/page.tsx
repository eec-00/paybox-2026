'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Camera, CheckCircle2, Loader2, Nfc, RotateCcw, ShieldAlert, Smartphone } from 'lucide-react'
import { compressImage } from '@/lib/image/compress'
import { LABEL_MARCA, TIPOS_MARCA, type TipoMarca } from '@/lib/oficina/calculos'
import { cn } from '@/lib/utils'

// Pantalla que abre el sticker NFC de la oficina. El link trae el número de
// serie del sticker y su contador de toques; apenas se abre se "reclama" ese
// toque en el servidor (vale una sola vez) y el trabajador confirma su marca
// con una selfie. Abierta sin link (ej. desde el historial limpio) solo
// muestra cómo va su día.

interface EstadoDia {
  nombre: string
  marcasHoy: { tipo: TipoMarca; hora: string }[]
  siguiente: TipoMarca | null
  selfieTipos: TipoMarca[]
}

type Pantalla =
  | { tipo: 'cargando' }
  | { tipo: 'sin_toque'; estado: EstadoDia | null }
  | { tipo: 'error'; mensaje: string; estado?: EstadoDia | null }
  | { tipo: 'registrar'; uid: string; contador: number }
  | { tipo: 'registrado' }
  | { tipo: 'listo'; ticketId: string; estado: EstadoDia }
  | { tipo: 'hecho'; marca: TipoMarca; hora: string; estado: EstadoDia }

const BOTON: Record<TipoMarca, string> = {
  entrada: 'Marcar entrada',
  salida_almuerzo: 'Salir a almuerzo',
  regreso_almuerzo: 'Regresar de almuerzo',
  salida: 'Marcar salida',
}

function horaDe(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function MarcarOficina() {
  const params = useSearchParams()
  const [pantalla, setPantalla] = useState<Pantalla>({ tipo: 'cargando' })
  const iniciado = useRef(false)

  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true

    const m = params.get('m')
    const uid = params.get('uid')
    const ctr = params.get('ctr')

    if (!m && !uid) {
      fetch('/api/oficina/estado')
        .then((r) => r.json())
        .then((d) => setPantalla({ tipo: 'sin_toque', estado: d.habilitado ? d : null }))
        .catch(() => setPantalla({ tipo: 'error', mensaje: 'Sin conexión. Revisa tu internet e intenta de nuevo.' }))
      return
    }

    fetch('/api/oficina/toque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ m, uid, ctr }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setPantalla({ tipo: 'listo', ticketId: d.ticketId, estado: d })
        } else if (d.codigo === 'sticker_desconocido' && d.puedeRegistrar) {
          setPantalla({ tipo: 'registrar', uid: d.uid, contador: d.contador })
        } else {
          setPantalla({ tipo: 'error', mensaje: d.mensaje || d.error || 'No se pudo leer el sticker.' })
        }
      })
      .catch(() => setPantalla({ tipo: 'error', mensaje: 'Sin conexión. Revisa tu internet y vuelve a acercar el celular al sticker.' }))
  }, [params])

  return (
    <div className="min-h-dvh bg-[#F8F9FA] flex flex-col">
      <header className="bg-[#1a2332] text-white px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-5">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 shrink-0">
            <Image src="/logo.png" alt="Eemerson SAC" fill className="object-contain" />
          </div>
          <div>
            <p className="font-bold text-lg leading-tight font-(family-name:--font-montserrat)">PayBox</p>
            <p className="text-xs text-white/70">Asistencia de oficina</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-5 py-6 flex flex-col gap-5">
        {pantalla.tipo === 'cargando' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Leyendo el sticker…</p>
          </div>
        )}

        {pantalla.tipo === 'sin_toque' && (
          <>
            {pantalla.estado ? (
              <>
                <Saludo nombre={pantalla.estado.nombre} />
                <LineaDelDia estado={pantalla.estado} />
                <Aviso icono={<Nfc className="h-6 w-6" />} titulo="Acerca tu celular al sticker">
                  {pantalla.estado.siguiente
                    ? `Para marcar tu ${LABEL_MARCA[pantalla.estado.siguiente].toLowerCase()}, acerca la parte de atrás del celular al sticker de la oficina.`
                    : 'Ya completaste tus marcas de hoy.'}
                </Aviso>
              </>
            ) : (
              <Aviso icono={<ShieldAlert className="h-6 w-6" />} titulo="No estás habilitado" tono="error">
                Tu usuario no está habilitado para marcar asistencia en oficina. Pídeselo a Recursos Humanos.
              </Aviso>
            )}
          </>
        )}

        {pantalla.tipo === 'error' && (
          <Aviso icono={<ShieldAlert className="h-6 w-6" />} titulo="No se pudo marcar" tono="error">
            {pantalla.mensaje}
          </Aviso>
        )}

        {pantalla.tipo === 'registrar' && (
          <RegistrarSticker uid={pantalla.uid} contador={pantalla.contador} onListo={() => setPantalla({ tipo: 'registrado' })} />
        )}

        {pantalla.tipo === 'registrado' && (
          <Aviso icono={<CheckCircle2 className="h-6 w-6" />} titulo="Sticker registrado" tono="ok">
            Listo. Desde ahora el personal de oficina puede marcar acercando su celular a este sticker.
          </Aviso>
        )}

        {pantalla.tipo === 'listo' && (
          <Marcar
            ticketId={pantalla.ticketId}
            estado={pantalla.estado}
            onHecho={(marca, hora, estado) => {
              // Saca el link del toque de la barra: recargar ya no intenta reusarlo.
              window.history.replaceState(null, '', '/oficina/marcar')
              setPantalla({ tipo: 'hecho', marca, hora, estado })
            }}
            onError={(mensaje) => setPantalla({ tipo: 'error', mensaje, estado: pantalla.estado })}
          />
        )}

        {pantalla.tipo === 'hecho' && (
          <>
            <div className="rounded-2xl bg-emerald-600 text-white p-6 text-center shadow-lg">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2" />
              <p className="text-lg font-semibold">{LABEL_MARCA[pantalla.marca]} registrada</p>
              <p className="text-5xl font-bold tabular-nums mt-1">{pantalla.hora}</p>
            </div>
            <LineaDelDia estado={pantalla.estado} />
          </>
        )}
      </main>
    </div>
  )
}

function Saludo({ nombre }: { nombre: string }) {
  const hoy = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return (
    <div>
      <p className="text-sm text-muted-foreground first-letter:uppercase">{hoy}</p>
      <h1 className="text-2xl font-bold text-[#1a2332]">Hola, {nombre.split(' ')[0]}</h1>
    </div>
  )
}

function LineaDelDia({ estado }: { estado: EstadoDia }) {
  const porTipo = new Map(estado.marcasHoy.map((m) => [m.tipo, m.hora]))
  return (
    <ol className="rounded-2xl bg-white border p-4 space-y-3">
      {TIPOS_MARCA.map((t) => {
        const hora = porTipo.get(t)
        const actual = t === estado.siguiente
        return (
          <li key={t} className="flex items-center gap-3">
            <span className={cn(
              'h-3 w-3 rounded-full shrink-0',
              hora ? 'bg-emerald-500' : actual ? 'bg-[#f5a623] ring-4 ring-[#f5a623]/25' : 'bg-gray-200',
            )} />
            <span className={cn('flex-1 text-sm', hora ? 'text-[#1a2332]' : actual ? 'font-semibold text-[#1a2332]' : 'text-muted-foreground')}>
              {LABEL_MARCA[t]}
            </span>
            <span className="text-sm tabular-nums font-medium text-[#1a2332]">{hora ?? (actual ? 'Te toca' : '—')}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Aviso({ icono, titulo, children, tono = 'info' }: {
  icono: React.ReactNode; titulo: string; children: React.ReactNode; tono?: 'info' | 'error' | 'ok'
}) {
  return (
    <div className={cn(
      'rounded-2xl border p-5 flex gap-4',
      tono === 'error' && 'bg-red-50 border-red-200 text-red-900',
      tono === 'ok' && 'bg-emerald-50 border-emerald-200 text-emerald-900',
      tono === 'info' && 'bg-white text-[#1a2332]',
    )}>
      <div className="shrink-0 mt-0.5">{icono}</div>
      <div>
        <p className="font-semibold">{titulo}</p>
        <p className="text-sm mt-1 opacity-90">{children}</p>
      </div>
    </div>
  )
}

function Marcar({ ticketId, estado, onHecho, onError }: {
  ticketId: string
  estado: EstadoDia
  onHecho: (marca: TipoMarca, hora: string, estado: EstadoDia) => void
  onError: (mensaje: string) => void
}) {
  const [tipo, setTipo] = useState<TipoMarca | null>(estado.siguiente)
  const [foto, setFoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  if (!estado.siguiente || !tipo) {
    return (
      <>
        <Saludo nombre={estado.nombre} />
        <LineaDelDia estado={estado} />
        <Aviso icono={<CheckCircle2 className="h-6 w-6" />} titulo="Día completo" tono="ok">
          Ya registraste tus 4 marcas de hoy.
        </Aviso>
      </>
    )
  }

  const pideSelfie = estado.selfieTipos.includes(tipo)

  const elegirFoto = async (file: File | undefined) => {
    if (!file) return
    // Selfie liviana (~50–80 KB): alcanza para reconocer la cara y el lugar.
    const comprimida = await compressImage(file, { maxSize: 800, quality: 0.6, skipBelowBytes: 0 })
    setFoto(comprimida)
    setPreview(URL.createObjectURL(comprimida))
  }

  const confirmar = async () => {
    if (!foto && pideSelfie) return
    setEnviando(true)
    try {
      const form = new FormData()
      form.append('ticketId', ticketId)
      form.append('tipo', tipo)
      if (foto) form.append('selfie', foto)
      const res = await fetch('/api/oficina/marcar', { method: 'POST', body: form })
      const d = await res.json()
      if (!res.ok) { onError(d.error || 'No se pudo registrar la marca.'); return }
      onHecho(tipo, horaDe(d.marcado_at), d)
    } catch {
      onError('Sin conexión. Vuelve a acercar el celular al sticker e intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Saludo nombre={estado.nombre} />
      <LineaDelDia estado={{ ...estado, siguiente: tipo }} />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => { elegirFoto(e.target.files?.[0]); e.target.value = '' }}
      />

      {!preview ? (
        <>
          {/* Si RRHH no pide selfie en esta marca, el botón marca directo. */}
          <button
            onClick={() => (pideSelfie ? inputRef.current?.click() : confirmar())}
            disabled={enviando}
            className="w-full rounded-2xl bg-[#1a2332] text-white py-6 px-4 shadow-lg active:scale-[0.98] transition-transform flex flex-col items-center gap-2 disabled:opacity-60"
          >
            {enviando
              ? <Loader2 className="h-8 w-8 animate-spin text-[#f5a623]" />
              : pideSelfie
                ? <Camera className="h-8 w-8 text-[#f5a623]" />
                : <CheckCircle2 className="h-8 w-8 text-[#f5a623]" />}
            <span className="text-xl font-semibold">{BOTON[tipo]}</span>
            <span className="text-xs text-white/70">
              {pideSelfie ? 'Se abrirá la cámara para tu selfie' : 'Se registra con la hora del servidor'}
            </span>
          </button>
          {estado.siguiente === 'salida_almuerzo' && (
            <button
              onClick={() => setTipo(tipo === 'salida' ? 'salida_almuerzo' : 'salida')}
              className="text-sm text-muted-foreground underline underline-offset-4 self-center"
            >
              {tipo === 'salida' ? 'Volver: salir a almuerzo' : '¿Te vas sin tomar almuerzo? Marcar salida'}
            </button>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Tu selfie" className="w-full aspect-3/4 object-cover rounded-2xl border" />
          <button
            onClick={confirmar}
            disabled={enviando}
            className="w-full rounded-2xl bg-emerald-600 text-white py-5 text-lg font-semibold shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Confirmar {LABEL_MARCA[tipo].toLowerCase()}
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="w-full rounded-2xl border bg-white py-3 text-sm font-medium flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4" /> Tomar otra foto
          </button>
          <p className="text-xs text-center text-muted-foreground">La hora que queda registrada es la del servidor al confirmar.</p>
        </div>
      )}
    </>
  )
}

function RegistrarSticker({ uid, contador, onListo }: { uid: string; contador: number; onListo: () => void }) {
  const [nombre, setNombre] = useState('Oficina')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const registrar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/oficina/stickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, ctr: contador.toString(16), nombre }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'No se pudo registrar'); return }
      window.history.replaceState(null, '', '/oficina/marcar')
      onListo()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white border p-5 space-y-4">
      <div className="flex gap-3">
        <Smartphone className="h-6 w-6 shrink-0 text-[#1a2332]" />
        <div>
          <p className="font-semibold text-[#1a2332]">Sticker nuevo</p>
          <p className="text-sm text-muted-foreground mt-1">
            Este sticker todavía no está registrado. Como administras Recursos Humanos, puedes registrarlo ahora
            para que el personal de oficina marque con él.
          </p>
        </div>
      </div>
      <div className="text-xs text-muted-foreground font-mono bg-muted rounded-lg px-3 py-2">Serie: {uid}</div>
      <label className="block text-sm">
        <span className="text-[#1a2332] font-medium">Nombre del sticker</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Ej. Oficina principal"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={registrar}
        disabled={guardando}
        className="w-full rounded-xl bg-[#1a2332] text-white py-3 font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Registrar sticker
      </button>
    </div>
  )
}

export default function MarcarOficinaPage() {
  return (
    <Suspense fallback={null}>
      <MarcarOficina />
    </Suspense>
  )
}
