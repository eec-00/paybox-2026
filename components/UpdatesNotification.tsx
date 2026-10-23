'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { parseUpdateDescription, updateSummary, UPDATES_VIEWED_EVENT } from '@/lib/updates/parse'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SystemUpdate } from '@/lib/types/updates.types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function UpdatesNotification() {
  const router = useRouter()
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set())
  const unreadCount = unreadIds.size
  const [recentUpdates, setRecentUpdates] = useState<SystemUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // No leídas = publicadas desde que se creó la cuenta y sin vista registrada.
  // Las anteriores a la cuenta no cuentan: un usuario nuevo no arranca con "9+"
  // por novedades de antes de que existiera.
  const loadUnreadCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [updatesRes, viewsRes] = await Promise.all([
        supabase.from('system_updates').select('id').gte('created_at', user.created_at),
        supabase.from('user_update_views').select('update_id').eq('user_id', user.id),
      ])
      if (updatesRes.error) throw updatesRes.error
      if (viewsRes.error) throw viewsRes.error
      const vistas = new Set((viewsRes.data ?? []).map((v) => v.update_id))
      setUnreadIds(new Set((updatesRes.data ?? []).map((u) => u.id).filter((id) => !vistas.has(id))))
    } catch (error) {
      console.error('Error loading unread count:', error)
    }
  }

  const loadRecentUpdates = async () => {
    try {
      const { data, error } = await supabase
        .from('system_updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) throw error

      setRecentUpdates(data || [])
    } catch (error) {
      console.error('Error loading recent updates:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsViewed = async (updateId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) return

      // Insertar o actualizar la vista
      await supabase
        .from('user_update_views')
        .upsert({
          user_id: user.id,
          update_id: updateId,
          viewed_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,update_id'
        })

      window.dispatchEvent(new Event(UPDATES_VIEWED_EVENT))
    } catch (error) {
      console.error('Error marking update as viewed:', error)
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
      feature: 'bg-gradient-to-r from-emerald-400 to-green-500 text-white',
      bugfix: 'bg-gradient-to-r from-rose-400 to-pink-500 text-white',
      improvement: 'bg-gradient-to-r from-sky-400 to-blue-500 text-white',
      general: 'bg-gradient-to-r from-slate-400 to-gray-500 text-white'
    }
    return colors[category] || colors.general
  }

  useEffect(() => {
    loadUnreadCount()
    loadRecentUpdates()

    // Suscribirse a cambios en system_updates
    const channel = supabase
      .channel('system_updates_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_updates'
        },
        () => {
          loadUnreadCount()
          loadRecentUpdates()
        }
      )
      .subscribe()

    // Leídas desde la página /updates (u otra pestaña de este componente)
    const onViewed = () => { loadUnreadCount() }
    window.addEventListener(UPDATES_VIEWED_EVENT, onViewed)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener(UPDATES_VIEWED_EVENT, onViewed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative hover:bg-white/20 text-white transition-all"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center p-0 px-1.5 bg-red-500 hover:bg-red-600 text-white border-2 border-primary text-xs font-bold shadow-lg animate-pulse"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[500px] overflow-y-auto shadow-xl border-2">
        <DropdownMenuLabel className="flex items-center justify-between border-b pb-3 pt-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
          <span className="text-base font-bold text-gray-800 dark:text-gray-100">Actualizaciones</span>
          {unreadCount > 0 && (
            <Badge className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold shadow-md">
              {unreadCount} {unreadCount === 1 ? 'nueva' : 'nuevas'}
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Cargando...
          </div>
        ) : recentUpdates.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No hay actualizaciones recientes
          </div>
        ) : (
          <>
            {recentUpdates.map((update) => {
              const modulo = parseUpdateDescription(update.description)?.modulo
              const noLeida = unreadIds.has(update.id)
              return (
              <DropdownMenuItem
                key={update.id}
                className="flex flex-col items-start p-4 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-950/30 dark:hover:to-purple-950/30 transition-all border-b last:border-b-0"
                onClick={() => {
                  markAsViewed(update.id)
                  router.push(`/updates?id=${update.id}`)
                }}
              >
                <div className="flex items-start gap-3 w-full">
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${noLeida ? 'bg-orange-500' : 'bg-transparent'}`}
                    title={noLeida ? 'Nueva' : undefined}
                  />
                  <div className="flex-1 min-w-0">
                    {modulo && (
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-primary/80 truncate">{modulo}</div>
                    )}
                    <div className={`text-sm text-gray-800 dark:text-gray-100 ${noLeida ? 'font-bold' : 'font-semibold'}`}>{update.title}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-1.5 leading-relaxed">
                      {updateSummary(update.description)}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Badge className={`text-xs px-2.5 py-0.5 font-medium shadow-sm ${getCategoryColor(update.category)}`}>
                        {getCategoryLabel(update.category)}
                      </Badge>
                      {update.version && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                          {update.version}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                        {format(new Date(update.created_at), "dd 'de' MMM", { locale: es })}
                      </span>
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-center justify-center font-semibold text-primary hover:text-primary/80 cursor-pointer py-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 hover:from-blue-100 hover:to-purple-100 dark:hover:from-blue-900/40 dark:hover:to-purple-900/40 transition-all"
              onClick={() => router.push('/updates')}
            >
              Ver todas las actualizaciones →
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
