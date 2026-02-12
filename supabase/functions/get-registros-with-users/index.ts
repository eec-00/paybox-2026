import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Crear cliente de Supabase con Service Role Key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verificar que el usuario esté autenticado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Verificar token del usuario actual
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Obtener parámetro de filtro de exportación
    const url = new URL(req.url)
    const exportadoParam = url.searchParams.get('exportado')
    
    // Construir query base
    let query = supabaseAdmin
      .from('registros')
      .select(`
        *,
        categoria:categoria_id (
          id,
          categoria_id_texto,
          categoria_nombre,
          ejes_obligatorios
        )
      `)
    
    // Aplicar filtro de exportación si se especifica
    if (exportadoParam === 'true') {
      query = query.eq('exportado_a_odoo', true)
    } else if (exportadoParam === 'false') {
      query = query.eq('exportado_a_odoo', false)
    }
    
    // Ordenar por fecha de creación
    query = query.order('created_at', { ascending: false })

    // Obtener todos los registros con sus categorías
    const { data: registros, error: registrosError } = await query

    if (registrosError) {
      return new Response(
        JSON.stringify({ error: registrosError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Obtener información de usuarios para cada registro
    const registrosConUsuarios = await Promise.all(
      registros.map(async (registro) => {
        try {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(registro.creado_por)
          return {
            ...registro,
            subido_por: userData?.user?.user_metadata?.full_name ||
                       userData?.user?.email ||
                       'Usuario desconocido'
          }
        } catch (error) {
          console.error('Error getting user data:', error)
          return {
            ...registro,
            subido_por: 'Usuario desconocido'
          }
        }
      })
    )

    return new Response(
      JSON.stringify({
        success: true,
        registros: registrosConUsuarios,
        total: registrosConUsuarios.length
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
