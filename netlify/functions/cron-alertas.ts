import { schedule } from '@netlify/functions'

// 4:15am hora Peru (UTC-5) = 9:15am UTC
export const handler = schedule('26 9 * * *', async () => {
  const baseUrl = (process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'https://paybox.eemersonsac.com').replace(/\/$/, '')
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

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, results }),
  }
})
