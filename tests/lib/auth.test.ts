import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import { ERRORES_AUTH, iniciarSesionConGoogle } from '@/lib/auth'
import type { AuthClient } from '@/lib/auth'

const REDIRECT_TO = '/perfil'

function buildClient(resultado: {
  data: object | null
  error: { message: string } | null
}): { client: AuthClient; signInWithOAuth: ReturnType<typeof vi.fn> } {
  const signInWithOAuth = vi.fn().mockResolvedValue(resultado)
  const client = { auth: { signInWithOAuth } } as unknown as AuthClient
  return { client, signInWithOAuth }
}

describe('iniciarSesionConGoogle (F014)', () => {
  it('llama a signInWithOAuth con provider google y redirectTo', async () => {
    const { client, signInWithOAuth } = buildClient({ data: {}, error: null })

    await iniciarSesionConGoogle(client, REDIRECT_TO)

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: REDIRECT_TO }
    })
  })

  it('lanza el error de dominio si signInWithOAuth falla', async () => {
    const { client } = buildClient({ data: null, error: { message: 'oauth_error' } })

    await expect(iniciarSesionConGoogle(client, REDIRECT_TO)).rejects.toThrow(
      ERRORES_AUTH.oauthGoogleFallido
    )
  })
})