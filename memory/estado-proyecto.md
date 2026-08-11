# Estado del Proyecto — Bitácora de Ejecución

Este archivo se actualiza al cerrar cada sprint. A diferencia de los demás
archivos de `memory/` (que son la constitución, casi no cambian), este
documenta lo que REALMENTE pasó al construir — decisiones tomadas sobre
la marcha, problemas resueltos, y cualquier desvío del plan original.

Si retomas este proyecto en una sesión nueva (chat o terminal), lee este
archivo primero, después el roadmap en `specs/roadmap-completo.md`.

## Resumen ejecutivo
- **Sprint actual:** 6 de 16 completados (Sprint 0 — Cimientos, Sprint 1 —
  Autenticación y sesiones, Sprint 2 — RBAC, auditoría y shell, Sprint 3 —
  Galpones, Lotes y Mudanzas, Sprint 4 — Mortalidad y Bitácora, Sprint 5 —
  Recolección e Inventario)
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

## Sprint 3 — Galpones, Lotes y Mudanzas (cerrado, 2026-08-07)
13/13 tareas completas (S3-1 a S3-13), 108 tests (44 nuevos: 15 unit +
29 integración, sobre los 64 heredados de Sprint 2), verificado en código
real contra Neon (scripts temporales, no solo mocks) y contra servidor
real vía curl+cookie jar (no navegador esta vez — decisión explícita, ver
más abajo). `specs/sprint-03-galpones-lotes-mudanzas/` tiene el detalle
completo (spec.md, plan.md, tasks.md con cada tarea documentada al
cerrarla).

**Decisiones de negocio confirmadas por el Product Owner antes de
ejecutar** (preguntadas explícitamente porque el roadmap no las
resolvía, siguiendo `definition-of-ready.md`):
1. `Galpon.capacidadMaxima` mide aves vivas totales, sumando todos los
   lotes que el galpón aloje a la vez — un galpón puede alojar más de un
   lote simultáneo.
2. Se agregó `estado` a `Galpon` (no existía en el schema desde Sprint 0)
   para soft-delete, igual que `Usuario`/`Lote`.
3. Solo lotes `ACTIVO` pueden mudarse; `avesVivas` puede ser cualquier
   valor ≥0, incluido 0.
4. Finalizar un lote no depende de `avesVivas` — se puede finalizar en
   cualquier momento (venta/retiro total, no solo mortalidad completa).

**Corolarios de diseño documentados en spec.md** (no preguntados de
nuevo, pero dejados explícitos para que el Product Owner pudiera
objetarlos): finalizar un lote también cierra su ubicación abierta en la
misma transacción; un galpón no puede desactivarse mientras aloje algún
lote; la capacidad máxima de un galpón no se puede editar por debajo de
su ocupación actual; `Galpon.nombre` quedó sin `@unique` (nada lo pedía);
`/galpones` y `/lotes` restringidas a GERENTE (mismo criterio que
`/usuarios`).

**Migración de schema:** `enum EstadoGalpon` + `Galpon.estado` (default
ACTIVO) + índice, migración `20260807161831_galpon_estado`, no
destructiva (`ADD COLUMN ... DEFAULT 'ACTIVO'`).

**Sin bugs de código encontrados en este sprint** (a diferencia de los
Sprints 1 y 2, que sí encontraron bugs reales) — sí hubo dos ajustes
menores no anticipados en el plan original, ambos resueltos en el
momento: `estadoDespues` de `AuditLog` no acepta `Date` crudo (Prisma
exige `InputJsonValue`), se serializa con `.toISOString()`; y se agregó
un `npm run build` de verificación en S3-9 (además de `tsc --noEmit`)
para confirmar que ningún import de servidor se filtraba a un componente
cliente a través del límite de RSC.

**Hallazgo no-bug real durante la verificación final (S3-13):** la
cuenta sembrada `gerente`/`Cambiar123!` ya **no** sirve para loguearse
contra la base real — confirma en la práctica lo que
"Seguridad: revocar sesiones al resetear contraseña" (más abajo) ya
documentaba: el Product Owner rotó esa contraseña en producción. La
verificación de 403 de este sprint se hizo con un Gerente y un Operario
**temporales** (creados y borrados con un script, mismo criterio que
Sprint 2 usó para no tocar cuentas reales), no con la cuenta sembrada.

**Verificado en vivo contra Neon real** (script temporal, borrado al
terminar): transacción de alta de lote (Lote + primera
`HistorialUbicacionLote`), transacción de mudanza (cierra la fila vieja
+ abre la nueva), y — el hallazgo más importante de esta verificación —
el índice único parcial de `HistorialUbicacionLote` creado en Sprint 0
(S0-5) **sigue vigente**: un intento directo de abrir una segunda
ubicación abierta para el mismo lote, sin pasar por el repository, fue
rechazado por la base. También se ejercitaron las guards de capacidad y
de "galpón ocupado" con números de ocupación reales (no simulados), y se
verificó una fila real de `AuditLog` con `entidad: "Lote"`.

**Pendiente explícito, no resuelto en esta sesión:** verificación clic a
clic en navegador real de `/galpones` y `/lotes` (crear, mudar,
finalizar) — se optó por scripts contra Neon real en vez de la extensión
Claude in Chrome. La lógica de negocio ya está probada (tests +
verificación de Neon real arriba); lo que falta confirmar es
específicamente la experiencia de UI (diálogos, toasts, refresco de
tabla). Repetir el mismo camino que Sprints 1-2 usaron para el viewport
móvil si hace falta cerrarlo: sesión con la extensión conectada, o
Product Owner probando contra `npm run dev`/producción.

`memory/definition-of-done.md` sigue sin existir — tercer sprint seguido
que lo señala (Sprint 2 ya lo había encontrado). Si se sigue postergando,
vale la pena decidir explícitamente si alguna vez se va a crear o si
`CLAUDE.md` + este archivo son de hecho el DoD del proyecto.

## Edad del lote en semanas (post-Sprint 3, 2026-08-07)
A pedido del Product Owner (el cliente quería ver de un vistazo cuántas
semanas tiene cada lote), se agregó **después** de cerrar Sprint 3, sin
abrir un sprint nuevo del roadmap — mismo criterio que "Identidad visual"
y "Seguridad" más abajo: un cambio real pero puntual se documenta acá con
fecha, no en una carpeta `specs/sprint-XX` nueva.

**Decisiones de negocio confirmadas por el Product Owner antes de tocar
el schema** (las tres, con la opción recomendada elegida en los tres
casos):
1. La "edad inicial" que se carga al dar de alta un lote es la edad real
   de las aves en semanas al momento de `fechaIngreso` — no siempre 0,
   cubre comprar aves ya crecidas (recría), no solo pollitos de un día.
2. Al finalizar un lote, la edad mostrada se **congela** en la fecha de
   finalización — no sigue avanzando después.
3. Se muestra en semanas completas (parte entera, sin días sueltos).

**Schema:** `Lote.edadInicialSemanas Int @default(0)`, migración
`20260807173922_lote_edad_inicial_semanas` (no destructiva). **La "edad
actual" nunca se guarda** — ver el principio nuevo "Campos calculados"
en `memory/modelo-datos.md`, que este cambio también actualizó (y de
paso corrigió que el `Galpon.estado` de Sprint 3 no había quedado
documentado ahí — la convención de "actualizar modelo-datos.md en el
mismo cambio" se venía incumpliendo desde ese sprint).

**Cómo se resuelve el congelamiento sin agregar un campo
`fechaFinalizacion`:** se reutiliza algo que ya existía.
`listarLotesConUbicacion()` (`server/repositories/lote.ts`) antes solo
traía la fila *abierta* de `HistorialUbicacionLote` (`fechaSalida:
null`); se cambió para traer siempre la **última** fila por
`fechaEntrada` (abierta o cerrada, `take: 1`). Para un lote ACTIVO no
cambia nada (la última fila siempre es la abierta, por el índice único
parcial de S0-5); para uno INACTIVO, esa fila cerrada es la que
`finalizarLote()` dejó al cerrar la ubicación — su `fechaSalida` es
exactamente el momento de finalización. `LotesTabla` tuvo que ajustarse
para distinguir "última fila = ubicación real" de "última fila cerrada =
lote finalizado" (antes lo distinguía por si el array venía vacío o no;
ahora siempre viene con una fila, hay que mirar `fechaSalida === null`).

