'use client'

import { useApp } from '@/lib/context/app-context'
import { UsersList } from '@/components/UsersList'
import { NormalUserForm } from '@/components/UserManagement'
import { Shield } from 'lucide-react'

export default function AdminUsuariosPage() {
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
        <Shield className="h-6 w-6 text-secondary" />
        <div>
          <h2 className="text-2xl font-bold text-primary">Usuarios Core</h2>
          <p className="text-muted-foreground">Equipo interno con acceso al dashboard</p>
        </div>
      </div>
      <UsersList />
      <NormalUserForm />
    </div>
  )
}
