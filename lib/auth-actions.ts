'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  cambiarDisplayName,
  cambiarDisplayNameSchema,
  cambiarEmail,
  cambiarEmailSchema,
  cambiarPassword,
  cambiarPasswordSchema,
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
  requireUser,
  restablecerPassword,
  solicitarRecuperacion
} from './auth'

export interface AuthFormState {
  error?: string
  ok?: string
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
  // Tras cambiar la password, se cierra la sesión de recovery: si se
  // dejara activa, /login redirigiría a /perfil (AUTH-05) y el banner de
  // confirmación (msg) nunca se vería; el usuario debe volver a entrar con
  // la nueva password. Si el signOut falla, se continúa igualmente.
  try {
    await cerrarSesion(client)
  } catch {
    // No bloqueamos el flujo por un fallo de signOut local.
  }
  const params = new URLSearchParams({ msg: ERRORES_AUTH.cambiarPasswordOk })
  redirect(`/login?${params.toString()}`)
}

// PER-01/PER-02: cambia la password previa reauth con la actual. En éxito
// devuelve { ok } (el form lo muestra sin recargar).
export async function accionCambiarPassword(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = cambiarPasswordSchema.safeParse({
    passwordActual: campoTexto(formData, 'passwordActual'),
    passwordNueva: campoTexto(formData, 'passwordNueva'),
    confirmacion: campoTexto(formData, 'confirmacion')
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario' }
  }
  await requireUser()
  const client = await createAuthClient()
  try {
    await cambiarPassword(
      client,
      parsed.data.passwordActual,
      parsed.data.passwordNueva
    )
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo cambiar la contraseña'
    }
  }
  revalidatePath('/perfil')
  return { ok: ERRORES_AUTH.cambiarPasswordOk }
}

// PER-03/PER-04: pide a GoTrue el cambio de email (envía link al nuevo).
// En éxito devuelve SIEMPRE el mensaje genérico (no revela si el email ya
// existe, PER-03).
export async function accionCambiarEmail(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = cambiarEmailSchema.safeParse({
    email: campoTexto(formData, 'email').trim()
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario' }
  }
  await requireUser()
  const client = await createAuthClient()
  try {
    await cambiarEmail(client, parsed.data.email)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo cambiar el email'
    }
  }
  revalidatePath('/perfil')
  return { ok: ERRORES_AUTH.mensajeEmailCambioEnviado }
}

// PER-05: actualiza el nombre mostrado en public.usuario. En éxito devuelve
// { ok } (confirmación mostrada en el form).
export async function accionCambiarDisplayName(
  prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = cambiarDisplayNameSchema.safeParse({
    displayName: campoTexto(formData, 'displayName')
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario' }
  }
  await requireUser()
  const client = await createAuthClient()
  try {
    await cambiarDisplayName(client, parsed.data.displayName)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo actualizar el nombre'
    }
  }
  revalidatePath('/perfil')
  return { ok: ERRORES_AUTH.displayNameOk }
}
