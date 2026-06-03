'use client'

import { VehiclesList } from '@/components/VehiclesList'
import { Link2 } from 'lucide-react'

export default function GeoenlacesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold text-primary">Geoenlaces</h2>
          <p className="text-muted-foreground">Flota GPS Navitel · Crea geoenlaces para uno o varios vehículos</p>
        </div>
      </div>
      <VehiclesList />
    </div>
  )
}
