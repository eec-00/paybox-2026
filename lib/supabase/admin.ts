import { createClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase con privilegios de administrador (service_role)
 * SOLO debe usarse en el servidor (API routes, Server Components)
 * NUNCA exponer en el cliente
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
