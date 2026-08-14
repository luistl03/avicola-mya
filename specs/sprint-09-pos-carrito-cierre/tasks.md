# Tareas — Sprint 9

Checklist de planificación — ninguna tarea está ejecutada todavía. Se tilda
cada una al completarla, con la misma disciplina de Sprints 1-8: implementar
tal cual `plan.md` (o anotar el desvío real si lo hay) y verificar en código
real (no solo dar por buena la tarea al escribirla). Orden tal cual "Orden de
ejecución" de `plan.md` — hay dependencias reales entre tareas, no se debe
saltear el orden sin motivo.

- [x] S9-1 — `server/services/venta.ts` (nuevo): `calcularBrutoVenta`,
  `validarDescuento`, `calcularTotalCobrado` tal cual `plan.md` (funciones
  puras, sin Prisma). Implementado sin desvíos.

  Tests unitarios en `tests/unit/services/venta.test.ts` (11 casos):
  `calcularBrutoVenta` con 1 ítem, con varios ítems, con lista vacía
  (retorna 0), con ruido de punto flotante (`0.1 + 0.2`, confirma el
  redondeo a centavos); `validarDescuento` con descuento 0, igual al bruto
  (límite exacto, válido — venta a costo cero), mayor al bruto (rechazado),
  negativo (rechazado); `calcularTotalCobrado` con descuento 0, con
  descuento parcial, y con redondeo a centavos (`33.333` → `33.33`).

  Verificado `npm run typecheck && npm run lint && npm test` — 335/335 en
  verde (11 tests nuevos sobre los 324 heredados de Sprint 8). Cobertura
  confirmada con `npx vitest run --coverage --coverage.all
  --coverage.include="src/server/services/venta.ts"`: **100% statements
  (6/6), 100% branches (2/2), 100% funciones (5/5), 100% líneas (5/5)**.
  `coverage/` generado borrado al terminar.

- [x] S9-2 — `lib/zod/venta.ts` (nuevo): `cerrarVentaSchema` (id, clienteId,
  items no vacío con `tipo`/`id` por ítem, descuento con default 0,
  metodoPago) tal cual `plan.md`, sin desvíos.

  Tests en `tests/unit/lib/zod-venta.test.ts` (11 casos): payload válido
  completo; `items` vacío rechazado; `tipo` de ítem fuera de `PAQUETE`/
  `BANDEJA` rechazado (`SUELTO` explícitamente, confirma que no se puede
  enviar este sprint); los 2 tipos reales aceptados uno por uno; `descuento`
  negativo rechazado; `descuento` omitido usa el default `0`; los 4 valores
  reales de `MetodoPago` aceptados uno por uno; `metodoPago` fuera del enum
  rechazado; `id`/`clienteId`/`items[].id` con formato inválido rechazados.

  Verificado `npm run typecheck && npm run lint && npm test` — 346/346 en
  verde (11 tests nuevos sobre los 335 heredados de S9-1).

- [x] S9-3 — `lib/zod/cliente.ts` (modifica): agrega
  `buscarClientesAutocompleteSchema` (`busqueda`, string no vacío, máx 120)
  tal cual `plan.md`, junto a los schemas ya existentes de Sprint 8, sin
  desvíos.

  Tests nuevos en `tests/unit/lib/zod-cliente.test.ts` (3 casos): `busqueda`
  válida; `busqueda` vacía rechazada; `busqueda` que excede 120 caracteres
  rechazada.

  Verificado `npm run typecheck && npm run lint && npm test` — 349/349 en
  verde (3 tests nuevos sobre los 346 heredados de S9-2), sin romper los
  tests ya existentes de Sprint 8 en el mismo archivo.

- [x] S9-4 — `server/repositories/venta.ts` (nuevo): `cerrarVenta`
  (transacción interactiva — ancla `Venta`+`DetalleVenta` primero, guard
  todo-o-nada por `updateMany` de `Paquete`/`BandejaSuelta` después, ver
  "Hallazgo de diseño" en `plan.md`), `buscarVentaConDetallesPorId`,
  `listarPaquetesDisponibles`, `listarBandejasDisponibles` tal cual
  `plan.md`, sin desvíos.

  Sin tests nuevos (mismo criterio ya establecido del proyecto — no hay
  tests de repository, ver `memory/convenciones.md`/ADR-000). Verificación
  real de la transacción (incluida la carrera concurrente forzada) queda en
  S9-16.

  Verificado `npm run typecheck && npm run lint && npm test` — 349/349 en
  verde, sin roturas.

