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
    global: {
      // Las peticiones de auth no deben cachearse ni memoizarse nunca: la
      // memoización de fetch de Next reutiliza respuestas GET idénticas dentro
      // del mismo render (rompió el self-healing de getPerfilData en F008).
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' })
    },
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

// REC-01: el email se valida, pero el mensaje es SIEMPRE el genérico (no
// revela si la cuenta existe). recuperarSchema solo valida formato.
export const recuperarSchema = z.object({
  email: z.email('Introduce un email válido')
})

// REC-05: min 8 caracteres en la nueva password y la confirmación debe
// coincidir. El refine apunta el issue al campo confirmacion.
export const nuevaPasswordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmacion: z.string().min(1, 'Confirma la nueva contraseña')
  })
  .refine((dato) => dato.password === dato.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion']
  })

// PER-02: la password actual no coincide con la de la cuenta (validado con
// el reauth vía signInWithPassword antes de cambiarla).
export const cambiarPasswordSchema = z
  .object({
    passwordActual: z.string().min(1, 'Introduce tu contraseña actual'),
    passwordNueva: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmacion: z.string().min(1, 'Confirma la nueva contraseña')
  })
  .refine((dato) => dato.passwordNueva === dato.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion']
  })

// PER-03: el email se valida, pero el mensaje es SIEMPRE el genérico (no
// revela si el email ya está en uso / existe la cuenta).
export const cambiarEmailSchema = z.object({
  email: z.email('Introduce un email válido')
})

// PER-05: 3-50 caracteres, sin espacios sobrantes en los extremos.
export const cambiarDisplayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(3, 'El nombre mostrado debe tener al menos 3 caracteres')
    .max(50, 'El nombre mostrado no puede superar los 50 caracteres')
})

export const ERRORES_AUTH = {
  emailDuplicado: 'Ya existe una cuenta con este email',
  credencialesInvalidas: 'Email o contraseña incorrectos',
  oauthGoogleFallido: 'No se pudo iniciar sesión con Google',
  // REC-01: mensaje genérico, igual para email existente e inexistente.
  mensajeRecuperacionEnviado: 'Si existe una cuenta con ese email, te hemos enviado un link',
  // REC-04: confirma el cambio; /login lo muestra como banner (role=status).
  cambiarPasswordOk: 'Contraseña actualizada correctamente',
  // PER-02: la password actual reautenticada no es correcta.
  passwordActualIncorrecta: 'La contraseña actual es incorrecta',
  // PER-03/PRE-04: genérico siempre, no revela si el email nuevo ya existe.
  mensajeEmailCambioEnviado: 'Te hemos enviado un link de confirmación al nuevo email',
  // PER-05: confirma el cambio de nombre mostrado.
  displayNameOk: 'Nombre mostrado actualizado'
} as const

// Origin para construir el redirectTo del link de recuperación (REC-02). En
// local es http://localhost:3000 (site_url de supabase/config.toml y dominio
// canónico de la app); en despliegue se define NEXT_PUBLIC_SITE_URL. No se
// hardcodea el puerto.
export function origin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

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
  // Fila en public.usuario con rol 'user' (AUTH-01) y email desnormalizado
  // (F012/M6: RES-08 lo necesita en la lista pública de reseñas). RLS
  // usuario_insert_own: id = auth.uid(). El 23505 cubre la carrera con el
  // self-healing de getPerfilData: si la fila ya existe, el registro es
  // válido igualmente.
  const { error: insertError } = await client
    .from('usuario')
    .insert({ id: user.id, rol: 'user', email })
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

export async function iniciarSesionConGoogle(
  client: AuthClient,
  redirectTo: string
): Promise<void> {
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  })
  if (error) throw new Error(ERRORES_AUTH.oauthGoogleFallido)
}

export async function cerrarSesion(client: AuthClient): Promise<void> {
  const { error } = await client.auth.signOut()
  if (error) throw new Error(error.message)
}

export interface PerfilData {
  email: string
  created_at: string
  rol: string
  display_name: string | null
}

