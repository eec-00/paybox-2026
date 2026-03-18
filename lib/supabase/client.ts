import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
      // PWA fix: sin maxAge las cookies son "session cookies" y se borran
      // al cerrar la PWA en iOS Safari y Android Chrome.
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 400, // 400 días (máximo permitido por los browsers)
        sameSite: 'lax',
      },
    }
  )
}
