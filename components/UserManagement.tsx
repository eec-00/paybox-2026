'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserPlus } from 'lucide-react'
import { createUser } from '@/lib/utils/auth'
import { UserRole, ModulePermissions, DEFAULT_MODULE_PERMISSIONS } from '@/lib/types/user-profile.types'
import { ModulePermissionsEditor } from '@/components/ModulePermissionsEditor'

export function UserManagement() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [modulePerms, setModulePerms] = useState<ModulePermissions>(DEFAULT_MODULE_PERMISSIONS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      if (!email || !displayName || !password) {
        throw new Error('Todos los campos son obligatorios')
      }
      if (password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres')
      }

      const isPrivileged = role === 'admin' || role === 'developer'

      // Derivar permisos planos de pagos para RLS
      const pagosAccess = isPrivileged ? { can_create: true, can_edit: true, can_delete: true } : modulePerms.pagos

      const result = await createUser({
        email,
        password,
        fullName: displayName,
        role,
        permissions: {
          can_create: pagosAccess.can_create,
          can_edit: pagosAccess.can_edit,
          can_delete: pagosAccess.can_delete,
        },
        modulePermissions: isPrivileged ? null : modulePerms,
      })

      if (!result.success) throw new Error(result.error || 'Error al crear usuario')

      setSuccess('✅ Usuario creado exitosamente. Ya puede iniciar sesión sin verificar email.')
      setEmail('')
      setDisplayName('')
      setPassword('')
      setRole('user')
      setModulePerms(DEFAULT_MODULE_PERMISSIONS)
      setTimeout(() => setSuccess(null), 5000)

    } catch (err: any) {
      setError(err.message || 'Error al crear usuario')
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
          Crea una cuenta para un miembro del equipo y asigna sus permisos por módulo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
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
              <Select value={role} onValueChange={(v) => handleRoleChange(v as UserRole)} disabled={loading}>
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
                      <span className="text-xs text-muted-foreground">Permisos personalizados por módulo</span>
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

          {/* Editor de módulos (solo para roles no privilegiados) */}
          {role !== 'admin' && role !== 'developer' && (
            <div className="space-y-3 border-t pt-4">
              <div>
                <Label>Acceso por módulo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Activa un módulo para habilitarlo. Puedes desactivar acciones específicas dentro de cada uno.
                </p>
              </div>
              <ModulePermissionsEditor
                value={modulePerms}
                onChange={setModulePerms}
                disabled={loading}
              />
            </div>
          )}

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

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
          )}
          {success && (
            <div className="text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200">{success}</div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creando usuario...' : 'Crear Usuario'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
