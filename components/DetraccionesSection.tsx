'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Upload,
  FileSpreadsheet,
  Landmark,
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  Loader2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  conciliar,
  type BnRecord,
  type DetraccionRecord,
  type MatchedRecord,
  type SheetRow,
} from '@/lib/detracciones/conciliar'

const DIACRITICS_RE = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g'
)

function normSearch(v: unknown): string {
  return (v ?? '')
    .toString()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
}

function fmtMoney(n: number): string {
  return n.toFixed(2)
}

async function readWorkbookRows(file: File): Promise<SheetRow[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as SheetRow[]
}

interface DropzoneProps {
  label: string
  title: string
  hint: string
  fileName: string | null
  onFile: (file: File) => void
}

function Dropzone({ label, title, hint, fileName, onFile }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0])
      }}
      className={cn(
        'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
        fileName ? 'border-secondary bg-secondary/10' : 'border-input hover:border-secondary hover:bg-secondary/5',
        dragOver && 'border-secondary bg-secondary/10'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0])
        }}
      />
      <span className="inline-block text-[11px] uppercase tracking-wide font-semibold text-secondary-foreground bg-secondary/20 px-2 py-0.5 rounded-full mb-2">
        {label}
      </span>
      <div className="flex items-center justify-center gap-2">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      {fileName && <p className="text-xs font-mono mt-2 break-all text-foreground">{fileName}</p>}
    </div>
  )
}

interface StatProps {
  value: number
  label: string
  tone: 'ok' | 'bad' | 'neutral'
}

function Stat({ value, label, tone }: StatProps) {
  return (
    <Card className="py-4 gap-1">
      <CardContent className="px-4">
        <div
          className={cn(
            'text-2xl font-bold leading-none',
            tone === 'ok' && 'text-primary',
            tone === 'bad' && 'text-destructive'
          )}
        >
          {value}
        </div>
        <div className="text-xs text-muted-foreground mt-1.5">{label}</div>
      </CardContent>
    </Card>
  )
}

type ExportTarget = 'matched' | 'undet' | 'unbn'

