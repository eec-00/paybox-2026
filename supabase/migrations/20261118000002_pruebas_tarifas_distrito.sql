-- ============================================================================
-- Pruebas · Pagos conductores: tarifas de distritos nuevos validadas
-- ============================================================================
-- Respuesta de Margiory (nov. 2026, punto 5): cuando un almacén está en un
-- distrito sin tarifa propia pero de una zona ya configurada, el sistema
-- propone la tarifa de la zona, Administración la valida y desde ahí se
-- reutiliza para los siguientes servicios con las mismas condiciones.
--
-- Solo simulación (módulo Pruebas). Se escribe y lee únicamente desde
-- /api/pruebas/* con service role: RLS activo y sin políticas.

CREATE TABLE IF NOT EXISTS public.pruebas_tarifas_distrito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona text NOT NULL,
  distrito text NOT NULL,
  -- Clave sin tildes ni mayúsculas para no duplicar «Pachacámac» / «PACHACAMAC»
  distrito_clave text NOT NULL,
  -- GEN contenedor carga general · IMO contenedor IMO/IQBF · DES despacho carga suelta
  producto text NOT NULL CHECK (producto IN ('GEN', 'IMO', 'DES')),
  monto numeric(10, 2) NOT NULL CHECK (monto > 0),
  aprobado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  aprobado_por_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zona, distrito_clave, producto)
);

ALTER TABLE public.pruebas_tarifas_distrito ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pruebas_tarifas_distrito FROM anon, authenticated;
