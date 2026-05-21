'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Truck,
  FileText,
  Calendar,
  LogOut,
  Menu,
  X,
  Clock,
  ChevronRight,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  description: string
  icon: React.FC<{ className?: string }>
  soon?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/conductor/servicios',
    label: 'Mis Servicios',
    description: 'Servicios asignados por mes',
    icon: Truck,
  },
  {
    href: '/conductor/documentos',
    label: 'Mis Documentos',
    description: 'Fechas de vencimiento',
    icon: FileText,
  },
  {
    href: '/conductor/vacaciones',
    label: 'Vacaciones',
    description: 'Días disponibles',
    icon: Calendar,
    soon: true,
  },
]

interface Props {
  conductorName: string
  children: React.ReactNode
}

export function ConductorShell({ conductorName, children }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/conductor/login')
  }

  const initials = conductorName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  const sidebarContent = (
    <>
      {/* Nav items */}
      <div className={cn('flex-1 overflow-y-auto p-3 space-y-1', collapsed && 'px-2 py-3')}>
        {NAV_ITEMS.map(({ href, label, description, icon: Icon, soon }) => {
          const isActive = pathname.startsWith(href) && !soon
          return (
            <button
              key={href}
              disabled={soon}
              onClick={() => {
                if (soon) return
                router.push(href)
                setMobileOpen(false)
              }}
              title={collapsed ? label : undefined}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl transition-all duration-200 group relative',
                collapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                !soon && !isActive && 'hover:bg-white/8 hover:text-white',
                soon && 'opacity-50 cursor-default',
                isActive
                  ? 'bg-[#f5a623] text-[#1a2332] shadow-lg shadow-[#f5a623]/20 font-semibold'
                  : 'text-white/65'
              )}
            >
              {/* Active left accent */}
              {isActive && !collapsed && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-[#1a2332]/30" />
              )}

              <Icon className={cn('shrink-0 w-[18px] h-[18px]', isActive ? 'text-[#1a2332]' : '')} />

              {!collapsed && (
                <div className="text-left flex-1 min-w-0">
                  <div className={cn('text-sm font-medium flex items-center gap-2 leading-tight')}>
                    {label}
                    {soon && (
                      <span className="flex items-center gap-1 text-[10px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full font-normal">
                        <Clock className="h-2.5 w-2.5" />
                        Próximamente
                      </span>
                    )}
                  </div>
                  {!isActive && (
                    <div className="text-[11px] mt-0.5 text-white/35 leading-tight">{description}</div>
                  )}
                </div>
              )}

              {!collapsed && isActive && (
                <ChevronRight className="h-3.5 w-3.5 text-[#1a2332]/40 shrink-0" />
              )}

              {/* Collapsed tooltip */}
              {collapsed && (
                <div className="absolute left-full ml-3 px-3 py-2 bg-[#0f1825] border border-white/10 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap pointer-events-none z-30 shadow-xl">
                  <div className="font-semibold">{label}</div>
                  {soon && <div className="text-white/40 text-[10px]">Próximamente</div>}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-white/8 shrink-0" />

      {/* Profile / logout */}
      <div className="p-3 shrink-0">
        <button
          onClick={handleLogout}
          title={collapsed ? `${conductorName} · Cerrar sesión` : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative',
            'hover:bg-red-500/10 hover:text-red-400 text-white/60',
            collapsed && 'justify-center'
          )}
        >
          <div className={cn(
            'rounded-xl bg-[#f5a623]/15 border border-[#f5a623]/20 flex items-center justify-center font-bold text-[#f5a623] text-xs shrink-0',
            collapsed ? 'w-9 h-9' : 'w-8 h-8'
          )}>
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="text-left flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/80 truncate leading-tight">{conductorName}</p>
                <p className="text-[11px] text-white/35 mt-0.5 group-hover:text-red-400/70 transition-colors">Cerrar sesión</p>
              </div>
              <LogOut className="h-3.5 w-3.5 shrink-0 text-white/25 group-hover:text-red-400 transition-colors" />
            </>
          )}
          {collapsed && (
            <div className="absolute left-full ml-3 px-3 py-2 bg-[#0f1825] border border-white/10 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap pointer-events-none z-30 shadow-xl">
              <div className="font-semibold">{conductorName}</div>
              <div className="text-red-400/80 text-[10px]">Cerrar sesión</div>
            </div>
          )}
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-[#f4f5f7] flex flex-col">
      {/* ── Header ── */}
      <header className="h-14 bg-[#1a2332] text-white flex items-center justify-between px-4 sticky top-0 z-50 border-b border-white/5">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="md:hidden p-1.5 rounded-lg hover:bg-white/8 transition-colors"
            aria-label="Abrir menú"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Desktop collapse */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex p-1.5 rounded-lg hover:bg-white/8 transition-colors"
            aria-label="Colapsar sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Eemerson SAC" width={28} height={28} className="object-contain" />
            <div className="leading-none">
              <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest">Portal del Conductor</p>
              <p className="text-sm font-bold text-white leading-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                Eemerson SAC
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2.5 bg-white/5 border border-white/8 rounded-xl px-3 py-1.5">
            <div className="w-6 h-6 rounded-lg bg-[#f5a623]/15 border border-[#f5a623]/20 flex items-center justify-center text-[#f5a623] text-[10px] font-bold">
              {initials}
            </div>
            <span className="text-sm text-white/70 truncate max-w-[140px] font-medium">{conductorName}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Mobile overlay ── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={cn(
            'bg-[#1a2332] border-r border-white/5 flex flex-col transition-all duration-300',
            'fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-40',
            'md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:z-auto',
            collapsed ? 'md:w-[68px]' : 'md:w-60',
            mobileOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'
          )}
        >
          {/* Sidebar top padding */}
          <div className="pt-3" />
          {sidebarContent}
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto bg-[#f4f5f7]">
          {children}
        </main>
      </div>
    </div>
  )
}
