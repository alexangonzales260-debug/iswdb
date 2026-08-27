import Image from 'next/image'
import Link from 'next/link'
import { User } from 'lucide-react'

import { etiquetaRol } from '@/lib/format'
import type { CanalFicha } from '@/lib/series'

// Reparto (FIC-05): cada canal enlaza al filtro de catálogo de F003.
export function CastList({ canales }: { canales: CanalFicha[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {canales.map((canal) => (
        <li key={canal.handle}>
          <Link
            href={`/series?canal=${canal.handle}`}
            className="group flex h-full flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:bg-accent/60"
          >
            <div className="relative size-16 overflow-hidden rounded-full bg-muted">
              {canal.avatar_url ? (
                <Image
                  src={canal.avatar_url}
                  alt={`Avatar de ${canal.nombre}`}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center" aria-hidden="true">
                  <User className="size-7 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{canal.nombre}</p>
              <p className="text-xs text-muted-foreground">{etiquetaRol(canal.rol)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
