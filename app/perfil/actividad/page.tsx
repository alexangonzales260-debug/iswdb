import type { Metadata } from "next";
import { createAuthClient, requireUser } from "@/lib/auth";
import { listMisValoraciones, listMisReseñas, listMisPropuestas, calcularAgregados } from "@/lib/actividad";
import { listMisListas } from "@/lib/listas";
import { ActividadDashboard } from "@/components/actividad-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi actividad · ISWDB",
};

export default async function ActividadPage() {
  const user = await requireUser({ next: "/perfil/actividad" });
  const client = await createAuthClient();

  const [valoraciones, reseñas, listas, propuestas] = await Promise.all([
    listMisValoraciones(client, user.id),
    listMisReseñas(client, user.id),
    listMisListas(client, user.id),
    listMisPropuestas(client, user.id),
  ]);

  const agregados = calcularAgregados(valoraciones, reseñas, listas, propuestas);

  return (
    <ActividadDashboard
      agregados={agregados}
      valoraciones={valoraciones}
      reseñas={reseñas}
      listas={listas}
      propuestas={propuestas}
    />
  );
}