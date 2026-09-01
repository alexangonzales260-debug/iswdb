import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { esRutaLocal, getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Inicia sesión en iswdb para valorar series y ver tu perfil.",
};

interface LoginPageProps {
  searchParams: Promise<{ msg?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // AUTH-05: con sesión activa no tiene sentido ver el formulario de login.
  const user = await getUser();
  if (user) redirect("/perfil");

  const params = await searchParams;
  // AUTH-06: mensaje de la acción protegida y ruta local de vuelta.
  const mensaje = params.msg;
  const next = params.next && esRutaLocal(params.next) ? params.next : undefined;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-muted-foreground">Accede a tu cuenta de iswdb.</p>
      {mensaje ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm"
        >
          {mensaje}
        </p>
      ) : null}
      <div className="mt-6 rounded-xl border bg-card p-6">
        <LoginForm next={next} />
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{" "}
        <Link
          href="/registro"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Regístrate
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        <Link
          href="/recuperar"
          className="font-medium text-foreground underline underline-offset-4"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </div>
  );
}
