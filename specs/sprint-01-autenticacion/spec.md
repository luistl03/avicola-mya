# Sprint 1 — Autenticación y sesiones

## Sprint Goal
Gerente y Operario pueden iniciar sesión con usuario y contraseña desde
`/login`, la sesión es revocable y expira sola tras 30 min de inactividad,
y los endpoints de autenticación están protegidos contra fuerza bruta.

## Contexto previo (leer antes de ejecutar)
- Sprint 0 quedó cerrado con Next.js **16.2.12** y Prisma **6.19.3** fijados
  (no lo planificado originalmente) — ver `memory/estado-proyecto.md`.
- El modelo `SesionActiva` ya existe y está migrado desde Sprint 0
  (`prisma/schema.prisma:53`). No se toca el schema en este sprint salvo
  que aparezca un gap no previsto.
- `bcryptjs` ya está instalado (`package.json`) desde Sprint 0. `next-auth`,
  `zod`, `@upstash/ratelimit` y `@upstash/redis` **no** están instalados
  todavía — se instalan en este sprint.

## Historias de usuario

### H1 — Login con usuario y contraseña (5 pts)
Como Gerente u Operario quiero iniciar sesión con mi usuario y contraseña
para acceder a las funciones de la app según mi rol.

```gherkin
Dado un usuario ACTIVO con contraseña válida
Cuando ingreso usuario y contraseña correctos en /login
Entonces soy redirigido al dashboard
Y se crea un registro en SesionActiva vinculado a mi usuarioId

Dado que ingreso una contraseña incorrecta
Cuando envío el formulario de login
Entonces veo un mensaje de error genérico ("usuario o contraseña incorrectos")
Y no se revela si el usuario existe o no
Y no se crea ninguna SesionActiva

Dado un usuario con estado INACTIVO
Cuando intento iniciar sesión con sus credenciales correctas
Entonces el login es rechazado con el mismo mensaje genérico
```

### H2 — Sesión revocable (3 pts)
Como sistema quiero poder marcar una `SesionActiva` como revocada para que
esa sesión deje de aceptar acciones protegidas de inmediato.
**Fuera de alcance en esta historia:** la pantalla de Gerente para revocar
sesiones de otros usuarios (CRUD de usuarios es Sprint 2). Aquí solo se
construye la capacidad de backend (repository/service) y se ejerce a
través del propio logout (H con revocada=true al cerrar sesión).

```gherkin
Dado que una SesionActiva tiene revocada = true
Cuando esa sesión intenta ejecutar una acción protegida
Entonces el sistema la rechaza y fuerza un login nuevo
```

### H3 — Expiración automática por inactividad (8 pts)
Como usuario autenticado quiero que mi sesión se cierre sola tras 30 min
sin actividad, con un aviso previo a los 28 min, para que un dispositivo
desatendido no quede con la sesión abierta.

```gherkin
Dado que estoy autenticado y no interactúo con la app durante 28 minutos
Cuando se cumple ese tiempo
Entonces veo un aviso en pantalla de que mi sesión está por expirar

Dado que no interactúo durante 30 minutos desde mi última actividad registrada
Cuando se cumple ese tiempo
Entonces mi sesión se marca revocada, se cierra y soy redirigido a /login

Dado que sigo interactuando con la app normalmente
Cuando se actualiza mi última actividad en el servidor
Entonces el conteo de inactividad se reinicia
Y esa actualización no genera más de una escritura a la base de datos por
  ventana de ~60 segundos (ver riesgo de heartbeat abajo)
```

### H4 — Rate limiting en autenticación y rutas operativas (5 pts)
Como sistema quiero limitar los intentos de login y las llamadas a rutas
operativas para frenar ataques de fuerza bruta y abuso.

```gherkin
Dado que un cliente hace más de 5 intentos de login en 1 minuto
Cuando se supera ese límite
Entonces las siguientes solicitudes a /api/auth/* se bloquean durante 15 min
Y la respuesta indica claramente que se debe esperar

Dado un usuario autenticado
Cuando hace más de 60 solicitudes por minuto a rutas operativas
Entonces recibe 429 y un mensaje de reintento
```

### H5 — Guard de autenticación en rutas protegidas (3 pts)
Como sistema quiero bloquear el acceso a las rutas del grupo `(app)` si no
hay una sesión válida, redirigiendo a `/login`.
**Fuera de alcance:** el guard por rol (Gerente vs. Operario) — eso es
`middleware.ts`/`proxy.ts` RBAC completo de Sprint 2. Aquí el guard es
binario: hay sesión válida o no.

```gherkin
Dado que no tengo una sesión válida
Cuando intento acceder a cualquier ruta dentro de (app)
Entonces soy redirigido a /login

Dado que tengo una sesión válida
Cuando accedo a una ruta dentro de (app)
Entonces la petición continúa sin interrupción
```

## Alcance de este sprint
- Auth.js v5 (`next-auth@beta`) con `CredentialsProvider`, `bcryptjs` para
  verificar contraseña, estrategia de sesión `jwt`.
- Repository + service de `SesionActiva`: crear al login, verificar
  (revocada / idle), actualizar `ultimaActividad`, revocar al logout o al
  vencer el idle timeout.
