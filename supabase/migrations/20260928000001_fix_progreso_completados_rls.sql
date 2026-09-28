-- ============================================================================
-- Fix: un usuario sin rol admin/developer pero con permiso del módulo
-- "servicios" no podía ver el Progreso real en Servicios > Trailers — las
-- policies de SELECT de estas dos tablas solo dejaban pasar a admin/developer
-- (conductor_servicios_progreso.sql / conductor_servicios_completados.sql),
-- así que a cualquier otro usuario Supabase le devolvía 0 filas (RLS, sin
-- error visible) y calcularProgreso() mostraba "Sin iniciar" para todo.
--
-- Mismo fix que ya se había aplicado a conductor_servicio_hito_fotos — ver
-- supabase/conductor_servicio_hito_fotos.sql — solo que nunca se replicó acá.
-- ============================================================================

DROP POLICY IF EXISTS "admin_select_progreso" ON public.conductor_servicios_progreso;
CREATE POLICY "admin_or_servicios_select_progreso"
  ON public.conductor_servicios_progreso FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (
          role IN ('admin', 'developer')
          OR (module_permissions->>'servicios')::jsonb->>'enabled' = 'true'
        )
    )
  );

DROP POLICY IF EXISTS "admin_select_completados" ON public.conductor_servicios_completados;
CREATE POLICY "admin_or_servicios_select_completados"
  ON public.conductor_servicios_completados FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (
          role IN ('admin', 'developer')
          OR (module_permissions->>'servicios')::jsonb->>'enabled' = 'true'
        )
    )
  );
