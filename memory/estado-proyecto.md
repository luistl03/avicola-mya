# Estado del Proyecto — Bitácora de Ejecución

Este archivo se actualiza al cerrar cada sprint. A diferencia de los demás
archivos de `memory/` (que son la constitución, casi no cambian), este
documenta lo que REALMENTE pasó al construir — decisiones tomadas sobre
la marcha, problemas resueltos, y cualquier desvío del plan original.

Si retomas este proyecto en una sesión nueva (chat o terminal), lee este
archivo primero, después el roadmap en `specs/roadmap-completo.md`.

## Resumen ejecutivo
- **Sprint actual:** 2 de 16 completados (Sprint 0 — Cimientos, Sprint 1 — Autenticación y sesiones)
- **Deploy activo:** https://avicola-mya.vercel.app
- **Repo:** https://github.com/luistl03/avicola-mya
- **Herramienta de desarrollo:** Claude Code en terminal (Warp) y en chat, plan Pro

## Versiones fijadas (importante — difieren de lo planificado originalmente)

| Tecnología | Versión planificada | Versión real fijada | Motivo del cambio |
|---|---|---|---|
| Next.js | 15+ | **16.2.12** | `create-next-app` instaló 16 por defecto. Se evaluó y aprobó: es proyecto greenfield (sin código legado que migrar), y `stack-tecnologico.md` ya decía "15+" dejando la puerta abierta. Turbopack estable por defecto es una mejora, no un costo, en un proyecto nuevo. |
| Prisma | (no especificada) | **6.19.3** (fijada explícitamente) | `npx prisma` bajaba 7.x por defecto, que mueve `url`/`directUrl` fuera de `schema.prisma` hacia `prisma.config.ts` — rompe la sintaxis clásica que ya estaba documentada en `modelo-datos.md`. Se fijó v6 para mantener consistencia con lo ya planificado. **Instalar siempre con `prisma@6` y `@prisma/client@6` explícito, nunca `@latest`.** |

## Next 16: proxy.ts (resuelto en Sprint 1, léase antes de Sprint 2)
`middleware.ts` no existe en Next 16.2.12 — la convención es `src/proxy.ts`.
Confirmado leyendo el código fuente de `next` (no documentación): **`proxy.ts`
corre siempre en Node.js runtime, sin opción de Edge en absoluto** (exportar
`config.runtime` desde `proxy.ts` es error de build). Esto invalida el
supuesto original de `memory/arquitectura.md` (ADR-000) de que la capa de
middleware no puede tocar Prisma — si se usa `proxy.ts`, sí puede.

`src/proxy.ts` ya existe desde Sprint 1 con:
- Guard binario de sesión (redirect a `/login` si no hay `auth()`) — hecho a
  mano dentro del wrapper `auth(async (req) => {...})`, NO vía el callback
  `authorized` de next-auth (esa rama queda muerta en cuanto se provee un
  middleware propio — ver detalle en `specs/sprint-01-autenticacion/plan.md`).
- Rate limiting de Upstash para `/api/auth/*` y rutas operativas autenticadas.
- Matcher que excluye `_next/static`, `_next/image` y archivos estáticos de
  `public/` por extensión (no solo `favicon.ico`).

**Para Sprint 2:** el guard por rol (RBAC) y potencialmente el chequeo de
revocación/idle contra `SesionActiva` pueden resolverse en este mismo
`proxy.ts` en vez de (o además de) `withAuth()` en las Server Actions, dado
que ya no hay restricción de Edge. Evaluarlo al planificar, no asumir que
la arquitectura de Sprint 0 sigue aplicando sin revisión.

## Otras notas de Next 16
- **Cualquier página con `params`/`searchParams`:** en Next 16 son siempre
  asíncronos (`await`), sin fallback síncrono como tenía Next 15.

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

