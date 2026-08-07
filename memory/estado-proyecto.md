# Estado del Proyecto — Bitácora de Ejecución

Este archivo se actualiza al cerrar cada sprint. A diferencia de los demás
archivos de `memory/` (que son la constitución, casi no cambian), este
documenta lo que REALMENTE pasó al construir — decisiones tomadas sobre
la marcha, problemas resueltos, y cualquier desvío del plan original.

Si retomas este proyecto en una sesión nueva (chat o terminal), lee este
archivo primero, después el roadmap en `specs/roadmap-completo.md`.

## Resumen ejecutivo
- **Sprint actual:** 3 de 16 completados (Sprint 0 — Cimientos, Sprint 1 —
  Autenticación y sesiones, Sprint 2 — RBAC, auditoría y shell)
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

## Upstash Redis — cuenta creada y verificada en vivo (cierre de Sprint 2, 2026-08-03)
El rate limiting de Sprint 1 (S1-9), integrado en código desde entonces
(`src/lib/rate-limit.ts`, usado desde `src/proxy.ts`), quedó **verificado
contra la cuenta real de Upstash** (`UPSTASH_REDIS_REST_URL`/`_TOKEN`
cargadas en `.env` local) durante el cierre de Sprint 2: 7 intentos de
login rápidos contra `/api/auth/*` con un mismo identificador dispararon
el bloqueo real a partir del 5to request dentro de la ventana de 1 min
(cada intento de login hace 2 requests a `/api/auth/*` — `GET /csrf` +
`POST /callback/credentials` —, ambos cuentan contra el mismo límite, así
que el bloqueo aparece antes que "6 intentos de login" en términos
humanos), con el cuerpo de respuesta esperado
(`{"error":"Demasiados intentos. Intenta de nuevo en 15 minutos."}`,
`HTTP 429`), aplicando incluso a una request con credenciales correctas
mientras dura el ban, y confirmado que el bloqueo es por identificador
(un `x-forwarded-for` distinto no fue afectado). Rate limiting real,
activo y probado end-to-end en local.

**Verificado también en producción real (2026-08-03):** el Product Owner
cargó las mismas credenciales como env vars del proyecto en Vercel
(Production + Preview; Development queda sin marcar a propósito — Vercel
no permite variables "Sensitive" ahí, y este proyecto no depende de
`vercel env pull` para desarrollo local, que ya lee su propio `.env`) y
disparó un redeploy manual. Repetido el mismo ataque contra
`https://avicola-mya.vercel.app`: bloqueo real con `429` y el mensaje
esperado a partir del 5to request. **Hallazgo no-bug, solo para
tenerlo presente:** en producción, intentar falsificar el identificador
con un header `x-forwarded-for` propio no tuvo ningún efecto — Vercel
sobrescribe ese header con la IP real detectada en su borde de red antes
de que la petición llegue a la app, así que `obtenerIdentificador()` en
`src/proxy.ts` (que confía en el primer valor de `x-forwarded-for`) es
más robusto en producción de lo que sería en un entorno que respete
headers de cliente sin sanear. En local (`curl` directo) sí es posible
declarar cualquier IP, pero ahí no hay superficie de ataque real. Rate
limiting confirmado end-to-end en local **y** producción — sin deuda
pendiente en este ítem.

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
- **Confirmado otra vez en Sprint 2** que `resize_window` no cambia el
  viewport lógico real en este entorno (dos screenshots idénticos
  antes/después de pedir 390×844) — no es intermitente, es un límite
  estable de la herramienta acá. La verificación mobile pixel a pixel de
  `/login` y del Shell terminó resolviéndose con el Product Owner
  probando directo desde su celular contra producción — ambas pantallas
  confirmadas OK. Ese es el camino a usar de nuevo si hace falta un
  chequeo visual mobile en sprints futuros, no reintentar `resize_window`.
