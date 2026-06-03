'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isAdmin, getUserPermissions, getCurrentUserProfile } from '@/lib/utils/auth'
import { Sidebar } from '@/components/Sidebar'
import { ProfileSettingsModal } from '@/components/ProfileSettingsModal'
import { UpdatesNotification } from '@/components/UpdatesNotification'
import { Button } from '@/components/ui/button'
import { AppContext } from '@/lib/context/app-context'
import { LogOut } from 'lucide-react'
import Image from 'next/image'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isDeveloper, setIsDeveloper] = useState(false)
  const [profileName, setProfileName] = useState<string | null>(null)
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [canCreate, setCanCreate] = useState(false)
  const [allowedModules, setAllowedModules] = useState<string[] | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarCollapsed(true)
  }, [])

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/login')
        return
      }
      setUser(authUser)

      const profile = await getCurrentUserProfile()
      if (profile?.role === 'conductor') {
        router.push('/conductor/servicios')
        return
      }

      setIsDeveloper(profile?.role === 'developer')
      setProfileName(profile?.full_name || null)

      const adminStatus = await isAdmin()
      setIsAdminUser(adminStatus)

      const permissions = await getUserPermissions()
      setCanCreate(permissions.can_create)

      if (!adminStatus && profile?.module_permissions) {
        const mp = profile.module_permissions
        const sections: string[] = []
        if (mp.pagos?.enabled)          sections.push('finanzas')
        if (mp.servicios?.enabled)      sections.push('servicios')
        if (mp.automatizacion?.enabled) sections.push('automatizacion')
        setAllowedModules(sections)
      }

      setLoading(false)
    }

    checkUser()
  }, [router, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
    <AppContext.Provider
      value={{ user, profileName, isAdminUser, isDeveloper, canCreate, allowedModules }}
    >
      <ProfileSettingsModal
        open={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        userName={profileName}
        userEmail={user?.email ?? null}
        onNameUpdated={(name) => setProfileName(name)}
      />

      <header className="border-b bg-linear-to-r from-primary via-primary to-primary/95 shadow-lg sticky top-0 z-50">
        <div className="px-3 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="h-9 w-9 bg-white/10 hover:bg-white/20 text-white rounded-md transition-all hover:scale-110"
                title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
              >
                {sidebarCollapsed ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </Button>

              <div className="relative w-10 h-10 sm:w-12 sm:h-12 shrink-0">
                <Image src="/logo.png" alt="Logo" fill className="object-contain" />
              </div>
              <div>
                <h1 className="font-bold text-lg sm:text-2xl text-white font-(family-name:--font-montserrat)">PayBox</h1>
                <p className="text-[11px] sm:text-sm text-white/70 leading-tight">Eemerson SAC</p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <div className="h-8 w-px bg-white/30" />
              <p className="text-sm text-white font-medium">
                Bienvenido, {profileName || user.user_metadata?.full_name || user.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <UpdatesNotification />
            <Button
              variant="secondary"
              onClick={handleLogout}
              className="shadow-md hover:shadow-lg transition-shadow h-9 sm:h-10 px-3 sm:px-4 text-sm"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {!sidebarCollapsed && (
          <div
            className="fixed inset-0 top-16 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}

        <Sidebar
          isAdmin={isAdminUser}
          canCreate={canCreate}
          collapsed={sidebarCollapsed}
          allowedModules={allowedModules}
          userName={profileName}
          userEmail={user?.email ?? null}
          onProfileClick={() => setShowProfileModal(true)}
        />

        <main className="flex-1 p-2 sm:p-4 md:p-8 overflow-auto min-w-0">
          <div className="w-full max-w-[1600px] mx-auto min-w-0">
            {children}
          </div>
        </main>
      </div>
    </AppContext.Provider>
    </div>
  )
}
