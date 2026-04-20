'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  FileText,
  UserCog,
  Car,
  LayoutDashboard,
  Megaphone,
  Calendar,
  MapPin,
  Zap,
  ChevronDown,
  ChevronRight,
  Truck,
  Layers,
} from 'lucide-react'

export type Section =
  | 'dashboard'
  | 'pagos'
  | 'calendario'
  | 'trailers'
  | 'vehiculos'
  | 'geocercas'
  | 'tutoriales'
  | 'administracion'
  | 'updates'
  | 'automatizacion-trailers'
  | 'automatizacion-conductores'

interface FlatItem {
  type: 'item'
  id: Section
  label: string
  icon: React.FC<{ className?: string }>
  description: string
  adminOnly: boolean
  requiresCreate: boolean
}

interface GroupItem {
  type: 'group'
  id: string
  label: string
  icon: React.FC<{ className?: string }>
  description: string
  adminOnly: boolean
  requiresCreate: boolean
  children: FlatItem[]
}

type MenuItem = FlatItem | GroupItem

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
  collapsed = false,
}: SidebarProps) {
  const isAutoSection = activeSection.startsWith('automatizacion')
  const isServiciosSection = ['trailers', 'vehiculos', 'geocercas'].includes(activeSection)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    ...(isAutoSection ? ['automatizacion'] : []),
    ...(isServiciosSection ? ['servicios'] : []),
  ])

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  const menuItems: MenuItem[] = [
    {
      type: 'item',
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Resumen general',
      adminOnly: false,
      requiresCreate: false,
    },
    {
      type: 'item',
      id: 'pagos',
      label: 'Pagos',
      icon: FileText,
      description: 'Ver y registrar pagos',
      adminOnly: false,
      requiresCreate: false,
    },
    {
      type: 'item',
      id: 'calendario',
      label: 'Calendario',
      icon: Calendar,
      description: 'Pagos recurrentes',
      adminOnly: false,
      requiresCreate: false,
    },
    {
      type: 'group',
      id: 'servicios',
      label: 'Servicios',
      icon: Layers,
      description: 'Trailers, Flota y Zonas',
      adminOnly: false,
      requiresCreate: false,
      children: [
        {
          type: 'item',
          id: 'trailers',
          label: 'Trailers',
          icon: Truck,
          description: 'Gestión de Trailers',
          adminOnly: false,
          requiresCreate: false,
        },
        {
          type: 'item',
          id: 'vehiculos',
          label: 'Vehículos',
          icon: Car,
          description: 'Flota GPS Navitel',
          adminOnly: false,
          requiresCreate: false,
        },
        {
          type: 'item',
          id: 'geocercas',
          label: 'Geocercas',
          icon: MapPin,
          description: 'Zonas GPS Navitel',
          adminOnly: false,
          requiresCreate: false,
        },
      ],
    },
    {
      type: 'item',
      id: 'updates',
      label: 'Actualizaciones',
      icon: Megaphone,
      description: 'Novedades del sistema',
      adminOnly: false,
      requiresCreate: false,
    },
    {
      type: 'group',
      id: 'automatizacion',
      label: 'Automatización',
      icon: Zap,
      description: 'Alertas y vencimientos',
      adminOnly: false,
      requiresCreate: false,
      children: [
        {
          type: 'item',
          id: 'automatizacion-trailers',
          label: 'Trailers',
          icon: Truck,
          description: 'Vencimientos conductores',
          adminOnly: false,
          requiresCreate: false,
        },
        {
          type: 'item',
          id: 'automatizacion-conductores',
          label: 'Conductores',
          icon: UserCog,
          description: 'Vencimientos conductores',
          adminOnly: false,
          requiresCreate: false,
        },
      ],
    },
    {
      type: 'item',
      id: 'administracion',
      label: 'Administración',
      icon: UserCog,
      description: 'Gestionar usuarios',
      adminOnly: true,
      requiresCreate: false,
    },
  ]

  const visibleItems = menuItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.requiresCreate && !canCreate) return false
    return true
  })

  const renderFlatItem = (item: FlatItem, isChild = false) => {
    const Icon = item.icon
    const isActive = activeSection === item.id

    return (
      <button
        key={item.id}
        onClick={() => onSectionChange(item.id)}
        title={collapsed ? item.label : undefined}
        className={cn(
          'w-full flex items-start gap-2.5 p-2.5 rounded-lg transition-all group relative',
          'hover:bg-primary-foreground/10',
          isChild && !collapsed && 'pl-7',
          collapsed && 'justify-center p-2.5',
          isActive &&
            'bg-secondary text-secondary-foreground shadow-lg font-semibold before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-secondary-foreground/30 before:rounded-l-lg'
        )}
      >
        <Icon
          className={cn('h-5 w-5 shrink-0', isActive && 'text-secondary-foreground')}
        />

        {!collapsed && (
          <div className="text-left">
            <div className={cn('font-medium text-sm', isActive && 'text-secondary-foreground')}>
              {item.label}
            </div>
            <div
              className={cn(
                'text-xs',
                isActive ? 'text-secondary-foreground/80' : 'text-primary-foreground/70'
              )}
            >
              {item.description}
            </div>
          </div>
        )}

        {collapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-primary text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-30 shadow-lg">
            <div className="font-medium">{item.label}</div>
            <div className="text-xs text-white/70">{item.description}</div>
          </div>
        )}
      </button>
    )
  }

  const renderGroupItem = (item: GroupItem) => {
    const Icon = item.icon
    const isExpanded = expandedGroups.includes(item.id)
    const isGroupActive = item.children.some((c) => c.id === activeSection)

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (!collapsed) toggleGroup(item.id)
            else {
              // In collapsed mode, click opens first child
              onSectionChange(item.children[0].id)
            }
          }}
          title={collapsed ? item.label : undefined}
          className={cn(
            'w-full flex items-center gap-2.5 p-2.5 rounded-lg transition-all group relative',
            'hover:bg-primary-foreground/10',
            collapsed && 'justify-center p-2.5',
            isGroupActive && !isExpanded && 'bg-primary-foreground/10'
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />

          {!collapsed && (
            <>
              <div className="text-left flex-1">
                <div className="font-medium text-sm">{item.label}</div>
                <div className="text-xs text-primary-foreground/70">{item.description}</div>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-primary-foreground/60" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-primary-foreground/60" />
              )}
            </>
          )}

          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-primary text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-30 shadow-lg">
              <div className="font-medium">{item.label}</div>
              <div className="text-xs text-white/70">{item.description}</div>
            </div>
          )}
        </button>

        {/* Children — shown when expanded or when sidebar is collapsed (tooltip-only) */}
        {isExpanded && !collapsed && (
          <div className="mt-0.5 space-y-0.5 border-l border-primary-foreground/20 ml-4">
            {item.children.map((child) => renderFlatItem(child, true))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      className={cn(
        'bg-primary text-primary-foreground border-r border-primary/20 shadow-2xl transition-all duration-300 overflow-y-auto',
        'fixed left-0 top-16 h-[calc(100vh-4rem)] z-40 w-72',
        'md:static md:h-auto md:min-h-[calc(100vh-73px)] md:z-auto md:overflow-visible',
        collapsed
          ? '-translate-x-full md:translate-x-0 md:w-20'
          : 'translate-x-0 md:w-64'
      )}
    >
      <div className={cn('p-3 space-y-1.5', collapsed && 'px-2.5 py-3')}>
        {visibleItems.map((item) =>
          item.type === 'group' ? renderGroupItem(item) : renderFlatItem(item)
        )}
      </div>

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
