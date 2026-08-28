import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Search, SearchX, User } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SerieCard } from "@/components/serie-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buscarCanales, buscarSeries, type CanalBusqueda } from "@/lib/busqueda";
import { handleParaUrl } from "@/lib/canales";

// Los resultados dependen de datos de BD que cambian sin rebuild (seed,
// moderación); mismo criterio que la home y /series.
export const dynamic = "force-dynamic";

// Tope defensivo del término: evita patrones ILIKE desmesurados.
const MAX_TERMINO = 100;

interface BuscarPageProps {
  searchParams: Promise<{ q?: string }>;
}

async function parseSearchParams(searchParams: BuscarPageProps["searchParams"]) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, MAX_TERMINO) || undefined;
  return { q };
}

// BUS-08: title "Búsqueda: <q> · ISWDB" (el template del layout añade el
// sufijo); sin q → "Buscar · ISWDB".
export async function generateMetadata({
  searchParams,
}: BuscarPageProps): Promise<Metadata> {
  const { q } = await parseSearchParams(searchParams);

  const titulo = q ? `Búsqueda: ${q}` : "Buscar";
  const descripcion = q
    ? `Resultados de búsqueda de «${q}» en ISWDB: series por título y canales por nombre o handle.`
    : "Busca en el catálogo de ISWDB por título de serie o nombre de canal.";
  const url = q ? `/buscar?q=${encodeURIComponent(q)}` : "/buscar";

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: url },
    openGraph: { title: titulo, description: descripcion, url },
  };
}

// BUS-04: sin query → hint + formulario visible en la propia página (el del
// header también sigue disponible).
function SinQuery() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Buscar</h1>
      <EmptyState
        icon={Search}
        title="Busca por título de serie o nombre de canal"
        description="Escribe un término y pulsa Intro para ver las series y canales del catálogo."
      />
      <form action="/buscar" role="search" className="mx-auto flex max-w-md gap-2">
        <label htmlFor="busqueda-pagina" className="sr-only">
          Buscar en el catálogo
        </label>
        <Input
          id="busqueda-pagina"
          type="search"
          name="q"
          placeholder="Buscar series o canales"
          className="h-10 flex-1"
        />
        <Button type="submit" className="h-10">
          Buscar
        </Button>
      </form>
    </div>
  );
}

// BUS-02: avatar + nombre + handle (visible con '@'); el enlace usa la URL
// sin '@' (D15, handleParaUrl).
function ListaCanales({ canales }: { canales: CanalBusqueda[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {canales.map((canal) => (
        <li key={canal.id}>
          <Link
            href={`/canales/${handleParaUrl(canal.handle)}`}
            className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/60"
          >
            <span className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
              {canal.avatar_url ? (
                <Image
                  src={canal.avatar_url}
                  alt={`Avatar de ${canal.nombre}`}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full items-center justify-center" aria-hidden="true">
                  <User className="size-5 text-muted-foreground" />
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{canal.nombre}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {canal.handle}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function BuscarPage({ searchParams }: BuscarPageProps) {
  const { q } = await parseSearchParams(searchParams);
  if (!q) return <SinQuery />;

  const [series, canales] = await Promise.all([buscarSeries(q), buscarCanales(q)]);
  const sinResultados = series.length === 0 && canales.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Búsqueda: {q}</h1>
        {!sinResultados && (
          <p className="text-muted-foreground">
            {series.length} {series.length === 1 ? "serie" : "series"} y{" "}
            {canales.length} {canales.length === 1 ? "canal" : "canales"} encontrados.
          </p>
        )}
      </div>

      {sinResultados ? (
        // BUS-05: empty state global con link al catálogo. Solo se renderizan
        // secciones con resultados (decisión 3 del plan).
        <div className="space-y-4">
          <EmptyState
            icon={SearchX}
            title={`Sin resultados para '${q}'`}
            description="Prueba con otro título u otro nombre de canal."
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
        <>
          {series.length > 0 && (
            <section className="space-y-4" aria-labelledby="series-heading">
              <h2 id="series-heading" className="text-xl font-semibold tracking-tight">
                Series
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {series.map((serie) => (
                  <SerieCard key={serie.id} serie={serie} />
                ))}
              </div>
            </section>
          )}
          {canales.length > 0 && (
            <section className="space-y-4" aria-labelledby="canales-heading">
              <h2 id="canales-heading" className="text-xl font-semibold tracking-tight">
                Canales
              </h2>
              <ListaCanales canales={canales} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