## Problemas encontrados y resueltos durante Sprint 1
Detalle completo con código y evidencia en `specs/sprint-01-autenticacion/plan.md`
— acá solo el resumen para no tener que releer todo.
1. **`session.jti`/`token.jti` nunca llegaba a la cookie real (bug grave,
   presente desde el diseño inicial de S1-3, no detectado hasta verificar
   S1-8 en vivo).** Auth.js sobreescribe el claim `jti` con su propio UUID
   al cifrar el JWT (`.setJti(crypto.randomUUID())` en `encode()`,
   confirmado en el código fuente de `@auth/core`) — cualquier valor custom
   asignado a `token.jti` en el callback se descarta en silencio. Cada login
   dejaba una fila huérfana en `SesionActiva` que la sesión real nunca
   usaba. **Corregido renombrando el campo a `sesionId`** en todo next-auth
   (no en la columna de Prisma, que sigue llamándose `jti`). Lección: nunca
   reusar nombres de claims JWT estándar (`jti`, `sub`, `iat`, `exp`, `nbf`)
   para campos custom en `token`/`session`.
2. **El guard de sesión de `proxy.ts` (S1-5) se desactivó silenciosamente
   al envolverlo con un middleware propio para el rate limiting (S1-9).**
   El callback `authorized` de next-auth solo dispara su redirect en una
   rama que next-auth salta incondicionalmente en cuanto se provee un
   middleware custom — sin ningún error visible. `curl` a una ruta protegida
   sin sesión devolvía `200` en vez de redirigir. Corregido reimplementando
   el redirect a mano dentro de `proxy.ts`. **Cualquier lógica nueva que se
   agregue a `proxy.ts` en Sprint 2 debe asumir que el guard vive ahí, no en
   `authorized`.**
3. **`actualizarUltimaActividad`/`revocarSesion` usaban `update()` (lanza
   `P2025` si no hay fila) en vez de `updateMany()` (no-op silencioso si no
   hay fila).** Una sesión "fantasma" (jti sin fila, por el bug #1 de arriba
   o por una caída transitoria de conexión de Neon — ver `P1017` más abajo)
   tumbaba el request completo con 500. Corregido.
4. **El `matcher` de `proxy.ts` bloqueaba archivos estáticos de `public/`**
   (solo excluía `favicon.ico` puntualmente) — el logo de Avícola M&A no
   cargaba porque el propio guard interceptaba tanto el PNG como la petición
   interna del optimizador de imágenes de Next. Corregido excluyendo
   extensiones de imagen comunes del matcher. **Tenerlo presente en
   Sprint 13 (PWA/íconos)** con cualquier asset nuevo bajo `public/`.
5. **Neon (plan gratuito, riesgo ya aceptado en D6) cerró una conexión a
   mitad de un test** (`P1017: Server has closed the connection`) durante
   pruebas rápidas y repetidas. No rompió nada gracias al fix #3, pero
   confirma que el riesgo de D6 es real, no solo teórico.

## Credenciales de desarrollo (seed)
- Usuario Gerente: `gerente` / `Cambiar123!`
- **Esta contraseña es solo para desarrollo.** No correr el seed en producción
  esperando que esto la resetee — el cambio de contraseña real se hace desde
  la app una vez que exista esa pantalla.
- Pantalla de cambio de contraseña propia **todavía no existe** — no estaba
  en el alcance confirmado de Sprint 1 (ver "Fuera de alcance" en
  `specs/sprint-01-autenticacion/spec.md`). Sigue pendiente para un sprint
  futuro si se decide priorizarla.

## Riesgo operativo: local y producción comparten la misma base de datos
`DATABASE_URL`/`DIRECT_URL` en `.env` local apunta al **mismo** Neon que usa
Vercel en producción — no hay separación de branches dev/main todavía
(pese a que Sprint 0 lo daba por hecho). Confirmado en vivo durante el
cierre de Sprint 1: una fila creada probando en local es visible probando
en producción y viceversa. No es un problema mientras no haya datos reales
de la granja cargados, pero **hay que separar los branches antes de eso**
— agregarlo a la lista de riesgos junto a D6.

## Upstash Redis — cuenta todavía no creada
El rate limiting de Sprint 1 (S1-9) está completamente integrado en código
(`src/lib/rate-limit.ts`, usado desde `src/proxy.ts`) pero sin cuenta real
de Upstash — degrada a "no bloquea nada" mientras falten
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, tanto en `.env` local
como en las env vars de Vercel. Crear la cuenta (gratis, console.upstash.com)
y cargar las credenciales en ambos lugares antes de considerar el rate
limiting realmente activo — hasta entonces, los 5 intentos/min con ban de
15 min de `/api/auth/*` no están aplicándose de verdad.

