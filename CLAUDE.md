# ERP Avícola PWA — Contexto del Proyecto

Este archivo se lee al inicio de cada sesión. Mantenlo corto — todo lo extenso vive en `memory/`.

## Qué es esto
ERP interno (no orientado a cliente final) para la gestión diaria de una granja
avícola familiar: producción de huevos, ventas, créditos, egresos y personal.
Usuarios: Gerente y Operario. Ver detalle en `memory/mision.md`.

## Antes de tocar código, lee en este orden
1. `memory/mision.md` — qué construimos y para quién
2. `memory/stack-tecnologico.md` — con qué construimos
3. `memory/arquitectura.md` — cómo se organiza el código (capas, no MVC)
4. `memory/modelo-datos.md` — el schema de Prisma, fuente de verdad
5. `memory/convenciones.md` — naming, git, estilo
6. `memory/decisiones-tecnicas.md` — decisiones D1–D6 (bloquean Sprint 0)
7. `memory/definition-of-ready.md` y `definition-of-done.md` — antes/después de cada tarea

## Comandos frecuentes
- `npm run dev` — servidor local
- `npx prisma migrate dev` — nueva migración
- `npx prisma studio` — explorar datos
- `npm run typecheck && npm run lint && npm test` — antes de cualquier commit
- `npx prisma validate` — validar schema antes de migrar

## Dónde está el trabajo activo
Cada sprint vive en `specs/sprint-XX-nombre/` con `spec.md`, `plan.md` y `tasks.md`.
Trabaja un sprint a la vez. No mezcles tareas de sprints distintos en la misma sesión.

## Reglas no negociables (resumen — el detalle está en definition-of-done.md)
- Ningún componente ni service importa Prisma directamente. Solo `repositories/`.
- Toda Server Action valida con Zod y verifica sesión + rol antes de ejecutar nada.
- Toda mutación que toque más de una tabla va dentro de `prisma.$transaction`.
- TypeScript strict. Cero `any`, cero `@ts-ignore`.