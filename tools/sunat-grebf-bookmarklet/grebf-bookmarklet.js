// Bookmarklet: descarga CSV de GRE-BF directamente desde el navegador,
// usando la sesión real de SUNAT SOL (sin copiar cookies, sin servidor intermedio).
// Correr SOLO estando logueado en ww1.sunat.gob.pe, sección Consulta GRE BF.
//
// Ver README.md en esta misma carpeta para instrucciones de instalación
// y la version minificada lista para pegar como marcador.

(function () {
  if (location.hostname !== 'ww1.sunat.gob.pe' || location.pathname.indexOf('/cl-at-itconsultacbf/') === -1) {
    // SOL carga la Consulta GRE BF dentro de un frame del menu
    // (e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm) y lo navega con
    // JavaScript (target="nombreDelFrame"), lo cual NO actualiza el atributo
    // src del frame en el HTML, asi que no se puede leer directamente. Pero
    // el navegador SI registra esa URL en el Resource Timing (performance),
    // porque para el sigue siendo una carga de subrecurso del frame.
    var entries = [];
    try { entries = performance.getEntriesByType('resource'); } catch (e) {}
    var match = null;
    for (var i = entries.length - 1; i >= 0; i--) {
      if (entries[i].name.indexOf('/cl-at-itconsultacbf/consultagre.do') !== -1) {
        match = entries[i].name;
        break;
      }
    }
    if (match) {
      var opened = window.open(match, '_blank');
      if (opened) {
        alert(
          'Se abrio la pantalla real de Consulta GRE BF en una pestana nueva.\n\n' +
          'Ahi vuelve a apretar este marcador.\n\nEnlace: ' + match,
        );
      } else {
        prompt(
          'El navegador bloqueo la pestana nueva. Copia este enlace (ya esta ' +
          'seleccionado) y pegalo tu mismo en una pestana nueva:',
          match,
        );
      }
      return;
    }
    alert(
      'Todavia no estas en la pantalla correcta y no encontre el enlace real ' +
      'todavia.\n\n' +
      'Clic derecho justo encima del formulario "Tipo de Consulta" ' +
      '(no en el menu de la izquierda) y elige "Abrir marco en una pestana ' +
      'nueva" (o "Open frame in new tab").\n\n' +
      'Eso va a abrir la pantalla real de Consulta GRE BF en otra pestana. ' +
      'Ahi vuelve a apretar este marcador.\n\n' +
      'Ahora mismo estas en: ' + location.hostname + location.pathname,
    );
    return;
  }

  var TIP_LABELS = {
    '01': '01 - GRE BF Remitente emitidas',
    '02': '02 - GRE BF Transportista emitidas',
    '03': '03 - GRE BF Remitente Complementaria emitidas',
    '04': '04 - GRE BF Transportista Complementaria emitidas',
    '05': '05 - GRE BF Remitente recibidas',
    '06': '06 - GRE BF Transportista recibidas',
    '07': '07 - GRE BF Remitente complementaria recibidas',
    '08': '08 - GRE BF Transportista complementaria recibidas',
    '09': '09 - GRE BF relacionadas',
  };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function currentPeriodo() {
    var d = new Date();
    return '' + d.getFullYear() + pad(d.getMonth() + 1);
  }

  var tipo = prompt(
    'Tipo de consulta (escribe el numero 01-09):\n' +
      Object.keys(TIP_LABELS).map(function (k) { return TIP_LABELS[k]; }).join('\n'),
    '02',
  );
  if (!tipo) return;
  tipo = pad(parseInt(tipo, 10));
  if (!TIP_LABELS[tipo]) { alert('Tipo invalido.'); return; }

  var desde = prompt('Periodo DESDE (AAAAMM):', currentPeriodo());
  if (!desde) return;
  var hasta = prompt('Periodo HASTA (AAAAMM):', currentPeriodo());
  if (!hasta) return;
  if (!/^\d{6}$/.test(desde) || !/^\d{6}$/.test(hasta) || desde > hasta) {
    alert('Periodos invalidos. Deben ser 6 digitos AAAAMM, y Desde <= Hasta.');
    return;
  }

  function monthRange(d0, h0) {
    var year = parseInt(d0.slice(0, 4), 10);
    var month = parseInt(d0.slice(4, 6), 10);
    var endYear = parseInt(h0.slice(0, 4), 10);
    var endMonth = parseInt(h0.slice(4, 6), 10);
    var months = [];
    while (months.length < 12 && (year < endYear || (year === endYear && month <= endMonth))) {
      months.push('' + year + pad(month));
      month++;
      if (month > 12) { month = 1; year++; }
    }
    return months;
  }

  var meses = monthRange(desde, hasta);

  var debugInfo = [];

  function queryPeriodo(periodo) {
    var body = new URLSearchParams({
      accion: 'llenarGrillaConsultaGre',
      ruc: '',
      periodo: periodo,
      tipoguia: '',
      numeroguia: '',
      tipoconsulta: TIP_LABELS[tipo],
      ubipartida: '',
      ubillegada: '',
      'dojo.preventCache': String(Date.now()),
    });
    return fetch('/cl-at-itconsultacbf/consultagre.do?accion=llenarGrillaConsultaGre', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          return { status: res.status, text: text };
        });
      })
      .then(function (result) {
        var data;
        try { data = JSON.parse(result.text); } catch (parseErr) {
          debugInfo.push(
            'periodo ' + periodo + ': HTTP ' + result.status + ', respuesta no es JSON (' +
            parseErr.message + '): ' + JSON.stringify(result.text.slice(0, 200)),
          );
          return [];
        }
        var ind = data && data.entrega && data.entrega.ind_error;
        if (ind !== '0' && ind !== 0) {
          debugInfo.push(
            'periodo ' + periodo + ': HTTP ' + result.status + ', ind_error=' + ind + ': ' +
            JSON.stringify(result.text.slice(0, 200)),
          );
          return [];
        }
        return (data && data.entrega && data.entrega.lstResultado) || [];
      })
      .catch(function (err) {
        debugInfo.push('periodo ' + periodo + ': fetch fallo - ' + err.message);
        return [];
      });
  }

  // Mismas columnas/diseno visual que el Excel de SunatGREBFSection.tsx
  // (exportarExcel). placaVehiculo/placaCarreta/conductor/remitente salen de
  // leer el PDF de cada guia (accion=descargarPdf) con PDF.js cargado desde
  // un CDN, aplicando la misma logica de lib/sunat/pdfDetalle.ts.
  var COLS = [
    ['fecEmision', 'FECHA EMISION'],
    ['serieNumeroGreRemitente', 'GRE REMITENTE'],
    ['serieNumeroGre', 'GRE TRANSPORTE'],
    ['fecIniTraslado', 'FECHA TRASLADO'],
    ['remitente', 'REMITENTE'],
    ['razonSocialDestino', 'DESTINATARIO'],
    ['placaVehiculo', 'VEHICULO'],
    ['placaCarreta', 'CARRETA'],
    ['conductor', 'CONDUCTOR'],
    ['direccionPartida', 'PUNTO DE PARTIDA'],
    ['direccionLlegada', 'PUNTO DE LLEGADA'],
    ['rutaFiscales', 'RUTA FISCAL'],
    ['estado', 'ESTADO'],
  ];

  var PDFJS_VERSION = '3.11.174';
  var PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    return loadScript(PDFJS_BASE + 'pdf.min.js').then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
    });
  }

  // pdf-parse (usado en el servidor) reconstruye tabs/saltos de linea segun
  // la posicion de cada palabra en la pagina; PDF.js solo da items sueltos
  // con su posicion (transform), asi que armamos el mismo tipo de texto
  // agrupando por linea (Y) e insertando \t cuando hay un salto grande en X
  // (columna nueva) -- eso es lo que necesitan los regex de abajo para
  // saber donde termina cada dato.
  function itemsToLines(items) {
    var lines = [];
    var currentY = null;
    var currentLine = [];
    items.forEach(function (it) {
      var y = it.transform[5];
      if (currentY === null || Math.abs(y - currentY) > 2) {
        if (currentLine.length) lines.push(currentLine);
        currentLine = [];
        currentY = y;
      }
      currentLine.push(it);
    });
    if (currentLine.length) lines.push(currentLine);

    return lines.map(function (line) {
      line.sort(function (a, b) { return a.transform[4] - b.transform[4]; });
      var out = '';
      var lastEndX = null;
      line.forEach(function (it) {
        var x = it.transform[4];
        if (lastEndX !== null) out += (x - lastEndX) > 15 ? '\t' : ' ';
        out += it.str;
        lastEndX = x + (it.width || 0);
      });
      return out;
    }).join('\n');
  }

  function extractTextFromPdf(arrayBuffer) {
    return window.pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(function (pdf) {
      var pagePromises = [];
      for (var p = 1; p <= pdf.numPages; p++) {
        pagePromises.push(
          pdf.getPage(p).then(function (page) {
            return page.getTextContent().then(function (content) {
              return itemsToLines(content.items);
            });
          }),
        );
      }
      return Promise.all(pagePromises).then(function (texts) { return texts.join('\n'); });
    });
  }

  var PLACA_RE = /\b(?=[A-Z0-9]{6}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{6}\b/g;
  var CONDUCTOR_ROW_RE = /(?:DNI|CE|RUC|PASAPORTE)\s+[A-Z0-9]{6,12}\s+([^\t\n]+)/;
  var LICENCIA_TOKEN_RE = /^[A-Z]{0,2}\d{5,10}$/;
  // Limitado a 80 caracteres (en vez de sin limite) como red de seguridad:
  // si por algun PDF la reconstruccion de tabs/lineas falla, esto evita que
  // el regex se coma miles de caracteres de texto crudo del documento.
  var REMITENTE_NAME_RE = /([^\t\n]{1,80}?)\s*APELLIDOS,?\s*NOMBRES,?\s*DENOMINACI[OÓ]N\s*O\s*RAZ[OÓ]N\s*SOCIAL:/;

  function between(text, startMarker, endMarkers) {
    var startIdx = text.indexOf(startMarker);
    if (startIdx === -1) return null;
    var endIdx = text.length;
    endMarkers.forEach(function (marker) {
      var idx = text.indexOf(marker, startIdx + startMarker.length);
      if (idx !== -1 && idx < endIdx) endIdx = idx;
    });
    return text.slice(startIdx + startMarker.length, endIdx);
  }

  function extractDetalle(text) {
    var normalized = text.toUpperCase();
    var transporteBlock = between(normalized, 'DATOS DEL TRANSPORTE', ['DATOS DE(LOS) CONDUCTOR', 'DATOS DEL CONDUCTOR']);
    var conductorBlock = between(normalized, 'DATOS DE(LOS) CONDUCTOR', ['CODIGO DE VERIFICACION', 'OBSERVACIONES'])
      || between(normalized, 'DATOS DEL CONDUCTOR', ['CODIGO DE VERIFICACION', 'OBSERVACIONES']);

    var placas = transporteBlock ? Array.from(new Set(transporteBlock.match(PLACA_RE) || [])) : [];

    var conductor = '';
    var rowMatch = conductorBlock && conductorBlock.match(CONDUCTOR_ROW_RE);
    if (rowMatch) {
      var tokens = rowMatch[1].trim().replace(/\s+/g, ' ').split(' ');
      if (tokens.length > 1 && LICENCIA_TOKEN_RE.test(tokens[tokens.length - 1])) tokens.pop();
      conductor = tokens.join(' ');
    }

    var remitenteMatch = normalized.match(REMITENTE_NAME_RE);
    var remitente = remitenteMatch ? remitenteMatch[1].trim().replace(/\s+/g, ' ') : '';

    return { placas: placas, conductor: conductor, remitente: remitente };
  }

  function fetchDetalle(row) {
    var body = new URLSearchParams({
      accion: 'descargarPdf',
      numeroRUC: String(row.num_ruc),
      numeroFile: String(row.num_id_xml),
    });
    return fetch('/cl-at-itconsultacbf/consultagre.do?accion=descargarPdf', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    })
      .then(function (res) { return res.arrayBuffer(); })
      .then(extractTextFromPdf)
      .then(extractDetalle)
      .catch(function (err) {
        return { placas: [], conductor: '', remitente: '', _err: err.message };
      });
  }

  function enrichWithDetalle(rows) {
    return ensurePdfJs()
      .catch(function (err) {
        alert(
          'No se pudo cargar la libreria de lectura de PDF (' + err.message + ').\n\n' +
          'El Excel va a salir sin placa/conductor/remitente.',
        );
        return null;
      })
      .then(function (pdfJsReady) {
        if (pdfJsReady === null) return rows;

        var CONCURRENCY = 3;
        var nextIndex = 0;
        var done = 0;

        function worker() {
          if (nextIndex >= rows.length) return Promise.resolve();
          var i = nextIndex++;
          return fetchDetalle(rows[i]).then(function (detalle) {
            rows[i].placaVehiculo = detalle.placas[0] || '';
            rows[i].placaCarreta = detalle.placas[1] || '';
            rows[i].conductor = detalle.conductor;
            rows[i].remitente = detalle.remitente;
            done++;
            console.log('[GRE-BF] detalle ' + done + '/' + rows.length);
            return worker();
          });
        }

        var workers = [];
        for (var w = 0; w < Math.min(CONCURRENCY, rows.length); w++) workers.push(worker());
        return Promise.all(workers).then(function () { return rows; });
      });
  }

  function escapeHtml(v) {
    var s = v === undefined || v === null ? '' : String(v);
    return s.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildExcelHtml(rows) {
    var headerCells = COLS.map(function (c) { return '<th>' + escapeHtml(c[1]) + '</th>'; }).join('');
    var bodyRows = rows.map(function (r, i) {
      var cls = i % 2 === 0 ? 'even' : 'odd';
      var cells = COLS.map(function (c) {
        return '<td>' + escapeHtml(r[c[0]]) + '</td>';
      }).join('');
      return '<tr class="' + cls + '">' + cells + '</tr>';
    }).join('');

    return (
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="UTF-8">' +
      '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
      '<x:Name>GRE BF</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>' +
      '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
      '<style>' +
      'table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }' +
      'th { background: #1E3A5F; color: #FFFFFF; font-weight: bold; padding: 6px 10px; ' +
      'border: 1px solid #000000; text-align: center; white-space: nowrap; }' +
      'td { padding: 4px 10px; border: 1px solid #000000; mso-number-format: "\\@"; ' +
      'white-space: nowrap; }' +
      '.even { background: #F0F4FA; } .odd { background: #FFFFFF; }' +
      '</style></head><body><table><thead><tr>' + headerCells + '</tr></thead>' +
      '<tbody>' + bodyRows + '</tbody></table></body></html>'
    );
  }

  Promise.all(meses.map(queryPeriodo))
    .then(function (results) {
      var rows = [].concat.apply([], results);
      if (!rows.length) {
        alert(
          'No se encontraron registros para ese periodo.\n\n' +
          'Detalle tecnico:\n' + (debugInfo.length ? debugInfo.join('\n\n') : '(sin detalle)'),
        );
        return null;
      }
      console.log('[GRE-BF] ' + rows.length + ' registros, leyendo PDF de cada uno (placa/conductor)...');
      return enrichWithDetalle(rows);
    })
    .then(function (rows) {
      if (!rows) return;

      var html = buildExcelHtml(rows);
      var blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'GRE-BF-' + tipo + '-' + desde + '-' + hasta + '.xls';
      document.body.appendChild(a);
      a.click();
      a.remove();
      alert(
        rows.length + ' registros descargados.\n\n' +
        'Al abrirlo, Excel puede avisar que el formato no coincide con la ' +
        'extension -- dale "Si"/"Aceptar", es normal con este tipo de archivo.',
      );
    })
    .catch(function (err) {
      alert('Error al consultar SUNAT: ' + err.message);
    });
})();
