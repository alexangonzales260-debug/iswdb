'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accionCambiarEmail, type AuthFormState } from '@/lib/auth-actions'

const ESTADO_INICIAL: AuthFormState = {}

// PER-03/PER-04: pide a GoTrue el cambio de email. El mensaje de éxito es
// SIEMPRE el genérico (no revela si el email ya existe). En fallo { error }.
export function CambiarEmailForm() {
  const [state, formAction, pending] = useActionState(
    accionCambiarEmail,
    ESTADO_INICIAL
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cambiar-email-nuevo">Nuevo email</Label>
        <Input
          id="cambiar-email-nuevo"
          name="email"
          type="email"
          autoComplete="email"
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
        {pending ? 'Cambiando…' : 'Cambiar email'}
      </Button>
    </form>
  )
}
