# Convenciones Técnicas

## Naming
- Modelos y campos de Prisma: `camelCase`, sin guiones bajos salvo que sea
  imprescindible para legibilidad.
- Rutas de carpetas en `app/`: `kebab-case`.
- Componentes React: `PascalCase`.
- Archivos de `services/` y `repositories/`: nombre del módulo en singular
  (`recoleccion.ts`, no `recolecciones.ts`).

## TypeScript
- `strict: true` en `tsconfig.json`.
- Prohibido `any` y `@ts-ignore` — si algo no tipa, se resuelve el tipo,
  no se silencia.

## Estilos: toda receta de color/sombra vive en `src/app/globals.css`
Un componente puede usar utilidades de Tailwind libremente (`flex`,
`gap-4`, `rounded-lg`, tamaños, `sticky`, etc.), pero **ninguna receta de
color o sombra a medida** (valores arbitrarios tipo
`shadow-[inset_...]`, combinaciones `bg-*/border-*/text-*` que definen un
estado visual con nombre — "éxito", "error", "hay más para deslizar") se
escribe suelta dentro de un archivo `.tsx`. Esa receta se define una sola
vez en `globals.css` (`@layer components`, ver `.toast-success`,
`.scroll-shadow-derecha`, etc.) y el componente solo elige qué nombre de
clase aplicar según su estado. Motivo: antes de esto, la misma sombra
vivía casi duplicada en `table-scroll-area.tsx` (light + dark, dos
variantes) y `toast.tsx` (6 combinaciones) — cambiar "qué tan fuerte es la
sombra" o "qué verde es el éxito" significaba tocar el `.tsx`, no un solo
lugar. Los tokens base (`--primary`, `--destructive`, radios, etc.) ya
vivían acá desde Sprint 0 — esta regla extiende el mismo criterio a
cualquier combinación de color con nombre, no solo a las variables sueltas.

Una etiqueta que solo **clasifica** (no representa un estado con
semántica de bueno/malo, como `TipoMortalidad` o `CategoriaBitacora`)
puede quedarse con `<Badge variant="outline">` sin receta propia si hay
pocos valores y no hace falta distinguirlos de un vistazo. Si el volumen
de filas hace que un color de más ayude a ubicar cada uno en un listado
(caso real: `.badge-tipo-muerte`/`.badge-tipo-descarte`,
`.badge-categoria-*` en Bitácora), sí se define una receta por valor en
`globals.css` — mismo lugar y misma regla del `!` de abajo, un tono
distinto por cada valor y sin pisar los tonos ya usados para estados
reales (amber = Activo, verde = éxito, rojo = error).

Si una clase de `globals.css` se usa **junto con** un `variant` de
`<Badge>` (`ui/badge.tsx`) — como `.badge-estado-activo`/
`.badge-estado-inactivo` —, cada utilidad de esa clase necesita `!`
(important, sintaxis de Tailwind v4: `bg-amber-100!`, no `bg-amber-100`).
Sin el `!`, el `variant` gana en silencio: en Tailwind v4, `@layer
utilities` (donde Tailwind genera las clases de un `variant`) siempre le
gana a `@layer components` (donde vive la clase de `globals.css`) con la
misma especificidad, y `twMerge` (`lib/utils.ts`) no puede arbitrar el
conflicto porque no reconoce esas clases como utilidades de Tailwind. Bug
real encontrado en Sprint 3: `.badge-estado-inactivo` nunca mostró gris
desde que se creó, porque `variant="secondary"` la tapaba sin avisar —
ver `memory/estado-proyecto.md` para el detalle completo.

## Server Actions
- Toda **mutación** pasa por el wrapper `withAuth(config, handler)`
  (`server/auth/with-auth.ts`, ver Sprint 2 del plan SCRUM) — valida
  sesión, rol, Zod y escribe en `AuditLog` automáticamente. `rol` es
  opcional: si se omite, alcanza con estar autenticado (cualquier rol).
