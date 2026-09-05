'use client'

import { useActionState, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  accionInvitarColaborador,
  accionQuitarColaborador,
  accionCambiarRolColaborador
} from '@/lib/listas-actions'
import type { ListaActionState } from '@/lib/listas-actions'
import type { ColaboradorLista, RolColaborador } from '@/lib/listas-colaborativas'

export interface ColaboradoresListaProps {
  listaId: string
  colaboradores: ColaboradorLista[]
  ownerId: string
}

function RolBadge({ rol }: { rol: RolColaborador }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        rol === 'editor'
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
      }`}
    >
      {rol === 'editor' ? 'Editor' : 'Lector'}
    </span>
  )
}

export function ColaboradoresLista({ listaId, colaboradores, ownerId }: ColaboradoresListaProps) {
  const [invitarState, accionInvitar] = useActionState(
    async (_prev: ListaActionState, formData: FormData) => {
      return accionInvitarColaborador(listaId, _prev, formData)
    },
    { error: undefined }
  )
  const [isPendingQuitar, startQuitar] = useTransition()
  const [isPendingRol, startRol] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const invitarError = invitarState.error

  function handleQuitar(colaboradorId: string) {
    setError(null)
    startQuitar(async () => {
      const resultado = await accionQuitarColaborador(listaId, colaboradorId)
      if (resultado.error) {
        setError(resultado.error)
      }
    })
  }

  function handleCambiarRol(colaboradorId: string, nuevoRol: RolColaborador) {
    setError(null)
    startRol(async () => {
      const resultado = await accionCambiarRolColaborador(listaId, colaboradorId, nuevoRol)
      if (resultado.error) {
        setError(resultado.error)
      }
    })
  }

  const isPending = isPendingQuitar || isPendingRol

  return (
    <section className="rounded-xl border bg-card p-6 space-y-4">
      <h2 className="text-lg font-semibold">Colaboradores</h2>

      <form action={accionInvitar} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="username" className="sr-only">
            Nombre de usuario
          </label>
          <input
            type="text"
            id="username"
            name="username"
            placeholder="Nombre de usuario"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="w-full sm:w-auto">
          <label htmlFor="rol" className="sr-only">
            Rol
          </label>
          <select
            id="rol"
            name="rol"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue="editor"
          >
            <option value="editor">Editor</option>
            <option value="lector">Lector</option>
          </select>
        </div>
        <Button type="submit" disabled={isPending}>
          Invitar
        </Button>
        {invitarError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {invitarError}
          </p>
        )}
      </form>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <ul className="divide-y">
        {colaboradores.map((colaborador) => (
          <li
            key={colaborador.usuarioId}
            className="flex flex-wrap items-center justify-between gap-4 px-2 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{colaborador.username}</span>
              <RolBadge rol={colaborador.rol} />
              {colaborador.usuarioId === ownerId && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  tú
                </span>
              )}
            </div>

            {colaborador.usuarioId !== ownerId ? (
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={colaborador.rol}
                  onChange={(e) => handleCambiarRol(colaborador.usuarioId, e.target.value as RolColaborador)}
                  disabled={isPending}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  <option value="editor">Editor</option>
                  <option value="lector">Lector</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPending}
                  onClick={() => handleQuitar(colaborador.usuarioId)}
                  className="text-destructive hover:text-destructive"
                  aria-label={`Quitar a ${colaborador.username}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}