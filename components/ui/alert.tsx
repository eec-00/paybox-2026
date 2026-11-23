import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// Aviso dentro de la página (no flotante). Para resultados pasajeros
// («Guardado», «Enviado») usar toast; esto es para lo que tiene que quedar a la vista.
const alertVariants = cva(
  'relative flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm',
  {
    variants: {
      variant: {
        info: 'border-info/30 bg-info-soft text-info-ink',
        success: 'border-success/30 bg-success-soft text-success-ink',
        warning: 'border-warning/40 bg-warning-soft text-warning-ink',
        destructive: 'border-destructive/30 bg-destructive-soft text-destructive-ink',
      },
    },
    defaultVariants: { variant: 'info' },
  }
)

const ICONOS = { info: Info, success: CheckCircle2, warning: AlertTriangle, destructive: AlertCircle } as const

interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: React.ReactNode
  /** Acción a la derecha (ej. botón «Reintentar») */
  action?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }> | null
}

function Alert({ className, variant = 'info', title, action, icon, children, ...props }: AlertProps) {
  const Icono = icon === null ? null : icon ?? ICONOS[variant ?? 'info']
  return (
    <div
      role={variant === 'destructive' || variant === 'warning' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {Icono && <Icono className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-semibold leading-snug">{title}</p>}
        {children && <div className="leading-relaxed [&_p]:leading-relaxed">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}

/** Error de carga con botón para reintentar */
function ErrorCarga({ mensaje, onRetry, className, titulo = 'No se pudo cargar la información' }: {
  mensaje?: string | null
  onRetry?: () => void
  className?: string
  titulo?: string
}) {
  return (
    <Alert
      variant="destructive"
      title={titulo}
      className={className}
      action={onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 bg-background">
          <RefreshCw className="h-3.5 w-3.5" /> Reintentar
        </Button>
      )}
    >
      {mensaje && <p>{mensaje}</p>}
    </Alert>
  )
}

export { Alert, ErrorCarga, alertVariants }
