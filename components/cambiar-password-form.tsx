'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accionCambiarPassword, type AuthFormState } from '@/lib/auth-actions'

const ESTADO_INICIAL: AuthFormState = {}

// PER-01/PER-02: cambia la password previa reauth con la actual. En éxito
// devuelve { ok }; en fallo (password actual incorrecta) { error }.
export function CambiarPasswordForm() {
  const [state, formAction, pending] = useActionState(
    accionCambiarPassword,
    ESTADO_INICIAL
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cambiar-password-actual">Contraseña actual</Label>
        <Input
          id="cambiar-password-actual"
          name="passwordActual"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cambiar-password-nueva">Nueva contraseña</Label>
        <Input
          id="cambiar-password-nueva"
          name="passwordNueva"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cambiar-password-confirmacion">Confirmar nueva contraseña</Label>
        <Input
          id="cambiar-password-confirmacion"
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
      ) : state.ok ? (
        <p role="status" className="text-sm font-medium text-emerald-600">
          {state.ok}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Cambiando…' : 'Cambiar password'}
      </Button>
    </form>
  )
}
