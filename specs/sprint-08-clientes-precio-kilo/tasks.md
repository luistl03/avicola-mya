# Tareas — Sprint 8

Checklist de planificación — ninguna tarea está ejecutada todavía. Se tilda
cada una al completarla, con la misma disciplina de Sprints 1-7: implementar
tal cual `plan.md` (o anotar el desvío real si lo hay) y verificar en código
real (no solo dar por buena la tarea al escribirla).

- [x] S8-1 — `server/services/cliente.ts` (nuevo): `esClientePublicoGeneral(clienteId)`
  tal cual `plan.md` (comparación pura contra `CLIENTE_PUBLICO_GENERAL_ID`,
  sin Prisma). Implementado sin desvíos.

  Tests unitarios en `tests/unit/services/cliente.test.ts` (4 casos): id
  igual a la constante → `true`; un UUID real generado (`crypto.randomUUID()`)
  → `false`; el id de un galpón sembrado (mismo formato, distinto valor) →
  `false`; string vacío → `false`.

  Verificado `npm run typecheck && npm run lint && npm test` — 281/281 en
  verde (4 tests nuevos sobre los 277 heredados de Sprint 7). Cobertura
  confirmada con `npx vitest run --coverage --coverage.all
  --coverage.include="src/server/services/cliente.ts"`: **100% statements
  (1/1), 100% funciones (1/1)** — sin branches que contar (comparación de
  una sola expresión, `0/0`). `coverage/` generado borrado al terminar.

- [x] S8-2 — `lib/zod/cliente.ts` (nuevo): `crearClienteSchema`,
  `editarClienteSchema`, `cambiarEstadoClienteSchema`.

  **Desvío real respecto a `plan.md`:** `celular`/`direccion` NO usan
  `.optional().or(z.literal(""))` como proponía el pseudocódigo original —
  se reusó el patrón real ya establecido en `lib/zod/usuario.ts`
  (`celular`/`email` de Usuario), un helper `opcional()` local
  (`z.preprocess` que normaliza `""` → `undefined` antes de `.optional()`)
  duplicado con un comentario "mismo patrón que usuario.ts" — mismo
  criterio que el proyecto ya usa para `esErrorDeUnicidad` (duplicado en
  `usuario.ts`/`lote.ts`/`galpon.ts`/`recoleccion.ts`, cada uno con su
  comentario "mismo helper que X", en vez de extraerlo a un módulo
  compartido para una función de 2 líneas). Efecto real: el tipo inferido
  de `celular`/`direccion` es `string | undefined`, no `string` — ajusta
  el diseño de `server/repositories/cliente.ts` en S8-4 (`data.celular ??
  null` en vez de `data.celular || null`).

  Tests en `tests/unit/lib/zod-cliente.test.ts` (11 casos): payload válido
  completo; `celular`/`direccion` vacíos aceptados y normalizados a
  `undefined` (confirmado leyendo `resultado.data`, no solo `.success`);
  `nombre` vacío rechazado; `nombre` que excede 120 caracteres rechazado;
  `tipo` fuera del enum rechazado; los 3 valores reales de `TipoCliente`
  aceptados explícitamente (uno por uno, confirma la decisión de negocio 4);
  `id` sin forma de UUID rechazado; `editarClienteSchema` válido con
  `clienteId`; `clienteId` inválido rechazado; `cambiarEstadoClienteSchema`
  acepta `ACTIVO`/`SUSPENDIDO`; rechaza `INACTIVO` (el valor real de otra
  entidad — `EstadoGalpon`/`EstadoUsuario` — confirma que no hay fuga entre
  enums).

  Verificado `npm run typecheck && npm run lint && npm test` — 292/292 en
  verde (11 tests nuevos sobre los 281 heredados de S8-1).

