'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentUserProfile } from '@/lib/utils/auth'
import { Building2, CalendarDays, BarChart3, AlertTriangle, Settings2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Marca, OficinaConfig, Trabajador } from '@/lib/oficina/calculos'
import { OficinaDiario } from '@/components/OficinaDiario'
import { OficinaResumen } from '@/components/OficinaResumen'
import { OficinaConfiguracion } from '@/components/OficinaConfiguracion'

type Tab = 'dia' | 'resumen' | 'avisos' | 'config'

const TABS: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'dia', label: 'Por día', icon: CalendarDays },
  { id: 'resumen', label: 'Resumen', icon: BarChart3 },
  { id: 'avisos', label: 'Avisos', icon: AlertTriangle },
  { id: 'config', label: 'Configuración', icon: Settings2 },
]

export interface PermisosOficina { canEdit: boolean; canDelete: boolean }

/** Marcas de oficina entre dos fechas (inclusive). */
export async function cargarMarcas(desde: string, hasta: string): Promise<Marca[]> {
  const { data, error } = await createClient()
    .from('oficina_marcas')
    .select('id, user_id, nombre, fecha, tipo, marcado_at, selfie_path, manual, sospechosa, motivo_sospecha')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('marcado_at')
  if (error) throw error
  return (data ?? []) as Marca[]
}

export function OficinaAsistenciaSection() {
  const [tab, setTab] = useState<Tab>('dia')
  const [config, setConfig] = useState<OficinaConfig | null>(null)
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [permisos, setPermisos] = useState<PermisosOficina>({ canEdit: false, canDelete: false })
  const [fechaDia, setFechaDia] = useState<string | null>(null)

  const cargarBase = useCallback(async () => {
    const supabase = createClient()
    const [cfg, trab] = await Promise.all([
      supabase.from('oficina_config').select('meta_semanal_horas, tolerancia_min, almuerzo_min, almuerzo_max, hora_limite, selfie_tipos').eq('id', 1).single(),
      supabase.from('oficina_trabajadores').select('user_id, nombre, activo, horario, meta_semanal_horas').order('nombre'),
    ])
    if (cfg.error || trab.error) {
      toast.error((cfg.error || trab.error)!.message)
      return
    }
    setConfig({ ...cfg.data, meta_semanal_horas: Number(cfg.data.meta_semanal_horas) })
    setTrabajadores(trab.data as Trabajador[])
  }, [])

  useEffect(() => {
    cargarBase()
    getCurrentUserProfile().then((p) => {
      const priv = p?.role === 'admin' || p?.role === 'developer'
      setPermisos({
        canEdit: priv || !!p?.module_permissions?.rrhh?.can_edit,
        canDelete: priv || !!p?.module_permissions?.rrhh?.can_delete,
      })
    })
  }, [cargarBase])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">Asistencia oficina</h2>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Marcas con sticker NFC y selfie
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {!config ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {tab === 'dia' && (
            <OficinaDiario
              config={config}
              trabajadores={trabajadores.filter((t) => t.activo)}
              permisos={permisos}
              fechaInicial={fechaDia}
            />
          )}
          {(tab === 'resumen' || tab === 'avisos') && (
            <OficinaResumen
              modo={tab}
              config={config}
              trabajadores={trabajadores.filter((t) => t.activo)}
              onVerDia={(f) => { setFechaDia(f); setTab('dia') }}
            />
          )}
          {tab === 'config' && (
            <OficinaConfiguracion
              config={config}
              trabajadores={trabajadores}
              permisos={permisos}
              onCambio={cargarBase}
            />
          )}
        </>
      )}
    </div>
  )
}
