// Tipos para el sistema de perfiles y permisos

export type UserRole = 'admin' | 'user' | 'viewer' | 'developer'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
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
}
