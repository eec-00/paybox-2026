'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, Search, Cookie, FileText, Download, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

interface SessionStatus { active: boolean; minutes_left?: number }

const TIP_CONSULTA_OPTIONS = [
  { value: '01', label: '01 - GRE BF Remitente emitidas' },
  { value: '02', label: '02 - GRE BF Transportista emitidas' },
  { value: '03', label: '03 - GRE BF Remitente Complementaria emitidas' },
  { value: '04', label: '04 - GRE BF Transportista Complementaria emitidas' },
  { value: '05', label: '05 - GRE BF Remitente recibidas' },
  { value: '06', label: '06 - GRE BF Transportista recibidas' },
  { value: '07', label: '07 - GRE BF Remitente complementaria recibidas' },
  { value: '08', label: '08 - GRE BF Transportista complementaria recibidas' },
  { value: '09', label: '09 - GRE BF relacionadas' },
]

function currentPeriodo() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Fields shown in the results table
const COLS: [string, string][] = [
  ['serieNumeroGre',         'GRE-BF'],
  ['tipoGre',                'Tipo GRE'],
  ['serieNumeroGreRemitente','GRE Remitente'],
  ['tipoGreRemitente',       'Tipo Remitente'],
  ['fecEmision',             'Fec. Emisión'],
  ['fecIniTraslado',         'Fec. Traslado'],
  ['numeroNombreEmisor',     'Emisor'],
  ['numeroNombreDestinatario','Destinatario'],
  ['direccionPartida',       'Dir. Partida'],
  ['direccionLlegada',       'Dir. Llegada'],
  ['rutaFiscales',           'Ruta Fiscal'],
]

