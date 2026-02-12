import { User } from '@supabase/supabase-js'

export function isAdmin(user: User | null): boolean {
  if (!user) return false
  return user.app_metadata?.role === 'admin'
}

export function getUserPermissions(user: User | null) {
  if (!user) {
    return {
      can_create: false,
      can_edit: false,
      can_delete: false
    }
  }

  // Si es admin, tiene todos los permisos
  if (isAdmin(user)) {
    return {
      can_create: true,
      can_edit: true,
      can_delete: true
    }
  }

  // Si no es admin, devolver los permisos del app_metadata
  return {
    can_create: user.app_metadata?.permissions?.can_create || false,
    can_edit: user.app_metadata?.permissions?.can_edit || false,
    can_delete: user.app_metadata?.permissions?.can_delete || false
  }
}
