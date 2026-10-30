-- ============================================================================
-- A14: Cerrar tablas legibles sin sesión
-- ============================================================================
-- Hasta ahora estas 12 tablas devolvían filas solo con la anon key, que viaja
-- al navegador. Queda así:
--   - anon: sin acceso a ninguna (REVOKE, sirve aunque quede una política abierta).
--   - Personal (todo rol menos conductor): lee finanzas, catálogos y ubicaciones.
--   - Conductor: no lee nada de eso; sigue insertando su ubicación.
--   - automatizacion_*: sin políticas, solo service role (crons y API).
-- Las rutas server con service role no se ven afectadas: ese rol ignora RLS.
-- Reversible con supabase/a14_rollback.sql.

-- 1. Bloquear anon
REVOKE ALL ON TABLE
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
FROM anon;

-- 2. Activar RLS (no hace nada si ya estaba activo)
ALTER TABLE public.registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas_imputacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carretas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automatizacion_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automatizacion_alertas_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geoenlaces_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_updates ENABLE ROW LEVEL SECURITY;

-- 3. Quitar políticas previas: varias tablas no nacieron en migraciones y pueden
-- tener alguna creada desde el dashboard. Las permisivas se suman con OR, así
-- que una sola USING (true) anularía las de abajo.
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        tablename IN (
          'categorias', 'clientes', 'conductores', 'reglas_imputacion',
          'carretas', 'locaciones', 'automatizacion_config', 'automatizacion_alertas_log'
        )
        OR (
          tablename IN ('registros', 'service_locations', 'geoenlaces_historial', 'system_updates')
          AND cmd = 'SELECT'
        )
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "conductor insert" ON public.service_locations;
DROP POLICY IF EXISTS "historial insert" ON public.geoenlaces_historial;

-- 4. Lectura para el personal
CREATE POLICY "Personal lee registros" ON public.registros
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) <> 'conductor');

CREATE POLICY "Personal lee categorias" ON public.categorias
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) <> 'conductor');

CREATE POLICY "Personal lee clientes" ON public.clientes
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) <> 'conductor');

CREATE POLICY "Personal lee conductores" ON public.conductores
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) <> 'conductor');

CREATE POLICY "Personal lee reglas_imputacion" ON public.reglas_imputacion
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) <> 'conductor');

CREATE POLICY "Personal lee carretas" ON public.carretas
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) <> 'conductor');

CREATE POLICY "Personal lee locaciones" ON public.locaciones
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) <> 'conductor');

CREATE POLICY "Personal lee service_locations" ON public.service_locations
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) <> 'conductor');

-- 5. Mismas reglas de antes, ahora solo con sesión
CREATE POLICY "Autenticados insertan service_locations" ON public.service_locations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Autenticados leen geoenlaces_historial" ON public.geoenlaces_historial
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Autenticados insertan geoenlaces_historial" ON public.geoenlaces_historial
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Autenticados leen system_updates" ON public.system_updates
  FOR SELECT TO authenticated
  USING (true);
