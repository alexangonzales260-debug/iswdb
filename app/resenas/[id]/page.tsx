import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquareText } from "lucide-react";

import { ComentarioForm } from "@/components/comentario-form";
import { ListaComentarios } from "@/components/lista-comentarios";
import { getUser } from "@/lib/auth";
import { listComentariosPorReseña } from "@/lib/comentarios";
import { getReseña, type ReseñaDetalle } from "@/lib/reseñas";
import { createServiceRoleClient } from "@/lib/supabase";

// La página depende de datos de BD que cambian sin rebuild (comentarios,
// ediciones). force-dynamic además decide el 404 antes de emitir el shell
// (patrón F004): getReseña nula → notFound() en metadata y en la página.
export const dynamic = "force-dynamic";

interface ReseñaPageProps {
  params: Promise<{ id: string }>;
}

// COM-04: reseña inexistente o de serie no aprobada → 404 también en metadata.
// El 404 efectivo lo lanza la página: algunos runtimes ignoran notFound() en
// generateMetadata.
export async function generateMetadata({ params }: ReseñaPageProps): Promise<Metadata> {
  const { id } = await params;
  const reseña = await getReseña(createServiceRoleClient(), id);
  if (!reseña) notFound();

  const autor = reseña.autor.username ?? "Usuario";
  const title = `Reseña de ${autor} sobre ${reseña.serie.titulo} · ISWDB`;
  const description = `Reseña de ${autor} sobre ${reseña.serie.titulo} en ISWDB, con comentarios de la comunidad.`;
  const url = `/resenas/${reseña.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
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

function AutorConLink({ autor }: { autor: ReseñaDetalle["autor"] }) {
  return autor.username ? (
    <Link
      href={`/usuarios/${autor.username}`}
      className="font-medium transition-colors hover:text-brand-accessible dark:hover:text-brand"
    >
      {autor.username}
    </Link>
  ) : (
    <span className="font-medium text-muted-foreground">Usuario anónimo</span>
  );
}

export default async function ReseñaPage({ params }: ReseñaPageProps) {
  const { id } = await params;
  const reseña = await getReseña(createServiceRoleClient(), id);
  if (!reseña) notFound();

  const [user, comentarios] = await Promise.all([
    getUser(),
    listComentariosPorReseña(createServiceRoleClient(), id, 50),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <p>
        <Link
          href={`/series/${reseña.serie.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-accessible underline-offset-4 hover:underline dark:text-brand"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {reseña.serie.titulo}
        </Link>
      </p>

      <article className="space-y-3 rounded-xl border bg-card p-5">
        <header>
          <p className="text-sm">
            <AutorConLink autor={reseña.autor} />
            <span className="text-muted-foreground">
              {" · "}
              <time dateTime={reseña.created_at}>{fechaLarga(reseña.created_at)}</time>
            </span>
          </p>
        </header>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{reseña.contenido}</p>
      </article>

      <section className="space-y-4" aria-labelledby="comentarios-heading">
        <h2
          id="comentarios-heading"
          className="flex items-center gap-2 text-xl font-semibold tracking-tight"
        >
          <MessageSquareText className="size-5" aria-hidden="true" />
          Comentarios
        </h2>

        {user ? (
          <ComentarioForm reseñaId={id} modo="crear" />
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/login?${new URLSearchParams({ next: `/resenas/${id}` }).toString()}`}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Inicia sesión para comentar
            </Link>{" "}
            — los comentarios son de solo lectura sin sesión (COM-04).
          </p>
        )}

        <ListaComentarios
          reseñaId={id}
          comentarios={comentarios}
          userId={user !== null ? user.id : null}
        />
      </section>
    </div>
  );
}