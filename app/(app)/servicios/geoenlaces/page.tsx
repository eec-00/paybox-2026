'use client'

import { PageHeader } from '@/components/ui/page-header'
import { VehiclesList } from '@/components/VehiclesList'
import { GeoenlacesAutoSection } from '@/components/GeoenlacesAutoSection'
import { Link2 } from 'lucide-react'

export default function GeoenlacesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        icon={Link2}
        title="Geoenlaces"
        description="Enlaces de seguimiento GPS para compartir la ubicación de uno o varios vehículos"
      />
      <GeoenlacesAutoSection />
      <VehiclesList />
    </div>
  )
}
