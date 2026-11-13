# Propuesta: citas de retiro y devolución con fecha y hora

Hola equipo, les comparto una propuesta para revisarla juntos.

**Qué pasa hoy:** "Hora de cita" y "Hora de Devolución" guardan solo la hora, no el día. "Hora de Devolución" la creamos hace poco y todavía no está en Paybox. Para el día de devolución usamos aparte la "Fecha de la programación" de la subtarea. Son dos datos (fecha y hora) para algo que podría ser uno solo.

**Propuesta:**
1. Crear en Odoo dos campos nuevos con fecha y hora: **"Fecha y hora de cita de retiro"** y **"Fecha y hora de cita de devolución"**, y una casilla **"Cita de devolución SSEE"** para marcar cuando la cita es SSEE del depósito (la necesita el pago del ADHT). Los campos actuales no se tocan.
2. Paybox lee primero el campo nuevo y, si está vacío, el antiguo. Así nada se rompe.
3. Los datos actuales se copian automáticamente a los campos nuevos.
4. Operaciones llena solo los nuevos. Cuando todo esté probado, los antiguos se ocultan, sin borrarlos.

**Cuándo:** se podría hacer el **sábado en la noche o el domingo en la tarde**, cuando casi no hay servicios, para probar con calma con el equipo. La programación del lunes se haría **el domingo en la noche, después de las pruebas**, ya con los campos nuevos.

**Qué se probaría:** crear un servicio de prueba con las citas nuevas y revisar que se vean bien en la app del conductor, en los geoenlaces y en los reportes en Excel, y que los servicios antiguos sigan mostrando sus datos. Se necesitaría al menos una persona de Operaciones conectada.

¿Qué les parece? Si están de acuerdo, ¿qué día les acomoda más?

---

**Para quien crearía los campos en Odoo Studio (si se aprueba):**

Los tres van en la tarea del servicio (modelo Tarea, `project.task`).

| Etiqueta | Tipo en Studio | Dónde ponerlo |
| --- | --- | --- |
| Fecha y hora de cita de retiro | Fecha y hora | Junto a "Hora de cita" |
| Fecha y hora de cita de devolución | Fecha y hora | Sección Importación, junto a "Hora de Devolución" |
| Cita de devolución SSEE | Casilla de verificación | Debajo de "Fecha y hora de cita de devolución" |

- No usar los nombres "Cita de retiro" ni "Cita de devolución": ya existen en Odoo como **archivos adjuntos** (el PDF o la foto de la cita) y se confundirían.
- No modificar ni borrar "Hora de cita", "Hora de Devolución" ni "Fecha Máxima de Devolución" hasta terminar las pruebas.
- Al crearlos, pasar a TI el nombre técnico que asigna Studio (empieza con `x_studio_`).
