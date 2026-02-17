-- ============================================================================
-- HOTFIX: Arreglar error "Database error granting user" en login
-- ============================================================================
-- Solución completa para permitir que usuarios nuevos inicien sesión

-- 1. Actualizar current_user_role() para manejar casos sin perfil
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1),
    'viewer'::user_role
  );
$$;

-- 2. Actualizar is_admin() para verificar explícitamente NULL
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'developer'), false);
$$;

-- 3. Actualizar has_permission() para manejar usuarios sin perfil
CREATE OR REPLACE FUNCTION public.has_permission(permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_role user_role;
  result BOOLEAN;
BEGIN
  -- Obtener rol del usuario
  user_role := public.current_user_role();
  
  -- Los admins y developers siempre tienen todos los permisos
  IF user_role IN ('admin', 'developer') THEN
    RETURN TRUE;
  END IF;
  
  -- Si no hay perfil, denegar acceso
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()) THEN
    RETURN FALSE;
  END IF;
  
  -- Verificar permiso específico
  result := CASE permission
    WHEN 'create' THEN COALESCE((SELECT can_create FROM public.user_profiles WHERE id = auth.uid()), false)
    WHEN 'edit' THEN COALESCE((SELECT can_edit FROM public.user_profiles WHERE id = auth.uid()), false)
    WHEN 'delete' THEN COALESCE((SELECT can_delete FROM public.user_profiles WHERE id = auth.uid()), false)
    ELSE FALSE
  END;
  
  RETURN result;
END;
$$;

-- 4. CRUCIAL: Eliminar política restrictiva de INSERT y crear una permisiva
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

-- Permitir INSERT solo cuando el ID coincide con el usuario autenticado
-- Esto permite que el trigger funcione sin problemas
CREATE POLICY "Allow user profile creation"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- 5. Asegurar que el trigger handle_new_user() tenga los permisos correctos
-- Recrear la función con SET search_path explícito
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
EXCEPTION
  WHEN OTHERS THEN
    -- Log error pero no fallar el login
    RAISE WARNING 'Error creating user profile: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Comentarios actualizados
COMMENT ON FUNCTION public.current_user_role() IS 'Retorna el rol del usuario actual. Retorna viewer si no hay perfil.';
COMMENT ON FUNCTION public.is_admin() IS 'Verifica si el usuario es admin o developer. Retorna false si no hay perfil.';
COMMENT ON FUNCTION public.has_permission(TEXT) IS 'Verifica permisos del usuario. Retorna false si no hay perfil.';

-- ============================================================================
-- FIN DEL HOTFIX
-- ============================================================================
