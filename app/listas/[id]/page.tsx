import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListaDetalle } from "@/components/lista-detalle";
import type { AuthClient } from "@/lib/auth";
import { createAuthClient, getUser } from "@/lib/auth";
import { getLista } from "@/lib/listas";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface ListaDetallePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ListaDetallePageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser();
  const client: AuthClient = user ? await createAuthClient() : supabaseServer;
  const detalle = await getLista(client, id, user?.id ?? null);
  if (!detalle) notFound();

  return {
    title: detalle.lista.nombre,
    description: detalle.lista.descripcion ?? `Lista de series en iswdb.`,
  };
}

// Detalle de una lista (LIS-07/LIS-08, RSC force-dynamic). getUser() cacheado
// con cache() de React (lo llama el header). getLista devuelve null si la
// lista no es accesible (privada ajena o inexistente) → notFound() (404).
// La página funciona sin sesión para listas públicas (solo lectura, sin
// botones): ListaDetalle recibe esOwner.
export default async function ListaDetallePage({
  params,
}: ListaDetallePageProps) {
  const { id } = await params;
  const user = await getUser();
  const client: AuthClient = user ? await createAuthClient() : supabaseServer;
  const detalle = await getLista(client, id, user?.id ?? null);

  // LIS-08: privada ajena o inexistente → 404. getLista solo devuelve la
  // lista si el cliente puede leerla (own_or_public por RLS).
  if (!detalle) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <ListaDetalle
        listaId={detalle.lista.id}
        nombre={detalle.lista.nombre}
        descripcion={detalle.lista.descripcion}
        esOwner={detalle.esOwner}
        series={detalle.lista.series}
      />
    </div>
  );
}
