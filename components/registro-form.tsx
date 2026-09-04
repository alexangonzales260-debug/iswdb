'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accionRegistro, type AuthFormState } from '@/lib/auth-actions'
import { createBrowserAuthClient } from '@/lib/supabase-browser'

const ESTADO_INICIAL: AuthFormState = {}

// useActionState (React 19): la action devuelve el estado sin navegar, así el
// error (p. ej. email duplicado) se pinta aquí sin redirigir (AUTH-01). Los
// inputs son no controlados: el email se preserva en fallo.
export function RegistroForm() {
  const [state, formAction, pending] = useActionState(accionRegistro, ESTADO_INICIAL)
  const [pendingGoogle, setPendingGoogle] = useState(false)
  const [errorGoogle, setErrorGoogle] = useState<string | null>(null)

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
      <div className="my-4 flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">O continúa con</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={pendingGoogle}
        onClick={async () => {
          setPendingGoogle(true)
          setErrorGoogle(null)
          try {
            const client = createBrowserAuthClient()
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin
            const next = new URLSearchParams(window.location.search).get('next') ?? '/'
            const { error } = await client.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`
              }
            })
            if (error) {
              setErrorGoogle('No se pudo iniciar sesión con Google')
              setPendingGoogle(false)
            }
          } catch {
            setErrorGoogle('No se pudo iniciar sesión con Google')
            setPendingGoogle(false)
          }
        }}
      >
        {pendingGoogle ? 'Redirigiendo…' : 'Continuar con Google'}
      </Button>
      {errorGoogle ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {errorGoogle}
        </p>
      ) : null}
    </form>
  )
}
