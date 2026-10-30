-- ============================================================================
-- DIAGNÓSTICO A14: solo lectura, no cambia nada ni toma bloqueos de escritura
-- ============================================================================
-- Muestra por qué REVOKE y RLS no surtieron efecto en el ensayo: dueño de cada
-- tabla, permisos reales (acl), políticas, roles y event triggers.

WITH tablas AS (
  SELECT unnest(ARRAY[
    'registros', 'categorias', 'clientes', 'conductores', 'reglas_imputacion',
    'carretas', 'locaciones', 'automatizacion_config', 'automatizacion_alertas_log',
    'service_locations', 'geoenlaces_historial', 'system_updates'
  ]) AS nombre
)
SELECT 1 AS orden, 'sesion' AS seccion, current_user::TEXT AS objeto,
  format('session_user=%s', session_user) AS detalle

UNION ALL
SELECT 2, 'tabla', c.relname::TEXT,
  format(
    'kind=%s owner=%s rls=%s force=%s anon_select=%s auth_select=%s acl=%s',
    c.relkind,
    pg_get_userbyid(c.relowner),
    c.relrowsecurity,
    c.relforcerowsecurity,
    has_table_privilege('anon', c.oid, 'SELECT'),
    has_table_privilege('authenticated', c.oid, 'SELECT'),
    c.relacl::TEXT
  )
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN tablas t ON t.nombre = c.relname
WHERE n.nspname = 'public'

UNION ALL
SELECT 3, 'rol', r.rolname::TEXT,
  format(
    'super=%s bypassrls=%s inherit=%s miembro_de=%s',
    r.rolsuper,
    r.rolbypassrls,
    r.rolinherit,
    (
      SELECT string_agg(g.rolname, ', ')
      FROM pg_auth_members m
      JOIN pg_roles g ON g.oid = m.roleid
      WHERE m.member = r.oid
    )
  )
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'authenticator', 'service_role', 'postgres')

UNION ALL
SELECT 4, 'politica', p.tablename::TEXT,
  format('%s | %s | %s | roles=%s | using=%s', p.policyname, p.cmd, p.permissive, p.roles, p.qual)
FROM pg_policies p
JOIN tablas t ON t.nombre = p.tablename
WHERE p.schemaname = 'public'

UNION ALL
SELECT 5, 'event_trigger', e.evtname::TEXT,
  format('evento=%s enabled=%s fn=%s', e.evtevent, e.evtenabled, e.evtfoid::REGPROC)
FROM pg_event_trigger e

ORDER BY 1, 3, 4;
