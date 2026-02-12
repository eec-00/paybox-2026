'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Categoria, Registro } from '@/lib/types/database.types'
import { ImageUploader, OCRData } from './ImageUploader'

interface EditPaymentFormProps {
  registro: Registro
  onSuccess: () => void
  onCancel: () => void
}

export default function EditPaymentForm({ registro, onSuccess, onCancel }: EditPaymentFormProps) {
  const supabase = createClient()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null)
  const [loading, setLoading] = useState(false)

  // Campos básicos
  const [fechaYHoraPago, setFechaYHoraPago] = useState('')
  const [beneficiario, setBeneficiario] = useState('')
  const [monto, setMonto] = useState('')
  const [metodoPago, setMetodoPago] = useState('')
  const [bancoCuenta, setBancoCuenta] = useState('')
  const [moneda, setMoneda] = useState<'soles' | 'dolares'>('soles')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  
  // Nuevos campos OCR
  const [tipoDocumento, setTipoDocumento] = useState<'factura' | 'comprobante' | ''>('')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [ruc, setRuc] = useState('')

  // Campos dinámicos
  const [datosDinamicos, setDatosDinamicos] = useState<Record<string, any>>({})

  useEffect(() => {
    initializeForm()
    loadCategorias()
  }, [])

  const initializeForm = () => {
    // Convertir fecha ISO a formato datetime-local
    const fecha = new Date(registro.fecha_y_hora_pago)
    const fechaLocal = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)

    setFechaYHoraPago(fechaLocal)
    setBeneficiario(registro.beneficiario)
    setMonto(registro.monto.toString())
    setMetodoPago(registro.metodo_pago)
    setBancoCuenta(registro.banco_cuenta || '')
    setMoneda(registro.moneda)
    setImageUrls(registro.comprobantes || [])
    setDatosDinamicos(registro.datos_dinamicos || {})
    
    // Inicializar nuevos campos OCR con validación de tipos
    const tipoDoc = registro.tipo_documento
    if (tipoDoc === 'factura' || tipoDoc === 'comprobante') {
      setTipoDocumento(tipoDoc)
    } else {
      setTipoDocumento('')
    }
    setNumeroDocumento(registro.numero_documento || '')
    setDescripcion(registro.descripcion || '')
    setRuc(registro.ruc || '')
  }

  const loadCategorias = async () => {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .order('categoria_nombre')

    if (error) {
      console.error('Error al cargar categorías:', error)
      return
    }

    setCategorias(data || [])

    // Encontrar y seleccionar la categoría del registro
    const categoriaActual = data?.find((c: Categoria) => c.id === registro.categoria_id)
    if (categoriaActual) {
      setSelectedCategoria(categoriaActual)
    }
  }

  const handleCategoriaChange = (categoriaId: string) => {
    const categoria = categorias.find(c => c.id === parseInt(categoriaId))
    if (categoria) {
      setSelectedCategoria(categoria)
      // Si cambia la categoría, mantener los datos dinámicos existentes
      // pero si es una categoría diferente, inicializar los ejes obligatorios vacíos
      if (categoria.id !== registro.categoria_id) {
        const nuevosDatosDinamicos: Record<string, any> = {}
        categoria.ejes_obligatorios.forEach((eje: string) => {
          nuevosDatosDinamicos[eje] = datosDinamicos[eje] || ''
        })
        setDatosDinamicos(nuevosDatosDinamicos)
      }
    }
  }

  const handleDinamicoChange = (nombre: string, valor: any) => {
    setDatosDinamicos(prev => ({
      ...prev,
      [nombre]: valor
    }))
  }

  const handleOCRComplete = (data: OCRData) => {
    // Rellenar automáticamente los campos con los datos extraídos del OCR
    if (data.beneficiario) {
      setBeneficiario(data.beneficiario)
    }

    if (data.monto) {
      setMonto(data.monto.toString())
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

    alert('Datos extraídos exitosamente del OCR. Por favor verifica la información antes de guardar.')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedCategoria) {
      alert('Por favor selecciona una categoría')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase
        .from('registros')
        .update({
          fecha_y_hora_pago: fechaYHoraPago,
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
          comprobantes: imageUrls.length > 0 ? imageUrls : null
        })
        .eq('id', registro.id)

      if (error) throw error

      onSuccess()
    } catch (error) {
      console.error('Error al actualizar registro:', error)
      alert('Error al actualizar el registro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader className="pb-4 border-b">
        <DialogTitle className="text-2xl text-primary">Editar Registro de Pago</DialogTitle>
        <DialogDescription className="text-base">
          Modifica la información del comprobante
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-6 max-h-[70vh] overflow-y-auto px-1">
        {/* Comprobantes (Imágenes) - Primero */}
        <div className="space-y-2 pb-4 border-b">
          <Label className="text-base font-semibold">Comprobantes</Label>
          <ImageUploader
            initialImages={imageUrls}
            onImagesChange={setImageUrls}
            onOCRComplete={handleOCRComplete}
            maxImages={4}
          />
        </div>

        {/* Datos Principales en Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Fecha y Hora */}
          <div className="space-y-2">
            <Label htmlFor="fecha">Fecha y Hora de Pago *</Label>
            <Input
              id="fecha"
              type="datetime-local"
              value={fechaYHoraPago}
              onChange={(e) => setFechaYHoraPago(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Beneficiario - Ocupa 2 columnas */}
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="beneficiario">Beneficiario *</Label>
            <Input
              id="beneficiario"
              value={beneficiario}
              onChange={(e) => setBeneficiario(e.target.value)}
              placeholder="Nombre del beneficiario"
              required
              disabled={loading}
            />
          </div>

          {/* Monto, Moneda, Método de Pago */}
          <div className="space-y-2">
            <Label htmlFor="monto">Monto *</Label>
            <Input
              id="monto"
              type="number"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
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
            <Label htmlFor="metodo">Método de Pago *</Label>
            <Select value={metodoPago} onValueChange={setMetodoPago} required disabled={loading}>
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

          {/* Banco/Cuenta, Tipo Documento, RUC */}
          <div className="space-y-2">
            <Label htmlFor="banco">Banco/Cuenta</Label>
            <Input
              id="banco"
              value={bancoCuenta}
              onChange={(e) => setBancoCuenta(e.target.value)}
              placeholder="Opcional"
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

          {/* Número de Documento y Descripción */}
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

        {/* Categoría */}
        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="categoria" className="text-base font-semibold">Categoría *</Label>
          <Select
            value={selectedCategoria?.id.toString() || ''}
            onValueChange={handleCategoriaChange}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una categoría" />
            </SelectTrigger>
            <SelectContent>
              {categorias.map((cat) => (
                <SelectItem key={cat.id} value={cat.id.toString()}>
                  {cat.categoria_nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campos Dinámicos */}
        {selectedCategoria && selectedCategoria.ejes_obligatorios && selectedCategoria.ejes_obligatorios.length > 0 && (
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-base text-secondary">Datos Específicos de la Categoría</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedCategoria.ejes_obligatorios.map((eje: string) => (
                <div key={eje} className="space-y-2">
                  <Label htmlFor={eje}>
                    {eje} *
                  </Label>
                  <Input
                    id={eje}
                    value={datosDinamicos[eje] || ''}
                    onChange={(e) => handleDinamicoChange(eje, e.target.value)}
                    placeholder={eje}
                    required
                    disabled={loading}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading} className="min-w-[120px]">
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </DialogFooter>
    </form>
  )
}
