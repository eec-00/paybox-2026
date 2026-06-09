'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  FileText,
  UserCog,
  Link2,
  Home,
  Megaphone,
  Calendar,
  MapPin,
  Zap,
  ChevronDown,
  ChevronRight,
  Truck,
  Layers,
  Wallet,
  Settings,
  Users,
  Receipt,
  PlayCircle,
  BarChart2,
  ShieldCheck,
} from 'lucide-react'

interface FlatItem {
  type: 'item'
  id: string
  href: string
  label: string
  icon: React.FC<{ className?: string }>
  description: string
  adminOnly: boolean
}

interface GroupItem {
  type: 'group'
  id: string
  label: string
  icon: React.FC<{ className?: string }>
  description: string
  adminOnly: boolean
  children: FlatItem[]
}

type MenuItem = FlatItem | GroupItem

interface SidebarProps {
  isAdmin?: boolean
  canCreate?: boolean
  collapsed?: boolean
  allowedModules?: string[] | null
  userName?: string | null
  userEmail?: string | null
  onProfileClick?: () => void
}

export function Sidebar({
  isAdmin = false,
  collapsed = false,
  allowedModules = null,
  userName = null,
  userEmail = null,
  onProfileClick,
}: SidebarProps) {
  const pathname = usePathname()

  const isFinanzas = pathname.startsWith('/finanzas')
  const isServicios = pathname.startsWith('/servicios')
  const isAuto = pathname.startsWith('/automatizacion')
  const isAdmin_ = pathname.startsWith('/administracion')
  const isSunat = pathname.startsWith('/sunat')

  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    ...(isFinanzas ? ['finanzas'] : []),
    ...(isServicios ? ['servicios'] : []),
    ...(isAuto ? ['automatizacion'] : []),
    ...(isAdmin_ ? ['administracion'] : []),
    ...(isSunat ? ['sunat'] : []),
  ])

  useEffect(() => {
    const toExpand: string[] = []
    if (isFinanzas) toExpand.push('finanzas')
    if (isServicios) toExpand.push('servicios')
    if (isAuto) toExpand.push('automatizacion')
    if (isAdmin_) toExpand.push('administracion')
    if (isSunat) toExpand.push('sunat')
    setExpandedGroups((prev) => Array.from(new Set([...prev, ...toExpand])))
  }, [pathname, isFinanzas, isServicios, isAuto, isAdmin_, isSunat])

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  const menuItems: MenuItem[] = [
    {
      type: 'item',
      id: 'bienvenida',
      href: '/bienvenida',
      label: 'Inicio',
      icon: Home,
      description: 'Página principal',
      adminOnly: false,
    },
    {
      type: 'group',
      id: 'finanzas',
      label: 'Finanzas',
      icon: Wallet,
      description: 'Pagos y calendario',
      adminOnly: false,
      children: [
        {
          type: 'item',
          id: 'finanzas-resumen',
          href: '/finanzas/resumen',
          label: 'Resumen',
          icon: BarChart2,
          description: 'Estadísticas generales',
          adminOnly: false,
        },
        {
          type: 'item',
          id: 'finanzas-pagos',
          href: '/finanzas/pagos',
          label: 'Pagos',
          icon: FileText,
          description: 'Ver y registrar pagos',
          adminOnly: false,
        },
        {
          type: 'item',
          id: 'finanzas-calendario',
          href: '/finanzas/calendario',
          label: 'Calendario',
          icon: Calendar,
          description: 'Pagos recurrentes',
          adminOnly: false,
        },
        {
          type: 'item',
          id: 'finanzas-gastos',
          href: '/finanzas/gastos-conductores',
          label: 'Gastos Conductores',
          icon: Receipt,
          description: 'Gastos registrados',
          adminOnly: false,
        },
      ],
    },
    {
      type: 'group',
      id: 'servicios',
      label: 'Servicios',
      icon: Layers,
      description: 'Trailers, flota y zonas',
      adminOnly: false,
      children: [
        {
          type: 'item',
          id: 'servicios-trailers',
          href: '/servicios/trailers',
          label: 'Trailers',
          icon: Truck,
          description: 'Gestión de trailers',
          adminOnly: false,
        },
        {
          type: 'item',
          id: 'servicios-geoenlaces',
          href: '/servicios/geoenlaces',
          label: 'Geoenlaces',
          icon: Link2,
          description: 'Flota y geoenlaces GPS',
          adminOnly: false,
        },
        {
          type: 'item',
          id: 'servicios-geocercas',
          href: '/servicios/geocercas',
          label: 'Geocercas',
          icon: MapPin,
          description: 'Zonas GPS Navitel',
          adminOnly: false,
        },
      ],
    },
    {
      type: 'group',
      id: 'automatizacion',
      label: 'Automatización',
      icon: Zap,
      description: 'Alertas y vencimientos',
      adminOnly: false,
      children: [
        {
          type: 'item',
          id: 'auto-conductores',
          href: '/automatizacion/conductores',
          label: 'Conductores',
          icon: UserCog,
          description: 'Documentos conductores',
          adminOnly: false,
        },
        {
          type: 'item',
          id: 'auto-tractos',
          href: '/automatizacion/tractos',
          label: 'Tractos',
          icon: Truck,
          description: 'Documentos tractos',
          adminOnly: false,
        },
        {
          type: 'item',
          id: 'auto-carretas',
          href: '/automatizacion/carretas',
          label: 'Carretas',
          icon: Truck,
          description: 'Documentos carretas',
          adminOnly: false,
        },
        {
          type: 'item',
          id: 'auto-facturas',
          href: '/automatizacion/facturas',
          label: 'Facturas',
          icon: FileText,
          description: 'Facturas de clientes',
          adminOnly: false,
        },
      ],
    },
    {
      type: 'group',
      id: 'administracion',
      label: 'Administración',
      icon: UserCog,
      description: 'Usuarios y conductores',
      adminOnly: true,
      children: [
        {
          type: 'item',
          id: 'admin-usuarios',
          href: '/administracion/usuarios',
          label: 'Usuarios Core',
          icon: Users,
          description: 'Equipo de la empresa',
          adminOnly: true,
        },
        {
          type: 'item',
          id: 'admin-conductores',
          href: '/administracion/conductores',
          label: 'Conductores',
          icon: Truck,
          description: 'Choferes del portal',
          adminOnly: true,
        },
      ],
    },
    {
      type: 'group',
      id: 'sunat',
      label: 'SUNAT',
      icon: ShieldCheck,
      description: 'GRE · Comprobantes electrónicos',
      adminOnly: false,
      children: [
        {
          type: 'item',
          id: 'sunat-grt',
          href: '/sunat',
          label: 'GRE Transportistas',
          icon: ShieldCheck,
          description: 'Guías de remisión transportistas',
          adminOnly: false,
        },
        {
          type: 'item',
          id: 'sunat-grebf',
          href: '/sunat/grebf',
          label: 'GRE Bienes Fiscalizables',
          icon: ShieldCheck,
          description: 'Guías de remisión BF',
          adminOnly: false,
        },
      ],
    },
    {
      type: 'item',
      id: 'updates',
      href: '/updates',
      label: 'Actualizaciones',
      icon: Megaphone,
      description: 'Novedades del sistema',
      adminOnly: false,
    },
    {
      type: 'item',
      id: 'tutoriales',
      href: '/tutoriales',
      label: 'Tutoriales',
      icon: PlayCircle,
      description: 'Videos guía de uso',
      adminOnly: false,
    },
  ]

  const canSeeModule = (id: string): boolean => {
    if (allowedModules === null) return true
    return allowedModules.includes(id)
  }

  const visibleItems = menuItems
    .filter((item) => {
      if (item.adminOnly && !isAdmin) return false
      if (item.id === 'bienvenida' || item.id === 'updates' || item.id === 'tutoriales' || item.id === 'sunat') return true
      if (item.type === 'group') {
        return canSeeModule(item.id) || item.children.some((c) => canSeeModule(c.id))
      }
      return canSeeModule(item.id)
    })
    .map((item) => {
      if (
        item.type === 'group' &&
        allowedModules !== null &&
        !allowedModules.includes(item.id) &&
        item.id !== 'sunat'
      ) {
        return { ...item, children: item.children.filter((c) => canSeeModule(c.id)) }
      }
      return item
    })

  const renderFlatItem = (item: FlatItem, isChild = false) => {
    const Icon = item.icon
    const isActive = pathname === item.href

    return (
      <Link
        key={item.id}
        href={item.href}
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
      </Link>
    )
  }

  const renderGroupItem = (item: GroupItem) => {
    const Icon = item.icon
    const isExpanded = expandedGroups.includes(item.id)
    const isGroupActive = item.children.some((c) => pathname === c.href)

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (!collapsed) toggleGroup(item.id)
            else {
              // In collapsed mode click goes to first child
              window.location.href = item.children[0].href
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

        {isExpanded && !collapsed && (
          <div className="mt-0.5 space-y-0.5 border-l border-primary-foreground/20 ml-4">
            {item.children.map((child) => renderFlatItem(child, true))}
          </div>
        )}
      </div>
    )
  }

  const initials = (userName ?? userEmail ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <aside
      className={cn(
        'bg-primary text-primary-foreground border-r border-primary/20 shadow-2xl transition-all duration-300',
        'fixed left-0 top-16 h-[calc(100vh-4rem)] z-40 w-72 flex flex-col',
        'md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:z-auto',
        collapsed
          ? '-translate-x-full md:translate-x-0 md:w-20'
          : 'translate-x-0 md:w-64'
      )}
    >
      <div className={cn('flex-1 overflow-y-auto p-3 space-y-1.5 sidebar-scrollbar', collapsed && 'px-2.5 py-3')}>
        {visibleItems.map((item) =>
          item.type === 'group' ? renderGroupItem(item) : renderFlatItem(item)
        )}
      </div>

      <div className="border-t border-primary-foreground/20 p-2 shrink-0">
        <button
          onClick={onProfileClick}
          title={collapsed ? (userName ?? userEmail ?? 'Perfil') : undefined}
          className={cn(
            'w-full flex items-center gap-2.5 p-2 rounded-lg transition-all group relative',
            'hover:bg-primary-foreground/10',
            collapsed && 'justify-center'
          )}
        >
          <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-xs shrink-0">
            {initials}
          </div>

          {!collapsed && (
            <>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-tight">
                  {userName ?? userEmail ?? 'Usuario'}
                </p>
                {userName && (
                  <p className="text-xs text-primary-foreground/60 truncate">{userEmail}</p>
                )}
              </div>
              <Settings className="h-4 w-4 shrink-0 text-primary-foreground/50 group-hover:text-primary-foreground/80 transition-colors" />
            </>
          )}

          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-primary text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-30 shadow-lg">
              <div className="font-medium">{userName ?? userEmail ?? 'Perfil'}</div>
              <div className="text-xs text-white/70">Configuración y perfil</div>
            </div>
          )}
        </button>
      </div>
    </aside>
  )
}
