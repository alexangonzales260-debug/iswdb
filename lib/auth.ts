import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { z } from 'zod'
import type { Database } from '@/types/database'

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!envUrl || !envAnonKey) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY: copia .env.example a .env.local'
  )
}

// Consts ya estrechadas a string: el narrowing del check anterior no se
// propaga dentro de las funciones (createAuthClient).
const supabaseUrl = envUrl
const supabaseAnonKey = envAnonKey

export type AuthClient = SupabaseClient<Database>

// Cliente con cookies de sesión para App Router (AUTH-07). En Server
// Components las cookies son de solo lectura: setAll se ignora ahí; la sesión
// se escribe en contextos con cookies escribibles (Server Actions).
export async function createAuthClient(): Promise<AuthClient> {
  const cookieStore = await cookies()
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Component: cookies de solo lectura (ver comentario arriba).
        }
      }
    }
  })
}

// cache() de React: el header (layout) y las páginas llaman a getUser() en el
// mismo request; así se hace una sola llamada verificada a GoTrue por render.
export const getUser = cache(async () => {
  const supabase = await createAuthClient()
  const { data } = await supabase.auth.getUser()
  return data.user
})

// Una ruta de vuelta válida es local: empieza por '/' y no por '//' (evita
// open redirects con URLs absolutas o de protocolo relativo).
export function esRutaLocal(next: string): boolean {
  return /^\/(?!\/)/.test(next)
}

export interface RequireUserOptions {
  next?: string
  message?: string
}

// Guard de páginas protegidas (AUTH-03, AUTH-05, AUTH-06): sin sesión,
// redirige a /login conservando la ruta de vuelta y el mensaje opcional.
export async function requireUser(options: RequireUserOptions = {}) {
  const user = await getUser()
  if (!user) {
    const params = new URLSearchParams()
    if (options.next && esRutaLocal(options.next)) params.set('next', options.next)
    if (options.message) params.set('msg', options.message)
    const query = params.toString()
    redirect(query ? `/login?${query}` : '/login')
  }
  return user
}

export const registroSchema = z.object({
  email: z.email('Introduce un email válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres')
})

export const loginSchema = z.object({
  email: z.string().min(1, 'Introduce tu email'),
  password: z.string().min(1, 'Introduce tu contraseña')
})

export const ERRORES_AUTH = {
  emailDuplicado: 'Ya existe una cuenta con este email',
  credencialesInvalidas: 'Email o contraseña incorrectos'
} as const

// Servicios inyectables: reciben el cliente Supabase por parámetro para poder
// testearlos sin request context de Next. Las Server Actions pasan el cliente
// con cookies (createAuthClient); los tests, clientes planos.
export async function registrarUsuario(
  client: AuthClient,
  email: string,
  password: string
): Promise<{ userId: string }> {
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) {
    // Algunas versiones de GoTrue responden con error explícito al duplicado.
    if (/already registered/i.test(error.message)) {
      throw new Error(ERRORES_AUTH.emailDuplicado)
    }
    throw new Error(error.message)
  }
  const user = data.user
  // Anti-enumeración de GoTrue (enable_confirmations=false): si el email ya
  // existe devuelve 200 con un usuario sin identidades y sin sesión.
  if (!user || (user.identities ?? []).length === 0 || !data.session) {
    throw new Error(ERRORES_AUTH.emailDuplicado)
  }
  // Fila en public.usuario con rol 'user' (AUTH-01). RLS usuario_insert_own:
  // id = auth.uid(). El 23505 cubre la carrera con el self-healing de
  // getPerfilData: si la fila ya existe, el registro es válido igualmente.
  const { error: insertError } = await client.from('usuario').insert({ id: user.id, rol: 'user' })
  if (insertError && insertError.code !== '23505') {
    throw new Error(insertError.message)
  }
  return { userId: user.id }
}

export async function iniciarSesion(
  client: AuthClient,
  email: string,
  password: string
): Promise<void> {
  const { error } = await client.auth.signInWithPassword({ email, password })
  // Error genérico intencionado: no revelar si el email existe (AUTH-02).
  if (error) throw new Error(ERRORES_AUTH.credencialesInvalidas)
}

export async function cerrarSesion(client: AuthClient): Promise<void> {
  const { error } = await client.auth.signOut()
  if (error) throw new Error(error.message)
}

export interface PerfilData {
  email: string
  created_at: string
  rol: string
}

async function selectUsuario(client: AuthClient, userId: string) {
  const { data, error } = await client
    .from('usuario')
    .select('rol, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Datos de perfil (AUTH-03) con self-healing: si el signUp funcionó pero el
// insert de la fila usuario falló, se crea aquí con la sesión activa
// (RLS usuario_insert_own: id = auth.uid()).
export async function getPerfilData(
  client: AuthClient,
  userId: string,
  email: string
): Promise<PerfilData> {
  let fila = await selectUsuario(client, userId)
  if (!fila) {
    const { error } = await client.from('usuario').insert({ id: userId, rol: 'user' })
    if (error && error.code !== '23505') throw new Error(error.message)
    fila = await selectUsuario(client, userId)
  }
  if (!fila) throw new Error('No se pudo obtener ni crear la fila de usuario')
  return { email, created_at: fila.created_at, rol: fila.rol }
}