- Una **lectura adicional disparada desde un Client Component** (por
  ejemplo, "cargar más" de un muro con scroll infinito, Sprint 4) no
  necesita pasar por `withAuth` — ese wrapper está pensado para
  mutaciones con una entidad puntual afectada (`entidad` + `entidadId` +
  `AuditLog`), no para paginar un listado sin una única entidad detrás;
  forzarlo ahí ensuciaría `AuditLog` con filas `LISTAR` por cada scroll.
  En su lugar, esa Server Action verifica sesión a mano con `auth()` y
  valida con Zod igual, solo que sin escribir `AuditLog` — ver
  `server/actions/bitacora.ts` (`obtenerMasBitacora`) como referencia. Un
  Server Component de página que hace su propio fetch inicial
  (`listarLotesConUbicacion`, etc.) tampoco pasa por `withAuth` ni deja
  auditoría, por el mismo motivo: es una lectura, no una mutación.
- El schema Zod de entrada vive junto a la action o en `lib/zod/<modulo>.ts`
  si se reutiliza en más de un lugar.
- Todo id nuevo en un schema Zod se valida con `idUuid()`
  (`lib/zod/comun.ts`), **nunca** con `z.string().uuid()` directo. Zod v4
  exige que el string cumpla estrictamente el nibble de versión/variante
  de RFC4122 — algunos ids sembrados en `prisma/seed.ts` (`Galpon`,
  `CLIENTE_PUBLICO_GENERAL_ID` en `lib/constants.ts`) son constantes
  fijas legibles (`"00000000-0000-0000-0000-000000000101"`), no generadas
  con `crypto.randomUUID()`, y no tienen ese nibble en rango válido.
  `z.string().uuid()` las rechaza pese a ser ids reales y existentes en
  la base. `idUuid()` valida la FORMA de un UUID (8-4-4-4-12 hex) sin
  exigir el nibble RFC4122 estricto — bug real encontrado en Sprint 3
  ("Seleccioná un galpón" nunca desaparecía al elegir un galpón
  sembrado), ver `memory/estado-proyecto.md` para el detalle completo.

## Base de datos
- Campos monetarios: siempre `Decimal`, nunca `Float`.
- Nunca `DELETE` físico en entidades de negocio (Lote, Paquete, Cliente,
  Usuario) — se usa el campo `estado` (soft delete/anulación).
- Toda mutación que afecte más de una tabla va dentro de
  `prisma.$transaction([...])`.

## Git
- Conventional Commits: `feat(modulo): descripción`, `fix(modulo): descripción`,
  `test(modulo): descripción`, `docs: descripción`.
- Una rama por historia/tarea: `feat/S{sprint}-{slug-corto}`.
- Squash merge a `main`. `main` protegida, requiere CI verde.

## Paginación de tablas de datos
Toda tabla de gestión (Usuarios, y en sprints futuros Clientes, Ventas,
Créditos, Egresos, etc.) sigue el mismo patrón, implementado una sola vez
en `components/ui/data-table-pagination.tsx`:
- **Server-side, dirigida por URL** (`?page=N` + `skip`/`take` en el
  repository), no client-side ni infinite scroll. La página es un Server
  Component que ya hace el fetch con Prisma — paginar ahí es gratis y
  evita traer miles de filas al cliente para después cortarlas en JS.
- **No se ata el tamaño de página al tamaño de pantalla del dispositivo.**
  El tamaño de pantalla no se conoce en el servidor sin un round-trip
  extra (parpadeo), y la misma URL debería devolver los mismos datos sin
  importar qué dispositivo la abre (si no, se rompe el cache y el botón
  atrás). Tamaño fijo por convención: **10 filas por página**.
- El componente de paginación **no se renderiza** si el total de filas
  entra en una sola página — no ocupa espacio en pantalla en los módulos
  chicos (Usuarios, con pocos registros, probablemente nunca la muestre).
- Repository: exponer `listar<Entidad>({ skip, take })` +
  `contar<Entidad>()` (dos queries en paralelo con `Promise.all`, no un
  solo `findMany` con `include: { _count }`) — ver
  `server/repositories/usuario.ts` como referencia.
