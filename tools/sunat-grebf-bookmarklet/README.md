# Bookmarklet — Descargar GRE-BF sin cookies, sin servidor

Alternativa a la sección `/sunat/grebf` de la app para cuando quien hace la
consulta no es técnico. Descarga los mismos datos (la grilla de
`llenarGrillaConsultaGre`) directamente desde el navegador, sin copiar
cookies y sin pasar por nuestro servidor (Netlify).

## Por qué esto sí funciona en producción

El endpoint de SUNAT (`ww1.sunat.gob.pe/cl-at-itconsultacbf/...`) solo
responde con datos reales si la petición sale desde el mismo contexto donde
se inició sesión en SOL — su WAF (cookies `TS...` / `f5avr...`) rechaza en
silencio (devuelve `{}` con status 200) las peticiones que llegan desde una
IP distinta, como las funciones de Netlify.

Este bookmarklet corre **dentro del navegador, en la misma pestaña donde la
persona ya tiene la sesión de SOL abierta**. Nunca sale de ahí, así que
nunca hay mismatch de IP ni de cookies — es exactamente como si la persona
usara el buscador normal de SUNAT, solo que en vez de mostrar una tabla en
pantalla, arma un CSV y lo descarga.

## Instalación (se hace una sola vez, idealmente la haces tú)

1. Abre `bookmarklet.txt` en esta misma carpeta y copia **todo** el
   contenido (empieza con `javascript:`).
2. En Chrome/Edge: clic derecho en la barra de marcadores → **Agregar
   página...** (o `Ctrl+Shift+O` para abrir el administrador de marcadores →
   botón de opciones → **Añadir nuevo marcador**).
3. Nombre sugerido: `📥 Descargar GRE-BF`
4. En el campo URL, pega el contenido de `bookmarklet.txt`.
5. Guardar. Debe quedar visible en la barra de marcadores (si no aparece,
   activar la barra de marcadores con `Ctrl+Shift+B`).

## Uso diario — IMPORTANTE: por cómo está armado SOL, no basta el marcador solo

SUNAT SOL carga la Consulta GRE BF **dentro de un frame interno**
(`e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm` es la URL que se queda
fija en la barra de direcciones, sin importar a qué pantalla navegues por
el menú). Un marcador normal corre en ese marco de arriba, no dentro del
frame real, así que el clic simple no alcanza. La forma que sí funciona,
comprobada, es con la Consola de DevTools apuntando al frame correcto:

1. Entrar a SUNAT SOL y llegar a la pantalla de Consulta GRE BF (Tipo de
   Consulta / Periodo) por el menú de siempre.
2. Abrir DevTools con `F12` → pestaña **Console**.
3. Arriba del panel de la Console hay un selector que dice `top` (con una
   flechita ▾). Dar clic ahí y elegir el frame **`iframeApplication
   (consultagre.do)`**, el que aparece bajo `ww1.sunat.gob.pe` (no el de
   `gettime.pl`). El selector debe dejar de decir `top`.
4. Abrir `grebf-bookmarklet.js` (el archivo legible, no `bookmarklet.txt`)
   y copiar **todo** su contenido.
5. Clic en la línea de la Console y pegar el código. La primera vez Chrome
   va a pedir que escribas `allow pasting` y Enter antes de dejarte pegar
   — es una protección normal del navegador, se hace una sola vez por
   sesión.
6. Pegar el código de nuevo y Enter.
7. Van a salir 3 cuadros de pregunta: tipo de consulta (ya viene `02`),
   periodo Desde y Hasta (formato AAAAMM) — Aceptar en cada uno, o cambiar
   el valor.
8. Se descarga un archivo `.xls` con el diseño de Excel (encabezado azul,
   filas alternadas, bordes) — al abrirlo, Excel puede avisar que el
   formato no coincide con la extensión; es normal con este truco, dar
   "Sí"/"Aceptar".

