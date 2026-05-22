'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

export default function ConductorLoginPage() {
  const [dni, setDni] = useState('')
  const [password, setPassword] = useState('')
  const [dniError, setDniError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    setDniError('')
    setPasswordError('')

    let valid = true
    if (!/^\d{8}$/.test(dni.trim())) {
      setDniError('DNI debe tener 8 dígitos.')
      valid = false
    }
    if (password.length < 6) {
      setPasswordError('Contraseña debe tener al menos 6 caracteres.')
      valid = false
    }
    if (!valid) return

    setLoading(true)
    try {
      const email = `${dni.trim()}@conductor.local`
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/conductor/servicios')
      router.refresh()
    } catch {
      setServerError('DNI o contraseña incorrectos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center overflow-hidden p-4">
      <div className="w-full relative max-w-5xl overflow-hidden flex flex-col md:flex-row shadow-xl rounded-2xl">

        {/* Degradado superior */}
        <div className="w-full h-full z-2 absolute bg-linear-to-t from-transparent to-black pointer-events-none" />

        {/* Franjas blur decorativas */}
        <div className="flex absolute z-2 overflow-hidden backdrop-blur-2xl pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-160 z-2 w-16 opacity-30 overflow-hidden"
              style={{
                background:
                  'linear-gradient(90deg, #ffffff00 0%, #000000 69%, #ffffff30 100%)',
              }}
            />
          ))}
        </div>

        {/* Círculo azul decorativo */}
        <div className="w-60 h-60 bg-[#2563eb] absolute z-1 rounded-full bottom-0 left-0 pointer-events-none" />
        <div className="w-32 h-20 bg-white absolute z-1 rounded-full bottom-0 left-0 pointer-events-none" />
        <div className="w-32 h-20 bg-white absolute z-1 rounded-full bottom-0 left-0 pointer-events-none" />

        {/* ── Panel izquierdo ── */}
        <div className="bg-[#1a2332] text-white p-8 md:p-12 md:w-1/2 relative rounded-bl-3xl overflow-hidden">
          <h1 className="text-2xl md:text-3xl font-medium leading-tight z-10 tracking-tight relative">
            Portal del Conductor — Eemerson SAC
          </h1>
        </div>

        {/* ── Panel derecho – Formulario ── */}
        <div className="p-8 md:p-12 md:w-1/2 flex flex-col bg-white z-99 text-[#1a2332]">

          {/* Logo */}
          <div className="flex flex-col items-start mb-8">
            <div className="mb-4">
              <Image
                src="/logo.png"
                alt="Eemerson SAC"
                width={48}
                height={48}
                className="object-contain"
              />
            </div>
            <h2 className="text-3xl font-medium mb-2 tracking-tight">
              Iniciar Sesión
            </h2>
            <p className="text-left opacity-80 text-sm">
              Ingresa tu DNI y contraseña para continuar
            </p>
          </div>

          {/* Formulario */}
          <form className="flex flex-col gap-4" onSubmit={handleLogin} noValidate>

            {/* DNI */}
            <div>
              <label htmlFor="dni" className="block text-sm mb-2">
                Número de DNI
              </label>
              <input
                type="text"
                id="dni"
                inputMode="numeric"
                maxLength={8}
                placeholder="12345678"
                className={`text-sm w-full py-2 px-3 border rounded-lg focus:outline-none focus:ring-1 bg-white text-black focus:ring-[#2563eb] transition-colors ${
                  dniError ? 'border-red-500' : 'border-gray-300'
                }`}
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                disabled={loading}
              />
              {dniError && (
                <p className="text-red-500 text-xs mt-1">{dniError}</p>
              )}
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="password" className="block text-sm mb-2">
                Contraseña
              </label>
              <input
                type="password"
                id="password"
                placeholder="••••••••"
                className={`text-sm w-full py-2 px-3 border rounded-lg focus:outline-none focus:ring-1 bg-white text-black focus:ring-[#2563eb] transition-colors ${
                  passwordError ? 'border-red-500' : 'border-gray-300'
                }`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              {passwordError && (
                <p className="text-red-500 text-xs mt-1">{passwordError}</p>
              )}
            </div>

            {/* Error servidor */}
            {serverError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {serverError}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Cargando...
                </span>
              ) : (
                'Iniciar Sesión'
              )}
            </button>

            <div className="text-center text-gray-600 text-sm">
              ¿Sin acceso?{' '}
              <span className="text-[#1a2332] font-medium underline cursor-default">
                Contacta al administrador
              </span>
            </div>

            <div className="relative flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 shrink-0">o</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <a
              href="/login"
              className="w-full flex items-center justify-center gap-2 border border-[#1a2332]/20 hover:border-[#1a2332]/50 hover:bg-[#1a2332]/5 text-[#1a2332] font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              Ir al sistema principal
            </a>
          </form>
        </div>
      </div>
    </div>
  )
}