- Cualquier cambio de estilo o de criterio (tamaño de página, mostrar
  números de página en vez de "Página X de Y", etc.) se hace una vez en
  `data-table-pagination.tsx`, no módulo por módulo.
- **Tabla paginada CON filtros** (post-Sprint 5: Mortalidad, Recolección):
  `<DataTablePagination>` acepta una prop opcional `filtros?: Record<string,
  string | undefined>` que se combina con `page` en cada link — sin esto,
  cambiar de página perdería los filtros activos de la URL (el componente
  original solo sabía construir `${basePath}?page=N`, a secas). El
  componente de filtro correspondiente (`MortalidadFiltros`,
  `RecoleccionFiltros`, mismo patrón que `BitacoraFiltros` de Sprint 4,
  pero con `page` borrado de la URL en cada cambio — a diferencia de
  Bitácora, que pagina por cursor y no tiene ese problema) vive aparte del
  `<DataTablePagination>`, ambos leyendo/escribiendo la misma URL. Ver
  `app/(app)/mortalidad/page.tsx` como referencia completa del patrón.

## Tabla paginada vs. muro con scroll infinito
No todo listado del proyecto es una tabla de gestión. Dos patrones
distintos, elegidos según qué es la pantalla:

- **Tabla de gestión** (Usuarios, Galpones, Lotes, Mortalidad): el
  usuario quiere ver un registro puntual, volver a una página específica,
  o compartir un link a "página 3". Usa `<DataTablePagination>` — 10
  filas por página, dirigida por URL (`?page=N`), `skip`/`take` en el
  repository (ver "Paginación de tablas de datos" arriba).
- **Muro cronológico** (Bitácora, Sprint 4): es un feed — lo único que
  importa es "seguir bajando" en el tiempo, no ir a una página exacta. Usa
  paginación por **cursor** (no `skip`/`take` por número de página) +
  scroll infinito en el cliente:
  - Repository: `listar<Entidad>Pagina({ cursorId?, take, ...filtros })`
    con `orderBy` **compuesto** (ej. `[{fecha: "desc"}, {id: "desc"}]`) —
    el desempate por `id` es necesario para que el orden sea
    determinístico si dos filas comparten el mismo timestamp exacto, sin
    eso el cursor podría saltear o repetir una fila.
  - La primera tanda la trae el Server Component de página (`page.tsx`),
    igual que cualquier fetch inicial.
  - Las tandas siguientes las pide una Server Action de **lectura**
    (no pasa por `withAuth`, ver "Server Actions" arriba) desde un Client
    Component con un `IntersectionObserver` nativo sobre una sentinela al
    final de la lista — sin librería nueva, un solo observer alcanza para
    un caso de uso así de simple.
  - Filtros (categoría, rango de fecha) van en la URL igual que la
    paginación por página — así persisten al compartir el link o
    recargar. Cuando cambian, el componente del muro se **remonta**
    (`key` derivado de los filtros en el padre), no sincroniza
    `props → state` con un `useEffect` + `setState` — ese patrón genera
    renders en cascada y el propio linter de React lo marca como
    anti-patrón (encontrado en Sprint 4 al construir `BitacoraMuro`).
  - **Ese mismo `key` nunca va en el componente de filtros** (el que
    arma la URL, ej. `BitacoraFiltros`) — solo en el consumidor pasivo
    (el muro). Un componente que dispara su propia navegación y a la vez
    lleva un `key` derivado de esa navegación se remonta a mitad de su
    propia transición, dejando una instancia vieja visible junto a la
    nueva. La navegación de un filtro usa `startTransition(() =>
    router.replace(...))`, no `router.push` suelto — `replace` porque no
    tiene sentido apilar una entrada de historial por cada cambio de
    filtro, `startTransition` para que React reemplace una transición
    pendiente en vez de dejar varias compitiendo.
  - "Hay más para cargar" se infiere de si la última tanda trajo menos
    que el tamaño de página — no hace falta un `COUNT` aparte solo para
    saberlo de antemano.

