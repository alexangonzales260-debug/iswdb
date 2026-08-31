'use server'

import { redirect } from 'next/navigation'
import {
  cerrarSesion,
  createAuthClient,
  ERRORES_AUTH,
  esRutaLocal,
  iniciarSesion,
  loginSchema,
  nuevaPasswordSchema,
  recuperarSchema,
  registrarUsuario,
  registroSchema,
  restablecerPassword,
  solicitarRecuperacion
} from './auth'

export interface AuthFormState {
  error?: string
}

function campoTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre)
  return typeof valor === 'string' ? valor : ''
}

// AUTH-01: en fallo devuelve { error } (useActionState lo pinta sin navegar);
// en éxito redirige a /perfil con confirmación de bienvenida.
export async function accionRegistro(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registroSchema.safeParse({
    email: campoTexto(formData, 'email').trim(),
    password: campoTexto(formData, 'password')
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario' }
  }
  const client = await createAuthClient()
  try {
    await registrarUsuario(client, parsed.data.email, parsed.data.password)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo completar el registro'
    }
  }
  redirect('/perfil?bienvenida=1')
}

// AUTH-02: credenciales incorrectas → { error } sin redirigir. En éxito,
// vuelve a la ruta callback si es local (AUTH-06) o a /perfil.
export async function accionLogin(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: campoTexto(formData, 'email').trim(),
    password: campoTexto(formData, 'password')
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario' }
  }
  const client = await createAuthClient()
  try {
    await iniciarSesion(client, parsed.data.email, parsed.data.password)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : ERRORES_AUTH.credencialesInvalidas
    }
  }
  const next = campoTexto(formData, 'next')
  redirect(next && esRutaLocal(next) ? next : '/perfil')
}

// AUTH-04: cierra la sesión y redirige a /.
export async function accionLogout(): Promise<void> {
  const client = await createAuthClient()
  try {
    await cerrarSesion(client)
  } catch {
    // Aunque falle la revocación en GoTrue, sacamos al usuario de la página.
  }
  redirect('/')
}

// REC-01: valida el email y pide el link a GoTrue. En éxito redirige SIEMPRE
// a /recuperar/enviado (incluso si el email no existe: GoTrue no revela). Si
// GoTrue lanza (rareza), se devuelve igualmente el mensaje genérico para no
// filtrar si la cuenta existe.
export async function accionPedirRecuperacion(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = recuperarSchema.safeParse({
    email: campoTexto(formData, 'email').trim()
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario' }
  }
  const client = await createAuthClient()
  try {
    await solicitarRecuperacion(client, parsed.data.email)
  } catch {
    // REC-01: mensaje genérico siempre, no revela existencia del email.
    return { error: ERRORES_AUTH.mensajeRecuperacionEnviado }
  }
  redirect('/recuperar/enviado')
}

// REC-04/REC-05: valida la nueva password y la aplica con la sesión de
// recovery activa (fijada por el callback). En éxito redirige a /login con el
// banner de confirmación (reutiliza el status de /login). En fallo (sin
// sesión de recovery / link caducado) devuelve un error amigable.
export async function accionConfirmarRecuperacion(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = nuevaPasswordSchema.safeParse({
    password: campoTexto(formData, 'password'),
    confirmacion: campoTexto(formData, 'confirmacion')
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario' }
  }
  const client = await createAuthClient()
  try {
    await restablecerPassword(client, parsed.data.password)
  } catch {
    // Sin sesión de recovery (link caducado/o ya usado) updateUser falla;
    // el form muestra el error y un enlace a /recuperar para pedir uno nuevo.
    return {
      error:
        'El enlace ha caducado o ya se ha utilizado. Vuelve a solicitar la recuperación.'
    }
  }
  const params = new URLSearchParams({ msg: ERRORES_AUTH.cambiarPasswordOk })
  redirect(`/login?${params.toString()}`)
}
