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
