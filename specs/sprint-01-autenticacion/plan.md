# Plan técnico — Sprint 1

## Bug real encontrado y corregido en S1-8 (grave — afectaba S1-3/S1-4 desde el inicio)
`session.jti`/`token.jti` (nombre elegido en S1-3 para el identificador
custom que correlaciona el JWT con `SesionActiva`) **nunca llegaba a la
cookie real**. Causa raíz confirmada leyendo el código fuente de
`@auth/core`: la función `encode()` en `node_modules/@auth/core/src/jwt.ts`
llama incondicionalmente `.setJti(crypto.randomUUID())` al cifrar el JWT
(línea 71) — sobreescribe el claim `jti` con SU PROPIO UUID sin importar
qué valor le haya asignado el callback `jwt`. El síntoma: el `jti` que
`crearSesion()` persistía en `SesionActiva` (generado dentro del callback)
y el `jti` que terminaba en la cookie real (generado después, dentro de
`encode()`) eran dos UUIDs completamente distintos — cada login dejaba una
fila en `SesionActiva` que ninguna sesión real iba a usar jamás, y la
sesión real nunca tenía fila propia. `heartbeat`/`logout` no crasheaban
(gracias al fix `updateMany` de S1-7) pero tampoco hacían nada útil:
revocaban/actualizaban una fila "huérfana", no la sesión activa.

Se detectó al verificar S1-8 en vivo: `/api/auth/session` devolvía un
`jti` que no existía en ninguna fila de `SesionActiva`, reproducible con
un servidor recién reiniciado (no era el problema de conexión Neon de
S1-7). Confirmado con logs de depuración temporales en el callback `jwt`.

**Corrección:** renombrar el campo custom de `jti` a `sesionId` en todo
next-auth (`token.sesionId`, `session.sesionId`) — nombre que no colisiona
con ningún claim JWT estándar que la librería maneje internamente.
`SesionActiva.jti` (la columna de Prisma) no cambia de nombre, solo el
campo del lado de next-auth. Verificado end-to-end con un servidor
limpio: `sesionId` de la cookie ahora coincide exactamente con el `jti`
persistido en `SesionActiva`, y logout revoca la fila correcta
(`revocada: true`, `revocadaEn` seteado).

**Lección:** nunca reusar nombres de claims JWT estándar (`jti`, `sub`,
`iat`, `exp`, `nbf`, ...) para campos custom en `token`/`session`, incluso
si la librería los declara "opcionales" — pueden estar reservados para uso
interno de la librería sin que el tipado lo advierta.

## Bug real encontrado y corregido en S1-9
`src/proxy.ts` pasó de un simple re-export (`export { auth as proxy }`,
S1-5) a una función custom envuelta con `auth(async (req) => {...})` para
poder agregar el rate limiting. Esto **rompió silenciosamente el guard de
sesión de S1-5**: leyendo `node_modules/next-auth/lib/index.js`
(`handleAuth`), el callback `authorized` solo dispara su propio redirect
en la rama `else if (!authorized)` — pero esa rama nunca se alcanza si se
provee un middleware propio (`userMiddlewareOrRoute`), porque el
`if/else if` la salta incondicionalmente en cuanto ese middleware existe.
En la práctica: `curl` a `/` sin sesión devolvía `200` en vez de redirigir
a `/login`, sin ningún error en el log — un guard de auth que dejó de
aplicarse del todo y no lo delataba nada. Corregido eliminando el
callback `authorized` (queda muerto en cuanto hay middleware propio) y
moviendo el redirect a mano dentro de `src/proxy.ts`, junto con el rate
limiting. **Lección para Sprint 2:** cualquier lógica adicional que se
agregue a `proxy.ts` debe reimplementar el guard de sesión ahí mismo, no
asumir que `authorized` en `config.ts` sigue aplicando.

