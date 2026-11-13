# Citas de retiro y devolución

Hola equipo, les cuento cómo quedan las citas en Odoo.

**Por qué cambia:** al crear "Hora de Devolución" nos dimos cuenta de que guarda solo la hora, no el día. La cita de retiro ya funciona bien (día + hora), así que la devolución queda igual.

**Qué ya está hecho:** en Odoo se creó el campo **"Fecha de Devolucion"** (solo fecha), junto a "Hora de Devolucion".

| | Día | Hora |
|---|---|---|
| **Retiro** | Fecha de Recojo | Hora de Recojo |
| **Devolución** | Fecha de Devolucion | Hora de Devolucion |

**Qué hacer desde ahora:**
1. **Retiro:** se sigue cargando como hoy, desde el Excel.
2. **Devolución:** llenar **"Fecha de Devolucion"** y **"Hora de Devolucion"**. Si falta la fecha, se toma el mismo día del recojo.

Por ahora solo Pruebas > Pagos conductores usa la fecha de devolución (para el adicional de devolución tardía). Nada más cambia.

No borrar ni renombrar estos campos por dentro (solo se puede cambiar lo que se ve en pantalla).