**Dónde vive el cálculo:** `calcularEdadEnSemanas()`
(`server/services/lote.ts`) es una función pura — recibe
`edadInicialSemanas`, `fechaIngreso` y `fechaReferencia` (quien llama
decide cuál usar, no la función), devuelve semanas completas
(`Math.floor`). Se invoca desde `app/(app)/lotes/page.tsx` (Server
Component), no en el cliente — evita repetir lógica de fechas en un
componente `"use client"` y mantiene la hora del servidor como fuente de
verdad (D5, América/Lima).

**Tocado:** migración de schema; `lib/zod/lote.ts` (`edadInicialSemanas`
en `crearLoteSchema`); `server/repositories/lote.ts` (`crearLoteConUbicacion`
guarda el campo, `listarLotesConUbicacion` cambia de forma);
`server/actions/lote.ts` (`estadoDespues` de `crearLote` lo incluye para
`AuditLog`); `LoteFormDialog` (campo nuevo "Edad inicial (semanas)",
precargado en 0); `LotesTabla` (columna nueva "Edad", más el ajuste de
"última fila" de arriba); `tests/factories/lote.factory.ts`;
`tests/integration/actions/lote.test.ts` (el `inputValido` de `crearLote`
necesitaba el campo nuevo — Zod lo exige); 5 tests unitarios nuevos de
`calcularEdadEnSemanas` (semana 0, piso no redondeo, edad inicial > 0,
guarda defensiva contra fechas invertidas, y el caso de congelamiento).
113/113 tests en verde, `npm run build` limpio, verificado además contra
Neon real con un script temporal (creación con `edadInicialSemanas: 10`
hace ~20 días simulados, cálculo en vivo, finalización y confirmación de
que la fila queda cerrada — datos de prueba borrados al terminar).

