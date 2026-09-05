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
  asegurarFilaUsuario,
  cambiarDisplayName,
  cambiarDisplayNameSchema,
  cambiarEmail,
  cambiarEmailSchema,
  cambiarPassword,
  cambiarPasswordSchema,
  ERRORES_AUTH,
  registrarUsuario,
  usernameDesdeEmail
} from '@/lib/auth'
import type { Database } from '@/types/database'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, signInTestUser } from './env'

requireLocalDb()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// El servidor de email local (olas DB) de supabase start: en esta versión de
// la CLI (2.115.0) es Mailpit en el puerto 54324. API: /api/v1/search?query=to:<email>.
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

const PASSWORD = 'password-123-'
const NEW_PASSWORD = 'newpassword-456'

let runId: number
const createdAuthUserIds: string[] = []

function nuevoCliente(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

function emailDe(nombre: string): string {
  return `perfil-test-${nombre}-${runId}@iswdb.local`
}

// Lee (con poll) el correo de confirmación de cambio de email en Mailpit y
// extrae el token del link (…/auth/v1/verify?token=<hex>&type=email_change…),
// igual que readResetToken lo hace para type=recovery.
async function readEmailChangeToken(email: string): Promise<string | null> {
  let token: string | null = null
  for (let intento = 1; intento <= 20 && !token; intento++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
    )
    const data = (await res.json()) as { messages?: { ID: string; Subject: string }[] }
    const confirm = (data.messages ?? []).find(
      (m) => m.Subject === 'Confirm your new email address'
    )
    if (confirm) {
      const detalleRes = await fetch(`${MAILPIT_URL}/api/v1/message/${confirm.ID}`)
      const detalle = (await detalleRes.json()) as { Text?: string }
      const match = detalle.Text?.match(/verify\?token=([0-9a-f]+)&type=email_change/)
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
  const warmupId = await createTestUser(emailDe('warmup'), PASSWORD)
  await deleteTestUser(warmupId)
}, 60_000)

afterAll(async () => {
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('F015 cambiarPassword (PER-01/PER-02)', () => {
  it('reauth OK: login con la password nueva funciona y con la antigua falla', async () => {
    const email = emailDe('pass-ok')
    const userId = await createTestUser(email, PASSWORD)
    createdAuthUserIds.push(userId)
    const client = await signInTestUser(email, PASSWORD)

    await cambiarPassword(client, PASSWORD, NEW_PASSWORD)

    const nuevoLogin = nuevoCliente()
    await expect(
      nuevoLogin.auth.signInWithPassword({ email, password: NEW_PASSWORD })
    ).resolves.toMatchObject({ error: null })

    const antiguoLogin = nuevoCliente()
    const { error: errorAntiguo } = await antiguoLogin.auth.signInWithPassword({
      email,
      password: PASSWORD
    })
    expect(errorAntiguo).not.toBeNull()
  }, 30_000)

  it('password actual incorrecta → error PER-02', async () => {
    const email = emailDe('pass-bad')
    const userId = await createTestUser(email, PASSWORD)
    createdAuthUserIds.push(userId)
    const client = await signInTestUser(email, PASSWORD)

    await expect(
      cambiarPassword(client, 'actual-incorrecta', NEW_PASSWORD)
    ).rejects.toThrow(ERRORES_AUTH.passwordActualIncorrecta)
  }, 30_000)
})

describe('F015 cambiarEmail (PER-03/PER-04)', () => {
  it('envía link de confirmación de cambio al nuevo email', async () => {
    const email = emailDe('email-cambio')
    const nuevoEmail = emailDe('email-nuevo')
    const userId = await createTestUser(email, PASSWORD)
    createdAuthUserIds.push(userId)
    const client = await signInTestUser(email, PASSWORD)

    await cambiarEmail(client, nuevoEmail)

    const token = await readEmailChangeToken(nuevoEmail)
    expect(token).toBeTruthy()
  }, 30_000)

  it('confirma el link → login con el nuevo email funciona y con el antiguo falla', async () => {
    const email = emailDe('email-confirma')
    const nuevoEmail = emailDe('email-confirma-nuevo')
    const userId = await createTestUser(email, PASSWORD)
    createdAuthUserIds.push(userId)
    const client = await signInTestUser(email, PASSWORD)

    await cambiarEmail(client, nuevoEmail)

    const token = await readEmailChangeToken(nuevoEmail)
    expect(token).toBeTruthy()

    const confirmClient = nuevoCliente()
    const { error: verError } = await confirmClient.auth.verifyOtp({
      type: 'email_change',
      token_hash: token as string
    })
    expect(verError).toBeNull()

    const nuevoLogin = nuevoCliente()
    await expect(
      nuevoLogin.auth.signInWithPassword({ email: nuevoEmail, password: PASSWORD })
    ).resolves.toMatchObject({ error: null })

    const antiguoLogin = nuevoCliente()
    const { error: errorAntiguo } = await antiguoLogin.auth.signInWithPassword({
      email,
      password: PASSWORD
    })
    expect(errorAntiguo).not.toBeNull()
  }, 30_000)

  it('mensaje genérico siempre, no revela si el email nuevo existe', async () => {
    const email = emailDe('email-inexistente')
    const userId = await createTestUser(email, PASSWORD)
    createdAuthUserIds.push(userId)
    const client = await signInTestUser(email, PASSWORD)

    const mensaje = await cambiarEmail(client, emailDe('otra-cuenta'))
    expect(mensaje).toBe(ERRORES_AUTH.mensajeEmailCambioEnviado)
  }, 30_000)
})

describe('F015 cambiarDisplayName (PER-05)', () => {
  it('actualiza display_name y la lectura con RLS propia lo refleja', async () => {
    const email = emailDe('dn-ok')
    const userId = await createTestUser(email, PASSWORD)
    createdAuthUserIds.push(userId)
    // El admin de GoTrue no crea la fila en public.usuario; el servicio la
    // actualiza (PER-05), así que se inserta vía service-role (evita RLS).
    const { error: insertError } = await dbAdmin
      .from('usuario')
      .insert({ id: userId, email, username: usernameDesdeEmail(email, userId) })
    expect(insertError).toBeNull()
    const client = await signInTestUser(email, PASSWORD)

    await cambiarDisplayName(client, 'Nuevo Nombre')

    const { data } = await client
      .from('usuario')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle()
    expect(data?.display_name).toBe('Nuevo Nombre')
  }, 30_000)

  it('usuario ajeno: RLS usuario_update_own lo bloquea (no actualiza)', async () => {
    const emailA = emailDe('dn-ajeno-a')
    const emailB = emailDe('dn-ajeno-b')
    const userIdA = await createTestUser(emailA, PASSWORD)
    const userIdB = await createTestUser(emailB, PASSWORD)
    createdAuthUserIds.push(userIdA, userIdB)
    await dbAdmin.from('usuario').insert([
      {
        id: userIdA,
        email: emailA,
        username: usernameDesdeEmail(emailA, userIdA)
      },
      {
        id: userIdB,
        email: emailB,
        username: usernameDesdeEmail(emailB, userIdB)
      }
    ])
    const clientA = await signInTestUser(emailA, PASSWORD)

    // El servicio siempre apunta a la propia fila; para probar RLS se hace el
    // UPDATE directo apuntando a la fila de otro usuario desde la sesión A.
    await clientA.from('usuario').update({ display_name: 'Intruso' }).eq('id', userIdB)

    // usuario_select_own (M7) impide leer la fila ajena con la sesión A; la
    // verificación se hace con service-role (sin RLS, dbAdmin).
    const { data: filaB } = await dbAdmin
      .from('usuario')
      .select('display_name')
      .eq('id', userIdB)
      .maybeSingle()
    expect(filaB?.display_name).toBeNull()
  }, 30_000)
})

describe('F015 validación Zod', () => {
  it('cambiarPasswordSchema: password nueva <8 caracteres → error', () => {
    const parsed = cambiarPasswordSchema.safeParse({
      passwordActual: PASSWORD,
      passwordNueva: 'corta',
      confirmacion: 'corta'
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain('8 caracteres')
  })

  it('cambiarPasswordSchema: confirmación que no coincide → error', () => {
    const parsed = cambiarPasswordSchema.safeParse({
      passwordActual: PASSWORD,
      passwordNueva: 'password-larga-1',
      confirmacion: 'distinta'
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(['confirmacion'])
  })

  it('cambiarEmailSchema: email mal formado → error; válido → ok', () => {
    expect(cambiarEmailSchema.safeParse({ email: 'no-es-email' }).success).toBe(false)
    expect(cambiarEmailSchema.safeParse({ email: 'usuario@example.com' }).success).toBe(true)
  })

  it('cambiarDisplayNameSchema: <3 caracteres → error', () => {
    const parsed = cambiarDisplayNameSchema.safeParse({ displayName: 'ab' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain('3 caracteres')
  })

  it('cambiarDisplayNameSchema: >50 caracteres → error', () => {
    const parsed = cambiarDisplayNameSchema.safeParse({ displayName: 'x'.repeat(51) })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain('50 caracteres')
  })

  it('cambiarDisplayNameSchema: 3-50 caracteres → ok', () => {
    expect(cambiarDisplayNameSchema.safeParse({ displayName: 'Leo' }).success).toBe(true)
  })
})

describe('F021 username (T2)', () => {
  it('registrarUsuario crea la fila con username derivado del email', async () => {
    const email = emailDe('username-registro')
    const client = nuevoCliente()

    const { userId } = await registrarUsuario(client, email, PASSWORD)
    createdAuthUserIds.push(userId)

    const { data: fila } = await dbAdmin
      .from('usuario')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
    expect(fila?.username).toBe(usernameDesdeEmail(email, userId))
  }, 30_000)

  it('asegurarFilaUsuario crea la fila con username derivado (self-healing)', async () => {
    const email = emailDe('username-healing')
    const userId = await createTestUser(email, PASSWORD)
    createdAuthUserIds.push(userId)

    await asegurarFilaUsuario(dbAdmin, userId, email)

    const { data: fila } = await dbAdmin
      .from('usuario')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
    expect(fila?.username).toBe(usernameDesdeEmail(email, userId))
  }, 30_000)
})
