'use server'

import { redirect } from 'next/navigation'
import {
  cerrarSesion,
  createAuthClient,
  ERRORES_AUTH,
  esRutaLocal,
  iniciarSesion,
  loginSchema,
  registrarUsuario,
  registroSchema
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