async function selectUsuario(client: AuthClient, userId: string) {
  const { data, error } = await client
    .from('usuario')
    .select('rol, created_at, display_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Self-healing de la fila public.usuario (AUTH-01): si el signUp funcionó pero
// el insert de la fila usuario falló o el auth user aún no tiene fila (p. ej.
// seguir una serie antes de visitar /perfil), se crea aquí con la sesión
// activa (RLS usuario_insert_own: id = auth.uid()). Reutilizable desde
// getPerfilData y desde cualquier Server Action que necesite la FK.
//
// Upsert con ignoreDuplicates (INSERT ... ON CONFLICT DO NOTHING + RETURNING):
// un solo round-trip crea la fila o devuelve nada si ya existía. El DO NOTHING
// es deliberado: un DO UPDATE sobreescribiría el rol (p. ej. degradaría a un
// admin) y dispararía el trigger anti-escalada. El email (F012/M6) solo se
// escribe al crear la fila, por el mismo motivo.
export async function asegurarFilaUsuario(
  client: AuthClient,
  userId: string,
  email: string
): Promise<void> {
  const { error } = await client
    .from('usuario')
    .upsert({ id: userId, rol: 'user', email }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

// Datos de perfil (AUTH-03) usando asegurarFilaUsuario + GET de fallback. El
// GET solo ocurre cuando la fila ya existía, así nunca hay dos GET idénticos
// en el mismo render (la memoización de fetch de Next devolvería la respuesta
// obsoleta).
export async function getPerfilData(
  client: AuthClient,
  userId: string,
  email: string
): Promise<PerfilData> {
  await asegurarFilaUsuario(client, userId, email)

  const fila = await selectUsuario(client, userId)
  if (!fila) throw new Error('No se pudo obtener ni crear la fila de usuario')
  return { email, created_at: fila.created_at, rol: fila.rol, display_name: fila.display_name }
}

// REC-01/REC-02: pide el link de recuperación a GoTrue. Si el email no
// existe, GoTrue NO devuelve error (anti-enumeración por diseño, no se manda
// correo) — comportamiento idéntico al observable del caso válido. Si GoTrue
// lanza (rate-limit/red), se re-lanza el mensaje genérico para que la action
// tampoco revele nada.
export async function solicitarRecuperacion(
  client: AuthClient,
  email: string
): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin()}/auth/reset`
  })
  if (error) throw new Error(ERRORES_AUTH.mensajeRecuperacionEnviado)
}

// REC-04: actualiza la password. Requiere la sesión de recovery activa (la
// que deja GoTrue al intercambiar el token del link); si no hay sesión,
// updateUser falla y la action mostrará error + enlace a /recuperar.
export async function restablecerPassword(
  client: AuthClient,
  password: string
): Promise<void> {
  const { error } = await client.auth.updateUser({ password })
  if (error) throw new Error(error.message)
}

// PER-01/PER-02: reauth vía signInWithPassword para verificar la password
// actual antes de actualizarla. Si el reauth falla (password actual
// incorrecta), se lanza un error específico (PER-02 anti-enumeración de la
// nueva password). El email se obtiene de la sesión activa (getUser).
export async function cambiarPassword(
  client: AuthClient,
  passwordActual: string,
  passwordNueva: string
): Promise<void> {
  const { data: userData, error: getUserError } = await client.auth.getUser()
  if (getUserError || !userData.user?.email) {
    throw new Error(ERRORES_AUTH.credencialesInvalidas)
  }

  const { error: reauthError } = await client.auth.signInWithPassword({
    email: userData.user.email,
    password: passwordActual
  })
  if (reauthError) {
    throw new Error(ERRORES_AUTH.passwordActualIncorrecta)
  }

  const { error } = await client.auth.updateUser({ password: passwordNueva })
  if (error) throw new Error(error.message)
}

// PER-03/PRE-04: updateUser({email}) envía link de confirmación al nuevo
// email vía GoTrue. Con double_confirm_changes=false solo el nuevo requiere
// confirmar. Mensaje genérico SIEMPRE (anti-enumeración, PER-03).
export async function cambiarEmail(
  client: AuthClient,
  nuevoEmail: string
): Promise<string> {
  const { error } = await client.auth.updateUser({ email: nuevoEmail })
  if (error) throw new Error(error.message)
  return ERRORES_AUTH.mensajeEmailCambioEnviado
}

// PER-05: actualiza display_name en public.usuario. RLS usuario_update_own
// permite escribir la fila propia (id = auth.uid()). El userId se obtiene
// de la sesión activa.
export async function cambiarDisplayName(
  client: AuthClient,
  displayName: string
): Promise<void> {
  const { data: userData, error: getUserError } = await client.auth.getUser()
  if (getUserError || !userData.user) {
    throw new Error(ERRORES_AUTH.credencialesInvalidas)
  }

  const { error } = await client
    .from('usuario')
    .update({ display_name: displayName || null })
    .eq('id', userData.user.id)
  if (error) throw new Error(error.message)
}
