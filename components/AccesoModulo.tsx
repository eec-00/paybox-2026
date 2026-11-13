'use client'

import { useApp } from '@/lib/context/app-context'
import { Shield } from 'lucide-react'

/**
 * Muestra el contenido solo si el usuario tiene la sección habilitada
 * (la misma lista que arma el menú lateral). Admin y developer: siempre.
 */
export function AccesoModulo({ seccion, children }: { seccion: string; children: React.ReactNode }) {
  const { isAdminUser, isDeveloper, allowedModules } = useApp()

  if (isAdminUser || isDeveloper || allowedModules?.includes(seccion)) return <>{children}</>

  return (
    <div className="text-center py-12">
      <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">Acceso Restringido</h3>
      <p className="text-muted-foreground">No tienes permiso para ver esta sección. Pídele acceso a un administrador.</p>
    </div>
  )
}
