import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET() {
  const clientId = process.env.SUNAT_CLIENT_ID!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const redirectUri = `${appUrl}/api/sunat/callback`

  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'https://api-cpe.sunat.gob.pe',
    state,
  })

  const authorizeUrl =
    `https://api-seguridad.sunat.gob.pe/v1/clientesextranet/${clientId}/oauth2/authorize/?${params}`

  const cookieStore = await cookies()
  cookieStore.set('sunat_oauth_state', state, {
    httpOnly: true,
    maxAge: 600,
    path: '/',
  })

  return NextResponse.redirect(authorizeUrl)
}
