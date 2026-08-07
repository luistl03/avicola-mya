# Tareas — Sprint 3

- [x] S3-1 — Migración de schema: agregado `enum EstadoGalpon`
  (ACTIVO/INACTIVO) y `Galpon.estado EstadoGalpon @default(ACTIVO)` +
  `@@index([estado])` en `prisma/schema.prisma`. Migración
  `20260807161831_galpon_estado` aplicada contra Neon real (`ALTER TABLE
  ... ADD COLUMN estado ... DEFAULT 'ACTIVO'` + `CREATE INDEX` — no
  destructiva, cualquier fila de Galpon ya existente queda ACTIVO por el
  default). `npx prisma validate` en verde. Actualizado
  `tests/factories/galpon.factory.ts` (`makeGalpon`) con `estado:
  "ACTIVO"`. Verificado además `npm run typecheck && npm run lint && npm
  test` (64/64) en verde tras el cambio — nada del código existente
  quedó roto por el campo nuevo.
- [x] S3-2 — `lib/zod/galpon.ts` (`crearGalponSchema`,
  `editarGalponSchema`, `cambiarEstadoGalponSchema`) +
  `server/repositories/galpon.ts` (`crearGalpon`, `actualizarGalpon`,
  `cambiarEstadoGalpon`, `buscarGalponPorId`, `obtenerOcupacionGalpon`,
  `listarGalponesActivos`, `listarGalponesConOcupacion`, `contarGalpones`)
  + `server/services/galpon.ts` (`puedeAlojarEnGalpon`,
  `puedeDesactivarGalpon`, `puedeReducirCapacidad`, guards puras).
  Implementado tal cual el diseño de plan.md, sin desvíos. Verificado
  `npm run typecheck && npm run lint && npm test` (64/64) en verde —
  todavía no hay tests nuevos para estos services (llegan en S3-11), solo
  se confirmó que no rompieron nada existente.
- [x] S3-3 — `server/actions/galpon.ts`: `crearGalpon`, `editarGalpon`,
  `cambiarEstadoGalponAction`, todas vía `withAuth({ rol: "GERENTE", ... })`.
  `editarGalpon` valida `puedeReducirCapacidad` contra la ocupación real
  antes de guardar; `cambiarEstadoGalponAction` valida
  `puedeDesactivarGalpon` antes de pasar a INACTIVO y es no-op si ya está
  en el estado pedido (mismo patrón que `cambiarEstadoUsuarioAction`).
  Implementado tal cual el diseño de plan.md. Verificado
  `npm run typecheck && npm run lint && npm test` (64/64) en verde — los
  tests de integración de estas actions llegan en S3-12.
- [x] S3-4 — Clases `.badge-estado-activo`/`.badge-estado-inactivo` en
  `src/app/globals.css` (`@layer components`, reusando los tonos ya
  aprobados de `.toast-success`/neutro). Pantalla `app/(app)/galpones/page.tsx`
  (guard de rol redundante + `PageHeader` + `DataTablePagination`,
  `PAGE_SIZE = 10`) + `components/domain/galpones/galpon-form-dialog.tsx`
  (crear/editar, mismo esqueleto que `UsuarioFormDialog`) +
  `components/domain/galpones/galpones-tabla.tsx` (columnas Nombre /
  Capacidad máxima / Ocupación actual / Lotes alojados / Estado /
  Acciones, `TableScrollArea`). Implementado tal cual el diseño de
  plan.md — `GalponesTabla` reconstruye a mano el tipo de
  `listarGalponesConOcupacion` con tipos de `@prisma/client` (no importa
  el repository desde un componente cliente, mismo criterio que
  `UsuariosTabla`). Verificado `npm run typecheck && npm run lint && npm
  test` (64/64) en verde — confirma además que los íconos `Warehouse`/
  `Ruler` de `lucide-react` existen en la versión instalada. Verificación
  en navegador real (clic a clic) queda para S3-13, junto con `/lotes`,
  una vez cableado `proxy.ts` en S3-5.
