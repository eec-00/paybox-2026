-- ============================================================================
-- Fix: un usuario sin rol admin/developer pero con permiso del módulo "pagos"
-- (Finanzas) no veía nada en Finanzas > Gastos de Conductores. La policy de
-- SELECT de gastos_conductor (supabase/gastos_conductor.sql) solo dejaba pasar
-- a admin/developer, así que Supabase devolvía 0 filas (RLS, sin error) y la
-- tabla mostraba "No se encontraron gastos". UPDATE/DELETE ya aceptaban
-- pagos.enabled — solo faltaba el SELECT.
-- ============================================================================

DROP POLICY IF EXISTS "admins_select_gastos" ON public.gastos_conductor;
CREATE POLICY "admin_or_pagos_select_gastos"
  ON public.gastos_conductor FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (
          role IN ('admin', 'developer')
          OR (module_permissions->>'pagos')::jsonb->>'enabled' = 'true'
        )
    )
  );
