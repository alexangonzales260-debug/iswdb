import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { requireMod } from '@/lib/admin'
import { createAuthClient, getUser } from '@/lib/auth'

// El guard vive en el layout (decisión 2 del plan): cubre /admin y todas sus
// subrutas con una sola llamada. requireMod lanza notFound() para user/anon
// (ADM-04): 404 en vez de redirect a /login, no se revela el panel. Las
// Server Actions repiten el guard (defensa en profundidad).
export const dynamic = 'force-dynamic'

// noindex: el panel no debe aparecer en buscadores (solo existe para
// mod/admin; el resto ve 404 igualmente).
export const metadata: Metadata = {
  title: 'Panel de moderación',
  description: 'Moderación y gestión del catálogo de iswdb.',
  robots: { index: false }
}

interface AdminLayoutProps {
  children: ReactNode
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const client = await createAuthClient()
  const user = await getUser()
  await requireMod(client, user)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Panel de moderación</h1>
        <nav
          aria-label="Administración"
          className="flex items-center gap-4 text-sm font-medium"
        >
          <Link
            href="/admin"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/series/nueva"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Nueva serie
          </Link>
        </nav>
      </div>
      <div className="mt-8">{children}</div>
    </div>
  )
}
