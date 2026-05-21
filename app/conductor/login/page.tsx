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
  const [showPass, setShowPass] = useState(false)
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
    <div className="min-h-screen flex bg-[#0f1825]">
      {/* ── Left panel (desktop only) ── */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] relative overflow-hidden bg-[#1a2332] p-12">
        {/* Road grid pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#f5a623" strokeWidth="0.8"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Diagonal accent strip */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, transparent 60%, rgba(245,166,35,0.07) 100%)',
          }}
        />

        {/* Decorative circle */}
        <div
          className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(245,166,35,0.12) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -top-20 -left-20 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(245,166,35,0.06) 0%, transparent 70%)' }}
        />

        {/* Logo top */}
        <div className="relative flex items-center gap-3">
          <Image src="/logo.png" alt="Eemerson SAC" width={40} height={40} className="object-contain" />
          <span className="text-white/80 text-sm font-medium tracking-wide">Eemerson SAC</span>
        </div>

        {/* Center content */}
        <div className="relative space-y-6">
          {/* Route dots decoration */}
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#f5a623]" />
            <span className="flex-1 h-px border-t border-dashed border-[#f5a623]/30" />
            <span className="w-2 h-2 rounded-full bg-[#f5a623]/40" />
            <span className="flex-1 h-px border-t border-dashed border-[#f5a623]/20" />
            <span className="w-2 h-2 rounded-full bg-[#f5a623]/20" />
          </div>

          <h1
            className="text-4xl xl:text-5xl font-extrabold text-white leading-tight"
            style={{ fontFamily: 'Montserrat, sans-serif', letterSpacing: '-0.02em' }}
          >
            Portal del<br />
            <span style={{ color: '#f5a623' }}>Conductor</span>
          </h1>
          <p className="text-white/50 text-base leading-relaxed max-w-xs">
            Consulta tus servicios asignados, documentos vigentes y más desde un solo lugar.
          </p>

          {/* Stats chips */}
          <div className="flex gap-3 flex-wrap pt-2">
            {[
              { label: 'Servicios', icon: '🚛' },
              { label: 'Documentos', icon: '📋' },
              { label: 'Historial', icon: '📅' },
            ].map(({ label, icon }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/60 text-xs"
              >
                <span>{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <p className="relative text-white/25 text-xs">
          © {new Date().getFullYear()} Eemerson SAC · Todos los derechos reservados
        </p>
      </div>

      {/* ── Right panel / form ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative">
        {/* Mobile background pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] lg:hidden" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid2" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#f5a623" strokeWidth="0.8"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid2)" />
        </svg>

        <div className="w-full max-w-sm relative">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 shadow-xl">
              <Image src="/logo.png" alt="Eemerson SAC" width={36} height={36} className="object-contain" />
            </div>
            <h1
              className="text-2xl font-extrabold text-white"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
            >
              Portal del <span style={{ color: '#f5a623' }}>Conductor</span>
            </h1>
            <p className="text-white/40 text-sm mt-1">Eemerson SAC</p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Gold top bar */}
            <div className="h-1 bg-gradient-to-r from-[#f5a623] via-[#fdb44b] to-[#f5a623]" />

            <div className="p-8">
              {/* Desktop heading inside card */}
              <div className="hidden lg:block mb-7">
                <h2
                  className="text-xl font-bold text-[#1a2332]"
                  style={{ fontFamily: 'Montserrat, sans-serif' }}
                >
                  Iniciar sesión
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">Ingresa tu DNI y contraseña</p>
              </div>

              <div className="lg:hidden mb-6">
                <h2
                  className="text-xl font-bold text-[#1a2332]"
                  style={{ fontFamily: 'Montserrat, sans-serif' }}
                >
                  Iniciar sesión
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">Ingresa tu DNI y contraseña</p>
              </div>

              <form className="flex flex-col gap-5" onSubmit={handleLogin} noValidate>
                {/* DNI field */}
                <div>
                  <label htmlFor="dni" className="block text-xs font-semibold text-[#1a2332]/70 uppercase tracking-wider mb-2">
                    Número de DNI
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2"/>
                        <line x1="16" y1="2" x2="16" y2="8"/>
                        <line x1="8" y1="2" x2="8" y2="8"/>
                        <circle cx="12" cy="13" r="2"/>
                      </svg>
                    </span>
                    <input
                      type="text"
                      id="dni"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="12345678"
                      className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl text-sm bg-gray-50 text-[#1a2332] placeholder:text-gray-300 focus:outline-none focus:bg-white transition-all duration-200 ${
                        dniError
                          ? 'border-red-400 focus:border-red-500'
                          : 'border-gray-100 focus:border-[#f5a623]'
                      }`}
                      value={dni}
                      onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                      disabled={loading}
                    />
                  </div>
                  {dniError && (
                    <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                      {dniError}
                    </p>
                  )}
                </div>

                {/* Password field */}
                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-[#1a2332]/70 uppercase tracking-wider mb-2">
                    Contraseña
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </span>
                    <input
                      type={showPass ? 'text' : 'password'}
                      id="password"
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-12 py-3 border-2 rounded-xl text-sm bg-gray-50 text-[#1a2332] placeholder:text-gray-300 focus:outline-none focus:bg-white transition-all duration-200 ${
                        passwordError
                          ? 'border-red-400 focus:border-red-500'
                          : 'border-gray-100 focus:border-[#f5a623]'
                      }`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                      tabIndex={-1}
                    >
                      {showPass ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                      {passwordError}
                    </p>
                  )}
                </div>

                {serverError && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm">
                    <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {serverError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed mt-1 relative overflow-hidden group"
                  style={{ background: loading ? '#e09615' : '#f5a623' }}
                >
                  <span
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ background: 'linear-gradient(135deg, #f5a623, #e09615)' }}
                  />
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Ingresando...
                      </>
                    ) : 'Ingresar'}
                  </span>
                </button>
              </form>
            </div>

            {/* Footer strip */}
            <div className="bg-gray-50 border-t border-gray-100 px-8 py-4">
              <p className="text-center text-xs text-gray-400">
                ¿Sin acceso? Contacta al administrador.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
