import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RegistroForm } from "@/components/registro-form";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Registro",
  description: "Crea tu cuenta en iswdb para valorar series.",
};

export default async function RegistroPage() {
  // AUTH-05: con sesión activa no tiene sentido ver el formulario de registro.
  const user = await getUser();
  if (user) redirect("/perfil");

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Crear cuenta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Regístrate con tu email para valorar series.
      </p>
      <div className="mt-6 rounded-xl border bg-card p-6">
        <RegistroForm />
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
