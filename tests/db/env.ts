import { beforeAll } from 'vitest'
import { createClient, type PostgrestSingleResponse, type SupabaseClient } from '@supabase/supabase-js'

// Claves públicas de desarrollo local de Supabase (no son secretos:
// las imprime `supabase status` y son iguales en todo proyecto local).
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export const dbAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function unwrap<T>(p: PromiseLike<PostgrestSingleResponse<T>>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

export function requireLocalDb(): void {
  beforeAll(async () => {
    const { error } = await db.from('categoria').select('id').limit(1)
    if (error?.code === '42P01') {
      throw new Error('Migraciones no aplicadas → ejecuta supabase db reset')
    }
    if (error) {
      throw new Error('BD local no disponible → ejecuta supabase start')
    }
  })
}

const AUTH_ADMIN_USERS_URL = `${SUPABASE_URL}/auth/v1/admin/users`

function authAdminHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  }
}

export async function createTestUser(email: string, password: string): Promise<string> {
  // GoTrue en frío (tras db reset) puede responder 504 en las primeras llamadas.
  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(AUTH_ADMIN_USERS_URL, {
      method: 'POST',
      headers: authAdminHeaders(),
      body: JSON.stringify({ email, password, email_confirm: true })
    })
    if (res.ok) {
      const user = (await res.json()) as { id: string }
      return user.id
    }
    lastError = `(${res.status}): ${await res.text()}`
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  throw new Error(`GoTrue admin: no se pudo crear usuario ${lastError}`)
}

export async function deleteTestUser(userId: string): Promise<void> {
  const res = await fetch(`${AUTH_ADMIN_USERS_URL}/${userId}`, {
    method: 'DELETE',
    headers: authAdminHeaders()
  })
  if (!res.ok) {
    console.warn(`GoTrue admin: no se pudo borrar usuario de test ${userId} (${res.status})`)
  }
}

export async function signInTestUser(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(`GoTrue: login falló para ${email}: ${error.message}`)
  }
  return client
}

export function usernameDesdeEmail(email: string, userId: string): string {
  const base =
    (email.split('@')[0] ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 13) || 'usuario'
  return `${base}-${userId.replaceAll('-', '').slice(0, 6)}`
}
