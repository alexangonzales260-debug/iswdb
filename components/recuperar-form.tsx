'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accionPedirRecuperacion, type AuthFormState } from '@/lib/auth-actions'

const ESTADO_INICIAL: AuthFormState = {}

// useActionState (React 19): la action devuelve el estado sin navegar. En
// éxito redirige SIEMPRE a /recuperar/enviado (REC-01) y en fallo devuelve el
// mensaje genérico, por eso el error aquí solo aparece ante el caso de rate
// limit / red, nunca revelando si el email existe.
export function RecuperarForm() {
  const [state, formAction, pending] = useActionState(
    accionPedirRecuperacion,
    ESTADO_INICIAL
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="recuperar-email">Email</Label>
        <Input
          id="recuperar-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@email.com"
          required
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar link'}
      </Button>
    </form>
  )
}
