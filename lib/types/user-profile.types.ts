export type UserRole = 'admin' | 'user' | 'viewer' | 'developer' | 'conductor'

export interface ModuleAccess {
  enabled: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

export interface ModulePermissions {
  pagos: ModuleAccess
  servicios: ModuleAccess
  automatizacion: ModuleAccess
  /** Recursos Humanos: Vacaciones + Asistencia */
  rrhh: ModuleAccess
  /** SUNAT (GRE Transportistas y Bienes Fiscalizables). Solo "ver". */
  sunat: ModuleAccess
  /** Detracciones. Solo "ver". */
  detracciones: ModuleAccess
  /** Módulos en prueba (hoy: Pagos Conductores). Solo "ver". */
  pruebas: ModuleAccess
}

// sunat y detracciones nacieron visibles para todos: por defecto siguen
// habilitados, así los perfiles guardados antes de que existieran no pierden
// acceso. Pruebas es opt-in: nadie que no sea admin lo ve hasta que se lo den.
export const DEFAULT_MODULE_PERMISSIONS: ModulePermissions = {
  pagos:          { enabled: false, can_create: false, can_edit: false, can_delete: false },
  servicios:      { enabled: false, can_create: false, can_edit: false, can_delete: false },
  automatizacion: { enabled: false, can_create: false, can_edit: false, can_delete: false },
  rrhh:           { enabled: false, can_create: false, can_edit: false, can_delete: false },
  sunat:          { enabled: true,  can_create: false, can_edit: false, can_delete: false },
  detracciones:   { enabled: true,  can_create: false, can_edit: false, can_delete: false },
  pruebas:        { enabled: false, can_create: false, can_edit: false, can_delete: false },
}

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  module_permissions: ModulePermissions | null
  dni: string | null
  odoo_employee_id: number | null
  odoo_employee_name: string | null
  created_at: string
  updated_at: string
  last_sign_in_at: string | null
}

export interface UserPermissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

export interface UpdateUserProfilePayload {
  full_name?: string
  role?: UserRole
  can_create?: boolean
  can_edit?: boolean
  can_delete?: boolean
  module_permissions?: ModulePermissions | null
}
