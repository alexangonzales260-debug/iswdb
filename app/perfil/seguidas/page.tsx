import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { createAuthClient, requireUser } from "@/lib/auth";
import { listMisSeguidas } from "@/lib/follows";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Series seguidas · ISWDB",
};

export default async function SeguidasPage() {
  const user = await requireUser({ next: "/perfil/seguidas" });
  const client = await createAuthClient();
  const seguidas = await listMisSeguidas(client, user.id);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Series seguidas</h1>

      {seguidas.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Heart}
            title="Aún no sigues ninguna serie"
            description="Cuando sigas una serie, aparecerá aquí."
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {seguidas.map(({ serie }) => (
            <li key={serie.slug}>
              <Link
                href={`/series/${serie.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-brand"
              >
                <div className="relative aspect-[16/9] w-full bg-muted">
                  {serie.portada_url ? (
                    <Image
                      src={serie.portada_url}
                      alt={`Portada de ${serie.titulo}`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center" aria-hidden="true">
                      <Heart className="size-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <p className="px-4 py-3 font-medium group-hover:underline">
                  {serie.titulo}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
