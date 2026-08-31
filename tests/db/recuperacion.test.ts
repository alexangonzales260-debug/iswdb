import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// lib/auth.ts lanza si faltan env vars (fail fast); vi.hoisted se ejecuta
// antes que los imports, así el módulo se carga con las vars ya definidas.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import {
  nuevaPasswordSchema,
  recuperarSchema,
  restablecerPassword,
  solicitarRecuperacion
} from '@/lib/auth'
import type { Database } from '@/types/database'
import { createTestUser, deleteTestUser, requireLocalDb } from './env'

requireLocalDb()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// El servidor de email local (olas DB) de supabase start: en esta versión de
// la CLI (2.115.0) es Mailpit en el puerto 54324 (la spec lo llama Inbucket de
// forma genérica). API: /api/v1/search?query=to:<email> y /api/v1/message/<id>.
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

const OLD_PASSWORD = 'old-password-123'
const NEW_PASSWORD = 'new-password-456'

let runId: number
const createdAuthUserIds: string[] = []

// Cliente plano (sin cookies): los servicios de lib/auth.ts son inyectables
// y la sesión vive en memoria del cliente (persistSession: false).
function nuevoCliente(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

function emailDe(nombre: string): string {
  return `recuperacion-test-${nombre}-${runId}@iswdb.local`
}

// Lee (con poll) el último correo de recuperación de un destinatario en el
// servidor local de email y extrae el token del link
// (…/auth/v1/verify?token=<token>&type=recovery…).
async function readResetToken(email: string): Promise<string | null> {
  let token: string | null = null
  for (let intento = 1; intento <= 20 && !token; intento++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
    )
    const data = (await res.json()) as { messages?: { ID: string; Subject: string }[] }
    const reset = (data.messages ?? []).find((m) => m.Subject === 'Reset your password')
    if (reset) {
      const detalleRes = await fetch(`${MAILPIT_URL}/api/v1/message/${reset.ID}`)
      const detalle = (await detalleRes.json()) as { Text?: string }
      const match = detalle.Text?.match(/verify\?token=([0-9a-f]+)&type=recovery/)
      token = match ? match[1] : null
    }
    if (!token) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  return token
}

beforeAll(async () => {
  runId = Date.now()
  // GoTrue en frío (tras supabase start/reset) puede fallar en las primeras
  // llamadas: se templa creando y borrando un usuario vía admin API (el
  // helper ya reintenta).
  const warmupId = await createTestUser(emailDe('warmup'), OLD_PASSWORD)
  await deleteTestUser(warmupId)
}, 60_000)

afterAll(async () => {
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('F014 solicitarRecuperacion (REC-01/REC-02)', () => {
  it('email existente: no lanza y llega el link de recuperación al email', async () => {
    const email = emailDe('valido')
    const client = nuevoCliente()
    const userId = await createTestUser(email, OLD_PASSWORD)
    createdAuthUserIds.push(userId)

    await solicitarRecuperacion(client, email)

    const token = await readResetToken(email)
    expect(token).toBeTruthy()
  }, 30_000)

  it('email inexistente: no lanza y NO se envía correo (no revela si existe)', async () => {
    const email = emailDe('no-existe')
    const client = nuevoCliente()

    await solicitarRecuperacion(client, email)

    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
    )
    const data = (await res.json()) as { messages?: unknown[] }
    expect(data.messages ?? []).toHaveLength(0)
  }, 30_000)
})

describe('F014 restablecerPassword (REC-04)', () => {
  it('cambia la password vía el token del link; login con la nueva OK y con la antigua falla', async () => {
    const email = emailDe('cambiar')
    const userId = await createTestUser(email, OLD_PASSWORD)
    createdAuthUserIds.push(userId)

    // 1. Pedir la recuperación (se manda el link al email).
    await solicitarRecuperacion(nuevoCliente(), email)

    // 2. Extraer el token del link y canjearlo por una sesión de recovery.
    const token = await readResetToken(email)
    expect(token).toBeTruthy()
    const recoveryClient = nuevoCliente()
    const { error: verError } = await recoveryClient.auth.verifyOtp({
      type: 'recovery',
      token_hash: token as string
    })
    expect(verError).toBeNull()

    // 3. Cambiar la password con la sesión de recovery activa (REC-04).
    await restablecerPassword(recoveryClient, NEW_PASSWORD)

    // 4. Login con la nueva password OK; con la antigua falla.
    const nuevoLogin = nuevoCliente()
    await expect(
      nuevoLogin.auth.signInWithPassword({ email, password: NEW_PASSWORD })
    ).resolves.toMatchObject({ error: null })

    const antiguoLogin = nuevoCliente()
    const { error: errorAntiguo } = await antiguoLogin.auth.signInWithPassword({
      email,
      password: OLD_PASSWORD
    })
    expect(errorAntiguo).not.toBeNull()
  }, 30_000)
})

describe('F014 validación Zod (REC-05)', () => {
  it('recuperarSchema acepta email válido y rechaza un email mal formado', () => {
    expect(recuperarSchema.safeParse({ email: 'usuario@example.com' }).success).toBe(true)
    expect(recuperarSchema.safeParse({ email: 'no-es-email' }).success).toBe(false)
  })

  it('nuevaPasswordSchema: password <8 caracteres → error', () => {
    const parsed = nuevaPasswordSchema.safeParse({ password: 'corta', confirmacion: 'corta' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain('8 caracteres')
  })

  it('nuevaPasswordSchema: confirmación distinta → error en confirmacion', () => {
    const parsed = nuevaPasswordSchema.safeParse({
      password: 'password-larga-1',
      confirmacion: 'otra-distinta-2'
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(['confirmacion'])
    expect(parsed.error?.issues[0]?.message).toBe('Las contraseñas no coinciden')
  })

  it('nuevaPasswordSchema: válida cuando cumple min 8 y coincide', () => {
    const parsed = nuevaPasswordSchema.safeParse({
      password: 'password-larga-1',
      confirmacion: 'password-larga-1'
    })
    expect(parsed.success).toBe(true)
  })
})