- [x] S3-5 — `server/auth/rbac.ts`: agregado `{ ruta: "/galpones", roles:
  ["GERENTE"] }` a `RUTAS_POR_ROL`. `components/layout/nav-items.ts`:
  agregada entrada "Galpones" (ícono `Warehouse`) a `NAV_ITEMS`.
  `/galpones` ya queda protegida por el guard de rol real de `proxy.ts`
  (403 a OPERARIO), no solo por el `notFound()` de la página. Verificado
  `npm run typecheck && npm run lint && npm test` (64/64) en verde —
  `tests/unit/auth/rbac.test.ts` (Sprint 2, no exhaustivo sobre la lista)
  sigue pasando sin cambios; casos específicos de `/galpones` se agregan
  en S3-11/S3-12.
- [x] S3-6 — `lib/zod/lote.ts` (`crearLoteSchema`, `mudarLoteSchema`,
  `finalizarLoteSchema`) + `server/repositories/lote.ts`
  (`crearLoteConUbicacion`, `mudarLote`, `finalizarLote`,
  `buscarLotePorId`, `buscarLotePorCodigo`, `buscarUbicacionActual`,
  `listarLotesConUbicacion`, `contarLotes`) +
  `server/services/lote.ts` (`puedeMudarLote`, `puedeFinalizarLote`,
  guards puras). Implementado tal cual el diseño de plan.md — verificado
  con un script suelto que `z.coerce.date({ message: ... })` funciona
  como se esperaba en la versión de Zod instalada (v4.4.3) antes de
  confiar en la sintaxis. Verificado `npm run typecheck && npm run lint
  && npm test` (64/64) en verde.
- [x] S3-7 — `server/actions/lote.ts`: `crearLote` vía `withAuth`.
  Valida código único (chequeo previo + catch `P2002`, mismo patrón que
  `crearUsuario`) y capacidad/estado del galpón destino con
  `puedeAlojarEnGalpon` antes de llamar `crearLoteConUbicacion`.
  Ajuste no anticipado en plan.md: `estadoDespues` no puede llevar
  `fechaIngreso` como `Date` directo (Prisma exige `InputJsonValue` para
  ese campo de `AuditLog`) — se serializa con `.toISOString()` antes de
  devolverlo. Verificado `npm run typecheck && npm run lint && npm test`
  (64/64) en verde.
- [x] S3-8 — `server/actions/lote.ts`: `mudarLoteAction` (combina
  `puedeMudarLote` + `puedeAlojarEnGalpon` contra la ocupación real del
  destino antes de llamar `mudarLote`) y `finalizarLoteAction` (valida
  `puedeFinalizarLote` antes de llamar `finalizarLote`). Implementado tal
  cual el diseño de plan.md, agregado al mismo archivo que `crearLote`
  (S3-7). Verificado `npm run typecheck && npm run lint && npm test`
  (64/64) en verde — los tests de integración de estas tres actions
  llegan en S3-12.
- [x] S3-9 — Pantalla `app/(app)/lotes/page.tsx` (fetch de
  `listarGalponesActivos` + `listarLotesConUbicacion`/`contarLotes`,
  `PageHeader` + `DataTablePagination`) +
  `components/domain/lotes/lote-form-dialog.tsx` (alta, con `<Select>`
  de galpón destino) + `components/domain/lotes/mudanza-dialog.tsx`
  (`<Select>` de galpón destino excluyendo el actual) +
  `components/domain/lotes/finalizar-lote-dialog.tsx` (confirmación con
  `Dialog`, no `window.confirm`) +
  `components/domain/lotes/lotes-tabla.tsx` (columnas Código / Fecha
  ingreso / Aves iniciales / Aves vivas / Ubicación actual / Estado /
  Acciones, `TableScrollArea`, acciones solo visibles si `estado ===
  "ACTIVO"`). `fechaIngreso` se muestra con
  `toLocaleDateString("es-PE", { timeZone: "America/Lima" })` (D5).
  `FinalizarLoteDialog` usa `useTransition` + llamada directa a la action
  (mismo patrón que el botón Activar/Desactivar de
  Usuarios/GalponesTabla), no un `<form>` con `useActionState`, porque no
  tiene campos que completar. Verificado `npm run typecheck && npm run
  lint && npm test` (64/64) en verde, y además `npm run build` (Next
  16/Turbopack) completo sin errores — confirma que no hay ningún import
  de servidor filtrándose a un componente cliente a través del límite de
  RSC, algo que `tsc --noEmit` solo no garantiza. `/galpones` y `/lotes`
  aparecen listadas como rutas reales del build.
