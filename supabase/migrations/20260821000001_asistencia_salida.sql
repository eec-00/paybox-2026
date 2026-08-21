-- ============================================================================
-- ASISTENCIA: marca de salida
-- Hasta ahora el conductor solo podía marcar una vez al día (su "entrada",
-- guardada en lat/lng/accuracy/created_at). Se agregan columnas de salida a
-- la misma fila del día, y una policy de UPDATE para que el conductor pueda
-- completarla sin crear una segunda fila (el índice único ya es 1 por día).
-- ============================================================================

ALTER TABLE public.asistencias_conductor
  ADD COLUMN IF NOT EXISTS salida_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS salida_lat      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS salida_lng      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS salida_accuracy DOUBLE PRECISION;

COMMENT ON COLUMN public.asistencias_conductor.salida_at IS
  'Hora de salida marcada por el conductor. NULL hasta que la marque; una vez marcada no se vuelve a permitir otra salida ese día.';

-- El conductor puede actualizar su propia fila del día (para completar la
-- salida). Sigue sin poder ver ni tocar filas de otros conductores.
CREATE POLICY "asistencias_conductor_update_own"
  ON public.asistencias_conductor FOR UPDATE
  USING (conductor_id = auth.uid())
  WITH CHECK (conductor_id = auth.uid());
