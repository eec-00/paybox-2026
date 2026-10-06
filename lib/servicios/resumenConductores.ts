// ============================================================
// Resumen de cumplimiento de conductores (PDF imprimible)
// Para un rango de fechas de programación: cuántos servicios hubo, cuántos
// pasaron por la app del conductor vs. se llenaron solo en Odoo, hitos
// marcados y fotos obligatorias enviadas, y el cumplimiento por conductor.
// ============================================================

import { getHitosForTask, type TaskTypeFlags } from './hitos'

export type ResumenTask = TaskTypeFlags & {
  id: number
  stage_id: [number, string] | false
  x_studio_conductor: [number, string] | false
  x_studio_fecha_de_la_programacin: string | false
}

export type FotoHito = { servicio_id: number; hito_key: string }

export type EstadoConductor = 'ok' | 'reg' | 'bad'

export interface ResumenConductor {
  nombre: string
  realizados: number
  enApp: number
  hitosTotal: number
  hitosMarcados: number
  fotosReq: number
  fotosEnv: number
  pctApp: number
  pctHitos: number
  pctFotos: number
  estado: EstadoConductor
}

export interface ResumenServicios {
  start: string
  end: string
  total: number
  enApp: number
  terminados: number
  aMedias: number
  soloOdoo: number
  sinRealizar: number
  hitosTotal: number
  hitosMarcados: number
  fotosReq: number
  fotosEnv: number
  porDia: { fecha: string; cantidad: number }[]
  conductores: ResumenConductor[]
}

const ETAPA_SIN_REALIZAR = 'nueva solicitud'

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/** Criterio: Correcto = ≥80% servicios en la app, ≥95% hitos y ≥85% fotos.
 * Deficiente = menos del 60% de sus servicios en la app. Regular = el resto. */
function estadoConductor(pctApp: number, pctHitos: number, pctFotos: number): EstadoConductor {
  if (pctApp >= 80 && pctHitos >= 95 && pctFotos >= 85) return 'ok'
  if (pctApp >= 60) return 'reg'
  return 'bad'
}

