'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserPlus, Check } from 'lucide-react'
import { createUser } from '@/lib/utils/auth'
import { UserRole } from '@/lib/types/user-profile.types'

export function UserManagement() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [permissions, setPermissions] = useState({
    can_create: false,
    can_edit: false,
    can_delete: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const supabase = createClient()

  const handlePermissionChange = (permission: keyof typeof permissions) => {
    setPermissions(prev => ({
      ...prev,
      [permission]: !prev[permission]
    }))
  }

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole)
    // Si es admin o viewer, ajustar permisos automáticamente
    if (newRole === 'admin') {
      setPermissions({ can_create: true, can_edit: true, can_delete: true })
    } else if (newRole === 'viewer') {
      setPermissions({ can_create: false, can_edit: false, can_delete: false })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      // Validaciones básicas
      if (!email || !displayName || !password) {
        throw new Error('Todos los campos son obligatorios')
      }

      if (password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres')
      }

      // Crear usuario con email pre-verificado usando la nueva función
      const result = await createUser({
        email,
        password,
        fullName: displayName,
        role,
        permissions
      })

      if (!result.success) {
        throw new Error(result.error || 'Error al crear usuario')
      }

      setSuccess('✅ Usuario creado exitosamente. Ya puede iniciar sesión sin verificar email.')

      // Limpiar formulario
      setEmail('')
      setDisplayName('')
      setPassword('')
      setRole('user')
      setPermissions({
        can_create: false,
        can_edit: false,
        can_delete: false
      })

      // Limpiar mensaje de éxito después de 5 segundos
      setTimeout(() => setSuccess(null), 5000)

    } catch (error: any) {
      setError(error.message || 'Error al crear usuario')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Crear Nuevo Usuario
        </CardTitle>
        <CardDescription>
          Crea una cuenta para un miembro del equipo y asigna sus permisos
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información del usuario */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Nombre completo *</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Ej: Juan Pérez"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico *</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
              <p className="text-xs text-green-600">
                ✓ El usuario podrá acceder inmediatamente sin verificar email
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Rol del usuario *</Label>
              <Select value={role} onValueChange={(value) => handleRoleChange(value as UserRole)} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">
                    <div className="flex flex-col">
                      <span className="font-medium">Visualizador</span>
                      <span className="text-xs text-muted-foreground">Solo puede ver registros</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="user">
                    <div className="flex flex-col">
                      <span className="font-medium">Usuario</span>
                      <span className="text-xs text-muted-foreground">Permisos personalizados</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex flex-col">
                      <span className="font-medium">Administrador</span>
                      <span className="text-xs text-muted-foreground">Acceso total al sistema</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Permisos (solo si el rol es 'user') */}
          {role === 'user' && (
          <div className="space-y-3 border-t pt-4">
            <Label>Permisos específicos</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="checkbox"
                  checked={permissions.can_create}
                  onChange={() => handlePermissionChange('can_create')}
                  disabled={loading}
                  className="sr-only"
                />
                <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-colors ${
                  permissions.can_create
                    ? 'bg-secondary border-secondary'
                    : 'border-input'
                }`}>
                  {permissions.can_create && <Check className="h-3 w-3 text-secondary-foreground" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium">Puede Crear</p>
                  <p className="text-xs text-muted-foreground">Permite registrar nuevos pagos</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="checkbox"
                  checked={permissions.can_edit}
                  onChange={() => handlePermissionChange('can_edit')}
                  disabled={loading}
                  className="sr-only"
                />
                <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-colors ${
                  permissions.can_edit
                    ? 'bg-secondary border-secondary'
                    : 'border-input'
                }`}>
                  {permissions.can_edit && <Check className="h-3 w-3 text-secondary-foreground" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium">Puede Editar</p>
                  <p className="text-xs text-muted-foreground">Permite modificar registros existentes (solo los propios)</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="checkbox"
                  checked={permissions.can_delete}
                  onChange={() => handlePermissionChange('can_delete')}
                  disabled={loading}
                  className="sr-only"
                />
                <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-colors ${
                  permissions.can_delete
                    ? 'bg-secondary border-secondary'
                    : 'border-input'
                }`}>
                  {permissions.can_delete && <Check className="h-3 w-3 text-secondary-foreground" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium">Puede Eliminar</p>
                  <p className="text-xs text-muted-foreground">Permite borrar registros (solo los propios)</p>
                </div>
              </label>
            </div>
          </div>
          )}

          {/* Mensaje informativo para admin/viewer */}
          {role === 'admin' && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
              <strong>Administrador:</strong> Tiene acceso completo a todas las funciones del sistema.
            </div>
          )}
          
          {role === 'viewer' && (
            <div className="p-3 bg-gray-50 dark:bg-gray-900 border rounded-lg text-sm text-muted-foreground">
              <strong>Visualizador:</strong> Solo puede ver registros, sin permisos de modificación.
            </div>
          )}

          {/* Mensajes */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200">
              {success}
            </div>
          )}

          {/* Botón de envío */}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creando usuario...' : 'Crear Usuario'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
