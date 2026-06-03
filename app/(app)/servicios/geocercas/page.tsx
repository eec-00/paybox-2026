'use client'

import { ZonesList } from '@/components/ZonesList'
import { ZoneEvents } from '@/components/ZoneEvents'
import { MapPin } from 'lucide-react'

export default function GeocercasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MapPin className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold text-primary">Geocercas</h2>
          <p className="text-muted-foreground">Zonas GPS configuradas en Navitel</p>
        </div>
      </div>
      <ZonesList />
      <ZoneEvents />
    </div>
  )
}
