-- ============================================================
-- Progreso en curso de servicios por conductor (cross-device)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conductor_servicios_progreso (
  conductor_id UUID    NOT NULL,
  servicio_id  INTEGER NOT NULL,
  step_actual  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (conductor_id, servicio_id)
);

ALTER TABLE public.conductor_servicios_progreso ENABLE ROW LEVEL SECURITY;

-- Conductor manages own progress rows
CREATE POLICY "conductor_manage_progreso"
  ON public.conductor_servicios_progreso
  FOR ALL
  USING (conductor_id = auth.uid())
  WITH CHECK (conductor_id = auth.uid());

-- Admins can read all
CREATE POLICY "admin_select_progreso"
  ON public.conductor_servicios_progreso FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'developer')
    )
  );
