-- ============================================================================
-- ASISTENCIA OFICINA: selfie obligatoria por tipo de marca
-- Antes era un solo interruptor (selfie_obligatoria) para las 4 marcas. Ahora
-- RRHH elige en cuáles se pide selfie (ej. solo entrada y salida, sin las de
-- almuerzo). Se respeta lo que ya estuviera configurado: si estaba apagada,
-- arranca sin ninguna.
--
-- selfie_obligatoria queda sin uso; se puede borrar cuando el código nuevo ya
-- esté deployado (el anterior todavía la lee).
-- ============================================================================

ALTER TABLE public.oficina_config
  ADD COLUMN IF NOT EXISTS selfie_tipos TEXT[] NOT NULL
    DEFAULT ARRAY['entrada', 'salida_almuerzo', 'regreso_almuerzo', 'salida']
    CHECK (selfie_tipos <@ ARRAY['entrada', 'salida_almuerzo', 'regreso_almuerzo', 'salida']);

UPDATE public.oficina_config SET selfie_tipos = '{}' WHERE NOT selfie_obligatoria;

COMMENT ON COLUMN public.oficina_config.selfie_tipos IS
  'Marcas en las que se pide selfie obligatoria (entrada, salida_almuerzo, regreso_almuerzo, salida). Vacío = ninguna.';
