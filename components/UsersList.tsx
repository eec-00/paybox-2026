'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Users, Edit, Shield, Check, Calendar, Trash2, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { UserProfile, UserRole, ModulePermissions, DEFAULT_MODULE_PERMISSIONS } from '@/lib/types/user-profile.types'
import { getAllUserProfiles, updateUserProfile, deleteUserProfile } from '@/lib/utils/auth'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ModulePermissionsEditor } from '@/components/ModulePermissionsEditor'

const MODULE_LABELS: Record<string, string> = {
  pagos:          'Finanzas',
  servicios:      'Servicios',
  automatizacion: 'Automatización',
}

const CRUD_LABELS = [
  { key: 'can_create', label: 'C' },
  { key: 'can_edit',   label: 'E' },
  { key: 'can_delete', label: 'D' },
] as const

function ModulePermsBadges({ user }: { user: UserProfile }) {
  if (user.role === 'admin' || user.role === 'developer') {
    return <span className="text-xs text-muted-foreground">Todos los permisos</span>
  }

  const mp = user.module_permissions
  if (!mp) {
    return <span className="text-xs text-muted-foreground">Todos los módulos</span>
  }

  const enabled = (Object.keys(mp) as (keyof typeof mp)[]).filter((k) => mp[k].enabled)
  if (enabled.length === 0) {
    return <span className="text-xs text-muted-foreground">Sin acceso</span>
  }

  return (
    <div className="flex flex-col gap-1">
      {enabled.map((key) => {
        const access = mp[key]
        const fullAccess = access.can_create && access.can_edit && access.can_delete
        return (
          <div key={key} className="flex items-center gap-1">
            <span className="inline-flex px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded">
              {MODULE_LABELS[key] ?? key}
            </span>
            {!fullAccess && (
              <span className="flex gap-0.5">
                {CRUD_LABELS.map(({ key: ck, label }) => (
                  <span
                    key={ck}
                    className={`w-4 h-4 text-[10px] font-bold flex items-center justify-center rounded ${
                      access[ck]
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-800 line-through'
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function UsersList() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)

  // Estado para edición
  const [editRole, setEditRole] = useState<UserRole>('viewer')
  const [editModulePerms, setEditModulePerms] = useState<ModulePermissions>(DEFAULT_MODULE_PERMISSIONS)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  
  // Estado para eliminación
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null)
  const [deleting, setDeleting] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)

    try {
      // Ya no necesitamos Edge Function, directamente consultamos la tabla
      // RLS se encarga de verificar que solo admins puedan ver todos los usuarios
      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .neq('role', 'conductor')
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      setUsers(data || [])
    } catch (err: any) {
      console.error('Error loading users:', err)
      setError(err.message || 'Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = (user: UserProfile) => {
    setSelectedUser(user)
    setEditRole(user.role)
    setEditModulePerms(user.module_permissions ?? DEFAULT_MODULE_PERMISSIONS)
    setSaveError(null)
    setSaveSuccess(false)
    setDialogOpen(true)
  }

  const handleRoleChange = (role: UserRole) => {
    setEditRole(role)
  }

  const handleSavePermissions = async () => {
    if (!selectedUser) return

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const isPrivileged = editRole === 'admin' || editRole === 'developer'
      const pagos = isPrivileged ? { can_create: true, can_edit: true, can_delete: true } : editModulePerms.pagos

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          role: editRole,
          can_create: pagos.can_create,
          can_edit: pagos.can_edit,
          can_delete: pagos.can_delete,
          module_permissions: isPrivileged ? null : editModulePerms,
        })
        .eq('id', selectedUser.id)

      if (updateError) {
        throw updateError
      }

      setSaveSuccess(true)

      // Recargar usuarios
      await loadUsers()

      // Cerrar el diálogo después de 1.5 segundos
      setTimeout(() => {
        setDialogOpen(false)
        setSaveSuccess(false)
      }, 1500)

    } catch (err: any) {
      console.error('Error updating user:', err)
      setSaveError(err.message || 'Error al actualizar permisos')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClick = (user: UserProfile) => {
    setUserToDelete(user)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!userToDelete) return

    setDeleting(true)

    try {
      // Eliminar del Auth
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(
        userToDelete.id
      )

      if (deleteAuthError) {
        throw deleteAuthError
      }

      // El trigger CASCADE se encargará de eliminar el perfil automáticamente
      
      // Recargar usuarios
      await loadUsers()
      setDeleteDialogOpen(false)
      setUserToDelete(null)

    } catch (err: any) {
      console.error('Error deleting user:', err)
      alert(`Error al eliminar usuario: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'developer':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'user':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'viewer':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'Administrador'
      case 'developer':
        return 'Developer'
      case 'user':
        return 'Usuario'
      case 'viewer':
        return 'Visualizador'
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestión de Usuarios
          </CardTitle>
          <CardDescription>
            Administra los usuarios y sus permisos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
              <p className="mt-2 text-sm text-muted-foreground">Cargando usuarios...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestión de Usuarios
          </CardTitle>
          <CardDescription>
            Administra los usuarios y sus permisos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
          <Button onClick={loadUsers} className="mt-4">
            Reintentar
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestión de Usuarios
          </CardTitle>
          <CardDescription>
            Administra los usuarios y sus permisos del sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{user.full_name || 'Sin nombre'}</span>
                        <span className="text-sm text-muted-foreground">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                        {(user.role === 'admin' || user.role === 'developer') && <Shield className="h-3 w-3" />}
                        {getRoleLabel(user.role)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ModulePermsBadges user={user} />
                    </TableCell>
                    <TableCell>
                      {user.last_sign_in_at ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(user.last_sign_in_at), 'dd/MM/yyyy HH:mm')}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Nunca</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(user)}
                          disabled={user.role === 'admin' || user.role === 'developer'}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                        {(user.role !== 'admin' && user.role !== 'developer') && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteClick(user)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No hay usuarios registrados</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para editar permisos */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Permisos de Usuario</DialogTitle>
            <DialogDescription>
              Modifica el rol y permisos de {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Selector de Rol */}
            <div className="space-y-2">
              <Label>Rol del Usuario</Label>
              <Select value={editRole} onValueChange={(value) => handleRoleChange(value as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">
                    <div className="flex flex-col">
                      <span>Visualizador</span>
                      <span className="text-xs text-muted-foreground">Solo puede ver registros</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="user">
                    <div className="flex flex-col">
                      <span>Usuario</span>
                      <span className="text-xs text-muted-foreground">Permisos personalizados</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="developer">
                    <div className="flex flex-col">
                      <span>Developer</span>
                      <span className="text-xs text-muted-foreground">Acceso total + gestión de actualizaciones</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin" disabled>
                    <div className="flex flex-col">
                      <span>Administrador</span>
                      <span className="text-xs text-muted-foreground">Acceso total (no editable)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Editor de módulos (solo para roles no privilegiados) */}
            {editRole !== 'admin' && editRole !== 'developer' && (
              <div className="space-y-3 border-t pt-3">
                <div>
                  <Label>Acceso por módulo</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Activa un módulo para habilitarlo. Puedes desactivar acciones específicas dentro de cada uno.
                  </p>
                </div>
                <ModulePermissionsEditor
                  value={editModulePerms}
                  onChange={setEditModulePerms}
                  disabled={saving}
                />
              </div>
            )}

            {editRole === 'viewer' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900 border rounded-lg text-sm text-muted-foreground">
                Los visualizadores solo pueden ver registros, sin permisos de modificación.
              </div>
            )}

            {editRole === 'admin' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
                Los administradores tienen acceso completo a todas las funciones del sistema.
              </div>
            )}

            {editRole === 'developer' && (
              <div className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg text-sm">
                Los developers tienen acceso completo + gestión de actualizaciones del sistema.
              </div>
            )}

            {saveError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-800 dark:text-red-200">{saveError}</p>
              </div>
            )}

            {saveSuccess && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                <p className="text-sm text-green-800 dark:text-green-200">
                  Permisos actualizados correctamente
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSavePermissions}
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la cuenta de <strong>{userToDelete?.email}</strong>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Eliminando...' : 'Eliminar usuario'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
