import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function clearAuthCookies(response: NextResponse) {
  response.cookies.delete('sb-ensmgozpmqcnkhthqgit-auth-token')
  response.cookies.delete('sb-ensmgozpmqcnkhthqgit-auth-token.0')
  response.cookies.delete('sb-ensmgozpmqcnkhthqgit-auth-token.1')
}

function unavailableResponse() {
  return NextResponse.json(
    { error: 'Servicio temporalmente no disponible. Inténtalo de nuevo.' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } }
  )
}

export async function updateSession(request: NextRequest) {
  const isPublicPath =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/conductor/login') ||
    request.nextUrl.pathname.startsWith('/register') ||
    request.nextUrl.pathname.startsWith('/auth')

  // The sign-in pages need no remote Auth check; avoiding that check also
  // keeps them available when the upstream Auth service is temporarily slow.
  if (isPublicPath) return NextResponse.next({ request })

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: options?.maxAge ?? 60 * 60 * 24 * 365, // 1 año si Supabase no especifica
            })
          )
        },
      },
    }
  )

  // Verify JWT locally using Supabase's cached signing keys when possible.
  // This avoids a remote Auth user lookup on every Edge request.
  // Downstream sensitive routes still perform their own access checks.

  let user = null
  try {
    const {
      data: { claims },
      error,
    } = await supabase.auth.getClaims()
    
    // If there's a refresh token error, clear the cookies
    if (error?.code === 'refresh_token_not_found' || /invalid refresh token|refresh token not found/i.test(error?.message ?? '')) {
      // Clear invalid auth cookies
      if (request.nextUrl.pathname.startsWith('/api/')) {
        const response = NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })
        clearAuthCookies(response)
        return response
      }

      // Redirect to login if not already on auth pages
      if (
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/register') &&
        !request.nextUrl.pathname.startsWith('/auth')
      ) {
        const url = request.nextUrl.clone()
        url.pathname = request.nextUrl.pathname.startsWith('/conductor') ? '/conductor/login' : '/login'
        const response = NextResponse.redirect(url)
        clearAuthCookies(response)
        return response
      }
      const response = NextResponse.next({ request })
      clearAuthCookies(response)
      return response
    }

    // Missing/invalid credentials remain unauthenticated; infrastructure
    // failures must not destroy a valid browser session.
    if (error && error.name !== 'AuthSessionMissingError' && ![400, 401, 403].includes(error.status ?? 0)) {
      console.error('Temporary Supabase JWT verification failure:', error.code || error.name)
      return unavailableResponse()
    }

    user = claims
  } catch (error) {
    console.error('Auth error in middleware:', error)
    return unavailableResponse()
  }

  if (!user && !isPublicPath) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = request.nextUrl.pathname.startsWith('/conductor')
      ? '/conductor/login'
      : '/login'
    // El link del sticker de asistencia trae el toque en la URL: tras iniciar
    // sesión hay que volver a él, si no el toque se pierde.
    if (request.nextUrl.pathname.startsWith('/oficina')) {
      url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`
    }
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
