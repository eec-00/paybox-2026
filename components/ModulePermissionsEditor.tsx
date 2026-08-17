'use client'

import { ModulePermissions, ModuleAccess, DEFAULT_MODULE_PERMISSIONS } from '@/lib/types/user-profile.types'

interface ModuleDef {
  id: keyof ModulePermissions
  label: string
  desc: string
}

const MODULES: ModuleDef[] = [
  { id: 'pagos',          label: 'Módulo de Finanzas',        desc: 'Pagos y Calendario' },
  { id: 'servicios',      label: 'Módulo de Servicios',      desc: 'Trailers, Flota y Zonas GPS' },
  { id: 'automatizacion', label: 'Módulo de Automatización', desc: 'Conductores, Tractos y Carretas' },
  { id: 'rrhh',           label: 'Recursos Humanos',         desc: 'Vacaciones y Asistencia' },
]

interface Props {
  value: ModulePermissions | null
  onChange: (value: ModulePermissions) => void
  disabled?: boolean
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

export function ModulePermissionsEditor({ value, onChange, disabled }: Props) {
  const perms: ModulePermissions = value ?? DEFAULT_MODULE_PERMISSIONS

  const updateModule = (id: keyof ModulePermissions, patch: Partial<ModuleAccess>) => {
    onChange({ ...perms, [id]: { ...perms[id], ...patch } })
  }

  const toggleModule = (id: keyof ModulePermissions) => {
    const enabling = !perms[id].enabled
    updateModule(id, {
      enabled: enabling,
      can_create: enabling,
      can_edit: enabling,
      can_delete: enabling,
    })
  }

  const toggleCrud = (id: keyof ModulePermissions, field: keyof Omit<ModuleAccess, 'enabled'>) => {
    updateModule(id, { [field]: !perms[id][field] })
  }

  return (
    <div className="space-y-3">
      {MODULES.map((mod) => {
        const access = perms[mod.id]
        return (
          <div key={mod.id} className="border rounded-lg overflow-hidden">
            {/* Header del módulo */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/40 transition-colors select-none"
              onClick={() => !disabled && toggleModule(mod.id)}
            >
              <div>
                <p className="font-medium text-sm">{mod.label}</p>
                <p className="text-xs text-muted-foreground">{mod.desc}</p>
              </div>
              <Toggle checked={access.enabled} onChange={() => toggleModule(mod.id)} disabled={disabled} />
            </div>

            {/* Métodos HTTP (CRUD) — solo si el módulo está habilitado */}
            {access.enabled && (
              <div className="border-t bg-muted/30 px-3 py-2 flex gap-4">
                {(
                  [
                    { field: 'can_create', label: 'Crear' },
                    { field: 'can_edit',   label: 'Editar' },
                    { field: 'can_delete', label: 'Eliminar' },
                  ] as { field: keyof Omit<ModuleAccess, 'enabled'>; label: string }[]
                ).map(({ field, label }) => (
                  <label
                    key={field}
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                    onClick={(e) => { e.stopPropagation(); !disabled && toggleCrud(mod.id, field) }}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      access[field] ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {access[field] && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs font-medium">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
