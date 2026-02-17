-- ============================================================================
-- FIX: Recursión Infinita en RLS Policies
-- ============================================================================
-- Este script arregla el problema de recursión infinita en las políticas RLS
-- causado por consultas circulares a user_profiles

-- 1. Eliminar las políticas problemáticas
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update non-admin profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can delete non-admin profiles" ON public.user_profiles;

-- 2. Crear una función helper que usa SECURITY DEFINER para evitar RLS
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 3. Recrear las políticas SIN recursión

-- Policy: Todos pueden ver su propio perfil
-- Esta no cambia, está bien
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Admins pueden ver todos los perfiles
-- Ahora usa la función SECURITY DEFINER
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles
  FOR SELECT
  USING (public.current_user_role() = 'admin');

-- Policy: Admins pueden insertar perfiles
CREATE POLICY "Admins can insert profiles"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

-- Policy: Admins pueden actualizar cualquier perfil (excepto otros admins)
-- Simplificada para evitar recursión
CREATE POLICY "Admins can update non-admin profiles"
  ON public.user_profiles
  FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    AND role != 'admin'
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    AND role != 'admin'
  );

-- Policy: Users pueden actualizar su propio nombre (pero no su rol)
DROP POLICY IF EXISTS "Users can update own name" ON public.user_profiles;
CREATE POLICY "Users can update own name"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND role = public.current_user_role()
  );

-- Policy: Solo admins pueden eliminar perfiles (no pueden eliminar otros admins)
CREATE POLICY "Admins can delete non-admin profiles"
  ON public.user_profiles
  FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    AND role != 'admin'
  );

-- 4. Actualizar la función is_admin() para usar current_user_role()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.current_user_role() = 'admin';
$$;

-- 5. Comentario de documentación
COMMENT ON FUNCTION public.current_user_role() IS 'Retorna el rol del usuario actual sin causar recursión en RLS';

-- ============================================================================
-- FIN DE LA CORRECCIÓN
-- ============================================================================

-- Para verificar que las políticas están bien:
-- SELECT schemaname, tablename, policyname 
-- FROM pg_policies 
-- WHERE tablename = 'user_profiles';
