'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accionLogin, type AuthFormState } from '@/lib/auth-actions'

const ESTADO_INICIAL: AuthFormState = {}

// useActionState (React 19): la action devuelve el estado sin navegar, así el
// error de credenciales se pinta aquí sin redirigir (AUTH-02). Los inputs son
// no controlados: al no haber recarga completa, el email se preserva en fallo.
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(accionLogin, ESTADO_INICIAL)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@email.com"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password">Contraseña</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Entrando…' : 'Iniciar sesión'}
      </Button>
    </form>
  )
}