**El selector de frame de la Console no se queda guardado** — si vuelves a
correr el script más tarde (sesión nueva de DevTools, o recargaste la
página), hay que volver a elegir `iframeApplication` en el paso 3 antes de
pegar, si no el script va a decir que no estás en la pantalla correcta.

Se intentó que el marcador (`bookmarklet.txt`) detectara el frame solo
(vía `performance.getEntriesByType('resource')`) para evitar el paso de
DevTools, pero SOL navega el frame con JavaScript (`target="..."`) sin
actualizar el `src` ni dejar rastro en el Resource Timing, así que en la
práctica no se pudo automatizar del todo — el marcador se deja igual por
si en algún caso sí lo encuentra, pero el camino confiable es la Console.

## Qué trae el Excel (`.xls`)

Mismo estilo visual que el export de `SunatGREBFSection.tsx`
(`exportarExcel`): encabezado azul `#1E3A5F` con texto blanco en negrita,
filas alternadas celeste claro/blanco, bordes en toda la tabla. Columnas:
FECHA EMISIÓN, GRE REMITENTE, GRE TRANSPORTE, FECHA TRASLADO, RUC
REMITENTE, DESTINATARIO, VEHÍCULO, CARRETA, CONDUCTOR, PUNTO DE PARTIDA,
PUNTO DE LLEGADA, RUTA FISCAL, ESTADO.

RUC REMITENTE sale directo de la consulta principal (sin PDF). VEHÍCULO/
CARRETA/CONDUCTOR salen de descargar y leer el PDF de **cada guía
encontrada** (`accion=descargarPdf`), igual que hace
`lib/sunat/pdfDetalle.ts` en el servidor — pero corriendo la lectura del
PDF en el navegador, con la librería [PDF.js](https://mozilla.github.io/pdf.js/)
cargada al vuelo desde un CDN (`cdnjs.cloudflare.com`). Como PDF.js no
preserva tabs/saltos de línea igual que `pdf-parse`, el texto se
reconstruye agrupando palabras por línea (posición Y) e insertando un tab
cuando hay un salto grande en X (columna nueva) — necesario para que los
mismos regex de `pdfDetalle.ts` sepan dónde termina cada dato. No se
intenta sacar el **nombre** del remitente del PDF (solo el RUC): esa parte
resultó frágil con este método de extracción y no vale la pena la
complejidad para lo que se necesita.

Esto tiene dos efectos a tener en cuenta:

- **Es más lento** cuanto más guías traiga el rango de meses: hace una
  descarga de PDF por cada fila (3 en paralelo). Para muchos meses/guías,
  puede tardar bastante — se puede seguir el avance abriendo la Console y
  mirando los mensajes `[GRE-BF] detalle N/total`.
- **Depende de que SUNAT no bloquee la carga del script del CDN.** Si la
  política de seguridad del sitio lo impide, sale un aviso y el Excel se
  genera igual pero sin placa/conductor/remitente (con las demás columnas
  vacías para esos campos).

## Si algo falla

- **"Abre esto desde la página de SUNAT SOL..."** → el marcador se apretó
  estando en otra pestaña/sitio. Hay que estar en `ww1.sunat.gob.pe`.
- **"No se encontraron registros..."** → puede que el periodo no tenga
  datos, o que la sesión de SOL haya expirado (recargar la página de SUNAT
  y volver a intentar).
- Si SUNAT cambia su formulario o el nombre del `accion=...`, este script
  hay que actualizarlo manualmente — igual que ya pasa hoy con el flujo de
  copiar-cookie.

## Archivos

- `grebf-bookmarklet.js` — versión legible del código (para editar/revisar).
- `bookmarklet.txt` — versión de una sola línea (`javascript:...`), lista
  para pegar como URL del marcador. Si editas el `.js`, hay que regenerar
  este archivo (minificarlo y URL-encodearlo) antes de volver a usarlo.
