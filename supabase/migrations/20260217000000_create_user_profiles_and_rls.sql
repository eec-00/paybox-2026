-- ============================================================================
-- MIGRACIÓN: Sistema de Roles y Permisos con RLS
-- Descripción: Crea un sistema robusto de permisos sin necesidad de Edge Functions
-- ============================================================================

-- 1. Crear ENUM para roles
CREATE TYPE user_role AS ENUM ('admin', 'user', 'viewer');

-- 2. Crear tabla de perfiles de usuario
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role DEFAULT 'viewer' NOT NULL,
  
  -- Permisos granulares (solo aplican si role != 'admin')
  can_create BOOLEAN DEFAULT false NOT NULL,
  can_edit BOOLEAN DEFAULT false NOT NULL,
  can_delete BOOLEAN DEFAULT false NOT NULL,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  last_sign_in_at TIMESTAMP WITH TIME ZONE
);

-- 3. Índices para mejorar performance
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);

-- 4. Habilitar Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Policy: Todos pueden ver su propio perfil
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Admins pueden ver todos los perfiles
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Solo admins pueden insertar perfiles (raro, pero por si acaso)
CREATE POLICY "Admins can insert profiles"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins pueden actualizar cualquier perfil (excepto otros admins)
CREATE POLICY "Admins can update non-admin profiles"
  ON public.user_profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    AND role != 'admin' -- No se pueden modificar otros admins
  );

-- Policy: Users pueden actualizar su propio nombre
CREATE POLICY "Users can update own name"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.user_profiles WHERE id = auth.uid()));

-- Policy: Solo admins pueden eliminar perfiles
CREATE POLICY "Admins can delete non-admin profiles"
  ON public.user_profiles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    AND role != 'admin'
  );

-- 6. Funciones helper para verificar permisos (útiles en otras tablas)

-- Función: Verificar si el usuario actual es admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Función: Verificar si el usuario tiene permiso específico
CREATE OR REPLACE FUNCTION public.has_permission(permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Los admins siempre tienen todos los permisos
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;
  
  -- Verificar permiso específico
  RETURN CASE permission
    WHEN 'create' THEN (SELECT can_create FROM public.user_profiles WHERE id = auth.uid())
    WHEN 'edit' THEN (SELECT can_edit FROM public.user_profiles WHERE id = auth.uid())
    WHEN 'delete' THEN (SELECT can_delete FROM public.user_profiles WHERE id = auth.uid())
    ELSE FALSE
  END;
END;
$$;

-- Función: Obtener perfil completo del usuario actual
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role user_role,
  can_create BOOLEAN,
  can_edit BOOLEAN,
  can_delete BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    id,
    email,
    full_name,
    role,
    CASE WHEN role = 'admin' THEN TRUE ELSE can_create END as can_create,
    CASE WHEN role = 'admin' THEN TRUE ELSE can_edit END as can_edit,
    CASE WHEN role = 'admin' THEN TRUE ELSE can_delete END as can_delete,
    created_at,
    updated_at
  FROM public.user_profiles
  WHERE id = auth.uid();
$$;

-- 7. Trigger para sincronizar auth.users con user_profiles

-- Función del trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role, last_sign_in_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_app_meta_data->>'role')::user_role, 'viewer'::user_role),
    NEW.last_sign_in_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    last_sign_in_at = EXCLUDED.last_sign_in_at,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;

-- Crear trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 8. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 9. Aplicar RLS a la tabla de registros (ejemplo)
-- Esto protege tus registros basado en los permisos

ALTER TABLE public.registros ENABLE ROW LEVEL SECURITY;

-- Policy: Todos pueden leer registros
CREATE POLICY "Users can view all registros"
  ON public.registros
  FOR SELECT
  USING (true);

-- Policy: Solo usuarios con permiso can_create pueden insertar
CREATE POLICY "Users with create permission can insert registros"
  ON public.registros
  FOR INSERT
  WITH CHECK (public.has_permission('create'));

