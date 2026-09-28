# Reglas para trabajar en este proyecto

## Publicar actualizaciones del sistema

Cada vez que implementemos algo **mediano o grande a nivel de desarrollo**
(una funcionalidad nueva, un cambio de flujo que los usuarios van a notar, una
corrección importante de un bug que afectaba el uso diario), hay que publicarlo
como una **actualización del sistema** en el módulo de Actualizaciones, para
que los usuarios se enteren. Esto es una instrucción permanente del usuario:
no hace falta preguntar cada vez si se publica o no — se publica, y después se
avisa en el chat que se publicó.

No aplica a cosas chicas: un ajuste de estilo, un typo, un refactor interno
sin efecto visible, un fix de algo que ni se había notado. Ante la duda, mejor
publicarla — es preferible que se enteren de más a que se enteren de menos.

**Importante:** se publica cuando el cambio ya está en producción (deployado
en `paybox.eemersonsac.com`), no apenas se termina de programar en local. Este
proyecto separa código local de lo deployado (ver convención de pedir permiso
antes de commitear/pushear) — anunciar algo que los usuarios todavía no tienen
sería confuso. Si se hizo el cambio pero no se sabe si ya está en producción,
preguntar antes de publicar la actualización (esta sí es una excepción donde
conviene confirmar).

### Cómo se publica

Va en la tabla `system_updates` de Supabase (la misma que llena
`components/UpdatesManagement.tsx` para developers). Insertar una fila con:

- `title`: título corto y claro (nada técnico), ej. "Geoenlaces automáticos por servicio".
- `category`: `'feature'` (algo nuevo), `'improvement'` (mejora de algo que ya existía),
  `'bugfix'` (corrección de un problema) o `'general'` si no calza en ninguna.
- `version`: dejar `null` salvo que el usuario dé un número de versión.
- `description`: el texto con el patrón de abajo.

Insertar con el cliente admin de Supabase (`createAdminClient()` de
`lib/supabase/admin.ts`, o un script puntual con `SUPABASE_SERVICE_ROLE_KEY`),
ya que la política RLS de escritura solo deja escribir a `role = 'developer'`
y el admin bypassa esa RLS. `created_by` puede quedar en `null`.

### Patrón del texto (campo `description`)

Nada técnico — lo va a leer gente que no programa. Ni una línea telegráfica
ni un ensayo: un párrafo corto por sección alcanza.

```
MÓDULO: <en qué parte de la app está, tal como el usuario la conoce — ej. "Servicios > Trailers", "Geoenlaces">

USUARIOS BENEFICIADOS O AFECTADOS: <quién nota el cambio — ej. "Coordinadores y administradores", "Conductores", "Todos los usuarios">

COSAS NUEVAS: <qué pueden hacer ahora que antes no podían, o qué se corrigió, explicado en 2-4 oraciones simples, en términos de lo que ven y usan, no de cómo está hecho por dentro>
```

Ejemplo real (no inventar datos — este es solo el formato):

```
MÓDULO: Servicios > Trailers

USUARIOS BENEFICIADOS O AFECTADOS: Administradores y coordinadores con acceso a Servicios

COSAS NUEVAS: Ahora se puede finalizar un servicio directamente desde la tabla, sin depender
de que el conductor lo cierre desde su celular. Útil para cuando un conductor dejó un servicio
a medias y no sabe cómo terminarlo en la app. Por seguridad, antes de confirmar pide escribir
el código del servicio (ej. S03117), tanto para esta acción como para "Reiniciar servicio".
```

Después de publicarla, avisar en el chat en una línea (ej. "Publiqué la
actualización en el módulo de Actualizaciones") — sin repetir el contenido
completo salvo que el usuario lo pida.
