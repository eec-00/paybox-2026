'use client'

import { Suspense, useState } from 'react'
import { useApp } from '@/lib/context/app-context'
import { UpdatesList } from '@/components/UpdatesList'
import { UpdatesManagement } from '@/components/UpdatesManagement'
import { Button } from '@/components/ui/button'
import { PlusCircle, Settings2 } from 'lucide-react'

export default function UpdatesPage() {
  const { isDeveloper } = useApp()
  // La tabla de administración (editar/eliminar) queda plegada para que la
  // vista sea la misma que ven todos; el developer la abre cuando la necesita.
  const [administrar, setAdministrar] = useState(false)

  const acciones = isDeveloper ? (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => window.dispatchEvent(new CustomEvent('openUpdateDialog'))}
        className="gap-1.5"
      >
        <PlusCircle className="h-4 w-4" />
        Nueva
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setAdministrar((v) => !v)}
        className={`gap-1.5 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground ${administrar ? 'bg-white/15' : ''}`}
      >
        <Settings2 className="h-4 w-4" />
        Administrar
      </Button>
    </>
  ) : null

  return (
    <div className="space-y-6">
      {/* UpdatesManagement siempre montado: escucha 'openUpdateDialog' para el botón "Nueva" */}
      {isDeveloper && (
        <div className={administrar ? '' : 'hidden'}>
          <UpdatesManagement />
        </div>
      )}
      {/* UpdatesList lee ?id= con useSearchParams, que requiere Suspense */}
      <Suspense fallback={null}>
        <UpdatesList headerAction={acciones} />
      </Suspense>
    </div>
  )
}
