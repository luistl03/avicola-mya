# Tareas — Sprint 2

- [x] S2-1 — `server/auth/rbac.ts`: mapeo `RUTAS_POR_ROL`. **Cambiado
  respecto al plan original:** en vez de un prefijo compartido
  (`/gestion` → GERENTE, `/operacion` → GERENTE+OPERARIO), se abandonó ese
  esquema por regla de ruta exacta con `startsWith` (`/usuarios` →
  GERENTE) para poder tener URLs planas por pantalla — ver el comentario
  en el propio archivo. Guard por rol en `src/proxy.ts`: 403 explícito si
  `req.auth.user.rol` no está autorizado para `pathname`, agregado dentro
  del `auth(async (req) => {...})` existente (no envolver con un
  middleware nuevo — ver por qué en plan.md)
- [x] S2-2 — `server/repositories/auditLog.ts`: `crearAuditLog({ entidad, entidadId, accion, usuarioId, estadoAntes?, estadoDespues?, ip? })`
- [x] S2-3 — `server/auth/with-auth.ts`: `withAuth(config, handler)` — orden
  de verificación: sesión → revocada/idle (reusa `buscarSesionPorJti` +
  `estaExpiradaPorInactividad` de Sprint 1) → rol → Zod → ejecuta handler →
  escribe AuditLog vía S2-2
- [x] S2-4 — Instalar componentes shadcn adicionales que confirmen hacer
  falta para H4/H5 (`table`, `select`, `dialog` o `sheet`, `badge`) — se
  eligió `dialog` sobre `sheet` (formulario de usuarios es pantalla de
  Gerente/admin, no UX de campo; el Shell mobile usa BottomNav fijo, no
  un drawer, así que `sheet` no hacía falta)
- [x] S2-5 — `revocarSesionesPorUsuario(usuarioId, ahora)` en
  `server/repositories/sesion.ts` (`updateMany` por `usuarioId`, no por `jti`)
- [x] S2-6 — `lib/zod/usuario.ts`: `crearUsuarioSchema`, `editarUsuarioSchema`,
  `cambiarEstadoUsuarioSchema`. **Actualizado durante S2-7:** `crearUsuarioSchema`
  sí incluye `rol: "GERENTE" | "OPERARIO"` como input — el Gerente lo elige
  al crear (decisión del Product Owner que amplía el alcance original de
  spec.md; ver nota en plan.md)
- [x] S2-7 — `server/repositories/usuario.ts` (`crearUsuario`,
  `actualizarUsuario`, `cambiarEstadoUsuario`, `contarGerentesActivos`; se
  agregaron también `buscarUsuarioPorId` y `listarUsuarios`, necesarias
  para S2-8/S2-9 y no listadas explícitamente en el plan original) +
  `server/services/usuario.ts` (`puedeDesactivarUsuario` — guard pura:
  bloquea autodesactivación y desactivar al último Gerente activo). El
  hash de password (`bcrypt.hash`, cost 12) se deja para S2-8, dentro del
  handler de la Server Action, mismo criterio que `autorizarCredenciales`
  usa `bcrypt.compare` directo sin pasar por una capa de servicio.
  **Bug real encontrado y corregido durante la verificación final del
  sprint** (al planear cómo probar la guard "último Gerente" en vivo): con
  el orden original (autodesactivación primero), esa rama era código
  muerto en la práctica — quien invoca la action ya tiene que ser un
  Gerente ACTIVO, así que si objetivo ≠ actual, `totalGerentesActivos`
  siempre cuenta a ambos (nunca ≤ 1); el único caso real donde "último
  Gerente" aplica es la autodesactivación del propio último Gerente activo,
  y con el orden viejo el chequeo de autodesactivación la interceptaba
  antes, mostrando el mensaje genérico en vez de explicar la razón real.
  Se invirtió el orden (último Gerente primero) — 2 tests unitarios nuevos
  fijan el comportamiento correcto en ambos casos
