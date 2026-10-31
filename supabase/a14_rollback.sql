-- ============================================================================
-- ROLLBACK A14: deja las 12 tablas abiertas como estaban
-- ============================================================================
-- Usar solo si 20261030000001_a14_cerrar_tablas_abiertas.sql rompe la app.
-- Vuelve a exponer registros y demás tablas sin sesión: es un parche temporal.

BEGIN;

GRANT ALL ON TABLE
  public.registros,
  public.categorias,
  public.clientes,
  public.conductores,
  public.reglas_imputacion,
  public.carretas,
  public.locaciones,
  public.automatizacion_config,
  public.automatizacion_alertas_log,
  public.service_locations,
  public.geoenlaces_historial,
  public.system_updates
TO anon;

-- Sin RLS, sin políticas que revisar: lo más permisivo garantiza que la app vuelva a funcionar.
ALTER TABLE public.categorias DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conductores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas_imputacion DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.carretas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.locaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.automatizacion_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.automatizacion_alertas_log DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Personal lee registros" ON public.registros;
DROP POLICY IF EXISTS "Personal lee categorias" ON public.categorias;
DROP POLICY IF EXISTS "Personal lee clientes" ON public.clientes;
DROP POLICY IF EXISTS "Personal lee conductores" ON public.conductores;
DROP POLICY IF EXISTS "Personal lee reglas_imputacion" ON public.reglas_imputacion;
DROP POLICY IF EXISTS "Personal lee carretas" ON public.carretas;
DROP POLICY IF EXISTS "Personal lee locaciones" ON public.locaciones;
DROP POLICY IF EXISTS "Personal lee service_locations" ON public.service_locations;
DROP POLICY IF EXISTS "Autenticados insertan service_locations" ON public.service_locations;
DROP POLICY IF EXISTS "Autenticados leen geoenlaces_historial" ON public.geoenlaces_historial;
DROP POLICY IF EXISTS "Autenticados insertan geoenlaces_historial" ON public.geoenlaces_historial;
DROP POLICY IF EXISTS "Autenticados leen system_updates" ON public.system_updates;

-- DROP previo: el script funciona haya o no corrido la migración.
DROP POLICY IF EXISTS "Users can view all registros" ON public.registros;
DROP POLICY IF EXISTS "conductor insert" ON public.service_locations;
DROP POLICY IF EXISTS "staff read" ON public.service_locations;
DROP POLICY IF EXISTS "historial select" ON public.geoenlaces_historial;
DROP POLICY IF EXISTS "historial insert" ON public.geoenlaces_historial;
DROP POLICY IF EXISTS "Anyone can view system updates" ON public.system_updates;

CREATE POLICY "Users can view all registros" ON public.registros
  FOR SELECT USING (true);
CREATE POLICY "conductor insert" ON public.service_locations
  FOR INSERT WITH CHECK (true);
CREATE POLICY "staff read" ON public.service_locations
  FOR SELECT USING (true);
CREATE POLICY "historial select" ON public.geoenlaces_historial
  FOR SELECT USING (true);
CREATE POLICY "historial insert" ON public.geoenlaces_historial
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view system updates" ON public.system_updates
  FOR SELECT USING (true);

COMMIT;
