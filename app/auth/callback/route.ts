import { NextRequest, NextResponse } from 'next/server'

import { createAuthClient, esRutaLocal, origin } from '@/lib/auth'

// F017: callback de OAuth (flujo PKCE de Supabase).
// GoTrue redirige aquí con ?code=<pkce_code> tras procesar la respuesta del
// proveedor (Google). El route handler intercambia el code por una sesión
// completa usando exchangeCodeForSession, lo que escribe las cookies de
// sesión vía @supabase/ssr (getAll/setAll).
// La sesión resultante permite que Header muestre el email del usuario y que
// las Server Components llamen a getUser() con éxito.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const client = await createAuthClient()
    const { error } = await client.auth.exchangeCodeForSession(code)
    if (!error) {
      // F017: redirigir a la ruta solicitada (next) o al inicio. Solo rutas
      // locales válidas para evitar open redirects (reutiliza esRutaLocal de
      // AUTH-08).
      const destino = esRutaLocal(next) ? next : '/'
      return NextResponse.redirect(`${origin()}${destino}`)
    }
    console.error('F017 exchangeCodeForSession error:', error.message)
  }

  // F017: code inválido/expirado o sin code → login como fallback seguro.
  return NextResponse.redirect(`${origin()}/login?error=oauth-fallido`)
}
