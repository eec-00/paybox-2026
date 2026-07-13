
# Hitos operativos y evidencia fotográfica

### Configuración en Odoo para app de conductores

*Documento de trabajo para validación operativa y técnica*

## 1. Objetivo

Definir un catálogo estándar de hitos operativos en Odoo para que la app de conductores muestre únicamente los hitos que correspondan al tipo de servicio. La lógica debe evitar pedir fotos innecesarias, pero asegurar evidencia en los puntos críticos de retiro, carga, descarga, entrega y devolución.

## 2. Reglas generales para la app

- **Odoo alimenta la app:** los datos de los servicios e hitos deben salir de Odoo.
- **Visibilidad por flujo:** la app no debe mostrar siempre todos los hitos; debe mostrarlos según el tipo de servicio / flujo operativo.
- **Hora y GPS:** todos los hitos marcados desde la app deberían registrar hora y ubicación GPS.
- **Foto obligatoria solo en hitos críticos:** retiro, carga, descarga, entrega, devolución, precinto, documento o condición física de contenedor/isotanque/mercadería.
- **Foto opcional:** debería poder subirse en cualquier hito si hay una incidencia.
- **Valor 00:00:** si Odoo muestra 00:00 por defecto, la app no debe interpretarlo como hora real salvo que el hito haya sido marcado efectivamente.

## 3. Tipos de servicio / flujo operativo

- Importación contenedor
- Exportación contenedor
- Despacho / recojo / carga suelta
- Traslado interno
- Isotanque lleno
- Isotanque vacío
- Solo devolución contenedor vacío

## 4. Catálogo maestro de hitos operativos

Este catálogo contiene todos los hitos estándar que se crearán en Odoo. Después, por visibilidad condicional, cada tipo de servicio mostrará solo los hitos que le correspondan.