- **Bug real de la extensión encontrado en Sprint 2:** editar un archivo
  de código (`Write`/`Edit`) mientras hay una sesión de browser activa
  interactuando con esa misma página puede dejar la pestaña "trabada"
  (screenshots y `get_page_text` fallan con timeout de inyección de
  script durante 1-2 minutos, aunque el propio servidor Next.js sigue
  respondiendo bien por `curl` en paralelo) — probablemente Fast
  Refresh/HMR recargando la página a mitad de una secuencia de acciones
  del navegador. Se resuelve solo esperando, o navegando a una URL nueva
  para forzar un reset de la pestaña. **Lección:** no editar el código
  que se está probando mientras una batería de acciones de browser está
  en curso sobre esa misma pantalla — pausar, editar, y recién después
  retomar las acciones del navegador.

## Identidad visual, shell y UX de mobile (post-Sprint 2, 2026-08-06)
**Esta sección reemplaza la anterior ("Identidad visual — pendiente"), que
quedó obsoleta: la paleta ya no está pospuesta, se definió y se retocó dos
veces.** Todo esto ocurrió después de cerrar Sprint 2 formalmente (commit
`74b9c9b`), en dos tandas: un commit propio (`a49d41a feat: identidad
visual, login y shell con Sidebar deslizable`) más una sesión larga de
ajuste fino de UX/frontend sobre el módulo de Usuarios que quedó sin
commitear hasta el cierre documentado más abajo. Se registra acá porque
tocó decisiones de arquitectura de UI que sprints futuros van a heredar
tal cual (no hay que repensarlas por pantalla).

### Paleta de color: regla 60-30-10
El naranja del logo (`--primary`, `#f4900f`) e inicialmente el ámbar
(`--secondary`) se usaban en TODO — títulos, franjas, y prácticamente
todos los botones (Nuevo usuario, Guardar, Editar compartían el mismo
ámbar). El Product Owner lo encontró "cargado". Se resolvió aplicando
60-30-10 (dominante neutro, secundario neutro, acento de marca solo en la
única CTA principal por pantalla + nav activo + focus + acentos
puntuales):
- Ámbar (`--secondary`) salió por completo de los botones — ya no se usa
  como `variant` de ningún botón del proyecto.
- Naranja (`--primary`) queda reservado a la acción principal de cada
  pantalla (`variant="default"`) y a la marca (Sidebar, focus ring).
- Acciones secundarias (Editar, Cancelar) usan `variant="outline"` —
  neutro, con hover que rellena el fondo (`hover:bg-muted`) para que el
  cambio se note al pasar el cursor (el hover de `secondary` era casi
  imperceptible).
- Los títulos de modal usan `text-foreground font-semibold` (no un color
  de marca): la primera versión probada usaba `text-primary` (naranja)
  directo sobre fondo blanco y fallaba contraste AA (~2.3:1 contra el
  4.5:1 exigido) — bug real de accesibilidad encontrado y corregido en el
  camino. El ícono del título usa `text-primary` como acento puntual.
  `DialogHeader` separa el título/descripción del cuerpo con un divisor
  delgado y neutro (`border-b border-border`), no una franja de color.

### Tamaño de botones: `size="md"` para pantallas de gestión
El tamaño `default` de `Button` (`h-12`, ≥48px) es intencional para
pantallas táctiles de campo (Operario, sol directo — ver comentario en
`ui/button.tsx`), pero se veía sobredimensionado en diálogos de gestión de
escritorio (Gerente). Se agregó `size="md"` (`h-10`, igual a la altura de
los `Input` del formulario) para ese contexto — `default`/`lg` siguen
siendo el estándar para pantallas operativas de campo en sprints futuros
(Producción, Ventas), no se tocaron.

### Sistema de toasts (`components/ui/toast.tsx`, nuevo)
Usa el primitivo `Toast` de `@base-ui/react` (misma librería que ya usan
`Dialog`/`Button`/`Input`/`Select` — cero dependencias nuevas). Un solo
`toastManager` (singleton a nivel de módulo, `createToastManager()`) + un
solo `<ToastProvider>` montado una vez en `layout.tsx`: cualquier
componente del proyecto dispara `toastManager.add({...})` sin volver a
montar nada. Plantilla única con 3 tipos semánticos (`success`/`error`/
`info`), fondo tintado por tipo (no una tarjeta blanca con acento — un
toast se lee de reojo, el color de fondo comunica el estado antes que el
texto), reusando paletas ya aprobadas en otras partes del proyecto (verde
del badge "Activo", `destructive/10` del botón "Desactivar", el par
`--accent`/`--accent-foreground` que existía sin usar). Conectado en los 4
flujos de Usuarios (crear, editar, activar, desactivar) como caso de
referencia para sprints futuros.

