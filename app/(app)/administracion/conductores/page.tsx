'use client'

import { useApp } from '@/lib/context/app-context'
import { ConductoresList } from '@/components/ConductoresList'
import { ConductorForm } from '@/components/UserManagement'
import { Shield, Truck } from 'lucide-react'

export default function AdminConductoresPage() {
  const { isAdminUser, isDeveloper } = useApp()

  if (!isAdminUser && !isDeveloper) {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Acceso Restringido</h3>
        <p className="text-muted-foreground">Solo los administradores pueden acceder a esta sección</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Truck className="h-6 w-6 text-secondary" />
        <div>
          <h2 className="text-2xl font-bold text-primary">Conductores</h2>
          <p className="text-muted-foreground">Choferes con acceso al Portal del Conductor</p>
        </div>
      </div>
      <ConductoresList />
      <ConductorForm />
    </div>
  )
}
