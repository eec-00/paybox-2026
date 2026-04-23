// Netlify Scheduled Function — se ejecuta diariamente a las 14:00 UTC (9am Peru UTC-5)
// Para cambiar la hora: modifica el cron en config.schedule (formato: minuto hora * * *)

export const config = {
  schedule: '0 14 * * *',
}

export default async function handler() {
  const baseUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const secret = process.env.CRON_SECRET || ''

  const tipos = ['tractos', 'carretas', 'conductores'] as const
  const results: Record<string, unknown>[] = []

  for (const tipo of tipos) {
    try {
      const res = await fetch(`${baseUrl}/api/automatizacion/enviar-alertas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'x-cron-secret': secret } : {}),
        },
        body: JSON.stringify({ tipo, soloPreview: false }),
      })
      const data = await res.json()
      results.push({ tipo, ...data })
      console.log(`[cron-alertas] ${tipo}:`, JSON.stringify(data))
    } catch (err) {
      console.error(`[cron-alertas] ${tipo} error:`, err)
      results.push({ tipo, error: String(err) })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
