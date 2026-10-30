-- ============================================================================
-- ENSAYO A14: NO GUARDA NADA
-- ============================================================================
-- Generado desde la migracion 20261030000001. Correr en el SQL Editor de Supabase.
-- Termina con un error a proposito: ese error muestra el reporte y deshace todo.
-- No lleva COMMIT. Toma bloqueo breve de las tablas: correr en horario tranquilo.

BEGIN;

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

-- ============================================================================
-- Prueba como cada rol. Devuelve -1 cuando el rol no tiene permiso.
-- ============================================================================
CREATE FUNCTION pg_temp.contar(tabla TEXT, rol TEXT, uid UUID)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  original TEXT := current_user;
  n BIGINT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', rol)::TEXT, true);
  PERFORM set_config('role', rol, true);
  EXECUTE format('SELECT count(*) FROM public.%I', tabla) INTO n;
  PERFORM set_config('role', original, true);
  RETURN n;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN -1;
END;
$$;

-- Qué ve realmente cada rol dentro de esta transacción.
CREATE FUNCTION pg_temp.contexto(tabla TEXT, rol TEXT, uid UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  original TEXT := current_user;
  r TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', rol)::TEXT, true);
  PERFORM set_config('role', rol, true);
  r := format(
    'pedido=%s user=%s session=%s privilegio=%s rls_activa=%s row_security=%s',
    rol, current_user, session_user,
    has_table_privilege(current_user, ('public.' || tabla)::REGCLASS, 'SELECT'),
    row_security_active(('public.' || tabla)::REGCLASS),
    current_setting('row_security')
  );
  PERFORM set_config('role', original, true);
  RETURN r;
EXCEPTION WHEN OTHERS THEN
  RETURN format('pedido=%s error=%s', rol, SQLERRM);
END;
$$;

DO $$
DECLARE
  t TEXT;
  catalogo TEXT;
  contexto_txt TEXT := '';
  total BIGINT;
  a BIGINT;
  s BIGINT;
  c BIGINT;
  esperado_s BIGINT;
  esperado_c BIGINT;
  estado TEXT;
  fallos INT := 0;
  staff_id UUID;
  cond_id UUID;
  extras TEXT;
  reporte TEXT := '';
BEGIN
  SELECT id INTO staff_id FROM public.user_profiles WHERE role = 'user' LIMIT 1;
  SELECT id INTO cond_id FROM public.user_profiles WHERE role = 'conductor' LIMIT 1;

  FOREACH t IN ARRAY ARRAY[
    'registros', 'categorias', 'clientes', 'conductores', 'reglas_imputacion',
    'carretas', 'locaciones', 'service_locations', 'geoenlaces_historial',
    'system_updates', 'automatizacion_config', 'automatizacion_alertas_log'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO total;
    a := pg_temp.contar(t, 'anon', NULL);
    s := pg_temp.contar(t, 'authenticated', staff_id);
    c := pg_temp.contar(t, 'authenticated', cond_id);

    esperado_s := CASE WHEN t LIKE 'automatizacion_%' THEN 0 ELSE total END;
    esperado_c := CASE
      WHEN t IN ('geoenlaces_historial', 'system_updates') THEN total
      ELSE 0
    END;

    IF a = -1 AND s = esperado_s AND c = esperado_c THEN
      estado := 'OK';
    ELSE
      estado := 'FALLO';
      fallos := fallos + 1;
    END IF;

    reporte := reporte || format(
      E'%s %s: total=%s anon=%s personal=%s conductor=%s\n',
      estado, t, total, a, s, c
    );
  END LOOP;

  SELECT string_agg(tablename || ' / ' || policyname, ', ') INTO extras
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd = 'ALL'
    AND tablename IN (
      'registros', 'service_locations', 'geoenlaces_historial', 'system_updates'
    );

  FOREACH t IN ARRAY ARRAY['categorias', 'registros'] LOOP
    SELECT format(
      'rls=%s anon_select=%s acl=%s',
      c.relrowsecurity,
      has_table_privilege('anon', c.oid, 'SELECT'),
      c.relacl::TEXT
    ) INTO catalogo
    FROM pg_class c
    WHERE c.oid = ('public.' || t)::REGCLASS;

    contexto_txt := contexto_txt || format(
      E'[%s] %s\n  %s\n  %s\n',
      t, catalogo,
      pg_temp.contexto(t, 'anon', NULL),
      pg_temp.contexto(t, 'authenticated', cond_id)
    );
  END LOOP;

  -- El error final deshace todo: el ensayo nunca guarda cambios.
  RAISE EXCEPTION E'ENSAYO SIN CAMBIOS GUARDADOS | fallos=%\n%politicas ALL a revisar: %\n%',
    fallos, reporte, COALESCE(extras, 'ninguna'), contexto_txt;
END;
$$;