- [x] S3-10 — `server/auth/rbac.ts`: agregado `{ ruta: "/lotes", roles:
  ["GERENTE"] }`. `components/layout/nav-items.ts`: agregada entrada
  "Lotes" (ícono `Layers3`) a `NAV_ITEMS`. `/lotes` ya queda protegida
  por el guard de rol real de `proxy.ts`. Verificado `npm run typecheck
  && npm run lint && npm test` (64/64) en verde.
- [x] S3-11 — `tests/unit/services/galpon.test.ts`: `puedeAlojarEnGalpon`
  (galpón inactivo, capacidad exacta al límite, capacidad excedida,
  capacidad con margen), `puedeDesactivarGalpon` (con/sin lotes
  alojados), `puedeReducirCapacidad` (por debajo/por encima/igual a la
  ocupación). `tests/unit/services/lote.test.ts`: `puedeMudarLote` (lote
  INACTIVO, mismo galpón origen/destino, caso válido),
  `puedeFinalizarLote` (ya INACTIVO, caso válido). Nota sobre el último
  ítem previsto ("con y sin avesVivas > 0"): `puedeFinalizarLote` no
  recibe `avesVivas` como parámetro — por diseño (decisión de negocio
  confirmada en spec.md) nunca lo evalúa, así que ambos casos son el
  mismo `permitido: true`; se documentó eso en el test en vez de escribir
  dos casos idénticos. 15 tests nuevos, 79/79 en verde
  (`npm run typecheck && npm run lint && npm test`).
- [x] S3-12 — `tests/integration/actions/galpon.test.ts` (repositories
  mockeados, mismo patrón que `usuario.test.ts`): rechaza OPERARIO en
  las tres actions sin tocar el repository, `crearGalpon` feliz + con
  `AuditLog`, `editarGalpon` rechaza galpón inexistente y reducir
  capacidad por debajo de la ocupación (y guarda cuando sí alcanza),
  `cambiarEstadoGalponAction` rechaza desactivar con lotes alojados,
  desactiva un galpón vacío, reactiva sin consultar ocupación y es no-op
  si ya está en el estado pedido — 10 tests.
  `tests/integration/actions/lote.test.ts`: rechaza OPERARIO en las tres
  actions, `crearLote` rechaza código duplicado (chequeo previo y catch
  P2002), galpón inexistente/inactivo y capacidad excedida, y confirma
  la creación feliz con AuditLog; `mudarLoteAction` rechaza lote
  inexistente/INACTIVO, mismo galpón, galpón destino
  inexistente/inactivo y capacidad excedida, y confirma la transacción
  feliz; `finalizarLoteAction` rechaza lote inexistente y re-finalizar,
  y confirma que permite finalizar con avesVivas > 0 — 19 tests. 29
  tests nuevos, 108/108 en verde
  (`npm run typecheck && npm run lint && npm test`). Las guards puras de
  `services/galpon.ts`/`services/lote.ts` no se mockean en ninguno de los
  dos archivos — se ejercitan reales a través de la action, mismo
  criterio que `usuario.test.ts` con `puedeDesactivarUsuario`.