## Herramientas y configuración del entorno
- La extensión "Claude in Chrome" se activó en Sprint 1 (pantalla de login)
  y funcionó bien para screenshots y flujos de login/logout reales. **Un
  límite real encontrado:** la herramienta de resize de viewport no cambia
  el viewport lógico en este entorno (queda fijo en el tamaño de la ventana
  real) — no sirve para verificar diseño mobile pixel a pixel. Para eso,
  usar el emulador de dispositivo de Chrome DevTools manualmente, o probar
  en un celular real.
- Ya hubo casos (Sprint 1) donde un proceso `next dev` en background no
  murió del todo con `kill $PID` (el wrapper de `npm run dev &` no siempre
  mata al proceso hijo real) y quedó ocupando el puerto 3000, causando
  resultados de prueba confusos/inconsistentes en la sesión siguiente.
  Antes de dar por buena una prueba rara, verificar `netstat` para procesos
  zombie en el puerto antes de reintentar.

## Identidad visual — pendiente, decisión consciente
Se evaluaron paletas basadas en el logo de Avícola M&A (ámbar/naranja/rojo
extraídos directamente del logo) pero **se decidió posponer** la definición
final hasta tener pantallas reales de negocio construidas — es más fácil
decidir estilo viendo la app funcionando que sobre mockups aislados.
Actualmente el proyecto usa el tema por defecto de shadcn/ui (negro/blanco)
como placeholder. Retomar este tema cuando haya UI de negocio real que
mostrar (sugerido: después de Sprint 3-4). **Actualización Sprint 1:** el
logo real de Avícola M&A ya está en `public/avicola-logo.png` y se usa en
`/login` — la decisión de posponer la paleta de color sigue en pie, solo
cambió que ahora sí existe el asset gráfico real para cuando se retome.

## Cómo continuar desde acá
1. Sprint 2 (RBAC, auditoría y shell) es el siguiente. Su `spec.md` aún no
   existe — generarlo primero usando `specs/roadmap-completo.md` (sección
   Sprint 2) + este archivo + el resto de `memory/` como contexto. Usar
   `specs/sprint-01-autenticacion/` como referencia de estructura.
2. Antes de escribir el guard por rol, leer la sección "Next 16: proxy.ts"
   de arriba completa — `proxy.ts` ya existe con guard de sesión binario y
   rate limiting, no hay que crear `middleware.ts` desde cero, y corre en
   Node.js (no Edge), lo que cambia lo que es viable ahí.
3. El botón de logout actual (`components/domain/auth/logout-button.tsx`,
   montado directo en `layout.tsx`) es un placeholder explícito hasta que
   exista el Shell real de Sprint 2 (Sidebar/BottomNav) — reemplazarlo ahí,
   no dejarlo duplicado.
4. Mantener el mismo patrón de Sprints 0 y 1: ejecutar tarea por tarea,
   verificar en código real (no solo tests) antes de marcar como completa,
   commits frecuentes con git status confirmado limpio de `.env` antes de
   cada uno.

## Registro de cierre de sprints
- **Sprint 0** — cerrado. 10/10 tareas completas y verificadas. Deploy
  funcionando en producción. Sin deuda técnica pendiente conocida.
- **Sprint 1** — cerrado (2026-08-02). 10/10 tareas completas, 24 tests
  (unit + integración), verificado en código real contra servidor limpio
  y en producción (no solo tests) — login, logout, idle timeout, guard de
  sesión y creación de logo confirmados end-to-end. Commit `4cf67ee`,
  pusheado y desplegado. 5 bugs reales encontrados y corregidos en el
  camino (detalle arriba en "Problemas encontrados... Sprint 1"). Deuda
  pendiente, ambos bloqueados por factores externos, no por código: (1)
  rate limiting sin probar contra Upstash real (falta crear la cuenta),
  (2) `/login` sin verificar en viewport móvil real pixel a pixel
  (limitación de la herramienta de browser en este entorno).