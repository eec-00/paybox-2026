# Citas de retiro y devolución con fecha y hora

Hola equipo, les cuento cómo vamos a trabajar las citas de retiro y devolución en Odoo.

**Por qué cambia:** "Hora de cita" y "Hora de Devolución" guardan solo la hora, no el día. Cuando la cita es al día siguiente o pasa de medianoche, el sistema no sabe de qué día es.

**Qué ya está hecho:** en Odoo se crearon dos campos nuevos con fecha y hora en la misma casilla:
- **Fecha y hora de cita de retiro**
- **Fecha y hora de cita de devolución**

**Qué hacer desde ahora:**
1. Seguir llenando **"Hora de cita"** como siempre. La app del conductor y los geoenlaces todavía la usan.
2. Llenar **también** los dos campos nuevos al programar cada servicio. Pagos conductores ya los usa para calcular el pago.

**Más adelante (fecha por definir):** un sábado en la noche o un domingo en la tarde se pasa todo Paybox a los campos nuevos. Ese día se copian los datos anteriores, se prueba con el equipo y la programación del lunes se hace el domingo en la noche, después de las pruebas. Desde ahí solo se llenan los campos nuevos.

No modificar ni borrar "Hora de cita", "Hora de Devolución" ni "Fecha Máxima de Devolución".