- [x] S2-8 — `server/actions/usuario.ts`: `crearUsuario`, `editarUsuario`,
  `cambiarEstadoUsuarioAction` (activar/desactivar en una sola action por
  `estado`), todas vía `withAuth({ rol: "GERENTE", ... })`. **Ajuste sobre
  plan.md:** la transacción `Usuario.estado` + revocación de sesiones NO
  vive en la action (violaría ADR-000 — solo repositories importan Prisma);
  se movió a `desactivarUsuarioYRevocarSesiones()` en
  `server/repositories/usuario.ts` (S2-7), que la action solo invoca.
  Maneja la colisión de `usuario` duplicado con chequeo previo + catch de
  `P2002` (carrera entre altas simultáneas) → `AccionError`
- [x] S2-9 — Pantallas `app/(app)/usuarios/` (ruta plana, no
  `app/(app)/gestion/usuarios/` como decía el plan original — ver S2-1):
  `page.tsx` (Server
  Component, lee `listarUsuarios()` directo — no hay mutación, no necesita
  pasar por Server Action) + `UsuariosTabla` (tabla con `Badge` de estado,
  botón Activar/Desactivar por fila vía `cambiarEstadoUsuarioAction`) +
  `UsuarioFormDialog` (un solo componente crear/editar, `Dialog` +
  `Select` de rol solo en modo crear, `useActionState`). Verificado en
  vivo contra `npm run dev` (curl con cookie jar real, login real de
  `gerente`/`Cambiar123!`): la página renderiza la fila del Gerente seedeado
  con datos reales; un Operario temporal creado y borrado para la prueba
  recibe 403 real en `/usuarios`.
  **Verificado interactivamente en navegador real** en una sesión
  posterior (extensión Claude in Chrome conectada): crear usuario (rol
  elegido vía `Select`), editar nombre/celular, alternar
  activar/desactivar — los tres flujos confirmados clic a clic contra el
  servidor real, con la tabla refrescándose sola vía `router.refresh()`
  después de cada acción exitosa. Detalle completo de lo encontrado y
  corregido en esa sesión (un bug real de Base UI) más abajo, en
  "Verificación final del sprint"
- [x] S2-10 — Shell: `components/layout/nav-items.ts` (`NAV_ITEMS`, lista
  plana sin campo `roles` — la visibilidad se resuelve filtrando cada item
  con `rolPermitidoParaRuta()` de S2-1, no con una segunda lista
  hardcodeada) + `components/layout/sidebar.tsx`. **Cambiado respecto al
  plan original, en una sesión posterior de diseño de frontend:** no hay
  `components/layout/bottom-nav.tsx` (barra fija abajo) — se reemplazó por
  un único `AppSidebar` (`ui/sidebar.tsx`, primitivo de shadcn) que en
  mobile se abre como drawer deslizable (`Sheet`) disparado por
  `MobileSidebarTrigger`/`PageHeader`, en vez de una segunda navegación
  paralela para pantallas chicas. `logout()` de Sprint 1 sigue viviendo
  dentro de ese mismo `Sidebar`, no duplicado. `src/app/layout.tsx`
  monta `SidebarProvider` + `AppSidebar` + `SidebarInset` una sola vez,
  responsive internamente (no con dos árboles `hidden md:flex`/`md:hidden`
  como el plan original). `NAV_ITEMS` hoy solo tiene "Inicio" (`/`) y
  "Usuarios" (`/usuarios`, S2-9) — no hay más pantallas reales
  todavía; sprints futuros amplían la lista según se construyan las
  pantallas de Galpones/Lotes (Sprint 3) en adelante, todas con ruta
  plana (ver nota de S2-1). Verificado en vivo (curl +
  cookie jar, mismo método que S2-9): con sesión de `gerente` el HTML trae
  "Inicio", "Usuarios" y exactamente un "Cerrar sesión" (no duplicado); con
  un Operario temporal (creado y borrado para la prueba) el nav omite
  "Usuarios" por completo y mantiene "Inicio"/"Salir". **Confirmado
  también en navegador real** en la misma sesión posterior: exactamente un
  "Cerrar sesión" visible en el Sidebar (desktop), sin el placeholder de
  Sprint 1 duplicado
