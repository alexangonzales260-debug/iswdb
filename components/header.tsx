import Link from 'next/link'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { getUser } from '@/lib/auth'
import { accionLogout } from '@/lib/auth-actions'

// Estado de sesión en el header global (AUTH-09): RSC async que espera a
// getUser() (deduplicado por request con cache(); las páginas que leen
// sesión ya son dinámicas por cookies()).
export async function Header() {
  const user = await getUser()

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
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
