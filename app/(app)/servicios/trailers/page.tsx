import { Suspense } from 'react'
import { ServiciosSection } from '@/components/ServiciosSection'

export default function TrailersPage() {
  // ServiciosSection lee los filtros de la URL (useSearchParams)
  return (
    <Suspense fallback={null}>
      <ServiciosSection />
    </Suspense>
  )
}
