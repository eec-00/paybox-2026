'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateMyProfile } from '@/lib/utils/auth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, Lock, CheckCircle, AlertCircle } from 'lucide-react'

interface ProfileSettingsModalProps {
  open: boolean
  onClose: () => void
  userName: string | null
  userEmail: string | null
  onNameUpdated: (newName: string) => void
}

type Tab = 'perfil' | 'seguridad'

export function ProfileSettingsModal({
  open,
  onClose,
  userName,
  userEmail,
  onNameUpdated,
}: ProfileSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('perfil')

  const [fullName, setFullName] = useState(userName ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameMsg, setNameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passLoading, setPassLoading] = useState(false)
  const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSaveName = async () => {
    const trimmed = fullName.trim()
    if (!trimmed) return
    setNameLoading(true)
    setNameMsg(null)
    const result = await updateMyProfile({ full_name: trimmed })
    if (result.success) {
      setNameMsg({ type: 'success', text: 'Nombre actualizado correctamente.' })
      onNameUpdated(trimmed)
    } else {
      setNameMsg({ type: 'error', text: result.error ?? 'Error al actualizar nombre.' })
    }
    setNameLoading(false)
  }

  const handleSavePassword = async () => {
    setPassMsg(null)
    if (newPassword.length < 6) {
      setPassMsg({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPassMsg({ type: 'error', text: 'Las contraseñas no coinciden.' })
      return
    }
    setPassLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPassMsg({ type: 'error', text: error.message })
    } else {
      setPassMsg({ type: 'success', text: 'Contraseña actualizada correctamente.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
    setPassLoading(false)
  }

  const initials = (userName ?? userEmail ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-sm shrink-0">
              {initials}
            </div>
            <div>
              <p className="font-semibold leading-tight">{userName || userEmail}</p>
              {userName && <p className="text-xs text-muted-foreground font-normal">{userEmail}</p>}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-4">
          <button
            onClick={() => setActiveTab('perfil')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'perfil'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="h-4 w-4" />
            Perfil
          </button>
          <button
            onClick={() => setActiveTab('seguridad')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'seguridad'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Lock className="h-4 w-4" />
            Seguridad
          </button>
        </div>

        {activeTab === 'perfil' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" value={userEmail ?? ''} disabled className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre"
              />
            </div>
            {nameMsg && (
              <div className={`flex items-center gap-2 text-sm ${nameMsg.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
                {nameMsg.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {nameMsg.text}
              </div>
            )}
            <Button onClick={handleSaveName} disabled={nameLoading || !fullName.trim()} className="w-full">
              {nameLoading ? 'Guardando...' : 'Guardar nombre'}
            </Button>
          </div>
        )}

        {activeTab === 'seguridad' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
              />
            </div>
            {passMsg && (
              <div className={`flex items-center gap-2 text-sm ${passMsg.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
                {passMsg.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {passMsg.text}
              </div>
            )}
            <Button onClick={handleSavePassword} disabled={passLoading || !newPassword || !confirmPassword} className="w-full">
              {passLoading ? 'Guardando...' : 'Cambiar contraseña'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