- [x] S8-3 — `lib/zod/precioKilo.ts` (nuevo): `crearPrecioKiloSchema`.

  **Corrección real encontrada al implementar (error de aritmética en el
  pseudocódigo de `plan.md`):** el límite propuesto en `plan.md` era
  `9_999_999.99` (7 dígitos enteros) para `Decimal(10,2)` — incorrecto:
  precisión 10, escala 2 → dígitos enteros = precisión − escala = **8**,
  así que el máximo real representable es `99999999.99`, no
  `9999999.99`. Corregido a `99_999_999.99` con un comentario explicando
  la aritmética, para no repetir el error si se vuelve a tocar este
  archivo.

  Tests en `tests/unit/lib/zod-precio-kilo.test.ts` (6 casos): payload
  válido; precio 0 rechazado; precio negativo rechazado; el máximo real
  (`99999999.99`) aceptado explícitamente (confirma la corrección de
  arriba, no solo que "algún" límite existe); un precio que excede ese
  rango (`100_000_000`) rechazado; `id` inválido rechazado.

  Verificado `npm run typecheck && npm run lint && npm test` — 298/298 en
  verde (6 tests nuevos sobre los 292 heredados de S8-2).

- [x] S8-4 — `server/repositories/cliente.ts` (nuevo): `crearCliente`,
  `buscarClientePorId`, `actualizarCliente`, `cambiarEstadoCliente`,
  `listarClientes({ skip, take, busqueda? })`,
  `contarClientes({ busqueda? })` — `celular`/`direccion` (ahora
  `string | undefined`, por el desvío real de S8-2) guardados como `null`
  con `data.celular ?? null`, no `|| null` como decía el pseudocódigo
  original de `plan.md` (con el tipo ya como `string | undefined`, `??`
  es lo correcto — `||` hubiera sido equivalente en la práctica para
  string, pero `??` es la forma correcta de expresar "solo si es
  undefined", y es lo que exige el tipo real del schema Zod).

  **Simplificación real respecto a `plan.md`:** el `where` de búsqueda
  (`OR` sobre `nombre`/`celular`) se extrajo a una función privada
  `whereBusqueda(busqueda?)`, compartida entre `listarClientes` y
  `contarClientes`, en vez de duplicar el mismo objeto `OR` en las dos
  funciones como mostraba el pseudocódigo de `plan.md` — evita que ambas
  queries puedan divergir por error si se edita una sin la otra.

  Sin tests nuevos (mismo criterio ya establecido del proyecto — no hay
  tests de repository, ver `memory/convenciones.md`/ADR-000).

  Verificado `npm run typecheck && npm run lint && npm test` — 298/298 en
  verde, sin roturas.

- [x] S8-5 — `server/repositories/precioKilo.ts` (nuevo): `crearPrecioKilo`,
  `buscarPrecioKiloPorId`, `obtenerPrecioKiloVigente` (`findFirst` por
  `vigenteDesde: "desc"`, con `include` del nombre de usuario) tal cual
  `plan.md`, sin desvíos. Sin tests nuevos (mismo criterio de repository sin
  tests).

  Verificado `npm run typecheck && npm run lint && npm test` — 298/298 en
  verde, sin roturas.

- [x] S8-6 — `server/actions/cliente.ts` (nuevo): `crearCliente`
  (idempotencia completa por id de cliente, clon de `crearGalpon`),
  `editarCliente` (guard `esClientePublicoGeneral` antes de actualizar),
  `cambiarEstadoClienteAction` (chequeo de "sin cambios" primero, guard de
  Público General después — mismo orden que la lección de Sprint 2) — tal
  cual `plan.md`, sin desvíos de negocio. Ninguna con `rol` (abiertas a
  GERENTE y OPERARIO). Tests de integración quedan en S8-14 (mismo criterio
  flexible que Sprints 5-7: escribir la action y sus tests de integración
  puede quedar en tareas separadas).

  **Detalle de implementación no explícito en el pseudocódigo de
  `plan.md`:** la comparación de idempotencia en el reintento normaliza
  `celular`/`direccion` con `?? null` en ambos lados
  (`existente.celular` viene `string | null` de Prisma, `input.celular`
  viene `string | undefined` de Zod tras el desvío de S8-2) para que
  `undefined` (payload sin el campo) y `null` (fila ya guardada sin ese
  dato) se traten como equivalentes, no como una diferencia real de datos.

  Verificado `npm run typecheck && npm run lint && npm test` — 298/298 en
  verde, y `npm run build` limpio (sin fugas de import de servidor a
  cliente).

- [x] S8-7 — `server/actions/precioKilo.ts` (nuevo): `crearPrecioKilo`
  (`rol: "GERENTE"`, idempotencia completa por id de cliente, nunca un
  `UPDATE`) tal cual `plan.md`, sin desvíos. Tests de integración quedan en
  S8-14.

  Verificado `npm run typecheck && npm run lint && npm test` — 298/298 en
  verde, y `npm run build` limpio (sin fugas de import de servidor a
  cliente).

- [x] S8-8 — `components/domain/clientes/cliente-form-dialog.tsx` (nuevo):
  clon de `GalponFormDialog` parametrizado por `modo`, con `<Select>`
  controlado de `tipo` (`MAYORISTA`/`MINORISTA`/`EVENTUAL`, `<SelectValue>`
  con `children` resuelto a mano — mismo fix que el Bug 2 de Sprint 3),
  campos `celular`/`direccion` opcionales, `id` generado una sola vez por
  apertura en modo crear. Implementado tal cual `plan.md`, sin desvíos de
  negocio — íconos elegidos por semántica directa (`Contact` para
  nombre/título, `Phone` para celular, `MapPin` para dirección, `Tags`
  para el tipo, distinto del `Tag` singular reservado para el ítem de
  navegación de Precio por Kilo en S8-13).

  Sin uso todavía en ninguna página (llega en S8-11) — verificado solo con
  `npm run typecheck && npm run lint && npm test` (298/298 en verde) y
  `npm run build` limpio (confirma que el límite Server→Client de
  `crearCliente`/`editarCliente` importados en este Client Component no
  rompe, mismo chequeo que el resto de dialogs del proyecto).

- [x] S8-9 — `components/domain/clientes/clientes-tabla.tsx` (nuevo): tabla
  envuelta en `<TableScrollArea>`, badge de `tipo` con receta de color por
  valor (3 clases nuevas en `globals.css` —
  `.badge-tipo-cliente-mayorista` indigo, `.badge-tipo-cliente-minorista`
  teal, `.badge-tipo-cliente-eventual` púrpura, cada una con `!` en sus
  utilidades, tonos elegidos sin pisar los ya usados por estado/severidad
  ni por el gris de Inactivo), badge de `estado` reusando
  `.badge-estado-activo`/`.badge-estado-inactivo` ya existentes (texto
  "Suspendido" en vez de "Inactivo").

  **Desvío real respecto a `plan.md`:** el guard visual de "Público
  General" no deshabilita los botones de Editar/Suspender — los
  **reemplaza** por un texto "Cliente del sistema" con `title` explicando
  el motivo. Más simple que manejar el estado `disabled` de dos componentes
  distintos (`ClienteFormDialog` no tenía ninguna prop `disabled` que
  propagar a su `<DialogTrigger>`), y comunica la protección con la misma
  claridad. `esClientePublicoGeneral()` (la función pura de
  `server/services/cliente.ts`, S8-1) se importa tal cual desde este Client
  Component — es solo una comparación de strings, sin Prisma, así que
  cruza el límite Server→Client sin ningún problema de serialización (a
  diferencia del bug real de RSC de Sprint 7 con un componente de ícono).

  Verificado `npm run typecheck && npm run lint && npm test` — 298/298 en
  verde, y `npm run build` limpio (confirma también que las 3 clases nuevas
  de `globals.css` compilan sin el error de sintaxis real que ya apareció
  una vez en Sprint 3 con la secuencia `*/` dentro de un comentario CSS —
  se revisó a mano que ningún comentario nuevo la contiene).

- [x] S8-10 — `components/domain/clientes/cliente-filtros.tsx` (nuevo):
  clon reducido de `MortalidadFiltros` con un único `<Input>` de texto
  (`?busqueda=...`, borra `page` al cambiar, `startTransition` +
  `router.replace`), sin el marco colapsable "Filtros" (visible siempre).

  **Detalle de implementación no explícito en `plan.md`:** a diferencia de
  los `<Select>`/`<input type="date">` de `MortalidadFiltros` (que no
  disparan navegación por cada tecla), un `<input>` de texto sí lo haría —
  se agregó debounce de 300ms (timeout guardado en un `useRef`, sin
  `useEffect`) antes de actualizar la URL, para no disparar un
  `router.replace` y un re-fetch completo del Server Component en cada
  letra escrita.

  Verificado `npm run typecheck && npm run lint && npm test` — 298/298 en
  verde, y `npm run build` limpio.

- [x] S8-11 — `app/(app)/clientes/page.tsx` (nuevo): fetch paralelo de
  `listarClientes`/`contarClientes` (`Promise.all`), `PageHeader` con
  `ClienteFormDialog modo="crear"` en `actions`, `ClienteFiltros`,
  `ClientesTabla`, `DataTablePagination` con `filtros={{ busqueda }}`. Sin
  guard de rol, sin entrada en `server/auth/rbac.ts`. Implementado tal cual
  `plan.md`, sin desvíos — `busqueda` se recorta (`.trim()`) para las
  queries reales, pero el valor crudo del `searchParam` se pasa intacto a
  `ClienteFiltros`/`DataTablePagination` (mismo criterio que
  `MortalidadPage` con sus filtros).

  Verificado `npm run typecheck && npm run lint && npm test` — 298/298 en
  verde, y `npm run build` limpio — `/clientes` aparece listada en la
  salida del build junto al resto de rutas dinámicas.

- [x] S8-12 — `components/domain/precio-kilo/actualizar-precio-dialog.tsx`
  (nuevo, un solo campo `precio`, sin `modo` — a diferencia de
  `ClienteFormDialog`/`GalponFormDialog`, un `PrecioKilo` nunca se edita)
  y `app/(app)/precio-kilo/page.tsx` (nuevo: `obtenerPrecioKiloVigente()`,
  tarjeta con precio vigente + quién/cuándo lo fijó, estado vacío
  defensivo si `vigente === null`).

  **Detalle no explícito en el pseudocódigo de `plan.md`, pero requerido
  por convención real del proyecto:** al ser `/precio-kilo` una ruta
  GERENTE-only (decisión de negocio 2), la página necesita la misma
  segunda capa de defensa que `galpones/page.tsx`/`lotes/page.tsx`/
  `usuarios/page.tsx` — `auth()` + `notFound()` si `session.user.rol !==
  "GERENTE"`, además del 403 que ya da `src/proxy.ts` vía
  `RUTAS_POR_ROL` (S8-13). El pseudocódigo de `plan.md` no lo mostraba
  explícito, pero es el mismo patrón ya establecido para toda pantalla
  restringida a un rol del proyecto — no es opcional.

  Verificado `npm run typecheck && npm run lint && npm test` — 298/298 en
  verde, y `npm run build` limpio — `/precio-kilo` aparece listada en la
  salida del build junto al resto de rutas dinámicas.

- [x] S8-13 — `components/layout/nav-items.ts`: entradas "Clientes" →
  `/clientes` (ícono `Contact`) y "Precio por Kilo" → `/precio-kilo`
  (ícono `Tag`). `server/auth/rbac.ts`: entrada nueva `/precio-kilo` →
  `["GERENTE"]` en `RUTAS_POR_ROL` — `/clientes` NO entra ahí (abierta a
  ambos roles). Implementado tal cual `plan.md`, sin desvíos.

  **Cobertura de tests agregada, no listada explícitamente en `plan.md`:**
  3 casos nuevos en `tests/unit/auth/rbac.test.ts` — GERENTE permitido en
  `/precio-kilo`, OPERARIO bloqueado en `/precio-kilo`, `/clientes` sin
  restricción para ningún rol. `tests/integration/rbac/proxy-guard.test.ts`
  no necesitó cambios: sus casos ya son genéricos sobre `/usuarios` como
  ruta representativa GERENTE-only, no enumeran cada entrada de
  `RUTAS_POR_ROL` una por una.

  Verificado `npm run typecheck && npm run lint && npm test` — 301/301 en
  verde (3 tests nuevos sobre los 298 heredados de S8-12), y `npm run
  build` limpio.

- [x] S8-14 — `tests/integration/actions/cliente.test.ts` (nuevo, 14 tests):
  repositories mockeados, mismo patrón que
  `tests/integration/actions/galpon.test.ts` (la guard pura
  `esClientePublicoGeneral` NO se mockea, se ejercita real). Casos: creación
  exitosa (AuditLog `CREAR`), OPERARIO puede crear (sin restricción de rol),
  idempotencia (reintento con mismos datos → éxito sin duplicar; reintento
  con `celular`/`direccion` `undefined` contra una fila guardada con `null`
  tratado como el mismo dato, no como diferencia real — caso agregado no
  listado explícitamente en el checklist original, cubre la normalización
  `?? null` de S8-6; reintento con datos distintos → `AccionError`),
  edición: cliente inexistente rechazado, edición exitosa con
  `estadoAntes`/`estadoDespues` reales en `AuditLog`, edición de Público
  General rechazada, OPERARIO puede editar; cambio de estado: cliente
  inexistente rechazado, suspender, reactivar, no-op si ya está en el
  estado pedido (sin tocar el repository), suspender a Público General
  rechazado, OPERARIO puede cambiar estado.

  `tests/integration/actions/precio-kilo.test.ts` (nuevo, 5 tests): GERENTE
  requerido (OPERARIO rechazado con `"No autorizado."`, sin tocar el
  repository), creación exitosa (`vigenteDesde` pasado explícito al
  repository, `AuditLog` `CREAR` real), idempotencia (reintento con mismo
  precio → éxito sin insertar una segunda fila; reintento con precio
  distinto → `AccionError`).

  Verificado `npm run typecheck && npm run lint && npm test` — 320/320 en
  verde (19 tests nuevos sobre los 301 heredados de S8-13), y `npm run
  build` limpio.

## Corrección real pedida por el Product Owner (post S8-14, antes de S8-15)
El Product Owner probó el diseño de `ClienteFiltros` de S8-10 (un único
`<Input>` siempre visible, sin marco colapsable, sin filtro de tipo) y pidió
alinearlo con el patrón que el resto de tablas de gestión con filtros del
proyecto ya usa (`MortalidadFiltros`/`RecoleccionFiltros`) — marco
colapsable "Filtros" + más de un filtro, no solo búsqueda de texto suelta.
Corregido de punta a punta, tocando tres tareas ya cerradas:

- **`server/repositories/cliente.ts` (S8-4):** `whereBusqueda(busqueda?)`
  se generalizó a `whereFiltros({ busqueda?, tipo? })` — ambos filtros se
  combinan con `AND` cuando los dos están presentes (mismo criterio que
  Mortalidad combinando `tipo`+`loteId`+rango de fechas). `listarClientes`/
  `contarClientes` ganan el parámetro `tipo?: TipoCliente`.
- **`components/domain/clientes/cliente-filtros.tsx` (S8-10, reescrito):**
  ahora clona el esqueleto **completo** de `MortalidadFiltros` (botón
  "Filtros" con `ListFilter`/`ChevronDown`, `aria-expanded`, colapsado por
  defecto salvo que ya haya un filtro activo en la URL) en vez del `<Input>`
  suelto de la versión original. Agrega un `<Select>` de `tipo`
  (`MAYORISTA`/`MINORISTA`/`EVENTUAL` + sentinela `__TODOS__`, mismo motivo
  que `TIPO_TODOS`/`LOTE_TODOS` de Mortalidad: Base UI no admite un `value`
  vacío) junto al `<Input>` de búsqueda con debounce (sin cambios en la
  lógica de debounce en sí, S8-10 original).
- **`app/(app)/clientes/page.tsx` (S8-11):** lee y valida `tipo` del
  searchParam contra los 3 valores reales de `TipoCliente` (`tipoValido()`,
  mismo patrón que `MortalidadPage` — no Zod, es un filtro de lectura, no
  una mutación), lo pasa a `listarClientes`/`contarClientes`,
  `ClienteFiltros` y `DataTablePagination`.

Sin cambios en `server/actions/cliente.ts` ni en ningún schema Zod — el
filtro de tipo es puramente de lectura, no toca ninguna Server Action de
mutación.

Verificado `npm run typecheck && npm run lint && npm test` — 320/320 en
verde (sin tests nuevos ni rotos: `cliente-filtros.tsx` y el repository no
tienen tests propios, mismo criterio ya establecido del proyecto), y `npm
run build` limpio — `/clientes` sigue apareciendo en la salida del build.

- [x] S8-15 — `npx vitest run --coverage`.
  `server/services/cliente.ts` confirmado en **100%/100%** statements/
  funciones (sin branches que contar, `0/0` — comparación de una sola
  expresión).

  **Hallazgo real, mismo patrón que S7-13:** forzando
  `--coverage.all --coverage.include` sobre `server/actions/cliente.ts` y
  `server/actions/precioKilo.ts`, el reporter reveló 91.66%/86.66%
  statements y 86.66%/75% branches — 4 líneas reales sin cubrir (2 por
  archivo, mismo par en ambos: la rama `if (!esErrorDeUnicidad(error))
  throw error;` y la rama `if (!existente) throw error;` dentro del catch
  de idempotencia). Las dos son ramas reales, no defensivas muertas:
  - **Error que no es `P2002`** (ej. `P1017` de Neon, "Server has closed
    the connection", visto realmente en Sprint 1) — confirma que la
    action no lo trata como colisión de idempotencia por error, lo
    repropaga tal cual.
  - **`P2002` mas el registro ya no existe al releer** — caso límite de
    carrera (aunque hoy no hay ningún camino real de `DELETE` para
    `Cliente`/`PrecioKilo` que lo dispare, es la misma defensa que ya
    existe en `crearGalpon`, y vale la pena confirmarla con un test barato
    en vez de dejarla sin ejercitar).

  **Corregido con 4 tests reales nuevos** (2 por archivo, no casos
  artificiales): `tests/integration/actions/cliente.test.ts` y
  `tests/integration/actions/precio-kilo.test.ts` ganan "propaga un error
  real que no es de unicidad (P2002), sin tratarlo como idempotencia" y
  "si el id colisiona (P2002) pero el registro ya no existe al releer,
  propaga el error original" cada uno. Recobertura: **100%/100%** en las
  tres piezas (`server/services/cliente.ts`,
  `server/actions/cliente.ts`, `server/actions/precioKilo.ts`).

  `coverage/` generado borrado al terminar (dos veces — antes y después de
  agregar los tests), mismo criterio que S5-11/S6-14/S7-13.

  Verificado `npm run typecheck && npm run lint && npm test` — 324/324 en
  verde (4 tests nuevos sobre los 320 heredados de la corrección de
  filtros), y `npm run build` limpio.

- [x] S8-16 — Verificación en vivo contra Neon real, script temporal
  (`_tmp_verificacion_s8_16.ts`, ejecutado con `npx tsx --env-file=.env`
  contra la conexión pooled `DATABASE_URL` — `tsx` no carga `.env`
  automáticamente, hallazgo real de esta tarea, resuelto con el flag nativo
  de Node 24 en vez de agregar `dotenv` como dependencia nueva solo para un
  script descartable; borrado al terminar, mismo criterio que
  S5-12/S6-15/S7-14). Llama a los repositories/services reales
  directamente, no a las Server Actions — 25 asserts, todos releyendo la
  fila real de Neon después de cada paso:
  1. Alta de Cliente real (`MAYORISTA`/`MINORISTA`/`EVENTUAL`, uno de cada
     uno, prefijo `VERIF-S8-` reconocible).
  2. Edición de un Cliente de prueba — persistencia real confirmada
     releyendo la fila.
  3. Cambio de estado ACTIVO→SUSPENDIDO→ACTIVO de un Cliente de prueba.
  4. Búsqueda por fragmento de nombre y por fragmento de celular, más un
     filtro combinado `tipo`+`busqueda` (agregado tras la corrección de
     diseño de `ClienteFiltros`, no estaba en el checklist original),
     confirmando que `listarClientes`/`contarClientes` devuelven el mismo
     subconjunto.
  5. Idempotencia real de `crearCliente`: reintentar con el mismo id
     dispara `P2002` real de Postgres (constraint real, no simulado); el
     registro original no se duplicó ni se sobrescribió.
  6. Dos altas sucesivas de `PrecioKilo` (usuario `GERENTE` temporal para
     la FK) — confirmado que quedan DOS filas reales (nunca un `UPDATE`),
     y que `obtenerPrecioKiloVigente()` resuelve la de `vigenteDesde` más
     reciente, con un control explícito de que el vigente ANTES del script
     no era ya la fila nueva (para que el assert no dé un falso positivo).
  7. Idempotencia real de `crearPrecioKilo`: mismo `id`, precio distinto →
     `P2002` real, la fila original no cambió, sin segunda fila insertada.
  8. "Público General" releído antes y después de las 24 operaciones
     anteriores — exactamente igual en ambos snapshots (nombre, tipo,
     estado).

  **Desvío real respecto al checklist original:** los casos 2 y 3 del
  checklist original (`editarCliente`/`cambiarEstadoClienteAction`
  invocados directo contra `CLIENTE_PUBLICO_GENERAL_ID` esperando
  rechazo) **no se ejecutaron contra Neon real en este script** — ese
  guard vive en la capa de Server Action (`server/actions/cliente.ts`),
  que depende de `auth()`/`withAuth()` (sesión real de Auth.js, fuera de
  contexto de request en un script standalone) y ya está exhaustivamente
  cubierto por mocks deterministas en S8-14 (los 2 casos explícitos:
  "rechaza editar a Público General"/"rechaza suspender a Público
  General"). Invocar los repositories `actualizarCliente`/
  `cambiarEstadoCliente` (que NO tienen guard propio, es intencional —
  ADR-000: la guard de negocio vive en la action, no en el repository)
  directo contra el id real de Público General para "probar que rechaza"
  hubiera sido literalmente mutar el registro real de producción sin
  ninguna protección real evitándolo — mismo tipo de riesgo que ya
  documenta R1 (`spec.md`) para `PrecioKilo`. En su lugar, este script
  verifica lo que sí es seguro y significativo probar contra Neon real:
  que el registro de Público General queda bit a bit intacto después de
  correr todas las demás operaciones (caso 8 de arriba).

  **Mismo motivo, `AuditLog` no se ejercitó en este script** (el checklist
  original lo mencionaba para los casos 1/2): `crearAuditLog` lo invoca
  `withAuth`, no el repository — llamar a los repositories directo (como
  hace este script, a propósito) nunca pasa por ahí. Ya está cubierto con
  `expect(crearAuditLogMock).toHaveBeenCalledWith(...)` real en cada caso
  de éxito de S8-14 — no hacía falta repetirlo acá.

  **Sin bugs de código encontrados** — los 25 asserts pasaron a la primera
  ejecución del script. Datos de prueba (3 Clientes, 1 Usuario, 2
  PrecioKilo) borrados al terminar y reconfirmados en 0 con consultas
  separadas dentro del mismo script antes de dar la tarea por completa —
  **`PrecioKilo`** limpiado con especial cuidado (`prisma.precioKilo.
  deleteMany` explícito) para no dejarlo mezclado con el histórico real
  (R1, `spec.md`).

  Sin cambios de código de producción en esta tarea — `npm run typecheck
  && npm run lint && npm test` seguía en 324/324 (última verificación real
  en S8-15, sin código nuevo desde entonces).

- [x] S8-17 — Verificación clic a clic en navegador real, hecha por el
  Product Owner directamente contra `npm run dev` (no con la extensión
  Claude in Chrome esta vez — decisión explícita del Product Owner, mismo
  criterio de "cualquiera de los dos caminos es válido" que ya estableció
  Sprint 3). Checklist entregado: acceso por rol (`/clientes` visible para
  ambos roles, `/precio-kilo` solo Gerente — 403 real a un Operario
  navegando a la URL a mano, no solo el link oculto del Sidebar), CRUD
  completo de Cliente (crear con los 3 tipos, editar, suspender/reactivar,
  toast + tabla actualizada sin recargar), fila de "Público General" sin
  botones de Editar/Suspender, filtros (búsqueda por nombre, por celular,
  `<Select>` de tipo, y los dos combinados a la vez), alta de precio con
  la tarjeta de "Precio vigente" actualizándose sin recargar — **todo
  confirmado funcionando por el Product Owner, sin hallazgos**.

  A diferencia de Sprints 6/7 (que sí encontraron correcciones reales de
  UX probando en vivo), esta verificación no encontró ningún bug ni
  ajuste de diseño — probablemente porque la corrección de `ClienteFiltros`
  (marco colapsable + filtro de tipo) ya se hizo en vivo, a pedido del
  propio Product Owner, ANTES de llegar a esta tarea (ver la sección
  "Corrección real pedida por el Product Owner" más arriba, entre S8-14 y
  S8-15) — la retroalimentación de diseño de este sprint llegó temprano,
  no al final.

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` en verde (324/324).
- [x] `npx vitest run --coverage` ≥90% en `server/services/cliente.ts`
  (100%/100%, ver S8-15 — también 100%/100% en `server/actions/cliente.ts`
  y `server/actions/precioKilo.ts`, por encima de lo que exigía el DoD
  original).
- [x] `npx prisma validate` en verde — confirmado explícitamente al cierre:
  "The schema at prisma\schema.prisma is valid", sin ningún cambio de
  schema sin intención (cero migraciones este sprint, tal cual lo
  planificado).
- [x] `npm run build` en verde (confirmado en cada tarea de servidor/UI, y
  de nuevo al cierre).
- [x] Guard de "Público General" verificado tanto en Server Action directa
  vía mocks (S8-14) como en la UI real (S8-17) — la verificación contra
  Neon real de S8-16 confirmó en cambio que el registro queda intacto
  (ver el desvío documentado ahí: invocar el guard de la Server Action
  directo contra el id real de producción se descartó por riesgo, a favor
  de un snapshot antes/después).
- [x] Idempotencia real (H5) confirmada contra Neon para `crearCliente` y
  `crearPrecioKilo` (S8-16, `P2002` real de Postgres), no solo con mocks
  (S8-14).
- [x] `PrecioKilo` confirmado como "solo insertar, nunca actualizar" contra
  datos reales (S8-16: dos altas sucesivas dejaron dos filas reales,
  `obtenerPrecioKiloVigente()` resolvió la más reciente).
- [x] `memory/estado-proyecto.md` actualizado: registro de cierre de
  Sprint 8 agregado (ver sección nueva "Sprint 8 — Clientes y Precio por
  Kilo"), con la decisión de no agregar `creadoEn`/`creadoEnCliente` a
  `Cliente` documentada explícitamente, la corrección real de
  `ClienteFiltros` pedida en vivo, y el hallazgo de `tsx --env-file` para
  scripts de verificación futuros.
- [x] `specs/roadmap-completo.md` actualizado: Sprint 8 marcado completado,
  progreso `9 de 16 sprints` (56%).
