# Plan técnico — Sprint 0

## Orden de ejecución (hay dependencias entre tareas)

1. **S0-1** (create-next-app) → base de todo lo demás.
2. **S0-2** (shadcn/ui + tema) → puede hacerse en paralelo con S0-3.
3. **S0-3** (Neon: proyecto + branches) → necesario antes de S0-4.
4. **S0-4** (schema.prisma completo) → copiar tal cual desde
   `prisma/schema.prisma` (ya definido), usando `memory/modelo-datos.md`
   como referencia de las reglas. No rediseñar desde cero.
5. **S0-5** (migración inicial + SQL manual) → depende de S0-4 cerrado.
   Incluye el CHECK y el índice único parcial documentados en
   `memory/modelo-datos.md`.
6. **S0-6** (seed.ts) → depende de S0-5 aplicado.
7. **S0-7** (lib/prisma.ts singleton) → puede hacerse en paralelo con S0-6.
8. **S0-8** (Deploy Vercel) → depende de S0-1 y S0-7 mínimo funcionando.
9. **S0-9** (CI GitHub Actions) → puede hacerse en paralelo con S0-8.
10. **S0-10** (ADR-000 + Vitest) → el ADR-000 ya existe en
    `memory/arquitectura.md`, aquí solo se configura Vitest con factories.

## Decisión de secuencia si la velocidad real es menor a 26 pts
Este sprint pesa 32 pts. Si tras iniciar se nota que no se va a
completar en el sprint, mover S0-9 y S0-10 al Sprint 1 — son las dos
tareas con menor dependencia hacia atrás (no bloquean S0-5 ni S0-6).

## Comandos de referencia

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint
npx shadcn@latest init
npx prisma init
npx prisma migrate dev --name init
npx prisma db seed
npx prisma studio    # verificación visual rápida
```

## Variables de entorno necesarias (Vercel + local `.env`)

Los valores reales viven solo en `.env` local (no versionado) y en las
env vars del proyecto en Vercel — nunca en archivos de `specs/` o `memory/`.

```bash
DATABASE_URL=   # pooled, Neon
DIRECT_URL=     # directa, Neon, solo migraciones
NEXTAUTH_SECRET=
```

## Definition of Done aplicable a este sprint
Ver `memory/definition-of-done.md`. Para este sprint en particular,
el punto de "probado en móvil real" no aplica todavía (no hay UI de
negocio) — se reemplaza por: "el seed corre sin error y Prisma Studio
muestra los datos esperados".