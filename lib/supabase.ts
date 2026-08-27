import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY: copia .env.example a .env.local'
  )
}

// Cliente server-side con la anon key: el catálogo es de lectura pública por
// RLS (MOD-05). El cliente con cookies de sesión (@supabase/ssr) llega en F008.
export const supabaseServer = createClient<Database>(supabaseUrl, supabaseAnonKey)
