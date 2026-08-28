'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AdminActionState } from '@/lib/admin-actions'
import type { CanalOption } from '@/lib/canales'
import type { CategoriaChip } from '@/lib/categorias'

type RolCanal = 'principal' | 'colaborador' | 'invitado'
type EstadoSerie = 'activa' | 'finalizada'

export interface CanalInicial {
  canal_id: string
  rol: RolCanal
}

export interface EpisodioInicial {
  id?: string
  temporada: number
  numero: number
  titulo: string
  video_id: string
}

export interface SerieFormInicial {
  titulo: string
  descripcion: string
  categoria: string
  estado: EstadoSerie
  anio_inicio: number | null
  anio_fin: number | null
  playlist_url: string
  portada_url: string
  canales: CanalInicial[]
  episodios: EpisodioInicial[]
}

// Filas en cliente: los numéricos viven como string (valor del input) y se
// convierten al serializar el JSON oculto.
interface FilaCanal {
  canal_id: string
  rol: RolCanal
}

interface FilaEpisodio {
  id?: string
  temporada: string
  numero: string
  titulo: string
  video_id: string
}

export interface SerieFormProps {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>
  categorias: CategoriaChip[]
  canales: CanalOption[]
  submitLabel: string
  inicial?: SerieFormInicial
}

const ESTADO_INICIAL: AdminActionState = {}

// Mismo estilo que Input (no hay primitiva Select en el repo): select nativo.
const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30'

const textareaClass =
  'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30'