export function SunatGREBFSection() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)
  const [sessionInput, setSessionInput] = useState('')
  const [savingSession, setSavingSession] = useState(false)

  const [tipConsulta, setTipConsulta] = useState('02')
  const [periodoDesde, setPeriodoDesde] = useState(currentPeriodo)
  const [periodoHasta, setPeriodoHasta] = useState(currentPeriodo)
  const [ubigeoPartida, setUbigeoPartida] = useState('')
  const [ubigeoLlegada, setUbigeoLlegada] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [items, setItems] = useState<unknown[] | null>(null)
  const [rawData, setRawData] = useState<unknown>(null)
  const [httpStatus, setHttpStatus] = useState<number | null>(null)
  const [loadingPdf, setLoadingPdf] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [exportProgress, setExportProgress] = useState('')

  const fetchSessionStatus = useCallback(async () => {
    const res = await fetch('/api/sunat/bfsession')
    const data = await res.json()
    setSessionStatus(data)
  }, [])

  useEffect(() => {
    fetchSessionStatus()
    const interval = setInterval(fetchSessionStatus, 60_000)
    return () => clearInterval(interval)
  }, [fetchSessionStatus])

  async function saveSession() {
    if (!sessionInput.trim()) { toast.error('Pega el valor de ITCONSULTACBFSESSION'); return }
    setSavingSession(true)
    try {
      const res = await fetch('/api/sunat/bfsession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: sessionInput.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Sesión guardada — válida ~25 minutos')
        setSessionInput('')
        fetchSessionStatus()
      } else {
        toast.error(data.error)
      }
    } finally {
      setSavingSession(false)
    }
  }

  async function buscar() {
    if (!periodoDesde.match(/^\d{6}$/) || !periodoHasta.match(/^\d{6}$/)) {
      toast.error('Periodo debe ser AAAAMM — 6 dígitos, ej: 202606')
      return
    }
    if (periodoDesde > periodoHasta) { toast.error('Desde debe ser ≤ Hasta'); return }
    setLoading(true)
    setLoadingMsg('')
    setItems(null)
    setRawData(null)
    try {
      const params = new URLSearchParams({ tipConsulta, periodoDesde, periodoHasta })
      if (ubigeoPartida) params.set('ubiPartida', ubigeoPartida)
      if (ubigeoLlegada) params.set('ubiLlegada', ubigeoLlegada)
      const res = await fetch(`/api/sunat/grebf?${params}`)
      const json = await res.json()
      setHttpStatus(json.status ?? 200)
      setRawData(json)
      if (json.ok) {
        setItems(json.items ?? [])
        const meses = json.meses > 1 ? ` (${json.meses} meses)` : ''
        toast.success(`${json.total ?? (json.items ?? []).length} GRE BF encontradas${meses}`)
      } else {
        toast.error(json.error ?? `Error SUNAT`)
      }
    } catch {
      toast.error('Error al consultar SUNAT')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  function pdfUrl(row: Record<string, unknown>) {
    return `/api/sunat/grebf/pdf?numeroFile=${row.num_id_xml}&numeroRUC=${row.num_ruc}`
  }

  async function verPDF(row: Record<string, unknown>) {
    const key = String(row.num_id_xml)
    setLoadingPdf(key)
    try {
      const res = await fetch(pdfUrl(row))
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Error al obtener PDF')
        return
      }
      const blob = await res.blob()
      window.open(URL.createObjectURL(blob), '_blank')
    } catch {
      toast.error('Error al obtener PDF')
    } finally {
      setLoadingPdf(null)
    }
  }

  async function descargarPDF(row: Record<string, unknown>) {
    const key = String(row.num_id_xml)
    setLoadingPdf(key)
    try {
      const res = await fetch(pdfUrl(row))
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? 'Error al descargar PDF')
        return
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `GRE-BF-${row.serieNumeroGre ?? row.num_id_xml}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast.error('Error al descargar PDF')
    } finally {
      setLoadingPdf(null)
    }
  }

  async function fetchDetalle(row: Record<string, unknown>): Promise<{ placas: string; conductor: string; debug: string }> {
    try {
      const params = new URLSearchParams({
        numeroFile: String(row.num_id_xml),
        numeroRUC: String(row.num_ruc),
      })
      const res = await fetch(`/api/sunat/grebf/detalle?${params}`)
      const data = await res.json()
      if (!data.ok) return { placas: '', conductor: '', debug: `ERROR: ${data.error ?? res.status}` }
      return { placas: data.placas ?? '', conductor: data.conductor ?? '', debug: data.debugText ?? '' }
    } catch (err: any) {
      return { placas: '', conductor: '', debug: `ERROR fetch: ${err.message}` }
    }
  }

  async function exportarExcel() {
    if (!items || items.length === 0) return
    setExportingExcel(true)
    try {
      const rows = items as Record<string, unknown>[]
      const enriched: Record<string, unknown>[] = new Array(rows.length)

      const CONCURRENCY = 3
      let nextIndex = 0
      let done = 0
      async function worker() {
        while (nextIndex < rows.length) {
          const i = nextIndex++
          const detalle = await fetchDetalle(rows[i])
          enriched[i] = {
            ...rows[i],
            placaUnidad: detalle.placas,
            nombreConductor: detalle.conductor,
            ...(detalle.debug ? { _debug_pdf: detalle.debug } : {}),
          }
          done++
          setExportProgress(`Extrayendo datos operativos ${done}/${rows.length}...`)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker))

      const keySet = new Set<string>()
      enriched.forEach((row) => Object.keys(row).forEach((k) => keySet.add(k)))
      const allKeys = Array.from(keySet)

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('GRE BF')
      worksheet.columns = allKeys.map((key) => ({ header: key, key, width: 20 }))

      enriched.forEach((row, i) => {
        const r = worksheet.addRow(row)
        if (i % 2 === 1) {
          r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
        }
      })

      const headerRow = worksheet.getRow(1)
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2332' } }
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })

      const buffer = await workbook.xlsx.writeBuffer()
      saveAs(new Blob([buffer]), `GRE-BF-${tipConsulta}-${periodoDesde}-${periodoHasta}.xlsx`)
    } finally {
      setExportingExcel(false)
      setExportProgress('')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SUNAT — GRE Bienes Fiscalizables</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Guía de Remisión Electrónica BF · ww1.sunat.gob.pe · SEE-SOL
        </p>
      </div>

      {/* Session cookie */}
      <Card className={sessionStatus?.active === false ? 'border-destructive' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cookie className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Sesión SUNAT SOL — BF</CardTitle>
            </div>
            <SessionBadge status={sessionStatus} />
          </div>
          <CardDescription>
            En SUNAT SOL → GRE BF → Consultar GRE → DevTools (F12) → Network → click cualquier request →
            pestaña <strong>Headers</strong> → sección <em>Request Headers</em> → copia el valor completo del campo{' '}
            <code className="text-xs bg-muted px-1 rounded">Cookie</code> (toda la línea, incluye múltiples cookies separadas por <code className="text-xs bg-muted px-1 rounded">;</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessionStatus && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Estado</p>
                <p className="font-medium">{sessionStatus.active ? 'Activa' : 'Expirada / no configurada'}</p>
              </div>
              {sessionStatus.active && (
                <div>
                  <p className="text-muted-foreground">Expira en</p>
                  <p className="font-medium">{sessionStatus.minutes_left} min</p>
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Pegar Cookie header completo</Label>
            <Textarea
              value={sessionInput}
              onChange={(e) => setSessionInput(e.target.value)}
              placeholder="f5avraaaa...=...; ITCONSULTACBFSESSION=...; 20523380347HELETINK=1; ..."
              className="font-mono text-xs h-24 resize-none"
            />
          </div>
          <Button onClick={saveSession} disabled={savingSession} size="sm">
            {savingSession ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Guardar sesión'}
          </Button>
        </CardContent>
      </Card>

      {/* Consulta */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Guía de Remisión Electrónica BF — Consultas</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 min-w-80">
              <Label>Tipo de Consulta</Label>
              <select
                value={tipConsulta}
                onChange={(e) => setTipConsulta(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {TIP_CONSULTA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Desde (AAAAMM)</Label>
              <Input
                value={periodoDesde}
                onChange={(e) => setPeriodoDesde(e.target.value)}
                placeholder="202601"
                maxLength={6}
                className="w-24 font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label>Hasta (AAAAMM)</Label>
              <Input
                value={periodoHasta}
                onChange={(e) => setPeriodoHasta(e.target.value)}
                placeholder="202606"
                maxLength={6}
                className="w-24 font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label>Ubigeo de Partida</Label>
              <Input
                value={ubigeoPartida}
                onChange={(e) => setUbigeoPartida(e.target.value)}
                placeholder="Opcional"
                className="w-32"
              />
            </div>
            <div className="space-y-1">
              <Label>Ubigeo de Llegada</Label>
              <Input
                value={ubigeoLlegada}
                onChange={(e) => setUbigeoLlegada(e.target.value)}
                placeholder="Opcional"
                className="w-32"
              />
            </div>
            <Button onClick={buscar} disabled={loading || !sessionStatus?.active} size="sm">
              {loading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{loadingMsg || 'Consultando...'}</>
                : <><Search className="h-4 w-4 mr-2" />Buscar</>}
            </Button>
          </div>

          {(items !== null || rawData !== null) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge
                  className={items !== null && items.length >= 0 ? 'bg-green-100 text-green-800 border-green-200' : ''}
                  variant={items !== null ? 'outline' : 'destructive'}
                >
                  HTTP {httpStatus}
                </Badge>
                {items !== null && (
                  <span className="text-sm text-muted-foreground">{items.length} registros</span>
                )}
                {items && items.length > 0 && (
                  <Button variant="outline" size="sm" onClick={exportarExcel} disabled={exportingExcel} className="ml-auto">
                    {exportingExcel
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{exportProgress || 'Exportando...'}</>
                      : <><FileSpreadsheet className="h-4 w-4 mr-2" />Exportar Excel (con placa/conductor)</>}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowRaw((v) => !v)}>
                  {showRaw ? 'Ocultar' : 'Ver'} campos crudos
                </Button>
              </div>

              {showRaw && (
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-96 font-mono">
                  {JSON.stringify(items && items.length > 0 ? items[0] : rawData, null, 2)}
                </pre>
              )}

              {items && items.length > 0 ? (
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/60 border-b">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">PDF</th>
                        {COLS.map(([, label]) => (
                          <th key={label} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row, i) => {
                        const r = row as Record<string, unknown>
                        const key = String(r.num_id_xml)
                        const busy = loadingPdf === key
                        return (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => verPDF(r)}
                                  disabled={!!loadingPdf}
                                  title="Ver PDF"
                                  className="text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-40"
                                >
                                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  onClick={() => descargarPDF(r)}
                                  disabled={!!loadingPdf}
                                  title="Descargar PDF"
                                  className="text-muted-foreground hover:text-green-600 transition-colors disabled:opacity-40"
                                >
                                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </td>
                            {COLS.map(([key]) => (
                              <td key={key} className="px-3 py-2 whitespace-nowrap font-mono">
                                {String(r[key] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-96 font-mono">
                  {JSON.stringify(rawData, null, 2)}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SessionBadge({ status }: { status: SessionStatus | null }) {
  if (!status) return <Badge variant="outline">Cargando...</Badge>
  if (status.active)
    return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />{status.minutes_left} min restantes</Badge>
  return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Expirada</Badge>
}
