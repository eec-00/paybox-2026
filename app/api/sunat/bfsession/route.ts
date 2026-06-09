import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clearBFSessionCache } from '@/lib/sunat/client'

const BF_SINGLETON_ID = '00000000-0000-0000-0000-000000000002'
const SESSION_MINUTES = 25

export async function POST(req: NextRequest) {
  try {
    const { session } = await req.json()
    if (!session) return NextResponse.json({ error: 'session requerido' }, { status: 400 })

    const clean = session.trim()
    const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60 * 1000)

    const supabase = createAdminClient()
    const { error } = await supabase.from('sunat_tokens').upsert({
      id: BF_SINGLETON_ID,
      access_token: clean,
      refresh_token: null,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (error) throw error

    clearBFSessionCache()
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
      .eq('id', BF_SINGLETON_ID)
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
