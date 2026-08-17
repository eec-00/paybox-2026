-- ============================================================================
-- ASISTENCIA DE CONDUCTORES
-- El conductor marca su asistencia desde el portal; requiere permiso de
-- ubicación (mismo formato obligatorio que el marcado de hitos en
-- Mis Servicios) y queda registrada con lat/lng + hora.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.asistencias_conductor (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  accuracy     DOUBLE PRECISION,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asistencias_conductor_conductor_fecha
  ON public.asistencias_conductor (conductor_id, created_at DESC);

ALTER TABLE public.asistencias_conductor ENABLE ROW LEVEL SECURITY;

-- El conductor solo puede registrar y ver sus propias marcas.
CREATE POLICY "asistencias_conductor_insert_own"
  ON public.asistencias_conductor FOR INSERT
  WITH CHECK (conductor_id = auth.uid());

CREATE POLICY "asistencias_conductor_select_own"
  ON public.asistencias_conductor FOR SELECT
  USING (conductor_id = auth.uid());

-- Administración ve y puede corregir todas las marcas.
CREATE POLICY "asistencias_conductor_select_admin"
  ON public.asistencias_conductor FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'developer')
    )
  );

CREATE POLICY "asistencias_conductor_delete_admin"
  ON public.asistencias_conductor FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'developer')
    )
  );

COMMENT ON TABLE public.asistencias_conductor IS 'Marcas de asistencia de conductores desde el portal, con ubicación GPS obligatoria.';
