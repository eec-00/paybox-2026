'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/login')
    }, 5000)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src="/logo.png"
              alt="PayBox Logo"
              className="w-16 h-16 object-contain"
            />
          </div>
          <div>
            <CardTitle className="text-2xl">PayBox</CardTitle>
            <CardDescription>Sistema de Gestión de Pagos</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
              <Shield className="h-8 w-8 text-orange-600" />
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Registro Deshabilitado</h3>
            <p className="text-sm text-gray-600">
              El registro público está desactivado por seguridad
            </p>
          </div>

          <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-700">
            <p className="mb-2">Para obtener acceso al sistema:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Contacta con un administrador</li>
              <li>Solicita tus credenciales</li>
              <li>Inicia sesión con tu usuario</li>
            </ul>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Redirigiendo al login en 5 segundos...
          </p>
        </CardContent>

        <CardFooter>
          <Button asChild className="w-full" variant="outline">
            <Link href="/login">
              Ir a Iniciar Sesión
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
