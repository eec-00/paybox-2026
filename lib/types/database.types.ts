export interface Categoria {
  id: number
  categoria_id_texto: string
  categoria_nombre: string
  naturaleza: string
  subgrupo: string
  centro_costo_destino: string
  ejes_obligatorios: string[]
  regla_id?: number
  created_at?: string
}

export interface Registro {
  id: number
  fecha_y_hora_pago: string // timestamp con fecha y hora
  beneficiario: string
  monto: number
  metodo_pago: string
  banco_cuenta?: string
  moneda: 'soles' | 'dolares'
  categoria_id: number
  categoria?: Categoria
  datos_dinamicos: Record<string, any>
  comprobantes?: string[] // URLs de las imágenes en Storage
  creado_por: string
  subido_por?: string // Nombre completo del usuario que creó el registro
  created_at?: string
  // Campos OCR
  tipo_documento?: string
  numero_documento?: string
  descripcion?: string
  ruc?: string
  // Campos de exportación a Odoo
  exportado_a_odoo?: boolean
  fecha_exportacion?: string
  lote_exportacion_id?: number
}

export interface ReglaImputacion {
  id: number
  situacion: string
  centro_costo_destino: string
  regla: string
  created_at?: string
}
