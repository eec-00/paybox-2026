import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (errorParam) {
    return NextResponse.redirect(`${appUrl}/sunat?error=${encodeURIComponent(errorParam)}`)
  }

  // CSRF state check
  const cookieStore = await cookies()
  const savedState = cookieStore.get('sunat_oauth_state')?.value
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${appUrl}/sunat?error=invalid_state`)
  }
  cookieStore.delete('sunat_oauth_state')

  if (!code) {
    return NextResponse.redirect(`${appUrl}/sunat?error=no_code`)
  }

  // Exchange code → tokens
  const clientId = process.env.SUNAT_CLIENT_ID!
  const clientSecret = process.env.SUNAT_CLIENT_SECRET!
  const redirectUri = `${appUrl}/api/sunat/callback`
  const tokenUrl = `https://api-seguridad.sunat.gob.pe/v1/clientesextranet/${clientId}/oauth2/token/`

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[sunat/callback] token exchange failed:', text)
    return NextResponse.redirect(
      `${appUrl}/sunat?error=${encodeURIComponent(`token_exchange: ${text}`)}`
    )
  }

  const tokenData = await res.json()
  const expiresAt = new Date(Date.now() + ((tokenData.expires_in ?? 3600) - 60) * 1000)

  const supabase = createAdminClient()
  await supabase.from('sunat_tokens').upsert({
    id: SINGLETON_ID,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? null,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  })

  return NextResponse.redirect(`${appUrl}/sunat?connected=1`)
}