| Nº | Hito estándar                              | Servicios donde aparece                                           | Foto                                          | Evidencia / criterio                                                                                                     |
| --- | ------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Inicio de ruta                              | Todos los servicios                                               | No obligatoria                                | Hora + GPS. Foto opcional solo si se quiere evidencia de unidad al inicio.                                               |
| 2   | Llegada/cola en almacén de retiro          | Importación contenedor / Exportación contenedor                 | No                                            | Hora + GPS.                                                                                                              |
| 3   | Ingreso almacén de retiro                  | Importación contenedor / Exportación contenedor                 | No                                            | Hora + GPS.                                                                                                              |
| 4   | Salida almacén de retiro                   | Importación contenedor / Exportación contenedor                 | Sí, obligatoria                              | Foto del contenedor retirado, número visible, estado exterior y precinto si aplica.                                     |
| 5   | Llegada a cliente                           | Importación contenedor / Exportación contenedor                 | No                                            | Hora + GPS.                                                                                                              |
| 6   | Ingreso a cliente                           | Importación contenedor / Exportación contenedor                 | No                                            | Hora + GPS.                                                                                                              |
| 7   | Inicio descarga                             | Importación contenedor / Despacho, recojo o carga suelta         | Sí en importación; opcional en carga suelta | En importación: foto antes de abrir, precinto visible si aplica. En carga suelta: opcional salvo exigencia del cliente. |
| 8   | Fin descarga                                | Importación contenedor / Despacho, recojo o carga suelta         | Sí, obligatoria                              | Foto del contenedor descargado, mercadería entregada o evidencia de conformidad.                                        |
| 9   | Inicio carga                                | Exportación contenedor / Despacho, recojo o carga suelta         | Sí, obligatoria                              | Foto del contenedor vacío antes de cargar o mercadería al inicio de carga.                                             |
| 10  | Fin carga                                   | Exportación contenedor / Despacho, recojo o carga suelta         | Sí, obligatoria                              | Foto de carga finalizada, contenedor cerrado, mercadería asegurada y precinto si aplica.                                |
| 11  | Salida de cliente                           | Importación contenedor / Exportación contenedor                 | No                                            | Hora + GPS. Foto opcional si hay incidencia.                                                                             |
| 12  | Llegada a terminal/almacén destino         | Exportación contenedor                                           | No                                            | Hora + GPS.                                                                                                              |
| 13  | Ingreso terminal/almacén destino           | Exportación contenedor                                           | No                                            | Hora + GPS.                                                                                                              |
| 14  | Entrega contenedor lleno                    | Exportación contenedor                                           | Sí, obligatoria                              | Foto de ticket, EIR, constancia o documento de recepción.                                                               |
| 15  | Llegada a punto de carga                    | Despacho / recojo / carga suelta                                  | No                                            | Hora + GPS.                                                                                                              |
| 16  | Ingreso a punto de carga                    | Despacho / recojo / carga suelta                                  | No                                            | Hora + GPS.                                                                                                              |
| 17  | Salida origen                               | Despacho / recojo / carga suelta                                  | No                                            | Hora + GPS.                                                                                                              |
| 18  | Llegada destino                             | Despacho / carga suelta / Isotanque lleno / Isotanque vacío      | No                                            | Hora + GPS.                                                                                                              |
| 19  | Ingreso destino                             | Despacho / carga suelta / Isotanque lleno / Isotanque vacío      | No                                            | Hora + GPS.                                                                                                              |
| 20  | Salida destino                              | Despacho / carga suelta / Isotanque lleno                         | No                                            | Hora + GPS.                                                                                                              |
| 21  | Llegada punto A                             | Traslado interno                                                  | No                                            | Hora + GPS.                                                                                                              |
| 22  | Ingreso punto A                             | Traslado interno                                                  | No                                            | Hora + GPS.                                                                                                              |
| 23  | Inicio operación punto A                   | Traslado interno                                                  | Opcional                                      | Foto opcional si ayuda a evidenciar condición inicial o incidencia.                                                     |
| 24  | Fin operación punto A                      | Traslado interno                                                  | Sí, obligatoria                              | Evidencia de lo recogido, terminado o cerrado en origen.                                                                 |
| 25  | Salida punto A                              | Traslado interno                                                  | No                                            | Hora + GPS.                                                                                                              |
| 26  | Llegada punto B                             | Traslado interno                                                  | No                                            | Hora + GPS.                                                                                                              |
| 27  | Ingreso punto B                             | Traslado interno                                                  | No                                            | Hora + GPS.                                                                                                              |
| 28  | Inicio operación punto B                   | Traslado interno                                                  | Opcional                                      | Foto opcional si ayuda a evidenciar condición inicial o incidencia.                                                     |
| 29  | Fin operación punto B                      | Traslado interno                                                  | Sí, obligatoria                              | Evidencia de entrega, cierre o conformidad en destino.                                                                   |
| 30  | Llegada a retiro                            | Isotanque lleno / Isotanque vacío                                | No                                            | Hora + GPS.                                                                                                              |
| 31  | Ingreso a retiro                            | Isotanque lleno / Isotanque vacío                                | No                                            | Hora + GPS.                                                                                                              |
| 32  | Retiro/enganche isotanque                   | Isotanque lleno                                                   | Sí, obligatoria                              | Foto del isotanque, número, estado y precintos si aplica.                                                               |
| 33  | Retiro isotanque vacío                     | Isotanque vacío                                                  | Sí, obligatoria                              | Foto del isotanque y número.                                                                                            |
| 34  | Salida retiro                               | Isotanque lleno / Isotanque vacío                                | No                                            | Hora + GPS.                                                                                                              |
| 35  | Inicio descarga/entrega                     | Isotanque lleno                                                   | Condicional                                   | Foto solo si el cliente/planta lo permite. Si no permite fotos, marcar excepción y observación.                        |
| 36  | Fin descarga/entrega                        | Isotanque lleno                                                   | Sí, obligatoria                              | Foto de constancia, ticket o documento de entrega.                                                                       |
| 37  | Entrega isotanque vacío                    | Isotanque vacío                                                  | Sí, obligatoria                              | Foto de constancia o evidencia de entrega.                                                                               |
| 38  | Llegada a almacén/depósito de devolución | Importación con devolución / Solo devolución contenedor vacío | No                                            | Hora + GPS.                                                                                                              |
| 39  | Ingreso a almacén/depósito de devolución | Importación con devolución / Solo devolución contenedor vacío | No                                            | Hora + GPS.                                                                                                              |
| 40  | Contenedor vacío devuelto                  | Importación con devolución / Solo devolución contenedor vacío | Sí, obligatoria                              | Foto del EIR, constancia o evidencia de devolución.                                                                     |
| 41  | Servicio finalizado                         | Todos los servicios                                               | No obligatoria                                | Cierre del servicio. Hora + GPS.                                                                                         |

## 5. Flujos visibles por tipo de servicio

### Importación contenedor

| Orden | Hito visible en app                         | Foto             |
| ----- | ------------------------------------------- | ---------------- |
| 1     | Inicio de ruta                              | No               |
| 2     | Llegada/cola en almacén de retiro          | No               |
| 3     | Ingreso almacén de retiro                  | No               |
| 4     | Salida almacén de retiro                   | Sí, obligatoria |
| 5     | Llegada a cliente                           | No               |
| 6     | Ingreso a cliente                           | No               |
| 7     | Inicio descarga                             | Sí, obligatoria |
| 8     | Fin descarga                                | Sí, obligatoria |
| 9     | Salida de cliente                           | No               |
| 10    | Llegada a almacén/depósito de devolución | No               |
| 11    | Ingreso a almacén/depósito de devolución | No               |
| 12    | Contenedor vacío devuelto                  | Sí, obligatoria |
| 13    | Servicio finalizado                         | No               |

### Exportación contenedor

