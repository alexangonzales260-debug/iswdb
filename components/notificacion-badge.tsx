import Link from 'next/link'
import { getUser, createAuthClient } from '@/lib/auth'
import { contarNoLeidas } from '@/lib/notificaciones'

export async function NotificacionBadge() {
  const user = await getUser()
  if (!user) return null

  const client = await createAuthClient()
  const count = await contarNoLeidas(client, user.id)

  if (count === 0) return null

  return (
    <Link
      href="/perfil/notificaciones"
      className="relative flex size-6 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white"
      aria-label={`${count} notificaciones sin leer`}
    >
      {count > 99 ? '99+' : count}
    </Link>
  )
}
