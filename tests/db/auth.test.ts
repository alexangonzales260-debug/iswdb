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
  cerrarSesion,
  ERRORES_AUTH,
  getPerfilData,
  iniciarSesion,
  registrarUsuario
} from '@/lib/auth'
import type { Database } from '@/types/database'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap } from './env'

requireLocalDb()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const TEST_PASSWORD = 'test-password-123'

let runId: number
// Borrar el auth user casca en cascada su fila de public.usuario y sus
// valoraciones (FK on delete cascade) → cleanup único en afterAll.
const createdAuthUserIds: string[] = []

// Cliente plano (sin cookies): los servicios de lib/auth.ts son inyectables
// y la sesión vive en memoria del cliente (persistSession: false).
function nuevoCliente(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

function emailDe(nombre: string): string {
  return `auth-test-${nombre}-${runId}@iswdb.local`
}

beforeAll(async () => {
  runId = Date.now()
  // GoTrue en frío (tras supabase start/reset) puede fallar en las primeras
  // llamadas: se templa creando y borrando un usuario vía admin API (el
  // helper ya reintenta).
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)
}, 60_000)

afterAll(async () => {
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('F008 registro (AUTH-01)', () => {
  it('crea usuario en auth.users y fila en public.usuario con rol user', async () => {
    const email = emailDe('registro')
    const client = nuevoCliente()

    const { userId } = await registrarUsuario(client, email, TEST_PASSWORD)
    createdAuthUserIds.push(userId)

    const fila = await unwrap(
      dbAdmin.from('usuario').select('id, rol').eq('id', userId).maybeSingle()
    )
    expect(fila).not.toBeNull()
    expect(fila?.rol).toBe('user')

    // El signUp devuelve sesión activa (enable_confirmations=false).
    const { data } = await client.auth.getUser()
    expect(data.user?.id).toBe(userId)
    expect(data.user?.email).toBe(email)
  }, 30_000)

  it('email duplicado: error "Ya existe una cuenta con este email" y sin sesión', async () => {
    const email = emailDe('duplicado')
    const primero = nuevoCliente()
    const { userId } = await registrarUsuario(primero, email, TEST_PASSWORD)
    createdAuthUserIds.push(userId)

    const segundo = nuevoCliente()
    await expect(registrarUsuario(segundo, email, TEST_PASSWORD)).rejects.toThrow(
      ERRORES_AUTH.emailDuplicado
    )

    const { data } = await segundo.auth.getUser()
    expect(data.user).toBeNull()
  }, 30_000)
})

describe('F008 login (AUTH-02)', () => {
  let userId: string
  const email = () => emailDe('login')

  beforeAll(async () => {
    const client = nuevoCliente()
    const registro = await registrarUsuario(client, email(), TEST_PASSWORD)
    userId = registro.userId
    createdAuthUserIds.push(userId)
  }, 30_000)

  it('credenciales correctas inician sesión', async () => {
    const client = nuevoCliente()
    await iniciarSesion(client, email(), TEST_PASSWORD)
    const { data } = await client.auth.getUser()
    expect(data.user?.id).toBe(userId)
  }, 30_000)

  it('password incorrecta: error "Email o contraseña incorrectos"', async () => {
    const client = nuevoCliente()
    await expect(iniciarSesion(client, email(), 'password-incorrecta-1')).rejects.toThrow(
      ERRORES_AUTH.credencialesInvalidas
    )
  }, 30_000)

  it('email inexistente: mismo error genérico (no revela si existe)', async () => {
    const client = nuevoCliente()
    await expect(iniciarSesion(client, emailDe('no-existe'), TEST_PASSWORD)).rejects.toThrow(
      ERRORES_AUTH.credencialesInvalidas
    )
  }, 30_000)
})

describe('F008 perfil (AUTH-03)', () => {
  it('getPerfilData con fila existente devuelve email, fecha y rol', async () => {
    const email = emailDe('perfil-fila')
    const userId = await createTestUser(email, TEST_PASSWORD)
    createdAuthUserIds.push(userId)
    await unwrap(dbAdmin.from('usuario').insert({ id: userId, rol: 'user' }))

    const client = nuevoCliente()
    await iniciarSesion(client, email, TEST_PASSWORD)

    const perfil = await getPerfilData(client, userId, email)
    expect(perfil.email).toBe(email)
    expect(perfil.rol).toBe('user')
    expect(perfil.created_at).toBeTruthy()
  }, 30_000)

  it('getPerfilData sin fila la crea (self-healing)', async () => {
    const email = emailDe('perfil-healing')
    const userId = await createTestUser(email, TEST_PASSWORD)
    createdAuthUserIds.push(userId)
    // Sin insert de la fila usuario: getPerfilData debe auto-repararla.

    const client = nuevoCliente()
    await iniciarSesion(client, email, TEST_PASSWORD)

    const perfil = await getPerfilData(client, userId, email)
    expect(perfil.email).toBe(email)
    expect(perfil.rol).toBe('user')

    const fila = await unwrap(
      dbAdmin.from('usuario').select('id, rol').eq('id', userId).maybeSingle()
    )
    expect(fila?.rol).toBe('user')
  }, 30_000)
})

describe('F008 logout (AUTH-04)', () => {
  it('cerrarSesion cierra la sesión: getUser devuelve null', async () => {
    const email = emailDe('logout')
    const registro = nuevoCliente()
    const { userId } = await registrarUsuario(registro, email, TEST_PASSWORD)
    createdAuthUserIds.push(userId)

    const client = nuevoCliente()
    await iniciarSesion(client, email, TEST_PASSWORD)
    const { data: antes } = await client.auth.getUser()
    expect(antes.user).not.toBeNull()

    await cerrarSesion(client)
    const { data: despues } = await client.auth.getUser()
    expect(despues.user).toBeNull()
  }, 30_000)
})