**Un detalle real encontrado durante la propia verificación (no un bug,
un error mío armando los datos de prueba):** un script temporal de
verificación incluía una aserción de contraste ("sin congelar, la edad
seguiría subiendo") que falló por elegir offsets de días (15 y 20) que
caen en la misma semana completa (`Math.floor(15/7) ==
Math.floor(20/7) == 2`) — no revela ningún problema en
`calcularEdadEnSemanas` (ya cubierto con precisión por los tests
unitarios), solo que esa aserción puntual del script descartable no
separaba bien los casos. Se descartó esa aserción, no el hallazgo
principal (que sí pasó).

## Bugs reales reportados por el Product Owner tras probar en vivo (2026-08-07)
Al usar "Nuevo lote"/"Mudar lote" contra la base real (con los galpones
sembrados en `prisma/seed.ts`, no datos creados con `crypto.randomUUID()`
como en los tests), aparecieron dos bugs reales que ningún test había
agarrado — los dos se corrigieron en la misma sesión.

### Bug 1 — El `<Select>` de galpón no dejaba guardar ("Seleccioná un galpón" pegado)
**Causa raíz:** `z.string().uuid()` en Zod v4 exige que el string cumpla
estrictamente el nibble de versión/variante de RFC4122. Los ids
sembrados en `prisma/seed.ts` para `Galpon` (y también
`CLIENTE_PUBLICO_GENERAL_ID` en `lib/constants.ts`, mismo patrón,
todavía no probado por ningún `.uuid()` — es el mismo landmine, va a
explotar en cuanto un sprint futuro valide `clienteId`) son constantes
fijas legibles tipo `"00000000-0000-0000-0000-000000000101"`, no
generadas con `crypto.randomUUID()` — no tienen ese nibble en rango
válido, así que Zod las rechazaba pese a ser ids reales y existentes en
la base. Nadie lo había notado antes porque Sprint 3 es el primer lugar
del proyecto que valida un id de este tipo con `.uuid()`.
**Corregido:** `lib/zod/comun.ts` (nuevo) exporta `idUuid()` — valida la
FORMA de un UUID (8-4-4-4-12 hex) sin exigir el nibble RFC4122 estricto.
Reemplaza `z.string().uuid()` en los tres schemas que lo usaban
(`usuario.ts`, `galpon.ts`, `lote.ts`). Verificado con Zod real, en un
script y en un test unitario nuevo, que los ids reales del seed ahora sí
pasan.

### Bug 2 — El `<Select>` de galpón mostraba el UUID crudo en vez del nombre
**Causa raíz** (confirmada leyendo el código fuente de
`@base-ui/react`, no adivinada): `<SelectValue>` sin `children` explícito
resuelve la etiqueta visible buscando el valor seleccionado en una lista
interna de ítems que Base UI arma sola (`resolveSelectedLabel()` en
`internals/resolveValueLabel.mjs`); si esa lista no tiene el ítem
registrado en ese momento, cae en un *fallback* que devuelve el `value`
crudo tal cual (`stringifyAsLabel` → `serializeValue(item)`).
**Corregido:** los `<Select>` de galpón (`LoteFormDialog`,
`MudanzaDialog`) ahora son controlados (`value` + `onValueChange` con
`useState` propio) y `<SelectValue>` recibe la etiqueta ya resuelta
como `children` (`galponesActivos.find(...)?.nombre`), sin depender de
la resolución interna de Base UI. El `<Select>` de rol en
`UsuarioFormDialog` no tenía este problema en la práctica (su `value` ya
es texto legible, "OPERARIO"/"GERENTE", así que el *fallback* nunca se
notaba visualmente) — no se tocó.

### Bug 3 — El error de validación quedaba pegado al reabrir un modal ya cerrado
Encontrado al leer el código mientras se investigaba el Bug 1 (el
Product Owner lo reportó para "Nuevo galpón", pero el mismo patrón
existía en los cuatro dialogs de formulario del proyecto, heredado desde
`UsuarioFormDialog` de Sprint 2). **Causa raíz:** `useActionState` vivía
en el componente que renderiza el `<Dialog>`, que **nunca se desmonta**
al cerrar el modal (solo `open` pasa a `false`) — su `state` (con el
error de la tanda anterior) sobrevivía intacto a un cierre/apertura,
así que el mensaje viejo reaparecía sin que el usuario tocara nada.
**Corregido en los cuatro:** `UsuarioFormDialog`, `GalponFormDialog`,
`LoteFormDialog`, `MudanzaDialog` — el formulario (con su propio
`useActionState`) se movió a un subcomponente que solo se renderiza
mientras `open` es `true`; al cerrar el modal, React lo desmonta de
verdad, y la próxima apertura lo monta de cero con `state: undefined`.
De paso, esto también deja resuelta de forma más prolija la advertencia
de Base UI que `UsuarioFormDialog` ya evitaba a mano en Sprint 2
(inputs no controlados recibiendo props nuevas mientras el modal
todavía cierra) — ahora ningún input de ningún dialog de formulario
puede quedar montado después de que `open` pasa a `false`.

**Verificado:** 117/117 tests (4 nuevos para `idUuid`), `npm run build`
limpio, y `crearLoteSchema.safeParse(...)` probado en vivo con el id
real de "Galpón 2" del seed (antes rechazado, ahora aceptado). La
verificación visual de los tres (clic a clic, confirmando que el
nombre se ve bien y que el modal no arrastra el error viejo) queda
para que el Product Owner la confirme en su navegador — no se hizo con
la extensión Claude in Chrome en esta sesión.

## Bug 4 — fechaIngreso de un lote aceptaba fechas futuras (2026-08-07)
El Product Owner notó que "Nuevo lote" dejaba elegir una fecha de
ingreso posterior a hoy — confirmado leyendo el código antes de tocar
nada: ni el `<input type="date">` (sin `max`) ni `crearLoteSchema`
(`z.coerce.date()` sin ningún tope) lo impedían.
**Decisión confirmada por el Product Owner:** el campo sigue editable
(no fijo en "hoy" — el Gerente puede cargar con atraso un lote que
ingresó ayer), pero con tope: no se puede elegir una fecha futura.
**Corregido en dos capas:**
- `lib/zod/lote.ts` (`crearLoteSchema`): `.refine()` que compara contra
  "hoy en América/Lima" (D5), no contra un `Date` crudo del servidor —
  comparar en UTC directo haría que las primeras horas de un día en UTC
  (todavía "ayer" en Lima, UTC-5) rechacen por error una fecha que en
  Lima sigue siendo hoy. Esta es la validación real/autoritativa.
- `LoteFormDialog`: `max` en el `<input type="date">`, calculado igual
  (América/Lima) pero con el reloj del navegador — comodidad de UX
  (evita el viaje de ida y vuelta de un error en el caso común), no la
  guardia real.
**Tests nuevos:** `tests/unit/lib/zod-lote.test.ts` — hoy pasa, pasado
pasa, futuro se rechaza con el mensaje esperado, y un caso límite
explícito de huso horario (reloj del servidor ya cruzó la medianoche UTC
pero en Lima sigue siendo el día anterior — confirma que la comparación
usa Lima, no UTC crudo). Se ajustó además el `fechaIngreso` fijo que
usaban los tests de integración existentes de `crearLote`
(`tests/integration/actions/lote.test.ts`), que quedaba pegado al mismo
instante que su reloj simulado (`AHORA`) y por lo tanto corría riesgo de
caer del lado equivocado de ese mismo borde de zona horaria. 121/121
tests en verde, `npm run build` limpio.

## Badge "Activo" pasa de verde a amber (2026-08-07)
A pedido del Product Owner, por consistencia de marca. **Reemplaza** lo
que decía la sección "Identidad visual, shell y UX de mobile" más arriba
(2026-08-06) sobre el verde del badge "Activo" — se deja esa sección tal
cual como registro histórico de esa sesión, no se reescribe (mismo
criterio que `decisiones-tecnicas.md`); esta nota es la fuente de verdad
vigente.
- `.badge-estado-activo` (`globals.css`) pasa de verde a amber
  (`amber-100`/`amber-300`/`amber-800`, con variantes dark). Se agregó
  borde a propósito (ya lo tenía; se mantiene) — el pedido explícito era
  que ambos estados ("Activo"/"Inactivo") se vean con el mismo
  tratamiento de borde, no que uno tenga y el otro no.
- **No se usó `bg-secondary`/`border-secondary`** (el amber de marca
  real, `--secondary`) a propósito: en dark mode `--secondary` es un gris
  neutro (nunca se retocó para mantener el amber ahí, ver `:root`/`.dark`
  en `globals.css`) — usar el token directo hubiera hecho que "Activo" se
  vea idéntico a "Inactivo" en dark mode. Se usan clases de Tailwind
  amber explícitas en su lugar, mismo criterio que ya usa `.toast-success`
  con verde.
- **`usuarios-tabla.tsx` dejó de tener su propio verde suelto** (deuda
  documentada desde el cierre de Sprint 3 — el badge de Usuario nunca
  había migrado a una clase de `globals.css`) y ahora usa
  `.badge-estado-activo`/`.badge-estado-inactivo`, las mismas que ya
  usaban Galpón y Lote desde que se crearon. Las tres tablas comparten
  exactamente la misma receta de estado desde acá — un solo lugar para
  cambiarla en el futuro, no tres.
- Galpón y Lote **no necesitaron ningún cambio de código** — ya apuntaban
  a esas clases compartidas (verificado leyendo el código antes de tocar
  nada), así que el cambio de color en `globals.css` les llegó solo.
`.toast-success` se queda verde a propósito (no se tocó): "operación
exitosa" es una señal distinta de "este registro está activo", no tenían
por qué compartir tono, y de hecho ya no lo comparten literalmente desde
este cambio (antes el comentario de `globals.css` decía que reusaba el
verde del badge Activo — ese comentario se corrigió, quedaba desactualizado).
121/121 tests, `npm run build` limpio.

## Corrección: "Inactivo" se veía amber igual que "Activo" (2026-08-07, mismo día)
El Product Owner reportó, con captura, que los tres badges (dos
"Activo" y uno "Inactivo") se veían del mismo amber — el cambio de
arriba no había funcionado como se esperaba para INACTIVO.

**Causa raíz (no cosmética, de Tailwind v4):** `.badge-estado-activo`/
`.badge-estado-inactivo` viven en `@layer components`, pero siempre se
usan junto con `<Badge variant="...">` (`ui/badge.tsx`), que ya trae sus
propias utilidades de fondo/texto/borde según el `variant` — por ejemplo
`variant="secondary"` trae `bg-secondary`, un amber de marca casi
indistinguible del nuevo `.badge-estado-activo` (por eso el bug pasó
desapercibido justo para ACTIVO, y solo saltó a la vista con INACTIVO,
que sí debía verse gris). En Tailwind v4, `@layer utilities` **siempre**
gana sobre `@layer components` con la misma especificidad, sin importar
el orden en el `className` — y `twMerge` (`lib/utils.ts`) tampoco lo
arbitra, porque no reconoce `.badge-estado-activo`/`.badge-estado-inactivo`
como utilidades de Tailwind (solo sabe deduplicar utilidades reales tipo
`bg-*`). Resultado: `bg-secondary` del `variant` le ganaba a `bg-muted`
de `.badge-estado-inactivo` siempre, así que INACTIVO nunca mostró gris
desde que se creó esa clase en Sprint 3 — no es un bug de hoy, es un bug
que existía desde el principio y nadie había mirado con atención hasta
ahora.

**Corregido:** las dos clases ahora marcan cada utilidad con `!`
(important, sintaxis de Tailwind v4 — mismo patrón que ya usaba
`ui/badge.tsx` para el tamaño del ícono, `size-4!`), forzándolas a ganar
sin importar el `variant` del `Badge`.

**Bug real que yo mismo introduje arreglando esto, encontrado por el
navegador (página en blanco, no en los tests):** el comentario nuevo que
documentaba el porqué del `!` incluía el texto `bg-*/text-*/border-*` —
la secuencia `*/` cierra un comentario CSS antes de tiempo, así que
`globals.css` quedó con sintaxis inválida (Next tiraba "Parsing CSS
source code failed") y `/login`, `/usuarios`, etc. renderizaban en
blanco. `npm run build`/`typecheck`/`test` no lo agarran porque ninguno
parsea CSS — solo se vio al levantar el navegador. **Lección:** un
comentario CSS nunca puede contener la secuencia literal `*/`, ni por
accidente en prosa explicando código (`bg-*` seguido de `/text-*` la
genera). Corregido reescribiendo esa frase sin barras.

**Verificado de verdad esta vez, en el navegador real** (no solo
leyendo el código, después de que la vez anterior eso no alcanzó):
`/usuarios`, `/galpones` y `/lotes` con capturas confirmando Activo
amber con borde e Inactivo gris con borde, claramente distintos, en
las tres tablas. Usuarios de prueba (`gerente.test.badges`,
`operario.test.inactivo`, este último creado directo en INACTIVO para
no depender de hacer clic en "Desactivar") borrados al terminar, mismo
criterio de siempre. 121/121 tests y `npm run build` siguen en verde
después del arreglo del comentario.

## Pregunta del Product Owner: ¿se puede limpiar la base antes de entregar a producción?
Sí, pero con una salvedad importante que ya está documentada como riesgo
sin resolver desde Sprint 1 (**"Riesgo operativo: local y producción
comparten la misma base de datos"**, más arriba): hoy `DATABASE_URL`/
`DIRECT_URL` local apunta al **mismo** Neon que usa Vercel en producción.
No hay un entorno de pruebas separado de producción todavía — así que
"limpiar los datos de prueba" hecho desde acá borraría lo mismo que
vería un cliente real en producción, porque literalmente es la misma
base. **Antes de cargar datos reales de la granja, hay que separar los
branches dev/main de Neon** (pendiente desde Sprint 1, nunca
priorizado). Una vez separados:
- **Se puede borrar sin drama:** los 3 galpones demo (Galpón 1/2/3) y
  `LOTE-DEMO-01` sembrados en `prisma/seed.ts`, cualquier usuario de
  prueba, y el precio demo de `PrecioKilo`.
- **No se borra, se resiembra igual:** el Gerente real (con su propia
  contraseña, no la de desarrollo) y el Cliente "Público General"
  (`CLIENTE_PUBLICO_GENERAL_ID`) — ese no es dato de prueba, es un
  registro fijo que el sistema necesita para ventas de mostrador sin
  cliente registrado, tiene que existir también en producción.

## Cómo continuar desde acá
1. Sprint 6 (Ventana de gracia y reversión) es el siguiente — roadmap lo
   marca 28 pts, sin advertencia de riesgo especial (a diferencia de
   Sprint 5). Su `spec.md` aún no existe — generarlo usando
   `specs/roadmap-completo.md` (sección Sprint 6) + este archivo + el
   resto de `memory/` como contexto. Usar
   `specs/sprint-05-recoleccion-inventario/` como referencia de
   estructura más reciente. Piezas que Sprint 5 ya dejó preparadas y que
   Sprint 6 va a necesitar: `RegistroRecoleccion.revertido`/`creadoEn` ya
   existen en el schema (sin migración nueva esperada); el patrón de
   idempotencia por `create`+captura de `P2002`
   (`server/repositories/recoleccion.ts`/`server/actions/recoleccion.ts`)
   es el precedente a reusar si la reversión también necesita
   idempotencia; `TipoMovimientoSueltos.REVERSION` existe en el enum pero
   `reconstruirSaldo()` (`server/services/inventario.ts`) todavía no lo
   suma/resta — ese signo hay que resolverlo en este sprint, no asumido
   de antes. **Antes de arrancar, revisar el pendiente que dejó el cierre
   de Sprint 5**: auditar si Usuarios/Galpones/Lotes/Bitácora/Mortalidad
   pueden duplicar un registro ante un doble clic o un reintento de red
   (ninguno tiene protección de idempotencia por id de cliente) — pedido
   explícito del Product Owner, ver "Sprint 5 — Recolección e Inventario
   (cerrado, 2026-08-11)" más abajo para el detalle completo.
2. Toda Server Action nueva que **mute** datos debe envolverse con
   `withAuth(config, handler)` (`server/auth/with-auth.ts`, Sprint 2) — es
   la pieza de mayor apalancamiento del proyecto, ya trae auth + rol + Zod
   + AuditLog automático. No reinventar ese chequeo a mano. Una lectura
   adicional disparada desde un Client Component (scroll infinito,
   Sprint 4) NO pasa por `withAuth` — ver `memory/convenciones.md`,
   sección "Server Actions", y `server/actions/bitacora.ts`
   (`obtenerMasBitacora`) como referencia.
3. El guard por rol de rutas nuevas se resuelve agregando el prefijo a
   `RUTAS_POR_ROL` en `server/auth/rbac.ts` — no escribir lógica de rol
   nueva en `proxy.ts` directamente. **No toda pantalla nueva necesita
   entrada ahí** — Mortalidad y Bitácora (Sprint 4) quedaron abiertas a
   ambos roles a propósito, sin restricción.
4. Cualquier link de navegación nuevo se agrega a `NAV_ITEMS` en
   `components/layout/nav-items.ts` — el Shell ya filtra automáticamente
   por rol contra `rolPermitidoParaRuta()`, no hace falta tocar `Sidebar`.
   Toda pantalla nueva usa `<PageHeader title=... actions=... />` en vez
   de armar un `<h1>` a mano. Toda tabla ancha usa `<TableScrollArea>`.
   **Todo formulario de alta/edición, sea pantalla de campo (Operario) o
   de gestión de escritorio (Gerente), usa `<Dialog>` centrado** (`ui/dialog.tsx`,
   mismo esqueleto que `LoteFormDialog`/`GalponFormDialog`) — no
   `<Sheet side="bottom">`. Sprint 4 probó el `<Sheet>` como formulario
   para Mortalidad/Bitácora y se revirtió a `<Dialog>` a pedido del
   Product Owner (se veía mal en escritorio) — no repetir ese experimento
   sin validarlo visualmente primero. `<Sheet>` sigue existiendo solo
   para el drawer del Sidebar mobile. Ver
   `components/domain/mortalidad/registrar-mortalidad-dialog.tsx`
   como referencia de formulario compacto (`INPUT_COMPACTO`/`LABEL_COMPACTO`,
   botones `size="md"`) reusable en pantallas de campo. Un listado que es
   un **feed cronológico** (no una tabla de gestión) usa paginación por
   cursor + scroll infinito, no `<DataTablePagination>` — ver "Tabla
   paginada vs. muro con scroll infinito" en `memory/convenciones.md`. Un
   grupo de filtros sueltos (no una tabla) se envuelve en un marco chico
   con rótulo (`rounded-lg border border-border bg-muted/30` + un ícono +
   "Filtros"), no en un `<Card>` de sección grande — ver
   `components/domain/bitacora/bitacora-filtros.tsx`.
5. Si una mutación necesita un guard atómico anti-carrera (`UPDATE ...
   WHERE condicion`) que decida si ejecutar una segunda operación según
   el resultado de la primera, usar una transacción interactiva
   (`prisma.$transaction(async (tx) => {...})`) — precedente real en
   `server/repositories/mortalidad.ts` (`registrarMortalidadYDescontarAves`,
   Sprint 4), no el array-form que usan las transacciones más simples.
   Sprint 9 (`Update condicional anti-doble-venta`) va a necesitar
   exactamente este mismo patrón.
6. Mantener el mismo patrón de Sprints 0-3: ejecutar tarea por tarea,
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
- **Sprint 3** — cerrado (2026-08-07). 13/13 tareas completas, 108 tests
  (44 nuevos), migración de schema (`Galpon.estado`) aplicada contra
  Neon real, verificado con scripts temporales contra Neon real (alta de
  lote, mudanza transaccional, índice único parcial de S0-5 todavía
  vigente, guards de capacidad/ocupación con números reales, fila real
  de `AuditLog`) y guard de rol verificado con curl+cookie jar (403 real
  a Operario en `/galpones`/`/lotes`, con usuarios Gerente/Operario
  temporales por la rotación de contraseña de `gerente` en producción).
  Sin bugs de código encontrados. **Deuda pendiente explícita:**
  verificación clic a clic en navegador real de `/galpones`/`/lotes`
  — no se hizo en esta sesión (se usaron scripts en su lugar, decisión
  explícita), ver detalle arriba.
- **Sprint 4** — cerrado (2026-08-08). 155 tests (34 nuevos sobre los 121
  heredados de Sprint 3), dos migraciones no destructivas aplicadas
  contra Neon real (`RegistroMortalidad.revertido`/`revertidoEn`,
  `BitacoraGlobal.eliminada`), verificado con scripts temporales contra
  Neon real, curl+cookie jar (403 real a Operario en `/usuarios`,
  control) y clic a clic en navegador real (registro y reversión de
  mortalidad, alta/edición/eliminación de notas, scroll infinito,
  filtros). Primeras dos transacciones interactivas del proyecto
  (decremento y reversión de `avesVivas`), primer módulo sin restricción
  de rol, `<Dialog>` compacto reusado también para pantallas de campo del
  Operario. Detalle completo en la sección "Sprint 4 — Mortalidad y
  Bitácora" más abajo. **Deuda pendiente explícita:** verificación en
  celular físico real, y datos de prueba en Neon pendientes de limpieza
  (dejados a propósito para que el Product Owner siga probando).
- **Sprint 5** — cerrado (2026-08-11). 191 tests (36 nuevos sobre los 155
  heredados de Sprint 4), sin migraciones nuevas (el schema ya estaba
  completo desde Sprint 0), cobertura 100% en `services/recoleccion.ts`
  e `services/inventario.ts` (exige ≥90%), verificado con un script
  temporal contra Neon real (transacción con sueltos, sin sueltos,
  múltiplo exacto de 180 sin ruido en el ledger, idempotencia real por
  `P2002`, mudanza + galpón automático, `AuditLog` real) y clic a clic en
  navegador real por el Product Owner. Primera transacción del proyecto
  con escritura en cascada real (`RegistroRecoleccion` + N `Paquete` + N
  `PaqueteOrigen` + `InventarioSueltos`/`MovimientoSueltos`
  condicionales), primer contrato offline-ready real (id generado en
  cliente + idempotencia por `create`+captura de `P2002`, no `upsert`).
  **Un bug real encontrado y corregido en vivo durante la propia
  verificación de S5-13** (doble clic duplicaba un `RegistroRecoleccion`
  completo — `formAction` invocado fuera de `startTransition` + `id`
  regenerado en cada clic en vez de una vez por apertura del diálogo):
  detalle completo en "Bug real encontrado y corregido en vivo durante
  Sprint 5" más abajo. Detalle completo del sprint en la sección
  "Sprint 5 — Recolección e Inventario" más abajo. **Deuda pendiente
  explícita:** auditar si el resto de los dialogs de mutación del
  proyecto (Usuarios, Galpones, Lotes/Mudanza, Bitácora, Mortalidad)
  puede duplicar un registro ante un doble clic o un reintento de red —
  ninguno tiene protección de idempotencia por id de cliente todavía,
  pedido explícito del Product Owner para revisar después de este cierre.

## Sprint 4 — Mortalidad y Bitácora (cerrado, 2026-08-08)
155 tests (34 nuevos sobre los 121 heredados de Sprint 3), dos
migraciones no destructivas aplicadas contra Neon real, verificado con
scripts temporales contra Neon, curl+cookie jar y clic a clic en
navegador real. `specs/sprint-04-mortalidad-bitacora/` tiene la
planificación original; este registro documenta el estado final tal como
quedó entregado.

**Decisiones de negocio confirmadas por el Product Owner:**
1. MUERTE y DESCARTE decrementan `avesVivas` exactamente igual — `tipo`
   es informativo, no cambia la aritmética.
2. Sobregiro (cantidad > avesVivas) se rechaza, no se limita a 0.
3. El galpón de un `RegistroMortalidad` se resuelve automático vía
   `buscarUbicacionActual(loteId)` — el operario nunca elige un galpón a
   mano.
4. Solo se puede registrar mortalidad de un lote ACTIVO.
5. Mortalidad solo se corrige dentro de una ventana de gracia de 10
   minutos (afecta `avesVivas`, un contador con efectos en cascada);
   Bitácora se puede editar o eliminar sin ventana de tiempo ni
   restricción de autoría (una nota es texto suelto, sin efecto sobre
   otro dato).

**Arquitectura y patrones nuevos que sprints futuros deben reusar:**
- **Transacciones interactivas** (`prisma.$transaction(async (tx) =>
  {...})`, no el array-form de Sprints 2-3): dos casos en
  `server/repositories/mortalidad.ts`
  (`registrarMortalidadYDescontarAves` y `revertirMortalidad`) — ambas
  necesitan decidir si ejecutan una segunda operación según el resultado
  de un `UPDATE` condicional (`WHERE avesVivas >= cantidad` / `WHERE
  revertido = false`), algo que el array-form no puede expresar.
  Verificado en vivo contra Neon real —incluido el connection pooler
  (`-pooler`, PgBouncer modo *transaction*)— con llamadas concurrentes
  reales. Sprint 9 (`Update condicional anti-doble-venta`) va a necesitar
  el mismo patrón.
- **Primer módulo sin restricción de rol**: `/mortalidad` y `/bitacora`
  quedan abiertas a GERENTE y OPERARIO por igual, sin entrada en
  `RUTAS_POR_ROL`.
- **`withAuth` es para mutaciones, no lecturas**: el "cargar más" del
  scroll infinito de Bitácora (`obtenerMasBitacora`) verifica sesión a
  mano con `auth()`, sin pasar por `withAuth` — ver
  `memory/convenciones.md`, sección "Server Actions".
- **Muro cronológico con scroll infinito** (paginación por cursor, no
  `?page=N`) para listados tipo feed — ver "Tabla paginada vs. muro con
  scroll infinito" en `memory/convenciones.md`. Un componente que
  **dispara su propia navegación** (como el filtro de Bitácora) nunca
  lleva un `key` derivado de esa misma navegación — remontarse a mitad de
  su propia transición deja instancias viejas visibles; un consumidor
  pasivo como `BitacoraMuro` sí puede usar ese `key` sin problema. La
  navegación de un filtro usa `startTransition(() => router.replace(...))`,
  no `router.push` suelto.
- **`<Dialog>` centrado y compacto para todo formulario**, sea pantalla
  de campo (Operario) o de gestión de escritorio (Gerente) —
  `INPUT_COMPACTO`/`LABEL_COMPACTO` (`h-10`, `text-sm`), botones
  `size="md"`. `<Sheet side="bottom">` queda reservado exclusivamente
  para el drawer del Sidebar mobile.

**Lo que construye este sprint:**
- **Mortalidad**: registrar mortalidad (`RegistroMortalidad` +
  decremento atómico de `avesVivas`, galpón resuelto automático, guard de
  sobregiro), listado paginado con badge de color por tipo (`.badge-tipo-*`
  en `globals.css`: Muerte = rojo, Descarte = naranja — distintos del
  rojo de `--destructive`, reservado para acciones peligrosas como
  "Desactivar", y del amber de "Activo"), y ventana de gracia de 10
  minutos para deshacer un registro (botón con countdown real vía
  `setInterval`, restaura `avesVivas`, la fila queda visible y atenuada
  como "Revertido" — nunca desaparece del historial). El "ajuste manual
  del Gerente pasado el plazo" que Sprint 6 sí contempla para Recolección
  queda fuera de alcance acá — solo la reversión dentro de los 10
  minutos.
- **Bitácora**: alta de nota con categoría (sin galpón, D2), muro
  cronológico con scroll infinito y badge de color por categoría
  (`.badge-categoria-*`: Alimentación = lima, Vacunación = azul,
  Observación = violeta), filtro de categoría/fecha en un marco
  colapsable (`<button>` con `aria-expanded` + `ChevronDown`, arranca
  colapsado salvo que ya haya un filtro activo) con límites de fecha
  nativos del `<input type="date">` (nunca futura; "Desde" no puede
  superar a "Hasta" y viceversa, vía `min`/`max` controlados), y
  edición/eliminación de cualquier nota (`BitacoraGlobal.eliminada`,
  soft-delete, nunca `DELETE`) — actualiza el `items` local de
  `BitacoraMuro` vía callbacks en vez de depender de `router.refresh()`.
- Fechas de ambos módulos sin segundos (`lib/fecha.ts`,
  `formatearFechaHora()` — día/mes/año + hora:minuto, América/Lima).

**Migraciones aplicadas contra Neon real** (no destructivas, `ADD COLUMN
... DEFAULT`): `RegistroMortalidad.revertido`/`revertidoEn` y
`BitacoraGlobal.eliminada`
(`20260808024615_mortalidad_revertido_bitacora_eliminada`).

**Verificado en vivo contra Neon real** (scripts temporales): decremento
atómico con ambos tipos de mortalidad; sobregiro rechazado sin modificar
nada; guard anti-carrera forzado con llamadas concurrentes reales
(registro y reversión); `galponId` correcto antes/después de una
mudanza; lote INACTIVO real rechazado; nota de Bitácora real sin campo de
galpón; paginación por cursor con datos reales; filas reales de
`AuditLog` para las cinco acciones (`CREAR`/`REVERTIR` en Mortalidad,
`CREAR`/`EDITAR`/`ELIMINAR` en Bitácora).

**Verificado con curl+cookie jar**: Operario y Gerente acceden por igual
a `/mortalidad`/`/bitacora` (200), mientras `/usuarios` sigue 403 para
Operario (control) — confirma que el acceso abierto es intencional.

**Verificado clic a clic en navegador real** (extensión Claude in Chrome
y, para las piezas agregadas al final, un servidor temporal): alta y
reversión de mortalidad (`avesVivas` vuelve exactamente al valor
previo), alta/edición/eliminación de notas (toasts correctos, muro y
tabla se actualizan sin recargar), filtro de categoría y de fecha,
scroll infinito de punta a punta con datos reales, badges de colores
distinguibles, `<Select>` siempre con etiquetas legibles (el Bug 2 de
Sprint 3 no se repitió).

**Pendiente explícito:**
- Verificación en un celular físico real — lo hecho con la extensión fue
  clic a clic funcional, no pixel-perfect en viewport móvil exacto
  (`resize_window` sigue sin efecto en este entorno). Mismo camino que
  Sprints 1-2: Product Owner probando desde su celular.

**Datos de prueba, limpiados (2026-08-08):** el usuario
`operario.browser.s4`, el lote `VERIF-BROWSER-S4` y sus 25 notas de
Bitácora de prueba se borraron con un script una vez que el Product
Owner terminó de probar. Al limpiar apareció un caso real (no de esta
sesión): el Product Owner había usado el galpón de prueba para mover
`LOTE-DEMO-01` y dar de alta dos lotes propios (`LOTE-VERIF-02`,
`LOTE-VERIF03`) mientras probaba la app — `LOTE-DEMO-01` se movió de
vuelta a Galpón 1 (su ubicación real anterior) con la función real de
mudanza, y los dos lotes de prueba del Product Owner se borraron a
pedido suyo. El galpón de prueba no se pudo borrar físicamente (el paso
real, aunque breve, de `LOTE-DEMO-01` por ahí sigue registrado en
`HistorialUbicacionLote`, protegido por `onDelete: Restrict` — no se
borra esa fila para no perder historial real) — quedó en `INACTIVO`
en su lugar, mismo criterio que "eliminar" un galpón en el resto del
proyecto.

## Sprint 5 — Recolección e Inventario (cerrado, 2026-08-11)
191 tests (36 nuevos sobre los 155 heredados de Sprint 4), sin ninguna
migración de schema (los 7 modelos del módulo ya existían desde
Sprint 0), cobertura 100% en `server/services/recoleccion.ts` e
`server/services/inventario.ts` (el roadmap exige ≥90%), verificado con
un script temporal contra Neon real y clic a clic en navegador real por
el Product Owner. `specs/sprint-05-recoleccion-inventario/` tiene la
planificación completa (spec.md, plan.md, tasks.md con las 13 tareas
documentadas al cerrarlas, incluidos los desvíos reales encontrados
durante la ejecución).

**Decisiones de negocio confirmadas por el Product Owner antes de
ejecutar:**
1. Este sprint implementa **solo el contrato de datos** del Contrato
   Offline-Ready (id generado en cliente, Server Action idempotente, dos
   timestamps) — sin cola real de IndexedDB/Dexie, que sigue siendo
   Sprint 14.
2. El registro se guarda **solo cuando todos los pesos están
   completos** — no existe un estado "paquete sin pesar guardado para
   completar después".
3. `reconstruirSaldo()` es una función de servicio puro con tests, sin
   pantalla propia en este sprint — la pantalla visible de saldos por
   galpón/lote es Sprint 7 (Consolidación).
4. `/recoleccion` queda abierta a GERENTE y OPERARIO por igual, mismo
   criterio que Mortalidad/Bitácora.

**Arquitectura y patrones nuevos que sprints futuros deben reusar:**
- **Primera transacción del proyecto con escritura en cascada real**:
  `RegistroRecoleccion` + N `Paquete` (con `PaqueteOrigen` anidado en el
  mismo `create`) + `InventarioSueltos`/`MovimientoSueltos`
  condicionales (solo si `sueltos > 0`, para no dejar ruido en el
  ledger) — más tablas tocadas de una sola vez que cualquier transacción
  anterior (`server/repositories/recoleccion.ts`,
  `registrarRecoleccion`).
- **Primer contrato offline-ready real del proyecto**: el `id` de
  `RegistroRecoleccion` lo genera el cliente
  (`crypto.randomUUID()`), no Prisma. Idempotencia por `create` +
  capturar `P2002` (no por `prisma.upsert()`, que no puede expresar
  "crear también N filas hijas atómicamente solo si el padre no existía
  todavía") — el `catch` vive en la Server Action
  (`server/actions/recoleccion.ts`), no en el repository, mismo
  precedente que `crearUsuario`/`crearGalpon` ya establecían. Sprint 6
  (ventana de gracia/reversión) y Sprint 14 (cola offline real) van a
  reusar este patrón, no reinventarlo.
- **"Campos calculados" aplicado por primera vez fuera de Lote**: la
  columna "Sueltos" de `/recoleccion` no se persiste, se deriva llamando
  `calcularEmpaque()` directo desde el Server Component de la tabla —
  mismo criterio que `calcularEdadEnSemanas()` en Sprint 3.
- **Un Client Component con un campo de longitud variable no puede usar
  `<form action={formAction}>` + `FormData`** (`normalizarInput` de
  `with-auth.ts` colapsa claves repetidas al último valor, no arma
  arreglos) — se llama `formAction(payload)` directo desde `onSubmit`
  con un objeto plano, **siempre envuelto en `startTransition()`** (ver
  el bug real más abajo: sin ese envoltorio, `useActionState` no
  actualiza `pending` a tiempo). `RegistrarRecoleccionDialog` es el
  único dialog del proyecto con este patrón — los otros seis siguen
  usando `<form action={formAction}>` normal.

**Lo que construye este sprint:**
- **Recolección**: `calcularEmpaque(cantidadTotal)` (paquetes de 180,
  resto como sueltos, sin forzar paquetes incompletos), formulario con
  despliegue reactivo de un campo de peso por paquete, transacción
  completa (`RegistroRecoleccion` + `Paquete` + `PaqueteOrigen` +
  ledger condicional), listado paginado (10 filas) con "Sueltos" como
  campo calculado, sin restricción de rol.
- **Inventario**: `reconstruirSaldo()` (función pura, clasifica cada
  `TipoMovimientoSueltos` en entrada/salida; `REVERSION` queda sin
  resolver a propósito, es Sprint 6) más
  `listarMovimientosSueltos()`, sin pantalla propia todavía.

**Sin migraciones** — a diferencia de Sprint 3/4, el schema de
Recolección e Inventario ya estaba completo desde Sprint 0.

**Verificado en vivo contra Neon real** (script temporal, borrado al
terminar, datos de prueba reconfirmados en 0 antes de borrar el script):
recolección con sueltos, recolección menor a 180 (0 paquetes),
recolección múltiplo exacto de 180 (confirmado que NO se toca
`InventarioSueltos`/`MovimientoSueltos` cuando sueltos = 0), idempotencia
real (reenviar el mismo `id` lanza `P2002` de Postgres de verdad, la
transacción aborta completa sin dejar nada a medias), mudanza + galpón
resuelto automático (`@@unique([galponId, loteId])` mantiene separados
los saldos de dos galpones), guard de lote INACTIVO, fila real de
`AuditLog`. Sin bugs de código encontrados en esta verificación de
repository/service.

**Verificado con curl+cookie jar** (login real, no solo lectura de
código): un usuario Gerente temporal accede a `/recoleccion` (200) y el
HTML servido trae tanto el botón "Registrar recolección" como
`LOTE-DEMO-01` — confirma que `listarLotesActivos()` llega hasta el
diálogo antes incluso de probar en navegador real.

**Verificado clic a clic en navegador real por el Product Owner**
(la extensión Claude in Chrome no conectó en este entorno pese a
reintentarlo — mismo camino de Sprints 1-2 cuando la herramienta no
alcanzaba): campos de peso apareciendo/desapareciendo reactivamente,
botón "Guardar" deshabilitado/habilitado correctamente, guardado exitoso
con toast y tabla actualizada sin recargar, acceso sin 403 para un
Operario de prueba.

**Un bug real encontrado y corregido durante esta misma verificación**
(doble clic dejó dos `RegistroRecoleccion` reales en vez de uno — la
protección de idempotencia que este mismo sprint construyó no llegó a
activarse): detalle completo de la causa raíz (dos bugs combinados,
`formAction` fuera de `startTransition` + `id` regenerado en cada clic)
y el fix en la sección "Bug real encontrado y corregido en vivo durante
Sprint 5 (S5-13, 2026-08-11)" más abajo. Reverificado por el Product
Owner tras el fix: doble clic deliberado, un solo registro.

**Pendiente explícito, no resuelto en este cierre:**
- Auditar si el resto de los dialogs de mutación del proyecto (Usuarios,
  Galpones, Lotes/Mudanza, Bitácora, Mortalidad) puede duplicar un
  registro ante un doble clic o un reintento de red — ninguno tiene
  protección de idempotencia por id de cliente todavía (el Contrato
  Offline-Ready recién es obligatorio desde este sprint, así que no es
  una regresión, es una laguna preexistente). Pedido explícito del
  Product Owner.
- Verificación en celular físico real — lo hecho fue clic a clic en
  escritorio (`npm run dev` + navegador del Product Owner), no
  pixel-perfect en viewport móvil exacto.
- Datos de prueba de esta sesión (`verif.s5.13.gerente`,
  `verif.s5.13.operario`) y el servidor `npm run dev` local siguen
  activos a propósito, para que el Product Owner pueda seguir probando
  antes de dar el sprint por cerrado del todo — pendientes de limpiar.

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

## Bug real encontrado y corregido en vivo durante Sprint 5 (S5-13, 2026-08-11): doble clic duplicaba un RegistroRecoleccion completo
Verificando `/recoleccion` en el navegador real (`npm run dev`, dos
usuarios de prueba), el Product Owner hizo doble clic en "Guardar" sin
querer (la acción demoró en responder) y quedaron dos registros reales
en vez de uno — el mismo escenario que el Contrato Offline-Ready
(`memory/convenciones.md`) está pensado para prevenir, fallando en la
práctica. Detalle completo (causa raíz, fix, verificación) en
`specs/sprint-05-recoleccion-inventario/tasks.md`, tarea S5-13 — acá solo
el resumen y el pendiente que abre para el resto del proyecto.

**Causa raíz (dos bugs reales combinados, confirmados leyendo el log del
propio dev server, no adivinados):**
1. `RegistrarRecoleccionDialog` es el único dialog del proyecto que NO
   usa `<form action={formAction}>` — porque su campo `pesos` es un
   arreglo de longitud variable que `FormData` no puede representar (ver
   S5-8). Llamaba a `formAction(payload)` a mano desde `onSubmit`, sin
   envolverlo en `startTransition()`. React exige ese envoltorio para
   cualquier invocación de un dispatcher de `useActionState` que no pase
   por `<form action>` — sin él, `pending` no se actualiza a tiempo (React
   lo advierte explícitamente en consola: "isPending will not update
   correctly"), así que el botón "Guardar" seguía habilitado entre el
   primer y el segundo clic.
2. El `id` (el que hace idempotente al Contrato Offline-Ready) se
   generaba con `crypto.randomUUID()` **dentro del propio `onSubmit`** —
   cada clic, aunque fuera el mismo formulario con los mismos datos,
   generaba un id distinto. La protección de idempotencia por `P2002`
   (diseñada y probada en S5-4/S5-6/S5-10/S5-12) nunca llegó a activarse
   porque, desde el punto de vista de la base, eran dos registros
   legítimamente distintos, no un reintento del mismo.

**Corregido:** `startTransition()` alrededor del `formAction(payload)`, y
el `id` (más una guarda extra `if (pending) return`) generado una sola
vez por apertura del diálogo (`useState(() => crypto.randomUUID())`), no
por clic — el formulario se desmonta por completo al cerrar el diálogo
(ya sea por éxito o cancelación), así que reusar el mismo id mientras
sigue abierto es seguro: un reintento genuino (mismos datos, doble clic o
reintento de red) ahora sí colisiona con `P2002` y la action responde con
el registro ya existente en vez de crear uno nuevo. Reverificado en el
mismo navegador por el Product Owner: doble clic deliberado, un solo
registro. Los 4 registros duplicados que había dejado el bug original se
borraron de Neon con un script temporal antes de aplicar el fix.

**Pendiente explícito para después de cerrar este sprint — auditar el
resto de los dialogs del proyecto:** los otros seis dialogs de
formulario (`RegistrarMortalidadDialog`, `NuevaNotaBitacoraDialog`,
`EditarNotaBitacoraDialog`, `GalponFormDialog`, `LoteFormDialog`,
`MudanzaDialog`, `UsuarioFormDialog`) sí usan `<form action={formAction}>`
— confirmado con `grep`, ninguno repite el bug #1 de arriba (React
maneja la transición sola en ese patrón). Pero **ninguno de ellos tiene
protección de idempotencia contra un reintento genuino** (id generado en
servidor, no en cliente) — es esperable, el Contrato Offline-Ready recién
es obligatorio "desde Sprint 5 en adelante" (`memory/convenciones.md`),
así que no es una regresión de hoy, es una laguna preexistente heredada
del diseño de Sprints 1-4. El Product Owner pidió explícitamente
dejarlo anotado para revisar en todos los sprints (no solo los ya
cerrados, también los que faltan) si un doble clic o un reintento de red
podría duplicar un registro en cada uno de esos módulos — Usuarios,
Galpones, Lotes/Mudanza, Bitácora, Mortalidad. Queda pendiente, no
resuelto en esta sesión.

## Auditoría de idempotencia post-Sprint 5, resuelta (2026-08-11, misma sesión)
Siguiendo el pedido explícito del Product Owner (ver sección anterior),
se auditó cada dialog de mutación del proyecto para saber si un doble
envío (doble clic, reintento de red) podía duplicar un registro, y se
corrigieron los módulos que no tenían ninguna protección. Regla general
resultante, ya documentada como convención permanente en
`memory/convenciones.md` ("Idempotencia por id de cliente: obligatoria
en TODA creación, no solo en las offline-ready") — este archivo solo
guarda el resultado concreto de la auditoría y su verificación.

**Resultado de la auditoría, módulo por módulo:**
- **Usuario** (crear) y **Lote** (crear): ya protegidos de fábrica —
  `Usuario.usuario` y `Lote.codigo` son `@unique`, y `crearUsuario`/
  `crearLote` ya atrapaban `P2002` desde que se escribieron (Sprint 2 y
  3). Sin cambios.
- **Mudanza** (`mudarLoteAction`): sin riesgo de duplicación real — el
  índice único parcial de S0-5 (una sola ubicación abierta por lote) lo
  impide a nivel de base, y la guard `puedeMudarLote` ya rechaza sola un
  reintento secuencial ("el lote ya está en ese galpón") una vez que el
  primero se aplicó. Se agregó igual un `catch` de `P2002` con mensaje
  claro para el caso límite de una carrera verdaderamente concurrente —
  polish, no corrección de un bug real.
- **Galpón** (crear), **Bitácora** (nueva nota) y **Mortalidad**
  (registrar): sin ninguna protección — confirmado leyendo el código
  (`Galpon.nombre` sin `@unique`, "nada lo pedía" desde Sprint 3;
  `BitacoraGlobal.contenido` sin unicidad posible; `RegistroMortalidad`
  sin ninguna restricción). **Mortalidad era el hallazgo más grave**: un
  doble envío no solo dejaba una fila de más, decrementaba `avesVivas`
  dos veces — mismo patrón de severidad que el bug real de Recolección
  (S5-13), pero sobre un contador operativo en vivo en un módulo que ya
  estaba en producción desde Sprint 4.

**Corregido en los tres** (mismo patrón que Recolección, S5-6): `id`
generado en el cliente agregado al schema Zod de "crear"
(`lib/zod/galpon.ts`, `bitacora.ts`, `mortalidad.ts`), el repository
correspondiente pasa ese `id` al `create` de Prisma en vez de dejarlo
autogenerado, y la Server Action atrapa `P2002` — compara los campos
relevantes contra el registro ya persistido (si coinciden, responde
éxito idempotente sin volver a escribir; si no, `AccionError` explícito,
no se sobrescribe en silencio). En el cliente, cada dialog
(`GalponFormDialog`, `NuevaNotaBitacoraDialog`,
`RegistrarMortalidadDialog`) genera el `id` **una sola vez por apertura**
(`useState(() => crypto.randomUUID())`), como campo `<input type="hidden">`
dentro del `<form action={formAction}>` normal — ninguno de los tres
necesitó el bypass de `startTransition` que sí hizo falta en Recolección,
porque los tres ya usaban `<form action={formAction}>` nativo desde el
principio (ese patrón de React sí maneja `pending` solo).

**Verificado, dos capas:**
1. **11 tests de integración nuevos** (2 por módulo + 1 test de
   `contenido` vacío ajustado en Bitácora), repositories mockeados —
   reintento con mismos datos devuelve el registro existente sin
   duplicar, reintento con datos distintos rechazado explícito. 197/197
   tests en verde.
2. **Script temporal contra Neon real** (mismo criterio que S5-12, no
   solo confiar en los mocks): para cada uno de los tres módulos, crear
   con un `id` fijo, reenviar el mismo `id` y confirmar `P2002` real de
   Postgres — y para Mortalidad específicamente, confirmar que
   `Lote.avesVivas` queda en el mismo valor después del reintento
   fallido (490, no 480) porque la transacción completa abortó, no solo
   el `create`. Los tres casos pasaron a la primera. Datos de prueba
   borrados al terminar, script descartado.

**De paso, en la misma sesión:** se agregó un componente
`components/ui/password-input.tsx` (toggle de "ver/ocultar contraseña",
ícono `Eye`/`EyeOff`) usado en `/login` y en el campo de contraseña de
`UsuarioFormDialog` (crear y editar comparten el mismo campo) — pedido
explícito del Product Owner, sin relación con la auditoría de
idempotencia.

**Filtros en Mortalidad y Recolección — analizado primero, implementado
después en la misma sesión** (el Product Owner pidió explícitamente
"implementemos también el punto 3" después de ver el análisis).
Confirmado que tenía sentido en estos dos (historiales cronológicos que
crecen, mismo criterio que ya justificaba los filtros de Bitácora), no
en Usuarios/Galpones/Lotes (catálogos chicos, un filtro ahí resolvería
un problema que todavía no existe) — esos quedan sin tocar.

**`MortalidadFiltros`** (tipo + lote + rango de fecha) y
**`RecoleccionFiltros`** (lote + rango de fecha, sin `tipo` — Recolección
no tiene una clasificación categórica) — mismo patrón que
`BitacoraFiltros` (marco colapsable, filtros dirigidos por URL,
`startTransition` + `router.replace`), con un desvío real:
Mortalidad/Recolección paginan por página (`?page=N`, no por cursor como
Bitácora), así que **cambiar cualquier filtro también borra `page` de
la URL** — quedarse en "página 3" de un resultado ya filtrado (que capaz
solo tiene una página) mostraría una tabla vacía sin explicación.

**Pieza nueva no anticipada, encontrada al conectar filtros + paginación
por primera vez en el mismo módulo:** `<DataTablePagination>` construía
sus links `${basePath}?page=N` a secas — ninguna tabla anterior
(Usuarios/Galpones/Lotes/Mortalidad sin filtros) necesitaba preservar
otros parámetros de la URL entre páginas. Se le agregó una prop opcional
`filtros?: Record<string, string | undefined>` que se combina con `page`
al armar cada link — retrocompatible (los módulos que no la pasan siguen
funcionando exactamente igual), documentado en el propio componente para
que cualquier tabla futura con filtros + paginación por página lo reuse
sin tener que redescubrirlo.

**`listarLotesParaFiltro()` nuevo** en `server/repositories/lote.ts` —
a propósito NO reusa `listarLotesActivos()` (que ya existía para poblar
el `<Select>` de los formularios de alta): un filtro de historial
necesita poder elegir también un lote ya `INACTIVO` (finalizado), algo
que un formulario de alta nunca necesita.

**Verificado:** 197/197 tests sin roturas (los repositories nuevos con
parámetros opcionales no rompieron ningún test existente, y no hay tests
de repository en este proyecto por convención — ver
`memory/convenciones.md`), `npm run build` limpio, y un script temporal
contra Neon real con datos de dos lotes distintos confirmando que
`tipo`, `loteId` y el rango de fecha filtran exactamente lo esperado (no
de más, no de menos) tanto en Mortalidad como en Recolección — datos de
prueba borrados al terminar. Smoke test adicional con `curl`+cookie jar
confirmando que ambas rutas responden 200 con query params de filtro,
incluido un `loteId` con formato inválido a propósito (no rompe nada,
Prisma simplemente no encuentra coincidencias — mismo criterio que
`categoria`/`fecha` en Bitácora, `searchParams` es un límite de entrada
externo, no pasa por Zod).