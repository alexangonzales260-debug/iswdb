import type { Metadata } from "next";

import { RecuperarForm } from "@/components/recuperar-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  description: "Pide un link para recuperar tu contraseña en iswdb.",
};

// REC-01: el aviso general no revela si la cuenta existe. No se usa
// requireUser: una sesión activa no impide pedir un reset (GoTrue igualmente
// solo lo envía por email al dueño).
export default function RecuperarPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Recuperar contraseña</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Introduce tu email y te enviaremos un link.
      </p>
      <div className="mt-6 rounded-xl border bg-card p-6">
        <RecuperarForm />
      </div>
    </div>
  );
}
