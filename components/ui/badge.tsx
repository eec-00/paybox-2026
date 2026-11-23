import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Etiquetas de estado. Las variantes de tono (success, warning, info, danger,
// neutral) son las que hay que usar para estados: fondo suave + texto oscuro
// del mismo tono, en lugar de armar bg-*-100 text-*-700 a mano en cada pantalla.
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        success: "border-success/25 bg-success-soft text-success-ink",
        warning: "border-warning/30 bg-warning-soft text-warning-ink",
        info: "border-info/25 bg-info-soft text-info-ink",
        danger: "border-destructive/25 bg-destructive-soft text-destructive-ink",
        neutral: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
