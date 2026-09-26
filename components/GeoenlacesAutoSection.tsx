'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bot, Loader2, CheckCircle2, XCircle, MinusCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AutoResultado {
  success: boolean
  creados: string[]
  cerrados: string[]
  omitidos: string[]
  errores: string[]
  error?: string
}

export function GeoenlacesAutoSection() {
  const [running, setRunning] = useState(false)
  const [resultado, setResultado] = useState<AutoResultado | null>(null)
  const [lastRun, setLastRun] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState(false)

  async function handleRun() {
    setRunning(true)
    setResultado(null)
    try {
      const res = await fetch('/api/automatizacion/geoenlaces-auto', { method: 'POST' })
      const data = await res.json()
      setResultado(data)
      setLastRun(new Date())
      setExpanded(true)
    } catch {
      setResultado({ success: false, creados: [], cerrados: [], omitidos: [], errores: [], error: 'No se pudo contactar al servidor' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Geoenlaces automáticos por servicio</CardTitle>
              <p className="text-xs text-muted-foreground">
                Crea el geoenlace GPS de un servicio 3h antes de su hora de cita (o apenas el conductor lo inicia), dura máx. 12h y se cierra antes si el conductor lo termina.
              </p>
            </div>
          </div>
          <Button onClick={handleRun} disabled={running} className="gap-1.5">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            Ejecutar ahora
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Para que corra sola cada cierto tiempo (sin tener que apretar el botón), hay que configurar un cron externo
          (por ejemplo cron-job.org) que le pegue a este endpoint con el header <code className="px-1 py-0.5 rounded bg-muted">x-cron-secret</code>.
        </p>

        {resultado && (
          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                {resultado.success ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                {resultado.success ? 'Última ejecución' : `Error: ${resultado.error}`}
                {lastRun && <span className="text-xs font-normal text-muted-foreground">({lastRun.toLocaleTimeString('es-PE')})</span>}
              </span>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {expanded && (
              <div className="px-3 pb-3 space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> {resultado.creados.length} creados
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                    <CheckCircle2 className="h-3 w-3" /> {resultado.cerrados.length} cerrados
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                    <MinusCircle className="h-3 w-3" /> {resultado.omitidos.length} omitidos
                  </span>
                  {resultado.errores.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
                      <XCircle className="h-3 w-3" /> {resultado.errores.length} errores
                    </span>
                  )}
                </div>

                {(['creados', 'cerrados', 'omitidos', 'errores'] as const).map((grupo) =>
                  resultado[grupo].length > 0 ? (
                    <div key={grupo}>
                      <p className={cn('text-xs font-semibold uppercase mb-1', grupo === 'errores' ? 'text-red-700' : 'text-muted-foreground')}>
                        {grupo}
                      </p>
                      <ul className="text-xs space-y-0.5 text-muted-foreground list-disc list-inside">
                        {resultado[grupo].map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
