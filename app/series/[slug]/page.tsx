import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ExternalLink, Film, ListMusic, Star } from "lucide-react";

import { AddToList } from "@/components/add-to-list";
import { CastList } from "@/components/cast-list";
import { EmptyState } from "@/components/empty-state";
import { FollowButton } from "@/components/follow-button";
import { RatingHistogram } from "@/components/rating-histogram";
import { RatingSelector } from "@/components/rating-selector";
import { RecomendacionCard } from "@/components/recomendacion-card";
import { ReseñasSection } from "@/components/reseñas-section";
import { SeasonList } from "@/components/season-list";
import { Badge } from "@/components/ui/badge";
import { createAuthClient, getUser } from "@/lib/auth";
import { estaSiguiendo } from "@/lib/follows";
import { ratingTexto, truncateDescripcion } from "@/lib/format";
import { listMisListas } from "@/lib/listas";
import { getSeriesSimilares } from "@/lib/recomendaciones";
import { getSerieBySlug, type SerieFicha } from "@/lib/series";
import { getValoracionUsuario } from "@/lib/valoraciones";

// La ficha depende de datos de BD que cambian sin rebuild (seed, moderación);
// mismo criterio que la home.
export const dynamic = "force-dynamic";

interface FichaPageProps {
  params: Promise<{ slug: string }>;
}

function descripcionMetadata(serie: SerieFicha): string {
  return (
    truncateDescripcion(serie.descripcion) ||
    `Ficha de ${serie.titulo} en ISWDB: episodios, canales y valoraciones.`
  );
}

