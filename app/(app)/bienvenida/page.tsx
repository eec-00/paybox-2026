'use client'

import { useApp } from '@/lib/context/app-context'
import Link from 'next/link'
import { Wallet, Layers, Zap, Shield, Megaphone, Users, FileText, Scale, FlaskConical, ChevronRight } from 'lucide-react'

interface Modulo {
  id: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  /** Páginas del módulo en el mismo orden que el menú: se entra a la primera permitida */
  paginas: { id: string; href: string }[]
  adminOnly?: boolean
  prueba?: boolean
}

// Mismos módulos e ids que el menú lateral (components/Sidebar.tsx), para que
// la portada muestre exactamente lo que el usuario puede abrir.
const MODULOS: Modulo[] = [
  { id: 'finanzas', label: 'Finanzas', description: 'Resumen, pagos, calendario y gastos de conductores', icon: Wallet,
    paginas: [{ id: 'finanzas-resumen', href: '/finanzas/resumen' }, { id: 'finanzas-pagos', href: '/finanzas/pagos' }, { id: 'finanzas-calendario', href: '/finanzas/calendario' }, { id: 'finanzas-gastos', href: '/finanzas/gastos-conductores' }] },
  { id: 'servicios', label: 'Servicios', description: 'Trailers, geoenlaces y sobrecostos', icon: Layers,
    paginas: [{ id: 'servicios-trailers', href: '/servicios/trailers' }, { id: 'servicios-geoenlaces', href: '/servicios/geoenlaces' }, { id: 'servicios-sobrecostos', href: '/servicios/sobrecostos' }] },
  { id: 'automatizacion', label: 'Automatización', description: 'Alertas de vencimientos de conductores, tractos, carretas y facturas', icon: Zap,
    paginas: [{ id: 'automatizacion', href: '/automatizacion/conductores' }] },
  { id: 'rrhh', label: 'Recursos Humanos', description: 'Vacaciones y asistencia de conductores y oficina', icon: Users,
    paginas: [{ id: 'rrhh-vacaciones', href: '/rrhh/vacaciones' }, { id: 'rrhh-asistencia', href: '/rrhh/asistencia' }, { id: 'rrhh-oficina', href: '/rrhh/oficina' }] },
  { id: 'sunat', label: 'SUNAT', description: 'Consulta de guías de remisión electrónicas', icon: FileText,
    paginas: [{ id: 'sunat-grt', href: '/sunat' }, { id: 'sunat-grebf', href: '/sunat/grebf' }] },
  { id: 'detracciones', label: 'Detracciones', description: 'Conciliación con el Banco de la Nación', icon: Scale,
    paginas: [{ id: 'detracciones', href: '/detracciones' }] },
  { id: 'administracion', label: 'Administración', description: 'Usuarios y conductores con acceso', icon: Shield, adminOnly: true,
    paginas: [{ id: 'admin-usuarios', href: '/administracion/usuarios' }, { id: 'admin-conductores', href: '/administracion/conductores' }] },
  { id: 'pruebas', label: 'Pruebas', description: 'Simulaciones de pagos a conductores y pernoctes', icon: FlaskConical, prueba: true,
    paginas: [{ id: 'pruebas-pagos-conductores', href: '/pruebas/pagos-conductores' }, { id: 'pruebas-pernoctes', href: '/pruebas/pernoctes' }] },
  { id: 'updates', label: 'Actualizaciones', description: 'Novedades y mejoras del sistema', icon: Megaphone,
    paginas: [{ id: 'updates', href: '/updates' }] },
]

export default function BienvenidaPage() {
  const { profileName, isAdminUser, allowedModules } = useApp()

  const puede = (id: string) => !allowedModules || allowedModules.includes(id)
  const visibles = MODULOS.flatMap(m => {
    if (m.adminOnly && !isAdminUser) return []
    if (m.id === 'updates') return [{ ...m, href: '/updates' }]
    const pagina = puede(m.id) ? m.paginas[0] : m.paginas.find(p => puede(p.id))
    return pagina ? [{ ...m, href: pagina.href }] : []
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary text-balance">
          {greeting}{profileName ? `, ${profileName}` : ''}
        </h1>
        <p className="mt-1 text-muted-foreground first-letter:uppercase">
          {new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </header>

      <section aria-labelledby="titulo-modulos" className="space-y-3">
        <h2 id="titulo-modulos" className="text-base font-semibold text-foreground">Tus módulos</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map(mod => {
            const Icon = mod.icon
            return (
              <li key={mod.id}>
                <Link
                  href={mod.href}
                  className="group flex h-full items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      {mod.label}
                      {mod.prueba && <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-ink">Prueba</span>}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{mod.description}</span>
                  </span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
