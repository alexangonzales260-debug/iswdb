'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accionCambiarUsername, type AuthFormState } from '@/lib/auth-actions'

const ESTADO_INICIAL: AuthFormState = {}

export function CambiarUsernameForm() {
  const [state, formAction, pending] = useActionState(
    accionCambiarUsername,
    ESTADO_INICIAL
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cambiar-username">Nuevo nombre de usuario</Label>
        <Input
          id="cambiar-username"
          name="username"
          type="text"
          autoComplete="nickname"
          minLength={3}
          maxLength={20}
          pattern="[a-z0-9_-]{3,20}"
          required
        />
        <p className="text-xs text-muted-foreground">
          Entre 3 y 20 caracteres: letras minúsculas, números, guiones y guiones bajos.
        </p>
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
        {pending ? 'Cambiando…' : 'Cambiar nombre de usuario'}
      </Button>
    </form>
  )
}