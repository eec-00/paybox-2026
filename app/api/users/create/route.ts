import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Verificar que el usuario actual sea admin
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Verificar que sea admin usando RLS
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'developer')) {
      return NextResponse.json(
        { error: 'Permisos insuficientes. Se requiere rol de administrador.' },
        { status: 403 }
      )
    }

    // Obtener datos del request
    const { email, password, fullName, role, permissions } = await request.json()

    // Validaciones
    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Email, contraseña y nombre completo son requeridos' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      )
    }

    // Crear cliente admin
    const adminClient = createAdminClient()

    // Crear usuario con email confirmado
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // ✅ No requiere verificación de email
      user_metadata: {
        full_name: fullName
      }
    })

    if (createError) {
      return NextResponse.json(
        { error: createError.message },
        { status: 400 }
      )
    }

    if (!newUser.user) {
      return NextResponse.json(
        { error: 'No se pudo crear el usuario' },
        { status: 500 }
      )
    }

    // Crear el perfil en user_profiles con el rol y permisos
    const { error: profileInsertError } = await adminClient
      .from('user_profiles')
      .insert({
        id: newUser.user.id,
        email: newUser.user.email!,
        full_name: fullName,
        role: role || 'user',
        can_create: role === 'admin' || role === 'developer' ? true : (permissions?.can_create || false),
        can_edit: role === 'admin' || role === 'developer' ? true : (permissions?.can_edit || false),
        can_delete: role === 'admin' || role === 'developer' ? true : (permissions?.can_delete || false)
      })

    if (profileInsertError) {
      // Si falla la creación del perfil, eliminar el usuario de auth
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json(
        { error: `Error al crear perfil: ${profileInsertError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      userId: newUser.user.id,
      message: 'Usuario creado exitosamente'
    })

  } catch (error: unknown) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido al crear usuario' },
      { status: 500 }
    )
  }
}
