'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Upload, X, Sparkles, Image as ImageIcon, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

// Declaración de tipos para PDF.js
declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: {
        workerSrc: string
      }
      getDocument: (params: { data: ArrayBuffer }) => {
        promise: Promise<{
          numPages: number
          getPage: (pageNum: number) => Promise<{
            getViewport: (params: { scale: number }) => {
              width: number
              height: number
            }
            render: (params: {
              canvasContext: CanvasRenderingContext2D
              viewport: { width: number; height: number }
            }) => { promise: Promise<void> }
          }>
        }>
      }
    }
  }
}

export interface OCRData {
  tipo_documento?: 'factura' | 'comprobante'
  fecha: string | null
  hora: string | null
  beneficiario: string | null
  ruc?: string | null
  monto: number | null
  moneda: 'soles' | 'dolares'
  metodo_pago: string | null
  numero_documento?: string | null  // Unificado: número de factura o de operación
  descripcion?: string | null       // General: concepto/descripción del pago
}

interface ImageUploaderProps {
  initialImages?: string[]
  onImagesChange: (urls: string[]) => void
  onOCRComplete?: (data: OCRData) => void
  maxImages?: number
  canUpload?: boolean
  canDelete?: boolean
  showOCRButton?: boolean
}

export function ImageUploader({ initialImages = [], onImagesChange, onOCRComplete, maxImages = 4, canUpload = true, canDelete = true, showOCRButton = true }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [processingOCR, setProcessingOCR] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false)
  const supabase = createClient()

  // Usar initialImages directamente en lugar de estado local para evitar sincronización
  const images = initialImages

  // Cargar PDF.js dinámicamente
  useEffect(() => {
    const loadPdfJs = async () => {
      if (typeof window !== 'undefined' && !window.pdfjsLib) {
        try {
          // Cargar el script principal de PDF.js
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
          script.async = true
          
          script.onload = () => {
            if (window.pdfjsLib) {
              // Configurar el worker
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
              setPdfJsLoaded(true)
              console.log('PDF.js cargado exitosamente')
            }
          }
          
          script.onerror = () => {
            console.error('Error al cargar PDF.js')
            setError('Error al cargar el lector de PDF')
          }
          
          document.body.appendChild(script)
        } catch (err) {
          console.error('Error al cargar PDF.js:', err)
          setError('Error al inicializar el lector de PDF')
        }
      } else if (window.pdfjsLib) {
        setPdfJsLoaded(true)
      }
    }

    loadPdfJs()
  }, [])

  /**
   * Convierte un archivo PDF a imagen usando PDF.js
   * @param file - Archivo PDF a convertir
   * @returns Base64 de la primera página como JPEG
   */
  const pdfToImage = async (file: File): Promise<string> => {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js no está cargado')
    }

    try {
      // Leer el archivo como ArrayBuffer
      const arrayBuffer = await file.arrayBuffer()
      
      // Cargar el documento PDF
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
      
      // Obtener la primera página
      const page = await pdf.getPage(1)
      
      // Configurar el canvas con escala 2.0 para mejor calidad
      const scale = 2.0
      const viewport = page.getViewport({ scale })
      
      // Crear canvas
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      
      if (!context) {
        throw new Error('No se pudo obtener el contexto del canvas')
      }
      
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      // Renderizar la página en el canvas
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise
      
      // Convertir canvas a base64 JPEG con calidad 95%
      const base64Image = canvas.toDataURL('image/jpeg', 0.95)
      
      console.log('PDF convertido a imagen exitosamente')
      return base64Image
      
    } catch (err) {
      console.error('Error al convertir PDF a imagen:', err)
      throw new Error('No se pudo convertir el PDF a imagen')
    }
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('comprobantes')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('comprobantes')
        .getPublicUrl(filePath)

      return publicUrl
    } catch (error: any) {
      console.error('Error uploading image:', error)
      throw error
    }
  }

  /**
   * Detecta si un archivo es PDF
   */
  const isPDF = (file: File): boolean => {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  }

  const handleOCR = async () => {
    if (images.length === 0) {
      setError('No hay imágenes para analizar')
      return
    }

    setProcessingOCR(true)
    setError(null)

    try {
      // Obtener la primera imagen/documento
      const firstImageUrl = images[0]
      
      // Determinar si necesitamos información adicional sobre el tipo de archivo
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: firstImageUrl,
          imageType: 'receipt',
        }),
      })

      if (!response.ok) {
        throw new Error('Error al procesar la imagen con OCR')
      }

      const result = await response.json()

      if (result.success && result.data) {
        // Llamar al callback con los datos extraídos
        if (onOCRComplete) {
          onOCRComplete(result.data)
        }
      } else {
        throw new Error(result.error || 'No se pudieron extraer los datos')
      }
    } catch (error: any) {
      console.error('Error en OCR:', error)
      setError(error.message || 'Error al analizar la imagen')
    } finally {
      setProcessingOCR(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    if (images.length + files.length > maxImages) {
      setError(`Máximo ${maxImages} imágenes permitidas`)
      return
    }

    setError(null)
    setUploading(true)

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        // Verificar si es PDF
        if (isPDF(file)) {
          if (!pdfJsLoaded) {
            throw new Error('El lector de PDF aún no está listo. Intenta nuevamente.')
          }
          
          // Convertir PDF a imagen
          console.log('Convirtiendo PDF a imagen...')
          const base64Image = await pdfToImage(file)
          
          // Convertir base64 a Blob
          const response = await fetch(base64Image)
          const blob = await response.blob()
          
          // Crear un nuevo archivo a partir del blob
          const imageFile = new File([blob], file.name.replace('.pdf', '.jpg'), {
            type: 'image/jpeg'
          })
          
          // Subir la imagen convertida
          return await uploadImage(imageFile)
        } else {
          // Subir imagen normal
          return await uploadImage(file)
        }
      })
      
      const urls = await Promise.all(uploadPromises)
      const validUrls = urls.filter((url): url is string => url !== null)

      const newImages = [...images, ...validUrls]
      onImagesChange(newImages)
    } catch (error: any) {
      setError(error.message || 'Error al subir archivos')
    } finally {
      setUploading(false)
      e.target.value = '' // Reset input
    }
  }

  const removeImage = async (index: number) => {
    const imageUrl = images[index]

    try {
      // Extraer el nombre del archivo de la URL
      const fileName = imageUrl.split('/').pop()
      if (fileName) {
        await supabase.storage
          .from('comprobantes')
          .remove([fileName])
      }
    } catch (error) {
      console.error('Error removing image:', error)
    }

    const newImages = images.filter((_, i) => i !== index)
    onImagesChange(newImages)
  }


  return (
    <div className="space-y-4">
      {/* Preview de imágenes */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {images.map((url, index) => (
            <Card key={index} className="relative group overflow-hidden">
              <CardContent className="p-0">
                <div className="aspect-square relative">
                  <img
                    src={url}
                    alt={`Comprobante ${index + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* Overlay con acciones */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                    {canDelete && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeImage(index)}
                        className="text-xs"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Eliminar
                      </Button>
                    )}
                  </div>

                  {/* Badge para primera imagen */}
                  {index === 0 && (
                    <div className="absolute top-2 left-2 bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs font-semibold">
                      Principal
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Botón OCR */}
      {images.length > 0 && showOCRButton && onOCRComplete && (
        <Button
          onClick={handleOCR}
          disabled={processingOCR}
          variant="default"
          className="w-full"
        >
          {processingOCR ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
              Analizando con IA...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Analizar con OCR (IA)
            </>
          )}
        </Button>
      )}

      {/* Botón de carga */}
      {images.length < maxImages && canUpload && (
        <div>
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept="image/*,application/pdf"
            multiple
            onChange={handleFileChange}
            disabled={uploading}
          />
          <label htmlFor="file-upload">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                "hover:border-secondary hover:bg-secondary/5",
                uploading && "opacity-50 cursor-not-allowed"
              )}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="text-sm text-muted-foreground">Subiendo imágenes...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  {images.length === 0 ? (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Sube la imagen principal del comprobante</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Máximo {maxImages} archivos • PNG, JPG, PDF hasta 5MB
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Agregar más imágenes</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {maxImages - images.length} {maxImages - images.length === 1 ? 'imagen' : 'imágenes'} restantes
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </label>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </div>
      )}

      {images.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <p>💡 La primera imagen es la principal para análisis OCR</p>
          <p>💡 Las demás imágenes son documentos de respaldo</p>
        </div>
      )}
    </div>
  )
}
