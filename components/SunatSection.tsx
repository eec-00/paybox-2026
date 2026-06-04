'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, CheckCircle2, XCircle, ShieldCheck,
  Search, ChevronLeft, ChevronRight, LogIn,
} from 'lucide-react'
import { toast } from 'sonner'

type ConexionStatus = 'idle' | 'loading' | 'ok' | 'error'

interface QueryResult {
  ok: boolean
  status: number
  data: unknown
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function monthAgo() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

export function SunatSection() {
  const searchParams = useSearchParams()
  const [conexion, setConexion] = useState<ConexionStatus>('idle')
  const [tokenPreview, setTokenPreview] = useState<string | null>(null)

  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected === '1') {
      setConexion('ok')
      toast.success('SUNAT conectado exitosamente')
    } else if (error) {
      setConexion('error')
      toast.error(`Error SUNAT: ${error}`)
    }
  }, [searchParams])

  async function testConexion() {
    setConexion('loading')
    setTokenPreview(null)
    try {
      const res = await fetch('/api/sunat/gre?test=1')
      const data = await res.json()
      if (data.ok) {
        setConexion('ok')
        setTokenPreview(data.token_preview)
        toast.success('Conexión SUNAT activa')
      } else {
        setConexion('error')
        toast.error(data.error ?? 'Error de conexión')
      }
    } catch {
      setConexion('error')
      toast.error('Error de red')
    }
  }

  function conectarSOL() {
    window.location.href = '/api/sunat/authorize'
  }

  // --- consulta por rango ---
  const [fechaInicio, setFechaInicio] = useState(today())
  const [fechaFin, setFechaFin] = useState(today())
  const [tipoGre, setTipoGre] = useState<'TRANSPORTISTA' | 'REMITENTE' | 'EVENTOS'>('TRANSPORTISTA')
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<QueryResult | null>(null)
  const [page, setPage] = useState(0)

  async function consultar(pageNum = 0) {
    setLoading(true)
    setResultado(null)
    setPage(pageNum)
    try {
      const params = new URLSearchParams({
        fechaInicio,
        fechaFin,
        tipoGre,
        numRegistros: String(pageNum * 100),
      })
      const res = await fetch(`/api/sunat/gre?${params}`)
      const json = await res.json()
      setResultado(json)
      if (json.ok) toast.success(`${rows.length || '?'} GRE encontradas`)
      else toast.error(`SUNAT status ${json.status}`)
    } catch {
      toast.error('Error al consultar SUNAT')
    } finally {
      setLoading(false)
    }
  }

  const rows: unknown[] = Array.isArray((resultado?.data as any)?.data)
    ? (resultado?.data as any).data
    : Array.isArray(resultado?.data)
    ? (resultado?.data as unknown[])
    : []

  const totalRows: number = (resultado?.data as any)?.total ?? rows.length
  const maxPorPagina = 100
  const totalPages = Math.ceil(totalRows / maxPorPagina) || 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SUNAT — GRE</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Guía de Remisión Electrónica · API /v1/contribuyente/gem
        </p>
      </div>

      {/* Conexión OAuth */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Conexión OAuth</CardTitle>
            </div>
            <ConnectionBadge status={conexion} />
          </div>
          <CardDescription>Verifica credenciales y obtiene token de acceso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><p className="text-muted-foreground">RUC</p><p className="font-mono font-medium">20523380347</p></div>
            <div><p className="text-muted-foreground">Alcance</p><p className="font-mono text-xs">api-cpe.sunat.gob.pe</p></div>
            <div><p className="text-muted-foreground">API</p><p className="font-mono text-xs">GRE /v1/contribuyente/gem</p></div>
            <div><p className="text-muted-foreground">Límite</p><p className="font-mono text-xs">100 filas / consulta</p></div>
          </div>
          {tokenPreview && (
            <div className="bg-muted rounded-md p-3 text-xs font-mono">
              <span className="text-muted-foreground">token: </span>{tokenPreview}
            </div>
          )}
          <Button onClick={testConexion} disabled={conexion === 'loading'} size="sm">
            {conexion === 'loading'
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando...</>
              : 'Verificar sesión SUNAT'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Sesión establecida automáticamente con credenciales SOL del servidor.
          </p>
        </CardContent>
      </Card>

      {/* Consulta por rango de fechas */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Consulta por Rango de Fechas</CardTitle>
          </div>
          <CardDescription>
            Devuelve hasta 100 comprobantes por página. Usa la paginación para ver más.
          </CardDescription>
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
            <Button onClick={() => consultar(0)} disabled={loading} size="sm">
              {loading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Consultando...</>
                : <><Search className="h-4 w-4 mr-2" />Consultar</>}
            </Button>
          </div>

          {/* Tabla de resultados */}
          {resultado && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {rows.length > 0
                    ? `${rows.length} filas · página ${page + 1}${totalRows > 0 ? ` de ${totalPages}` : ''}`
                    : 'Sin resultados'}
                </span>
                {resultado.ok && (
                  <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                    HTTP {resultado.status}
                  </Badge>
                )}
                {!resultado.ok && (
                  <Badge variant="destructive" className="text-xs">
                    HTTP {resultado.status}
                  </Badge>
                )}
              </div>

              {rows.length > 0 ? (
                <>
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/60 border-b">
                          {Object.keys(rows[0] as object).map((k) => (
                            <th key={k} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                            {Object.values(row as object).map((v, j) => (
                              <td key={j} className="px-3 py-2 font-mono whitespace-nowrap">
                                {String(v ?? '-')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginación */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => consultar(page - 1)}
                      disabled={page === 0 || loading}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground px-1">
                      Página {page + 1} · offset {page * maxPorPagina}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => consultar(page + 1)}
                      disabled={rows.length < maxPorPagina || loading}
                    >
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
  )
}

function ConnectionBadge({ status }: { status: ConexionStatus }) {
  if (status === 'idle') return <Badge variant="outline">Sin verificar</Badge>
  if (status === 'loading') return <Badge variant="secondary">Verificando...</Badge>
  if (status === 'ok')
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" />Conectado
      </Badge>
    )
  return (
    <Badge variant="destructive">
      <XCircle className="h-3 w-3 mr-1" />Error
    </Badge>
  )
}
