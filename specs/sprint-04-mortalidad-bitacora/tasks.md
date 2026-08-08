# Tareas — Sprint 4

- [x] S4-1 — `server/repositories/lote.ts`: agregado `listarLotesActivos()`
  (id, codigo, avesVivas de lotes ACTIVO, orden por código) para poblar el
  `<Select>` de lote del formulario de mortalidad. Implementado tal cual
  el diseño de plan.md. Verificado `npm run typecheck && npm run lint &&
  npm test` (121/121) en verde tras el cambio — nada existente se rompió.

- [x] S4-2 — `lib/zod/mortalidad.ts` (`crearRegistroMortalidadSchema`,
  `loteId` con `idUuid()`, `tipo` enum MUERTE/DESCARTE, `cantidad` entero
  positivo) + `server/repositories/mortalidad.ts` (`AvesInsuficientesError`,
  `registrarMortalidadYDescontarAves` con transacción interactiva —
  primera del proyecto, ver plan.md para el detalle completo del porqué —
  `listarRegistrosMortalidad`, `contarRegistrosMortalidad`) +
  `server/services/mortalidad.ts` (`puedeRegistrarMortalidad`, reusando
  `GuardResultado` de `server/services/galpon.ts`). Implementado tal cual
  el diseño de plan.md, sin desvíos. Verificado
  `npm run typecheck && npm run lint && npm test` (121/121) en verde —
  todavía sin tests nuevos para estas piezas (llegan en S4-10/S4-11), solo
  se confirmó que no rompieron nada existente.

- [x] S4-3 — `server/actions/mortalidad.ts`: `registrarMortalidad` vía
  `withAuth({ schema: crearRegistroMortalidadSchema, entidad:
  "RegistroMortalidad", accion: "CREAR" })`, **sin** `rol` (GERENTE y
  OPERARIO habilitados por igual — confirmado que `withAuth` soporta
  omitir `rol` para "alcanza con estar autenticado"). Resuelve el lote,
  valida `puedeRegistrarMortalidad`, resuelve el galpón vía
  `buscarUbicacionActual` (rechaza si no hay ubicación abierta —
  defensivo), llama `registrarMortalidadYDescontarAves` y traduce
  `AvesInsuficientesError` a un `AccionError` con mensaje claro.
  Implementado tal cual el diseño de plan.md. Verificado
  `npm run typecheck && npm run lint && npm test` (121/121) en verde — los
  tests de integración de esta action llegan en S4-11.

- [x] S4-4 — `components/ui/textarea.tsx` **diferido a S4-7** (no hace
  falta para el formulario de mortalidad: lote/tipo son `<Select>`,
  cantidad es un `<Input type="number">`). Pantalla
  `app/(app)/mortalidad/page.tsx` (sin guard de rol — cualquier usuario
  autenticado entra, a diferencia de usuarios/galpones/lotes, ni entrada
  en `RUTAS_POR_ROL`) + `components/domain/mortalidad/registrar-mortalidad-sheet.tsx`
  (`<Sheet side="bottom">`, con `max-h-[85dvh] overflow-y-auto` agregado
  a mano — a diferencia de `<DialogContent>`, `SheetContent` con
  `side="bottom"` no trae tope de altura por defecto —, `<Select>` de
  lote controlado mostrando "código — N vivas", `<Select>` de tipo
  controlado, input de cantidad `inputMode="numeric"`, `useActionState` +
  `registrarMortalidad`, formulario gateado detrás de `{open ? (...) :
  null}` — mismo fix que el Bug 3 de Sprint 3, aplicado desde el
  principio en vez de encontrarlo después) +
  `components/domain/mortalidad/mortalidad-tabla.tsx` (columnas Fecha /
  Lote / Galpón / Tipo (badge `variant="outline"`, sin receta nueva en
  `globals.css`) / Cantidad / Registrado por, `<TableScrollArea>`, sin
  acciones). Botones de esta pantalla en `size="lg"` (pantalla de campo,
  no `size="md"` de gestión de escritorio). Verificado
  `npm run typecheck && npm run lint && npm test` (121/121) y
  `npm run build` en verde — `/mortalidad` aparece como ruta real del
  build, confirmando que ningún import de servidor se filtra a un
  componente cliente.