## Encabezado de página y Sidebar mobile
Toda pantalla del Shell (Usuarios hoy; Galpones, Clientes, etc. en sprints
futuros) usa `<PageHeader title=... actions=... />`
(`components/layout/page-header.tsx`) en vez de armar un `<h1>` a mano.
El trigger del Sidebar en mobile (`MobileSidebarTrigger`) vive **dentro**
de ese encabezado, en el flujo junto al título — no flota `fixed` sobre el
contenido. Se cambió de `fixed` a inline porque un botón fijo en la
esquina se terminaba superponiendo con el título de cada pantalla nueva
(encontrado en Usuarios). Cualquier página nueva que no use `PageHeader`
se queda sin forma de abrir el Sidebar en mobile — no es opcional.

`PageHeader` es `flex-col` por defecto y recién pasa a fila (`sm:flex-row`)
desde 640px — no `flex-wrap` sobre una sola fila. Un botón de acción con
texto (`whitespace-nowrap`, no puede partirse en dos líneas) compitiendo
por una fila angosta con el título termina empujando el layout entero
hacia la derecha y forzando scroll horizontal de **toda la pantalla**, no
solo del botón (encontrado en Usuarios, con "+ Nuevo usuario"). El quiebre
a columna en mobile es una decisión explícita por breakpoint, no algo que
dependa de que el navegador decida "justo" dónde envolver.

## Tablas con scroll horizontal
Envolver toda tabla ancha en `<TableScrollArea>`
(`components/ui/table-scroll-area.tsx`), no en un `<div overflow-x-auto>`
a mano. Agrega una **sombra interior** (no un degradé de color) en el
borde derecho **solo cuando la tabla realmente no entra completa** (mide
`scrollWidth` vs `clientWidth`), como indicio de que hay más columnas
deslizando — nunca se muestra si no hace falta, para no tapar una columna
real en pantallas donde sí entra todo. Es sombra y no degradé
(`from-background to-transparent`) a propósito: un degradé que va del
color de fondo a transparente no se distingue sobre una tabla que
también es blanca — blanco sobre blanco no se ve (bug real encontrado en
Usuarios). Una sombra oscurece el borde sin depender de adivinar el color
de fondo real de la tabla.

La sombra es **bidireccional y sigue la posición real del scroll**
(`scrollLeft`, no solo "esta tabla desborda"): aparece del lado hacia el
que todavía se puede deslizar y desaparece del lado ya recorrido — al
llegar al final desaparece la de la derecha y aparece la de la izquierda
(bug real encontrado en Usuarios: con el criterio viejo, la sombra
derecha quedaba fija aunque ya no hubiera nada más a la derecha).

## Modales largos (formularios que no entran en una pantalla chica)
`DialogContent` ya trae `max-h-[90dvh]` + scroll interno por defecto (no
hay que agregarlo por pantalla) — sin esto, un formulario más alto que el
viewport de un celular queda cortado sin forma de llegar al resto
(encontrado en el formulario de "Nuevo usuario" en iPhone). El
`DialogFooter` es `sticky` al fondo de ese scroll: el botón principal
(Guardar) queda siempre visible mientras los campos de arriba se
desplazan por detrás, en vez de haber que scrollear hasta el final para
encontrarlo. Ambos viven en `ui/dialog.tsx` — ningún formulario nuevo
tiene que repetir este comportamiento a mano.

## Contrato Offline-Ready (obligatorio desde Sprint 5 en adelante)
Toda entidad que un Operario pueda crear en campo sin señal debe cumplir:
1. ID generado en el cliente (`crypto.randomUUID()`), nunca autoincrement.
2. La Server Action/endpoint correspondiente es **idempotente**
   (upsert por id, nunca `create` puro).
3. Dos timestamps: `creadoEnCliente` (reloj del celular) y `creadoEn`
   (reloj del servidor, fuente de verdad para plazos como la ventana
   de gracia de 10 minutos).
4. El payload es JSON puro serializable — los `Decimal` de Prisma se
   convierten a `string` antes de encolarse en IndexedDB.

