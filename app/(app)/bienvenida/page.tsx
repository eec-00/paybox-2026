'use client'

import { useApp } from '@/lib/context/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Wallet, Layers, Zap, Shield, Megaphone, PlayCircle, BarChart2 } from 'lucide-react'

export default function BienvenidaPage() {
  const { profileName, isAdminUser, allowedModules } = useApp()

  const canSee = (module: string) => !allowedModules || allowedModules.includes(module)

  const modules = [
    ...(canSee('finanzas') ? [{
      label: 'Finanzas',
      description: 'Resumen, pagos, calendario y gastos de conductores',
      href: '/finanzas/resumen',
      icon: Wallet,
      color: 'text-green-600',
      bg: 'bg-green-50 group-hover:bg-green-100',
    }] : []),
    ...(canSee('servicios') ? [{
      label: 'Servicios',
      description: 'Gestión de trailers, geoenlaces y geocercas GPS',
      href: '/servicios/trailers',
      icon: Layers,
      color: 'text-blue-600',
      bg: 'bg-blue-50 group-hover:bg-blue-100',
    }] : []),
    ...(canSee('automatizacion') ? [{
      label: 'Automatización',
      description: 'Alertas de vencimientos para conductores, tractos y facturas',
      href: '/automatizacion/conductores',
      icon: Zap,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50 group-hover:bg-yellow-100',
    }] : []),
    ...(isAdminUser ? [{
      label: 'Administración',
      description: 'Gestión de usuarios core y conductores del portal',
      href: '/administracion/usuarios',
      icon: Shield,
      color: 'text-purple-600',
      bg: 'bg-purple-50 group-hover:bg-purple-100',
    }] : []),
    {
      label: 'Actualizaciones',
      description: 'Novedades y mejoras del sistema',
      href: '/updates',
      icon: Megaphone,
      color: 'text-orange-600',
      bg: 'bg-orange-50 group-hover:bg-orange-100',
    },
    {
      label: 'Tutoriales',
      description: 'Videos guía para aprender a usar PayBox',
      href: '/tutoriales',
      icon: PlayCircle,
      color: 'text-pink-600',
      bg: 'bg-pink-50 group-hover:bg-pink-100',
    },
  ]

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-primary">
          {greeting}{profileName ? `, ${profileName}` : ''}
        </h2>
        <p className="text-muted-foreground mt-1">
          {new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Módulos disponibles</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((mod) => {
            const Icon = mod.icon
            return (
              <Link key={mod.href} href={mod.href}>
                <Card className="hover:shadow-lg transition-all hover:border-primary/30 cursor-pointer group h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-3 text-base">
                      <div className={`p-2.5 rounded-xl ${mod.bg} transition-colors`}>
                        <Icon className={`h-5 w-5 ${mod.color}`} />
                      </div>
                      {mod.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">{mod.description}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
