'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accionRegistro, type AuthFormState } from '@/lib/auth-actions'

const ESTADO_INICIAL: AuthFormState = {}

// useActionState (React 19): la action devuelve el estado sin navegar, así el
// error (p. ej. email duplicado) se pinta aquí sin redirigir (AUTH-01). Los
// inputs son no controlados: el email se preserva en fallo.
export function RegistroForm() {
  const [state, formAction, pending] = useActionState(accionRegistro, ESTADO_INICIAL)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="registro-email">Email</Label>
        <Input
          id="registro-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@email.com"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="registro-password">Contraseña</Label>
        <Input
          id="registro-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
    </form>
  )
}
