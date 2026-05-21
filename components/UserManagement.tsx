'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserPlus, Truck } from 'lucide-react'
import { createUser } from '@/lib/utils/auth'
import { UserRole, ModulePermissions, DEFAULT_MODULE_PERMISSIONS } from '@/lib/types/user-profile.types'
import { ModulePermissionsEditor } from '@/components/ModulePermissionsEditor'

// ─── Normal user form ────────────────────────────────────────────────────────

function NormalUserForm() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [modulePerms, setModulePerms] = useState<ModulePermissions>(DEFAULT_MODULE_PERMISSIONS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      if (!email || !displayName || !password) throw new Error('Todos los campos son obligatorios')
      if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')

      const isPrivileged = role === 'admin' || role === 'developer'
      const pagosAccess = isPrivileged ? { can_create: true, can_edit: true, can_delete: true } : modulePerms.pagos

      const result = await createUser({
        email, password, fullName: displayName, role,
        permissions: { can_create: pagosAccess.can_create, can_edit: pagosAccess.can_edit, can_delete: pagosAccess.can_delete },
        modulePermissions: isPrivileged ? null : modulePerms,
      })
      if (!result.success) throw new Error(result.error || 'Error al crear usuario')

      setSuccess('✅ Usuario creado exitosamente. Ya puede iniciar sesión sin verificar email.')
      setEmail(''); setDisplayName(''); setPassword(''); setRole('user')
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
              <Input id="displayName" type="text" placeholder="Ej: Juan Pérez" value={displayName} onChange={e => setDisplayName(e.target.value)} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico *</Label>
              <Input id="email" type="email" placeholder="usuario@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña *</Label>
              <Input id="password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} disabled={loading} />
              <p className="text-xs text-green-600">✓ El usuario podrá acceder inmediatamente sin verificar email</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol del usuario *</Label>
              <Select value={role} onValueChange={v => setRole(v as UserRole)} disabled={loading}>
                <SelectTrigger><SelectValue placeholder="Selecciona un rol" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">
                    <div className="flex flex-col"><span className="font-medium">Visualizador</span><span className="text-xs text-muted-foreground">Solo puede ver registros</span></div>
                  </SelectItem>
                  <SelectItem value="user">
                    <div className="flex flex-col"><span className="font-medium">Usuario</span><span className="text-xs text-muted-foreground">Permisos personalizados por módulo</span></div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex flex-col"><span className="font-medium">Administrador</span><span className="text-xs text-muted-foreground">Acceso total al sistema</span></div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {role !== 'admin' && role !== 'developer' && (
            <div className="space-y-3 border-t pt-4">
              <div>
                <Label>Acceso por módulo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Activa un módulo para habilitarlo.</p>
              </div>
              <ModulePermissionsEditor value={modulePerms} onChange={setModulePerms} disabled={loading} />
            </div>
          )}
          {role === 'admin' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <strong>Administrador:</strong> Tiene acceso completo a todas las funciones del sistema.
            </div>
          )}
          {role === 'viewer' && (
            <div className="p-3 bg-gray-50 border rounded-lg text-sm text-muted-foreground">
              <strong>Visualizador:</strong> Solo puede ver registros, sin permisos de modificación.
            </div>
          )}
          {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
          {success && <div className="text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200">{success}</div>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creando usuario...' : 'Crear Usuario'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── Conductor form ───────────────────────────────────────────────────────────

interface OdooEmpleado { id: number; name: string }

function ConductorForm() {
  const [fullName, setFullName] = useState('')
  const [dni, setDni] = useState('')
  const [password, setPassword] = useState('')
  const [odooEmployees, setOdooEmployees] = useState<OdooEmpleado[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const fetchEmpleados = async () => {
      setLoadingEmployees(true)
      try {
        const res = await fetch('/api/automatizacion/empleados?job_title=Conductor')
        const data = await res.json()
        setOdooEmployees(data.empleados || [])
      } catch {
        // silent - employee list is optional
      } finally {
        setLoadingEmployees(false)
      }
    }
    fetchEmpleados()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      if (!fullName || !dni || !password) throw new Error('Nombre, DNI y contraseña son requeridos')
      if (!/^\d{8}$/.test(dni)) throw new Error('DNI debe tener exactamente 8 dígitos')
      if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')

      const selectedEmp = odooEmployees.find(e => String(e.id) === selectedEmployee)

      const res = await fetch('/api/conductor/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          dni,
          password,
          odooEmployeeId: selectedEmp?.id || null,
          odooEmployeeName: selectedEmp?.name || null,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Error al crear conductor')

      setSuccess(`✅ Conductor creado. Accede con DNI ${dni} y la contraseña asignada.`)
      setFullName(''); setDni(''); setPassword(''); setSelectedEmployee('')
      setTimeout(() => setSuccess(null), 8000)
    } catch (err: any) {
      setError(err.message || 'Error al crear conductor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Crear Conductor
        </CardTitle>
        <CardDescription>
          Crea acceso al Portal del Conductor. Ingresa con DNI + contraseña, sin email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-fullName">Nombre completo *</Label>
            <Input id="c-fullName" type="text" placeholder="Ej: Carlos Quispe" value={fullName} onChange={e => setFullName(e.target.value)} required disabled={loading} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-dni">DNI (8 dígitos) *</Label>
            <Input
              id="c-dni" type="text" inputMode="numeric" maxLength={8}
              placeholder="12345678"
              value={dni}
              onChange={e => setDni(e.target.value.replace(/\D/g, ''))}
              required disabled={loading}
            />
            <p className="text-xs text-muted-foreground">El conductor usará este DNI para ingresar al portal.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-password">Contraseña *</Label>
            <Input id="c-password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} disabled={loading} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-empleado">Empleado en Odoo (opcional)</Label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee} disabled={loading || loadingEmployees}>
              <SelectTrigger>
                <SelectValue placeholder={loadingEmployees ? 'Cargando empleados...' : 'Selecciona empleado Odoo'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin vincular —</SelectItem>
                {odooEmployees.map(emp => (
                  <SelectItem key={emp.id} value={String(emp.id)}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Vincula con el empleado de Odoo para mostrar servicios y documentos.</p>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <strong>Portal del Conductor:</strong> El conductor accede en <code className="text-xs bg-amber-100 px-1 rounded">/conductor/login</code> con su DNI y contraseña.
          </div>

          {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
          {success && <div className="text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200">{success}</div>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creando conductor...' : 'Crear Conductor'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { NormalUserForm, ConductorForm }

export function UserManagement() {
  return (
    <div className="space-y-6">
      <NormalUserForm />
      <ConductorForm />
    </div>
  )
}
