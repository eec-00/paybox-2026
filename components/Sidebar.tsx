'use client'

import { cn } from '@/lib/utils'
import { FileText, UserCog, Car, LayoutDashboard, Megaphone } from 'lucide-react'

export type Section = 'dashboard' | 'pagos' | 'vehiculos' | 'tutoriales' | 'administracion' | 'updates'

interface SidebarProps {
  activeSection: Section
  onSectionChange: (section: Section) => void
  isAdmin?: boolean
  canCreate?: boolean
  collapsed?: boolean
}

export function Sidebar({ 
  activeSection, 
  onSectionChange, 
  isAdmin = false, 
  canCreate = true,
  collapsed = false
}: SidebarProps) {
  const menuItems = [
    {
      id: 'dashboard' as Section,
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Resumen general',
      adminOnly: false,
      requiresCreate: false
    },
    {
      id: 'pagos' as Section,
      label: 'Pagos',
      icon: FileText,
      description: 'Ver y registrar pagos',
      adminOnly: false,
      requiresCreate: false
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
      id: 'updates' as Section,
      label: 'Actualizaciones',
      icon: Megaphone,
      description: 'Novedades del sistema',
      adminOnly: false,
      requiresCreate: false
    },
    // Tutoriales temporalmente oculto
    // {
    //   id: 'tutoriales' as Section,
    //   label: 'Tutoriales',
    //   icon: PlayCircle,
    //   description: 'Aprende a usar PayBox',
    //   adminOnly: false,
    //   requiresCreate: false
    // },
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
    <aside className={cn(
      "bg-primary text-primary-foreground min-h-[calc(100vh-73px)] border-r border-primary/20 shadow-xl transition-all duration-300",
      collapsed ? "w-20" : "w-56"
    )}>
      <div className={cn("p-3 space-y-1.5", collapsed && "px-2.5 py-3")}>
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id

          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "w-full flex items-start gap-2.5 p-2.5 rounded-lg transition-all group relative",
                "hover:bg-primary-foreground/10",
                collapsed && "justify-center p-2.5",
                isActive && "bg-secondary text-secondary-foreground shadow-lg font-semibold before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-secondary-foreground/30 before:rounded-l-lg"
              )}
            >
              <Icon className={cn(
                "h-5 w-5 shrink-0", 
                !collapsed && "mt-0",
                isActive && "text-secondary-foreground"
              )} />
              
              {!collapsed && (
                <div className="text-left">
                  <div className={cn("font-medium text-sm", isActive && "text-secondary-foreground")}>
                    {item.label}
                  </div>
                  <div className={cn(
                    "text-xs mt-0",
                    isActive ? "text-secondary-foreground/80" : "text-primary-foreground/70"
                  )}>
                    {item.description}
                  </div>
                </div>
              )}

              {/* Tooltip al hover cuando está colapsado */}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-primary text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-30 shadow-lg">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-white/70">{item.description}</div>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Decoración inferior - solo visible cuando no está colapsado */}
      {!collapsed && (
        <div className="px-3 mt-6 pt-6 border-t border-primary-foreground/20">
          <div className="text-xs text-primary-foreground/60 space-y-0.5">
            <p>💡 Tip: Usa el OCR para</p>
            <p className="pl-4">extraer datos</p>
            <p className="pl-4">automáticamente</p>
          </div>
        </div>
      )}
    </aside>
  )
}
