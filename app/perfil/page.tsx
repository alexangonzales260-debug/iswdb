import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";

import { CambiarDisplayNameForm } from "@/components/cambiar-displayname-form";
import { CambiarEmailForm } from "@/components/cambiar-email-form";
import { CambiarPasswordForm } from "@/components/cambiar-password-form";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { createAuthClient, getPerfilData, requireUser } from "@/lib/auth";
import { listMisValoraciones } from "@/lib/valoraciones";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi perfil",
  description: "Tu cuenta de iswdb: datos y valoraciones.",
};

interface PerfilPageProps {
  searchParams: Promise<{ bienvenida?: string }>;
}

const formatoFecha = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function PerfilPage({ searchParams }: PerfilPageProps) {
  // AUTH-03/AUTH-06: sin sesión, redirect a /login conservando la ruta de vuelta.
  const user = await requireUser({ next: "/perfil" });

  const client = await createAuthClient();
  const perfil = await getPerfilData(client, user.id, user.email ?? "");
  const valoraciones = await listMisValoraciones(user.id);

  const params = await searchParams;
  const bienvenida = params.bienvenida === "1";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      {bienvenida ? (
        <p
          role="status"
          className="mb-6 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm"
        >
          Cuenta creada correctamente. ¡Bienvenido/a a iswdb!
        </p>
      ) : null}
      <h1 className="text-2xl font-bold tracking-tight">Mi perfil</h1>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="text-sm font-medium text-muted-foreground">Datos de la cuenta</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Nombre de usuario</dt>
            <dd className="mt-1 font-medium break-all">
              {perfil.display_name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="mt-1 font-medium break-all">{perfil.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fecha de registro</dt>
            <dd className="mt-1 font-medium">
              {formatoFecha.format(new Date(perfil.created_at))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rol</dt>
            <dd className="mt-1">
              <Badge variant="secondary">
                {perfil.rol.charAt(0).toUpperCase() + perfil.rol.slice(1)}
              </Badge>
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <Link href="/perfil/actividad" className="text-brand underline-offset-2 hover:underline">
            Ver mi actividad
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground">Editar perfil</h2>
        <div className="mt-4 grid gap-6">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-base font-semibold">Cambiar password</h3>
            <div className="mt-4">
              <CambiarPasswordForm />
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-base font-semibold">Cambiar email</h3>
            <div className="mt-4">
              <CambiarEmailForm />
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-base font-semibold">Cambiar nombre de usuario</h3>
            <div className="mt-4">
              <CambiarDisplayNameForm />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Tus valoraciones</h2>
        {valoraciones.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Star}
              title="Aún no has valorado ninguna serie"
              description="Cuando valores una serie, aparecerá aquí."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y rounded-xl border">
            {valoraciones.map((valoracion) => (
              // UNIQUE(user_id, serie_id): el slug es único por usuario.
              <li
                key={valoracion.serie.slug}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <Link
                  href={`/series/${valoracion.serie.slug}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {valoracion.serie.titulo}
                </Link>
                <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {valoracion.nota}/10
                  </span>
                  <span>{formatoFecha.format(new Date(valoracion.created_at))}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
