'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Users, Edit, Shield, Check, Calendar } from 'lucide-react'
import { format } from 'date-fns'

interface User {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  is_admin: boolean
  permissions: {
    can_create: boolean
    can_edit: boolean
    can_delete: boolean
  }
  full_name: string | null
}

export function UsersList() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [editPermissions, setEditPermissions] = useState({
    can_create: false,
    can_edit: false,
    can_delete: false
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No hay sesión activa')
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-all-users`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al cargar usuarios')
      }

      setUsers(data.users || [])
    } catch (error: any) {
      setError(error.message || 'Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = (user: User) => {
    setSelectedUser(user)
    setEditPermissions(user.permissions)
    setSaveError(null)
    setSaveSuccess(false)
    setDialogOpen(true)
  }

  const handlePermissionChange = (permission: keyof typeof editPermissions) => {
    setEditPermissions(prev => ({
      ...prev,
      [permission]: !prev[permission]
    }))
  }

  const handleSavePermissions = async () => {
    if (!selectedUser) return

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No hay sesión activa')
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-user-permissions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            user_id: selectedUser.id,
            permissions: editPermissions
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al actualizar permisos')
      }

      setSaveSuccess(true)

      // Actualizar la lista de usuarios
      await loadUsers()

      // Cerrar el diálogo después de 1.5 segundos
      setTimeout(() => {
        setDialogOpen(false)
        setSaveSuccess(false)
      }, 1500)

    } catch (error: any) {
      setSaveError(error.message || 'Error al actualizar permisos')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Cargando usuarios...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-destructive">{error}</p>
          <div className="flex justify-center mt-4">
            <Button onClick={loadUsers} variant="outline">Reintentar</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2">
          <Users className="h-5 w-5" />
          Gestionar Usuarios
        </CardTitle>
        <CardDescription>
          {users.length} {users.length === 1 ? 'usuario registrado' : 'usuarios registrados'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
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
                      <span className="font-medium">{user.email}</span>
                      {user.full_name && (
                        <span className="text-xs text-muted-foreground">{user.full_name}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.is_admin ? (
                      <div className="flex items-center gap-1 text-secondary">
                        <Shield className="h-4 w-4" />
                        <span className="font-semibold">Admin</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Usuario</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.is_admin ? (
                      <span className="text-xs text-muted-foreground">Todos los permisos</span>
                    ) : (
                      <div className="flex gap-2 text-xs">
                        {user.permissions.can_create && (
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Crear</span>
                        )}
                        {user.permissions.can_edit && (
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Editar</span>
                        )}
                        {user.permissions.can_delete && (
                          <span className="bg-red-100 text-red-700 px-2 py-1 rounded">Eliminar</span>
                        )}
                        {!user.permissions.can_create && !user.permissions.can_edit && !user.permissions.can_delete && (
                          <span className="text-muted-foreground">Sin permisos</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.last_sign_in_at ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(user.last_sign_in_at), 'dd/MM/yyyy HH:mm')}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nunca</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!user.is_admin && (
                      <Dialog open={dialogOpen && selectedUser?.id === user.id} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(user)}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Editar Permisos de Usuario</DialogTitle>
                            <DialogDescription>
                              Modifica los permisos de {user.email}
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4 py-4">
                            <div className="space-y-3">
                              <Label>Permisos del usuario</Label>

                              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={editPermissions.can_create}
                                  onChange={() => handlePermissionChange('can_create')}
                                  disabled={saving}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-colors ${
                                  editPermissions.can_create
                                    ? 'bg-secondary border-secondary'
                                    : 'border-input'
                                }`}>
                                  {editPermissions.can_create && <Check className="h-3 w-3 text-secondary-foreground" />}
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium">Puede Crear</p>
                                  <p className="text-xs text-muted-foreground">Permite registrar nuevos pagos</p>
                                </div>
                              </label>

                              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={editPermissions.can_edit}
                                  onChange={() => handlePermissionChange('can_edit')}
                                  disabled={saving}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-colors ${
                                  editPermissions.can_edit
                                    ? 'bg-secondary border-secondary'
                                    : 'border-input'
                                }`}>
                                  {editPermissions.can_edit && <Check className="h-3 w-3 text-secondary-foreground" />}
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium">Puede Editar</p>
                                  <p className="text-xs text-muted-foreground">Permite modificar registros propios</p>
                                </div>
                              </label>

                              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={editPermissions.can_delete}
                                  onChange={() => handlePermissionChange('can_delete')}
                                  disabled={saving}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-colors ${
                                  editPermissions.can_delete
                                    ? 'bg-secondary border-secondary'
                                    : 'border-input'
                                }`}>
                                  {editPermissions.can_delete && <Check className="h-3 w-3 text-secondary-foreground" />}
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium">Puede Eliminar</p>
                                  <p className="text-xs text-muted-foreground">Permite borrar registros propios</p>
                                </div>
                              </label>
                            </div>

                            {saveError && (
                              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                                {saveError}
                              </div>
                            )}

                            {saveSuccess && (
                              <div className="text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200">
                                ¡Permisos actualizados exitosamente!
                              </div>
                            )}

                            <Button
                              onClick={handleSavePermissions}
                              disabled={saving || saveSuccess}
                              className="w-full"
                            >
                              {saving ? 'Guardando...' : saveSuccess ? '¡Guardado!' : 'Guardar Cambios'}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    {user.is_admin && (
                      <span className="text-xs text-muted-foreground">No editable</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
