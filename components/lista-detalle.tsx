'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Trash2, X, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ListaForm } from '@/components/lista-form'
import {
  accionEliminarLista,
  accionQuitarSerie,
  accionReordenar,
  accionRenombrarLista,
  accionCambiarDescripcionLista
} from '@/lib/listas-actions'
import type { ListaSerieDetalle } from '@/lib/listas'

export interface ListaDetalleClienteProps {
  listaId: string
  nombre: string
  descripcion: string | null
  esOwner: boolean
  rol: 'owner' | 'editor' | 'lector' | null
  series: ListaSerieDetalle[]
  numEditores?: number
  conTrimestres?: never
}

const puedeEditar = (rol: 'owner' | 'editor' | 'lector' | null) =>
  rol === 'owner' || rol === 'editor'

// Detalle de una lista (F013, "use client" justificado: botones quitar /
// reordenar con useTransition y estado). Las series se muestran en orden
// manual. Si esOwner/editor → botones quitar + reordenar (↑/↓) que llaman las
// acciones y luego router.refresh() para reflejar el nuevo orden. Si es solo
// lectura (lista pública de otro, lector o sin sesión) → sin botones.
export function ListaDetalle({
  listaId,
  nombre,
  descripcion,
  esOwner,
  rol,
  series,
  numEditores
}: ListaDetalleClienteProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [renombrando, setRenombrando] = useState(false)
  const [editandoDescripcion, setEditandoDescripcion] = useState(false)

  const puedeEditarLista = puedeEditar(rol)
  const esColaborativa = (numEditores ?? 0) > 1

  const [renombrarState, renombrarAction] = useActionState(
    accionRenombrarLista.bind(null, listaId),
    { error: undefined }
  )
  const [descripcionState, descripcionAction] = useActionState(
    accionCambiarDescripcionLista.bind(null, listaId),
    { error: undefined }
  )

  function quitar(serieId: string, serieSlug: string) {
    setError(null)
    startTransition(async () => {
      const resultado = await accionQuitarSerie(listaId, serieId, serieSlug)
      if (resultado.error) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  function mover(serieId: string, delta: number) {
    const idx = series.findIndex((s) => s.serieId === serieId)
    const destino = idx + delta
    if (idx < 0 || destino < 0 || destino >= series.length) return

    const nuevo: string[] = series.map((s) => s.serieId)
    const [movido] = nuevo.splice(idx, 1)
    nuevo.splice(destino, 0, movido)

    setError(null)
    startTransition(async () => {
      const resultado = await accionReordenar(listaId, nuevo)
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
      const resultado = await accionEliminarLista(listaId)
      if (resultado.error) {
        setError(resultado.error)
        return
      }
      router.push('/listas')
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{nombre}</h1>
          {esColaborativa && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
              title="Esta lista tiene más de un editor"
            >
              <Users className="h-3 w-3" aria-hidden="true" />
              Lista colaborativa
            </span>
          )}
        </div>
        {descripcion ? (
          <p className="text-muted-foreground">{descripcion}</p>
        ) : null}
        {puedeEditarLista ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setRenombrando((v) => !v)}
            >
              {renombrando ? 'Cancelar' : 'Renombrar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setEditandoDescripcion((v) => !v)}
            >
              {editandoDescripcion ? 'Cancelar' : 'Descripción'}
            </Button>
            {esOwner ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={eliminar}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
                Eliminar lista
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {esOwner && renombrando ? (
        <div className="rounded-xl border bg-card p-4">
          <form action={renombrarAction} className="space-y-2">
            <ListaForm listaId={listaId} nombreInicial={nombre} />
            {renombrarState.error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {renombrarState.error}
              </p>
            )}
            <Button type="submit" disabled={isPending}>
              Guardar
            </Button>
          </form>
        </div>
      ) : null}

      {puedeEditarLista && editandoDescripcion ? (
        <div className="rounded-xl border bg-card p-4">
          <form action={descripcionAction} className="space-y-2">
            <label htmlFor="descripcion" className="sr-only">
              Descripción
            </label>
            <textarea
              id="descripcion"
              name="descripcion"
              placeholder="Descripción (opcional)"
              className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={descripcion ?? ''}
            />
            {descripcionState.error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {descripcionState.error}
              </p>
            )}
            <Button type="submit" disabled={isPending}>
              Guardar
            </Button>
          </form>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {series.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Esta lista aún no tiene series.{' '}
          {puedeEditarLista
            ? 'Añade alguna desde su ficha con el botón «Añadir a lista».'
            : null}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {series.map((serie, i) => (
            <li
              key={serie.serieId}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <Link
                href={`/series/${serie.slug}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {serie.titulo}
              </Link>
              {puedeEditarLista ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Mover arriba ${serie.titulo}`}
                    disabled={isPending || i === 0}
                    onClick={() => mover(serie.serieId, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Mover abajo ${serie.titulo}`}
                    disabled={isPending || i === series.length - 1}
                    onClick={() => mover(serie.serieId, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar ${serie.titulo} de la lista`}
                    disabled={isPending}
                    onClick={() => quitar(serie.serieId, serie.slug)}
                    className="text-destructive hover:text-destructive"
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
