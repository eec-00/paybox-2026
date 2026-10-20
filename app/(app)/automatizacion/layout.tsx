'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/automatizacion/conductores', label: 'Conductores' },
  { href: '/automatizacion/tractos', label: 'Tractos' },
  { href: '/automatizacion/carretas', label: 'Carretas' },
  { href: '/automatizacion/facturas', label: 'Facturas' },
]

export default function AutomatizacionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      <nav className="flex gap-1 overflow-x-auto border-b border-border px-4 pt-3 md:px-6">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
