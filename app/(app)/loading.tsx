import { Loader2 } from 'lucide-react'

// Se muestra al instante al cambiar de módulo, mientras Next trae la página
// nueva — sin esto el clic no daba ninguna señal hasta que terminaba de cargar.
export default function Loading() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground text-sm gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      Cargando...
    </div>
  )
}
