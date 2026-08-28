'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { accionProponerSerie, type PropuestaActionState } from '@/lib/propuestas-actions'
import type { CategoriaChip } from '@/lib/categorias'

type RolCanal = 'principal' | 'colaborador' | 'invitado'

interface FilaCanal {
  handle: string
  rol: RolCanal
}

const ESTADO_INICIAL: PropuestaActionState = {}

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30'

const textareaClass =
  'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30'

export interface PropuestaFormProps {
  categorias: CategoriaChip[]
}

export function PropuestaForm({ categorias }: PropuestaFormProps) {
  const [state, formAction, pending] = useActionState(accionProponerSerie, ESTADO_INICIAL)
  const [filasCanales, setFilasCanales] = useState<FilaCanal[]>([{ handle: '', rol: 'principal' }])

  function actualizarCanal(indice: number, cambios: Partial<FilaCanal>) {
    setFilasCanales((filas) =>
      filas.map((fila, i) => (i === indice ? { ...fila, ...cambios } : fila))
    )
  }

  function eliminarCanal(indice: number) {
    if (filasCanales.length <= 1) return
    setFilasCanales((filas) => filas.filter((_, i) => i !== indice))
  }

  function añadirCanal() {
    setFilasCanales((filas) => [...filas, { handle: '', rol: 'principal' }])
  }

  const canalesJson = JSON.stringify(
    filasCanales.map((fila) => ({
      handle: fila.handle.trim(),
      rol: fila.rol
    }))
  )

  const tieneCanalValido = filasCanales.some((f) => f.handle.trim() !== '')

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="canales" value={canalesJson} />

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="propuesta-titulo">Título</Label>
          <Input
            id="propuesta-titulo"
            name="titulo"
            placeholder="Título de la serie"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="propuesta-categoria">Categoría</Label>
          <select
            id="propuesta-categoria"
            name="categoria"
            required
            className={selectClass}
          >
            <option value="" disabled>
              Selecciona categoría
            </option>
            {categorias.map((categoria) => (
              <option key={categoria.slug} value={categoria.slug}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="propuesta-descripcion">Descripción</Label>
          <Textarea
            id="propuesta-descripcion"
            name="descripcion"
            rows={4}
            placeholder="De qué va la serie (mínimo 10 caracteres)"
            required
            className={textareaClass}
          />
          <p className="text-sm text-muted-foreground text-right" aria-live="polite">
            <span id="descripcion-contador">0</span>/5000
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="propuesta-playlist">Enlace a playlist / trailer (opcional)</Label>
          <Input
            id="propuesta-playlist"
            name="playlist_url"
            type="url"
            placeholder="https://www.youtube.com/playlist?list=…"
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="propuesta-email">Email de contacto (opcional)</Label>
          <Input
            id="propuesta-email"
            name="proponente_email"
            type="email"
            placeholder="tu@email.com"
          />
        </div>
      </section>

      <section aria-label="Canales participantes" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight">Canales participantes</h3>
          <p className="text-sm text-muted-foreground">Al menos un canal (máx. 10)</p>
        </div>

        {filasCanales.map((fila, indice) => (
          <div key={`canal-${indice}`} className="flex items-center gap-2">
            <Input
              aria-label={`Handle del canal ${indice + 1} (sin @)`}
              placeholder="canal-uno"
              value={fila.handle}
              onChange={(evento) => actualizarCanal(indice, { handle: evento.target.value })}
              required
              className="flex-1"
            />
            <select
              aria-label={`Rol del canal ${indice + 1}`}
              value={fila.rol}
              onChange={(evento) => actualizarCanal(indice, { rol: evento.target.value as RolCanal })}
              className={`${selectClass} w-40 shrink-0`}
            >
              <option value="principal">Principal</option>
              <option value="colaborador">Colaborador</option>
              <option value="invitado">Invitado</option>
            </select>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Eliminar canal ${indice + 1}`}
              onClick={() => eliminarCanal(indice)}
              disabled={filasCanales.length <= 1}
            >
              <Trash2 />
            </Button>
          </div>
        ))}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={añadirCanal}
            disabled={filasCanales.length >= 10}
          >
            <Plus />
            Añadir canal
          </Button>
        </div>
      </section>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending || !tieneCanalValido}>
          {pending ? 'Enviando…' : 'Proponer serie'}
        </Button>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            const ta = document.getElementById('propuesta-descripcion');
            const c = document.getElementById('descripcion-contador');
            if (ta && c) {
              const update = () => { c.textContent = ta.value.length; };
              ta.addEventListener('input', update);
              update();
            }
          `
        }}
      />
    </form>
  )
}