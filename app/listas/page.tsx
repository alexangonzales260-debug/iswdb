import type { Metadata } from "next";
import Link from "next/link";
import { ListVideo } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ListaForm } from "@/components/lista-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createAuthClient, requireUser } from "@/lib/auth";
import { listMisListas } from "@/lib/listas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis listas",
  description: "Tus listas de series en iswdb.",
};

// LIS-09: grid de mis listas (RSC protegido, AUTH-06: sin sesión → /login).
// requireUser devuelve el usuario de sesión; se usa su id para listMisListas
// con el cliente de sesión (para que el RLS deje ver también las propias
// privadas). Cada tarjeta enlaza a su detalle.
export default async function ListasPage() {
  const user = await requireUser({ next: "/listas" });

  const client = await createAuthClient();
  const listas = await listMisListas(client, user.id);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Mis listas</h1>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="text-sm font-medium text-muted-foreground">
          Nueva lista
        </h2>
        <div className="mt-4">
          <ListaForm />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Tus listas</h2>
        {listas.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={ListVideo}
              title="Aún no tienes listas"
              description="Crea tu primera lista para agrupar tus series favoritas."
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {listas.map((lista) => (
              <li key={lista.id}>
                <Link href={`/listas/${lista.id}`} className="block h-full">
                  <Card className="h-full transition-colors hover:border-brand/40">
                    <CardHeader>
                      <CardTitle>{lista.nombre}</CardTitle>
                      {lista.descripcion ? (
                        <CardDescription>{lista.descripcion}</CardDescription>
                      ) : null}
                    </CardHeader>
                    <CardContent className="flex items-center gap-2">
                      <Badge variant={lista.es_publica ? "secondary" : "outline"}>
                        {lista.es_publica ? "Pública" : "Privada"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {lista.numSeries}{" "}
                        {lista.numSeries === 1 ? "serie" : "series"}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
