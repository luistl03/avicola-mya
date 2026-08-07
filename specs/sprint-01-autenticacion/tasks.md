# Tareas — Sprint 1

- [x] S1-1 — Instalar Auth.js v5 (`next-auth@beta`): `AUTH_SECRET`, estrategia de sesión `jwt`, config base en `server/auth/config.ts`
- [x] S1-2 — CredentialsProvider: `repositories/usuario.ts` (buscar por `usuario`), `bcryptjs.compare`, `lib/zod/auth.ts` (loginSchema: usuario + password)
- [x] S1-3 — Callbacks `jwt`/`session`: embeber `usuarioId`, `rol`, `jti` en el token — ⚠️ el campo se renombró a `sesionId` en S1-8 (bug real: `jti` colisionaba con el claim JWT estándar que Auth.js reescribe en `encode()`, ver plan.md)
- [x] S1-4 — `repositories/sesion.ts` + `services/sesion.ts`: crear SesionActiva al login, `estaExpiradaPorInactividad()`, `actualizarUltimaActividad()`, `revocar()`
- [x] S1-5 — `proxy.ts` (Next 16, ex-`middleware.ts`): guard binario autenticado/no autenticado — confirmar sintaxis vigente contra la versión instalada de next-auth (R1 en spec.md) antes de escribir
- [x] S1-6 — Pantalla `/login` mobile-first: `Input`/`Label`/`Button` de
  `components/ui/`, estados de error/carga, `await searchParams` si se leen
  params de la URL (R2 en spec.md). **Actualizado en una sesión posterior
  de identidad visual:** ya no usa `Card` — se reemplazó por un grid a
  mano (dos paneles lado a lado, uno a sangre completa con el color de
  marca) porque `Card` asume un solo bloque vertical apilado, no dos
  paneles con un color a sangre completa; ver el comentario en el propio
  `page.tsx`. `Card` no se usa en ningún lugar del proyecto todavía.
- [x] S1-7 — `IdleTimer` cliente: aviso a los 28 min, logout a los 30 min, heartbeat con debounce ~60s o `sendBeacon` (R3 en spec.md)
- [x] S1-8 — Botón "Cerrar sesión" (`components/domain/auth/logout-button.tsx`, form directo a la Server Action `logout()` ya construida en S1-7, montado en el layout raíz mientras no exista el shell de Sprint 2). Al verificarlo en vivo se encontró y corrigió el bug real `jti`/`sesionId` descrito arriba en S1-3 — el logout revoca ahora la fila correcta, confirmado end-to-end con un servidor limpio.
- [x] S1-9 — Rate limiting Upstash: `@upstash/ratelimit` + `@upstash/redis`, `/api/auth/*` 5/min → ban 15 min; rutas operativas 60/min. ⚠️ Código integrado y verificado en modo "no configurado" (sin credenciales reales de Upstash todavía — degrada a no-limitar, ver plan.md). Falta probar en vivo cuando exista la cuenta.
- [x] S1-10 — Tests: unit de `services/sesion.ts` (idle/revocada, casos límite en el umbral), integración de login (éxito/fracaso/usuario inactivo), logout y rate-limit

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` pasa sin errores
- [x] `npx prisma validate` pasa sin errores (sin cambios de schema en todo el sprint, como estaba previsto)
- [x] Login manual con `gerente` / `Cambiar123!` (seed de Sprint 0) funciona end-to-end (verificado repetidas veces vía curl y navegador)
- [x] Sesión se revoca correctamente al hacer logout — confirmado end-to-end en S1-8 tras el fix `jti`→`sesionId`: `sesionId` de la cookie coincide con `SesionActiva.jti`, y logout deja `revocada: true` + `revocadaEn` en la fila correcta
- [x] Idle timeout probado manualmente con umbrales acortados temporalmente (28min/30min → 28s/30s) contra el server real — aviso y auto-logout confirmados
- [x] Rate limiting probado en vivo contra Upstash real (resuelto al cerrar
  Sprint 2, 2026-08-03 — cuenta creada por el Product Owner, credenciales
  cargadas en `.env` local): 7 intentos rápidos contra `/api/auth/*`
  dispararon el bloqueo real dentro de la ventana de 1 min, con el cuerpo
  de respuesta esperado y `HTTP 429`, aplicado incluso a credenciales
  correctas mientras dura el ban de 15 min, y confirmado que el bloqueo es
  por identificador (no global). **Verificado también en producción real**
  (mismo día): Product Owner cargó las credenciales en Vercel
  (Production + Preview) e hizo un redeploy manual; se repitió el ataque
  contra `https://avicola-mya.vercel.app` y bloqueó igual, `429` + mismo
  mensaje, a partir del 5to request. Detalle completo, incluido un
  hallazgo no-bug sobre `x-forwarded-for` en el borde de Vercel, en
  `memory/estado-proyecto.md`, sección "Upstash Redis". Sin deuda
  pendiente en este ítem, local y producción confirmados
- [x] Pantalla `/login` verificada en viewport móvil real — no se pudo hacer pixel a pixel con la herramienta de resize de Claude in Chrome (no cambia el viewport lógico en este entorno, confirmado dos veces). Resuelto por otra vía al cerrar Sprint 2 (2026-08-03): el Product Owner probó `/login` y el Shell desde su celular físico contra producción, ambas pantallas confirmadas OK.
- [x] Ninguna Server Action ni componente de este sprint importa Prisma directamente (solo `server/repositories/`)

## Cierre de Sprint 1 (2026-08-02)
Las 10 tareas (S1-1 a S1-10) están completas y verificadas en código real
contra un servidor limpio (no solo tests). Los dos ítems marcados 🔒 arriba
no son deuda de código: dependen de crear una cuenta externa (Upstash) o de
una limitación de la herramienta de navegador en este entorno — no de algo
que falte implementar. Retomar ambos apenas se resuelva el bloqueo externo
correspondiente.

**Actualización al cerrar Sprint 2 (2026-08-03):** el ítem de Upstash se
resolvió (ver arriba). Sigue pendiente únicamente el viewport móvil de
`/login` — reintentado durante el cierre de Sprint 2 con la extensión
Claude in Chrome conectada, mismo síntoma (`resize_window` no cambia el
viewport lógico real, dos screenshots idénticos antes/después). Sigue
siendo un límite de la herramienta en este entorno, no del código.
