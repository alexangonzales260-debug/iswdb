# F017 — Unificar frontend a http://localhost:3000

## Contexto

El flujo OAuth con Google falla con `PKCE code verifier not found in storage`. Root
cause: **falta de consistencia de host**. El dominio canónico del proyecto era
`127.0.0.1:3000` (D20, DECISIONS.md:62), pero si el browser navega por `localhost:3000`,
el browser client (`lib/supabase-browser.ts`, `createBrowserClient` de `@supabase/ssr`)
guarda el `code_verifier` en cookies de dominio `localhost`, mientras que el `redirectTo`
del botón usa `NEXT_PUBLIC_SITE_URL=127.0.0.1:3000`. La cookie no viaja al callback en
`127.0.0.1` → no se encuentra el verifier.

El endpoint `127.0.0.1:54321` (Supabase/GoTrue) NO interfiere: es el API server; el
`code_verifier` vive en cookies del browser, no en GoTrue.

## Decisión (aprobada por el usuario)

Estandarizar TODO el frontend en **`http://localhost:3000`** y dejar `127.0.0.1:54321`
solo para Supabase. Se actualiza la decisión D20. Los pasos manuales fuera del repo
(Google Cloud Console, supabase restart) los hace el usuario.

## Pasos manuales del usuario (NO son código)

1. Google Cloud Console → Authorized JavaScript origins:
   - `http://localhost:3000`
   - (opcional: añadir también `http://127.0.0.1:3000` si quiere ambos)
2. La **Authorized redirect URI NO cambia**: `http://127.0.0.1:54321/auth/v1/callback`
   (ese 127.0.0.1 es Supabase local, no la app).
3. `supabase stop && supabase start` (para que GoTrue tome el nuevo site_url).
4. Navegar SIEMPRE por `http://localhost:3000/...` (nunca 127.0.0.1).

## Cambios de código/config (a aplicar cuando se levante la restricción)

### 1. `.env.local`
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
Actualizar el comentario (site_url de config.toml pasa a localhost; el motivo: el
code_verifier del OAuth se guarda en cookies del browser en este mismo host).

### 2. `.env.example`
Igual que `.env.local` (comentario + valor).

### 3. `supabase/config.toml`
- Línea 159: `site_url = "http://localhost:3000"`
- `additional_redirect_urls` → solo localhost:
  ```toml
  additional_redirect_urls = [
    "http://localhost:3000",
    "http://localhost:3000/auth/callback",
    "http://localhost:3000/auth/reset"
  ]
  ```
  Actualizar comentarios F014/F014-fix (localhost canónico; GoTrue exige path completo).

### 4. `lib/auth.ts` (función `origin()`, línea 163)
```ts
export function origin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}
```
Actualizar el comentario de la línea 160.

### 5. `next.config.ts`
```ts
allowedDevOrigins: ["http://localhost:3000"]
```
(quitar 127.0.0.1). Actualizar comentario F017.

### 6. `playwright.config.ts`
- `baseURL: 'http://localhost:3000'`
- Actualizar comentario de las líneas 9-13: el dominio canónico es localhost; al
  unificar browser + redirectTo + site_url, las cookies de sesión/code_verifier
  quedan en localhost y el callback las recibe.

### 7. `e2e/perfil.spec.ts` (línea 91)
`url.origin === 'http://localhost:3000'`

### 8. `app/auth/reset/route.ts`
Solo comentario (líneas 20-24): ya usa `origin()`, solo cambia la variable doc
("localhost" en lugar de "127.0.0.1").

### 9. `docs/oauth-google.md`
- Authorized JavaScript origins: `http://localhost:3000`
- Nota de que la redirect URI sigue siendo `http://127.0.0.1:54321/auth/v1/callback`.

### 10. `DECISIONS.md` (D20)
Actualizar D20 para reflejar que el dominio canónico es **localhost:3000**, con la
razón: al usar `@supabase/ssr`, el code_verifier/sesión se guarda en cookies del
mismo host del browser; unificar en localhost evita el mismatch de host que rompe
el intercambio PKCE.

### 11. `docs/memory/session-log.md`
Añadir entrada de sesión documentando el cambio y el diagnóstico del PKCE.

## Sin cambios
- `components/login-form.tsx` / `registro-form.tsx`: ya leen `NEXT_PUBLIC_SITE_URL`
  para el `redirectTo` → apuntan a localhost automáticamente.
- `app/auth/callback/route.ts`: usa `origin()` → hereda el cambio.
- `app/layout.tsx` metadataBase: usa `NEXT_PUBLIC_SITE_URL` (fallback ya es localhost).

## Verificación
1. `npm run typecheck` → 0 errores
2. `npm run lint` → 0 errores
3. `npm test` → 289 passed
4. `./validate.sh` (si la BD local está arriba)
5. Manual: navegar por `http://localhost:3000/login` → "Continuar con Google" →
   seleccionar cuenta → `http://localhost:3000/auth/callback?code=...&next=%2F` →
   header muestra el email → `/perfil` muestra "Mi perfil".

## Riesgos / notas
- D20 se modifica; es un cambio de decisión aprobado por el usuario.
- Si Next normaliza el host a "localhost" en los request (comentario de
  playwright.config.ts), esto favorece el uso de localhost como canónico.
- La validación del code_verifier depende de usar SIEMPRE localhost en el browser.
