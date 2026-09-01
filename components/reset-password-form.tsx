'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accionConfirmarRecuperacion, type AuthFormState } from '@/lib/auth-actions'

const ESTADO_INICIAL: AuthFormState = {}

// useActionState (React 19): en éxito redirige a /login con el banner de
// confirmación; en fallo (sin sesión de recovery, link caducado o contraseñas
// que no coinciden) devuelve { error }, que se pinta aquí sin redirigir.
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    accionConfirmarRecuperacion,
    ESTADO_INICIAL
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-password">Nueva contraseña</Label>
        <Input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-confirmacion">Confirmar contraseña</Label>
        <Input
          id="reset-confirmacion"
          name="confirmacion"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Cambiando…' : 'Cambiar contraseña'}
      </Button>
    </form>
  )
}
