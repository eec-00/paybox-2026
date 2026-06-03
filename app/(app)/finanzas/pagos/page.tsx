'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/lib/context/app-context'
import { PaymentForm } from '@/components/PaymentForm'
import { PaymentsTable } from '@/components/PaymentsTable'
import { ExportExcelModal } from '@/components/ExportExcelModal'
import { SyncOdooModal } from '@/components/SyncOdooModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  FileText, PlusCircle, Calendar as CalendarIcon, Filter,
  Search, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react'

export default function PagosPage() {
  const { isAdminUser, canCreate } = useApp()
  const supabase = createClient()

  const [refresh, setRefresh] = useState(0)
  const [showNewPaymentForm, setShowNewPaymentForm] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [docSearch, setDocSearch] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [currency, setCurrency] = useState('all')
  const [paymentType, setPaymentType] = useState('all')
  const [categorias, setCategorias] = useState<any[]>([])

  const [appliedFilters, setAppliedFilters] = useState({
    startDate: '',
    endDate: '',
    catSearch: '',
    docSearch: '',
    minAmount: '',
    maxAmount: '',
    selectedCategories: [] as string[],
    currency: 'all',
    paymentType: 'all',
  })

  useEffect(() => {
    supabase
      .from('categorias')
      .select('id, categoria_nombre')
      .order('categoria_nombre')
      .then(({ data }) => { if (data) setCategorias(data) })
  }, [supabase])

  const handleApplyFilters = () => {
    setAppliedFilters({ startDate, endDate, catSearch, docSearch, minAmount, maxAmount, selectedCategories, currency, paymentType })
    setRefresh(prev => prev + 1)
  }

  const handleClearFilters = () => {
    setStartDate(''); setEndDate(''); setCatSearch(''); setDocSearch('')
    setMinAmount(''); setMaxAmount(''); setSelectedCategories([])
    setCurrency('all'); setPaymentType('all')
    setAppliedFilters({ startDate: '', endDate: '', catSearch: '', docSearch: '', minAmount: '', maxAmount: '', selectedCategories: [], currency: 'all', paymentType: 'all' })
    setRefresh(prev => prev + 1)
  }

  const hasActiveFilters = startDate || endDate || selectedCategories.length > 0 || minAmount || maxAmount || currency !== 'all' || paymentType !== 'all' || docSearch

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 bg-card/40 p-3 sm:p-4 rounded-xl border border-border/50 shadow-sm">
        {/* Título + Acciones */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">Pagos</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">Historial y gestión de registros</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ExportExcelModal buttonVariant="outline" buttonSize="sm" buttonClass="h-8 sm:h-9 px-2 sm:px-4 bg-emerald-50 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 border-emerald-200 shadow-sm font-semibold text-xs rounded-lg" />
            {isAdminUser && <SyncOdooModal />}
            {canCreate && !showNewPaymentForm && (
              <Button onClick={() => setShowNewPaymentForm(true)} size="sm" className="h-8 sm:h-9 px-3 sm:px-5 shadow-md hover:shadow-lg transition-all font-bold text-xs rounded-lg bg-[#1a2332] hover:bg-[#2c3a4f]">
                <PlusCircle className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Nuevo pago</span>
              </Button>
            )}
          </div>
        </div>

        {/* Filtros de fecha */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-0 flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-0 bg-background rounded-lg border border-border shadow-sm">
            <div className="flex items-center gap-1 px-2 py-1 flex-1 min-w-0">
              <CalendarIcon className="h-3 w-3 text-primary/70 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">Desde</span>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-7 flex-1 min-w-0 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0" />
            </div>
            <div className="hidden sm:block h-4 w-[1px] bg-border/60 shrink-0" />
            <div className="flex items-center gap-1 px-2 py-1 flex-1 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">Hasta</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-7 flex-1 min-w-0 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0" />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button onClick={handleApplyFilters} size="sm" className="h-8 sm:h-9 px-3 sm:px-4 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-lg transition-all shadow-md active:scale-95">
              <Search className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Filtrar</span>
            </Button>
            <Button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} variant={showAdvancedFilters ? 'default' : 'outline'} size="sm" className={`h-8 sm:h-9 px-2 sm:px-3 text-xs font-semibold ${showAdvancedFilters ? 'bg-muted text-foreground hover:bg-muted-foreground/10' : 'bg-background hover:bg-muted/50'}`}>
              <span className="hidden sm:inline">Avanzados</span>
              <Filter className="sm:hidden h-3.5 w-3.5" />
              {showAdvancedFilters ? <ChevronUp className="h-4 w-4 ml-0 sm:ml-1" /> : <ChevronDown className="h-4 w-4 ml-0 sm:ml-1" />}
            </Button>
            {hasActiveFilters && (
              <Button onClick={handleClearFilters} variant="ghost" size="sm" className="h-8 sm:h-9 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5" title="Limpiar filtros">
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Filtros Avanzados */}
        {showAdvancedFilters && (
          <div className="bg-background border rounded-lg p-5 shadow-sm animate-in fade-in slide-in-from-top-2 text-sm mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Rango de Monto</label>
                <div className="flex items-center gap-2">
                  <Input placeholder="Mínimo" type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="h-9 text-xs focus-visible:ring-1" />
                  <span className="text-muted-foreground">-</span>
                  <Input placeholder="Máximo" type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="h-9 text-xs focus-visible:ring-1" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Tipo de Moneda</label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todas las monedas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las monedas</SelectItem>
                    <SelectItem value="soles">Soles (S/)</SelectItem>
                    <SelectItem value="dolares">Dólares ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Método de Pago</label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todos los métodos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los métodos</SelectItem>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Yape">Yape</SelectItem>
                    <SelectItem value="Plin">Plin</SelectItem>
                    <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Tipo de Documento</label>
                <Select value={docSearch || 'all'} onValueChange={(val) => setDocSearch(val === 'all' ? '' : val)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todos los documentos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los documentos</SelectItem>
                    <SelectItem value="factura">Factura</SelectItem>
                    <SelectItem value="comprobante">Comprobante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Por Categorías (Haz clic para seleccionar varias)</label>
                {selectedCategories.length > 0 && (
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full">{selectedCategories.length} seleccionadas</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto p-4 border rounded-md bg-muted/5">
                {categorias.map(cat => (
                  <label key={cat.id} className={`flex items-center gap-2 border px-3 py-1.5 rounded-md cursor-pointer transition-all select-none shadow-sm ${selectedCategories.includes(cat.id.toString()) ? 'bg-primary/10 border-primary/50 text-primary' : 'bg-background hover:bg-muted/50 hover:border-border'}`}>
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat.id.toString())}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedCategories([...selectedCategories, cat.id.toString()])
                        else setSelectedCategories(selectedCategories.filter(id => id !== cat.id.toString()))
                      }}
                      className="hidden"
                    />
                    <div className={`w-4 h-4 rounded-sm border flex items-center justify-center ${selectedCategories.includes(cat.id.toString()) ? 'bg-primary border-primary text-white' : 'border-input bg-transparent'}`}>
                      {selectedCategories.includes(cat.id.toString()) && <svg width="10" height="10" viewBox="0 0 15 14" fill="none"><path d="M2 7L6 11L13 2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <span className="text-xs font-medium">{cat.categoria_nombre}</span>
                  </label>
                ))}
                {categorias.length === 0 && <span className="text-xs text-muted-foreground italic">Cargando categorías...</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {showNewPaymentForm && canCreate && (
        <div className="bg-card border rounded-lg p-3 sm:p-6 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold text-primary">Nuevo Registro de Pago</h3>
              <p className="text-sm text-muted-foreground">Complete el formulario para registrar un nuevo pago</p>
            </div>
            <Button variant="outline" onClick={() => setShowNewPaymentForm(false)}>Cancelar</Button>
          </div>
          <PaymentForm onSuccess={() => { setRefresh(prev => prev + 1); setShowNewPaymentForm(false) }} />
        </div>
      )}

      <PaymentsTable
        refresh={refresh}
        externalCatSearch={appliedFilters.catSearch}
        externalDocSearch={appliedFilters.docSearch}
        externalStartDate={appliedFilters.startDate}
        externalEndDate={appliedFilters.endDate}
        externalMinAmount={appliedFilters.minAmount}
        externalMaxAmount={appliedFilters.maxAmount}
        externalCategories={appliedFilters.selectedCategories}
        externalCurrency={appliedFilters.currency}
        externalPaymentType={appliedFilters.paymentType}
      />
    </div>
  )
}