- [x] S3-13 — Verificación final del sprint (ver checklist abajo).

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` pasa sin errores —
  108/108 tests, corrido de nuevo al cerrar (no solo durante cada tarea).
- [x] `npx prisma validate` pasa sin errores tras la migración de S3-1 —
  revalidado al cerrar.
- [x] Un Operario autenticado recibe 403 real (contra `npm run dev`, no
  solo test) al pedir `/galpones` y `/lotes` — verificado con un
  Gerente y un Operario **temporales** (`gerente.test.s3`/
  `operario.test.s3`, creados y borrados con un script, igual que
  Sprint 2 hizo con sus usuarios de prueba): login real por
  curl+cookie jar, Gerente → `200` en ambas rutas, Operario → `403`
  real con `{"error":"No autorizado."}` en `/galpones`, `/lotes` y
  `/usuarios` (control). **Hallazgo no-bug, confirma algo ya
  documentado:** la cuenta real `gerente`/`Cambiar123!` del seed ya NO
  sirve para loguearse — su contraseña fue rotada en producción durante
  la sesión de seguridad post-Sprint 2 (`memory/estado-proyecto.md`,
  "Seguridad: revocar sesiones al resetear contraseña"). Por eso se
  usaron cuentas temporales en vez de la sembrada, evitando además tocar
  una cuenta real (mismo criterio de R2 en spec.md).
- [x] Una Server Action de galpón o lote invocada directamente con sesión
  OPERARIO es rechazada por `withAuth` sin tocar el repository —
  cubierto por los tests de integración de S3-12 (6 casos, dos por cada
  una de las 6 actions).
- [x] Verificado en vivo contra Neon real, con un script temporal
  (`verificar-sprint3-temp.ts`, borrado al terminar — mismo criterio que
  Sprint 2 usó para AuditLog/SesionActiva) que llama a las funciones
  REALES de repository/service, no las reimplementa:
  - Creados dos galpones y un lote real vía `crearLoteConUbicacion` —
    confirmada la fila de `HistorialUbicacionLote` con `fechaSalida:
    null` y `avesVivas = avesIniciales`.
  - Mudado el lote a un segundo galpón vía `mudarLote` — confirmado que
    la fila vieja quedó con `fechaSalida` seteada y la nueva con
    `fechaSalida: null` (exactamente 2 filas de historial, nunca 0 ni 2
    abiertas a la vez).
  - Intentado, con un `prisma.historialUbicacionLote.create` directo
    (no vía repository), abrir una segunda ubicación para el mismo lote
    sin cerrar la primera — **la base lo rechazó**, confirmando que el
    índice único parcial de S0-5 sigue vigente en el schema real.
  - `puedeAlojarEnGalpon` y `puedeDesactivarGalpon` ejercitados con
    números de ocupación reales leídos de `obtenerOcupacionGalpon`
    (no simulados): rechazo real de 11/10 aves y de desactivar un
    galpón con un lote alojado.
  - Finalizado el lote vía `finalizarLote` — confirmado `estado:
    INACTIVO` y ninguna ubicación abierta restante
    (`buscarUbicacionActual` devuelve `null`).
  - Todo el dato de prueba (2 galpones, 1 lote, su historial, 1 fila de
    AuditLog) borrado al final del mismo script; confirmado por conteo
    en cero antes de terminar.
- [x] Al menos una mutación de este sprint deja una fila verificable en
  `AuditLog` con `entidad: "Lote"`, `accion: "CREAR"` — verificado
  llamando a `crearAuditLog()` real (mismo método que Sprint 2: la
  función de repository real, no una fila armada a mano) y leyéndola de
  vuelta antes de borrarla.
- [x] Ningún componente ni Server Action de este sprint importa Prisma
  directamente — confirmado con
  `grep -r 'from "@/lib/prisma"' src`: solo aparecen los 5 archivos de
  `server/repositories/` (`galpon.ts`, `lote.ts`, `usuario.ts`,
  `sesion.ts`, `auditLog.ts`).
- [ ] `/galpones` y `/lotes` probadas en navegador real (clic a clic:
  crear galpón, dar de alta lote, mudarlo, finalizarlo) — **no hecho en
  esta sesión**, a pedido explícito: se verificó con scripts temporales
  contra Neon real (ver arriba) en vez de con la extensión Claude in
  Chrome. Mismo criterio que otros ítems de verificación visual de este
  proyecto (viewport móvil de Sprints 1-2): queda pendiente para una
  sesión posterior con la extensión conectada, o para que el Product
  Owner lo pruebe directo contra `npm run dev`/producción. No es deuda
  de lógica de negocio (esa parte ya está probada por S3-11, S3-12 y la
  verificación de Neon real de arriba) — es específicamente la
  experiencia de UI (diálogos, toasts, refresco de tabla) sin confirmar
  clic a clic todavía.
- [x] `memory/estado-proyecto.md` actualizado al cerrar: nueva sección de
  Sprint 3.
- [x] `specs/roadmap-completo.md` actualizado: Sprint 3 marcado como
  completado, progreso "4 de 16 sprints".