## Bug real encontrado y corregido en S1-7
`server/repositories/sesion.ts` usaba `prisma.sesionActiva.update()` en
`actualizarUltimaActividad()` y `revocarSesion()` — si el `jti` de la
cookie no tiene fila correspondiente (por ejemplo, una escritura de
`crearSesion()` que falló por una caída transitoria de conexión de Neon
— confirmado en vivo durante las pruebas: `P1017 Server has closed the
connection`, un riesgo ya aceptado en D6 de `memory/decisiones-tecnicas.md`),
`update()` lanza `P2025` y tumba el request completo con 500 — el
heartbeat del IdleTimer y el logout automático dejan de funcionar para
esa sesión. Corregido usando `updateMany()` (nunca lanza si no hay
coincidencias, solo devuelve `count: 0`) — un heartbeat o logout contra
una sesión "fantasma" ahora es un no-op silencioso, no un crash.
Verificado con un script directo: `count: 1` + campo actualizado sobre
un jti real, `count: 0` sin excepción sobre un jti inexistente.

## Bug real encontrado y corregido en S1-6
El `matcher` de `src/proxy.ts` escrito en S1-5 (copiado del ejemplo oficial
de Auth.js: `/((?!api|_next/static|_next/image|favicon.ico).*)`) **no
excluye archivos estáticos arbitrarios de `public/`** (solo `favicon.ico`
puntualmente). Al agregar el logo en S1-6, el propio guard interceptaba
`GET /avicola-logo.png` (sin sesión, la redirige a `/login`) y por lo
tanto también la petición interna del optimizador de imágenes de Next
(`/_next/image?url=...`), que devolvía la página de login en vez del PNG
→ `400 The requested resource isn't a valid image`. Corregido excluyendo
del matcher cualquier ruta que termine en una extensión de imagen común
(`png|jpg|jpeg|gif|webp|svg|ico`). **Tenerlo presente en Sprint 13
(PWA e íconos/manifest)** — cualquier asset nuevo bajo `public/` con una
extensión no cubierta por ese patrón tendrá el mismo problema.

## Notas técnicas a verificar ANTES de escribir código (no asumir)
1. **proxy.ts vs middleware.ts (Next 16.2.12):** confirmar, contra la
   versión exacta de `next-auth@beta` que se instale, si ya documenta el
   export `proxy` o si hay que adaptar manualmente
   `export { auth as proxy }` desde `src/proxy.ts`. Correr
   `npx @next/codemod@canary middleware-to-proxy` si el proyecto llega a
   tener un `middleware.ts` generado por algún scaffold. Ver R1 en `spec.md`.
2. **`searchParams` async:** cualquier lectura de `searchParams` en
   `app/(public)/login/page.tsx` debe usar `await`. Ver R2 en `spec.md`.
3. **Heartbeat con throttle:** el cliente nunca pega al servidor más
   seguido que ~60s para actualizar `ultimaActividad`. Ver R3 en `spec.md`.
4. **`AUTH_SECRET`** (no `NEXTAUTH_SECRET`) como nombre de env var. Ver R4.

## Orden de ejecución (hay dependencias entre tareas)

1. **S1-1** (instalar Auth.js v5 + config base) → base de todo lo demás.
2. **S1-2** (CredentialsProvider + repository Usuario + Zod loginSchema)
   → depende de S1-1.
3. **S1-3** (callbacks jwt/session: rol, usuarioId, jti) → depende de S1-2.
4. **S1-4** (repository + service SesionActiva) → puede empezar en
   paralelo con S1-2, pero necesita cerrar junto con S1-3 (el `jti` del
   JWT debe coincidir con el `jti` guardado en SesionActiva al login).
5. **S1-5** (proxy.ts: guard binario autenticado/no autenticado) →
   depende de S1-3 (necesita leer el JWT).
6. **S1-6** (pantalla /login mobile-first) → depende de S1-2 (necesita
   `signIn` configurado); la maqueta visual con `components/ui/` puede
   avanzar antes, pero la integración real depende de S1-2.
7. **S1-7** (IdleTimer cliente + heartbeat) → depende de S1-4 (necesita
   el service de SesionActiva para actualizar `ultimaActividad` y
   consultar el estado idle) y de S1-6 (vive en el shell autenticado).
8. **S1-8** (Server Action de logout) → depende de S1-4.
9. **S1-9** (rate limiting Upstash) → independiente, puede arrancarse en
   paralelo desde el día 1 del sprint (no depende de Auth.js).
10. **S1-10** (tests unit + integración) → al final, cubre S1-2 a S1-9.

## Comandos de referencia

