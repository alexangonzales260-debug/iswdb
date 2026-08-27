import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clapperboard, Clock, Sparkles, Star } from "lucide-react";

import { CategoryChips } from "@/components/category-chips";
import { EmptyState } from "@/components/empty-state";
import { SerieCard } from "@/components/serie-card";
import { Badge } from "@/components/ui/badge";
import { getCategorias, type CategoriaChip } from "@/lib/categorias";
import {
  getHeroSerie,
  getLatestSeries,
  getTopSeries,
  type SerieCard as SerieCardData,
} from "@/lib/series";

// La home depende de datos de BD que cambian sin rebuild (seed, moderación);
// sin esto Next la prerenderiza como estática en el build.
export const dynamic = "force-dynamic";

function SeccionDestacada({ hero }: { hero: SerieCardData | null }) {
  return (
    <section className="space-y-4" aria-labelledby="destacada-heading">
      <h2 id="destacada-heading" className="text-xl font-semibold tracking-tight">
        Serie destacada
      </h2>
      {hero ? (
        // TODO: quitar prefetch={false} cuando F004 cree /series/[slug]
        <Link
          href={`/series/${hero.slug}`}
          prefetch={false}
          className="group grid gap-6 rounded-2xl border bg-card p-6 transition-colors hover:bg-accent/40 sm:grid-cols-[180px_1fr]"
        >
          <div className="relative mx-auto aspect-[2/3] w-40 overflow-hidden rounded-xl bg-muted sm:w-full">
            {hero.portada_url ? (
              <Image
                src={hero.portada_url}
                alt={`Portada de ${hero.titulo}`}
                fill
                sizes="180px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center" aria-hidden="true">
                <Clapperboard className="size-10 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {hero.categoria && (
              <Badge variant="secondary" className="w-fit">
                {hero.categoria.nombre}
              </Badge>
            )}
            <h3 className="text-2xl font-bold tracking-tight">{hero.titulo}</h3>
            {hero.rating && (
              <p className="flex items-center gap-1.5 text-lg">
                <Star className="size-5 text-brand" aria-hidden="true" />
                <span className="font-semibold">{hero.rating.average.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">
                  · {hero.rating.count}{" "}
                  {hero.rating.count === 1 ? "valoración" : "valoraciones"}
                </span>
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {hero.canales.map((canal) => canal.nombre).join(", ")}
              {hero.anio_inicio !== null && ` · ${hero.anio_inicio}`}
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-brand-accessible dark:text-brand">
              Ver ficha
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </div>
        </Link>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="No hay series destacadas todavía"
          description="Cuando haya series con valoraciones, la mejor aparecerá aquí."
        />
      )}
    </section>
  );
}

function SeccionTop({ top }: { top: SerieCardData[] }) {
  return (
    <section className="space-y-4" aria-labelledby="top-heading">
      <h2 id="top-heading" className="text-xl font-semibold tracking-tight">
        Las mejor valoradas
      </h2>
      {top.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {top.map((serie) => (
            <SerieCard key={serie.id} serie={serie} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Star}
          title="Todavía no hay series valoradas"
          description="Las series con al menos una valoración aparecerán aquí."
        />
      )}
    </section>
  );
}

function SeccionUltimas({ latest }: { latest: SerieCardData[] }) {
  return (
    <section className="space-y-4" aria-labelledby="ultimas-heading">
      <h2 id="ultimas-heading" className="text-xl font-semibold tracking-tight">
        Últimas añadidas
      </h2>
      {latest.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {latest.map((serie) => (
            <SerieCard key={serie.id} serie={serie} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Clock}
          title="El catálogo está vacío"
          description="Las series aparecerán aquí en cuanto se añadan."
        />
      )}
    </section>
  );
}

function SeccionCategorias({ categorias }: { categorias: CategoriaChip[] }) {
  if (categorias.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="categorias-heading">
      <h2 id="categorias-heading" className="text-xl font-semibold tracking-tight">
        Explora por categoría
      </h2>
      <CategoryChips categorias={categorias} />
    </section>
  );
}

// Un solo boundary: el shell (h1) se emite al instante y el contenido llega
// en un único commit de cliente, minimizando TBT sin sacrificar el LCP.
async function ContenidoHome() {
  const [hero, top, latest, categorias] = await Promise.all([
    getHeroSerie(),
    getTopSeries(5),
    getLatestSeries(10),
    getCategorias(),
  ]);

  return (
    <>
      <SeccionDestacada hero={hero} />
      <SeccionTop top={top} />
      <SeccionUltimas latest={latest} />
      <SeccionCategorias categorias={categorias} />
    </>
  );
}

function SkeletonTarjeta() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      <div className="aspect-[2/3] w-full rounded-lg bg-muted" />
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
    </div>
  );
}

function SkeletonSeccion({ cols }: { cols: string }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className={`grid grid-cols-2 gap-4 ${cols}`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonTarjeta key={i} />
        ))}
      </div>
    </div>
  );
}

function SkeletonHome() {
  return (
    <div className="space-y-10" aria-hidden="true">
      <div className="space-y-4">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-56 animate-pulse rounded-2xl bg-muted" />
      </div>
      <SkeletonSeccion cols="sm:grid-cols-3 md:grid-cols-5" />
      <SkeletonSeccion cols="sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" />
    </div>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Las series de YouTube, en un solo sitio
        </h1>
        <p className="text-muted-foreground">
          Descubre las mejor valoradas, explora por categoría y no pierdas de
          vista los últimos estrenos.
        </p>
      </section>

      <Suspense fallback={<SkeletonHome />}>
        <ContenidoHome />
      </Suspense>
    </div>
  );
}
