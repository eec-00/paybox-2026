-- ============================================================================
-- ASISTENCIA: el conductor puede cancelar su propia marca del día
-- Hasta ahora el conductor podía marcar entrada/salida pero no deshacerlo si
-- se equivocó (marcó desde el lugar equivocado, tocó el botón sin querer,
-- etc.) — solo un admin podía borrar la marca. Se agrega la policy de DELETE
-- que faltaba para que el conductor pueda cancelar su propia entrada (borra
-- la fila del día) cuando todavía no marcó salida; cancelar la salida ya
-- funciona con la policy de UPDATE que existe desde la migración de salida
-- (solo limpia salida_at/salida_lat/salida_lng/salida_accuracy).
-- ============================================================================

CREATE POLICY "asistencias_conductor_delete_own"
  ON public.asistencias_conductor FOR DELETE
  USING (conductor_id = auth.uid());
