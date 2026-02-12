'use client'

import { cn } from '@/lib/utils'
import { FileText, PlusCircle, LayoutDashboard, UserCog, Car, PlayCircle } from 'lucide-react'
import Image from 'next/image'

export type Section = 'registros' | 'nuevo-pago' | 'vehiculos' | 'tutoriales' | 'administracion'

interface SidebarProps {
  activeSection: Section
  onSectionChange: (section: Section) => void
  isAdmin?: boolean
  canCreate?: boolean
}

export function Sidebar({ activeSection, onSectionChange, isAdmin = false, canCreate = true }: SidebarProps) {
  const menuItems = [
    {
      id: 'registros' as Section,
      label: 'Registros',
      icon: FileText,
      description: 'Ver todos los pagos',
      adminOnly: false,
      requiresCreate: false
    },
    {
      id: 'nuevo-pago' as Section,
      label: 'Nuevo Pago',
      icon: PlusCircle,
      description: 'Registrar un pago',
      adminOnly: false,
      requiresCreate: true
    },
    {
      id: 'vehiculos' as Section,
      label: 'Vehículos',
      icon: Car,
      description: 'Flota GPS Navitel',
      adminOnly: false,
      requiresCreate: false
    },
    {
      id: 'tutoriales' as Section,
      label: 'Tutoriales',
      icon: PlayCircle,
      description: 'Aprende a usar PayBox',
      adminOnly: false,
      requiresCreate: false
    },
    {
      id: 'administracion' as Section,
      label: 'Administración',
      icon: UserCog,
      description: 'Gestionar usuarios',
      adminOnly: true,
      requiresCreate: false
    }
  ]

  // Filtrar items según permisos
  const visibleItems = menuItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false
    if (item.requiresCreate && !canCreate) return false
    return true
  })

  return (
    <aside className="w-64 bg-primary text-primary-foreground min-h-[calc(100vh-73px)] p-4 border-r border-primary/20 shadow-xl">
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-primary-foreground/20">
          <div className="relative w-8 h-8">
            <Image
              src="/logo.png"
              alt="Logo"
              fill
              className="object-contain"
            />
          </div>
          <div>
            <h2 className="font-bold text-lg">PayBox</h2>
            <p className="text-xs text-primary-foreground/70">Eemerson SAC</p>
          </div>
        </div>

        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id

          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "w-full flex items-start gap-3 p-3 rounded-lg transition-all hover:translate-x-1 relative group",
                "hover:bg-primary-foreground/10",
                isActive && "bg-secondary text-secondary-foreground shadow-lg font-semibold before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-secondary-foreground/30 before:rounded-l-lg"
              )}
            >
              <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", isActive && "text-secondary-foreground")} />
              <div className="text-left">
                <div className={cn("font-medium", isActive && "text-secondary-foreground")}>
                  {item.label}
                </div>
                <div className={cn(
                  "text-xs mt-0.5",
                  isActive ? "text-secondary-foreground/80" : "text-primary-foreground/70"
                )}>
                  {item.description}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Decoración inferior */}
      <div className="mt-8 pt-8 border-t border-primary-foreground/20">
        <div className="text-xs text-primary-foreground/60 space-y-1">
          <p>💡 Tip: Usa el OCR para</p>
          <p>extraer datos automáticamente</p>
        </div>
      </div>
    </aside>
  )
}
