import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { User } from "lucide-react";

import { SerieCard } from "@/components/serie-card";
import { Badge } from "@/components/ui/badge";
import {
  getCanalByHandle,
  handleDesdeUrl,
  handleParaUrl,
  rolDestacado,
  type CanalFichaData,
} from "@/lib/canales";
import { etiquetaRol } from "@/lib/format";

// La ficha depende de datos de BD que cambian sin rebuild (seed, moderación);
// mismo criterio que la home y la ficha de serie.
export const dynamic = "force-dynamic";

interface CanalPageProps {
  params: Promise<{ handle: string }>;
}

// CAN-05: "<nombre> en ISWDB: X series como <rol-principal>." con el rol de
// mayor jerarquía presente en la filmografía y singularización.
function descripcionMetadata(canal: CanalFichaData): string {
  const n = canal.series.length;
  const seriesTexto = `${n} ${n === 1 ? "serie" : "series"}`;
  const rol = rolDestacado(canal.series);
  return rol
    ? `${canal.nombre} en ISWDB: ${seriesTexto} como ${etiquetaRol(rol)}.`
    : `${canal.nombre} en ISWDB: ${seriesTexto}.`;
}

export async function generateMetadata({
  params,
}: CanalPageProps): Promise<Metadata> {
  const { handle } = await params;
  const canal = await getCanalByHandle(handleDesdeUrl(handle));
  // CAN-03: handle inexistente o sin series aprobadas → 404 también en
  // metadata. El 404 efectivo lo lanza la página: algunos runtimes ignoran
  // notFound() en generateMetadata.
  if (!canal) notFound();

  const title = canal.nombre;
  const description = descripcionMetadata(canal);
  // URL pública sin '@' (ver handleDesdeUrl en lib/canales.ts).
  const url = `/canales/${handleParaUrl(canal.handle)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      ...(canal.avatar_url ? { images: [canal.avatar_url] } : {}),
    },
  };
}

function Cabecera({ canal }: { canal: CanalFichaData }) {
  const n = canal.series.length;

  return (
    <section className="flex items-center gap-6">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-full bg-muted sm:size-32">
        {canal.avatar_url ? (
          <Image
            src={canal.avatar_url}
            alt={`Avatar de ${canal.nombre}`}
            fill
            // LCP de la ficha: imagen above-the-fold; sin priority se cargaría
            // con loading="lazy" y Lighthouse mide LCP > 2.5s (patrón F004).
            priority
            sizes="(max-width: 640px) 96px, 128px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center" aria-hidden="true">
            <User className="size-10 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{canal.nombre}</h1>
        <p className="text-muted-foreground">{canal.handle}</p>
        <p className="text-sm text-muted-foreground">
          {n} {n === 1 ? "serie aprobada" : "series aprobadas"}
        </p>
      </div>
    </section>
  );
}

// CAN-03: el 404 se decide ANTES de emitir el shell (patrón F004). Un
// notFound() lanzado dentro de Suspense con la respuesta ya en streaming
// devolvería HTTP 200 con la UI de not-found (el estado se emite con el
// shell); por eso la query va aquí y no dentro de un boundary.
export default async function CanalPage({ params }: CanalPageProps) {
  const { handle } = await params;
  const canal = await getCanalByHandle(handleDesdeUrl(handle));
  if (!canal) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8">
      <Cabecera canal={canal} />

      <section className="space-y-4" aria-labelledby="filmografia-heading">
        <h2 id="filmografia-heading" className="text-xl font-semibold tracking-tight">
          Filmografía
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {canal.series.map((item) => (
            <div key={item.serie.id} className="relative">
              <Badge className="pointer-events-none absolute left-2 top-2 z-10">
                {etiquetaRol(item.rol)}
              </Badge>
              <SerieCard serie={item.serie} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
