import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Revisa tu email",
  description: "Revisa tu email para recuperar tu contraseña en iswdb.",
};

// Página estática tras pedir la recuperación (REC-01). El texto es SIEMPRE el
// genérico: no revela si existe una cuenta con ese email.
export default function EnviadoPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Revisa tu email</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Si existe una cuenta con ese email, te hemos enviado un link.
      </p>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Volver a Iniciar sesión
        </Link>
      </p>
    </div>
  );
}
