# Estado del Proyecto — Bitácora de Ejecución

Este archivo se actualiza al cerrar cada sprint. A diferencia de los demás
archivos de `memory/` (que son la constitución, casi no cambian), este
documenta lo que REALMENTE pasó al construir — decisiones tomadas sobre
la marcha, problemas resueltos, y cualquier desvío del plan original.

Si retomas este proyecto en una sesión nueva (chat o terminal), lee este
archivo primero, después el roadmap en `specs/roadmap-completo.md`.

## Resumen ejecutivo
- **Sprint actual:** 1 de 16 completado (Sprint 0 — Cimientos)
- **Deploy activo:** https://avicola-mya.vercel.app
- **Repo:** https://github.com/luistl03/avicola-mya
- **Herramienta de desarrollo:** Claude Code en terminal (Warp), plan Pro

## Versiones fijadas (importante — difieren de lo planificado originalmente)

| Tecnología | Versión planificada | Versión real fijada | Motivo del cambio |
|---|---|---|---|
| Next.js | 15+ | **16.2.12** | `create-next-app` instaló 16 por defecto. Se evaluó y aprobó: es proyecto greenfield (sin código legado que migrar), y `stack-tecnologico.md` ya decía "15+" dejando la puerta abierta. Turbopack estable por defecto es una mejora, no un costo, en un proyecto nuevo. |
| Prisma | (no especificada) | **6.19.3** (fijada explícitamente) | `npx prisma` bajaba 7.x por defecto, que mueve `url`/`directUrl` fuera de `schema.prisma` hacia `prisma.config.ts` — rompe la sintaxis clásica que ya estaba documentada en `modelo-datos.md`. Se fijó v6 para mantener consistencia con lo ya planificado. **Instalar siempre con `prisma@6` y `@prisma/client@6` explícito, nunca `@latest`.** |

## Pendientes de atención por el cambio a Next 16
No bloquean nada ahora, pero hay que tenerlos presentes al llegar a estos sprints:
- **Sprint 2 (middleware RBAC):** Next 16 cambió el modelo de middleware hacia
  "proxy" en ciertos contextos. Verificar sintaxis vigente antes de escribir
  `middleware.ts` para el guard de roles.
- **Cualquier página con `params`/`searchParams`:** en Next 16 son siempre
  asíncronos (`await`), sin fallback síncrono como tenía Next 15. Tenerlo
  presente desde el primer componente que los use.

## Problemas encontrados y resueltos durante Sprint 0
1. **Relación inversa faltante en el schema:** `MovimientoSueltos.usuario`
   apuntaba a `Usuario`, pero `Usuario` no tenía el campo inverso
   (`movimientosSueltos MovimientoSueltos[]`). Se corrigió antes de migrar
   — de haberse detectado en Sprint 5 en vez de Sprint 0, hubiera sido
   más costoso de arreglar con datos reales ya cargados.
2. **`.gitignore` de `create-next-app` vs. el que ya existía:** se fusionaron
   en vez de reemplazar, para no perder las exclusiones de Prisma/entorno
   que ya se habían definido.
3. **`postinstall: prisma generate` faltante en `package.json`:** sin esto,
   ni CI ni Vercel generaban el Prisma Client después de `npm ci`/`npm install`.
   Se agregó — es la causa más común de builds que fallan "sin razón aparente"
   en proyectos con Prisma.

## Credenciales de desarrollo (seed)
- Usuario Gerente: `gerente` / `Cambiar123!`
- **Esta contraseña es solo para desarrollo.** No correr el seed en producción
  esperando que esto la resetee — el cambio de contraseña real se hace desde
  la app una vez que exista esa pantalla (Sprint 1+).

## Herramientas y configuración del entorno
- Se rechazó la extensión "Claude in Chrome" durante Sprint 0 — no era
  necesaria para tareas sin UI de negocio real. Se recomienda activarla
  recién en sprints con pantallas que requieran validación visual
  (Sprint 1 login, Sprint 5 recolección, o al retomar identidad visual).

## Identidad visual — pendiente, decisión consciente
Se evaluaron paletas basadas en el logo de Avícola M&A (ámbar/naranja/rojo
extraídos directamente del logo) pero **se decidió posponer** la definición
final hasta tener pantallas reales de negocio construidas — es más fácil
decidir estilo viendo la app funcionando que sobre mockups aislados.
Actualmente el proyecto usa el tema por defecto de shadcn/ui (negro/blanco)
como placeholder. Retomar este tema cuando haya UI de negocio real que
mostrar (sugerido: después de Sprint 3-4).

## Cómo continuar desde acá
1. Sprint 1 (Autenticación) es el siguiente. Su `spec.md` aún no existe —
   generarlo primero usando `specs/roadmap-completo.md` (sección Sprint 1)
   + este archivo + el resto de `memory/` como contexto.
2. Antes de escribir el middleware de auth, revisar la nota de Next 16
   sobre proxy/middleware de la sección de arriba.
3. Mantener el mismo patrón de Sprint 0: ejecutar tarea por tarea, verificar
   antes de marcar como completa, hacer commits frecuentes con git status
   confirmado limpio de `.env` antes de cada uno.

## Registro de cierre de sprints
- **Sprint 0** — cerrado. 10/10 tareas completas y verificadas. Deploy
  funcionando en producción. Sin deuda técnica pendiente conocida.