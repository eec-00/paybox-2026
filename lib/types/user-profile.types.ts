export type UserRole = 'admin' | 'user' | 'viewer' | 'developer'

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
}

export const DEFAULT_MODULE_PERMISSIONS: ModulePermissions = {
  pagos:          { enabled: false, can_create: false, can_edit: false, can_delete: false },
  servicios:      { enabled: false, can_create: false, can_edit: false, can_delete: false },
  automatizacion: { enabled: false, can_create: false, can_edit: false, can_delete: false },
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