- Guard binario de autenticación en rutas de `(app)` (redirect a `/login`).
- Pantalla `/login` mobile-first reusando `components/ui/` (button, card,
  input, label) ya definidos en Sprint 0.
- `IdleTimer` cliente (aviso 28 min / logout 30 min) con heartbeat
  throttleado hacia el servidor.
- Rate limiting con Upstash Redis en `/api/auth/*` y rutas operativas.
- Tests unitarios del service de `SesionActiva` (idle/revocada) y de
  integración del flujo de login/logout/rate-limit.

## Fuera de alcance
- RBAC granular por rol y el wrapper `withAuth()` — Sprint 2.
- `AuditLog` de acciones — Sprint 2.
- CRUD de usuarios (crear/editar/desactivar) — Sprint 2.
- Pantalla de gestión de sesiones activas para el Gerente — no está en el
  roadmap actual; si se necesita, se agrega como historia nueva en un
  sprint futuro, no se improvisa aquí.
- Cambio de contraseña propia desde la app — `memory/estado-proyecto.md`
  lo menciona como pendiente "Sprint 1+", pero el roadmap (`specs/roadmap-completo.md`,
  sección Sprint 1) no lo incluye explícitamente en el alcance de este
  sprint. **Se deja fuera** para no inventar alcance no confirmado; si el
  Product Owner lo quiere en este sprint, es una decisión a tomar antes
  de iniciar, no durante.

## Riesgos y notas (heredados de `memory/estado-proyecto.md`)

### R1 — Next 16: middleware.ts pasó a proxy.ts ✅ RESUELTO EN S1-5
Confirmado directamente en el código fuente de `next` 16.2.12
(`node_modules/next/dist/build/analysis/get-page-static-info.js`):
**"Proxy always runs on Node.js runtime"** — a diferencia de
`middleware.ts` (que podía correr en Edge), `proxy.ts` **no tiene opción
de Edge Runtime en absoluto**; intentar exportar `config.runtime` desde
`proxy.ts` es un error de build. Esto **invalida el supuesto de
`memory/arquitectura.md`** (ADR-000, sección "Middleware y Edge Runtime")
de que la lógica de auth en esta capa no puede tocar Prisma — en Next 16,
si se usa `proxy.ts`, sí puede.

Implementación real usada en S1-5 (más simple de lo previsto, sin
necesidad de reconstruir la redirección a mano): Auth.js v5 expone un
callback `authorized({ auth })` en `NextAuthConfig.callbacks` pensado
específicamente para este caso — si devuelve `false`, la librería
redirige sola a `pages.signIn` (agregando `callbackUrl`) y evita el loop
si la ruta actual ya es la de login. `src/proxy.ts` queda entonces en un
solo re-export: `export { auth as proxy } from "@/server/auth"`, con
`config.matcher` excluyendo `/api`, `_next/static`, `_next/image` y
`favicon.ico` (excluir `/api` completo es necesario porque, sin eso,
`authorized` también se evalúa contra `/api/auth/callback/credentials`
y bloquearía el propio POST de login).

**Nota para Sprint 2:** dado que `proxy.ts` ya corre en Node.js, el
guard por rol y potencialmente el chequeo de revocación/idle contra
`SesionActiva` podrían resolverse aquí mismo en vez de (o además de)
`withAuth()` en las Server Actions — evaluarlo al planificar Sprint 2,
no asumir que la arquitectura de Sprint 0 sigue aplicando sin revisión.

### R2 — `params`/`searchParams` asíncronos
En Next 16 son siempre `Promise` (`await`), sin fallback síncrono. Si la
pantalla `/login` lee `searchParams` (p. ej. `callbackUrl` o `error` que
Auth.js agrega a la URL de retorno), debe hacerlo con `await` desde un
Server Component — tenerlo presente en S1-6.

### R3 — Heartbeat del IdleTimer sin throttle satura Neon
Un ping por segundo (o por evento de actividad sin debounce) generaría
una escritura a la fila `SesionActiva.ultimaActividad` por segundo por
usuario conectado — inaceptable contra el plan gratuito de Neon (ver D6
en `memory/decisiones-tecnicas.md`). **El plan técnico debe usar
`navigator.sendBeacon` o un debounce de ~60s en cliente antes de golpear
al servidor**, nunca un ping inmediato por evento de mousemove/keydown.

### R4 — Variable de entorno: `AUTH_SECRET`, no `NEXTAUTH_SECRET`
El `plan.md` de Sprint 0 había anticipado `NEXTAUTH_SECRET` como variable
de entorno. Auth.js v5 usa `AUTH_SECRET` como nombre recomendado (aunque
`NEXTAUTH_SECRET` sigue funcionando por compatibilidad). Usar `AUTH_SECRET`
en Vercel y `.env` local para evitar confusión a futuro.

## Criterio de aceptación general
Dado el repo con Sprint 0 ya desplegado
Cuando un Gerente o Operario con usuario ACTIVO ingresa sus credenciales
  correctas en /login
Entonces accede a la app, su sesión queda registrada en SesionActiva
Y si permanece 30 min inactivo la sesión se cierra sola
Y si intenta más de 5 logins fallidos en 1 minuto queda bloqueado 15 min
Y ninguna ruta de (app) es accesible sin sesión válida
