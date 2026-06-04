'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, Search, ChevronLeft, ChevronRight, Key, Eye, Download, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface TokenStatus { active: boolean; minutes_left?: number; updated_at?: string }
interface QueryResult { ok: boolean; status: number; data: unknown }
interface GreDetalle {
  serie: string; fecEmision: string; fecTraslado: string; motivo: string
  tipoServicio: string; greRemitente: string; greTransporte: string
  remitente: string; destinatario: string; peso: string; nroContenedor: string
  vehiculo: string; carreta: string; conductor: string; conductorDni: string; pagador: string
}

function today() { return new Date().toISOString().slice(0, 10) }

export function SunatSection() {
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [savingToken, setSavingToken] = useState(false)

  const [fechaInicio, setFechaInicio] = useState(today())
  const [fechaFin, setFechaFin] = useState(today())
  const [tipoGre, setTipoGre] = useState<'TRANSPORTISTA' | 'REMITENTE' | 'EVENTOS'>('TRANSPORTISTA')
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<QueryResult | null>(null)
  const [page, setPage] = useState(0)
  const [detalleGre, setDetalleGre] = useState<GreDetalle | null>(null)
  const [loadingDetalle, setLoadingDetalle] = useState<string | null>(null)

  const fetchTokenStatus = useCallback(async () => {
    const res = await fetch('/api/sunat/token')
    const data = await res.json()
    setTokenStatus(data)
  }, [])

  useEffect(() => {
    fetchTokenStatus()
    const interval = setInterval(fetchTokenStatus, 60_000)
    return () => clearInterval(interval)
  }, [fetchTokenStatus])

  async function saveToken() {
    if (!tokenInput.trim()) { toast.error('Pega el Bearer token'); return }
    setSavingToken(true)
    try {
      const res = await fetch('/api/sunat/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Token guardado — válido 55 minutos')
        setTokenInput('')
        fetchTokenStatus()
      } else {
        toast.error(data.error)
      }
    } finally {
      setSavingToken(false)
    }
  }

  const rows: unknown[] = Array.isArray((resultado?.data as any)?.items)
    ? (resultado?.data as any).items
    : Array.isArray(resultado?.data)
    ? (resultado?.data as unknown[])
    : []

  const totalRegistros: number = (resultado?.data as any)?.paginacion?.totalRegistros ?? rows.length

  function buildDescargaParams(row: any, tipo: string) {
    return new URLSearchParams({
      rucEmisor: row.rucEmisor ?? '20523380347',
      codCpe: row.codCpe ?? '31',
      numSerie: row.numSerie,
      numCpe: String(row.numCpe),
      tipo,
    })
  }

  async function verXML(row: any) {
    const key = `xml-${row.numSerie}-${row.numCpe}`
    setLoadingDetalle(key)
    try {
      const res = await fetch(`/api/sunat/gre/descarga?${buildDescargaParams(row, 'xml')}`)
      const json = await res.json()
      if (json.ok && json.parsed) {
        setDetalleGre(json.parsed)
      } else {
        toast.error('No se pudo parsear el XML')
        console.log('[verXML raw]', json)
      }
    } catch {
      toast.error('Error al obtener XML')
    } finally {
      setLoadingDetalle(null)
    }
  }

  async function verPDF(row: any) {
    const key = `pdf-${row.numSerie}-${row.numCpe}`
    setLoadingDetalle(key)
    try {
      const res = await fetch(`/api/sunat/gre/descarga?${buildDescargaParams(row, 'pdf')}`)
      const json = await res.json()
      // PDF can come as base64 in encodedDocument or as data URL
      const b64 = (json.data as any)?.pdf ?? (json.data as any)?.encodedDocument ?? (json.data as any)?.documento ?? null
      if (b64) {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        window.open(URL.createObjectURL(blob), '_blank')
      } else {
        toast.error('No se obtuvo PDF')
        console.log('[verPDF raw]', json)
      }
    } catch {
      toast.error('Error al obtener PDF')
    } finally {
      setLoadingDetalle(null)
    }
  }

  async function descargarPDF(row: any) {
    const key = `dl-${row.numSerie}-${row.numCpe}`
    setLoadingDetalle(key)
    try {
      const res = await fetch(`/api/sunat/gre/descarga?${buildDescargaParams(row, 'pdf')}`)
      const json = await res.json()
      const b64 = (json.data as any)?.pdf ?? (json.data as any)?.encodedDocument ?? (json.data as any)?.documento ?? null
      if (b64) {
        const link = document.createElement('a')
        link.href = `data:application/pdf;base64,${b64}`
        link.download = `GRE-${row.numSerie}-${row.numCpe}.pdf`
        link.click()
      } else {
        toast.error('No se obtuvo PDF para descargar')
      }
    } catch {
      toast.error('Error al descargar PDF')
    } finally {
      setLoadingDetalle(null)
    }
  }

  async function consultar(pageNum = 0) {
    setLoading(true)
    setResultado(null)
    setPage(pageNum)
    try {
      const params = new URLSearchParams({
        fechaInicio, fechaFin, tipoGre,
        numRegistros: String(pageNum * 100),
      })
      const res = await fetch(`/api/sunat/gre?${params}`)
      const json = await res.json()
      setResultado(json)
      if (json.ok) toast.success(`${(json.data as any)?.paginacion?.totalRegistros ?? '?'} GRE encontradas`)
      else toast.error(json.error ?? `SUNAT status ${json.status}`)
    } catch {
      toast.error('Error al consultar SUNAT')
    } finally {
      setLoading(false)
    }
  }

  const DETALLE_LABELS: [keyof GreDetalle, string][] = [
    ['serie', 'GRE'],
    ['fecEmision', 'Fecha emisión'],
    ['fecTraslado', 'Fecha traslado'],
    ['motivo', 'Motivo'],
    ['tipoServicio', 'Tipo servicio'],
    ['greRemitente', 'GRE Remitente'],
    ['greTransporte', 'GRE Transporte'],
    ['remitente', 'Remitente'],
    ['destinatario', 'Destinatario'],
    ['peso', 'Peso'],
    ['nroContenedor', 'Nro. contenedor'],
    ['vehiculo', 'Vehículo'],
    ['carreta', 'Carreta'],
    ['conductor', 'Conductor'],
    ['conductorDni', 'DNI conductor'],
    ['pagador', 'Pagador'],
  ]

  return (
    <>
    {/* XML modal */}
    <Dialog open={!!detalleGre} onOpenChange={(o) => { if (!o) setDetalleGre(null) }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle GRE — {detalleGre?.serie}</DialogTitle>
        </DialogHeader>
        {detalleGre && (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <tbody>
                {DETALLE_LABELS.map(([key, label]) => (
                  <tr key={key} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground font-medium whitespace-nowrap w-40">{label}</td>
                    <td className="py-2 font-mono">{detalleGre[key] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SUNAT — GRE</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Guía de Remisión Electrónica · api-cpe.sunat.gob.pe
        </p>
      </div>

      {/* Token */}
      <Card className={tokenStatus?.active === false ? 'border-destructive' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Bearer Token</CardTitle>
            </div>
            <TokenBadge status={tokenStatus} />
          </div>
          <CardDescription>
            En SUNAT SOL → Consulta GRE → DevTools (F12) → pestaña Network → click cualquier request → copia el valor del header <code className="text-xs bg-muted px-1 rounded">Authorization</code> (empieza con eyJ...).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tokenStatus && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Estado</p>
                <p className="font-medium">{tokenStatus.active ? 'Activo' : 'Expirado / no configurado'}</p>
              </div>
              {tokenStatus.active && (
                <div>
                  <p className="text-muted-foreground">Expira en</p>
                  <p className="font-medium">{tokenStatus.minutes_left} min</p>
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Pegar nuevo token</Label>
            <Textarea
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="eyJraWQiOiJh... (o Bearer eyJ...)"
              className="font-mono text-xs h-20 resize-none"
            />
          </div>
          <Button onClick={saveToken} disabled={savingToken} size="sm">
            {savingToken ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Guardar token'}
          </Button>
        </CardContent>
      </Card>

      {/* Consulta */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Consulta GRE Masiva</CardTitle>
          </div>
          <CardDescription>Máximo 100 registros por página.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label>Tipo de GRE</Label>
              <select
                value={tipoGre}
                onChange={(e) => setTipoGre(e.target.value as typeof tipoGre)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="TRANSPORTISTA">GRE - Transportista</option>
                <option value="REMITENTE">GRE - Remitente</option>
                <option value="EVENTOS">GRE - Por Eventos</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Fecha inicio</Label>
              <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label>Fecha fin</Label>
              <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-40" />
            </div>
            <Button onClick={() => consultar(0)} disabled={loading || !tokenStatus?.active} size="sm">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Consultando...</> : <><Search className="h-4 w-4 mr-2" />Consultar</>}
            </Button>
          </div>

          {resultado && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {rows.length > 0 ? `${rows.length} filas · total ${totalRegistros} · página ${page + 1}` : 'Sin resultados'}
                </span>
                <Badge className={resultado.ok ? 'bg-green-100 text-green-800 border-green-200' : ''} variant={resultado.ok ? 'outline' : 'destructive'}>
                  HTTP {resultado.status}
                </Badge>
              </div>

              {rows.length > 0 ? (
                <>
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/60 border-b">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">XML&nbsp;&nbsp;PDF&nbsp;&nbsp;DL</th>
                          {Object.keys(rows[0] as object)
                            .filter(k => !['docGrePorEvento'].includes(k))
                            .map(k => (
                              <th key={k} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{k}</th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => {
                          const r = row as any
                          const key = `${r.numSerie}-${r.numCpe}`
                          return (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => verXML(r)} disabled={!!loadingDetalle} title="Ver datos XML" className="text-muted-foreground hover:text-primary transition-colors">
                                  {loadingDetalle === `xml-${key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                                <button onClick={() => verPDF(r)} disabled={!!loadingDetalle} title="Ver PDF" className="text-muted-foreground hover:text-blue-600 transition-colors">
                                  {loadingDetalle === `pdf-${key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                                </button>
                                <button onClick={() => descargarPDF(r)} disabled={!!loadingDetalle} title="Descargar PDF" className="text-muted-foreground hover:text-green-600 transition-colors">
                                  {loadingDetalle === `dl-${key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </td>
                            {Object.entries(r)
                              .filter(([k]) => !['docGrePorEvento'].includes(k))
                              .map(([, v], j) => (
                                <td key={j} className="px-3 py-2 font-mono whitespace-nowrap">{String(v ?? '-')}</td>
                              ))}
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => consultar(page - 1)} disabled={page === 0 || loading}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground px-1">Página {page + 1} · offset {page * 100}</span>
                    <Button variant="outline" size="sm" onClick={() => consultar(page + 1)} disabled={rows.length < 100 || loading}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-64 font-mono">
                  {JSON.stringify(resultado.data, null, 2)}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  )
}

function TokenBadge({ status }: { status: TokenStatus | null }) {
  if (!status) return <Badge variant="outline">Cargando...</Badge>
  if (status.active)
    return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />{status.minutes_left} min restantes</Badge>
  return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Expirado</Badge>
}