| Orden | Hito visible en app                 | Foto             |
| ----- | ----------------------------------- | ---------------- |
| 1     | Inicio de ruta                      | No               |
| 2     | Llegada/cola en almacén de retiro  | No               |
| 3     | Ingreso almacén de retiro          | No               |
| 4     | Salida almacén de retiro           | Sí, obligatoria |
| 5     | Llegada a cliente                   | No               |
| 6     | Ingreso a cliente                   | No               |
| 7     | Inicio carga                        | Sí, obligatoria |
| 8     | Fin carga                           | Sí, obligatoria |
| 9     | Salida de cliente                   | No               |
| 10    | Llegada a terminal/almacén destino | No               |
| 11    | Ingreso terminal/almacén destino   | No               |
| 12    | Entrega contenedor lleno            | Sí, obligatoria |
| 13    | Servicio finalizado                 | No               |

### Despacho / recojo / carga suelta

| Orden | Hito visible en app      | Foto                                  |
| ----- | ------------------------ | ------------------------------------- |
| 1     | Inicio de ruta           | No                                    |
| 2     | Llegada a punto de carga | No                                    |
| 3     | Ingreso a punto de carga | No                                    |
| 4     | Inicio carga             | Sí, obligatoria                      |
| 5     | Fin carga                | Sí, obligatoria                      |
| 6     | Salida origen            | No                                    |
| 7     | Llegada destino          | No                                    |
| 8     | Ingreso destino          | No                                    |
| 9     | Inicio descarga          | Opcional, salvo exigencia del cliente |
| 10    | Fin descarga             | Sí, obligatoria                      |
| 11    | Salida destino           | No                                    |
| 12    | Servicio finalizado      | No                                    |

### Traslado interno

| Orden | Hito visible en app       | Foto             |
| ----- | ------------------------- | ---------------- |
| 1     | Inicio de ruta            | No               |
| 2     | Llegada punto A           | No               |
| 3     | Ingreso punto A           | No               |
| 4     | Inicio operación punto A | Opcional         |
| 5     | Fin operación punto A    | Sí, obligatoria |
| 6     | Salida punto A            | No               |
| 7     | Llegada punto B           | No               |
| 8     | Ingreso punto B           | No               |
| 9     | Inicio operación punto B | Opcional         |
| 10    | Fin operación punto B    | Sí, obligatoria |
| 11    | Servicio finalizado       | No               |

### Isotanque lleno

| Orden | Hito visible en app       | Foto                                         |
| ----- | ------------------------- | -------------------------------------------- |
| 1     | Inicio de ruta            | No                                           |
| 2     | Llegada a retiro          | No                                           |
| 3     | Ingreso a retiro          | No                                           |
| 4     | Retiro/enganche isotanque | Sí, obligatoria                             |
| 5     | Salida retiro             | No                                           |
| 6     | Llegada destino           | No                                           |
| 7     | Ingreso destino           | No                                           |
| 8     | Inicio descarga/entrega   | Condicional según permiso de cliente/planta |
| 9     | Fin descarga/entrega      | Sí, obligatoria                             |
| 10    | Salida destino            | No                                           |
| 11    | Servicio finalizado       | No                                           |

### Isotanque vacío

| Orden | Hito visible en app      | Foto             |
| ----- | ------------------------ | ---------------- |
| 1     | Inicio de ruta           | No               |
| 2     | Llegada a retiro         | No               |
| 3     | Ingreso a retiro         | No               |
| 4     | Retiro isotanque vacío  | Sí, obligatoria |
| 5     | Salida retiro            | No               |
| 6     | Llegada destino          | No               |
| 7     | Ingreso destino          | No               |
| 8     | Entrega isotanque vacío | Sí, obligatoria |
| 9     | Servicio finalizado      | No               |

### Solo devolución contenedor vacío

| Orden | Hito visible en app                         | Foto             |
| ----- | ------------------------------------------- | ---------------- |
| 1     | Inicio de ruta                              | No               |
| 2     | Llegada a almacén/depósito de devolución | No               |
| 3     | Ingreso a almacén/depósito de devolución | No               |
| 4     | Contenedor vacío devuelto                  | Sí, obligatoria |
| 5     | Servicio finalizado                         | No               |

## 6. Consideración especial: devolución de vacío en importaciones

- **Mismo conductor:** los hitos de devolución aparecen dentro del servicio principal de importación.
- **Otro conductor:** los hitos de devolución no deberían aparecer en el servicio principal. La devolución se gestiona como servicio operativo separado, vinculado al servicio original.
- **Cliente devuelve:** no se muestran hitos de devolución para el conductor; puede quedar solo una observación operativa o estado de devolución.

## 7. Configuración técnica sugerida

- Cada hito debería tener configuración de visibilidad por tipo de servicio.
- Cada hito debería indicar si requiere GPS, foto obligatoria, foto opcional y excepción por foto no permitida.
- La lógica de foto obligatoria no debería quedar "quemada" en la app si se puede parametrizar desde Odoo.
- La app debería permitir adjuntar más de una foto en hitos críticos y observación cuando exista incidencia.

*Versión de trabajo - julio 2026*
