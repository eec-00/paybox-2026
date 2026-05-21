import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
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

    const { fullName, dni, password, odooEmployeeId, odooEmployeeName } = await request.json()

    if (!fullName || !dni || !password) {
      return NextResponse.json({ error: 'Nombre, DNI y contraseña son requeridos' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
    }
    if (!/^\d{8}$/.test(dni)) {
      return NextResponse.json({ error: 'DNI debe tener 8 dígitos' }, { status: 400 })
    }

    const email = `${dni}@conductor.local`
    const adminClient = createAdminClient()

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })
    if (!newUser.user) return NextResponse.json({ error: 'No se pudo crear el usuario' }, { status: 500 })

    const { error: profileError } = await adminClient
      .from('user_profiles')
      .update({
        full_name: fullName,
        role: 'conductor',
        can_create: false,
        can_edit: false,
        can_delete: false,
        module_permissions: null,
        dni,
        odoo_employee_id: odooEmployeeId || null,
        odoo_employee_name: odooEmployeeName || null,
      })
      .eq('id', newUser.user.id)

    if (profileError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: `Error perfil: ${profileError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, userId: newUser.user.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[conductor/crear]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
