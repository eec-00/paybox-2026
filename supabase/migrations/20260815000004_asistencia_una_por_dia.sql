-- ============================================================================
-- ASISTENCIA: 1 marca por conductor por día + backfill de nombre/DNI
-- ============================================================================

-- 1. Rellena conductor_nombre/conductor_dni en marcas registradas antes de
--    que existieran esas columnas (se veían como "Sin nombre" en el panel).
UPDATE public.asistencias_conductor a
SET conductor_nombre = COALESCE(a.conductor_nombre, up.full_name, up.odoo_employee_name),
    conductor_dni    = COALESCE(a.conductor_dni, up.dni)
FROM public.user_profiles up
WHERE up.id = a.conductor_id
  AND (a.conductor_nombre IS NULL OR a.conductor_dni IS NULL);

-- 2. Columna "fecha" (día calendario en hora de Perú) para poder limitar
--    a una marca por conductor por día sin problemas de zona horaria
--    (created_at es UTC; convertir "al vuelo" con ::date corta el día a
--    las 19:00 hora Perú, que es un bug).
ALTER TABLE public.asistencias_conductor
  ADD COLUMN IF NOT EXISTS fecha DATE;

UPDATE public.asistencias_conductor
SET fecha = (created_at AT TIME ZONE 'America/Lima')::date
WHERE fecha IS NULL;

ALTER TABLE public.asistencias_conductor
  ALTER COLUMN fecha SET DEFAULT ((now() AT TIME ZONE 'America/Lima')::date),
  ALTER COLUMN fecha SET NOT NULL;

-- 3. Si hubiera más de una marca del mismo conductor el mismo día (de las
--    pruebas antes de esta migración), conserva solo la primera para poder
--    crear el índice único.
DELETE FROM public.asistencias_conductor a
USING public.asistencias_conductor b
WHERE a.conductor_id = b.conductor_id
  AND a.fecha = b.fecha
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencias_conductor_una_por_dia
  ON public.asistencias_conductor (conductor_id, fecha);

COMMENT ON COLUMN public.asistencias_conductor.fecha IS
  'Día calendario (hora de Perú) de la marca. Único por conductor: no se puede marcar asistencia dos veces el mismo día.';
