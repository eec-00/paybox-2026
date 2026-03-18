'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  const validatePassword = (value: string) => value.length >= 6

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)

    let valid = true
    if (!validateEmail(email)) {
      setEmailError('Ingresa un correo electrónico válido.')
      valid = false
    } else {
      setEmailError('')
    }
    if (!validatePassword(password)) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.')
      valid = false
    } else {
      setPasswordError('')
    }
    if (!valid) return

    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/dashboard')
      router.refresh()
    } catch (error: any) {
      setServerError(error.message || 'Error al iniciar sesión')
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

        {/* Círculo dorado decorativo */}
        <div className="w-60 h-60 bg-[#f5a623] absolute z-1 rounded-full bottom-0 left-0 pointer-events-none" />
        <div className="w-32 h-20 bg-white absolute z-1 rounded-full bottom-0 left-0 pointer-events-none" />
        <div className="w-32 h-20 bg-white absolute z-1 rounded-full bottom-0 left-0 pointer-events-none" />

        {/* ── Panel izquierdo ── */}
        <div className="bg-[#1a2332] text-white p-8 md:p-12 md:w-1/2 relative rounded-bl-3xl overflow-hidden">
          <h1 className="text-2xl md:text-3xl font-medium leading-tight z-10 tracking-tight relative">
            Sistema de gestión de gastos para empresas.
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
              Bienvenido a PayBox 2.0 — Eemerson SAC
            </p>
          </div>

          {/* Formulario */}
          <form className="flex flex-col gap-4" onSubmit={handleLogin} noValidate>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm mb-2">
                Correo electrónico
              </label>
              <input
                type="email"
                id="email"
                placeholder="tu@email.com"
                className={`text-sm w-full py-2 px-3 border rounded-lg focus:outline-none focus:ring-1 bg-white text-black focus:ring-[#f5a623] transition-colors ${
                  emailError ? 'border-red-500' : 'border-gray-300'
                }`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                aria-invalid={!!emailError}
                aria-describedby="email-error"
              />
              {emailError && (
                <p id="email-error" className="text-red-500 text-xs mt-1 animate-fade-in">
                  {emailError}
                </p>
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
                className={`text-sm w-full py-2 px-3 border rounded-lg focus:outline-none focus:ring-1 bg-white text-black focus:ring-[#f5a623] transition-colors ${
                  passwordError ? 'border-red-500' : 'border-gray-300'
                }`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                aria-invalid={!!passwordError}
                aria-describedby="password-error"
              />
              {passwordError && (
                <p id="password-error" className="text-red-500 text-xs mt-1 animate-fade-in">
                  {passwordError}
                </p>
              )}
            </div>

            {/* Error del servidor */}
            {serverError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm animate-fade-in">
                {serverError}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#f5a623] hover:bg-[#e09615] text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
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
          </form>
        </div>
      </div>
    </div>
  )
}