## Idempotencia por id de cliente: obligatoria en TODA creación, no solo en las offline-ready
Distinto del contrato de arriba (que además exige los dos timestamps y
pensar en la cola de IndexedDB) — esto es más chico y aplica siempre:
**cualquier Server Action que haga un `create` de una entidad nueva desde
un formulario debe poder recibir un doble envío (doble clic, reintento de
red) sin duplicar la fila.** Encontrado como deuda real en una auditoría
post-Sprint 5 (2026-08-11, ver `memory/estado-proyecto.md` para el
detalle completo) — Mortalidad, Bitácora y Galpón no tenían ninguna
protección; el caso de Mortalidad era grave de verdad (un doble envío no
solo duplicaba la fila, decrementaba `avesVivas` dos veces).

**Regla:** antes de asumir que una entidad nueva necesita este patrón,
revisar si ya está protegida gratis por una restricción de negocio
existente:
- Si el modelo ya tiene un campo `@unique` que el formulario llena
  siempre (`Usuario.usuario`, `Lote.codigo`), un doble envío ya choca
  solo contra ese índice — alcanza con que la action atrape `P2002` y
  traduzca el mensaje (patrón ya usado desde Sprint 2/3, ver
  `crearUsuario`/`crearLote`). **No hace falta agregar un id de cliente
  acá.**
- Si la mutación no crea una fila nueva con identidad propia, sino que
  actualiza/cierra algo existente y ya hay una guard de aplicación que se
  vuelve a evaluar en cada invocación (`mudarLoteAction`: la guard
  "el lote ya está en ese galpón" rechaza sola un reintento secuencial
  una vez que el primero ya movió el lote), alcanza con un `catch` de
  `P2002` de cortesía para el caso límite de una carrera verdaderamente
  concurrente — no hace falta id de cliente tampoco.
- **Si ninguna de las dos aplica** (no hay unicidad de negocio posible
  sobre los campos del formulario, y la entidad es una fila nueva
  independiente) — ahí sí hace falta el patrón completo:
  1. El schema Zod de "crear" lleva un campo `id: idUuid()`.
  2. El repository acepta `id` y lo pasa a `data: { id, ... }` del
     `create` (nunca se deja que Prisma lo genere solo con
     `@default(uuid())`).
  3. La Server Action envuelve el `create` en `try/catch`: si es `P2002`,
     busca el registro existente por ese `id` (repository ya suele tener
     un `buscar<Entidad>PorId`), compara los campos relevantes contra el
     payload — si coinciden, responde éxito con el registro ya existente
     (reintento idempotente, sin volver a escribir nada); si no
     coinciden, `AccionError` explícito ("ya existe un registro con este
     id pero con datos diferentes") en vez de sobrescribir en silencio.
  4. El dialog genera el `id` **una sola vez por apertura** (`useState(()
     => crypto.randomUUID())`), no en cada submit — es la parte que
     realmente importa: si el id cambia en cada clic, la protección de
     arriba nunca se activa porque, para la base, cada clic es un
     registro legítimamente distinto. Ver el bug real que confirmó esto
     (Recolección, Sprint 5, S5-13) en `memory/estado-proyecto.md`.
  5. Si la mutación es una transacción interactiva que además decrementa
     un contador (como `registrarMortalidadYDescontarAves`), el `create`
     con `id` explícito puede ir DESPUÉS del decremento dentro de la
     misma transacción sin problema — si revienta con `P2002`, Prisma
     revierte la transacción completa, deshaciendo también el decremento
     (verificado en vivo contra Neon, no solo asumido).

Aplicado en Recolección (S5-6, el original), y retroactivamente en
Galpón/Bitácora/Mortalidad (auditoría post-Sprint 5). **Todo sprint
nuevo que agregue una pantalla de alta debe aplicar este patrón desde el
diseño**, no esperar a otra auditoría — Usuario y Lote quedan como
referencia de "ya protegido por unicidad de negocio, no hace falta
tocar".