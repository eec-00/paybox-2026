-- ============================================================
-- Persistencia de servicios completados por conductor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conductor_servicios_completados (
  conductor_id    UUID    NOT NULL,
  servicio_id     INTEGER NOT NULL,
  servicio_nombre TEXT,
  completado_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (conductor_id, servicio_id)
);

-- If table already exists, add the column:
ALTER TABLE public.conductor_servicios_completados
  ADD COLUMN IF NOT EXISTS servicio_nombre TEXT;

ALTER TABLE public.conductor_servicios_completados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conductor_insert_completados"
  ON public.conductor_servicios_completados FOR INSERT
  WITH CHECK (conductor_id = auth.uid());

CREATE POLICY "conductor_select_completados"
  ON public.conductor_servicios_completados FOR SELECT
  USING (conductor_id = auth.uid());

CREATE POLICY "admin_select_completados"
  ON public.conductor_servicios_completados FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'developer')
    )
  );
