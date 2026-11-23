'use client'

import { PageHeader } from '@/components/ui/page-header'
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
      <PageHeader icon={Truck} title="Conductores" description="Choferes con acceso al Portal del Conductor" />
      <ConductoresList />
      <ConductorForm />
    </div>
  )
}
