import * as React from 'react'
import { cn } from '@/lib/utils'

// Encabezado de página único para toda la app: ícono, título (el h1 de la
// página), descripción opcional, etiqueta junto al título y acciones a la derecha.
export function PageHeader({ icon: Icon, title, description, badge, actions, className }: {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  /** Etiqueta junto al título (ej. «Prueba», «Beta») */
  badge?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="shrink-0 rounded-lg bg-primary/10 p-2" aria-hidden>
            <Icon className="h-6 w-6 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-primary sm:text-2xl text-balance">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
