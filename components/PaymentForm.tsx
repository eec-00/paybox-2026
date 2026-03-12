'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageUploader, OCRData } from '@/components/ImageUploader'
import { getUserPermissions } from '@/lib/utils/auth'
import { Shield } from 'lucide-react'
import type { Categoria, CalendarioPago } from '@/lib/types/database.types'

interface PaymentFormProps {
  onSuccess?: () => void
}

export function PaymentForm({ onSuccess }: PaymentFormProps) {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null)
  const [selectedNaturaleza, setSelectedNaturaleza] = useState('')
  const [selectedSubgrupo, setSelectedSubgrupo] = useState('')
  const [categoriaSearch, setCategoriaSearch] = useState('')
  const [categoriasDropdownOpen, setCategoriasDropdownOpen] = useState(false)
  const categoriaRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canCreate, setCanCreate] = useState(false)
  const [checkingPermissions, setCheckingPermissions] = useState(true)

  // Datos fijos (para OCR)
  const [fechaYHoraPago, setFechaYHoraPago] = useState('')
  const [beneficiario, setBeneficiario] = useState('')
  const [monto, setMonto] = useState('')
  const [metodoPago, setMetodoPago] = useState('')
  const [bancoCuenta, setBancoCuenta] = useState('')
  const [moneda, setMoneda] = useState<'soles' | 'dolares'>('soles')

  // Nuevos campos OCR
  const [tipoDocumento, setTipoDocumento] = useState<'factura' | 'comprobante' | ''>('')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [ruc, setRuc] = useState('')

  // Datos dinámicos según categoría
  const [datosDinamicos, setDatosDinamicos] = useState<Record<string, string>>({})

  // Imágenes
  const [imageUrls, setImageUrls] = useState<string[]>([])

  // Pagos Programados (Calendario)
  const [pagosProgramados, setPagosProgramados] = useState<CalendarioPago[]>([])
  const [selectedPagoProgramado, setSelectedPagoProgramado] = useState<string>('none')

  const supabase = createClient()

  useEffect(() => {
    checkPermissions()
    loadCategorias()
    loadPagosProgramados()
  }, [])

  const loadPagosProgramados = async () => {
    try {
      // Get current Peru date YYYY-MM-DD
      const d = new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
      const localDate = new Date(d)
      const peruDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`

      const { data, error } = await supabase
        .from('calendario_pagos')
        .select('*')
        .eq('estado', 'pendiente')
        .lte('fecha', peruDate)
        .order('fecha', { ascending: true })

      if (!error && data) {
        setPagosProgramados(data)
      }
    } catch (err) {
      console.error('Error cargando pagos programados:', err)
    }
  }

  const checkPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const permissions = await getUserPermissions()
      setCanCreate(permissions.can_create)
    } catch (error) {
      console.error('Error checking permissions:', error)
      setCanCreate(false)
    } finally {
      setCheckingPermissions(false)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoriaRef.current && !categoriaRef.current.contains(e.target as Node)) {
        setCategoriasDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadCategorias = async () => {
    try {
      const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .order('categoria_nombre')

      if (error) throw error
      setCategorias(data || [])
    } catch (error: any) {
      console.error('Error al cargar categorías:', error)
    }
  }

  const handleNaturalezaChange = (val: string) => {
    const nuevo = val === 'all' ? '' : val
    setSelectedNaturaleza(nuevo)
    setSelectedSubgrupo('')
    setSelectedCategoria(null)
    setCategoriaSearch('')
    setDatosDinamicos({})
  }

  const handleSubgrupoChange = (val: string) => {
    setSelectedSubgrupo(val === 'all' ? '' : val)
    setSelectedCategoria(null)
    setCategoriaSearch('')
    setDatosDinamicos({})
  }

  const handleCategoriaSelect = (cat: Categoria) => {
    setSelectedCategoria(cat)
    setCategoriaSearch(cat.categoria_nombre)
    setCategoriasDropdownOpen(false)
    setDatosDinamicos({})
  }

  const naturalezas = [...new Set(categorias.map(c => c.naturaleza))].sort()
  const subgrupos = [...new Set(
    categorias
      .filter(c => !selectedNaturaleza || c.naturaleza === selectedNaturaleza)
      .map(c => c.subgrupo)
  )].sort()
  const filteredCategorias = categorias.filter(c => {
    if (selectedNaturaleza && c.naturaleza !== selectedNaturaleza) return false
    if (selectedSubgrupo && c.subgrupo !== selectedSubgrupo) return false
    if (categoriaSearch && !c.categoria_nombre.toLowerCase().includes(categoriaSearch.toLowerCase())) return false
    return true
  })

  const handlePagoProgramadoChange = (val: string) => {
    setSelectedPagoProgramado(val)
    if (val !== 'none') {
      const pago = pagosProgramados.find(p => p.id === val)
      if (pago) {
        setBeneficiario(pago.nombre_pago)
        if (!pago.monto_variable) {
          setMonto(pago.monto.toString())
        } else {
          setMonto('') // Monto variable, que lo llenen al pagar
        }
        setMoneda(pago.moneda)
        if (pago.numero_factura) {
          setTipoDocumento('factura')
          setNumeroDocumento(pago.numero_factura)
        }
        if (pago.descripcion) {
          setDescripcion(pago.descripcion)
        }
      }
    }
  }

  const handleDinamicoChange = (campo: string, valor: string) => {
    setDatosDinamicos(prev => ({
      ...prev,
      [campo]: valor
    }))
  }

  const handleOCRComplete = (data: OCRData) => {
    if (data.fecha && data.hora) {
      setFechaYHoraPago(`${data.fecha}T${data.hora}`)
    } else if (data.fecha) {
      setFechaYHoraPago(`${data.fecha}T00:00`)
    }

    if (data.beneficiario) {
      setBeneficiario(data.beneficiario)
    }

    if (data.monto) {
      setMonto(data.monto.toString())
    }

    if (data.moneda) {
      setMoneda(data.moneda)
    }

    if (data.metodo_pago) {
      setMetodoPago(data.metodo_pago)
    }

    if (data.tipo_documento) {
      setTipoDocumento(data.tipo_documento)
    }

    if (data.numero_documento) {
      setNumeroDocumento(data.numero_documento)
    }

    if (data.descripcion) {
      setDescripcion(data.descripcion)
    }

    if (data.ruc) {
      setRuc(data.ruc)
    }

    if (data.monto) {
      setMonto(data.monto.toString())
    }

    if (data.moneda) {
      setMoneda(data.moneda)
    }

    if (data.metodo_pago) {
      setMetodoPago(data.metodo_pago)
    }

    // Mostrar información según el tipo de documento
    let message = '✅ Datos extraídos exitosamente.\n\n'

    if (data.tipo_documento === 'factura') {
      message += '📄 Documento detectado: FACTURA ELECTRÓNICA\n'
      if (data.ruc) message += `🏢 RUC del emisor: ${data.ruc}\n`
      if (data.numero_documento) message += `📋 Número: ${data.numero_documento}\n`
      if (data.descripcion) message += `📝 Descripción: ${data.descripcion}\n`

      // Advertencia si el RUC es de EEMERSON SAC (error común)
      if (data.ruc === '20523380347') {
        message += '\n⚠️ ADVERTENCIA: El RUC detectado es de EEMERSON SAC (cliente).\n'
        message += 'Verifica que el beneficiario sea quien EMITE la factura, no el cliente.'
      }
    } else {
      message += '💳 Documento detectado: COMPROBANTE DE PAGO\n'
      if (data.metodo_pago) message += `💰 Método: ${data.metodo_pago}\n`
      if (data.numero_documento) message += `🔢 Operación: ${data.numero_documento}\n`
      if (data.descripcion) message += `📝 Concepto: ${data.descripcion}\n`
    }

    message += '\nPor favor verifica la información antes de guardar.'

    alert(message)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Usuario no autenticado')
      }

      if (!selectedCategoria) {
        throw new Error('Debe seleccionar una categoría')
      }

      // Validar que todos los ejes obligatorios estén completos
      const camposFaltantes = selectedCategoria.ejes_obligatorios.filter(
        eje => !datosDinamicos[eje] || datosDinamicos[eje].trim() === ''
      )

      if (camposFaltantes.length > 0) {
        throw new Error(`Faltan campos obligatorios: ${camposFaltantes.join(', ')}`)
      }

      // Convertir la fecha local a timestamp con zona horaria de Perú (UTC-5)
      // El datetime-local devuelve "YYYY-MM-DDTHH:mm" sin info de zona horaria
      // Necesitamos agregarlo para que Supabase lo guarde correctamente
      const fechaConZonaHoraria = fechaYHoraPago ? `${fechaYHoraPago}:00-05:00` : null

      const { data: insertedRegistro, error } = await supabase.from('registros').insert({
        fecha_y_hora_pago: fechaConZonaHoraria,
        beneficiario,
        monto: parseFloat(monto),
        metodo_pago: metodoPago,
        banco_cuenta: bancoCuenta || null,
        moneda,
        tipo_documento: tipoDocumento || null,
        numero_documento: numeroDocumento || null,
        descripcion: descripcion || null,
        ruc: ruc || null,
        categoria_id: selectedCategoria.id,
        datos_dinamicos: datosDinamicos,
        comprobantes: imageUrls.length > 0 ? imageUrls : null,
        creado_por: user.id
      }).select('id').single()

      if (error) throw error

      if (selectedPagoProgramado && selectedPagoProgramado !== 'none') {
        const { error: updateError } = await supabase.from('calendario_pagos')
          .update({ estado: 'pagado', registro_id: insertedRegistro.id })
          .eq('id', selectedPagoProgramado)

        if (updateError) {
          console.error('No se pudo actualizar el pago programado:', updateError)
        }
      }

      // Limpiar formulario
      setFechaYHoraPago('')
      setBeneficiario('')
      setMonto('')
      setMetodoPago('')
      setBancoCuenta('')
      setMoneda('soles')
      setTipoDocumento('')
      setNumeroDocumento('')
      setDescripcion('')
      setRuc('')
      setSelectedCategoria(null)
      setDatosDinamicos({})
      setImageUrls([])
      setSelectedPagoProgramado('none')

      if (onSuccess) onSuccess()
    } catch (error: any) {
      setError(error.message || 'Error al guardar el registro')
    } finally {
      setLoading(false)
    }
  }

  if (checkingPermissions) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Verificando permisos...</p>
        </CardContent>
      </Card>
    )
  }

  if (!canCreate) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Acceso Restringido</h3>
            <p className="text-muted-foreground">
              No tienes permisos para crear nuevos registros de pago.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Contacta con un administrador si necesitas acceso.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary">Nuevo Registro de Pago</CardTitle>
        <CardDescription>Complete los datos del comprobante</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Comprobantes (Imágenes) */}
          <div className="space-y-2 pb-4 border-b">
            <Label>Comprobantes</Label>
            <ImageUploader
              initialImages={imageUrls}
              onImagesChange={setImageUrls}
              onOCRComplete={handleOCRComplete}
              maxImages={4}
            />
          </div>

          {/* Vinculación con Calendario */}
          {pagosProgramados.length > 0 && (
            <div className="space-y-2 pb-4 border-b">
              <Label htmlFor="pagoProgramado">Vincular a Pago Programado (Opcional)</Label>
              <Select
                value={selectedPagoProgramado}
                onValueChange={handlePagoProgramadoChange}
                disabled={loading}
              >
                <SelectTrigger id="pagoProgramado">
                  <SelectValue placeholder="Seleccione un pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vincular a ningún pago</SelectItem>
                  {pagosProgramados.map(pago => (
                    <SelectItem key={pago.id} value={pago.id}>
                      {new Date(pago.fecha + 'T12:00:00').toLocaleDateString('es-PE')} - {pago.nombre_pago} ({pago.monto_variable ? 'Variable' : `${pago.moneda === 'soles' ? 'S/' : '$'} ${pago.monto}`})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Al seleccionar un pago programado, se autocompletarán los datos y se marcará como pagado al guardar.
              </p>
            </div>
          )}

          {/* Datos Fijos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Fila 1: Fecha y Beneficiario */}
            <div className="space-y-2">
              <Label htmlFor="fechaYHoraPago">Fecha y Hora de Pago *</Label>
              <Input
                id="fechaYHoraPago"
                type="datetime-local"
                value={fechaYHoraPago}
                onChange={(e) => setFechaYHoraPago(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="beneficiario">Beneficiario *</Label>
              <Input
                id="beneficiario"
                type="text"
                placeholder="Nombre del beneficiario"
                value={beneficiario}
                onChange={(e) => setBeneficiario(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* Fila 2: Monto, Moneda, Método de Pago */}
            <div className="space-y-2">
              <Label htmlFor="monto">Monto *</Label>
              <Input
                id="monto"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="moneda">Moneda *</Label>
              <Select value={moneda} onValueChange={(val) => setMoneda(val as 'soles' | 'dolares')} disabled={loading}>
                <SelectTrigger id="moneda" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="soles">Soles (S/)</SelectItem>
                  <SelectItem value="dolares">Dólares ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metodoPago">Método de Pago *</Label>
              <Select
                value={metodoPago}
                onValueChange={setMetodoPago}
                disabled={loading}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Efectivo">Efectivo</SelectItem>
                  <SelectItem value="Transferencia">Transferencia</SelectItem>
                  <SelectItem value="Yape">Yape</SelectItem>
                  <SelectItem value="Plin">Plin</SelectItem>
                  <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Fila 3: Banco/Cuenta, Tipo Documento, RUC (si es factura) */}
            <div className="space-y-2">
              <Label htmlFor="bancoCuenta">Banco/Cuenta</Label>
              <Input
                id="bancoCuenta"
                type="text"
                placeholder="Opcional"
                value={bancoCuenta}
                onChange={(e) => setBancoCuenta(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipoDocumento">Tipo de Documento</Label>
              <Select value={tipoDocumento} onValueChange={(val) => setTipoDocumento(val as 'factura' | 'comprobante' | '')} disabled={loading}>
                <SelectTrigger id="tipoDocumento" className="w-full">
                  <SelectValue placeholder="Selecciona tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="factura">Factura</SelectItem>
                  <SelectItem value="comprobante">Comprobante</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipoDocumento === 'factura' && (
              <div className="space-y-2">
                <Label htmlFor="ruc">RUC del Emisor</Label>
                <Input
                  id="ruc"
                  type="text"
                  placeholder="RUC"
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            {/* Fila 4: Número de Documento y Descripción */}
            <div className="space-y-2">
              <Label htmlFor="numeroDocumento">Número de Documento</Label>
              <Input
                id="numeroDocumento"
                type="text"
                placeholder="Nº Factura o Nº Operación"
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="descripcion">Descripción / Concepto</Label>
              <Input
                id="descripcion"
                type="text"
                placeholder="Breve descripción del gasto"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          {/* Selector de Categoría con filtros en cascada */}
          <div className="space-y-4 border-t pt-4">
            <p className="text-sm font-semibold text-secondary">Categoría *</p>

            {/* Paso 1 y 2: Filtros opcionales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Naturaleza (filtro opcional)</Label>
                <Select
                  value={selectedNaturaleza || 'all'}
                  onValueChange={handleNaturalezaChange}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las naturalezas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las naturalezas</SelectItem>
                    {naturalezas.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Subgrupo (filtro opcional)</Label>
                <Select
                  value={selectedSubgrupo || 'all'}
                  onValueChange={handleSubgrupoChange}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los subgrupos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los subgrupos</SelectItem>
                    {subgrupos.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Paso 3: Buscador de categoría */}
            <div className="space-y-1" ref={categoriaRef}>
              <Label className="text-xs text-muted-foreground">
                Buscar categoría
                {filteredCategorias.length > 0 && (
                  <span className="ml-1 text-muted-foreground/60">({filteredCategorias.length} disponibles)</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  placeholder="Escribe para buscar..."
                  value={categoriaSearch}
                  onChange={(e) => {
                    setCategoriaSearch(e.target.value)
                    setCategoriasDropdownOpen(true)
                    if (!e.target.value) setSelectedCategoria(null)
                  }}
                  onFocus={() => setCategoriasDropdownOpen(true)}
                  disabled={loading}
                />
                {categoriasDropdownOpen && (filteredCategorias.length > 0 || categoriaSearch) && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-56 overflow-y-auto">
                    {filteredCategorias.length > 0 ? (
                      filteredCategorias.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${selectedCategoria?.id === cat.id ? 'bg-primary/10 font-medium' : ''}`}
                          onClick={() => handleCategoriaSelect(cat)}
                        >
                          <span>{cat.categoria_nombre}</span>
                          <span className="text-xs text-muted-foreground ml-2">{cat.categoria_id_texto}</span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados para &ldquo;{categoriaSearch}&rdquo;</p>
                    )}
                  </div>
                )}
              </div>
              {selectedCategoria && (
                <p className="text-xs text-muted-foreground pt-1">
                  <span className="font-medium text-secondary">{selectedCategoria.naturaleza}</span>
                  {' · '}
                  {selectedCategoria.subgrupo}
                </p>
              )}
            </div>
          </div>

          {/* Campos Dinámicos según Categoría */}
          {selectedCategoria && selectedCategoria.ejes_obligatorios.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-secondary">Datos Específicos de la Categoría</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedCategoria.ejes_obligatorios.map((eje) => (
                  <div key={eje} className="space-y-2">
                    <Label htmlFor={`dinamico_${eje}`}>{eje} *</Label>
                    <Input
                      id={`dinamico_${eje}`}
                      type="text"
                      placeholder={`Ingrese ${eje}`}
                      value={datosDinamicos[eje] || ''}
                      onChange={(e) => handleDinamicoChange(eje, e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar Registro'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