- [x] S2-11 — `tests/integration/rbac/proxy-guard.test.ts`: 5 casos contra
  el guard por rol real de `src/proxy.ts` (mock de `auth` como HOC — el
  mock devuelve el handler sin envolver, así el default export de
  `proxy.ts` es exactamente el callback escrito a mano, invocado con un
  `req` simulado con `.auth` ya resuelto), actualizados a la ruta plana
  real (`/usuarios`, no `/gestion`/`/operacion` — ver nota de S2-1): 403 a
  OPERARIO en `/usuarios`, pasa GERENTE en `/usuarios`, sin restricción en
  rutas sin regla explícita en `RUTAS_POR_ROL` (p. ej. `/`), sin sesión
  redirige a `/login` antes de llegar al chequeo de rol, y el rate limit
  operativo (429) sigue aplicando incluso a un GERENTE ya autorizado por
  rol. El
  resto del alcance original de esta tarea ya estaba cubierto de sprints
  anteriores en este mismo sprint: `withAuth` en S2-3 (11 casos),
  `puedeDesactivarUsuario` en S2-7 (4 casos), flujo CRUD completo
  (crear/editar/desactivar + revocación de sesiones) en S2-8 (12 casos)

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` pasa sin errores —
  63/63 tests al cerrar S2-11 (65 según el resumen de cierre en
  `memory/estado-proyecto.md` — discrepancia preexistente sin resolver,
  no introducida en sesiones posteriores). Total actual del repo, tras
  sumar 2 tests de unicidad al editar nombre de usuario en una sesión
  posterior: **64/64**, verificado de nuevo antes de este cierre
- [x] `npx prisma validate` pasa sin errores (sin cambios de schema en
  todo el sprint, como estaba previsto) — verificado al cerrar S2-11
- [x] Un Operario autenticado recibe 403 real (verificado contra servidor
  corriendo, no solo test) al pedir `/usuarios` (ruta plana — ver nota en
  S2-1 sobre el cambio de esquema) — probado dos
  veces contra `npm run dev` con un usuario Operario real (creado y
  borrado con un script, S2-9 y S2-10), más 5 tests de integración en S2-11
- [x] Una Server Action de usuarios invocada directamente (sin pasar por la
  UI) con una sesión de rol OPERARIO es rechazada por `withAuth` —
  `tests/integration/actions/usuario.test.ts` ("rechaza si quien invoca no
  es GERENTE, sin llegar a tocar el repository")
- [x] Desactivar un usuario con sesión abierta revoca esa `SesionActiva` de
  inmediato — **verificado en navegador real** (extensión Claude in Chrome
  conectada en una sesión posterior): se creó `browser.test.op` desde el
  diálogo "Nuevo usuario" en vivo, se le inició sesión real por `curl`
  (`SesionActiva.revocada: false` confirmado por script antes del clic), se
  hizo clic en "Desactivar" en la tabla real, y se confirmó por script que
  esa misma fila pasó a `revocada: true` con `revocadaEn` seteado —
  end-to-end, click real → fila real en Neon
- [x] Intentar desactivar el propio usuario, y desactivar al último Gerente
  activo, quedan bloqueados — **verificado en navegador real**, ambas
  variantes: con `gerente` como único Gerente ACTIVO, clic en su propio
  "Desactivar" mostró "Debe quedar al menos un Gerente activo."; tras crear
  un segundo Gerente (`browser.test.ger2`) desde la UI, el mismo clic en
  "Desactivar" sobre `gerente` mostró el mensaje genérico "No podés
  desactivar tu propio usuario." — confirma en vivo el orden de guards
  corregido en S2-7
- [x] El botón de logout placeholder de Sprint 1 ya no está montado en
  `layout.tsx`; el logout funciona desde el Shell nuevo — confirmado por
  curl+cookie jar contra servidor real: el HTML trae exactamente un
  "Cerrar sesión" (dentro del `Sidebar`, tanto en desktop como en el
  drawer mobile — ver nota de S2-10 sobre el reemplazo de BottomNav),
  nunca duplicado ni junto al placeholder viejo; el mecanismo de logout en
  sí (`server/actions/auth.ts`) ya se verificó end-to-end en Sprint 1 y no
  se tocó en este sprint
- [x] Al menos una mutación real (crear usuario) deja una fila verificable
  en `AuditLog` con los campos esperados — verificado con un script
  temporal contra Neon real (no mock): fila creada, leída de vuelta con
  `estadoDespues` (JSON) íntegro y `usuarioId` respetando la FK a
  `Usuario`, y borrada al terminar
- [x] Ningún componente ni Server Action de este sprint importa Prisma
  directamente (solo `server/repositories/`) — confirmado por revisión de
  imports; `server/actions/usuario.ts` importa `Prisma` (el namespace de
  tipos/errores de `@prisma/client`, para `PrismaClientKnownRequestError`),
  no el cliente (`prisma` de `@/lib/prisma`) — no ejecuta queries
- [x] Shell probado en navegador real (desktop) — Sidebar visible con
  "Inicio"/"Usuarios"/"Cerrar sesión" (ya no hay BottomNav — ver nota de
  S2-10). El viewport móvil real se terminó verificando en una sesión
  posterior de diseño de frontend, directo desde el celular del Product
  Owner (mismo motivo de siempre: `resize_window` no cambia el viewport
  lógico en este entorno) — ahí se encontraron y corrigieron varios
  problemas reales de mobile (el trigger del Sidebar tapaba el título, la
  tabla no daba indicio de scroll horizontal, un formulario largo no tenía
  scroll interno propio). Detalle completo en `memory/estado-proyecto.md`,
  sección "Identidad visual y ajustes de mobile"

### Bugs reales encontrados y corregidos durante la verificación en navegador
Además del reorder de `puedeDesactivarUsuario` (documentado arriba en
S2-7), verificar en un navegador real encontró un segundo bug real:

**`UsuarioFormDialog` mostraba una advertencia de Base UI en consola al
guardar una edición** ("A component is changing the default value state
of an uncontrolled FieldControl after being initialized"). Causa: Base UI
mantiene el contenido del `Dialog` montado durante su animación de cierre;
`setOpen(false)` + `router.refresh()` se disparan casi al mismo tiempo al
guardar con éxito, y las props nuevas (con los datos ya actualizados)
llegan a los inputs no controlados mientras el Popup todavía está
cerrando. No afectaba el dato mostrado en la *siguiente* apertura (se
remonta desde cero y lee las props correctas), pero sí generaba la
advertencia y dejaba una ventana de inconsistencia interna. Corregido
gateando el `<form>` completo detrás de `{open ? (...) : null}` en
`usuario-form-dialog.tsx`, para que los inputs se desmonten en el mismo
tick en que `open` pasa a `false`, antes de que el `router.refresh()`
asíncrono pueda alcanzarlos. Verificado en vivo: mismo flujo de edición
repetido después del fix, cero mensajes en consola.

### Hallazgos que NO son bugs de este sprint (documentados para no reabrir)
- **Neon cerró una conexión a mitad de sesión** (`Can't reach database
  server`, dentro de `registrarActividad`/heartbeat del `IdleTimer`)
  durante las pruebas en navegador — mismo riesgo ya aceptado en D6
  (`memory/decisiones-tecnicas.md`) y ya documentado como real (no solo
  teórico) en `memory/estado-proyecto.md` desde Sprint 1. No requiere
  acción de este sprint.
- **`.prettierrc.json` declara `singleQuote: true`, pero el 100% del
  código real del repo (84/84 archivos, incluidos los de Sprint 0 y 1) usa
  comillas dobles.** `npm run format:check` falla sobre casi todo el
  repo — parece que nunca se ejecutó/aplicó desde que se creó el config,
  y no está en la lista de comandos obligatorios antes de commit de
  `CLAUDE.md` (que solo pide typecheck/lint/test). No es un problema de
  Sprint 2 ni algo que haya tocado — se dejó **sin decidir** a propósito:
  reformatear los 84 archivos a comillas simples (para que coincida con
  el config) o corregir el config a `singleQuote: false` (para que
  coincida con el código real) es una decisión del Product Owner, no algo
  para resolver de paso. Ver mensaje del cierre de sesión.
