import { exigirPersonal } from '@/lib/supabase/permisos'
import { rutaComprobante } from '@/lib/archivos'
import { firmarComprobante } from '@/lib/archivosServidor'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const VIGENCIA_OCR_SEGUNDOS = 300

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  const denegado = await exigirPersonal()
  if (denegado) return denegado

  try {
    const { imageUrl, imageType } = await request.json()

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Se requiere una URL de imagen' },
        { status: 400 }
      )
    }

    // OpenAI no tiene sesión: un comprobante del bucket se le pasa con URL temporal
    const ruta = rutaComprobante(imageUrl)
    const urlImagen = ruta ? await firmarComprobante(ruta, VIGENCIA_OCR_SEGUNDOS) : imageUrl
    if (!urlImagen) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    // Prompt especializado mejorado para facturas y comprobantes
    const prompt = `Analiza este documento y determina automáticamente si es:
1. FACTURA ELECTRÓNICA (contiene RUC, razón social, número de factura)
2. COMPROBANTE DE PAGO/TRANSFERENCIA (BCP, Yape, Plin, transferencias bancarias, etc.)

CONTEXTO IMPORTANTE:
- EEMERSON SAC (RUC: 20523380347) es el CLIENTE que recibe la factura/servicio
- El BENEFICIARIO es la empresa/persona que EMITE la factura

PARA FACTURAS:
- beneficiario: Razón Social de quien EMITE la factura (NO de EEMERSON SAC)
- ruc: RUC del emisor de la factura (NO 20523380347)
- monto: Total a pagar de la factura
- fecha: Fecha de emisión
- numero_factura: Número de la factura (Ej: F001-00001234)
- descripcion: Breve descripción de los servicios/productos
- metodo_pago: Dejar en null o "Factura"

PARA COMPROBANTES DE PAGO:
- beneficiario: Nombre de quien RECIBIÓ el dinero
- monto: Monto transferido/pagado
- fecha: Fecha de la operación
- hora: Hora de la operación
- metodo_pago: "Yape", "Plin", "Transferencia", "Efectivo", etc.
- numero_operacion: Número de operación/referencia
- descripcion: Concepto o glosa del pago si está disponible

FORMATO DE RESPUESTA (JSON):
{
  "tipo_documento": "factura" o "comprobante",
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM" (principalmente para comprobantes, null para facturas),
  "beneficiario": "Nombre completo",
  "ruc": "número RUC" (si está disponible),
  "monto": número sin símbolos,
  "moneda": "soles" o "dolares",
  "metodo_pago": "Yape/Plin/Transferencia/Efectivo" o "Factura",
  "numero_factura": "serie-número" (para facturas),
  "numero_operacion": "código" (para comprobantes),
  "descripcion": "concepto/glosa/descripción del pago" (para ambos tipos)
}

REGLAS:
- Si ves RUC y razón social prominente → es FACTURA
- Si ves logos de Yape/Plin/BCP → es COMPROBANTE
- Para facturas: busca quién EMITE (proveedor), no el cliente
- Para comprobantes: busca destinatario/beneficiario del pago
- Para moneda: S/ = "soles", $ o USD = "dolares"
- Si no encuentras un dato, usa null
- Responde SOLO con JSON válido, sin texto adicional`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: urlImagen,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.1, // Baja temperatura para respuestas más consistentes
    })

    const content = response.choices[0]?.message?.content

    if (!content) {
      throw new Error('No se recibió respuesta de OpenAI')
    }

    // Extraer información de uso de tokens
    const usage = response.usage
    const tokenInfo = {
      prompt_tokens: usage?.prompt_tokens || 0,
      completion_tokens: usage?.completion_tokens || 0,
      total_tokens: usage?.total_tokens || 0,
    }

    // Mostrar información detallada en consola
    console.log('\n' + '='.repeat(60))
    console.log('📊 ANÁLISIS OCR COMPLETADO')
    console.log('='.repeat(60))
    console.log(`🔹 Modelo usado: gpt-4o`)
    console.log(`📥 Tokens de entrada (prompt + imagen): ${tokenInfo.prompt_tokens}`)
    console.log(`📤 Tokens de salida (respuesta): ${tokenInfo.completion_tokens}`)
    console.log(`💰 Total tokens consumidos: ${tokenInfo.total_tokens}`)
    console.log(`💵 Costo estimado: $${(tokenInfo.total_tokens * 0.000015).toFixed(4)} USD`)
    console.log('='.repeat(60) + '\n')

    // Intentar parsear el JSON de la respuesta
    let extractedData
    try {
      // Limpiar el contenido en caso de que venga con markdown
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      extractedData = JSON.parse(cleanContent)
    } catch (parseError) {
      console.error('Error parsing JSON:', content)
      throw new Error('La respuesta de IA no es un JSON válido')
    }

    const isFactura = extractedData.tipo_documento === 'factura'
    
    const validatedData = {
      tipo_documento: isFactura ? 'factura' : 'comprobante',
      fecha: extractedData.fecha || null,
      hora: extractedData.hora || null,
      beneficiario: extractedData.beneficiario || null,
      ruc: isFactura ? extractedData.ruc : null,
      monto: extractedData.monto ? parseFloat(extractedData.monto) : null,
      moneda: extractedData.moneda?.toLowerCase() === 'dolares' ? 'dolares' : 'soles',
      metodo_pago: extractedData.metodo_pago ? normalizePaymentMethod(extractedData.metodo_pago) : null,
      numero_documento: extractedData.numero_factura || extractedData.numero_operacion || null,
      descripcion: extractedData.descripcion || null,
    }

    return NextResponse.json({
      success: true,
      data: validatedData,
      rawResponse: content, // Para debugging
      tokens: tokenInfo, // Información de consumo de tokens
    })
  } catch (error: any) {
    console.error('Error en OCR:', error)
    return NextResponse.json(
      {
        error: 'Error al procesar la imagen',
        details: error.message,
      },
      { status: 500 }
    )
  }
}

// Función auxiliar para normalizar el método de pago
function normalizePaymentMethod(method: string | null): string {
  if (!method) return 'Efectivo'

  const normalized = method.toLowerCase().trim()

  if (normalized.includes('yape')) return 'Yape'
  if (normalized.includes('plin')) return 'Plin'
  if (normalized.includes('transferencia') || normalized.includes('transfer')) return 'Transferencia'
  if (normalized.includes('tarjeta') || normalized.includes('card')) return 'Tarjeta'
  if (normalized.includes('efectivo') || normalized.includes('cash')) return 'Efectivo'

  // Por defecto retornar el valor capitalizado
  return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase()
}
