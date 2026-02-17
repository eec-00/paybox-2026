// Tipos para el sistema de actualizaciones

export type UpdateCategory = 'feature' | 'bugfix' | 'improvement' | 'general'

export interface SystemUpdate {
  id: string
  title: string
  description: string
  version?: string | null
  category: UpdateCategory
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface UserUpdateView {
  id: string
  user_id: string
  update_id: string
  viewed_at: string
}

export interface CreateUpdatePayload {
  title: string
  description: string
  version?: string
  category?: UpdateCategory
}
