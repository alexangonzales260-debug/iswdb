# Constitución ISWDB

## Stack exacto (añadir algo requiere ADR aprobado)
- Node 22 LTS · Next.js 15 (App Router) · React 19 · TypeScript 5 strict
- Tailwind CSS 4 (único sistema de estilos) · Zod para validación
- Supabase: Postgres + Auth + Storage (@supabase/ssr, JS v2, CLI local con Docker)
- Tests: Vitest + Testing Library (unit) · Playwright (E2E flujos críticos)
- Calidad: ESLint 9 flat config + Prettier
- Única API externa: YouTube Data API v3 (solo server-side)

## Comandos
npm run dev | lint | typecheck | test | build
./validate.sh  ← ÚNICA PUERTA: lint + typecheck + tests + build

## Convenciones
- Código, identificadores y commits en inglés; UI y docs en español.
- Commits atómicos y trazables: `F2: …` (cierre feature), `feat(002): …`, `fix(002): …`.
- Server Components por defecto; "use client" solo con justificación.
- Lógica de dominio en lib/ (server-side). Nunca en componentes.
- Fechas timestamptz UTC · IDs uuid · migraciones en supabase/migrations.
- Una migración aplicada jamás se edita: se crea otra encima.

## Prohibiciones
- ❌ `any` sin comentario que lo justifique
- ❌ Dependencias nuevas sin aprobación + ADR
- ❌ Secretos en código o bundle (solo env vars; NEXT_PUBLIC_ solo para lo público)
- ❌ Descargar/rehostear vídeo o audio de YouTube: solo embed oficial
     (youtube-nocookie.com) y miniaturas de img.youtube.com
- ❌ Llamar a la YouTube API desde el cliente
- ❌ Declarar "done" sin evidencia real de validate.sh
- ❌ Cambiar una spec sin aprobación explícita

## Definition of Done
1. Criterios de aceptación cumplidos con evidencia visible
2. Tests nuevos/actualizados pasan; suite completa verde
3. lint + validate.sh a 0 errores
4. Diff revisado y entendido por mí
5. Sin secretos ni dependencias sin aprobar
6. Sin contradecir ADRs (si la hay: parar y proponer ADR nuevo)
7. Docs afectadas actualizadas (spec, ROADMAP, DECISIONS)
8. Commit atómico con ID trazable