// Formulario de creación/edición de serie (ADM-05/ADM-06, "use client"
// justificado: filas dinámicas de canales/episodios + useActionState). Los
// campos básicos son no controlados (defaultValue): en fallo de la action el
// estado se preserva sin recarga (patrón login-form). Las filas de canales y
// episodios son estado cliente y se serializan como JSON en inputs ocultos;
// la validación real es server-side (schemaSerie de lib/admin.ts, ADM-08).
// En edición, los episodios existentes conservan su id para que editarSerie
// haga el sync correcto (bajas por id ausente, altas sin id).
export function SerieForm({ action, categorias, canales, submitLabel, inicial }: SerieFormProps) {
  const [state, formAction, pending] = useActionState(action, ESTADO_INICIAL)
  const [filasCanales, setFilasCanales] = useState<FilaCanal[]>(inicial?.canales ?? [])
  const [filasEpisodios, setFilasEpisodios] = useState<FilaEpisodio[]>(
    (inicial?.episodios ?? []).map((episodio) => ({
      ...(episodio.id ? { id: episodio.id } : {}),
      temporada: String(episodio.temporada),
      numero: String(episodio.numero),
      titulo: episodio.titulo,
      video_id: episodio.video_id
    }))
  )

  function actualizarCanal(indice: number, cambios: Partial<FilaCanal>) {
    setFilasCanales((filas) =>
      filas.map((fila, i) => (i === indice ? { ...fila, ...cambios } : fila))
    )
  }

  function actualizarEpisodio(indice: number, cambios: Partial<FilaEpisodio>) {
    setFilasEpisodios((filas) =>
      filas.map((fila, i) => (i === indice ? { ...fila, ...cambios } : fila))
    )
  }

  // JSON oculto: siempre sincronizado con el estado de las filas.
  const canalesJson = JSON.stringify(filasCanales)
  const episodiosJson = JSON.stringify(
    filasEpisodios.map((fila) => ({
      ...(fila.id ? { id: fila.id } : {}),
      temporada: Number(fila.temporada),
      numero: Number(fila.numero),
      titulo: fila.titulo,
      video_id: fila.video_id
    }))
  )

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="canales" value={canalesJson} />
      <input type="hidden" name="episodios" value={episodiosJson} />

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="serie-titulo">Título</Label>
          <Input
            id="serie-titulo"
            name="titulo"
            defaultValue={inicial?.titulo ?? ''}
            placeholder="Título de la serie"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="serie-categoria">Categoría</Label>
          <select
            id="serie-categoria"
            name="categoria"
            defaultValue={inicial?.categoria ?? ''}
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
          <Label htmlFor="serie-descripcion">Descripción</Label>
          <textarea
            id="serie-descripcion"
            name="descripcion"
            defaultValue={inicial?.descripcion ?? ''}
            rows={3}
            placeholder="De qué va la serie"
            className={textareaClass}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="serie-estado">Estado</Label>
          <select
            id="serie-estado"
            name="estado"
            defaultValue={inicial?.estado ?? 'activa'}
            className={selectClass}
          >
            <option value="activa">Activa</option>
            <option value="finalizada">Finalizada</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="serie-anio-inicio">Año de inicio</Label>
            <Input
              id="serie-anio-inicio"
              name="anio_inicio"
              type="number"
              min={1900}
              max={2100}
              defaultValue={inicial?.anio_inicio ?? ''}
              placeholder="2024"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="serie-anio-fin">Año de fin</Label>
            <Input
              id="serie-anio-fin"
              name="anio_fin"
              type="number"
              min={1900}
              max={2100}
              defaultValue={inicial?.anio_fin ?? ''}
              placeholder="2026"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="serie-playlist">URL de la playlist</Label>
          <Input
            id="serie-playlist"
            name="playlist_url"
            type="url"
            defaultValue={inicial?.playlist_url ?? ''}
            placeholder="https://www.youtube.com/playlist?list=…"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="serie-portada">URL de la portada</Label>
          <Input
            id="serie-portada"
            name="portada_url"
            type="url"
            defaultValue={inicial?.portada_url ?? ''}
            placeholder="https://…"
          />
        </div>
      </section>

      <section aria-label="Canales" className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold tracking-tight">Canales</h3>
        {filasCanales.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin canales. Añade al menos el canal principal.
          </p>
        ) : null}
        {filasCanales.map((fila, indice) => (
          <div key={`${fila.canal_id}-${indice}`} className="flex items-center gap-2">
            <select
              aria-label={`Canal ${indice + 1}`}
              value={fila.canal_id}
              onChange={(evento) => actualizarCanal(indice, { canal_id: evento.target.value })}
              required
              className={selectClass}
            >
              <option value="" disabled>
                Selecciona canal
              </option>
              {canales.map((canal) => (
                <option key={canal.id} value={canal.id}>
                  {canal.nombre} ({canal.handle})
                </option>
              ))}
            </select>
            <select
              aria-label={`Rol del canal ${indice + 1}`}
              value={fila.rol}
              onChange={(evento) =>
                actualizarCanal(indice, { rol: evento.target.value as RolCanal })
              }
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
              onClick={() => setFilasCanales((filas) => filas.filter((_, i) => i !== indice))}
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
            onClick={() => setFilasCanales((filas) => [...filas, { canal_id: '', rol: 'principal' }])}
          >
            <Plus />
            Añadir canal
          </Button>
        </div>
      </section>

      <section aria-label="Episodios" className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold tracking-tight">Episodios</h3>
        {filasEpisodios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin episodios todavía.</p>
        ) : null}
        {filasEpisodios.map((fila, indice) => (
          <div key={`${fila.id ?? 'nuevo'}-${indice}`} className="flex items-center gap-2">
            <Input
              aria-label={`Temporada del episodio ${indice + 1}`}
              type="number"
              min={1}
              value={fila.temporada}
              onChange={(evento) => actualizarEpisodio(indice, { temporada: evento.target.value })}
              required
              className="w-20 shrink-0"
              placeholder="T"
            />
            <Input
              aria-label={`Número del episodio ${indice + 1}`}
              type="number"
              min={1}
              value={fila.numero}
              onChange={(evento) => actualizarEpisodio(indice, { numero: evento.target.value })}
              required
              className="w-20 shrink-0"
              placeholder="N"
            />
            <Input
              aria-label={`Título del episodio ${indice + 1}`}
              value={fila.titulo}
              onChange={(evento) => actualizarEpisodio(indice, { titulo: evento.target.value })}
              required
              placeholder="Título del episodio"
            />
            <Input
              aria-label={`Video ID del episodio ${indice + 1}`}
              value={fila.video_id}
              onChange={(evento) => actualizarEpisodio(indice, { video_id: evento.target.value })}
              required
              className="w-36 shrink-0"
              placeholder="video_id"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Eliminar episodio ${indice + 1}`}
              onClick={() => setFilasEpisodios((filas) => filas.filter((_, i) => i !== indice))}
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
            onClick={() =>
              setFilasEpisodios((filas) => [
                ...filas,
                { temporada: '1', numero: String(filas.length + 1), titulo: '', video_id: '' }
              ])
            }
          >
            <Plus />
            Añadir episodio
          </Button>
        </div>
      </section>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
