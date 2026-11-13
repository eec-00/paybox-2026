'use client'

import { ModulePermissions, ModuleAccess, DEFAULT_MODULE_PERMISSIONS } from '@/lib/types/user-profile.types'

interface ModuleDef {
  id: keyof ModulePermissions
  label: string
  desc: string
  /** Solo se decide si lo ve o no (sin Crear / Editar / Eliminar) */
  viewOnly?: boolean
}

const MODULES: ModuleDef[] = [
  { id: 'pagos',          label: 'Módulo de Finanzas',        desc: 'Pagos y Calendario' },
  { id: 'servicios',      label: 'Módulo de Servicios',      desc: 'Trailers, Flota y Sobrecostos' },
  { id: 'automatizacion', label: 'Módulo de Automatización', desc: 'Conductores, Tractos y Carretas' },
  { id: 'rrhh',           label: 'Recursos Humanos',         desc: 'Vacaciones y Asistencia' },
  { id: 'sunat',          label: 'SUNAT',                    desc: 'GRE Transportistas y Bienes Fiscalizables', viewOnly: true },
  { id: 'detracciones',   label: 'Detracciones',             desc: 'Conciliación con Banco de la Nación', viewOnly: true },
  { id: 'pruebas',        label: 'Pruebas',                  desc: 'Módulos en prueba (Pagos Conductores)', viewOnly: true },
]

interface Props {
  value: ModulePermissions | null
  onChange: (value: ModulePermissions) => void
  disabled?: boolean
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

const CRUD: { field: keyof Omit<ModuleAccess, 'enabled'>; label: string }[] = [
  { field: 'can_create', label: 'Crear' },
  { field: 'can_edit',   label: 'Editar' },
  { field: 'can_delete', label: 'Eliminar' },
]

export function ModulePermissionsEditor({ value, onChange, disabled }: Props) {
  // Perfiles guardados antes de que existiera un módulo no tienen su clave
  const perms: ModulePermissions = { ...DEFAULT_MODULE_PERMISSIONS, ...value }

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

  const renderRow = (mod: ModuleDef) => {
    const access = perms[mod.id]
    return (
      <li
        key={mod.id}
        className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-center gap-x-5 gap-y-2.5 px-4 py-3"
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => toggleModule(mod.id)}
          className="text-left min-w-0 disabled:cursor-not-allowed"
        >
          <span className="block text-sm font-medium leading-tight">{mod.label}</span>
          <span className="block text-xs text-muted-foreground mt-0.5">{mod.desc}</span>
        </button>

        {/* Acciones: siempre ocupan su lugar para que la fila no salte al activar */}
        {!mod.viewOnly && (
          <div
            className={`col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto flex items-center gap-4 transition-opacity ${
              access.enabled ? '' : 'opacity-35 pointer-events-none'
            }`}
            aria-hidden={!access.enabled}
          >
            {CRUD.map(({ field, label }) => (
              <button
                key={field}
                type="button"
                role="checkbox"
                aria-checked={access[field]}
                disabled={disabled || !access.enabled}
                tabIndex={access.enabled ? 0 : -1}
                onClick={() => toggleCrud(mod.id, field)}
                className="flex items-center gap-1.5 text-xs font-medium select-none rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                  access[field] ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {access[field] && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {label}
              </button>
            ))}
          </div>
        )}

        <Toggle
          checked={access.enabled}
          onChange={() => toggleModule(mod.id)}
          disabled={disabled}
          label={`Acceso a ${mod.label}`}
        />
      </li>
    )
  }

  return (
    <div className="space-y-5">
      <ul className="divide-y rounded-lg border">
        {MODULES.filter(m => !m.viewOnly).map(renderRow)}
      </ul>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Secciones de solo lectura: se decide si las ve o no</p>
        <ul className="divide-y rounded-lg border">
          {MODULES.filter(m => m.viewOnly).map(renderRow)}
        </ul>
      </div>
    </div>
  )
}