```bash
npm install next-auth@beta
npm install zod
npm install @upstash/ratelimit @upstash/redis
# bcryptjs ya está instalado desde Sprint 0 — no reinstalar
npx prisma studio    # verificar filas de SesionActiva durante pruebas manuales
```

## Variables de entorno necesarias (Vercel + local `.env`)

Los valores reales viven solo en `.env` local (no versionado) y en las
env vars del proyecto en Vercel — nunca en archivos de `specs/` o `memory/`.

```bash
AUTH_SECRET=              # generar con: npx auth secret
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

**Estado (2026-08-02): `UPSTASH_REDIS_REST_URL`/`TOKEN` todavía NO están
provisionados** — no existe cuenta/DB en Upstash todavía (decisión
explícita: avanzar el código de S1-9 sin probarlo en vivo, crear la
cuenta más adelante). `src/lib/rate-limit.ts` detecta la ausencia de
estas env vars y deja pasar todo sin límite (no bloquea nada) para no
tumbar el resto del desarrollo del sprint — **esto debe resolverse antes
de desplegar a producción**, agregarlo a la verificación final del
sprint.

## Estructura de archivos esperada (según `memory/arquitectura.md`)

```
src/
  app/
    (public)/login/page.tsx
    api/auth/[...nextauth]/route.ts
  server/
    auth/
      config.ts          # authConfig: providers, callbacks, session strategy
    actions/auth.ts       # logout, heartbeat de actividad
    services/sesion.ts    # lógica pura: ¿está idle? ¿está revocada?
    repositories/usuario.ts
    repositories/sesion.ts
  lib/
    zod/auth.ts           # loginSchema
    rate-limit.ts         # instancias de Ratelimit (Upstash)
  proxy.ts                 # ex-middleware.ts en Next 16 — guard binario
  components/
    domain/auth/
      login-form.tsx
      idle-timer.tsx
```

## Diseño del service `SesionActiva` (lógica pura, sin Prisma)

`server/services/sesion.ts` debe exponer funciones puras testeables sin
BD, por ejemplo:
- `estaExpiradaPorInactividad(ultimaActividad: Date, ahora: Date): boolean`
  — compara contra el umbral de 30 min. El wrapper de Server Actions
  (base de `withAuth()` de Sprint 2) llama a esta función con los datos
  ya leídos de `SesionActiva` por el repository.
- `debeMostrarAvisoIdle(ultimaActividad: Date, ahora: Date): boolean` —
  umbral de 28 min, usado del lado cliente si se decide resolver el aviso
  contra el reloj del servidor (evita depender solo del reloj del
  dispositivo del usuario).

El repository (`server/repositories/sesion.ts`) es el único lugar que
toca Prisma: `crear`, `buscarPorJti`, `actualizarUltimaActividad`,
`revocar`.

## Diseño del heartbeat (IdleTimer cliente)

- El cliente detecta actividad (mousemove/keydown/touchstart) pero NO
  golpea al servidor por cada evento — acumula y dispara como máximo
  una vez cada ~60s (debounce) o usa `navigator.sendBeacon` al momento
  de cerrar/cambiar de pestaña para no perder el último tick.
- El servidor es la fuente de verdad del tiempo transcurrido
  (`ultimaActividad` en `SesionActiva`), no el reloj del cliente — el
  cliente solo dispara el aviso visual a los 28 min como UX, pero el
  cierre real de sesión a los 30 min se valida server-side en la
  siguiente acción que el usuario intente (o vía el propio heartbeat
  al detectar que ya se pasó el umbral).

## Definition of Done aplicable a este sprint
Ver `memory/definition-of-done.md`. Puntos específicos de este sprint:
- La pantalla `/login` se prueba en viewport móvil real (o emulado) antes
  de cerrar S1-6 — primera pantalla de negocio real del proyecto, el
  punto de "probado en móvil" de la DoD ya aplica (a diferencia de
  Sprint 0).
- Ningún componente ni Server Action de este sprint importa Prisma
  directamente — solo `server/repositories/usuario.ts` y
  `server/repositories/sesion.ts`.
- Toda Server Action (`logout`, heartbeat) valida con Zod y verifica que
  exista una sesión antes de ejecutar nada, aunque `withAuth()` completo
  (con Zod + rol + AuditLog) recién se generaliza en Sprint 2.