### Paginación de tablas de datos (`components/ui/data-table-pagination.tsx`, nuevo)
Server-side, dirigida por URL (`?page=N` + `skip`/`take` en el
repository), tamaño fijo de 10 filas, sin renderizarse si no hace falta.
Detalle completo del patrón (y por qué no se ata al tamaño del
dispositivo) en `memory/convenciones.md`, sección "Paginación de tablas de
datos" — cualquier módulo con listados grandes (Clientes en Sprint 8,
Ventas/Créditos en 9-11) lo hereda desde ahí.

### Nombre de usuario (`usuario`) ahora es editable
Sprint 2 lo había dejado fijo a propósito ("no editable después de
creado", ver `lib/zod/usuario.ts` original). Se revirtió esa decisión a
pedido del Product Owner: `editarUsuarioSchema` ahora exige `usuario`, la
action revalida unicidad contra el resto de la tabla (excluyendo al
propio `usuarioId`, para no fallar si se reenvía el mismo valor) con el
mismo patrón de `crearUsuario` (chequeo previo + catch de `P2002` para la
carrera entre dos ediciones simultáneas). 2 tests nuevos cubren unicidad
al editar.

### Shell mobile: Sidebar deslizable reemplaza a BottomNav, rutas planas
Estos dos cambios ya estaban hechos (commit `a49d41a` + trabajo posterior
sin commitear) al empezar esta sesión de frontend, pero **no estaban
reflejados en `specs/sprint-02-rbac-auditoria/`** — ya corregido ahí
(notas de actualización en spec.md/plan.md/tasks.md apuntando a
`server/auth/rbac.ts` como fuente de verdad):
- **`components/layout/bottom-nav.tsx` ya no existe.** El Shell mobile no
  es una barra fija abajo — es el mismo `AppSidebar` de desktop, que en
  mobile se abre como drawer (`Sheet` de Base UI) disparado por
  `MobileSidebarTrigger`.
- **Rutas planas, no prefijo `/gestion`/`/operacion`.** `/usuarios`, no
  `/gestion/usuarios`. `RUTAS_POR_ROL` en `rbac.ts` matchea por ruta
  exacta (`startsWith`), no por prefijo compartido — motivo documentado en
  el propio archivo.
- **`/login` ya no usa `Card`** — un grid a mano (dos paneles, uno a
  sangre completa con el color de marca), porque `Card` asume un solo
  bloque vertical apilado. `Card` no se usa en ningún lugar del proyecto
  todavía.

### Bugs reales encontrados y corregidos en esta sesión
1. **Título de modal en `text-primary` sobre fondo blanco fallaba
   contraste AA** (~2.3:1, ver arriba en "Paleta de color").
2. **`DialogContent` no tenía `max-h`/scroll interno** — un formulario más
   alto que el viewport de un celular quedaba cortado sin forma de llegar
   al resto (encontrado con "Nuevo usuario" en iPhone). Corregido:
   `max-h-[90dvh]` + `overflow-y-auto` en el Popup, `DialogFooter` con
   `sticky -bottom-4` para que el botón principal quede siempre visible
   mientras el resto del formulario se desplaza por detrás.
3. **`MobileSidebarTrigger` en `position: fixed` se superponía con el
   título de cada pantalla.** Corregido: vive en el flujo del nuevo
   `PageHeader` (`components/layout/page-header.tsx`), junto al título, no
   flotando encima.
4. **El botón de acción del header (p. ej. "Nuevo usuario") podía forzar
   scroll horizontal de toda la pantalla en mobile** — su texto no puede
   partirse en dos líneas (`whitespace-nowrap`, típico en botones).
   `PageHeader` es `flex-col` por defecto y recién pasa a fila desde
   640px (`sm:flex-row`), no `flex-wrap` sobre una sola fila.
5. **Doble contenedor de scroll horizontal anidado en las tablas.** El
   `Table` de shadcn ya traía su propio `<div overflow-x-auto>` interno;
   el `TableScrollArea` nuevo (que agrega una sombra cuando la tabla
   desborda) envolvía ese wrapper y nunca detectaba desborde porque medía
   el contenedor equivocado. Corregido quitando el wrapper de `Table`
   (`ui/table.tsx`) — `TableScrollArea` es ahora el único contenedor de
   scroll de toda tabla del proyecto.
6. **La sombra de "hay más para deslizar" usaba un degradé de color
   (`from-background to-transparent`) que no se distinguía sobre una
   tabla también blanca** — blanco sobre blanco no se ve. Reemplazado por
   una sombra interior (oscurece el borde sin depender del color de fondo
   real).
7. **En iPhone (Safari), la sombra del lado ya recorrido no desaparecía
   al llegar al final del scroll** (confirmado por el Product Owner en su
   celular real — en Android/Chrome funcionaba bien). Causa: el scroll con
   inercia de iOS puede disparar el evento `scroll` final un poco antes de
   que la posición se asiente en el máximo real; el margen de tolerancia
   de 1px no alcanzaba. Corregido: tolerancia subida a 4px + re-chequeo
   diferido 120ms después de cada evento de scroll (agarra la posición ya
   quieta) + listener de `scrollend` donde el navegador lo soporta.

### Verificación en dispositivos reales — limitación de herramienta, otra vez
Igual que en Sprints 1 y 2, `resize_window` de la extensión Claude in
Chrome no cambia el viewport lógico en este entorno. La mayoría de los
hallazgos de mobile de esta sesión (bugs #3, #4, #7 de arriba) se
confirmaron con capturas de pantalla reales que compartió el Product Owner
desde su celular, no con la herramienta de navegador. Camino a repetir en
sprints futuros si hace falta verificar diseño mobile pixel a pixel.

## Seguridad: revocar sesiones al resetear contraseña (2026-08-07)
Auditoría de seguridad pedida explícitamente por el Product Owner sobre
todo lo de la sesión de identidad visual/UX (sección de arriba) encontró
un hueco real: **editar un usuario y ponerle una contraseña nueva no
revocaba sus sesiones activas** — a diferencia de "Desactivar", que sí lo
hace desde Sprint 2 (`desactivarUsuarioYRevocarSesiones`). El motivo por
el que importa: el propio Product Owner cambió la contraseña de `gerente`
en producción justo porque el gestor de contraseñas de Chrome la marcó
como expuesta en una brecha — el objetivo de ese cambio es sacar a
cualquiera que pudiera tener acceso con la contraseña vieja, y sin
revocar sesiones esa protección quedaba incompleta (una sesión ya abierta
seguía viva hasta el logout automático por inactividad, 30 min).

**Corregido:** `actualizarUsuario()` en `server/repositories/usuario.ts`
ahora recibe también `ahora: Date` y, cuando `data.passwordHash` viene
seteado, envuelve el `update` del usuario junto con
`revocarSesionesPorUsuario(id, ahora)` en el mismo `prisma.$transaction`
(mismo patrón que `desactivarUsuarioYRevocarSesiones`). Si no se resetea
la contraseña (solo se edita nombre/celular/email), no se toca
`SesionActiva` — no tiene sentido desloguear al resto de sesiones por eso.
La función ahora devuelve un array (como cualquier `$transaction`), así
que `editarUsuario()` en `server/actions/usuario.ts` desestructura el
primer elemento.

**Verificado contra la base real** (no solo con mocks — no hay tests de
repository en este proyecto, ver ADR-000/convenciones.md, así que se
siguió el mismo criterio que ya se usó para verificar
`desactivarUsuarioYRevocarSesiones` en Sprint 2): se insertó una fila de
`SesionActiva` de prueba para `operario` con un script temporal, se llamó
a `actualizarUsuario()` real con `passwordHash` seteado, y la fila pasó de
`revocada: false` a `revocada: true` con `revocadaEn` seteado. Repetido el
caso negativo (sin `passwordHash`): la sesión de prueba quedó intacta.
Filas y scripts de prueba borrados al terminar. 3 tests de
`tests/integration/actions/usuario.test.ts` actualizados (mock de
`actualizarUsuario` ahora resuelve un array, no un objeto suelto).

**Efecto colateral a tener presente:** si un Gerente resetea su propia
contraseña estando logueado, esa acción revoca también su sesión actual —
va a tener que volver a loguearse con la contraseña nueva. Es el
comportamiento esperado (mismo criterio que la mayoría de apps con esta
protección), no un bug.

**Pendiente real, no de esta sesión:** sigue sin existir una pantalla de
"cambiar mi propia contraseña" — ver "Credenciales de desarrollo (seed)"
arriba. El único camino hoy para cambiar una contraseña es que un Gerente
la resetee desde Editar (la propia o la de otro usuario).

## Problemas encontrados y resueltos durante Sprint 2
1. **Diseño original ponía `prisma.$transaction(...)` dentro de la Server
   Action de desactivar usuario — violaba ADR-000** ("solo `repositories`
   importa Prisma"). Detectado antes de escribir código, al revisar el
   plan contra `memory/arquitectura.md`. Corregido: la transacción
   (`Usuario.estado` + revocar `SesionActiva`) vive en
   `desactivarUsuarioYRevocarSesiones()` dentro de
   `server/repositories/usuario.ts`; la action solo la invoca.
2. **`puedeDesactivarUsuario` tenía el chequeo de "último Gerente" después
   del de autodesactivación — la rama de "último Gerente" era código
   muerto en la práctica.** Quien invoca la action ya tiene que ser un
   Gerente ACTIVO (lo exige `withAuth` + el login rechaza `estado != ACTIVO`),
   así que si objetivo ≠ actual, `totalGerentesActivos` siempre cuenta a
   ambos (nunca ≤ 1) — el único caso real donde "último Gerente" aplica es
   la autodesactivación del propio último Gerente activo, y el chequeo
   viejo la interceptaba antes con el mensaje genérico. Corregido
   invirtiendo el orden. Verificado en vivo con dos Gerentes reales: sólo
   con uno activo, autodesactivarse muestra "Debe quedar al menos un
   Gerente activo."; con dos activos, muestra el mensaje genérico.
3. **`UsuarioFormDialog` disparaba una advertencia real de Base UI en
   consola al guardar una edición** ("changing default value ... after
   being initialized"). Causa: Base UI mantiene el contenido del `Dialog`
   montado durante su animación de cierre; `setOpen(false)` +
   `router.refresh()` casi simultáneos hacían que las props nuevas
   llegaran a inputs no controlados todavía montados. Corregido gateando
   el `<form>` detrás de `{open ? (...) : null}` para que se desmonte en
   el mismo tick en que `open` pasa a `false`. Verificado: mismo flujo
   repetido tras el fix, cero mensajes en consola.
4. **Editar código fuente mientras una sesión de browser está interactuando
   con esa misma pantalla puede trabar la pestaña** (Fast Refresh/HMR
   recarga a mitad de una secuencia de clics) — ver detalle en
   "Herramientas y configuración del entorno" arriba.

## Cómo continuar desde acá
1. Sprint 3 (Galpones, Lotes y Mudanzas) es el siguiente. Su `spec.md` aún
   no existe — generarlo usando `specs/roadmap-completo.md` (sección
   Sprint 3) + este archivo + el resto de `memory/` como contexto. Usar
   `specs/sprint-02-rbac-auditoria/` como referencia de estructura más
   reciente (incluye el patrón de verificación en vivo con navegador +
   script + curl que se consolidó en Sprint 2).
2. Toda Server Action nueva que mute datos debe envolverse con
   `withAuth(config, handler)` (`server/auth/with-auth.ts`, Sprint 2) — es
   la pieza de mayor apalancamiento del proyecto, ya trae auth + rol + Zod
   + AuditLog automático. No reinventar ese chequeo a mano.
3. El guard por rol de rutas nuevas se resuelve agregando el prefijo a
   `RUTAS_POR_ROL` en `server/auth/rbac.ts` — no escribir lógica de rol
   nueva en `proxy.ts` directamente.
4. Cualquier link de navegación nuevo (pantallas de Sprint 3 en adelante)
   se agrega a `NAV_ITEMS` en `components/layout/nav-items.ts` — el Shell
   ya filtra automáticamente por rol contra `rolPermitidoParaRuta()`, no
   hace falta tocar `Sidebar` (ya no existe `BottomNav`, ver sección
   "Identidad visual, shell y UX de mobile" más abajo). Toda pantalla
   nueva usa `<PageHeader title=... actions=... />` en vez de armar un
   `<h1>` a mano — si no lo usa, se queda sin forma de abrir el Sidebar en
   mobile. Toda tabla ancha usa `<TableScrollArea>`, no un
   `<div overflow-x-auto>` a mano.
5. Mantener el mismo patrón de Sprints 0-2: ejecutar tarea por tarea,
   verificar en código real (no solo tests) antes de marcar como completa.
   Cuando la extensión Claude in Chrome esté conectada, no editar archivos
   de código mientras hay una batería de acciones de browser en curso
   sobre la misma pantalla (ver punto 4 de "Problemas... Sprint 2").

## Registro de cierre de sprints
- **Sprint 0** — cerrado. 10/10 tareas completas y verificadas. Deploy
  funcionando en producción. Sin deuda técnica pendiente conocida.
- **Sprint 1** — cerrado (2026-08-02), deuda pendiente resuelta por
  completo al cerrar Sprint 2 (2026-08-03). 10/10 tareas completas, 24
  tests (unit + integración), verificado en código real contra servidor
  limpio y en producción (no solo tests) — login, logout, idle timeout,
  guard de sesión y creación de logo confirmados end-to-end. Commit
  `4cf67ee`, pusheado y desplegado. 5 bugs reales encontrados y corregidos
  en el camino (detalle arriba en "Problemas encontrados... Sprint 1").
  Los dos ítems que habían quedado pendientes (rate limiting contra
  Upstash real, `/login` en viewport móvil real) se cerraron ambos al
  cerrar Sprint 2 — ver esa entrada abajo.
- **Sprint 2** — cerrado (2026-08-03). 11/11 tareas completas, 65 tests
  (unit + integración), verificado en navegador real contra servidor
  limpio y en producción (no solo tests): guard por rol (403 real a un
  Operario), CRUD de usuarios completo clic a clic (crear con rol elegido,
  editar, activar/desactivar), revocación real de `SesionActiva` al
  desactivar (confirmada contra Neon), ambas ramas de la guard de
  "último Gerente"/autodesactivación, Shell sin el placeholder de logout
  duplicado, y una fila real de `AuditLog` verificada contra Neon. 3 bugs
  reales encontrados y corregidos en el camino (detalle arriba en
  "Problemas encontrados... Sprint 2"). De paso, se cerró también la
  deuda pendiente de Sprint 1: rate limiting de Upstash verificado en vivo
  contra cuenta real, en local y en producción (con un hallazgo no-bug
  sobre cómo Vercel sanea `x-forwarded-for` en su borde de red), y
  `/login` + el Shell verificados en viewport móvil real (celular físico
  del Product Owner) — sin deuda pendiente conocida al cerrar este sprint.

## Cierre de cabos sueltos post-Sprint 2 (2026-08-03)
Al re-verificar el estado de Sprints 0-2 en una sesión nueva (typecheck,
lint, `prisma validate` y los 65 tests, todos en verde de forma independiente,
no solo releyendo la bitácora) quedaban dos cabos sueltos sin cerrar
formalmente:
1. El checkbox de viewport móvil de `/login` en
   `specs/sprint-01-autenticacion/tasks.md` seguía sin tildar pese a que el
   trabajo ya estaba resuelto (celular real del Product Owner, ver arriba) —
   tildado ahora.
2. La decisión pendiente de `.prettierrc.json` (`singleQuote: true` vs. el
   100% del código real en comillas dobles, documentada en el cierre de
   Sprint 2). **Resuelto:** se cambió `singleQuote` a `false` para que el
   config coincida con el código real (el código ya escrito es la fuente de
   verdad, no al revés) y se corrió `prettier --write` sobre `src/`, `tests/`,
   `prisma/seed.ts` y `next.config.ts` (no sobre `memory/`/`specs/*.md` —
   reformatear prosa markdown con Prettier reflowa párrafos completos y no
   es lo que estaba en discusión). Typecheck, lint y los 65 tests se
   corrieron de nuevo después del reformateo y siguen en verde. Sin deuda
   pendiente conocida en Sprints 0, 1 y 2 después de este cierre.