export function DetraccionesSection() {
  const [detFile, setDetFile] = useState<File | null>(null)
  const [bnFile, setBnFile] = useState<File | null>(null)
  const [comparing, setComparing] = useState(false)
  const [exporting, setExporting] = useState<ExportTarget | null>(null)

  const [matched, setMatched] = useState<MatchedRecord[]>([])
  const [unDet, setUnDet] = useState<DetraccionRecord[]>([])
  const [unBn, setUnBn] = useState<BnRecord[]>([])
  const [debug, setDebug] = useState('')
  const [hasResults, setHasResults] = useState(false)

  const [qMatched, setQMatched] = useState('')
  const [qUnDet, setQUnDet] = useState('')
  const [qUnBn, setQUnBn] = useState('')

  const canRun = !!detFile && !!bnFile && !comparing

  const comparar = useCallback(async () => {
    if (!detFile || !bnFile) return
    setComparing(true)
    try {
      const [detRows, bnRows] = await Promise.all([readWorkbookRows(detFile), readWorkbookRows(bnFile)])
      const result = conciliar(detRows, bnRows)
      setMatched(result.matched)
      setUnDet(result.unDet)
      setUnBn(result.unBn)
      setDebug(result.debug)
      setHasResults(true)
      toast.success(`${result.matched.length} comprobantes conciliados`)
    } catch (err) {
      toast.error('No se pudo leer alguno de los archivos. Verifica que sean .xlsx válidos.')
      console.error(err)
    } finally {
      setComparing(false)
    }
  }, [detFile, bnFile])

  const reset = useCallback(() => {
    setDetFile(null)
    setBnFile(null)
    setMatched([])
    setUnDet([])
    setUnBn([])
    setDebug('')
    setHasResults(false)
    setQMatched('')
    setQUnDet('')
    setQUnBn('')
  }, [])

  const filteredMatched = useMemo(
    () =>
      matched.filter((m) => {
        if (!qMatched) return true
        const q = normSearch(qMatched)
        return [m.det.serie, m.det.numComp, m.det.ruc, m.det.nombreAdq].some((v) => normSearch(v).includes(q))
      }),
    [matched, qMatched]
  )
  const filteredUnDet = useMemo(
    () =>
      unDet.filter((d) => {
        if (!qUnDet) return true
        const q = normSearch(qUnDet)
        return [d.serie, d.numComp, d.ruc, d.nombreAdq].some((v) => normSearch(v).includes(q))
      }),
    [unDet, qUnDet]
  )
  const filteredUnBn = useMemo(
    () =>
      unBn.filter((b) => {
        if (!qUnBn) return true
        const q = normSearch(qUnBn)
        return [b.ruc, b.documento, b.trans].some((v) => normSearch(v).includes(q))
      }),
    [unBn, qUnBn]
  )

  const exportarExcel = useCallback(
    async (target: ExportTarget) => {
      setExporting(target)
      try {
        const workbook = new ExcelJS.Workbook()
        let sheetName: string
        let cols: [string, string][]
        let rows: unknown[][]

        if (target === 'matched') {
          sheetName = 'Conciliados'
          cols = [
            ['serie', 'SERIE'],
            ['numero', 'NUMERO'],
            ['ruc', 'RUC'],
            ['proveedor', 'PROVEEDOR / ADQUIRIENTE'],
            ['monto', 'MONTO'],
            ['fechaPagoDet', 'FECHA PAGO (DETRACCIÓN)'],
            ['fechaBn', 'FECHA BN'],
            ['documentoBn', 'DOCUMENTO BN'],
          ]
          rows = matched.map((m) => [
            m.det.serie, m.det.numComp, m.det.ruc, m.det.nombreAdq, m.det.monto, m.det.fechaPago, m.bn.fecha, m.bn.documento,
          ])
        } else if (target === 'undet') {
          sheetName = 'Sin abono BN'
          cols = [
            ['serie', 'SERIE'],
            ['numero', 'NUMERO'],
            ['ruc', 'RUC'],
            ['proveedor', 'PROVEEDOR / ADQUIRIENTE'],
            ['monto', 'MONTO'],
            ['fechaPago', 'FECHA PAGO'],
            ['constancia', 'CONSTANCIA'],
          ]
          rows = unDet.map((d) => [d.serie, d.numComp, d.ruc, d.nombreAdq, d.monto, d.fechaPago, d.constancia])
        } else {
          sheetName = 'Abonos sin comprobante'
          cols = [
            ['ruc', 'RUC'],
            ['monto', 'MONTO'],
            ['fecha', 'FECHA'],
            ['documento', 'DOCUMENTO'],
            ['trans', 'TRANS.'],
          ]
          rows = unBn.map((b) => [b.ruc, b.monto, b.fecha, b.documento, b.trans])
        }

        if (rows.length === 0) {
          toast.error('No hay filas para exportar')
          return
        }

        const worksheet = workbook.addWorksheet(sheetName)
        const colWidths = cols.map(([, label], i) => {
          const maxData = rows.reduce((max, row) => Math.max(max, String(row[i] ?? '').length), 0)
          return Math.max(label.length, maxData) + 2
        })
        worksheet.columns = cols.map(([key, label], i) => ({ header: label, key, width: colWidths[i] }))

        const blackBorder: Partial<import('exceljs').Borders> = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        }

        const headerRow = worksheet.getRow(1)
        headerRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2332' } }
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.border = { ...blackBorder, bottom: { style: 'medium', color: { argb: 'FF000000' } } }
        })
        headerRow.height = 22

        rows.forEach((row, i) => {
          const isEven = i % 2 === 0
          const r = worksheet.addRow(row)
          r.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF0F4FA' : 'FFFFFFFF' } }
            cell.font = { size: 10 }
            cell.alignment = { vertical: 'middle' }
            cell.border = blackBorder
          })
          r.height = 16
        })

        const buffer = await workbook.xlsx.writeBuffer()
        const today = new Date().toISOString().slice(0, 10)
        saveAs(new Blob([buffer]), `detracciones-${target}-${today}.xlsx`)
      } finally {
        setExporting(null)
      }
    },
    [matched, unDet, unBn]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Detracciones — Conciliación con Banco de la Nación</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Cruza el reporte SUNAT de detracciones con el estado de cuenta del BN, por RUC del proveedor + monto depositado.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Cargar archivos</CardTitle>
          </div>
          <CardDescription>
            El cruce usa <strong>Numero de Documento Adquiriente</strong> (RUC del proveedor real) + <strong>Monto Deposito</strong> del lado de detracciones,
            contra <strong>RUC</strong> + <strong>Abono</strong> del lado del BN. La fecha no se usa como filtro — solo se muestra como referencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Dropzone
              label="Archivo 1"
              title="Reporte de Detracciones"
              hint="Numero de Documento Adquiriente, Monto Deposito, Serie/Número de Comprobante..."
              fileName={detFile?.name ?? null}
              onFile={setDetFile}
            />
            <Dropzone
              label="Archivo 2"
              title="Movimientos Banco de la Nación"
              hint="El sistema detecta automáticamente las columnas de RUC y Abono."
              fileName={bnFile?.name ?? null}
              onFile={setBnFile}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={comparar} disabled={!canRun} size="sm">
              {comparing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />Comparando...
                </>
              ) : (
                <>
                  <Landmark className="h-4 w-4 mr-2" />Comparar archivos
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              <Trash2 className="h-4 w-4 mr-2" />Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasResults && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat value={matched.length} label="Comprobantes conciliados" tone="ok" />
            <Stat value={unDet.length} label="Sin abono encontrado" tone="bad" />
            <Stat value={unBn.length} label="Abonos BN sin comprobante" tone="bad" />
            <Stat value={matched.length + unDet.length} label="Total comprobantes analizados" tone="neutral" />
          </div>

          <ResultTable
            title="Conciliados"
            icon={<CheckCircle2 className="h-5 w-5 text-primary" />}
            search={qMatched}
            onSearch={setQMatched}
            exporting={exporting === 'matched'}
            onExport={() => exportarExcel('matched')}
            headers={['Serie', 'Número', 'RUC', 'Proveedor / Adquiriente', 'Monto', 'Fecha Pago (Detracción)', 'Fecha BN', 'Documento BN']}
            rows={filteredMatched.map((m) => [
              m.det.serie, m.det.numComp, m.det.ruc, m.det.nombreAdq, fmtMoney(m.det.monto), m.det.fechaPago, m.bn.fecha, m.bn.documento,
            ])}
          />

          <ResultTable
            title="Comprobantes de detracción sin abono en el BN"
            icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
            search={qUnDet}
            onSearch={setQUnDet}
            exporting={exporting === 'undet'}
            onExport={() => exportarExcel('undet')}
            headers={['Serie', 'Número', 'RUC', 'Proveedor / Adquiriente', 'Monto', 'Fecha Pago', 'Constancia']}
            rows={filteredUnDet.map((d) => [d.serie, d.numComp, d.ruc, d.nombreAdq, fmtMoney(d.monto), d.fechaPago, d.constancia])}
          />

          <ResultTable
            title="Abonos del BN sin comprobante identificado"
            icon={<FileWarning className="h-5 w-5 text-destructive" />}
            search={qUnBn}
            onSearch={setQUnBn}
            exporting={exporting === 'unbn'}
            onExport={() => exportarExcel('unbn')}
            headers={['RUC', 'Monto', 'Fecha', 'Documento', 'Trans.']}
            rows={filteredUnBn.map((b) => [b.ruc, fmtMoney(b.monto), b.fecha, b.documento, b.trans])}
          />

          {debug && <p className="text-xs text-muted-foreground font-mono">{debug}</p>}
        </>
      )}
    </div>
  )
}

interface ResultTableProps {
  title: string
  icon: React.ReactNode
  search: string
  onSearch: (v: string) => void
  exporting: boolean
  onExport: () => void
  headers: string[]
  rows: unknown[][]
}

function ResultTable({ title, icon, search, onSearch, exporting, onExport, headers, rows }: ResultTableProps) {
  return (
    <Card className="py-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono">{rows.length} filas</span>
          <Button variant="ghost" size="sm" onClick={onExport} disabled={exporting || rows.length === 0}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />}
            Exportar Excel
          </Button>
        </div>
      </div>
      <div className="px-4 py-2.5 border-b">
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar por RUC, proveedor, serie o número..."
          className="h-8 text-xs"
        />
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/60 border-b">
              {headers.map((h) => (
                <th key={h} className="sticky top-0 bg-muted/60 px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-muted-foreground">
                  Sin filas
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 whitespace-nowrap font-mono">
                      {cell === null || cell === undefined || cell === '' ? '—' : String(cell)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
