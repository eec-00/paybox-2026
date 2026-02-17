-- ============================================================================
-- MIGRACIÓN: Sistema de Actualizaciones
-- ============================================================================
-- Crea el sistema de notificaciones de actualizaciones para developers
-- REQUISITO: La migración 20260217000002 debe estar ejecutada primero

-- 1. Crear tabla de actualizaciones del sistema
CREATE TABLE IF NOT EXISTS public.system_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT, -- Ej: v1.2.3
  category TEXT DEFAULT 'general', -- 'feature', 'bugfix', 'improvement', 'general'
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Crear tabla para trackear qué usuarios han visto qué updates
CREATE TABLE IF NOT EXISTS public.user_update_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  update_id UUID REFERENCES public.system_updates(id) ON DELETE CASCADE NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, update_id)
);

-- 3. Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_system_updates_created_at ON public.system_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_updates_created_by ON public.system_updates(created_by);
CREATE INDEX IF NOT EXISTS idx_user_update_views_user_id ON public.user_update_views(user_id);
CREATE INDEX IF NOT EXISTS idx_user_update_views_update_id ON public.user_update_views(update_id);

-- 4. Habilitar RLS
ALTER TABLE public.system_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_update_views ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS para system_updates

-- Todos pueden leer actualizaciones
CREATE POLICY "Anyone can view system updates"
  ON public.system_updates
  FOR SELECT
  USING (true);

-- Solo developers pueden crear actualizaciones
CREATE POLICY "Developers can create updates"
  ON public.system_updates
  FOR INSERT
  WITH CHECK (public.current_user_role() = 'developer');

-- Solo developers pueden actualizar actualizaciones
CREATE POLICY "Developers can update system updates"
  ON public.system_updates
  FOR UPDATE
  USING (public.current_user_role() = 'developer')
  WITH CHECK (public.current_user_role() = 'developer');

-- Solo developers pueden eliminar actualizaciones
CREATE POLICY "Developers can delete system updates"
  ON public.system_updates
  FOR DELETE
  USING (public.current_user_role() = 'developer');

-- 6. Políticas RLS para user_update_views

-- Los usuarios pueden ver sus propias vistas
CREATE POLICY "Users can view own update views"
  ON public.user_update_views
  FOR SELECT
  USING (auth.uid() = user_id);

-- Los usuarios pueden marcar updates como vistos
CREATE POLICY "Users can mark updates as viewed"
  ON public.user_update_views
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Los usuarios pueden actualizar sus propias vistas
CREATE POLICY "Users can update own views"
  ON public.user_update_views
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Función helper para verificar si el usuario es developer
CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.current_user_role() = 'developer';
$$;

-- 8. Función para obtener el número de updates no vistos por el usuario actual
CREATE OR REPLACE FUNCTION public.get_unread_updates_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.system_updates su
  WHERE NOT EXISTS (
    SELECT 1 
    FROM public.user_update_views uuv 
    WHERE uuv.update_id = su.id 
    AND uuv.user_id = auth.uid()
  );
$$;

-- 9. Trigger para actualizar updated_at en system_updates
CREATE TRIGGER set_updated_at_system_updates
  BEFORE UPDATE ON public.system_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 10. Actualizar la función is_admin() para incluir developers
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('admin', 'developer');
$$;

-- 11. Función alternativa con nombre más descriptivo
CREATE OR REPLACE FUNCTION public.has_admin_privileges()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('admin', 'developer');
$$;

-- 12. Actualizar has_permission para que developers tengan todos los permisos
CREATE OR REPLACE FUNCTION public.has_permission(permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Los admins y developers siempre tienen todos los permisos
  IF public.current_user_role() IN ('admin', 'developer') THEN
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

-- 13. Comentarios de documentación
COMMENT ON TABLE public.system_updates IS 'Actualizaciones del sistema publicadas por developers';
COMMENT ON TABLE public.user_update_views IS 'Tracking de qué usuarios han visto qué actualizaciones';
COMMENT ON FUNCTION public.is_developer() IS 'Retorna TRUE si el usuario actual es developer';
COMMENT ON FUNCTION public.get_unread_updates_count() IS 'Retorna el número de actualizaciones no vistas por el usuario actual';
COMMENT ON FUNCTION public.has_admin_privileges() IS 'Retorna TRUE si el usuario es admin o developer';
COMMENT ON FUNCTION public.is_admin() IS 'Retorna TRUE si el usuario es admin o developer (actualizado para incluir developers)';
COMMENT ON COLUMN public.system_updates.category IS 'Tipo de actualización: feature, bugfix, improvement, general';

-- ============================================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================================

-- Para verificar:
-- SELECT * FROM public.system_updates ORDER BY created_at DESC;
-- SELECT public.get_unread_updates_count();
