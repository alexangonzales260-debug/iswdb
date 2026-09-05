import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import { cambiarUsername, cambiarUsernameSchema, ERRORES_AUTH, iniciarSesionConGoogle } from '@/lib/auth'
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

describe('cambiarUsernameSchema (F021)', () => {
  it('username válido en [a-z0-9_-] de 3-20 → ok y normalizado a minúsculas', () => {
    const parsed = cambiarUsernameSchema.safeParse({ username: 'LeO_01-Gu' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.username).toBe('leo_01-gu')
    }
  })

  it('menos de 3 caracteres → error', () => {
    const parsed = cambiarUsernameSchema.safeParse({ username: 'ab' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain('3 y 20 caracteres')
  })

  it('más de 20 caracteres → error', () => {
    const parsed = cambiarUsernameSchema.safeParse({ username: 'x'.repeat(21) })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain('3 y 20 caracteres')
  })

  it('mayúsculas: se normalizan a minúsculas (store siempre minúsculas)', () => {
    const parsed = cambiarUsernameSchema.safeParse({ username: 'LEO' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.username).toBe('leo')
    }
  })

  it('carácter inválido (espacio) → error', () => {
    const parsed = cambiarUsernameSchema.safeParse({ username: 'leo guzman' })
    expect(parsed.success).toBe(false)
  })

  it('carácter inválido (@) → error', () => {
    const parsed = cambiarUsernameSchema.safeParse({ username: 'leo@iswdb' })
    expect(parsed.success).toBe(false)
  })
})

describe('cambiarUsername (F021)', () => {
  const USER_ID = '11111111-2222-3333-4444-555555555555'

  function buildClientWithUpdate(
    resultado: { error: { message: string; code?: string } | null }
  ): { client: AuthClient; update: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> } {
    const eq = vi.fn().mockResolvedValue(resultado)
    const update = vi.fn().mockReturnValue({ eq })
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
      },
      from: () => ({ update })
    } as unknown as AuthClient
    return { client, update, eq }
  }

  it('actualiza la fila propia con el username', async () => {
    const { client, update, eq } = buildClientWithUpdate({ error: null })

    await cambiarUsername(client, 'nuevo-usuario')

    expect(update).toHaveBeenCalledWith({ username: 'nuevo-usuario' })
    expect(eq).toHaveBeenCalledWith('id', USER_ID)
  })

  it('duplicado (23505) lanza ERRORES_AUTH.usernameEnUso', async () => {
    const { client } = buildClientWithUpdate({ error: { message: 'duplicate key', code: '23505' } })

    await expect(cambiarUsername(client, 'ocupado')).rejects.toThrow(
      ERRORES_AUTH.usernameEnUso
    )
  })

  it('sin sesión lanza credencialesInvalidas', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) }
    } as unknown as AuthClient

    await expect(cambiarUsername(client, 'cualquiera')).rejects.toThrow(
      ERRORES_AUTH.credencialesInvalidas
    )
  })

  it('error inesperado re-lanza el mensaje crudo', async () => {
    const { client } = buildClientWithUpdate({ error: { message: 'red caída' } })

    await expect(cambiarUsername(client, 'cualquiera')).rejects.toThrow('red caída')
  })
})