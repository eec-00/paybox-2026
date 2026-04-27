// ─────────────────────────────────────────────────────────────────────────────
// Netlify Scheduled Function — envío automático diario de alertas de vencimiento
//
// HORA DE ENVÍO: edita el campo `schedule` debajo (formato cron UTC)
//   Ejemplos hora Perú (UTC-5):
//     4am  Peru → "0 9 * * *"   ← actual
//     7am  Peru → "0 12 * * *"
//     8am  Peru → "0 13 * * *"
//     9am  Peru → "0 14 * * *"
//     10am Peru → "0 15 * * *"
//
// Para cambiar la hora: edita `schedule`, guarda y haz redeploy en Netlify.
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  schedule: '0 9 * * *', // 4am hora Perú (UTC-5)
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
