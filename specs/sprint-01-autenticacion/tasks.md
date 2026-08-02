# Tareas — Sprint 1

- [x] S1-1 — Instalar Auth.js v5 (`next-auth@beta`): `AUTH_SECRET`, estrategia de sesión `jwt`, config base en `server/auth/config.ts`
- [x] S1-2 — CredentialsProvider: `repositories/usuario.ts` (buscar por `usuario`), `bcryptjs.compare`, `lib/zod/auth.ts` (loginSchema: usuario + password)
- [x] S1-3 — Callbacks `jwt`/`session`: embeber `usuarioId`, `rol`, `jti` en el token — ⚠️ el campo se renombró a `sesionId` en S1-8 (bug real: `jti` colisionaba con el claim JWT estándar que Auth.js reescribe en `encode()`, ver plan.md)
- [x] S1-4 — `repositories/sesion.ts` + `services/sesion.ts`: crear SesionActiva al login, `estaExpiradaPorInactividad()`, `actualizarUltimaActividad()`, `revocar()`
- [x] S1-5 — `proxy.ts` (Next 16, ex-`middleware.ts`): guard binario autenticado/no autenticado — confirmar sintaxis vigente contra la versión instalada de next-auth (R1 en spec.md) antes de escribir
- [x] S1-6 — Pantalla `/login` mobile-first: `Card`/`Input`/`Label`/`Button` de `components/ui/`, estados de error/carga, `await searchParams` si se leen params de la URL (R2 en spec.md)
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
- [ ] 🔒 BLOQUEADO POR INFRA EXTERNA (no es trabajo de código pendiente) — Rate limiting probado en vivo contra Upstash real: 6 intentos de login fallidos en <1 min producen bloqueo de 15 min. El código ya está integrado y probado en modo "sin configurar" (S1-9); falta únicamente crear la cuenta de Upstash y pegar las credenciales en `.env`
- [ ] 🔒 BLOQUEADO POR HERRAMIENTA (no es trabajo de código pendiente) — Pantalla `/login` verificada pixel a pixel en viewport móvil real: la herramienta de resize del navegador de este entorno no cambia el viewport lógico (queda fijo). El CSS es mobile-safe por diseño (card centrado `max-w-sm`, inputs/botones de 48px de Sprint 0) pero no hay captura verificada a 390px
- [x] Ninguna Server Action ni componente de este sprint importa Prisma directamente (solo `server/repositories/`)

## Cierre de Sprint 1 (2026-08-02)
Las 10 tareas (S1-1 a S1-10) están completas y verificadas en código real
contra un servidor limpio (no solo tests). Los dos ítems marcados 🔒 arriba
no son deuda de código: dependen de crear una cuenta externa (Upstash) o de
una limitación de la herramienta de navegador en este entorno — no de algo
que falte implementar. Retomar ambos apenas se resuelva el bloqueo externo
correspondiente.
