import type { Metadata } from 'next'

import Link from 'next/link'
import { ArrowLeft, Send } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Propuesta enviada · ISWDB',
  description: 'Tu propuesta de serie ha sido enviada correctamente.'
}

export default function PropuestaEnviadaPage() {
  return (
    <section aria-labelledby="propuesta-enviada" className="flex flex-col items-center justify-center gap-8 min-h-[60vh] px-4 text-center">
      <header>
        <Send className="mx-auto size-12 text-brand" aria-hidden="true" />
        <h1 id="propuesta-enviada" className="mt-4 text-2xl font-semibold tracking-tight">
          Propuesta enviada
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">
          Gracias. Tu propuesta será revisada por el equipo. No recibirás notificación de la
          decisión por ahora.
        </p>
      </header>

      <nav className="flex gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al inicio
        </Link>
        <Link
          href="/proponer-serie"
          className="inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          Proponer otra serie
        </Link>
      </nav>
    </section>
  )
}