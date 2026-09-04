import Link from 'next/link'
import { Search } from 'lucide-react'

import { NotificacionBadge } from '@/components/notificacion-badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getUser } from '@/lib/auth'
import { accionLogout } from '@/lib/auth-actions'

// Estado de sesión en el header global (AUTH-09): RSC async que espera a
// getUser() (deduplicado por request con cache(); las páginas que leen
// sesión ya son dinámicas por cookies()).
export async function Header() {
  const user = await getUser()

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            iswdb
            <span className="text-brand" aria-hidden="true">
              •
            </span>
          </Link>
          <nav
            aria-label="Principal"
            className="flex items-center gap-4 text-sm font-medium"
          >
            <Link
              href="/"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Inicio
            </Link>
            <Link
              href="/series"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Series
            </Link>
          </nav>
        </div>
        {/* BUS-06: búsqueda como formulario GET puro de servidor (cero JS
            cliente), sin prefill. En móvil baja a una segunda fila
            (order-last + w-full); desde sm queda entre el nav y la cuenta. */}
        <form
          action="/buscar"
          role="search"
          className="order-last w-full sm:order-none sm:w-44 md:w-56"
        >
          <label htmlFor="busqueda-header" className="sr-only">
            Buscar
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="busqueda-header"
              type="search"
              name="q"
              placeholder="Buscar series o canales"
              className="h-9 pl-8"
            />
          </div>
        </form>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/perfil"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {/* Avatar: inicial del email (sin Storage ni dependencias). */}
                <span
                  className="flex size-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
                  aria-hidden="true"
                >
                  {user.email?.charAt(0).toUpperCase() ?? '?'}
                </span>
                <span className="hidden max-w-48 truncate sm:inline">{user.email}</span>
              </Link>
              <NotificacionBadge />
              {/* AUTH-04: logout como form RSC puro (cero JS cliente). */}
              <form action={accionLogout}>
                <Button type="submit" variant="ghost" size="sm">
                  Salir
                </Button>
              </form>
            </>
          ) : (
            <nav
              aria-label="Cuenta"
              className="flex items-center gap-4 text-sm font-medium"
            >
              <Link
                href="/login"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/registro"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Registro
              </Link>
            </nav>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