- [x] S4-5 — `lib/zod/bitacora.ts` (`crearNotaBitacoraSchema`,
  `obtenerMasBitacoraSchema` con `cursorId` opcional vía `idUuid()`,
  `categoria`/`desde`/`hasta` opcionales) +
  `server/repositories/bitacora.ts` (`crearNotaBitacora`,
  `listarBitacoraPagina` con cursor + `orderBy` compuesto `[{fecha:
  "desc"}, {id: "desc"}]` + filtros de categoría/rango de fecha).
  Implementado tal cual el diseño de plan.md. Verificado
  `npm run typecheck && npm run lint && npm test` (121/121) en verde.

- [x] S4-6 — `server/actions/bitacora.ts`: `crearNotaBitacora` vía
  `withAuth` (sin `rol`, mismo criterio que mortalidad) y
  `obtenerMasBitacora` como Server Action liviana **sin** `withAuth`
  (verifica `auth()` a mano, valida con `obtenerMasBitacoraSchema`, sin
  `AuditLog` — ver decisión de diseño documentada en spec.md/plan.md).
  Implementado tal cual el diseño de plan.md. Verificado
  `npm run typecheck && npm run lint && npm test` (121/121) en verde.

- [x] S4-7 — `components/ui/textarea.tsx` (nuevo — no había primitivo de
  Textarea en `@base-ui/react`, `<textarea>` nativo estilado igual que
  `input.tsx`). `PAGE_SIZE_MURO` (20) agregado a `lib/constants.ts`,
  compartido entre `server/actions/bitacora.ts`, `page.tsx` y
  `bitacora-muro.tsx` para que no puedan desincronizarse. Pantalla
  `app/(app)/bitacora/page.tsx` (sin guard de rol, lee `searchParams` de
  categoría/fecha, saneadas contra una lista fija de categorías válidas y
  contra `Number.isNaN` antes de tocar Prisma — `searchParams` es un
  límite de entrada externo; `desde`/`hasta` se resuelven a inicio/fin de
  día con offset fijo `-05:00`, D5) +
  `components/domain/bitacora/nueva-nota-bitacora-sheet.tsx`
  (`<Sheet side="bottom">`, `<Select>` de categoría + `<Textarea>` de
  contenido, mismo patrón de gateo que mortalidad) +
  `components/domain/bitacora/bitacora-filtros.tsx` (categoría + rango de
  fecha, actualiza la URL vía `useRouter`, sentinela `__TODAS__` para
  "sin filtro de categoría" en el `<Select>`) +
  `components/domain/bitacora/bitacora-muro.tsx` (lista de tarjetas +
  `IntersectionObserver` sobre una sentinela al final, llama
  `obtenerMasBitacora`, detiene el observer cuando una tanda trae menos de
  `PAGE_SIZE_MURO` items). **Ajuste no anticipado en plan.md:** la
  sincronización inicial de `itemsIniciales` al cambiar de filtro se
  había diseñado con un `useEffect` + `setState` — el linter de React lo
  marcó como anti-patrón real (renders en cascada). Corregido pasando un
  `key` derivado de los filtros desde `page.tsx` a `BitacoraMuro`: fuerza
  un remount completo en vez de sincronizar props → state a mano.
  Verificado `npm run typecheck && npm run lint && npm test` (121/121) y
  `npm run build` en verde — `/bitacora` aparece como ruta real del
  build.

