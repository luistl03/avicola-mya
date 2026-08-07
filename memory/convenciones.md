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

## Server Actions
- Toda Server Action pasa por el wrapper `withAuth(action, { rol })`
  (ver Sprint 2 del plan SCRUM) — valida sesión, rol, Zod y escribe en
  `AuditLog` automáticamente.
- El schema Zod de entrada vive junto a la action o en `lib/zod/<modulo>.ts`
  si se reutiliza en más de un lugar.

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