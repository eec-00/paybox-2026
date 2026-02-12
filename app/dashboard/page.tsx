'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PaymentForm } from '@/components/PaymentForm'
import { PaymentsTable } from '@/components/PaymentsTable'
import { UserManagement } from '@/components/UserManagement'
import { UsersList } from '@/components/UsersList'
import { VehiclesList } from '@/components/VehiclesList'
import { TutorialsList } from '@/components/TutorialsList'
import { Sidebar, type Section } from '@/components/Sidebar'
import { isAdmin, getUserPermissions } from '@/lib/utils/auth'
import { LogOut, Shield, Car, PlayCircle } from 'lucide-react'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [refresh, setRefresh] = useState(0)
  const [activeSection, setActiveSection] = useState<Section>('registros')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
      }
    }

    checkUser()
  }, [router, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleSuccess = () => {
    setRefresh(prev => prev + 1)
    // Cambiar a la sección de registros después de guardar
    setActiveSection('registros')
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header mejorado con gradiente */}
      <header className="border-b bg-gradient-to-r from-primary via-primary to-primary/95 shadow-lg sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Bienvenido</p>
            <p className="text-base font-semibold text-white">
              {user.user_metadata?.full_name || user.email}
            </p>
          </div>
          <Button variant="secondary" onClick={handleLogout} className="shadow-md hover:shadow-lg transition-shadow">
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </header>

      {/* Main Layout con Sidebar */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <Sidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          isAdmin={isAdmin(user)}
          canCreate={getUserPermissions(user).can_create}
        />

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {activeSection === 'nuevo-pago' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-primary mb-2">Nuevo Registro de Pago</h2>
                  <p className="text-muted-foreground">Complete el formulario para registrar un nuevo pago</p>
                </div>
                <PaymentForm onSuccess={handleSuccess} />
              </div>
            )}

            {activeSection === 'registros' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-primary mb-2">Historial de Registros</h2>
                  <p className="text-muted-foreground">Visualiza y gestiona todos tus registros de pagos</p>
                </div>
                <PaymentsTable refresh={refresh} />
              </div>
            )}

            {activeSection === 'vehiculos' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Car className="h-6 w-6 text-primary" />
                  <div>
                    <h2 className="text-2xl font-bold text-primary">Vehículos</h2>
                    <p className="text-muted-foreground">Visualiza la flota de vehículos GPS de Navitel</p>
                  </div>
                </div>
                <VehiclesList />
              </div>
            )}

            {activeSection === 'tutoriales' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <PlayCircle className="h-6 w-6 text-secondary" />
                  <div>
                    <h2 className="text-2xl font-bold text-primary">Tutoriales</h2>
                    <p className="text-muted-foreground">Aprende a usar PayBox con nuestros videos guía</p>
                  </div>
                </div>
                <TutorialsList />
              </div>
            )}

            {activeSection === 'administracion' && (
              <div className="space-y-6">
                {isAdmin(user) ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Shield className="h-6 w-6 text-secondary" />
                      <div>
                        <h2 className="text-2xl font-bold text-primary">Panel de Administración</h2>
                        <p className="text-muted-foreground">Gestiona usuarios y permisos del sistema</p>
                      </div>
                    </div>

                    {/* Lista de usuarios existentes */}
                    <UsersList />

                    {/* Formulario para crear nuevos usuarios */}
                    <UserManagement />
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">Acceso Restringido</h3>
                    <p className="text-muted-foreground">
                      Solo los administradores pueden acceder a esta sección
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