function diasEntre(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(`${start}T12:00:00`)
  const last = new Date(`${end}T12:00:00`)
  while (d <= last) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

/**
 * Un servicio cuenta como "en la app" si el conductor lo inició (tiene fila en
 * conductor_servicios_progreso o _completados). Si no lo inició y ya no está
 * en "Nueva Solicitud", se llenó solo en Odoo. Hitos y fotos se cuentan solo
 * sobre los servicios iniciados en la app; las fotos obligatorias son las de
 * hitos con foto 'si' que el conductor ya marcó.
 */
export function calcularResumen(
  tasks: ResumenTask[],
  progresoMap: Map<number, number>,
  completadosSet: Set<number>,
  fotos: FotoHito[],
  start: string,
  end: string,
): ResumenServicios {
  const enRango = tasks.filter((t) => {
    const f = t.x_studio_fecha_de_la_programacin
    return typeof f === 'string' && f >= start && f <= end
  })

  const fotosPorServicio = new Map<number, Set<string>>()
  for (const f of fotos) {
    if (!fotosPorServicio.has(f.servicio_id)) fotosPorServicio.set(f.servicio_id, new Set())
    fotosPorServicio.get(f.servicio_id)!.add(f.hito_key)
  }

  const r: ResumenServicios = {
    start, end, total: enRango.length, enApp: 0, terminados: 0, aMedias: 0, soloOdoo: 0, sinRealizar: 0,
    hitosTotal: 0, hitosMarcados: 0, fotosReq: 0, fotosEnv: 0, porDia: [], conductores: [],
  }
  const porConductor = new Map<string, Omit<ResumenConductor, 'pctApp' | 'pctHitos' | 'pctFotos' | 'estado'>>()

  for (const t of enRango) {
    const nombre = Array.isArray(t.x_studio_conductor) ? t.x_studio_conductor[1] : null
    let c = nombre ? porConductor.get(nombre) : undefined
    if (nombre && !c) {
      c = { nombre, realizados: 0, enApp: 0, hitosTotal: 0, hitosMarcados: 0, fotosReq: 0, fotosEnv: 0 }
      porConductor.set(nombre, c)
    }

    const completado = completadosSet.has(t.id)
    const iniciado = completado || progresoMap.has(t.id)
    if (!iniciado) {
      const etapa = t.stage_id ? t.stage_id[1].trim().toLowerCase() : ''
      if (etapa === ETAPA_SIN_REALIZAR) { r.sinRealizar++; continue }
      r.soloOdoo++
      if (c) c.realizados++
      continue
    }

    const hitos = getHitosForTask(t)
    const step = completado ? hitos.length : Math.min(progresoMap.get(t.id) || 0, hitos.length)
    const enviadas = fotosPorServicio.get(t.id)
    const req = hitos.filter((h, i) => h.foto === 'si' && i < step)
    const env = req.filter((h) => enviadas?.has(h.key)).length

    r.enApp++
    if (completado) r.terminados++; else r.aMedias++
    r.hitosTotal += hitos.length; r.hitosMarcados += step
    r.fotosReq += req.length; r.fotosEnv += env
    if (c) {
      c.realizados++; c.enApp++
      c.hitosTotal += hitos.length; c.hitosMarcados += step
      c.fotosReq += req.length; c.fotosEnv += env
    }
  }

  const conteoDia = new Map<string, number>()
  for (const t of enRango) {
    const f = t.x_studio_fecha_de_la_programacin as string
    conteoDia.set(f, (conteoDia.get(f) || 0) + 1)
  }
  r.porDia = diasEntre(start, end).map((fecha) => ({ fecha, cantidad: conteoDia.get(fecha) || 0 }))

  const orden: Record<EstadoConductor, number> = { ok: 0, reg: 1, bad: 2 }
  r.conductores = Array.from(porConductor.values())
    .filter((c) => c.realizados > 0)
    .map((c) => {
      const pctApp = pct(c.enApp, c.realizados)
      const pctHitos = pct(c.hitosMarcados, c.hitosTotal)
      const pctFotos = pct(c.fotosEnv, c.fotosReq)
      return { ...c, pctApp, pctHitos, pctFotos, estado: estadoConductor(pctApp, pctHitos, pctFotos) }
    })
    .sort((a, b) => orden[a.estado] - orden[b.estado] || b.pctApp - a.pctApp || b.pctFotos - a.pctFotos)

  return r
}

// ------------------------------------------------------------
// HTML del reporte (se imprime / guarda como PDF desde el navegador)
// ------------------------------------------------------------

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const ESTADO_LABEL: Record<EstadoConductor, string> = { ok: 'Correcto', reg: 'Regular', bad: 'Deficiente' }

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const num = (n: number) => n.toLocaleString('es-PE')
const fecha = (iso: string) => new Date(`${iso}T12:00:00`)

function fechaLarga(iso: string, conAnio: boolean): string {
  const d = fecha(iso)
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}${conAnio ? ` de ${d.getFullYear()}` : ''}`
}

export function periodoTexto(start: string, end: string): string {
  if (start === end) return fechaLarga(start, true)
  const mismoAnio = start.slice(0, 4) === end.slice(0, 4)
  return `${fechaLarga(start, !mismoAnio)} al ${fechaLarga(end, true)}`
}

function diaCorto(iso: string): string {
  const d = fecha(iso)
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function buildResumenHtml(r: ResumenServicios): string {
  const realizados = r.enApp + r.soloOdoo
  const hoy = new Date()
  const emitido = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`
  const grupo = (e: EstadoConductor) => r.conductores.filter((c) => c.estado === e)
  const sum = (k: keyof ResumenConductor) => r.conductores.reduce((s, c) => s + (c[k] as number), 0)

  // La tabla por día va en filas de hasta 7 días para que no se desborde en rangos largos
  const semanasDias: { fecha: string; cantidad: number }[][] = []
  for (let i = 0; i < r.porDia.length; i += 7) semanasDias.push(r.porDia.slice(i, i + 7))
  const tablaDias = semanasDias.map((fila, i) => {
    const ultima = i === semanasDias.length - 1
    return `<table style="margin-top:${i === 0 ? 12 : 6}px">
<tr>${fila.map((d) => `<th class="c">${diaCorto(d.fecha)}</th>`).join('')}${ultima ? '<th class="c">Total</th>' : ''}</tr>
<tr>${fila.map((d) => `<td class="c">${d.cantidad}</td>`).join('')}${ultima ? `<td class="c"><b>${r.total}</b></td>` : ''}</tr>
</table>`
  }).join('')

  const lista = (e: EstadoConductor) =>
    `<div><b class="${e}">${ESTADO_LABEL[e]} (${grupo(e).length})</b><ul>${grupo(e).map((c) => `<li>${esc(c.nombre)}</li>`).join('')}</ul></div>`

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Resumen servicios ${r.start} a ${r.end}</title>
<style>
@page{size:A4;margin:14mm 15mm 12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#222;font-size:10pt;line-height:1.3;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5pt solid #1f3864;padding-bottom:8px;margin-bottom:16px}
.empresa{font-weight:bold;font-size:12pt;color:#1f3864}
.sub{font-size:9pt;color:#555;margin-top:2px}
.fecha{font-size:9pt;color:#555;text-align:right}
h1{font-size:15pt;color:#1f3864;margin-bottom:4px}
.periodo{font-size:10pt;color:#444;margin-bottom:12px}
h2{font-size:11.5pt;color:#1f3864;margin:16px 0 7px;padding-bottom:3px;border-bottom:.5pt solid #bfbfbf}
table{width:100%;border-collapse:collapse;font-size:10pt}
th,td{border:.5pt solid #bfbfbf;padding:3.5px 7px}
td.r,td.c,th.r,th.c{white-space:nowrap}
.det{font-size:9pt}.det td:first-child{white-space:nowrap}.det td{padding:4px 6px}
th{background:#1f3864;color:#fff;font-weight:bold;text-align:left;font-size:9.5pt}
td.r,th.r{text-align:right}
td.c,th.c{text-align:center}
tr.tot td{font-weight:bold;background:#f2f2f2}
tr{page-break-inside:avoid}
.kv{width:75%}
.kv td:first-child{width:70%}
.nota{font-size:8.5pt;color:#555;margin-top:6px}
.ok{color:#2e7d32;font-weight:bold}.reg{color:#b26a00;font-weight:bold}.bad{color:#c62828;font-weight:bold}
.lista{display:flex;gap:16px;font-size:9pt;line-height:1.4}
.lista div{flex:1}
.lista b{display:block;margin-bottom:4px}
.lista ul{margin-left:14px}.lista li{white-space:nowrap}
.salto{page-break-before:always}
</style></head><body>
<div class="top"><div><div class="empresa">EEMERSON S.A.C.</div><div class="sub">Área de Operaciones · Servicio de Transporte</div></div>
<div class="fecha">Emitido: ${emitido}</div></div>
<h1>Reporte de servicios de conductores</h1>
<div class="periodo">Periodo: ${periodoTexto(r.start, r.end)}</div>

<h2>1. Servicios del periodo</h2>
<table class="kv">
<tr><th>Concepto</th><th class="r">Cantidad</th></tr>
<tr><td>Servicios registrados en Odoo</td><td class="r">${r.total}</td></tr>
<tr><td>Realizados por el conductor desde la app</td><td class="r">${r.enApp}</td></tr>
<tr><td style="padding-left:22px">— Terminados</td><td class="r">${r.terminados}</td></tr>
<tr><td style="padding-left:22px">— Quedaron a medias</td><td class="r">${r.aMedias}</td></tr>
<tr><td>Realizados solo en Odoo (horas llenadas a mano)</td><td class="r">${r.soloOdoo}</td></tr>
<tr><td>No realizados (siguen en "Nueva Solicitud")</td><td class="r">${r.sinRealizar}</td></tr>
</table>
<p class="nota">De los ${realizados} servicios realizados, ${r.enApp} (${pct(r.enApp, realizados)}%) pasaron por la app y ${r.soloOdoo} (${pct(r.soloOdoo, realizados)}%) se llenaron solo en Odoo.</p>
${tablaDias}

<h2>2. Hitos y fotos</h2>
<p style="margin-bottom:8px">Solo de los ${r.enApp} servicios que fueron iniciados por un conductor en la app.</p>
<table class="kv">
<tr><th>Concepto</th><th class="r">Total</th><th class="r">Cumplido</th><th class="r">%</th></tr>
<tr><td>Hitos marcados</td><td class="r">${num(r.hitosTotal)}</td><td class="r">${num(r.hitosMarcados)}</td><td class="r">${pct(r.hitosMarcados, r.hitosTotal)}%</td></tr>
<tr><td>Fotos obligatorias enviadas</td><td class="r">${num(r.fotosReq)}</td><td class="r">${num(r.fotosEnv)}</td><td class="r">${pct(r.fotosEnv, r.fotosReq)}%</td></tr>
</table>
<p class="nota">${r.aMedias > 0 ? `Los ${num(r.hitosTotal - r.hitosMarcados)} hitos faltantes corresponden a los ${r.aMedias} servicios que quedaron a medias. ` : ''}Faltaron ${num(r.fotosReq - r.fotosEnv)} fotos obligatorias.</p>

<h2>3. Conductores que llenaron correctamente</h2>
<div class="lista">${lista('ok')}${lista('reg')}${lista('bad')}</div>
<p class="nota" style="margin-top:10px">Criterio — Correcto: 80% o más de sus servicios en la app, 95% o más de hitos marcados y 85% o más de fotos enviadas. Deficiente: menos del 60% de sus servicios en la app. Regular: el resto.</p>

<h2 class="salto">4. Detalle por conductor</h2>
<table class="det">
<tr><th>Conductor</th><th class="r">Servicios realizados</th><th class="r">En la app</th><th class="r">Hitos marcados</th><th class="r">Fotos enviadas</th><th class="c">Estado</th></tr>
${r.conductores.map((c) => `<tr><td>${esc(c.nombre)}</td><td class="r">${c.realizados}</td><td class="r">${c.enApp} (${c.pctApp}%)</td>
<td class="r">${c.hitosTotal ? `${num(c.hitosMarcados)} / ${num(c.hitosTotal)}` : '—'}</td><td class="r">${c.fotosReq ? `${c.fotosEnv} / ${c.fotosReq} (${c.pctFotos}%)` : '—'}</td>
<td class="c ${c.estado}">${ESTADO_LABEL[c.estado]}</td></tr>`).join('')}
<tr class="tot"><td>Total</td><td class="r">${sum('realizados')}</td><td class="r">${sum('enApp')}</td><td class="r">${num(sum('hitosMarcados'))} / ${num(sum('hitosTotal'))}</td><td class="r">${num(sum('fotosEnv'))} / ${num(sum('fotosReq'))}</td><td></td></tr>
</table>
<p class="nota">Servicios realizados no incluye los que siguen en "Nueva Solicitud". Hitos y fotos se cuentan solo sobre los servicios iniciados en la app. Fuente: Odoo y app de conductores.</p>
</body></html>`
}
