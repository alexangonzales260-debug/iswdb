# 029 — Detección automática de episodios nuevos · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Migración M24 con tabla `episodio_sugerencia`.
2. RLS: `insert` exclusivo del service_role; `select/update/delete` exclusivos de `is_admin_or_mod()`.
3. UI en `/admin/sugerencias-episodios`.
4. Lógica de parsing en `lib/episodio-deteccion.ts`.

## Verificación previa del esquema (hallazgos)
- Se sigue el patrón de F028.
- Timestamp sugerido: `20261017120000_create_episodio_sugerencia.sql`.

## Decisiones técnicas (justificadas)
- Parsing basado en regex para detectar patrones comunes de series en YouTube.
- RLS estricto para evitar inserciones no autorizadas por usuarios finales.

## Archivos
**Crear**
- `spec/features/029-deteccion-episodios-automatica/{spec.md,plan.md,tasks.md}`
- `supabase/migrations/20261017120000_create_episodio_sugerencia.sql` (M24)
- `lib/episodio-deteccion.ts`
- `app/admin/sugerencias-episodios/page.tsx`
- `tests/db/episodio-sugerencia-rls.test.ts`
- `tests/lib/episodio-deteccion.test.ts`

## Riesgos técnicos
- Parsing de títulos es propenso a errores (falsos positivos/negativos); se confía en moderación humana.

## Qué NO haré
- Cronjobs, notificaciones, rate limiting.
