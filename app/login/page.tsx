'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      router.push('/dashboard')
      router.refresh()
    } catch (error: any) {
      setError(error.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#f5f5f5]">
      {/* Círculos decorativos de fondo con colores de marca */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#f5a623]/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#f5a623]/15 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
      <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-[#1a2332]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-[#1a2332]/12 rounded-full blur-3xl" />

      {/* Contenedor principal centrado */}
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-4xl flex bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Panel izquierdo con imagen login.png */}
          <div className="hidden md:flex md:w-[45%] relative overflow-hidden">
            <img
              src="/login.png"
              alt="Welcome"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-[#1a2332]/10" />

            {/* Texto sobre la imagen */}
            <div className="absolute inset-0 flex flex-col justify-center px-10 text-white">
              <h1 className="text-4xl font-bold mb-3 drop-shadow-xl">¡Bienvenido de nuevo!</h1>
              <p className="text-base drop-shadow-lg opacity-95 leading-relaxed">
                Inicia sesión para acceder con tu perfil existente
              </p>

              {/* Puntos decorativos */}
              <div className="absolute bottom-8 left-10">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-white/60" />
                  <div className="w-2 h-2 rounded-full bg-white/80" />
                  <div className="w-2 h-2 rounded-full bg-white/60" />
                  <div className="w-2 h-2 rounded-full bg-white/40" />
                  <div className="w-2 h-2 rounded-full bg-white/30" />
                </div>
              </div>
            </div>
          </div>

          {/* Panel derecho - Formulario */}
          <div className="flex-1 p-10 md:p-12 flex items-center bg-white">
            <div className="w-full max-w-sm mx-auto">
              {/* Logo */}
              <div className="mb-8 text-center">
                <div className="flex justify-center mb-4">
                  <img
                    src="/logo.png"
                    alt="Eemerson SAC"
                    className="w-20 h-20 object-contain"
                  />
                </div>
              </div>

              {/* Encabezado */}
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-[#1a2332] mb-2">PayBox 2.0</h2>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Ingresa tus credenciales para acceder
                </p>
              </div>

              {/* Formulario */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-[#1a2332] block">
                    Correo Electrónico
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 bg-white border-gray-200 focus:border-[#f5a623] focus:ring-[#f5a623]/30 transition-colors rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-[#1a2332] block">
                    Contraseña
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 bg-white border-gray-200 focus:border-[#f5a623] focus:ring-[#f5a623]/30 transition-colors rounded-lg"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm animate-fade-in">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-[#f5a623] hover:bg-[#e09615] text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-300 mt-6"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Cargando...
                    </span>
                  ) : (
                    'Iniciar Sesión'
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}