import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 })

    // Strip "Bearer " prefix if pasted with it
    const clean = token.replace(/^Bearer\s+/i, '').trim()

    const expiresAt = new Date(Date.now() + 55 * 60 * 1000) // 55 min

    const supabase = createAdminClient()
    const { error } = await supabase.from('sunat_tokens').upsert({
      id: SINGLETON_ID,
      access_token: clean,
      refresh_token: null,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (error) throw error

    return NextResponse.json({ ok: true, expires_at: expiresAt.toISOString() })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('sunat_tokens')
      .select('expires_at, updated_at')
      .eq('id', SINGLETON_ID)
      .single()

    if (!data) return NextResponse.json({ active: false })

    const expiresAt = new Date(data.expires_at).getTime()
    const active = Date.now() < expiresAt

    return NextResponse.json({
      active,
      expires_at: data.expires_at,
      updated_at: data.updated_at,
      minutes_left: Math.max(0, Math.floor((expiresAt - Date.now()) / 60000)),
    })
  } catch {
    return NextResponse.json({ active: false })
  }
}