- [x] S4-8 — `components/layout/nav-items.ts`: agregadas "Mortalidad"
  (ícono `Skull`) y "Bitácora" (ícono `NotebookPen`) a `NAV_ITEMS` —
  confirmado antes (`npm ls lucide-react` → `1.28.0`, chequeo directo de
  `typeof icons.Skull`/`typeof icons.NotebookPen`) que ambos íconos
  existen en la versión instalada, mismo chequeo que Sprint 3 hizo con
  `Warehouse`/`Layers3`. **`server/auth/rbac.ts` sin cambios** — releído
  `rolPermitidoParaRuta()`: una ruta ausente de `RUTAS_POR_ROL` devuelve
  `true` para cualquier rol, confirmado en el código antes de dar la
  tarea por cerrada, no asumido. Verificado
  `npm run typecheck && npm run lint && npm test` (121/121) en verde.

- [x] S4-9 — `memory/convenciones.md`: agregada sección "Tabla paginada
  vs. muro con scroll infinito" (cuándo usar cada patrón, incluyendo el
  hallazgo de S4-7 sobre `key` vs. `useEffect+setState` para resetear el
  muro al cambiar de filtro) y corregida la sección "Server Actions" para
  aclarar que `withAuth` es obligatorio para mutaciones, no para lecturas
  adicionales de un feed/scroll infinito (`obtenerMasBitacora` como
  referencia). **Ajuste no anticipado en plan.md:** de paso se agregaron
  dos reglas de Sprint 3 que habían quedado sin documentar en este
  archivo pese a haberse mencionado al planificar este sprint —
  `idUuid()` en vez de `z.string().uuid()` para cualquier id nuevo en Zod,
  y el `!` obligatorio en toda clase de `globals.css` que se combine con
  un `variant` de `<Badge>` — cerrando ese cabo suelto en el mismo cambio.
  Sin cambios de código de aplicación en esta tarea. Verificado
  `npm run typecheck && npm run lint && npm test` (121/121) en verde
  (no debería verse afectado por un cambio de documentación, confirmado
  igual).

- [x] S4-10 — `tests/unit/services/mortalidad.test.ts`:
  `puedeRegistrarMortalidad` — lote INACTIVO rechazado, cantidad >
  avesVivas rechazado (mensaje incluye el número real de aves vivas),
  cantidad == avesVivas exacto permitido (dejar el lote en 0 es válido),
  cantidad con margen permitido. 4 tests nuevos, `npm run typecheck && npm
  run lint && npm test` (125/125) en verde.

