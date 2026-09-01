import { NextRequest, NextResponse } from 'next/server'

import { createAuthClient, origin } from '@/lib/auth'

// REC-03: callback de recuperación (flujo PKCE de Supabase).
// GoTrue redirige aquí con ?code=<pkce_code> tras verificar el token del
// email. El route handler intercambia el code por una sesión completa de
// recovery usando exchangeCodeForSession (ver plan decisiones #1).
// La sesión se escribe en cookies vía @supabase/ssr (getAll/setAll), lo que
// permite que /recuperar/confirmar pueda llamar a updateUser({ password }).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  const client = await createAuthClient()

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code)
    if (!error) {
      // Redirect al origin canónico (NEXT_PUBLIC_SITE_URL / 127.0.0.1), NO al
      // derivado de request.url: Next normaliza ese host a "localhost", y si
      // el flow entró por 127.0.0.1 las cookies de código/sesión se quedan en
      // 127.0.0.1 → /recuperar/confirmar en localhost no vería la sesión y
      // updateUser({ password }) fallaría.
      return NextResponse.redirect(`${origin()}/recuperar/confirmar`)
    }
    console.error('REC-03 exchangeCodeForSession error:', error.message)
  }

  // REC-07: code inválido/expirado o sin code → error en /recuperar/confirmar.
  return NextResponse.redirect(`${origin()}/recuperar/confirmar?error=link-invalido`)
}
