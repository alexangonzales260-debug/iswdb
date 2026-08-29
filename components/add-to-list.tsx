'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { accionAñadirSerie } from '@/lib/listas-actions'
import type { MisLista } from '@/lib/listas'

export interface AddToListProps {
  serieId: string
  serieSlug: string
  conSesion: boolean
  listas: MisLista[]
}

// Botón/Dropdown "Añadir a lista" de la ficha (LIS-10, "use client"
// justificado: dropdown + useTransition + error). Null si no hay sesión: el
// resto de la ficha ya ofrece el link a /login. Con sesión muestra el
// desplegable con mis listas (pasadas por prop desde el RSC); al elegir una
// llama accionAñadirSerie y revalida la ficha y las rutas de listas.
export function AddToList({ serieId, serieSlug, conSesion, listas }: AddToListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<string>('')

  // LIS-10: sin sesión no se muestra nada (la ficha ya redirige a /login en
  // valoraciones/reseñas).
  if (!conSesion) return null

  function añadir(listaId: string) {
    if (!listaId) return
    setSeleccionado('')
    setError(null)
    startTransition(async () => {
      const resultado = await accionAñadirSerie(listaId, serieId, serieSlug)
      if (resultado.error) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  // Compatibilidad con el onChange del select: enviar el valor directamente.
  function alElegir(valor: string) {
    if (valor) añadir(valor)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Añadir a lista"
          value={seleccionado}
          onChange={(e) => alElegir(e.target.value)}
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={isPending || listas.length === 0}
        >
          <option value="">
            {listas.length === 0 ? 'Sin listas' : 'Añadir a lista…'}
          </option>
          {listas.map((lista) => (
            <option key={lista.id} value={lista.id}>
              {lista.nombre}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending || !seleccionado}
          onClick={() => añadir(seleccionado)}
        >
          <Plus aria-hidden="true" />
          Añadir
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
