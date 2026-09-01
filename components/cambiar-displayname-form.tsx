'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accionCambiarDisplayName, type AuthFormState } from '@/lib/auth-actions'

const ESTADO_INICIAL: AuthFormState = {}

// PER-05: actualiza el nombre mostrado en public.usuario. En éxito devuelve
// { ok }; en fallo (longitud inválida) { error }.
export function CambiarDisplayNameForm() {
  const [state, formAction, pending] = useActionState(
    accionCambiarDisplayName,
    ESTADO_INICIAL
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cambiar-displayname">Nuevo nombre de usuario</Label>
        <Input
          id="cambiar-displayname"
          name="displayName"
          type="text"
          autoComplete="nickname"
          minLength={3}
          maxLength={50}
          required
        />
        <p className="text-xs text-muted-foreground">Entre 3 y 50 caracteres.</p>
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
        {pending ? 'Cambiando…' : 'Cambiar nombre'}
      </Button>
    </form>
  )
}
