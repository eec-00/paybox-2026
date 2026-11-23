-- ============================================================================
-- Pernocte: la ubicación del celular pasa a ser obligatoria (Michael,
-- 18/11/2026). La app y /api/conductor/pernoctes ya rechazan solicitudes sin
-- ubicación; esto lo asegura también en la base.
-- La tabla se creó en 20261118000001 con lat/lng opcionales y estaba vacía
-- (si hubiera filas sin ubicación, este ALTER falla y hay que revisarlas).
-- ============================================================================

ALTER TABLE public.pernoctes_conductor
  ALTER COLUMN lat SET NOT NULL,
  ALTER COLUMN lng SET NOT NULL;