- [x] S9-5 — `server/repositories/cliente.ts` (modifica): agrega
  `buscarClientesAutocomplete(busqueda)` (acotado a `estado: ACTIVO`, sin
  paginación, `take: 10`) tal cual `plan.md`, sin desvíos.

  Sin tests nuevos (repository sin tests). Verificado `npm run typecheck &&
  npm run lint && npm test` — 349/349 en verde, sin roturas.

- [x] S9-6 — `server/actions/venta.ts` (nuevo): `cerrarVentaAction` — releer
  precio vigente y pesos reales del servidor (nunca confiar en el payload
  del cliente para eso), validar descuento con el guard de servicio, armar
  el `catch` de `ItemsNoDisponiblesError` (diagnóstico best-effort de qué
  ítem falló, R5 de `spec.md`) y el `catch` de idempotencia por `P2002`
  (comparando cliente, método de pago, descuento y el conjunto de ids de
  ítems del carrito) tal cual `plan.md`. Sin `rol` — abierta a GERENTE y
  OPERARIO.

  **Desvío real respecto a `plan.md` (violación de ADR-000 detectada antes
  de escribir código, no después):** el pseudocódigo de `plan.md` hacía que
  esta Server Action importara `prisma` directamente para releer
  `Paquete`/`BandejaSuelta` por ids y para el diagnóstico de
  `ItemsNoDisponiblesError` — "Ningún componente ni service importa Prisma
  directamente. Solo repositories/" (`CLAUDE.md`) no menciona explícitamente
  a las Server Actions, pero ninguna otra `server/actions/*.ts` del proyecto
  importa `@/lib/prisma` (confirmado con una búsqueda antes de escribir
  este archivo) — el patrón real establecido es que la action nunca toca
  Prisma, solo orquesta repositories. Corregido: se agregaron 4 funciones
  nuevas a `server/repositories/venta.ts` en esta misma tarea
  (`buscarPaquetesPorIds`, `buscarBandejasPorIds`,
  `buscarPaquetesNoDisponiblesEntreIds`,
  `buscarBandejasNoDisponiblesEntreIds`), y la action usa esas en vez de
  `prisma` directo.

  Tests de integración quedan en S9-14.

  Verificado `npm run typecheck && npm run lint && npm test` — 349/349 en
  verde, y `npm run build` limpio (sin fugas de import de servidor a
  cliente) — `/pos` todavía no aparece en la salida del build porque la
  página (S9-12) no existe todavía, es esperado en esta etapa.

- [x] S9-7 — `server/actions/cliente.ts` (modifica): agrega
  `buscarClientesAutocompleteAction` (lectura disparada desde Client
  Component, sin `withAuth`, mismo criterio que `obtenerMasBitacora`) tal
  cual `plan.md`.

  **Detalle de implementación no explícito en el pseudocódigo de
  `plan.md`:** si `busqueda` no pasa la validación de Zod (vacía, o el
  operario acaba de borrar el input), la action responde `{ ok: true, data:
  [] }` en vez de `{ ok: false, error: ... }` — no es un error para el
  usuario de un autocomplete, simplemente no hay nada que sugerir todavía
  (a diferencia de `obtenerMasBitacora`, donde un input inválido sí es un
  error real de un flujo de paginación).

  Tests de integración quedan en S9-14.

  Verificado `npm run typecheck && npm run lint && npm test` — 349/349 en
  verde, y `npm run build` limpio.

