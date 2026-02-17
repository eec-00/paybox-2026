import { createClient } from '@/lib/supabase/client'
import { UserProfile, UserPermissions, UserRole } from '@/lib/types/user-profile.types'

/**
 * Obtiene el perfil completo del usuario actual desde la base de datos
 * Usa la función SQL get_my_profile() que retorna automáticamente todos los permisos
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .rpc('get_my_profile')
    .single()
  
  if (error || !data) {
    console.error('Error fetching user profile:', error)
    return null
  }
  
  return data as UserProfile
}

/**
 * Verifica si el usuario actual es admin
 * Usa la función SQL is_admin() para verificación a nivel de base de datos
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .rpc('is_admin')
  
  if (error) {
    console.error('Error checking admin status:', error)
    return false
  }
  
  return data === true
}

/**
 * Obtiene los permisos del usuario actual
 * Los admins automáticamente tienen todos los permisos
 */
export async function getUserPermissions(): Promise<UserPermissions> {
  const profile = await getCurrentUserProfile()
  
  if (!profile) {
    return {
      can_create: false,
      can_edit: false,
      can_delete: false
    }
  }
  
  // Si es admin, tiene todos los permisos
  if (profile.role === 'admin') {
    return {
      can_create: true,
      can_edit: true,
      can_delete: true
    }
  }
  
  return {
    can_create: profile.can_create,
    can_edit: profile.can_edit,
    can_delete: profile.can_delete
  }
}

/**
 * Verifica si el usuario tiene un permiso específico
 * Usa la función SQL has_permission() para verificación a nivel de base de datos
 */
export async function hasPermission(permission: 'create' | 'edit' | 'delete'): Promise<boolean> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .rpc('has_permission', { permission })
  
  if (error) {
    console.error(`Error checking permission ${permission}:`, error)
    return false
  }
  
  return data === true
}

/**
 * Obtiene todos los perfiles de usuarios (solo para admins)
 */
export async function getAllUserProfiles(): Promise<UserProfile[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching user profiles:', error)
    return []
  }
  
  return data as UserProfile[]
}

/**
 * Actualiza el perfil de un usuario (solo para admins)
 */
export async function updateUserProfile(
  userId: string, 
  updates: Partial<UserProfile>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  
  // RLS se encargará de verificar que solo admins puedan hacer esto
  const { error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', userId)
  
  if (error) {
    console.error('Error updating user profile:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Elimina un perfil de usuario (solo para admins, no puede eliminar otros admins)
 */
export async function deleteUserProfile(userId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  
  // RLS se encargará de verificar permisos
  const { error } = await supabase
    .from('user_profiles')
    .delete()
    .eq('id', userId)
  
  if (error) {
    console.error('Error deleting user profile:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Crea un nuevo usuario con email pre-verificado (solo para admins)
 * @param email Email del nuevo usuario
 * @param password Contraseña del nuevo usuario
 * @param fullName Nombre completo del usuario
 * @param role Rol del usuario (default: 'user')
 * @param permissions Permisos específicos si el rol es 'user'
 */
export async function createUser({
  email,
  password,
  fullName,
  role = 'user',
  permissions = { can_create: false, can_edit: false, can_delete: false }
}: {
  email: string
  password: string
  fullName: string
  role?: UserRole
  permissions?: UserPermissions
}): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // Llamar al API route que tiene privilegios de admin
    const response = await fetch('/api/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        fullName,
        role,
        permissions
      })
    })

    const result = await response.json()

    if (!response.ok) {
      return { success: false, error: result.error || 'Error al crear usuario' }
    }

    return { success: true, userId: result.userId }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error desconocido al crear usuario' }
  }
}
