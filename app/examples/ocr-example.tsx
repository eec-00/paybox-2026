/**
 * ARCHIVO DE EJEMPLO: Cómo usar el sistema OCR con PDFs
 * Este archivo muestra diferentes escenarios de uso del componente ImageUploader
 */

'use client'

import { useState } from 'react'
import { ImageUploader, OCRData } from '@/components/ImageUploader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function OCRExamplePage() {
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [ocrResult, setOcrResult] = useState<OCRData | null>(null)

  /**
   * Callback que se ejecuta cuando el OCR termina de analizar
   * @param data - Datos extraídos del documento
   */
  const handleOCRComplete = (data: OCRData) => {
    console.log('📄 Datos extraídos:', data)
    setOcrResult(data)

    // Lógica según el tipo de documento
    if (data.tipo_documento === 'factura') {
      console.log('✅ Es una FACTURA')
      console.log('🏢 RUC del emisor:', data.ruc)
      console.log('📋 Número de factura:', data.numero_documento)
      console.log('📝 Descripción:', data.descripcion)
    } else {
      console.log('✅ Es un COMPROBANTE de pago')
      console.log('💳 Método de pago:', data.metodo_pago)
      console.log('🔢 Número de operación:', data.numero_documento)
    }

    // Datos comunes
    console.log('👤 Beneficiario:', data.beneficiario)
    console.log('💰 Monto:', `${data.monto} ${data.moneda}`)
    console.log('📅 Fecha:', data.fecha)
    console.log('⏰ Hora:', data.hora || 'N/A')
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>🧪 Ejemplo de Uso - Sistema OCR con PDFs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Componente de carga */}
          <div>
            <h3 className="text-lg font-semibold mb-4">1. Cargar Documentos</h3>
            <ImageUploader
              initialImages={imageUrls}
              onImagesChange={setImageUrls}
              onOCRComplete={handleOCRComplete}
              maxImages={4}
              canUpload={true}
              canDelete={true}
              showOCRButton={true}
            />
          </div>

          {/* Resultado del OCR */}
          {ocrResult && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">2. Resultado del Análisis</h3>
              
              {/* Badge de tipo */}
              <div>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                  ocrResult.tipo_documento === 'factura' 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-green-100 text-green-800'
                }`}>
                  {ocrResult.tipo_documento === 'factura' ? '📄 Factura Electrónica' : '💳 Comprobante de Pago'}
                </span>
              </div>

              {/* Datos extraídos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Beneficiario</p>
                    <p className="font-semibold">{ocrResult.beneficiario || 'No detectado'}</p>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Monto</p>
                    <p className="font-semibold">
                      {ocrResult.moneda === 'soles' ? 'S/' : '$'} {ocrResult.monto?.toFixed(2) || '0.00'}
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Fecha</p>
                    <p className="font-semibold">{ocrResult.fecha || 'No detectado'}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {ocrResult.tipo_documento === 'factura' ? (
                    // Campos específicos de factura
                    <>
                      <div className="p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-500">RUC del Emisor</p>
                        <p className="font-semibold">{ocrResult.ruc || 'No detectado'}</p>
                      </div>
                      
                      <div className="p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-500">Número de Documento</p>
                        <p className="font-semibold">{ocrResult.numero_documento || 'No detectado'}</p>
                      </div>

                      <div className="p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-500">Descripción</p>
                        <p className="font-semibold text-sm">{ocrResult.descripcion || 'No detectado'}</p>
                      </div>
                    </>
                  ) : (
                    // Campos específicos de comprobante
                    <>
                      <div className="p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-500">Método de Pago</p>
                        <p className="font-semibold">{ocrResult.metodo_pago || 'No detectado'}</p>
                      </div>
                      
                      <div className="p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-500">Número de Operación</p>
                        <p className="font-semibold">{ocrResult.numero_documento || 'No detectado'}</p>
                      </div>

                      <div className="p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-500">Descripción/Concepto</p>
                        <p className="font-semibold text-sm">{ocrResult.descripcion || 'No detectado'}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* JSON Raw */}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                  Ver JSON completo
                </summary>
                <pre className="mt-2 p-4 bg-gray-900 text-green-400 rounded overflow-x-auto text-xs">
                  {JSON.stringify(ocrResult, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {/* Instrucciones */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-2">💡 Instrucciones</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>✅ <strong>Paso 1:</strong> Sube una imagen (PNG/JPG) o un PDF de factura/comprobante</li>
              <li>✅ <strong>Paso 2:</strong> Si subes un PDF, se convertirá automáticamente a imagen</li>
              <li>✅ <strong>Paso 3:</strong> Haz click en &quot;Analizar con OCR (IA)&quot;</li>
              <li>✅ <strong>Paso 4:</strong> Espera 3-8 segundos mientras OpenAI analiza el documento</li>
              <li>✅ <strong>Paso 5:</strong> Revisa los datos extraídos y verifica su exactitud</li>
            </ul>
          </div>

          {/* Tipos de documentos soportados */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-2">📋 Tipos de Documentos Soportados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded">
                <h4 className="font-semibold text-blue-600 mb-2">📄 Facturas Electrónicas</h4>
                <p className="text-sm text-gray-600 mb-2">
                  Detecta automáticamente facturas que contengan:
                </p>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>✓ RUC del emisor</li>
                  <li>✓ Razón social</li>
                  <li>✓ Número de factura (Ej: F001-00001234)</li>
                  <li>✓ Monto total</li>
                  <li>✓ Descripción de servicios/productos</li>
                </ul>
              </div>

              <div className="p-4 border rounded">
                <h4 className="font-semibold text-green-600 mb-2">💳 Comprobantes de Pago</h4>
                <p className="text-sm text-gray-600 mb-2">
                  Soporta comprobantes de:
                </p>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>✓ Yape</li>
                  <li>✓ Plin</li>
                  <li>✓ Transferencias bancarias (BCP, etc.)</li>
                  <li>✓ Efectivo</li>
                  <li>✓ Tarjetas de crédito/débito</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * EJEMPLOS DE USO EN DIFERENTES ESCENARIOS
 */

// ============================================
// Ejemplo 1: Solo lectura (sin edición)
// ============================================
export function ReadOnlyExample() {
  const existingImages = [
    'https://supabase.com/storage/comprobante1.jpg',
    'https://supabase.com/storage/comprobante2.jpg'
  ]

  return (
    <ImageUploader
      initialImages={existingImages}
      onImagesChange={() => {}} // No permite cambios
      canUpload={false}
      canDelete={false}
      showOCRButton={false}
    />
  )
}

// ============================================
// Ejemplo 2: Pre-llenar formulario con OCR
// ============================================
export function FormWithOCRExample() {
  const [formData, setFormData] = useState({
    beneficiario: '',
    monto: 0,
    moneda: 'soles' as 'soles' | 'dolares',
    fecha: '',
    metodo_pago: '',
    // Campos opcionales
    ruc: '',
    numero_documento: '',
    descripcion: ''
  })

  const handleOCR = (data: OCRData) => {
    // Pre-llenar el formulario con los datos extraídos
    setFormData({
      beneficiario: data.beneficiario || '',
      monto: data.monto || 0,
      moneda: data.moneda,
      fecha: data.fecha || '',
      metodo_pago: data.metodo_pago || '',
      // Campos condicionales según tipo
      ruc: data.ruc || '',
      numero_documento: data.numero_documento || '',
      descripcion: data.descripcion || ''
    })
  }

  return (
    <div>
      <ImageUploader
        initialImages={[]}
        onImagesChange={() => {}}
        onOCRComplete={handleOCR}
      />

      {/* Formulario que se llena automáticamente */}
      <form className="mt-4 space-y-4">
        <input 
          type="text" 
          placeholder="Beneficiario"
          value={formData.beneficiario}
          onChange={(e) => setFormData({...formData, beneficiario: e.target.value})}
        />
        <input 
          type="number" 
          placeholder="Monto"
          value={formData.monto}
          onChange={(e) => setFormData({...formData, monto: parseFloat(e.target.value)})}
        />
        {/* ... más campos */}
      </form>
    </div>
  )
}

// ============================================
// Ejemplo 3: Con validación personalizada
// ============================================
export function ValidatedOCRExample() {
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const handleOCR = (data: OCRData) => {
    const errors: string[] = []

    // Validaciones personalizadas
    if (!data.beneficiario) {
      errors.push('El beneficiario es requerido')
    }

    if (!data.monto || data.monto <= 0) {
      errors.push('El monto debe ser mayor a 0')
    }

    if (data.tipo_documento === 'factura' && !data.ruc) {
      errors.push('Las facturas deben tener RUC')
    }

    if (data.ruc === '20523380347') {
      errors.push('⚠️ Advertencia: El RUC detectado es de EEMERSON SAC (cliente), no del emisor')
    }

    setValidationErrors(errors)

    if (errors.length === 0) {
      console.log('✅ Validación exitosa, guardando datos...')
      // Guardar en base de datos
    }
  }

  return (
    <div>
      <ImageUploader
        initialImages={[]}
        onImagesChange={() => {}}
        onOCRComplete={handleOCR}
      />

      {validationErrors.length > 0 && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
          <h4 className="font-semibold text-red-800 mb-2">Errores de validación:</h4>
          <ul className="list-disc list-inside text-sm text-red-600">
            {validationErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
