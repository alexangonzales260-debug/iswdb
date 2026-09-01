# F015 — Tareas (una sesión de Build por tarea)

## T1 — Migración M10 + config.toml
- [x] Crear `supabase/migrations/<ts>_add_usuario_display_name.sql`:
      `alter table public.usuario add column display_name text;` +
      CHECK `(display_name is null or char_length(display_name) between 3 and 50)`.
- [x] config.toml: `double_confirm_changes = false`.
- [x] Verificar que `usuario_update_own` (M3) permite update de display_name
      (sin cambio de RLS).
- [x] `supabase db reset` + `npm run gen:types`.
- [x] Confirmar `display_name: string | null` en types/database.ts.

## T2 — Servicios en lib/auth.ts
- [x] `cambiarPassword(client, passwordActual, passwordNueva)` con reauth
      (signInWithPassword) y updateUser({password}).
- [x] `cambiarEmail(client, nuevoEmail)` con updateUser({email}) + mensaje
      genérico.
- [x] `cambiarDisplayName(client, displayName)` con update usuario.display_name.
- [x] Esquemas Zod: cambiarPasswordSchema, cambiarEmailSchema,
      cambiarDisplayNameSchema.
- [x] ERRORES_AUTH: passwordActualIncorrecta, mensajeEmailCambioEnviado, etc.
- [x] Ampliar PerfilData con display_name.

## T3 — Server Actions en lib/auth-actions.ts
- [x] accionCambiarPassword (Zod + cliente + revalidatePath('/perfil')).
- [x] accionCambiarEmail (idem).
- [x] accionCambiarDisplayName (idem).

## T4 — Página /perfil
- [x] Mostrar display_name en "Datos de la cuenta".
- [x] Añadir sección "Editar perfil" con tres sub-secciones.

## T5 — Formularios cliente
- [x] components/cambiar-password-form.tsx ("use client", useActionState,
      pending, error role=alert).
- [x] components/cambiar-email-form.tsx.
- [x] components/cambiar-displayname-form.tsx.

## T6 — Tests de servidor
- [x] tests/db/perfil.test.ts: cambiarPassword (reauth + cambio + PER-02),
      cambiarEmail (Mailpit + confirmación + login nuevo), cambiarDisplayName,
      validaciones Zod.

## T7 — Test E2E
- [x] e2e/perfil.spec.ts: flujo completo (password → email vía Mailpit →
      display_name visible).

## T8 — Puerta
- [x] lint + typecheck + test + test:e2e en verde.
- [x] ./validate.sh en verde.
- [x] Actualizar DECISIONS.md / ROADMAP.md si procede.