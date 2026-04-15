**Navitel GPS — Mapa de API Endpoints

Extraído de index2.js y app.js | Eemerson SAC

Base URL: CONFIG.apiUrl  (ej: https://control.navitelgps.com/api-v2/)

# 1. Estructura de cada Request

Todos los endpoints usan POST con JSON. El payload siempre incluye hash (session key):

POST  {BASE_URL}/{endpoint}

Headers: { Content-Type: application/json }

Body:    { hash: "SESSION_KEY", ...params }

Response: { "list": [...] }  o  { "value": ... }  o  { "success": true }

# 2. Rastreadores (Trackers)

| Endpoint                                                             | Respuesta clave | Método HTTP | Descripción                                                   |
| -------------------------------------------------------------------- | --------------- | ------------ | -------------------------------------------------------------- |
| -------------------------------------------------------------------- |                 |              |                                                                |
| tracker/list                                                         | list            | POST         | Lista todos los rastreadores del grupo                         |
| -                                                                    | -               | -            | -                                                              |
| tracker/get_states                                                   | states          | POST         | Estado actual de cada tracker (online/offline, GPS, velocidad) |
| tracker/get_counters                                                 | list            | POST         | Contadores de cada tracker (odómetro, horas motor)            |
| tracker/counter/value/get                                            | value           | POST         | Valor específico de un contador por tracker                   |
| tracker/sensor/list                                                  | list            | POST         | Lista los sensores configurados de un tracker                  |
| tracker/group/list                                                   | list            | POST         | Lista grupos de rastreadores                                   |
| tracker/read                                                         | value           | POST         | Lee datos completos de un tracker específico                  |
| tracker/tags/set                                                     | success         | POST         | Asigna tags a un tracker                                       |
| tracker/rule/list                                                    | list            | POST         | Lista reglas/alertas configuradas de un tracker                |
| tracker/stats/mileage/read                                           | result          | POST         | Estadísticas de kilometraje por rango de fechas               |

# 3. Geocercas (Zones)

| Endpoint                                                               | Respuesta clave | Método HTTP | Descripción                                |
| ---------------------------------------------------------------------- | --------------- | ------------ | ------------------------------------------- |
| ---------------------------------------------------------------------- |                 |              |                                             |
| zone/list                                                              | list            | POST         | Lista todas las geocercas (56 en tu cuenta) |
| -                                                                      | -               | -            | -                                           |
| zone/update                                                            | success         | POST         | Actualiza datos o tags de una geocerca      |

Los eventos de entrada/salida de geocercas se consultan en history/tracker/list filtrando por tipo de evento (ver sección 5).

# 4. Notificaciones e Historial (clave para geocercas)

| Endpoint                                                                                                                | Respuesta clave | Método HTTP | Descripción                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | --------------- | ------------ | --------------------------------------------------------------------------------- |
| ----------------------------------------------------------------------------------------------------------------------- |                 |              |                                                                                   |
| history/tracker/list                                                                                                    | list            | POST         | Historial de eventos de un tracker (entradas/salidas de geocercas, alertas, etc.) |
| -                                                                                                                       | -               | -            | -                                                                                 |
| history/unread/list                                                                                                     | list            | POST         | Lista notificaciones no leidas                                                    |
| history/unread/count                                                                                                    | value           | POST         | Cantidad de notificaciones sin leer                                               |
| history/read                                                                                                            | value           | POST         | Lee el detalle completo de una notificacion específica                           |
| history/mark_read                                                                                                       | success         | POST         | Marca una notificacion como leida                                                 |
| history/mark_read_all                                                                                                   | success         | POST         | Marca todas las notificaciones como leidas                                        |

Payload sugerido para history/tracker/list (entrada a geocerca):

{

  "hash": "TU_SESSION_KEY",

  "tracker_id": 12345,

  "from": "2025-01-01 00:00:00",

  "to": "2025-01-31 23:59:59",

  "type": "zone_in"   // o "zone_out"

}

# 5. Reglas y Alertas

| Endpoint                                                                               | Respuesta clave | Método HTTP | Descripción                                        |
| -------------------------------------------------------------------------------------- | --------------- | ------------ | --------------------------------------------------- |
| -------------------------------------------------------------------------------------- |                 |              |                                                     |
| tracker/rule/list                                                                      | list            | POST         | Lista todas las reglas configuradas para un tracker |
| -                                                                                      | -               | -            | -                                                   |
| status/tracker/list                                                                    | value           | POST         | Estados personalizados de trackers                  |

Las reglas son las condiciones que generan notificaciones (ej: 'si entra a geocerca X, notificar'). Se configuran en la UI y se consultan vía tracker/rule/list.

# 6. Vehículos

| Endpoint                                                            | Respuesta clave | Método HTTP | Descripción                          |
| ------------------------------------------------------------------- | --------------- | ------------ | ------------------------------------- |
| ------------------------------------------------------------------- |                 |              |                                       |
| vehicle/list                                                        | list            | POST         | Lista todos los vehículos vinculados |
| -                                                                   | -               | -            | -                                     |
| vehicle/read                                                        | value           | POST         | Lee datos completos de un vehículo   |
| vehicle/update                                                      | success         | POST         | Actualiza datos de un vehículo       |
| vehicle/service_task/create                                         | success         | POST         | Crea tarea de mantenimiento           |
| vehicle/service_task/update                                         | success         | POST         | Actualiza tarea de mantenimiento      |

# 7. Empleados y Conductores

| Endpoint                                                             | Respuesta clave | Método HTTP | Descripción                           |
| -------------------------------------------------------------------- | --------------- | ------------ | -------------------------------------- |
| -------------------------------------------------------------------- |                 |              |                                        |
| employee/list                                                        | list            | POST         | Lista todos los empleados/conductores  |
| -                                                                    | -               | -            | -                                      |
| employee/read                                                        | value           | POST         | Lee datos de un empleado específico   |
| employee/update                                                      | success         | POST         | Actualiza datos de un empleado         |
| driver/journal/entry/list                                            | list            | POST         | Lista entradas del diario de conductor |
| driver/journal/entry/create                                          | success         | POST         | Crea entrada en el diario              |
| driver/journal/entry/update                                          | success         | POST         | Actualiza entrada del diario           |
| driver/journal/entry/delete                                          | success         | POST         | Elimina entrada del diario             |
| driver/journal/proposal/list                                         | list            | POST         | Lista propuestas del diario            |
| driver/journal/entry/download/                                       | success         | POST         | Descarga reporte del diario            |
| checkin/read                                                         | value           | POST         | Lee datos de checkin del conductor     |

# 8. Tareas y Rutas

| Endpoint                                                  | Respuesta clave | Método HTTP | Descripción             |
| --------------------------------------------------------- | --------------- | ------------ | ------------------------ |
| --------------------------------------------------------- |                 |              |                          |
| task/list                                                 | list            | POST         | Lista tareas asignadas   |
| -                                                         | -               | -            | -                        |
| task/read                                                 | value           | POST         | Lee detalle de una tarea |
| task/update                                               | success         | POST         | Actualiza una tarea      |
| task/route/list                                           | list            | POST         | Lista rutas de tareas    |

# 9. Usuario y Sesión

| Endpoint                                                               | Respuesta clave | Método HTTP | Descripción                          |
| ---------------------------------------------------------------------- | --------------- | ------------ | ------------------------------------- |
| ---------------------------------------------------------------------- |                 |              |                                       |
| user/get_info                                                          | (raiz)          | POST         | Info completa del usuario autenticado |
| -                                                                      | -               | -            | -                                     |
| user/settings/read                                                     | value           | POST         | Lee configuracion de usuario          |
| user/settings/update                                                   | success         | POST         | Actualiza configuracion               |
| user/settings/ui/read                                                  | value           | POST         | Lee configuracion de interfaz         |
| user/settings/ui/update                                                | success         | POST         | Actualiza configuracion de interfaz   |
| user/files                                                             | list            | POST         | Archivos del usuario                  |
| user/audit/log/list                                                    | list            | POST         | Log de auditoria del usuario          |
| user/audit/log/list_restrictions                                       | constraints     | POST         | Restricciones del log de auditoria    |
| user/audit/checkin                                                     | null            | POST         | Registrar checkin de auditoria        |
| subuser/list                                                           | list            | POST         | Lista subusuarios                     |
| subuser/security_group/list                                            | list            | POST         | Lista grupos de seguridad             |
| dealer/get_ui_config                                                   | (raiz)          | POST         | Configuracion UI del dealer (dominio) |
| feedback/send_email                                                    | success         | POST         | Enviar email de soporte               |

# 10. Lugares, Tags y Otros

| Endpoint                                                  | Respuesta clave | Método HTTP | Descripción               |
| --------------------------------------------------------- | --------------- | ------------ | -------------------------- |
| --------------------------------------------------------- |                 |              |                            |
| place/read                                                | value           | POST         | Lee un lugar guardado      |
| -                                                         | -               | -            | -                          |
| place/update                                              | success         | POST         | Actualiza un lugar         |
| tag/list                                                  | list            | POST         | Lista todos los tags       |
| tag/search                                                | list            | POST         | Busca tags por texto       |
| tag/create                                                | success         | POST         | Crea un nuevo tag          |
| tag/update                                                | success         | POST         | Actualiza un tag           |
| tag/delete                                                | success         | POST         | Elimina un tag             |
| garage/list                                               | list            | POST         | Lista garages configurados |
| tariff/list                                               | list            | POST         | Lista tarifas disponibles  |

# 11. Facturación y Pagos

| Endpoint                                                  | Respuesta clave | Método HTTP | Descripción                      |
| --------------------------------------------------------- | --------------- | ------------ | --------------------------------- |
| --------------------------------------------------------- |                 |              |                                   |
| bill/list                                                 | list            | POST         | Lista facturas                    |
| -                                                         | -               | -            | -                                 |
| bill/create                                               | success         | POST         | Crea una factura                  |
| act/list                                                  | list            | POST         | Lista actos/documentos            |
| transaction/list                                          | list            | POST         | Lista transacciones               |
| payment_system/list                                       | list            | POST         | Lista metodos de pago disponibles |
| payment_system/estimate/get                               | value           | POST         | Estima costo de un pago           |
| payment_system/auto_payment/read                          | value           | POST         | Lee config de pago automatico     |
| payment_system/auto_payment/update                        | success         | POST         | Actualiza pago automatico         |
| payment_system/auto_payment/cancel                        | success         | POST         | Cancela pago automatico           |
| payment_system/stripe/intent/create                       | value           | POST         | Crea intent de pago Stripe        |
| payment_system/stripe/pay                                 | success         | POST         | Procesa pago con Stripe           |
| payment_system/stripe/token/bind                          | success         | POST         | Vincula token Stripe              |
| payment_system/yookassa/pay                               | success         | POST         | Procesa pago YooKassa             |

# 12. Estrategia Recomendada: Detectar llegada de trailer a geocerca

Para integrar Navitel con PayBox/Gestion de Trailers, el flujo optimo es:

Paso 1 — Obtener lista de geocercas y trackers al iniciar sesión

POST zone/list       → guardar geocercas en memoria

POST tracker/list    → guardar trackers en memoria

Paso 2 — Polling cada 30-60 segundos para detectar eventos

POST history/unread/count  → si count > 0, consultar eventos

POST history/unread/list   → obtener eventos nuevos

POST history/mark_read_all → marcar como leidos

Paso 3 — Filtrar eventos de tipo geocerca en el response

// En el response de history/unread/list buscar:

event.type === "zone_in"   // Trailer entró a geocerca

event.type === "zone_out"  // Trailer salió de geocerca

event.zone_id              // ID de la geocerca

event.tracker_id           // ID del trailer

Paso 4 — Capturar el response real con este script en Console

Pega esto en la consola de Navitel, ve a Notificaciones y captura el JSON real para conocer los campos exactos del response:

const _f = window.fetch;

window.fetch = async (...a) => {

  const r = await _f(...a);

  if (String(a[0]).includes('history')) {

    r.clone().json().then(d => console.log(JSON.stringify(d,null,2)));

  }

  return r;

};

**
