import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!envUrl || !envAnonKey) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY: copia .env.example a .env.local'
  )
}

// Consts ya estrechadas a string: el narrowing del check anterior no se
// propaga dentro de las funciones (createServiceRoleClient); mismo patrón
// que lib/auth.ts.
const supabaseUrl = envUrl
const supabaseAnonKey = envAnonKey

// Cliente server-side con la anon key: el catálogo es de lectura pública por
// RLS (MOD-05). El cliente con cookies de sesión (@supabase/ssr) llega en F008.
export const supabaseServer = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Getter perezoso del cliente service-role (F012). Server-only: la clave
// bypass de RLS jamás debe ser NEXT_PUBLIC ni llegar al bundle de cliente.
// Se usa solo donde el RLS oculta datos que una lectura server-side
// controlada necesita: la lista pública de reseñas con embed del email del
// autor (usuario_select_authenticated oculta la tabla usuario al anon).
// Lanza con mensaje claro solo si falta la env var al usarlo.
export function createServiceRoleClient(): SupabaseClient<Database> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY: añádela a .env.local (ver .env.example). Es server-only, nunca NEXT_PUBLIC.'
    )
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