- [x] S9-8 — `npm install jspdf` (v4.2.1 real instalada) +
  `lib/pdf/comprobante.ts` (nuevo, cliente-only): `generarComprobantePdf(venta)`
  construye el documento (encabezado con la nota "no es boleta/factura
  electrónica", venta/fecha/cliente/vendedor, tabla de ítems, bruto,
  descuento, total, método de pago) tal cual el diseño de `plan.md`
  ("Decisión de diseño: generación de PDF"). Agregada también
  `nombreArchivoComprobante(ventaId)` (no estaba en el pseudocódigo de
  `plan.md` como función propia — extraída para que S9-11 use exactamente
  el mismo nombre de archivo en el botón de descarga y en el adjunto de
  "Compartir", sin que puedan divergir).

  Confirmado que este módulo no se importa todavía desde ningún lado (llega
  su primer consumidor real en S9-11) — sin riesgo de fuga Server→Client
  por ahora.

  **Smoke test real de runtime** (no solo typecheck): script temporal
  (`_tmp_smoke_pdf.ts`, `npx tsx`) generó un PDF real con datos de ejemplo
  (2 ítems, descuento, YAPE) — `doc.output("arraybuffer")` produjo 5419
  bytes con cabecera `%PDF-1.3` real, confirmando que la API de `jsPDF` se
  usa correctamente (los tipos de TypeScript no garantizan que las llamadas
  produzcan un documento válido en tiempo de ejecución). Script y PDF de
  prueba borrados al terminar.

  Verificado `npm run typecheck && npm run lint && npm test` — 349/349 en
  verde (sin tests automatizados de contenido binario del PDF — la
  verificación visual completa en un dispositivo real queda en S9-17), y
  `npm run build` limpio. `npm audit` reporta 5 vulnerabilidades
  preexistentes (hono/nanoid/postcss/sharp, dependencias transitivas de
  Next.js) — no relacionadas con `jspdf`, no corregidas en esta tarea (están
  fuera de alcance de este sprint, requerirían evaluar un upgrade de Next
  aparte).

- [x] S9-9 — `memory/stack-tecnologico.md`: agrega una sección nueva
  "Comprobantes (Sprint 9)" (en vez de ampliar "Offline / PWA" — jsPDF no es
  una pieza de caché/service worker, es generación de documentos, mereció
  su propio encabezado) con `jsPDF` y la **Web Share API** (nativa del
  navegador, sin dependencia nueva) — ambas con la justificación breve de
  por qué se eligieron y sus límites reales (Puppeteer descartado por no
  correr bien en el runtime gratuito de Vercel; Web Share API no universal,
  `wa.me` no soporta adjuntar archivos).

