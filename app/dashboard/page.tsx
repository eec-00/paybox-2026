'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dashboard } from '@/components/Dashboard'
import { PaymentForm } from '@/components/PaymentForm'
import { PaymentsTable } from '@/components/PaymentsTable'
import { ExportExcelModal } from '@/components/ExportExcelModal'
import { UserManagement } from '@/components/UserManagement'
import { UsersList } from '@/components/UsersList'
import { VehiclesList } from '@/components/VehiclesList'
import { TutorialsList } from '@/components/TutorialsList'
import { TrailersTable } from '@/components/TrailersTable'
import { TrailerForm } from '@/components/TrailerForm'
import { Sidebar, type Section } from '@/components/Sidebar'
import { CalendarSection } from '@/components/CalendarSection'
import { UpdatesNotification } from '@/components/UpdatesNotification'
import { UpdatesManagement } from '@/components/UpdatesManagement'
import { UpdatesList } from '@/components/UpdatesList'
import { isAdmin, getUserPermissions, getCurrentUserProfile } from '@/lib/utils/auth'
import { LogOut, Shield, Car, PlayCircle, Menu, X, PlusCircle, FileText, Megaphone, Calendar as CalendarIcon, Filter, Search, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import Image from 'next/image'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [refresh, setRefresh] = useState(0)
  const [activeSection, setActiveSection] = useState<Section>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showNewPaymentForm, setShowNewPaymentForm] = useState(false)
  const [showNewTrailerForm, setShowNewTrailerForm] = useState(false)
  const [trailerToEdit, setTrailerToEdit] = useState<any>(null)
  const [isDeveloper, setIsDeveloper] = useState(false)
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [canCreate, setCanCreate] = useState(false)

  // Estados de filtros para Pagos
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
    paymentType: 'all'
  })

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarCollapsed(true)
  }, [])

  const handleApplyFilters = () => {
    setAppliedFilters({
      startDate,
      endDate,
      catSearch,
      docSearch,
      minAmount,
      maxAmount,
      selectedCategories,
      currency,
      paymentType
    })
    setRefresh(prev => prev + 1)
  }

  const handleClearFilters = () => {
    setStartDate('')
    setEndDate('')
    setCatSearch('')
    setDocSearch('')
    setMinAmount('')
    setMaxAmount('')
    setSelectedCategories([])
    setCurrency('all')
    setPaymentType('all')
    setAppliedFilters({
      startDate: '',
      endDate: '',
      catSearch: '',
      docSearch: '',
      minAmount: '',
      maxAmount: '',
      selectedCategories: [],
      currency: 'all',
      paymentType: 'all'
    })
    setRefresh(prev => prev + 1)
  }

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)

        // Verificar si es developer
        const profile = await getCurrentUserProfile()
        setIsDeveloper(profile?.role === 'developer')

        // Verificar admin
        const adminStatus = await isAdmin()
        setIsAdminUser(adminStatus)

        // Obtener permisos
        const permissions = await getUserPermissions()
        setCanCreate(permissions.can_create)
      }
    }

    const fetchCategorias = async () => {
      const { data } = await supabase.from('categorias').select('id, categoria_nombre').order('categoria_nombre')
      if (data) setCategorias(data)
    }

    checkUser()
    fetchCategorias()
  }, [router, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleSectionChange = (section: Section) => {
    setActiveSection(section)
    if (window.innerWidth < 768) setSidebarCollapsed(true)
  }

  const handleSuccess = () => {
    setRefresh(prev => prev + 1)
    setShowNewPaymentForm(false)
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header reorganizado */}
      <header className="border-b bg-gradient-to-r from-primary via-primary to-primary/95 shadow-lg sticky top-0 z-50">
        <div className="px-3 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-2">
          {/* Logo y nombre de la empresa */}
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              {/* Botón de colapsar sidebar */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="h-9 w-9 bg-white/10 hover:bg-white/20 text-white rounded-md transition-all hover:scale-110"
                title={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
              >
                {sidebarCollapsed ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </Button>

              <div className="relative w-10 h-10 sm:w-12 sm:h-12 shrink-0">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  fill
                  className="object-contain"
                />
              </div>
              <div>
                <h1 className="font-bold text-lg sm:text-2xl text-white font-[family-name:var(--font-montserrat)]">PayBox</h1>
                <p className="text-[11px] sm:text-sm text-white/70 leading-tight">Eemerson SAC</p>
              </div>
            </div>

            {/* Separador y mensaje de bienvenida - oculto en móvil */}
            <div className="hidden md:flex items-center gap-4">
              <div className="h-8 w-px bg-white/30"></div>
              <div>
                <p className="text-sm text-white font-medium">
                  Bienvenido, {user.user_metadata?.full_name || user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Botón de cerrar sesión */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <UpdatesNotification />
            <Button variant="secondary" onClick={handleLogout} className="shadow-md hover:shadow-lg transition-shadow h-9 sm:h-10 px-3 sm:px-4 text-sm">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Layout con Sidebar */}
      <div className="flex flex-1">
        {/* Backdrop móvil - oscurece el contenido al abrir sidebar */}
        {!sidebarCollapsed && (
          <div
            className="fixed inset-0 top-16 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}

        {/* Sidebar */}
        <Sidebar
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          isAdmin={isAdminUser}
          canCreate={canCreate}
          collapsed={sidebarCollapsed}
        />

        {/* Main Content */}
        <main className="flex-1 p-2 sm:p-4 md:p-8 overflow-auto min-w-0">
          <div className="w-full max-w-[1600px] mx-auto min-w-0">
            {activeSection === 'dashboard' && <Dashboard />}

            {activeSection === 'pagos' && (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 bg-card/40 p-3 sm:p-4 rounded-xl border border-border/50 shadow-sm">
                  {/* Fila 1: Título + Botones de Acción */}
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
                      {canCreate && !showNewPaymentForm && (
                        <Button
                          onClick={() => setShowNewPaymentForm(true)}
                          size="sm"
                          className="h-8 sm:h-9 px-3 sm:px-5 shadow-md hover:shadow-lg transition-all font-bold text-xs rounded-lg bg-[#1a2332] hover:bg-[#2c3a4f]"
                        >
                          <PlusCircle className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Nuevo pago</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Fila 2: Filtros de fecha + botones */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Fechas: en móvil separadas, en desktop juntas */}
                    <div className="flex flex-1 min-w-0 flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-0 bg-background rounded-lg border border-border shadow-sm">
                      <div className="flex items-center gap-1 px-2 py-1 flex-1 min-w-0">
                        <CalendarIcon className="h-3 w-3 text-primary/70 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">Desde</span>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="h-7 flex-1 min-w-0 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0"
                        />
                      </div>
                      <div className="hidden sm:block h-4 w-[1px] bg-border/60 shrink-0" />
                      <div className="flex items-center gap-1 px-2 py-1 flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">Hasta</span>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="h-7 flex-1 min-w-0 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        onClick={handleApplyFilters}
                        size="sm"
                        className="h-8 sm:h-9 px-3 sm:px-4 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-lg transition-all shadow-md active:scale-95"
                      >
                        <Search className="h-3.5 w-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Filtrar</span>
                      </Button>
                      <Button
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        variant={showAdvancedFilters ? "default" : "outline"}
                        size="sm"
                        className={`h-8 sm:h-9 px-2 sm:px-3 text-xs font-semibold ${showAdvancedFilters ? "bg-muted text-foreground hover:bg-muted-foreground/10" : "bg-background hover:bg-muted/50"}`}
                      >
                        <span className="hidden sm:inline">Avanzados</span>
                        <Filter className="sm:hidden h-3.5 w-3.5" />
                        {showAdvancedFilters ? <ChevronUp className="h-4 w-4 ml-0 sm:ml-1" /> : <ChevronDown className="h-4 w-4 ml-0 sm:ml-1" />}
                      </Button>
                      {(startDate || endDate || selectedCategories.length > 0 || minAmount || maxAmount || currency !== 'all' || paymentType !== 'all' || docSearch) && (
                        <Button
                          onClick={handleClearFilters}
                          variant="ghost"
                          size="sm"
                          className="h-8 sm:h-9 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                          title="Limpiar filtros"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Filtros Avanzados */}
                  {showAdvancedFilters && (
                    <div className="bg-background border rounded-lg p-5 shadow-sm animate-in fade-in slide-in-from-top-2 text-sm mt-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Monto Mínimo y Máximo */}
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Rango de Monto</label>
                          <div className="flex items-center gap-2">
                            <Input placeholder="Mínimo" type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="h-9 text-xs focus-visible:ring-1" />
                            <span className="text-muted-foreground">-</span>
                            <Input placeholder="Máximo" type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="h-9 text-xs focus-visible:ring-1" />
                          </div>
                        </div>

                        {/* Moneda */}
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Tipo de Moneda</label>
                          <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Todas las monedas" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas las monedas</SelectItem>
                              <SelectItem value="soles">Soles (S/)</SelectItem>
                              <SelectItem value="dolares">Dólares ($)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Tipo de Pago */}
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Método de Pago</label>
                          <Select value={paymentType} onValueChange={setPaymentType}>
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Todos los métodos" />
                            </SelectTrigger>
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

                        {/* Tipo de Documento */}
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Tipo de Documento</label>
                          <Select value={docSearch || "all"} onValueChange={(val) => setDocSearch(val === "all" ? "" : val)}>
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Todos los documentos" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos los documentos</SelectItem>
                              <SelectItem value="factura">Factura</SelectItem>
                              <SelectItem value="comprobante">Comprobante</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Categorías (Multiple) */}
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
                                {selectedCategories.includes(cat.id.toString()) && <svg width="10" height="10" viewBox="0 0 15 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 7L6 11L13 2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </div>
                              <span className="text-xs font-medium">{cat.categoria_nombre}</span>
                            </label>
                          ))}
                          {categorias.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">Cargando categorías...</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Formulario de nuevo pago embebido */}
                {showNewPaymentForm && canCreate && (
                  <div className="bg-card border rounded-lg p-3 sm:p-6 shadow-md">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-primary">Nuevo Registro de Pago</h3>
                        <p className="text-sm text-muted-foreground">Complete el formulario para registrar un nuevo pago</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setShowNewPaymentForm(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                    <PaymentForm onSuccess={handleSuccess} />
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
            )}

            {activeSection === 'calendario' && (
              <CalendarSection />
            )}

            {activeSection === 'trailers' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-6">
                  <Car className="h-6 w-6 text-primary" />
                  <div>
                    <h2 className="text-2xl font-bold text-primary">Gestión de Trailers</h2>
                    <p className="text-muted-foreground">Visualiza y gestiona los servicios de trailers y contenedores</p>
                  </div>
                </div>

                {(showNewTrailerForm || trailerToEdit) && canCreate && (
                  <div className="bg-card border rounded-lg p-6 shadow-md mb-6 pt-4">
                    <TrailerForm
                      initialData={trailerToEdit}
                      onSuccess={() => {
                        setRefresh(prev => prev + 1)
                        setShowNewTrailerForm(false)
                        setTrailerToEdit(null)
                      }}
                      onCancel={() => {
                        setShowNewTrailerForm(false)
                        setTrailerToEdit(null)
                      }}
                    />
                  </div>
                )}

                {!showNewTrailerForm && !trailerToEdit && (
                  <TrailersTable
                    refresh={refresh}
                    onEdit={(record) => {
                      setTrailerToEdit(record)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    onCopy={(record) => {
                      const { id, created_at, ...rest } = record

                      // Get current Peru date YYYY-MM-DD
                      const d = new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
                      const localDate = new Date(d)
                      const peruDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`

                      setTrailerToEdit({ ...rest, fecha: peruDate })
                      setShowNewTrailerForm(true)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    headerAction={
                      canCreate ? (
                        <Button
                          onClick={() => setShowNewTrailerForm(true)}
                          size="sm"
                          className="h-8 shadow-sm"
                        >
                          <PlusCircle className="h-4 w-4 mr-2" />
                          Nuevo servicio
                        </Button>
                      ) : null
                    }
                  />
                )}
              </div>
            )}

            {activeSection === 'vehiculos' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Car className="h-6 w-6 text-primary" />
                  <div>
                    <h2 className="text-2xl font-bold text-primary">Vehículos</h2>
                    <p className="text-muted-foreground">Visualiza la flota de vehículos GPS de Navitel</p>
                  </div>
                </div>
                <VehiclesList />
              </div>
            )}

            {activeSection === 'tutoriales' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <PlayCircle className="h-6 w-6 text-secondary" />
                  <div>
                    <h2 className="text-2xl font-bold text-primary">Tutoriales</h2>
                    <p className="text-muted-foreground">Aprende a usar PayBox con nuestros videos guía</p>
                  </div>
                </div>
                <TutorialsList />
              </div>
            )}

            {activeSection === 'updates' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-6 w-6 text-primary" />
                    <div>
                      <h2 className="text-2xl font-bold text-primary">Actualizaciones del Sistema</h2>
                      <p className="text-muted-foreground">Mantente informado sobre las mejoras y nuevas funcionalidades</p>
                    </div>
                  </div>
                  {isDeveloper && (
                    <Button onClick={() => {
                      // Trigger new update dialog from UpdatesManagement
                      const event = new CustomEvent('openUpdateDialog')
                      window.dispatchEvent(event)
                    }}>
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Nueva Actualización
                    </Button>
                  )}
                </div>

                {/* Panel de gestión solo para developers */}
                {isDeveloper && <UpdatesManagement />}

                {/* Lista de actualizaciones para todos */}
                <UpdatesList />
              </div>
            )}

            {activeSection === 'administracion' && (
              <div className="space-y-6">
                {(isAdminUser || isDeveloper) ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Shield className="h-6 w-6 text-secondary" />
                      <div>
                        <h2 className="text-2xl font-bold text-primary">Panel de Administración</h2>
                        <p className="text-muted-foreground">Gestiona usuarios y permisos del sistema</p>
                      </div>
                    </div>

                    {/* Lista de usuarios existentes */}
                    <UsersList />

                    {/* Formulario para crear nuevos usuarios */}
                    <UserManagement />
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">Acceso Restringido</h3>
                    <p className="text-muted-foreground">
                      Solo los administradores y developers pueden acceder a esta sección
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
