# F015 — Tareas (una sesión de Build por tarea)

## T1 — Migración M10 + config.toml
- [ ] Crear `supabase/migrations/<ts>_add_usuario_display_name.sql`:
      `alter table public.usuario add column display_name text;` +
      CHECK `(display_name is null or char_length(display_name) between 3 and 50)`.
- [ ] config.toml: `double_confirm_changes = false`.
- [ ] Verificar que `usuario_update_own` (M3) permite update de display_name
      (sin cambio de RLS).
- [ ] `supabase db reset` + `npm run gen:types`.
- [ ] Confirmar `display_name: string | null` en types/database.ts.

## T2 — Servicios en lib/auth.ts
- [ ] `cambiarPassword(client, passwordActual, passwordNueva)` con reauth
      (signInWithPassword) y updateUser({password}).
- [ ] `cambiarEmail(client, nuevoEmail)` con updateUser({email}) + mensaje
      genérico.
- [ ] `cambiarDisplayName(client, displayName)` con update usuario.display_name.
- [ ] Esquemas Zod: cambiarPasswordSchema, cambiarEmailSchema,
      cambiarDisplayNameSchema.
- [ ] ERRORES_AUTH: passwordActualIncorrecta, mensajeEmailCambioEnviado, etc.
- [ ] Ampliar PerfilData con display_name.

## T3 — Server Actions en lib/auth-actions.ts
- [ ] accionCambiarPassword (Zod + cliente + revalidatePath('/perfil')).
- [ ] accionCambiarEmail (idem).
- [ ] accionCambiarDisplayName (idem).

## T4 — Página /perfil
- [ ] Mostrar display_name en "Datos de la cuenta".
- [ ] Añadir sección "Editar perfil" con tres sub-secciones.

## T5 — Formularios cliente
- [ ] components/cambiar-password-form.tsx ("use client", useActionState,
      pending, error role=alert).
- [ ] components/cambiar-email-form.tsx.
- [ ] components/cambiar-displayname-form.tsx.

## T6 — Tests de servidor
- [ ] tests/db/perfil.test.ts: cambiarPassword (reauth + cambio + PER-02),
      cambiarEmail (Mailpit + confirmación + login nuevo), cambiarDisplayName,
      validaciones Zod.

## T7 — Test E2E
- [ ] e2e/perfil.spec.ts: flujo completo (password → email vía Mailpit →
      display_name visible).

## T8 — Puerta
- [ ] lint + typecheck + test + test:e2e en verde.
- [ ] ./validate.sh en verde.
- [ ] Actualizar DECISIONS.md / ROADMAP.md si procede.
