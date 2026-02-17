'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SystemUpdate } from '@/lib/types/updates.types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertCircle, ArrowLeft } from 'lucide-react'

export function UpdatesList() {
  const [updates, setUpdates] = useState<SystemUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUpdate, setSelectedUpdate] = useState<SystemUpdate | null>(null)

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

  const markAsViewed = async (updateId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('user_update_views')
        .upsert({
          user_id: user.id,
          update_id: updateId,
          viewed_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,update_id'
        })
    } catch (err) {
      console.error('Error marking update as viewed:', err)
    }
  }

  const handleUpdateClick = (update: SystemUpdate) => {
    setSelectedUpdate(update)
    markAsViewed(update.id)
  }

  const handleBack = () => {
    setSelectedUpdate(null)
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
      feature: 'bg-gradient-to-r from-emerald-400 to-green-500 text-white shadow-md',
      bugfix: 'bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-md',
      improvement: 'bg-gradient-to-r from-sky-400 to-blue-500 text-white shadow-md',
      general: 'bg-gradient-to-r from-slate-400 to-gray-500 text-white shadow-md'
    }
    return colors[category] || colors.general
  }

  useEffect(() => {
    loadUpdates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
              <p className="mt-2 text-sm text-muted-foreground">Cargando actualizaciones...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Vista detallada
  if (selectedUpdate) {
    return (
      <div className="space-y-6">
        <Button 
          onClick={handleBack} 
          variant="ghost" 
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a actualizaciones
        </Button>
        
        <div className="max-w-4xl mx-auto">
          <div className="text-center space-y-4 mb-8">
            <h1 className="text-4xl font-bold text-foreground">
              {selectedUpdate.title}
            </h1>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Badge className={`font-semibold ${getCategoryColor(selectedUpdate.category)}`}>
                {getCategoryLabel(selectedUpdate.category)}
              </Badge>
              {selectedUpdate.version && (
                <Badge variant="outline" className="font-medium text-base px-3 py-1">
                  {selectedUpdate.version}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Publicado el {format(new Date(selectedUpdate.created_at), "dd 'de' MMMM, yyyy", { locale: es })}
              </span>
            </div>
          </div>
          
          <Card>
            <CardContent className="pt-6">
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                  {selectedUpdate.description}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Lista de actualizaciones
  return (
    <div className="space-y-3">
      {updates.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8 text-muted-foreground">
              No hay actualizaciones publicadas
            </div>
          </CardContent>
        </Card>
      ) : (
        updates.map((update) => (
          <Card 
            key={update.id} 
            className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.01] border-l-4"
            style={{
              borderLeftColor: update.category === 'feature' ? '#10b981' :
                               update.category === 'bugfix' ? '#f43f5e' :
                               update.category === 'improvement' ? '#3b82f6' : '#6b7280'
            }}
            onClick={() => handleUpdateClick(update)}
          >
            <CardHeader className="py-4">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-lg font-semibold text-foreground">
                  {update.title}
                </CardTitle>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {update.version && (
                    <Badge variant="outline" className="font-medium">
                      {update.version}
                    </Badge>
                  )}
                  <Badge className={getCategoryColor(update.category)}>
                    {getCategoryLabel(update.category)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))
      )}
    </div>
  )
}
