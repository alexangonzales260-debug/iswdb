import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  description: "Elige una nueva contraseña para tu cuenta de iswdb.",
};

interface ConfirmarPageProps {
  searchParams: Promise<{ error?: string }>;
}

// REC-07: si el code del link era inválido/expirado, el callback redirige aquí
// con ?error=link-invalido y se muestra un banner con enlace a /recuperar para
// pedir uno nuevo. searchParams es una Promise en Next 16.
export default async function ConfirmarPage({ searchParams }: ConfirmarPageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Nueva contraseña</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Elige una nueva contraseña para tu cuenta.
      </p>
      {params.error ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
        >
          El enlace no es válido o ha caducado.{" "}
          <Link
            href="/recuperar"
            className="font-medium underline underline-offset-4"
          >
            Pide uno nuevo
          </Link>
        </p>
      ) : null}
      <div className="mt-6 rounded-xl border bg-card p-6">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