export async function generateMetadata({
  params,
}: FichaPageProps): Promise<Metadata> {
  const { slug } = await params;
  const serie = await getSerieBySlug(slug);
  // FIC-04: slug inexistente o serie no aprobada → 404 también en metadata.
  // El 404 efectivo lo lanza la página: algunos runtimes ignoran notFound()
  // en generateMetadata.
  if (!serie) notFound();

  const title = serie.titulo;
  const description = descripcionMetadata(serie);
  const url = `/series/${serie.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      ...(serie.portada_url ? { images: [serie.portada_url] } : {}),
    },
  };
}

function aniosTexto(serie: SerieFicha): string | null {
  if (serie.anio_inicio === null) return null;
  if (serie.anio_fin !== null && serie.anio_fin !== serie.anio_inicio) {
    return `${serie.anio_inicio}–${serie.anio_fin}`;
  }
  return String(serie.anio_inicio);
}

function Cabecera({ serie }: { serie: SerieFicha }) {
  const anios = aniosTexto(serie);

  return (
    <section className="grid gap-6 sm:grid-cols-[220px_1fr]">
      <div className="relative mx-auto aspect-[2/3] w-48 overflow-hidden rounded-xl bg-muted sm:w-full">
        {serie.portada_url ? (
          <Image
            src={serie.portada_url}
            alt={`Portada de ${serie.titulo}`}
            fill
            // LCP de la ficha (FIC-09): imagen above-the-fold; sin priority se
            // cargaría con loading="lazy" y Lighthouse mide LCP > 2.5s.
            priority
            sizes="(max-width: 640px) 192px, 220px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center" aria-hidden="true">
            <Film className="size-12 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {serie.categoria && (
            <Badge variant="secondary">{serie.categoria.nombre}</Badge>
          )}
          <Badge variant="outline">
            {serie.estado === "finalizada" ? "Finalizada" : "Activa"}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{serie.titulo}</h1>
        {anios && <p className="text-sm text-muted-foreground">{anios}</p>}
        <p className="flex items-center gap-1.5 text-lg">
          <Star className="size-5 text-brand" aria-hidden="true" />
          <span>{ratingTexto(serie.rating)}</span>
        </p>
        {serie.descripcion && (
          <p className="text-muted-foreground">{serie.descripcion}</p>
        )}
        {serie.playlist_url && (
          <a
            href={serie.playlist_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-accessible underline-offset-4 hover:underline dark:text-brand"
          >
            <ListMusic className="size-4" aria-hidden="true" />
            Ver playlist en YouTube
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}

async function SeguirSerie({ serie }: { serie: SerieFicha }) {
  const user = await getUser();
  if (!user) return null;

  const client = await createAuthClient();
  const siguiendo = await estaSiguiendo(client, user.id, serie.id);

  return (
    <FollowButton serieId={serie.id} serieSlug={serie.slug} siguiendoInicial={siguiendo} />
  );
}

// Sección "Valoraciones" (F009, VAL-04): histograma + selector. El AVG y el
// conteo se conservan en la cabecera (VAL-06). getUser() está cacheado con
// cache() de React (el header del layout lo llama en el mismo request); la
// nota actual solo se consulta si hay sesión.
async function Valoraciones({ serie }: { serie: SerieFicha }) {
  const user = await getUser();
  const notaActual = user ? await getValoracionUsuario(serie.id, user.id) : null;

  return (
    <section className="space-y-4" aria-labelledby="valoraciones-heading">
      <h2 id="valoraciones-heading" className="text-xl font-semibold tracking-tight">
        Valoraciones
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        <RatingHistogram serieId={serie.id} />
        <RatingSelector serieSlug={serie.slug} notaActual={notaActual} conSesion={user !== null} />
      </div>
    </section>
  );
}

// Sección "Añadir a lista" (F013, LIS-10): dropdown con mis listas solo con
// sesión; las listas se pasan por prop (server-side, RSC) para que el
// componente cliente no haga fetch.
async function AñadirALista({ serie }: { serie: SerieFicha }) {
  const user = await getUser();
  let listas: Awaited<ReturnType<typeof listMisListas>> = [];
  if (user) {
    const client = await createAuthClient();
    listas = await listMisListas(client, user.id);
  }

  return (
    <AddToList
      serieId={serie.id}
      serieSlug={serie.slug}
      conSesion={user !== null}
      listas={listas}
    />
  );
}

async function SeriesSimilares({ serie }: { serie: SerieFicha }) {
  const client = await createAuthClient();
  const similares = await getSeriesSimilares(client, serie.id, 4);
  if (similares.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="similares-heading">
      <h2 id="similares-heading" className="text-xl font-semibold tracking-tight">
        Series similares
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {similares.map((similar) => (
          <RecomendacionCard key={similar.id} serie={similar} />
        ))}
      </div>
    </section>
  );
}

async function ContenidoFicha({ serie }: { serie: SerieFicha }) {
  return (
    <div className="space-y-10">
      <Cabecera serie={serie} />

      <SeguirSerie serie={serie} />

      <Valoraciones serie={serie} />

      <AñadirALista serie={serie} />

      <ReseñasSection serieId={serie.id} serieSlug={serie.slug} />

      {serie.canales.length > 0 && (
        <section className="space-y-4" aria-labelledby="reparto-heading">
          <h2 id="reparto-heading" className="text-xl font-semibold tracking-tight">
            Reparto
          </h2>
          <CastList canales={serie.canales} />
        </section>
      )}

      <section className="space-y-4" aria-labelledby="episodios-heading">
        <h2 id="episodios-heading" className="text-xl font-semibold tracking-tight">
          Episodios
        </h2>
        {serie.temporadas.length > 0 ? (
          <SeasonList temporadas={serie.temporadas} />
        ) : (
          <EmptyState
            icon={Film}
            title="Aún no hay episodios registrados"
            description="Los episodios aparecerán aquí en cuanto se añadan."
          />
        )}
      </section>

      <SeriesSimilares serie={serie} />
    </div>
  );
}

// FIC-04: el 404 se decide ANTES de emitir el shell. Un notFound() lanzado
// dentro de Suspense con la respuesta ya en streaming devolvería HTTP 200 con
// la UI de not-found (el código de estado se emite con el shell). Por eso la
// query va aquí y no dentro de un boundary; con una sola consulta indexada el
// streaming no aporta nada en esta ruta.
export default async function FichaPage({ params }: FichaPageProps) {
  const { slug } = await params;
  const serie = await getSerieBySlug(slug);
  if (!serie) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <ContenidoFicha serie={serie} />
    </div>
  );
}