-- Policy: Solo usuarios con permiso can_edit pueden actualizar
CREATE POLICY "Users with edit permission can update registros"
  ON public.registros
  FOR UPDATE
  USING (public.has_permission('edit'))
  WITH CHECK (public.has_permission('edit'));

-- Policy: Solo usuarios con permiso can_delete pueden eliminar
CREATE POLICY "Users with delete permission can delete registros"
  ON public.registros
  FOR DELETE
  USING (public.has_permission('delete'));

-- 10. Comentarios para documentación
COMMENT ON TABLE public.user_profiles IS 'Perfiles de usuario con roles y permisos. Los admins tienen todos los permisos automáticamente.';
COMMENT ON COLUMN public.user_profiles.role IS 'admin: acceso total | user: permisos personalizados | viewer: solo lectura';
COMMENT ON FUNCTION public.is_admin() IS 'Retorna TRUE si el usuario actual es admin';
COMMENT ON FUNCTION public.has_permission(TEXT) IS 'Verifica si el usuario actual tiene un permiso específico (create, edit, delete)';

-- ============================================================================
-- 11. MIGRACIÓN DE USUARIOS EXISTENTES
-- ============================================================================
-- Este script migra automáticamente todos los usuarios existentes en auth.users
-- a la nueva tabla user_profiles, preservando sus roles y permisos anteriores

INSERT INTO public.user_profiles (
  id, 
  email, 
  full_name, 
  role, 
  can_create, 
  can_edit, 
  can_delete,
  last_sign_in_at,
  created_at
)
SELECT 
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ) as full_name,
  -- Determinar el rol basado en app_metadata
  CASE 
    WHEN u.raw_app_meta_data->>'role' = 'admin' THEN 'admin'::user_role
    WHEN (u.raw_app_meta_data->'permissions')::text IS NOT NULL THEN 'user'::user_role
    ELSE 'viewer'::user_role
  END as role,
  -- Migrar permisos del app_metadata
  COALESCE((u.raw_app_meta_data->'permissions'->>'can_create')::boolean, false) as can_create,
  COALESCE((u.raw_app_meta_data->'permissions'->>'can_edit')::boolean, false) as can_edit,
  COALESCE((u.raw_app_meta_data->'permissions'->>'can_delete')::boolean, false) as can_delete,
  u.last_sign_in_at,
  u.created_at
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  last_sign_in_at = EXCLUDED.last_sign_in_at,
  updated_at = NOW();

-- Mostrar resumen de la migración
DO $$
DECLARE
  total_users INTEGER;
  admin_count INTEGER;
  user_count INTEGER;
  viewer_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_users FROM public.user_profiles;
  SELECT COUNT(*) INTO admin_count FROM public.user_profiles WHERE role = 'admin';
  SELECT COUNT(*) INTO user_count FROM public.user_profiles WHERE role = 'user';
  SELECT COUNT(*) INTO viewer_count FROM public.user_profiles WHERE role = 'viewer';
  
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'MIGRACIÓN COMPLETADA EXITOSAMENTE';
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Total de usuarios migrados: %', total_users;
  RAISE NOTICE '  - Administradores: %', admin_count;
  RAISE NOTICE '  - Usuarios: %', user_count;
  RAISE NOTICE '  - Visualizadores: %', viewer_count;
  RAISE NOTICE '=================================================';
  
  IF admin_count = 0 THEN
    RAISE WARNING 'No se encontraron administradores. Recuerda crear al menos uno.';
    RAISE NOTICE 'Para crear un admin, ejecuta:';
    RAISE NOTICE 'UPDATE public.user_profiles SET role = ''admin'' WHERE email = ''tu-email@ejemplo.com'';';
  END IF;
END $$;

-- ============================================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================================

-- NOTA: Si necesitas crear manualmente un admin después, ejecuta:
-- UPDATE public.user_profiles SET role = 'admin' WHERE email = 'tu-email@ejemplo.com';