## Corrección real encontrada al empezar S9-10 (toca S9-4/S9-6, ya cerradas)
Al diseñar `ComprobanteDialog` (H6, spec.md — "Muestra todos los datos de la
venta... recibidos directo de la respuesta de la action, sin una query
aparte") se encontró que `cerrarVentaAction` (S9-6) solo devolvía `{ id,
totalCobrado }` — insuficiente para armar un comprobante real (falta
cliente, vendedor, fecha, ítems con su `precioKiloAplicado`/`subtotal`
reales). Construir el comprobante con el estado del carrito en memoria del
cliente (una alternativa posible) se descartó a propósito: ese estado es
solo un PREVIEW con el precio vigente al cargar la página, no
necesariamente el mismo que terminó aplicado si el precio cambió entre la
carga y el cierre — para un documento financiero, mostrar el valor
REALMENTE persistido es lo correcto, mismo criterio que ya motivó no
confiar en el peso/precio del payload del cliente en primer lugar.

Corregido:
- **`server/repositories/venta.ts`:** `cerrarVenta`/
  `buscarVentaConDetallesPorId` ganan `include: { cliente: { select:
  { nombre: true } }, usuario: { select: { nombre: true } } }` (constante
  compartida `INCLUDE_COMPROBANTE`, evita que las dos queries diverjan).
- **`server/actions/venta.ts`:** `data` de retorno ahora incluye `fecha`,
  `clienteNombre`, `vendedorNombre`, `descuento`, `metodoPago`, e `items`
  (cada uno con `tipo`/`pesoKg`/`precioKiloAplicado`/`subtotal` reales) —
  todo lo que `generarComprobantePdf()` (S9-8) necesita, con la forma exacta
  de `DatosComprobante`.

Verificado `npm run typecheck && npm run lint && npm test` — 349/349 en
verde, sin roturas.

- [x] S9-10 — UI: `components/domain/pos/pos-selector-items.tsx`,
  `pos-carrito.tsx`, `cliente-autocomplete.tsx`, `descuento-input.tsx`,
  `metodo-pago-select.tsx` (todos nuevos) tal cual `plan.md`. "Público
  General" preseleccionado por defecto en `ClienteAutocomplete`. Botón
  "Cerrar venta" deshabilitado si el carrito está vacío (H2, tercer
  Gherkin). `id` de venta generado una sola vez por intento de checkout
  (`useState(() => crypto.randomUUID())`), reusado entre reintentos tras un
  error de validación, regenerado solo tras un cierre exitoso (ver "Manejo
  del `id` de venta" en `plan.md`).

  **Desvío real respecto a `plan.md` — componente nuevo no listado,
  `pos-workspace.tsx`:** el selector y el carrito están visibles
  simultáneamente (no son un modal aislado como el resto de dialogs del
  proyecto) y necesitan compartir estado (carrito, cliente elegido) — como
  `app/(app)/pos/page.tsx` es un Server Component sin estado, hizo falta un
  orquestador Client Component que no estaba en el listado original de
  componentes de `plan.md`. `PosWorkspace` (nuevo) posee `carrito`,
  `cliente` y `ventaCerrada`, compone `ClienteAutocomplete` +
  `PosSelectorItems` + `PosCarrito` + `ComprobanteDialog` (S9-11).

  **Combinado en la práctica con S9-11 y S9-12** (documentado ahí, no acá
  de nuevo) — resultaron demasiado acoplados para separarlos limpiamente
  (`PosCarrito` necesita `ComprobanteDialog` para tener algo real que hacer
  al cerrar una venta con éxito, y ninguno de los dos se puede probar de
  verdad sin `page.tsx` montándolos).

  **Corrección real de diseño encontrada al implementar (antes de cualquier
  prueba en vivo, releyendo H6 de `spec.md`):** `cerrarVentaAction` (S9-6)
  solo devolvía `{ id, totalCobrado }` — insuficiente para el comprobante.
  Corregido ampliando `server/repositories/venta.ts` (`INCLUDE_COMPROBANTE`:
  `cliente`/`usuario` con `select: { nombre: true }`) y el `data` de
  retorno de `cerrarVentaAction` (fecha, clienteNombre, vendedorNombre,
  descuento, metodoPago, items con `precioKiloAplicado`/`subtotal` reales)
  — verificado aparte con `npm run typecheck && npm run lint && npm test`
  (349/349) antes de seguir con la UI, ver bloque "Corrección real
  encontrada al empezar S9-10" arriba.

  **Dos correcciones de UX pedidas en vivo por el Product Owner, probando
  contra un usuario y datos de prueba reales (`npm run dev`, no solo
  `npm run build`):**
  1. `PosSelectorItems` mostraba la lista COMPLETA de `DISPONIBLE` sin
     recorte ni búsqueda — con muchos ítems, obliga a scrollear en vez de
     encontrar uno puntual. Corregido: preview de los `PREVIEW_INICIAL`
     (constante, valor real ajustado a `3` por el Product Owner mientras
     probaba con pocos ítems de prueba) ítems creados más recientemente +
     aviso "Hay N más — buscá por peso" + un `<Input>` que filtra en
     memoria por `peso.toFixed(3).includes(texto)` (sin round-trip al
     servidor, a diferencia del autocomplete de cliente — la lista
     `DISPONIBLE` ya vive completa en memoria desde el fetch inicial de
     `page.tsx`).
  2. `ClienteAutocomplete` no ofrecía ningún camino para dar de alta un
     cliente nuevo cuando la búsqueda no encontraba nada — el Product Owner
     pidió reusar el mismo `ClienteFormDialog` de `/clientes` (Sprint 8) en
     vez de duplicar el formulario. Corregido: `components/domain/clientes/
     cliente-form-dialog.tsx` gana un callback opcional `onCreado?: (cliente:
     { id: string; nombre: string }) => void` (solo en `modo: "crear"`,
     llamado junto a `onExito()` con el `id` real de la respuesta de
     `crearCliente` y el `nombre` ya disponible en el propio `FormData` —
     sin tocar la Server Action). `ClienteAutocomplete` renderiza
     `<ClienteFormDialog modo="crear" onCreado={seleccionar} />` en el
     estado "sin coincidencias", dejando el cliente recién creado
     seleccionado de una en la venta en curso.

  Verificado `npm run typecheck && npm run lint && npm test` — 349/349 en
  verde en cada paso, y `npm run build` limpio (sin fugas de import de
  servidor a cliente, confirmado también que `ClienteFormDialog`
  reutilizado desde POS no rompe el árbol Server→Client real).

- [x] S9-11 — UI: `components/domain/pos/comprobante-dialog.tsx` (nuevo) —
  se abre automáticamente cuando `PosWorkspace` tiene `ventaCerrada` (no
  disparado por un botón), muestra los datos reales de la venta (de
  `VentaCerradaData`, la respuesta ampliada de `cerrarVentaAction`, nunca
  del estado del carrito en memoria), botones "Descargar PDF"
  (`doc.save(...)`) y "Compartir" (Web Share API con archivo si
  `navigator.canShare?.({ files })` es `true`; si no, cae al mismo botón de
  descarga con un toast informativo) tal cual `plan.md`. Al cerrar el
  diálogo (`onCerrar`, disparado por `onOpenChange(false)` del `<Dialog>`):
  `PosWorkspace` limpia carrito + cliente (vuelve a "Público General") +
  `ventaCerrada`; la limpieza del `id` de venta y el refresco del selector
  de `DISPONIBLE` (`router.refresh()`, para que los ítems recién vendidos
  desaparezcan) quedan del lado de `PosCarrito`, que ya se regeneró un `id`
  nuevo apenas la venta cerró con éxito (no hace falta esperar a que se
  cierre el diálogo para eso).

  Implementado junto con S9-10 (ver ahí el detalle real de por qué se
  combinaron) y S9-12 — verificado en conjunto `npm run typecheck && npm
  run lint && npm test` (349/349) y `npm run build` limpio.

- [x] S9-12 — `app/(app)/pos/page.tsx` (nuevo): fetch paralelo de
  `listarPaquetesDisponibles()`/`listarBandejasDisponibles()`/
  `obtenerPrecioKiloVigente()`/`buscarClientePorId(CLIENTE_PUBLICO_GENERAL_ID)`
  (`Promise.all`). Si `precioVigente` es `null`, muestra el aviso de H1
  (último Gherkin) en vez del selector. Sin guard de rol, sin entrada en
  `server/auth/rbac.ts`.

  **Detalle de implementación no explícito en el pseudocódigo de
  `plan.md`:** `Paquete.peso`/`BandejaSuelta.peso` son `Decimal` de Prisma
  — nunca cruzan el límite Server→Client Component como objeto (mismo tipo
  de restricción que el bug real de RSC de Sprint 7 con un componente de
  ícono, aunque acá se evitó antes de que pasara, no después). Se
  convierten a `number` acá, en el Server Component, antes de pasarlos a
  `PosWorkspace`.

  Verificado `npm run typecheck && npm run lint && npm test` — 349/349 en
  verde, y `npm run build` limpio — `/pos` aparece listada en la salida del
  build junto al resto de rutas dinámicas.

- [x] S9-13 — `components/layout/nav-items.ts`: entrada nueva "Punto de
  Venta" → `/pos` (ícono `ShoppingCart`) tal cual `plan.md`, sin desvíos.
  Sin cambios en `server/auth/rbac.ts` (`/pos` abierto a ambos roles,
  decisión de negocio 2).

  Tests de `rbac.ts` para `/pos` quedan pendientes — no se agregaron
  todavía (ver nota abajo, S9-14 es el próximo paso real).

  Verificado `npm run typecheck && npm run lint && npm test` — 349/349 en
  verde, y `npm run build` limpio.

## Verificación en vivo temprana (antes de S9-16/S9-17, hecha por el Product Owner)
El Product Owner probó `/pos` contra `npm run dev` con un usuario y datos
de prueba temporales (`verif.s9.temp`, 1 Paquete + 1 Bandeja al inicio,
ampliado a 3 de cada uno más tarde) apenas S9-10/11/12 quedaron armados —
antes de llegar a las tareas formales de verificación (S9-16/S9-17). Las
dos correcciones de UX de S9-10 (recorte + búsqueda por peso, "Agregar
cliente" en el autocomplete) salieron de esa sesión. Sin otros hallazgos
reportados. Datos de prueba (`verif.s9.temp`, el Paquete/BandejaSuelta
creados por `_tmp_verif_pos_ui.ts`) siguen en la base — limpieza pendiente,
a hacer antes de cerrar el sprint (o antes, si empiezan a estorbar alguna
verificación posterior).

- [x] S9-14 — `tests/integration/actions/venta.test.ts` (nuevo, 11 tests):
  repositories mockeados, mismo patrón que
  `tests/integration/actions/mortalidad.test.ts` (`ItemsNoDisponiblesError`
  re-declarada dentro del `vi.mock`, no importada — el mock del módulo
  reemplaza también esa exportación, así que el `instanceof` real de la
  action sigue funcionando contra la clase mockeada). Casos: cierre exitoso
  con el comprobante completo en la respuesta (`fecha`/`clienteNombre`/
  `vendedorNombre`/`items` reales, no solo `id`/`totalCobrado`) y `AuditLog`
  `CREAR` real; OPERARIO puede cerrar venta (sin restricción de rol); sin
  precio vigente configurado → rechazado antes de tocar el resto de
  repositories; ítem cuyo id no existe en `Paquete`/`BandejaSuelta` →
  rechazado con mensaje de "ya no existen"; descuento que supera el bruto →
  rechazado; `ItemsNoDisponiblesError` del repository → traducido a
  `AccionError` con los ids específicos en el mensaje; idempotencia (5
  casos): reintento con mismos datos → éxito sin duplicar; reintento con
  carrito distinto → `AccionError`; reintento con otro cliente →
  `AccionError`; propaga un error real que no es de unicidad (`P2002`), sin
  tratarlo como idempotencia (mismo hallazgo de cobertura que S8-15);
  `P2002` pero el registro ya no existe al releer → propaga el error
  original.

  `tests/integration/actions/cliente.test.ts` (modifica, +5 tests): agrega
  casos para `buscarClientesAutocompleteAction` — sin sesión → rechazado
  sin tocar el repository; búsqueda válida → devuelve resultados del
  repository (mockeado); OPERARIO también puede buscar (sin restricción de
  rol); búsqueda vacía → responde sin sugerencias, sin tocar el repository
  (no es un error para el usuario del autocomplete, ver S9-7); no escribe
  `AuditLog` (es una lectura, no una mutación).

  Verificado `npm run typecheck && npm run lint && npm test` — 365/365 en
  verde (16 tests nuevos sobre los 349 heredados de S9-1..S9-13), y
  `npm run build` limpio.

- [x] S9-15 — `npx vitest run --coverage`.
  `server/services/venta.ts` confirmado en **100%/100%/100%/100%**
  (statements/branches/funciones/líneas — sin cambios desde S9-1).
  `server/actions/cliente.ts` (incluido `buscarClientesAutocompleteAction`)
  confirmado en **100%/100%/100%/100%**, sin huecos.

  **Hallazgo real de cobertura en `server/actions/venta.ts`, mismo patrón
  que S7-13/S8-15:** forzando `--coverage.all --coverage.include` apareció
  en **96.15% statements / 82.85% branches / 86.66% funciones** — ninguno
  de los tests de S9-14 ejercitaba un carrito con `BandejaSuelta` (siempre
  `Paquete` solo), así que toda rama que depende de `bandejaIds.length > 0`
  (en la lectura inicial de ítems Y en el diagnóstico de
  `ItemsNoDisponiblesError`) y la rama defensiva `?? ""` de la comparación
  de idempotencia (un detalle sin `paqueteId` NI `bandejaId` — "nunca real
  este sprint, SUELTO no se puebla hasta Sprint 10") quedaban sin cubrir.

  **Corregido con 4 tests reales nuevos** (no casos artificiales) en
  `tests/integration/actions/venta.test.ts`: cierre exitoso con carrito
  mixto (Paquete + Bandeja); cierre exitoso con carrito de solo Bandeja
  (cubre la rama contraria — `paqueteIds` vacío); `ItemsNoDisponiblesError`
  con carrito de solo Bandeja (cubre las ramas contrarias del bloque de
  diagnóstico); idempotencia contra un registro existente con un detalle
  sin `paqueteId` ni `bandejaId` (rama defensiva del sentinel `?? ""`).
  Recobertura: **100%/100%/100%/100%** en `server/actions/venta.ts`.

  `coverage/` generado borrado al terminar (dos veces — antes y después de
  agregar los tests, mismo criterio que S5-11/S6-14/S7-13/S8-15).

  Verificado `npm run typecheck && npm run lint && npm test` — 369/369 en
  verde (4 tests nuevos sobre los 365 heredados de S9-14).

- [x] S9-16 — Verificación en vivo contra Neon real, script temporal
  (`_tmp_verif_s9_16.ts`, `npx tsx --env-file=.env`, borrado al terminar —
  mismo criterio de nombre reconocible y limpieza final que
  S5-12/S6-15/S7-14/S8-16). Llama a los repositories reales directamente
  (no a las Server Actions, mismo criterio que S8-16). **16/16 asserts en
  verde, sin ningún bug real encontrado:**
  1. Alta de datos de prueba: 3 `Paquete` + 2 `BandejaSuelta` `DISPONIBLE`
     reales, 2 `Cliente` de prueba (uno `ACTIVO`, uno `SUSPENDIDO`),
     reusando el `PrecioKilo` vigente real (ya había uno sembrado — no
     hizo falta insertar uno de prueba, mismo cuidado que R1 de `spec.md`).
  2. Cierre de venta real vía `cerrarVenta()`: el `Paquete` pasó a
     `VENDIDO`, `montoContado === totalCobrado` y `montoCredito === null`
     confirmados, `DetalleVenta.precioKiloAplicado` congelado con el
     precio real usado.
  3. Se fijó un `PrecioKilo` nuevo DESPUÉS del paso 2 — el `DetalleVenta`
     ya persistido siguió con el precio ORIGINAL, confirmado releyendo la
     fila (no una referencia viva).
  4. **Carrera real, forzada** (`Promise.allSettled`, dos `cerrarVenta()`
     concurrentes sobre el MISMO `Paquete`, con ids de `Venta` distintos a
     propósito para que la carrera se resuelva en el guard, no en el
     `P2002` del ancla): exactamente una tuvo éxito, la otra rechazó con
     `ItemsNoDisponiblesError` real; el `Paquete` quedó `VENDIDO` una sola
     vez y existe exactamente una `Venta` real para él — confirmado el
     guard anti-doble-venta bajo condiciones reales de Postgres, no solo
     en mocks.
  5. Idempotencia real: reintentar `cerrarVenta()` con el mismo `id` de
     Venta disparó `P2002` real (constraint real de Postgres); la Venta
     original no se duplicó (conteo confirmado en 1).
  6. `buscarClientesAutocomplete()`: encontró al `Cliente` `ACTIVO` de
     prueba y excluyó al `SUSPENDIDO` con el mismo prefijo en el nombre.
  7. Datos de prueba (3 Paquete, 2 BandejaSuelta, 2 Cliente, 1 Usuario, 2
     Venta+sus DetalleVenta, el `PrecioKilo` nuevo del paso 3) borrados al
     terminar y reconfirmados en 0 con consultas separadas.

  **Limpieza adicional real, no prevista en el checklist original:**
  quedaban pendientes de la sesión de revisión de UI (nota en tasks.md,
  "Verificación en vivo temprana") el usuario `verif.s9.temp` y su
  Paquete/BandejaSuelta de prueba — el Paquete/BandejaSuelta seguían
  `DISPONIBLE` (nunca se completó una venta real con ellos), borrados sin
  problema. El `Usuario` sí tenía una fila real de `AuditLog` (`Cliente`
  `CREAR`) — confirma que el Product Owner probó de verdad el flujo nuevo
  de "Agregar cliente" desde el autocomplete del POS (S9-10) y creó un
  Cliente real (`Nancy Marlene Quiroz Ninaquispe`) — `onDelete: Restrict`
  de `AuditLog.usuarioId` bloqueó el `DELETE` directo del `Usuario` hasta
  borrar esa fila de `AuditLog` primero (comportamiento esperado del
  schema, no un bug — un usuario con historial real no se borra a la
  ligera). Corregido borrando la fila de `AuditLog` de ese Usuario de
  prueba y el Cliente que había creado, después el Usuario. **Se dejaron
  intactos**, sin tocar, otros Paquete/BandejaSuelta `DISPONIBLE` reales ya
  existentes en la base con pesos redondos (12/12.5/12.1/12.2/3.2/3.3/2)
  creados por el propio Product Owner probando el recorte/búsqueda por
  peso — no son datos de este script, no correspondía borrarlos sin
  confirmar primero.

- [x] S9-17 — Verificación clic a clic, hecha por el Product Owner
  directamente (no con la extensión Claude in Chrome — estaba desconectada
  esta sesión, mismo criterio de "cualquiera de los dos caminos es válido"
  que ya estableció Sprint 3), incluido **"Compartir" en un celular real
  vía WhatsApp** — confirmado funcionando: el PDF llega con el logo, el N°
  de referencia, y el nombre de archivo legible. Resto del checklist
  confirmado: acceso sin restricción de rol para GERENTE y OPERARIO;
  selector de items; carrito; autocomplete de cliente; descuento con guard;
  cierre de venta; comprobante. **Sin hallazgos de bugs.**

  **Ajuste de diseño encontrado en vivo (no un bug):** al compartir por
  WhatsApp, el operario ve DOS mensajes seguidos — el texto
  ("Comprobante de venta — {cliente}") y después el PDF, en vez de uno
  solo con el archivo y el texto como descripción. Confirmado que es
  comportamiento real de WhatsApp para Android al recibir un share con
  `text` + `files` a la vez desde la Web Share API (no algo controlable
  desde el código de la página) — **decisión del Product Owner: dejarlo
  así**, el mensaje de texto da contexto útil de una sola vez sin que el
  operario tenga que escribirlo a mano.

  **Dos correcciones reales de diseño pedidas en vivo por el Product
  Owner, probando el comprobante generado de verdad (no solo el
  pseudocódigo del plan):**
  1. El primer diseño del PDF (S9-10/11) era un layout genérico tipo A4
     con columnas — el Product Owner pidió rehacerlo por completo como
     recibo térmico de 80mm, tomando de referencia un ejemplo real de otro
     proyecto propio (HTML/CSS de un comprobante de hospedaje) adaptado al
     dominio de Venta/DetalleVenta: logo real de la granja embebido
     (`avicolamya-isotipo.png`, cargado por `fetch`+`FileReader` — hizo
     falta que `generarComprobantePdf()` pasara a ser `async`, y el alto
     de página se calcula antes de crear el documento a partir de la misma
     lista de bloques que después se dibuja, para que jsPDF reciba el
     tamaño exacto en un solo paso), líneas separadoras punteadas/sólidas,
     un N° de referencia corto (primeros 8 caracteres del id de Venta,
     ya que no hay serie fiscal), y — a pedido explícito, después de la
     primera vuelta — el aviso "No es boleta ni factura electrónica — sin
     validez SUNAT" se sacó del pie del PDF (queda solo "Comprobante
     interno de gestión.").
  2. El nombre de archivo pasó de un UUID crudo (`comprobante-{uuid}.pdf`)
     a uno legible con fecha + hora + el mismo N° de referencia hex que
     aparece impreso en el propio PDF (`Comprobante-20260813-1908-0A4AF25C.pdf`)
     — mismo criterio en las dos vueltas de corrección: fácil de reconocer
     entre varias descargas y fácil de emparejar contra lo impreso/en
     pantalla.

  Verificado `npm run typecheck && npm run lint && npm test` en verde en
  cada corrección (369/369 final), `npm run build` limpio.

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` en verde (369/369).
- [x] `npx vitest run --coverage` ≥90% en `server/services/venta.ts`
  (100%/100%/100%/100%, S9-15).
