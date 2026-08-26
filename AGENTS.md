# AGENTS.md — ISWDB
El IMDb de las series de YouTube. Antes de tocar NADA, lee CONSTRAINTS.md.

## Comandos
npm run dev · npm test · npm run lint · npm run typecheck · ./validate.sh (única puerta)

## Reglas de trabajo
1. Trabajas contra spec/features/<id>/spec.md. Si no existe spec (L2/L3), PARA y pregunta.
2. Una tarea por sesión. El test se escribe en el mismo turno que el código.
3. No añades dependencias, no creas/editas migraciones sin aprobación.
4. Stack: el de CONSTRAINTS.md. No inventes alternativas.
5. Al terminar: ejecuta los tests afectados y PEGA la salida real (no narres).
6. YouTube API solo server-side. Nada de secretos en el código.
7. Si no estás ≥80% seguro de una decisión de dominio: pregunta.

## Mapa
CONSTRAINTS.md (reglas) · DECISIONS.md (ADRs, no contradecir) · ROADMAP.md (orden)
ARCHITECTURE.md (capas y modelo) · spec/features/ (specs/plans/tasks)
docs/memory/ (session-log, open-questions)

Idiomas: código y commits en inglés; textos de UI y docs en español.