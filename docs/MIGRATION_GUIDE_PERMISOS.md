# 🔐 Migración del Sistema de Permisos

## 📋 Resumen

Este documento explica cómo migrar del sistema actual (Edge Functions + app_metadata) al nuevo sistema basado en **Row Level Security (RLS)** de PostgreSQL.

## ✅ Ventajas del Nuevo Sistema

| Aspecto | Sistema Anterior | Nuevo Sistema |
|---------|------------------|---------------|
| **Costo** | Edge Functions (más caro) | Solo base de datos (más barato) |
| **Velocidad** | Llamadas HTTP a functions | Consultas SQL directas (más rápido) |
| **Escalabilidad** | Limitada | Excelente |
| **Mantenimiento** | Complejo (múltiples functions) | Simple (todo en SQL) |
| **Seguridad** | Manual en cada endpoint | Automática con RLS |

## 🚀 Pasos de Migración

### 1. Ejecutar la Migración SQL

```bash
# Opción A: Si usas Supabase CLI
supabase migration up

# Opción B: Desde el Dashboard de Supabase
# Ve a SQL Editor y ejecuta el archivo:
# supabase/migrations/20260217000000_create_user_profiles_and_rls.sql
```

### 2. Crear tu Primer Usuario Admin

Después de ejecutar la migración, necesitas convertir tu usuario en admin:

```sql
-- En el SQL Editor de Supabase, ejecuta:
UPDATE public.user_profiles 
SET role = 'admin' 
WHERE email = 'tu-email@ejemplo.com';
```

### 3. Migrar Usuarios Existentes (Opcional)

Si ya tienes usuarios con permisos en `app_metadata`, puedes migrarlos:

```sql
-- Script de migración de datos (ejecutar una sola vez)
INSERT INTO public.user_profiles (id, email, full_name, role, can_create, can_edit, can_delete)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', email) as full_name,
  CASE 
    WHEN raw_app_meta_data->>'role' = 'admin' THEN 'admin'::user_role
    ELSE 'user'::user_role
  END as role,
  COALESCE((raw_app_meta_data->'permissions'->>'can_create')::boolean, false) as can_create,
  COALESCE((raw_app_meta_data->'permissions'->>'can_edit')::boolean, false) as can_edit,
  COALESCE((raw_app_meta_data->'permissions'->>'can_delete')::boolean, false) as can_delete
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete;
```

### 4. Actualizar el Código Frontend

#### Antes (con Edge Functions):
```typescript
// ❌ Antiguo
import { User } from '@supabase/supabase-js'

const user = await supabase.auth.getUser()
const isAdmin = user.data.user?.app_metadata?.role === 'admin'
const permissions = user.data.user?.app_metadata?.permissions

// Llamada a Edge Function
const response = await fetch('/functions/v1/update-user-permissions', {
  method: 'POST',
  body: JSON.stringify({ user_id, permissions })
})
```

#### Después (con RLS):
```typescript
// ✅ Nuevo
import { getCurrentUserProfile, isAdmin, hasPermission } from '@/lib/utils/auth'

const profile = await getCurrentUserProfile()
const isUserAdmin = await isAdmin()
const canCreate = await hasPermission('create')

// Actualización directa a la base de datos
const { error } = await supabase
  .from('user_profiles')
  .update({ can_create: true })
  .eq('id', userId)
// RLS automáticamente verifica permisos
```

### 5. Actualizar Componentes

Los principales componentes a actualizar son:
- `components/UsersList.tsx`
- `components/UserManagement.tsx`
- `components/Dashboard.tsx`
- `components/PaymentForm.tsx`

Ejemplo de actualización:

```typescript
// Antes
const { data: { user } } = await supabase.auth.getUser()
const permissions = user?.app_metadata?.permissions

// Después
import { getCurrentUserProfile } from '@/lib/utils/auth'
const profile = await getCurrentUserProfile()
const permissions = {
  can_create: profile?.can_create,
  can_edit: profile?.can_edit,
  can_delete: profile?.can_delete
}
```

### 6. Eliminar Edge Functions (Opcional)

Una vez que todo funcione con el nuevo sistema, puedes eliminar:

```bash
# Eliminar carpetas de functions innecesarias
rm -rf supabase/functions/update-user-permissions
rm -rf supabase/functions/get-all-users
```

## 🔧 Funciones Helper Disponibles

El nuevo sistema incluye funciones SQL helper:

### `is_admin()`
```sql
SELECT public.is_admin();
-- Retorna true si el usuario actual es admin
```

### `has_permission(permission)`
```sql
SELECT public.has_permission('create');
SELECT public.has_permission('edit');
SELECT public.has_permission('delete');
-- Retorna true si el usuario tiene ese permiso
```

### `get_my_profile()`
```sql
SELECT * FROM public.get_my_profile();
-- Retorna el perfil completo del usuario actual
```

## 📊 Roles Disponibles

```typescript
type UserRole = 'admin' | 'user' | 'viewer'
```

| Role | Descripción | Permisos Predeterminados |
|------|-------------|--------------------------|
| `admin` | Administrador total | ✅ Todos los permisos |
| `user` | Usuario estándar | ⚙️ Permisos personalizados |
| `viewer` | Solo lectura | ❌ Sin permisos |

## 🔒 Políticas RLS Aplicadas

### Tabla `user_profiles`:
- ✅ Usuarios pueden ver su propio perfil
- ✅ Admins pueden ver todos los perfiles
- ✅ Admins pueden modificar perfiles (excepto otros admins)
- ✅ Solo admins pueden eliminar usuarios

### Tabla `registros`:
- ✅ Todos pueden leer
- ✅ Solo usuarios con `can_create` pueden insertar
- ✅ Solo usuarios con `can_edit` pueden actualizar
- ✅ Solo usuarios con `can_delete` pueden eliminar

## 🧪 Testing

### Probar permisos:

```typescript
// Test 1: Verificar perfil
const profile = await getCurrentUserProfile()
console.log('Mi perfil:', profile)

// Test 2: Verificar si soy admin
const amIAdmin = await isAdmin()
console.log('¿Soy admin?:', amIAdmin)

// Test 3: Verificar permisos específicos
const canCreate = await hasPermission('create')
const canEdit = await hasPermission('edit')
const canDelete = await hasPermission('delete')
console.log('Permisos:', { canCreate, canEdit, canDelete })

// Test 4: Intentar actualizar un usuario (solo funciona si eres admin)
const result = await updateUserProfile('user-id', {
  can_create: true
})
console.log('Resultado:', result)
```

## 🐛 Troubleshooting

### Error: "new row violates row-level security policy"
**Causa:** El usuario no tiene permisos para esa operación.
**Solución:** Verifica que el usuario tenga el rol o permiso correcto.

### Error: "function public.is_admin() does not exist"
**Causa:** La migración no se ejecutó correctamente.
**Solución:** Ejecuta la migración SQL nuevamente.

### Los permisos no se actualizan
**Causa:** Cache del cliente de Supabase.
**Solución:** Refresca la sesión del usuario:
```typescript
await supabase.auth.refreshSession()
```

## 📚 Recursos

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Policies](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- [Auth Helpers](https://supabase.com/docs/guides/auth/auth-helpers)

## ✨ Próximos Pasos

1. ✅ Ejecutar migración SQL
2. ✅ Crear primer admin
3. ✅ Actualizar código frontend
4. ✅ Testing de permisos
5. ✅ Eliminar Edge Functions antiguas
6. 🎉 Disfrutar del nuevo sistema más rápido y eficiente