- [x] `npx prisma validate` en verde — "The schema at prisma\schema.prisma
  is valid", sin migración nueva este sprint.
- [x] `npm run build` en verde — `/pos` listada junto al resto de rutas.
- [x] Guard anti-doble-venta verificado bajo carrera real concurrente
  forzada contra Neon (S9-16, paso 4) — no solo secuencial.
- [x] Idempotencia real (H7) confirmada contra Neon para `cerrarVentaAction`
  (S9-16, paso 5), no solo con mocks (S9-14).
- [x] `precioKiloAplicado` confirmado como snapshot real, no una referencia
  viva al `PrecioKilo` vigente (S9-16, paso 3).
- [x] `Venta.montoContado === totalCobrado` y `Venta.montoCredito === null`
  en toda venta cerrada este sprint (S9-16, paso 2) — 100% contado,
  confirmado.
- [x] PDF y "Compartir" verificados en un dispositivo real (S9-17), con dos
  vueltas de corrección de diseño del comprobante ya aplicadas.
- [x] `memory/estado-proyecto.md` actualizado: registro de cierre de
  Sprint 9.
- [x] `memory/stack-tecnologico.md` actualizado con `jsPDF` (S9-9).
- [x] `specs/roadmap-completo.md` actualizado: Sprint 9 marcado completado,
  progreso `10 de 16 sprints` (63%).
