'use client'

// ============================================================================
// Confirmación con el diálogo de la app, en lugar del confirm() del navegador.
//
//   const confirmar = useConfirm()
//   if (!(await confirmar({ title: '¿Eliminar…?', description: '…', destructive: true }))) return
//
// `requireText` obliga a escribir un texto (ej. el código del servicio) antes
// de habilitar el botón: para acciones que no se pueden deshacer.
// ============================================================================

import * as React from 'react'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface OpcionesConfirmar {
  title: React.ReactNode
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  /** Texto que hay que escribir para habilitar la confirmación */
  requireText?: string
}

type Confirmar = (o: OpcionesConfirmar) => Promise<boolean>

const ConfirmContext = React.createContext<Confirmar | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opciones, setOpciones] = React.useState<OpcionesConfirmar | null>(null)
  const [escrito, setEscrito] = React.useState('')
  const resolver = React.useRef<((v: boolean) => void) | null>(null)

  const confirmar = React.useCallback<Confirmar>(o => {
    resolver.current?.(false)
    setEscrito('')
    setOpciones(o)
    return new Promise<boolean>(resolve => { resolver.current = resolve })
  }, [])

  const cerrar = (valor: boolean) => {
    resolver.current?.(valor)
    resolver.current = null
    setOpciones(null)
  }

  const requerido = opciones?.requireText?.trim()
  const habilitado = !requerido || escrito.trim().toUpperCase() === requerido.toUpperCase()
  const idCampo = React.useId()

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <AlertDialog open={!!opciones} onOpenChange={abierto => { if (!abierto) cerrar(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opciones?.title}</AlertDialogTitle>
            {opciones?.description && <AlertDialogDescription asChild><div className="space-y-2">{opciones.description}</div></AlertDialogDescription>}
          </AlertDialogHeader>
          {requerido && (
            <div className="space-y-1.5">
              <label htmlFor={idCampo} className="text-sm">
                Para confirmar, escribe <span className="font-mono font-semibold">{requerido}</span>
              </label>
              <Input
                id={idCampo}
                value={escrito}
                onChange={e => setEscrito(e.target.value)}
                autoComplete="off"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && habilitado) cerrar(true) }}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{opciones?.cancelText ?? 'Cancelar'}</AlertDialogCancel>
            <Button
              variant={opciones?.destructive ? 'destructive' : 'default'}
              disabled={!habilitado}
              onClick={() => cerrar(true)}
            >
              {opciones?.confirmText ?? (opciones?.destructive ? 'Eliminar' : 'Confirmar')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Confirmar {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  return ctx
}
