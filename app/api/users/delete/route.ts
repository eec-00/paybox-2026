import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || (callerProfile.role !== 'admin' && callerProfile.role !== 'developer')) {
      return NextResponse.json({ error: 'Se requiere rol de administrador' }, { status: 403 })
    }

    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })
    if (userId === user.id) return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 })

    const adminClient = createAdminClient()

    // Verify the target isn't an admin
    const { data: targetProfile } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (targetProfile?.role === 'admin') {
      return NextResponse.json({ error: 'No se puede eliminar a un administrador' }, { status: 403 })
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
