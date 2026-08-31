import { NextRequest, NextResponse } from 'next/server'

import { createAuthClient } from '@/lib/auth'

// Route handler de callback de recuperación (REC-03). El link que genera
// GoTrue apunta a <origin>/auth/reset?token=...&type=recovery&redirect_to=...
// El flujo de GoTrue usa token_hash, NO PKCE code: se verifica el token con
// verifyOtp({ type: 'recovery', token_hash }), que fija la sesión de recovery
// vía cookies (setAll). Luego redirect a /recuperar/confirmar.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  const client = await createAuthClient()

  if (token) {
    const { error } = await client.auth.verifyOtp({
      type: 'recovery',
      token_hash: token
    })
    if (!error) {
      return NextResponse.redirect(new URL('/recuperar/confirmar', request.url))
    }
  }

  // REC-07: token inválido/expirado → error en /recuperar/confirmar.
  return NextResponse.redirect(
    new URL('/recuperar/confirmar?error=link-invalido', request.url)
  )
}
