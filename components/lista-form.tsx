'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  accionCrearLista,
  accionRenombrarLista,
  type ListaActionState
} from '@/lib/listas-actions'

const ESTADO_INICIAL: ListaActionState = {}

// Formulario crear/renombrar lista (F013, "use client" justificado:
// useActionState). En modo creación añade descripcion y es_publica; en modo
// renombrar (con valor inicial) solo edita el nombre y pasa por el bind del
// listaId. El error de la action se pinta con role="alert".
export function ListaForm({
  listaId,
  nombreInicial = ''
}: {
  listaId?: string
  nombreInicial?: string
}) {
  const editando = listaId !== undefined

  const [state, formAction, pending] = useActionState(
    editando ? accionRenombrarLista.bind(null, listaId!) : accionCrearLista,
    ESTADO_INICIAL
  )

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="lista-nombre">Nombre</Label>
        <Input
          id="lista-nombre"
          name="nombre"
          defaultValue={nombreInicial}
          minLength={3}
          maxLength={100}
          placeholder="Ej. Favoritas"
          required
        />
      </div>

      {!editando ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="lista-descripcion">Descripción</Label>
            <Textarea
              id="lista-descripcion"
              name="descripcion"
              rows={3}
              placeholder="¿Para qué es esta lista?"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="lista-es-publica"
              name="es_publica"
              type="checkbox"
              className="size-4"
            />
            <Label htmlFor="lista-es-publica">Lista pública (visible para todos)</Label>
          </div>
        </>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending
          ? 'Guardando…'
          : editando
            ? 'Guardar nombre'
            : 'Crear lista'}
      </Button>
    </form>
  )
}
