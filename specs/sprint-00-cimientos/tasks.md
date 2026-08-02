# Tareas — Sprint 0

- [x] S0-1 — create-next-app: Next 16, TS strict, Tailwind v4, ESLint, Prettier
- [x] S0-2 — shadcn/ui + tema de alto contraste, font-size base 18px, targets táctiles ≥48px
- [x] S0-3 — Neon: proyecto + branch dev y main; DATABASE_URL (pooled) + DIRECT_URL
- [x] S0-4 — schema.prisma v2.0 completo (26 modelos, enums, índices) — copiar desde memory/modelo-datos.md
- [x] S0-5 — Migración inicial + SQL manual: índice único parcial en HistorialUbicacionLote, CHECK (cantidad >= 0) en InventarioSueltos
- [x] S0-6 — seed.ts: Gerente, Cliente Público General (id fijo), PrecioKilo inicial, 3 galpones + 1 lote demo
- [x] S0-7 — lib/prisma.ts singleton (evitar agotar pool en serverless)
- [x] S0-8 — Deploy Vercel + env vars + preview deployments automáticos
- [x] S0-9 — CI GitHub Actions: typecheck, lint, prisma validate, vitest run
- [x] S0-10 — ADR-000 (ya existe en memory/arquitectura.md) + Vitest configurado con factories

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` pasa sin errores
- [x] `npx prisma validate` pasa sin errores
- [x] El seed corre limpio en la BD de desarrollo
- [x] El deploy de preview en Vercel carga sin errores de conexión