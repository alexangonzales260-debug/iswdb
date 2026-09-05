import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Heart, List, MessageSquareText, Star } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SeguirUsuarioButton } from "@/components/seguir-usuario-button";
import { createAuthClient, getUser } from "@/lib/auth";
import {
  getPerfilPublico,
  type ListaPublica,
  type ReseñaPublica,
  type SerieSeguidaPublica,
  type ValoracionPublica,
} from "@/lib/perfil-publico";
import {
  contadoresUsuario,
  estaSiguiendoUsuario,
  getUsuarioIdPorUsername,
  type ContadoresUsuario,
} from "@/lib/sigue-usuarios";
import { createServiceRoleClient } from "@/lib/supabase";

// El perfil público depende de datos de BD que cambian sin rebuild (username,
// actividad, moderación) y no necesita sesión (USR-03). force-dynamic además
// decide el 404 antes de emitir el shell (patrón F004).
export const dynamic = "force-dynamic";

interface PerfilPublicoPageProps {
  params: Promise<{ username: string }>;
}

// USR-04: username inexistente → 404 también en metadata. El 404 efectivo lo
// lanza la página: algunos runtimes ignoran notFound() en generateMetadata.
export async function generateMetadata({
  params,
}: PerfilPublicoPageProps): Promise<Metadata> {
  const { username } = await params;
  const perfil = await getPerfilPublico(username);
  if (!perfil) notFound();

  return {
    title: `${perfil.usuario.username} · ISWDB`,
    description: `Perfil público de ${perfil.usuario.username} en iswdb: series seguidas, valoraciones, reseñas y listas.`,
  };
}

const formatoFecha = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function fechaLarga(fecha: string): string {
  return formatoFecha.format(new Date(fecha));
}

function Cabecera({
  username,
  displayName,
  creadoEn,
  contadores,
  mostrarBoton,
  seguidoId,
  siguiendo,
}: {
  username: string;
  displayName: string | null;
  creadoEn: string;
  contadores: ContadoresUsuario;
  mostrarBoton: boolean;
  seguidoId: string;
  siguiendo: boolean;
}) {
  return (
    <header className="space-y-1">
      <h1 className="text-3xl font-bold tracking-tight">{username}</h1>
      {displayName ? <p className="text-muted-foreground">{displayName}</p> : null}
      <p className="text-sm text-muted-foreground">Miembro desde {fechaLarga(creadoEn)}</p>
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <p className="text-sm text-muted-foreground">
          Seguidos {contadores.seguidos} · Seguidores {contadores.seguidores}
        </p>
        {mostrarBoton ? (
          <SeguirUsuarioButton
            seguidoId={seguidoId}
            seguidoUsername={username}
            siguiendoInicial={siguiendo}
          />
        ) : null}
      </div>
    </header>
  );
}

function SeccionSeguidas({ seguidas }: { seguidas: SerieSeguidaPublica[] }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">Series seguidas</h2>
      {seguidas.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={Heart} title="No sigue ninguna serie" />
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {seguidas.map((seguida) => (
            <li key={seguida.serie.slug}>
              <Link
                href={`/series/${seguida.serie.slug}`}
                className="block rounded-lg border bg-card px-4 py-3 font-medium transition-colors hover:border-brand"
              >
                {seguida.serie.titulo}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionValoraciones({ valoraciones }: { valoraciones: ValoracionPublica[] }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">Valoraciones</h2>
      {valoraciones.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={Star} title="No ha valorado ninguna serie" />
        </div>
      ) : (
        <ul className="mt-4 divide-y rounded-lg border bg-card">
          {valoraciones.map((valoracion) => (
            <li key={valoracion.serie.slug} className="flex items-center justify-between gap-4 px-4 py-3">
              <Link
                href={`/series/${valoracion.serie.slug}`}
                className="font-medium transition-colors hover:text-brand"
              >
                {valoracion.serie.titulo}
              </Link>
              <span className="shrink-0 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{valoracion.nota}/10</span> ·{" "}
                {fechaLarga(valoracion.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionReseñas({ reseñas }: { reseñas: ReseñaPublica[] }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">Reseñas públicas</h2>
      {reseñas.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={MessageSquareText} title="No ha publicado reseñas" />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {reseñas.map((reseña) => (
            <li key={reseña.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-4">
                <Link
                  href={`/series/${reseña.serie.slug}`}
                  className="text-sm font-medium transition-colors hover:text-brand"
                >
                  {reseña.serie.titulo}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fechaLarga(reseña.created_at)}
                </span>
              </div>
              <p className="mt-2 text-sm">{reseña.contenido}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionListas({ listas }: { listas: ListaPublica[] }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">Listas públicas</h2>
      {listas.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={List} title="No tiene listas públicas" />
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {listas.map((lista) => (
            <li key={lista.id}>
              <Link
                href={`/listas/${lista.id}`}
                className="block rounded-lg border bg-card px-4 py-3 transition-colors hover:border-brand"
              >
                <span className="font-medium">{lista.nombre}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {lista.numSeries} {lista.numSeries === 1 ? "serie" : "series"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function PerfilPublicoPage({ params }: PerfilPublicoPageProps) {
  const { username } = await params;
  const perfil = await getPerfilPublico(username);
  if (!perfil) notFound();

  const serviceRole = createServiceRoleClient();
  const [user, targetId] = await Promise.all([
    getUser(),
    getUsuarioIdPorUsername(serviceRole, perfil.usuario.username),
  ]);
  const contadores = await contadoresUsuario(serviceRole, targetId ?? "");

  let siguiendo = false;
  if (user && targetId) {
    siguiendo = await estaSiguiendoUsuario(await createAuthClient(), user.id, targetId);
  }
  const esPropio = user !== null && user.id === targetId;
  const mostrarBoton = user !== null && !esPropio;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12">
      <Cabecera
        username={perfil.usuario.username}
        displayName={perfil.usuario.display_name}
        creadoEn={perfil.usuario.created_at}
        contadores={contadores}
        mostrarBoton={mostrarBoton}
        seguidoId={targetId ?? ""}
        siguiendo={siguiendo}
      />
      <SeccionSeguidas seguidas={perfil.seguidas} />
      <SeccionValoraciones valoraciones={perfil.valoraciones} />
      <SeccionReseñas reseñas={perfil.resenasPublicas} />
      <SeccionListas listas={perfil.listasPublicas} />
    </div>
  );
}