'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { TipoReporte } from '@/lib/reportes'
import { accionCrearReporte } from '@/lib/reportes-actions'

// Opciones de motivo para el selector (valores válidos según motivoReporteSchema)
const MOTIVOS_REPORTE = [
  { value: 'spam', label: 'Spam' },
  { value: 'ofensivo', label: 'Ofensivo' },
  { value: 'spoiler', label: 'Spoiler' },
  { value: 'otro', label: 'Otro' }
] as const

// F028 (REP-01): botón "Reportar" que abre un formulario inline para escribir
// el motivo (1-2000 chars) y enviarlo. Sin sesión, el botón queda deshabilitado.
// useActionState no se usa aquí porque el componente se monta en múltiples
// rutas con diferentes tipos/IDs; useTransition + estado local es más directo.
export function ReportarButton({
  tipo,
  idObjetivo,
  conSesion
}: {
  tipo: TipoReporte
  idObjetivo: string
  conSesion: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState<'spam' | 'ofensivo' | 'spoiler' | 'otro'>('otro')
  const [descripcion, setDescripcion] = useState('')
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<{ error?: string; success?: boolean } | null>(null)

  function enviar() {
    setResultado(null)
    const formData = new FormData()
    formData.set('motivo', motivo)
    if (descripcion.trim()) {
      formData.set('descripcion', descripcion.trim())
    }
    startTransition(async () => {
      const res = await accionCrearReporte(tipo, idObjetivo, {}, formData)
      setResultado(res)
      if (!res.error) {
        setAbierto(false)
        setMotivo('otro')
        setDescripcion('')
      }
    })
  }

  function cancelar() {
    setAbierto(false)
    setMotivo('otro')
    setDescripcion('')
    setResultado(null)
  }

  if (!conSesion) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        title="Inicia sesión para reportar"
        aria-label="Reportar contenido (requiere sesión)"
      >
        Reportar
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {!abierto ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAbierto(true)}
          aria-label="Reportar contenido"
        >
          Reportar
        </Button>
      ) : (
        <div className="flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="motivo-reporte" className="text-xs font-medium">
              Motivo
            </label>
            <select
              id="motivo-reporte"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as 'spam' | 'ofensivo' | 'spoiler' | 'otro')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isPending}
              aria-label="Seleccionar motivo del reporte"
            >
              {MOTIVOS_REPORTE.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <label htmlFor="descripcion-reporte" className="text-xs font-medium">
              Descripción (opcional, máx. 500 caracteres)
            </label>
            <Textarea
              id="descripcion-reporte"
              placeholder="Detalles adicionales sobre el reporte…"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={500}
              rows={3}
              aria-label="Descripción del reporte"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">{descripcion.length}/500</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelar} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={enviar} disabled={isPending}>
              Enviar
            </Button>
          </div>
          {resultado?.error ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {resultado.error}
            </p>
          ) : null}
          {resultado?.success ? (
            <p role="status" className="text-xs font-medium text-green-600 dark:text-green-400">
              Reporte enviado correctamente. Gracias por ayudar a mantener la comunidad segura.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
