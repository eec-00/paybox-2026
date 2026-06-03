'use client'

import { useApp } from '@/lib/context/app-context'
import { UpdatesList } from '@/components/UpdatesList'
import { UpdatesManagement } from '@/components/UpdatesManagement'
import { Button } from '@/components/ui/button'
import { Megaphone, PlusCircle } from 'lucide-react'

export default function UpdatesPage() {
  const { isDeveloper } = useApp()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold text-primary">Actualizaciones del Sistema</h2>
            <p className="text-muted-foreground">Mantente informado sobre las mejoras y nuevas funcionalidades</p>
          </div>
        </div>
        {isDeveloper && (
          <Button onClick={() => {
            const event = new CustomEvent('openUpdateDialog')
            window.dispatchEvent(event)
          }}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Nueva Actualización
          </Button>
        )}
      </div>

      {isDeveloper && <UpdatesManagement />}
      <UpdatesList />
    </div>
  )
}
