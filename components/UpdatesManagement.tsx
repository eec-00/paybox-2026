'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PlusCircle, Edit, Trash2, Code2, AlertCircle } from 'lucide-react'
import { SystemUpdate, UpdateCategory } from '@/lib/types/updates.types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function UpdatesManagement() {
  const [updates, setUpdates] = useState<SystemUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Form state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUpdate, setEditingUpdate] = useState<SystemUpdate | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    version: '',
    category: 'general' as UpdateCategory
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const supabase = createClient()

  const loadUpdates = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('system_updates')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      setUpdates(data || [])
    } catch (err) {
      console.error('Error loading updates:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar actualizaciones')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (update?: SystemUpdate) => {
    if (update) {
      setEditingUpdate(update)
      setFormData({
        title: update.title,
        description: update.description,
        version: update.version || '',
        category: update.category
      })
    } else {
      setEditingUpdate(null)
      setFormData({
        title: '',
        description: '',
        version: '',
        category: 'general'
      })
    }
    setSaveError(null)
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) throw new Error('No hay usuario autenticado')

      if (editingUpdate) {
        // Actualizar
        const { error: updateError } = await supabase
          .from('system_updates')
          .update({
            title: formData.title,
            description: formData.description,
            version: formData.version || null,
            category: formData.category
          })
          .eq('id', editingUpdate.id)

        if (updateError) throw updateError
      } else {
        // Crear
        const { error: insertError } = await supabase
          .from('system_updates')
          .insert({
            title: formData.title,
            description: formData.description,
            version: formData.version || null,
            category: formData.category,
            created_by: user.id
          })

        if (insertError) throw insertError
      }

      setDialogOpen(false)
      await loadUpdates()
    } catch (err) {
      console.error('Error saving update:', err)
      setSaveError(err instanceof Error ? err.message : 'Error al guardar actualización')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (updateId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta actualización?')) return

    try {
      const { error: deleteError } = await supabase
        .from('system_updates')
        .delete()
        .eq('id', updateId)

      if (deleteError) throw deleteError

      await loadUpdates()
    } catch (err) {
      console.error('Error deleting update:', err)
      alert(`Error al eliminar: ${err instanceof Error ? err.message : 'Error desconocido'}`)
    }
  }

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      feature: 'Nueva funcionalidad',
      bugfix: 'Corrección',
      improvement: 'Mejora',
      general: 'General'
    }
    return labels[category] || 'General'
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      feature: 'bg-gradient-to-r from-emerald-400 to-green-500 text-white shadow-sm',
      bugfix: 'bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-sm',
      improvement: 'bg-gradient-to-r from-sky-400 to-blue-500 text-white shadow-sm',
      general: 'bg-gradient-to-r from-slate-400 to-gray-500 text-white shadow-sm'
    }
    return colors[category] || colors.general
  }

  useEffect(() => {
    loadUpdates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Escuchar evento desde el dashboard para abrir diálogo
    const handleOpenDialog = () => {
      setDialogOpen(true)
    }
    
    window.addEventListener('openUpdateDialog', handleOpenDialog)
    
    return () => {
      window.removeEventListener('openUpdateDialog', handleOpenDialog)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-2 text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
        <Button onClick={loadUpdates}>
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <>
      {updates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No hay actualizaciones publicadas
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[250px]">Título</TableHead>
                  <TableHead className="w-[150px]">Categoría</TableHead>
                  <TableHead className="w-[100px]">Versión</TableHead>
                  <TableHead className="w-[150px]">Fecha</TableHead>
                  <TableHead className="w-[120px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {updates.map((update) => (
                  <TableRow key={update.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium truncate max-w-[300px]">{update.title}</div>
                        <div className="text-sm text-muted-foreground line-clamp-1">
                          {update.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(update.category)}>
                        {getCategoryLabel(update.category)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {update.version || '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(update.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(update)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(update.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Dialog para crear/editar actualización */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingUpdate ? 'Editar Actualización' : 'Nueva Actualización'}
            </DialogTitle>
            <DialogDescription>
              Describe las mejoras y cambios realizados en el sistema
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ej: Nuevo sistema de permisos"
                required
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Categoría *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value as UpdateCategory })}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">Nueva funcionalidad</SelectItem>
                    <SelectItem value="improvement">Mejora</SelectItem>
                    <SelectItem value="bugfix">Corrección</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="version">Versión (opcional)</Label>
                <Input
                  id="version"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="Ej: v1.2.3"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe los cambios y mejoras realizados..."
                rows={6}
                required
                disabled={saving}
              />
            </div>

            {saveError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-800 dark:text-red-200">{saveError}</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : editingUpdate ? 'Actualizar' : 'Publicar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