- [x] S4-11 — `tests/integration/actions/mortalidad.test.ts`
  (repositories mockeados, mismo patrón que
  `tests/integration/actions/lote.test.ts`): rechaza lote inexistente,
  rechaza lote INACTIVO (sin siquiera resolver la ubicación), rechaza
  cantidad > avesVivas (sin llegar a llamar
  `registrarMortalidadYDescontarAves`), rechaza defensivamente si el lote
  ACTIVO no tiene ubicación abierta, traduce `AvesInsuficientesError`
  mockeada a un mensaje claro (simulando la carrera sin necesitar dos
  requests reales), confirma el flujo feliz con `AuditLog`
  (`entidad: "RegistroMortalidad"`) y que el `galponId` grabado es el de
  `buscarUbicacionActual`, y confirma que un OPERARIO puede registrar
  igual que un GERENTE (sin restricción de rol) — 7 tests.
  `tests/integration/actions/bitacora.test.ts`: `crearNotaBitacora`
  rechaza contenido vacío/solo-espacios (vía Zod) sin tocar el
  repository, confirma el flujo feliz con `AuditLog`
  (`entidad: "BitacoraGlobal"`) y que un OPERARIO puede crear notas sin
  restricción de rol; `obtenerMasBitacora` rechaza sin sesión, rechaza un
  `cursorId` con formato inválido, y devuelve los items del repository
  mockeado sin tocar `AuditLog` — 6 tests. 13 tests nuevos, 138/138 en
  verde (`npm run typecheck && npm run lint && npm test`).

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` pasa sin errores
  (138/138), corrido de nuevo al cerrar (no solo durante cada tarea).
- [x] `npx prisma validate` pasa sin errores — confirma que, en efecto, no
  hizo falta ninguna migración este sprint.
- [x] `npm run build` completo sin errores — `/mortalidad` y `/bitacora`
  aparecen como rutas reales del build junto con `/galpones`, `/lotes`,
  `/usuarios`; ningún import de servidor se filtra a un componente
  cliente.
- [x] Verificado en vivo contra Neon real, con dos scripts temporales
  (`verificar-sprint4-temp.ts` y `verificar-sprint4-inactivo-temp.ts`,
  mismo criterio que Sprints 2-3: llaman a las funciones reales de
  repository/service, no las reimplementan; borrados al terminar, dato de
  prueba en 0 al final):
  - Un lote ACTIVO real recibió un `RegistroMortalidad` de tipo MUERTE
    (10→7) y otro DESCARTE (7→5) — `avesVivas` decrementado
    correctamente por ambos, mismo criterio para los dos tipos.
  - Un intento de registrar 100 mortalidad con 5 aves vivas fue rechazado
    (`AvesInsuficientesError`), `avesVivas` quedó exactamente igual.
  - **Guard anti-carrera forzado de verdad, no solo mockeado:** dos
    llamadas concurrentes de 3 aves c/u contra un lote con 5 vivas
    (individualmente caben, combinadas no) — exactamente 1 tuvo éxito, la
    otra lanzó `AvesInsuficientesError`, `avesVivas` quedó en 2 (nunca
    negativo), y quedaron exactamente 3 `RegistroMortalidad` para el
    lote, no 4. **Hallazgo importante de infraestructura, no un bug:**
    esto confirma que la transacción interactiva (primera del proyecto)
    funciona correctamente incluso con `DATABASE_URL` apuntando al
    connection pooler de Neon (`-pooler`, PgBouncer en modo transaction)
    — un riesgo real que se planteó en plan.md antes de ejecutar, ahora
    despejado con evidencia, no solo con lectura de documentación de
    Prisma/Neon.
  - Un lote INACTIVO real (finalizado con `finalizarLote()`, no un objeto
    armado a mano) fue rechazado por `puedeRegistrarMortalidad`.
  - El `RegistroMortalidad` posterior a una mudanza real (`mudarLote()`)
    quedó con el `galponId` del galpón nuevo; el registro anterior a la
    mudanza conservó el galpón viejo — confirma que `buscarUbicacionActual`
    se resuelve en el momento de cada registro, no una sola vez.
  - Una nota de `BitacoraGlobal` real no tiene ningún campo de galpón
    (D2). `listarBitacoraPagina` ejercitada con datos reales: una segunda
    tanda pedida con el `cursorId` de la última nota de la primera no
    repitió ninguna fila; el filtro de categoría trajo solo notas de esa
    categoría entre las de prueba.
  - Filas reales de `AuditLog` verificadas (creadas con `crearAuditLog()`
    real, leídas de vuelta) para `entidad: "RegistroMortalidad"` y
    `entidad: "BitacoraGlobal"`.
  - `obtenerMasBitacora` sin sesión: cubierto por el test de integración
    de S4-11 (rechaza antes de tocar el repository) — no depende de
    ningún comportamiento específico de la base real, no ameritaba un
    chequeo en vivo aparte.
- [x] Un Operario autenticado real (no solo test) accede a `/mortalidad` y
  `/bitacora` sin ser rechazado — verificado con curl+cookie jar (login
  real vía el flujo CSRF de Auth.js) contra el servidor de desarrollo, con
  un usuario Operario y un Gerente temporales (`operario.test.s4`/
  `gerente.test.s4`, creados y borrados con un script, mismo criterio que
  Sprint 3). Resultado: Operario → `/mortalidad` 200, `/bitacora` 200,
  `/usuarios` 403 (control); Gerente → las tres 200 (control) — confirma
  que ambas pantallas están realmente abiertas a los dos roles, y que el
  RBAC de `/usuarios` sigue intacto (no es que la sesión tenga acceso
  total por error).
- [x] Verificación clic a clic con la extensión Claude in Chrome —
  **primera vez que el proyecto verifica pantallas pensadas desde el
  inicio para el Operario en campo**, no una adaptación responsive de una
  pantalla de Gerente. Verificado contra el servidor de desarrollo real
  (reusando una sesión `npm run dev` ya activa del Product Owner, sin
  interrumpirla — se probó con esa sesión Gerente en vez de forzar un
  cambio de sesión), con datos de prueba aislados (galpón/lote/usuario
  temporales + 25 notas de Bitácora, todo borrado al terminar):
  - `/bitacora`: scroll infinito ejercitado de punta a punta con datos
    reales (25 notas, `PAGE_SIZE_MURO=20`) — cargó ambas tandas sin saltos
    y mostró "No hay más notas." al final, sin quedar pidiendo tandas
    vacías en bucle. Filtro de categoría probado en vivo: actualiza la URL
    (`?categoria=VACUNACION`) y el muro remontado muestra solo esa
    categoría. `<Sheet side="bottom">` de "Nueva nota" completado y
    guardado: toast "Nota guardada", Sheet se cierra solo, filtro se
    mantiene intacto tras guardar.
  - `/mortalidad`: `<Sheet side="bottom">` de "Registrar mortalidad"
    completo — `<Select>` de lote muestra "código — N vivas" legible (no
    un id crudo, Bug 2 de Sprint 3 no se repitió), `<Select>` de tipo
    legible ("Muerte"/"Descarte"), guardado con éxito: toast "Mortalidad
    registrada / 4 aves", tabla refrescada mostrando el galpón resuelto
    automáticamente sin que se haya elegido a mano.
  - **Hallazgo no-bug:** una captura de pantalla tomada exactamente en el
    instante de apertura del `<Sheet>` mostró el panel angosto a la
    izquierda, superpuesto con el Sidebar — parecía un bug de
    posicionamiento. Inspeccionado el DOM real (`getBoundingClientRect`,
    `data-side`) durante ese mismo instante: la posición y el ancho
    (`inset-x-0`, `bottom-0`, `data-side="bottom"`) ya eran correctos:
    era un artefacto de captura a mitad de la animación de entrada
    (`data-starting-style`), no un problema real de la aplicación —
    confirmado con una segunda captura ya asentada.
  - `resize_window` no se usó (confirmado sin efecto en este entorno
    desde Sprint 1) — la verificación se hizo clic a clic en el tamaño de
    ventana real de la extensión, no pixel-perfect en un viewport móvil
    exacto. Queda para el Product Owner, si lo considera necesario,
    confirmar además en su celular físico (mismo camino que Sprints 1-2).
- [x] Ningún componente ni Server Action de este sprint importa Prisma
  directamente — confirmado con `grep -r 'from "@/lib/prisma"' src`: solo
  aparecen los 6 archivos de `server/repositories/` (`auditLog.ts`,
  `bitacora.ts`, `galpon.ts`, `lote.ts`, `mortalidad.ts`, `sesion.ts`,
  `usuario.ts`).
- [x] `memory/convenciones.md` actualizado (S4-9) con las dos secciones
  nuevas, más las dos reglas de Sprint 3 que habían quedado sin
  documentar (`idUuid()`, `!` en badges combinados con `variant`).
- [x] `memory/estado-proyecto.md` actualizado al cerrar: nueva sección de
  Sprint 4 completa (decisiones de negocio, la transacción interactiva
  como decisión de arquitectura, verificación en vivo, el hallazgo no-bug
  de la captura a mitad de animación, deuda pendiente de celular físico),
  "Resumen ejecutivo", "Registro de cierre de sprints" y "Cómo continuar
  desde acá" (apuntando a Sprint 5) actualizados.
- [x] `specs/roadmap-completo.md` actualizado: Sprint 4 marcado como
  completado (✅), progreso "5 de 16 sprints (31%)", R1 "5/8".
