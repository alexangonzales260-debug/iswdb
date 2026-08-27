import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, Compass, SearchX, X } from "lucide-react";

import { CategoryChips } from "@/components/category-chips";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { SerieCard } from "@/components/serie-card";
import { getCategorias } from "@/lib/categorias";
import { listSeries } from "@/lib/series";

interface SeriesPageProps {
  searchParams: Promise<{ categoria?: string; canal?: string; page?: string }>;
}

function buildHref(opts: { categoria?: string; canal?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (opts.categoria) params.set("categoria", opts.categoria);
  if (opts.canal) params.set("canal", opts.canal);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const query = params.toString();
  return query ? `/series?${query}` : "/series";
}

async function parseSearchParams(searchParams: SeriesPageProps["searchParams"]) {
  const params = await searchParams;
  const categoria = params.categoria?.trim() || undefined;
  const canal = params.canal?.trim() || undefined;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  return { categoria, canal, page };
}

export async function generateMetadata({
  searchParams,
}: SeriesPageProps): Promise<Metadata> {
  const { categoria, canal, page } = await parseSearchParams(searchParams);

  let titulo = "Series";
  let descripcion =
    "Catálogo completo de series de YouTube en ISWDB: filtra por categoría o canal y descubre las últimas añadidas.";

  if (categoria) {
    const categorias = await getCategorias();
    const nombre = categorias.find((c) => c.slug === categoria)?.nombre ?? categoria;
    titulo = `Series de ${nombre}`;
    descripcion = `Todas las series de YouTube de la categoría ${nombre} en ISWDB.`;
  } else if (canal) {
    titulo = `Series de ${canal}`;
    descripcion = `Todas las series de YouTube en las que participa el canal ${canal} en ISWDB.`;
  }

  if (page > 1) {
    titulo += ` (página ${page})`;
    descripcion += ` Página ${page}.`;
  }

  const url = buildHref({ categoria, canal, page });

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: url },
    openGraph: { title: titulo, description: descripcion, url },
  };
}

export default async function SeriesPage({ searchParams }: SeriesPageProps) {
  const { categoria, canal, page } = await parseSearchParams(searchParams);

  const [resultado, categorias] = await Promise.all([
    listSeries({ categoria, canal, page }),
    getCategorias(),
  ]);

  const nombreCategoria = categoria
    ? categorias.find((c) => c.slug === categoria)?.nombre ?? categoria
    : undefined;
  const titulo = nombreCategoria
    ? `Series de ${nombreCategoria}`
    : canal
      ? `Series de ${canal}`
      : "Series";
  const hayFiltros = Boolean(categoria || canal);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{titulo}</h1>
        <p className="text-muted-foreground">
          {resultado.total === 0
            ? "Sin resultados por ahora."
            : `${resultado.total} ${resultado.total === 1 ? "serie" : "series"} en el catálogo.`}
        </p>
      </div>

      {categorias.length > 0 && (
        <CategoryChips categorias={categorias} activa={categoria} />
      )}

      {hayFiltros && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtros activos:</span>
          {categoria && (
            <Link
              href={buildHref({ canal, page: 1 })}
              className="inline-flex items-center gap-1 rounded-full border border-brand px-3 py-1 font-medium transition-colors hover:bg-accent"
            >
              Categoría: {nombreCategoria}
              <X className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(quitar filtro)</span>
            </Link>
          )}
          {canal && (
            <Link
              href={buildHref({ categoria, page: 1 })}
              className="inline-flex items-center gap-1 rounded-full border border-brand px-3 py-1 font-medium transition-colors hover:bg-accent"
            >
              Canal: {canal}
              <X className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(quitar filtro)</span>
            </Link>
          )}
        </div>
      )}

      {resultado.total === 0 ? (
        hayFiltros ? (
          <div className="space-y-4">
            <EmptyState
              icon={SearchX}
              title="No se encontraron series con estos filtros"
              description="Prueba con otra categoría u otro canal."
            />
            <div className="text-center">
              <Link
                href="/series"
                className="text-sm font-medium text-brand-accessible underline-offset-4 hover:underline dark:text-brand"
              >
                Ver todas las series
              </Link>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Clapperboard}
            title="El catálogo está vacío"
            description="Las series aparecerán aquí en cuanto se añadan."
          />
        )
      ) : page > resultado.totalPages ? (
        <div className="space-y-4">
          <EmptyState
            icon={Compass}
            title="Página no encontrada"
            description={`Solo hay ${resultado.totalPages} ${resultado.totalPages === 1 ? "página" : "páginas"} con estos filtros.`}
          />
          <div className="text-center">
            <Link
              href={buildHref({ categoria, canal, page: 1 })}
              className="text-sm font-medium text-brand-accessible underline-offset-4 hover:underline dark:text-brand"
            >
              Volver a la primera página
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {resultado.series.map((serie) => (
              <SerieCard key={serie.id} serie={serie} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={resultado.totalPages}
            hrefFor={(p) => buildHref({ categoria, canal, page: p })}
          />
        </>
      )}
    </div>
  );
}
