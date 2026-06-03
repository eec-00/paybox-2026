'use client'

import { TutorialsList } from '@/components/TutorialsList'
import { PlayCircle } from 'lucide-react'

export default function TutorialesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PlayCircle className="h-6 w-6 text-secondary" />
        <div>
          <h2 className="text-2xl font-bold text-primary">Tutoriales</h2>
          <p className="text-muted-foreground">Aprende a usar PayBox con nuestros videos guía</p>
        </div>
      </div>
      <TutorialsList />
    </div>
  )
}
