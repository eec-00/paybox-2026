'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UserPlus, Check } from 'lucide-react'

export function UserManagement() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      // Crear usuario usando signUp con permisos en app_metadata
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName
          },
          emailRedirectTo: `${window.location.origin}/dashboard`
        }
      })

      if (signUpError) throw signUpError

      if (!data.user) {
        throw new Error('No se pudo crear el usuario')
      }

      // Ahora actualizar los permisos usando la Edge Function
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No hay sesión de admin activa')
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
            user_id: data.user.id,
            permissions
          })
        }
      )

      const permData = await response.json()

      if (!response.ok) {
        // El usuario se creó pero falló asignar permisos
        throw new Error(`Usuario creado pero error al asignar permisos: ${permData.error}`)
      }

      setSuccess('Usuario creado exitosamente. Se ha enviado un correo de confirmación.')

      // Limpiar formulario
      setEmail('')
      setDisplayName('')
      setPassword('')
      setPermissions({
        can_create: false,
        can_edit: false,
        can_delete: false
      })

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
              <p className="text-xs text-muted-foreground">
                El usuario recibirá un correo para confirmar su cuenta
              </p>
            </div>
          </div>

          {/* Permisos */}
          <div className="space-y-3 border-t pt-4">
            <Label>Permisos del usuario</Label>
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
