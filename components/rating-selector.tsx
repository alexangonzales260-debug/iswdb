'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { accionEliminarValoracion, accionValorar } from '@/lib/valoraciones-actions'

const NOTAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export interface RatingSelectorProps {
  serieSlug: string
  notaActual: number | null
  conSesion: boolean
}

// Selector de valoración de la ficha (VAL-01/VAL-02, "use client" justificado:
// estado de transición y error de la action). Llamada directa a las server
// actions con useTransition (no useActionState: son 10 botones + eliminar, no
// un form). Tras el éxito, router.refresh() re-renderiza el payload RSC desde
// el servidor → agregado, histograma y notaActual se actualizan sin recarga;
// el selector no recalcula nada en cliente.
export function RatingSelector({ serieSlug, notaActual, conSesion }: RatingSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Sin sesión: link a /login conservando la ruta de vuelta y el mensaje
  // (AUTH-06); el banner lo pinta la página de login.
  if (!conSesion) {
    const params = new URLSearchParams({
      next: `/series/${serieSlug}`,
      msg: 'Debes iniciar sesión para valorar'
    })
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?${params.toString()}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Inicia sesión para valorar
        </Link>
      </p>
    )
  }

  function valorar(nota: number) {
    setError(null)
    startTransition(async () => {
      const resultado = await accionValorar(serieSlug, nota)
      if (resultado.error) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  function eliminar() {
    setError(null)
    startTransition(async () => {
      const resultado = await accionEliminarValoracion(serieSlug)
      if (resultado.error) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Tu valoración" className="flex flex-wrap gap-1.5">
        {NOTAS.map((nota) => {
          const activa = nota === notaActual
          return (
            <Button
              key={nota}
              type="button"
              variant={activa ? 'default' : 'outline'}
              size="sm"
              aria-pressed={activa}
              disabled={isPending}
              onClick={() => valorar(nota)}
              className="w-9 tabular-nums"
            >
              {nota}
            </Button>
          )
        })}
      </div>
      {notaActual !== null ? (
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={eliminar}>
          Eliminar valoración
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
