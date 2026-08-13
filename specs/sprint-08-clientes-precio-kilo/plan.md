# Plan técnico — Sprint 8

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `model Cliente` (`id`, `nombre`, `celular?`,
  `direccion?`, `tipo TipoCliente`, `estado EstadoCliente @default(ACTIVO)`,
  `@@index([nombre])`, `@@index([estado])`) y `model PrecioKilo` (`id`,
  `precio Decimal(10,2)`, `vigenteDesde DateTime @default(now())`,
  `usuarioId`, `@@index([vigenteDesde])`) — ambos sin cambios este sprint.
  `enum TipoCliente { MAYORISTA MINORISTA EVENTUAL }`,
  `enum EstadoCliente { ACTIVO SUSPENDIDO }` — ambos completos, sin cambios.
- `prisma/seed.ts`: `Cliente` con `id: CLIENTE_PUBLICO_GENERAL_ID`,
  `nombre: "Público General"`, `tipo: "EVENTUAL"` (vía `upsert`, `estado`
  usa el default `ACTIVO`); `PrecioKilo` inicial sembrado con
  `id: PRECIO_KILO_ID` (constante local del seed, no exportada — este
  sprint no necesita ese id puntual, solo confirma que existe al menos una
  fila).
- `src/lib/constants.ts`: `CLIENTE_PUBLICO_GENERAL_ID =
  "00000000-0000-0000-0000-000000000001"` ya exportado. Sin constantes
  nuevas que agregar este sprint.
- `server/repositories/galpon.ts` + `server/actions/galpon.ts`
  (`crearGalpon`) son la referencia real y directa a clonar para
  `crearCliente`: `Galpon` tampoco tiene `@unique` de negocio, así que ya
  resuelve exactamente el mismo problema (id de cliente + captura de
  `P2002` + comparación de campos en el reintento) que este sprint necesita
  para `Cliente`.
- `server/repositories/galpon.ts` (`cambiarEstadoGalpon`) +
  `server/actions/galpon.ts` (`cambiarEstadoGalponAction`) son la
  referencia directa para `cambiarEstadoClienteAction` — mismo patrón de
  "si el estado pedido ya es el actual, responder éxito sin tocar nada"
  (evita una escritura y una fila de `AuditLog` innecesarias ante un doble
  clic sobre el mismo botón).
- `components/domain/galpones/galpon-form-dialog.tsx` es la referencia de
  UI: formulario **simple** (sin arreglos de longitud variable) — a
  diferencia de `RegistrarRecoleccionDialog`/`ConsolidarSueltosDialog`, este
  sprint no necesita `startTransition` a mano ni un `id` recalculado en
  cada render: `<form action={formAction}>` directo alcanza, con el
  subcomponente de formulario montado solo mientras `open` (mismo fix del
  bug real de Sprint 3, "el error viejo quedaba pegado al reabrir").
- `components/domain/lotes/lote-form-dialog.tsx` es la referencia del
  `<Select>` controlado (`value` + `onValueChange` + `useState`,
  `<SelectValue>` con `children` ya resuelto) — necesaria para el `<Select>`
  de `tipo` (`TipoCliente`) en `ClienteFormDialog`, mismo motivo que el Bug
  2 de Sprint 3 (`<SelectValue>` sin `children` explícito puede mostrar el
  valor crudo del enum en vez de una etiqueta legible).
- `components/domain/mortalidad/mortalidad-filtros.tsx` es la referencia
  del filtro dirigido por URL (`startTransition(() =>
  router.replace(...))`, borra `page` al cambiar) — este sprint reusa el
  mismo esqueleto con un solo `<Input>` de texto en vez de `<Select>`s.
- `components/ui/data-table-pagination.tsx` — sin cambios, ya soporta
  `filtros` opcional (necesario para que la búsqueda sobreviva al cambiar
  de página).
- `server/auth/with-auth.ts` (`withAuth`, `AccionError`) — sin cambios.
- `server/auth/rbac.ts` (`RUTAS_POR_ROL`) — gana una entrada nueva
  (`/precio-kilo`).

## Sin migración de schema este sprint
Confirmado releyendo `prisma/schema.prisma` real (no asumido — ver
`spec.md`, "Hallazgo real"): `Cliente`/`PrecioKilo`/`TipoCliente`/
`EstadoCliente` ya tienen todo lo que este sprint necesita. Único chequeo de
schema de esta tarea: `npx prisma validate` en verde antes de escribir
código (confirma que no hay drift entre el schema real y la base ya
aplicada), sin `npx prisma migrate dev`.

## Pieza de arquitectura 1: `esClientePublicoGeneral()` — guard puro, función de servicio

### Por qué vive en `server/services/`, no inline en la Server Action
Mismo criterio que `puedeDesactivarGalpon`/`puedeReducirCapacidad`
(`server/services/galpon.ts`) y `puedeDesactivarUsuario`
(`server/services/usuario.ts`): un guard de negocio, aunque sea una
comparación de una sola línea, vive en `services/` para quedar 100%
testeable sin Prisma y para que la Server Action solo orqueste (leer,
preguntar al guard, actuar), no decida.

```ts
// server/services/cliente.ts
import { CLIENTE_PUBLICO_GENERAL_ID } from "@/lib/constants";

export function esClientePublicoGeneral(clienteId: string): boolean {
  return clienteId === CLIENTE_PUBLICO_GENERAL_ID;
}
```
Tests unitarios: id igual a la constante → `true`; cualquier otro id (UUID
real generado, string vacío, un id de otro cliente sembrado) → `false`.
Cobertura 100% trivial (una sola rama), mismo umbral ≥90% que el resto de
`server/services/`.

## Diseño de Zod schemas

### `lib/zod/cliente.ts` (nuevo)
```ts
import { z } from "zod";
import { idUuid } from "@/lib/zod/comun";

const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(120);
const celular = z.string().trim().max(20).optional().or(z.literal(""));
const direccion = z.string().trim().max(200).optional().or(z.literal(""));
const tipo = z.enum(["MAYORISTA", "MINORISTA", "EVENTUAL"]);
const clienteId = idUuid();

// Generado en el cliente (crypto.randomUUID()) — mismo patrón que
// crearGalponSchema: Cliente no tiene ningún campo @unique, así que este id
// es la única defensa real contra un doble envío duplicando la fila.
const id = idUuid();

export const crearClienteSchema = z.object({ id, nombre, celular, direccion, tipo });
export type CrearClienteInput = z.infer<typeof crearClienteSchema>;

export const editarClienteSchema = z.object({ clienteId, nombre, celular, direccion, tipo });
export type EditarClienteInput = z.infer<typeof editarClienteSchema>;

export const cambiarEstadoClienteSchema = z.object({
  clienteId,
  estado: z.enum(["ACTIVO", "SUSPENDIDO"]),
});
export type CambiarEstadoClienteInput = z.infer<typeof cambiarEstadoClienteSchema>;
```
`celular`/`direccion` opcionales con `.or(z.literal(""))` — mismo motivo que
cualquier campo opcional que llega desde un `<input>` HTML sin valor: llega
como string vacío, no como `undefined`, y `normalizarInput` de `withAuth`
no lo convierte. El repository guarda `""` como `null` explícitamente (ver
abajo) para no ensuciar la base con strings vacíos donde el campo es
opcional de verdad.

Tests: payload válido completo; payload válido con `celular`/`direccion`
vacíos; `nombre` vacío rechazado; `tipo` inválido (fuera del enum)
rechazado; `id`/`clienteId` con formato inválido rechazados (reusa
`idUuid()`, ya probado contra ids tipo seed en Sprint 3 — sin caso nuevo que
agregar acá, solo el `safeParse` estándar).

### `lib/zod/precioKilo.ts` (nuevo)
```ts
import { z } from "zod";
import { idUuid } from "@/lib/zod/comun";

const id = idUuid(); // PrecioKilo.id, generado en el cliente — mismo motivo que Cliente.
const precio = z.coerce
  .number()
  .positive("El precio debe ser mayor a 0")
  .max(9_999_999.99, "Precio fuera de rango"); // límite real de Decimal(10,2)

export const crearPrecioKiloSchema = z.object({ id, precio });
export type CrearPrecioKiloInput = z.infer<typeof crearPrecioKiloSchema>;
```
Tests: payload válido; precio ≤0 rechazado (cero y negativo); precio que
excede el rango de `Decimal(10,2)` rechazado; `id` inválido rechazado.

## Diseño de repositories

### `server/repositories/cliente.ts` (nuevo)
```ts
import { prisma } from "@/lib/prisma";

export function crearCliente(data: {
  id: string;
  nombre: string;
  celular: string;
  direccion: string;
  tipo: "MAYORISTA" | "MINORISTA" | "EVENTUAL";
}) {
  return prisma.cliente.create({
    data: {
      id: data.id,
      nombre: data.nombre,
      celular: data.celular || null,
      direccion: data.direccion || null,
      tipo: data.tipo,
    },
  });
}

export function buscarClientePorId(id: string) {
  return prisma.cliente.findUnique({ where: { id } });
}

export function actualizarCliente(
  id: string,
  data: { nombre: string; celular: string; direccion: string; tipo: "MAYORISTA" | "MINORISTA" | "EVENTUAL" },
) {
  return prisma.cliente.update({
    where: { id },
    data: {
      nombre: data.nombre,
      celular: data.celular || null,
      direccion: data.direccion || null,
      tipo: data.tipo,
    },
  });
}

export function cambiarEstadoCliente(id: string, estado: "ACTIVO" | "SUSPENDIDO") {
  return prisma.cliente.update({ where: { id }, data: { estado } });
}

// Para /clientes: tabla paginada + búsqueda por nombre O celular (mismo
// criterio de "server-side, dirigida por URL" que memory/convenciones.md
// exige para toda tabla de gestión). contains + mode "insensitive" — no
// hace falta ningún índice adicional a los ya existentes
// (@@index([nombre]), @@index([estado])) para el volumen esperado de esta
// granja.
export function listarClientes(params: { skip: number; take: number; busqueda?: string }) {
  return prisma.cliente.findMany({
    where: params.busqueda
      ? {
          OR: [
            { nombre: { contains: params.busqueda, mode: "insensitive" } },
            { celular: { contains: params.busqueda, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { nombre: "asc" },
    skip: params.skip,
    take: params.take,
  });
}

export function contarClientes(params: { busqueda?: string }) {
  return prisma.cliente.count({
    where: params.busqueda
      ? {
          OR: [
            { nombre: { contains: params.busqueda, mode: "insensitive" } },
            { celular: { contains: params.busqueda, mode: "insensitive" } },
          ],
        }
      : undefined,
  });
}
```
`listarClientes`/`contarClientes` comparten el mismo `where` — mismo
criterio que `listarUsuarios`/`contarUsuarios` (dos queries en paralelo con
`Promise.all` desde la página, no un solo `findMany` con `include:
{ _count }`).

### `server/repositories/precioKilo.ts` (nuevo)
```ts
import { prisma } from "@/lib/prisma";

export function crearPrecioKilo(data: {
  id: string;
  precio: number;
  usuarioId: string;
  vigenteDesde: Date;
}) {
  return prisma.precioKilo.create({ data });
}

export function buscarPrecioKiloPorId(id: string) {
  return prisma.precioKilo.findUnique({ where: { id } });
}

// El precio "vigente" siempre es la fila con vigenteDesde más reciente —
// nunca se hace UPDATE, así que esta lectura es la única fuente de verdad
// de "cuánto cuesta el kilo hoy". Incluye el usuario que lo fijó, para
// mostrar "actualizado por X el DD/MM" en /precio-kilo.
export function obtenerPrecioKiloVigente() {
  return prisma.precioKilo.findFirst({
    orderBy: { vigenteDesde: "desc" },
    include: { usuario: { select: { nombre: true } } },
  });
}
```
`vigenteDesde` se pasa explícito desde la Server Action (`new Date()` una
sola vez por request), no se confía en el `@default(now())` del schema —
mismo criterio que `RegistroConsolidacion.creadoEn` (Sprint 7): una sola
fuente de "ahora" por invocación, más fácil de razonar y de testear con un
reloj simulado.

## Diseño de Server Actions

### `server/actions/cliente.ts` (nuevo)
```ts
"use server";

import { Prisma } from "@prisma/client";

import { cambiarEstadoClienteSchema, crearClienteSchema, editarClienteSchema } from "@/lib/zod/cliente";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  actualizarCliente,
  buscarClientePorId,
  cambiarEstadoCliente,
  crearCliente as crearClienteRepo,
} from "@/server/repositories/cliente";
import { esClientePublicoGeneral } from "@/server/services/cliente";

function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Idempotencia por id de cliente (mismo patrón que crearGalpon, Sprint 3 +
// auditoría post-Sprint 5): Cliente no tiene ningún campo @unique.
export const crearCliente = withAuth(
  { schema: crearClienteSchema, entidad: "Cliente", accion: "CREAR" },
  async (input) => {
    let cliente;
    try {
      cliente = await crearClienteRepo(input);
    } catch (error) {
      if (!esErrorDeUnicidad(error)) throw error;
      const existente = await buscarClientePorId(input.id);
      if (!existente) throw error;
      const coincide =
        existente.nombre === input.nombre &&
        (existente.celular ?? "") === input.celular &&
        (existente.direccion ?? "") === input.direccion &&
        existente.tipo === input.tipo;
      if (!coincide) {
        throw new AccionError("Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.");
      }
      cliente = existente;
    }
    return {
      data: { id: cliente.id },
      entidadId: cliente.id,
      estadoDespues: { nombre: cliente.nombre, tipo: cliente.tipo },
    };
  },
);

export const editarCliente = withAuth(
  { schema: editarClienteSchema, entidad: "Cliente", accion: "EDITAR" },
  async (input) => {
    const existente = await buscarClientePorId(input.clienteId);
    if (!existente) throw new AccionError("El cliente no existe.");
    if (esClientePublicoGeneral(input.clienteId)) {
      throw new AccionError("Público General no se puede editar.");
    }

    const cliente = await actualizarCliente(input.clienteId, {
      nombre: input.nombre,
      celular: input.celular,
      direccion: input.direccion,
      tipo: input.tipo,
    });

    return {
      data: { id: cliente.id },
      entidadId: cliente.id,
      estadoAntes: { nombre: existente.nombre, tipo: existente.tipo },
      estadoDespues: { nombre: cliente.nombre, tipo: cliente.tipo },
    };
  },
);

export const cambiarEstadoClienteAction = withAuth(
  { schema: cambiarEstadoClienteSchema, entidad: "Cliente", accion: "CAMBIAR_ESTADO" },
  async (input) => {
    const existente = await buscarClientePorId(input.clienteId);
    if (!existente) throw new AccionError("El cliente no existe.");

    if (input.estado === existente.estado) {
      return {
        data: { id: existente.id, estado: existente.estado },
        entidadId: existente.id,
        estadoAntes: { estado: existente.estado },
        estadoDespues: { estado: existente.estado },
      };
    }

    if (esClientePublicoGeneral(input.clienteId)) {
      throw new AccionError("Público General no se puede suspender.");
    }

    const cliente = await cambiarEstadoCliente(input.clienteId, input.estado);
    return {
      data: { id: cliente.id, estado: cliente.estado },
      entidadId: cliente.id,
      estadoAntes: { estado: existente.estado },
      estadoDespues: { estado: cliente.estado },
    };
  },
);
```
Ninguna de las tres lleva `rol` — abiertas a GERENTE y OPERARIO (decisión de
negocio 1). El guard de Público General se evalúa **después** del chequeo
de "sin cambios" en `cambiarEstadoClienteAction` — mismo orden de prioridad
que la lección ya documentada en Sprint 2 ("`puedeDesactivarUsuario` tenía
el chequeo de 'último Gerente' después del de autodesactivación — código
muerto en la práctica"): acá el caso real relevante es el que SÍ intenta un
cambio real, no el no-op.

### `server/actions/precioKilo.ts` (nuevo)
```ts
"use server";

import { Prisma } from "@prisma/client";

import { crearPrecioKiloSchema } from "@/lib/zod/precioKilo";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { buscarPrecioKiloPorId, crearPrecioKilo as crearPrecioKiloRepo } from "@/server/repositories/precioKilo";

function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const crearPrecioKilo = withAuth(
  { schema: crearPrecioKiloSchema, rol: "GERENTE", entidad: "PrecioKilo", accion: "CREAR" },
  async (input, ctx) => {
    const ahora = new Date();
    let precioKilo;
    try {
      precioKilo = await crearPrecioKiloRepo({
        id: input.id,
        precio: input.precio,
        usuarioId: ctx.usuarioId,
        vigenteDesde: ahora,
      });
    } catch (error) {
      if (!esErrorDeUnicidad(error)) throw error;
      const existente = await buscarPrecioKiloPorId(input.id);
      if (!existente) throw error;
      if (Number(existente.precio) !== input.precio) {
        throw new AccionError("Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.");
      }
      precioKilo = existente;
    }
    return {
      data: { id: precioKilo.id, precio: Number(precioKilo.precio) },
      entidadId: precioKilo.id,
      estadoDespues: { precio: Number(precioKilo.precio), vigenteDesde: precioKilo.vigenteDesde.toISOString() },
    };
  },
);
```
**Nunca es un `UPDATE`** — cada llamada exitosa (no idempotente) inserta una
fila nueva, la fila anterior queda intacta. `estadoAntes` no aplica acá (no
hay "antes" de una entidad que solo se inserta, nunca se modifica) — mismo
criterio que `crearGalpon`/`crearCliente`, que tampoco lo llevan.

## Diseño de UI

### `components/domain/clientes/cliente-form-dialog.tsx` (nuevo)
Un solo componente parametrizado por `modo: "crear" | "editar"`, clon
directo de `GalponFormDialog`/`LoteFormDialog`: subcomponente de formulario
montado solo mientras `open`, `id` generado una sola vez por apertura
(`useState(() => crypto.randomUUID())`, solo en modo crear),
`<form action={formAction}>` directo (sin arreglos de longitud variable).
Campos: `nombre` (`<Input>` texto), `celular` (`<Input>` texto, opcional),
`direccion` (`<Input>` texto, opcional), `tipo` (`<Select>` controlado con
las 3 opciones — `MAYORISTA`/`MINORISTA`/`EVENTUAL` con etiqueta legible,
`<SelectValue>` con `children` resuelto a mano, mismo fix que el Bug 2 de
Sprint 3).

### `components/domain/clientes/clientes-tabla.tsx` (nuevo)
Tabla envuelta en `<TableScrollArea>`. Columnas: Nombre, Celular, Dirección,
Tipo (badge), Estado (badge), Acciones (Editar / Suspender-Activar).

**Badge de `tipo` — decisión de diseño tomada en esta planificación:** a
diferencia de un caso con pocos valores donde alcanza `<Badge
variant="outline">` sin receta propia (`memory/convenciones.md`), acá el
volumen esperado de filas (el propio brief de este sprint señala que
"la pantalla de Clientes probablemente crece más que Galpones/Lotes")
justifica un color por valor para ubicar cada tipo de un vistazo, mismo
criterio que ya aplicó Bitácora/Mortalidad (`.badge-categoria-*`/
`.badge-tipo-*`). Tres clases nuevas en `globals.css`
(`.badge-tipo-cliente-mayorista`/`.badge-tipo-cliente-minorista`/
`.badge-tipo-cliente-eventual`), cada una con `!` en sus utilidades (mismo
motivo documentado en `memory/convenciones.md`: se usan junto a
`<Badge variant="outline">`, que si no pierden contra las utilidades del
`variant`).

**Badge de `estado` — sin clases nuevas.** `EstadoCliente` es
`ACTIVO`/`SUSPENDIDO`, mapeado a las mismas `.badge-estado-activo`/
`.badge-estado-inactivo` que ya comparten Usuario/Galpon/Lote (la receta es
visual, no depende del nombre literal del enum) — solo cambia el texto
mostrado ("Suspendido" en vez de "Inactivo").

**Fila de "Público General" — guard visual.** `esClientePublicoGeneral(id)`
(la misma función de `server/services/cliente.ts`, importable sin problema
desde un Client Component porque es una función pura sin Prisma) decide si
los botones de Editar/Suspender de esa fila se renderizan `disabled`, con
un `title`/nota "Cliente del sistema — no editable" en vez de ocultarse sin
explicación (mismo criterio de claridad que el resto del proyecto usa para
estados vacíos/deshabilitados).

### `components/domain/clientes/cliente-filtros.tsx` (nuevo)
Clon del esqueleto de `MortalidadFiltros` con un único `<Input>` de texto
(`placeholder: "Buscar por nombre o celular..."`) en vez de `<Select>`s —
mismo patrón de URL (`?busqueda=...`, borra `page` al cambiar,
`startTransition(() => router.replace(...))`). A diferencia de
Mortalidad/Recolección, con un único campo no hace falta el marco
colapsable "Filtros" (`abierto`/`ChevronDown`) — el `<Input>` se muestra
siempre visible, directo debajo de `PageHeader` (menos fricción para el
caso de uso más común de esta pantalla: buscar).

### `app/(app)/clientes/page.tsx` (nuevo)
```tsx
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; busqueda?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const busqueda = params.busqueda?.trim() || undefined;
  const pageSize = 10;

  const [clientes, total] = await Promise.all([
    listarClientes({ skip: (page - 1) * pageSize, take: pageSize, busqueda }),
    contarClientes({ busqueda }),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Clientes" actions={<ClienteFormDialog modo="crear" />} />
      <ClienteFiltros busqueda={busqueda} />
      <ClientesTabla clientes={clientes} />
      <DataTablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath="/clientes"
        filtros={{ busqueda }}
      />
    </div>
  );
}
```
Sin guard de rol — sin entrada en `RUTAS_POR_ROL` (decisión de negocio 1).

### `components/domain/precio-kilo/actualizar-precio-dialog.tsx` (nuevo)
Formulario mínimo (un solo campo numérico `precio`), mismo esqueleto que
`GalponFormDialog` pero sin `modo` (siempre es "crear" — nunca se edita un
`PrecioKilo`). `id` generado una sola vez por apertura.

### `app/(app)/precio-kilo/page.tsx` (nuevo)
```tsx
export default async function PrecioKiloPage() {
  const vigente = await obtenerPrecioKiloVigente();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Precio por Kilo" actions={<ActualizarPrecioDialog />} />
      {vigente ? (
        <div className="rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground">Precio vigente</p>
          <p className="text-3xl font-semibold text-foreground">
            S/ {Number(vigente.precio).toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground">
            Fijado por {vigente.usuario.nombre} el{" "}
            {vigente.vigenteDesde.toLocaleDateString("es-PE", { timeZone: "America/Lima" })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay ningún precio fijado.</p>
      )}
    </div>
  );
}
```
El estado vacío (`vigente === null`) es defensivo — en la práctica el seed
siempre siembra al menos una fila, pero la pantalla no asume que
`obtenerPrecioKiloVigente()` nunca devuelve `null`.

### `components/layout/nav-items.ts` (modifica)
Agrega `{ href: "/clientes", label: "Clientes", icon: Contact }` y
`{ href: "/precio-kilo", label: "Precio por Kilo", icon: Tag }` (ambos
íconos nuevos de `lucide-react`, ya en el paquete instalado — `Contact`
para una persona/cliente registrado, `Tag` para un precio, mismo criterio
de semántica directa que el resto de íconos elegidos hasta ahora).

### `server/auth/rbac.ts` (modifica)
```ts
export const RUTAS_POR_ROL: { ruta: string; roles: Rol[] }[] = [
  { ruta: "/usuarios", roles: ["GERENTE"] },
  { ruta: "/galpones", roles: ["GERENTE"] },
  { ruta: "/lotes", roles: ["GERENTE"] },
  { ruta: "/precio-kilo", roles: ["GERENTE"] }, // NUEVO Sprint 8
];
```
`/clientes` NO entra en esta lista (decisión de negocio 1 — abierta a
ambos roles, mismo criterio que `/mortalidad`/`/recoleccion`/
`/consolidacion`).

## Orden de ejecución (hay dependencias entre tareas)
1. `server/services/cliente.ts` (`esClientePublicoGeneral`) + tests —
   independiente de todo lo demás (función pura, sin Prisma).
2. `lib/zod/cliente.ts` + tests — independiente.
3. `lib/zod/precioKilo.ts` + tests — independiente.
4. `server/repositories/cliente.ts` — depende de nada nuevo (schema ya
   existe).
5. `server/repositories/precioKilo.ts` — depende de nada nuevo.
6. `server/actions/cliente.ts` — depende de 1, 2, 4.
7. `server/actions/precioKilo.ts` — depende de 3, 5.
8. UI: `ClienteFormDialog` — depende de 6.
9. UI: `ClientesTabla` + `ClienteFiltros` — depende de 4 (tipos de datos),
   1 (guard visual).
10. `app/(app)/clientes/page.tsx` — depende de 8, 9.
11. UI: `ActualizarPrecioDialog` + `app/(app)/precio-kilo/page.tsx` —
    depende de 7.
12. `components/layout/nav-items.ts` + `server/auth/rbac.ts` — depende de
    10, 11 (las rutas ya tienen que existir).
13. Tests de integración de las cuatro Server Actions (repositories
    mockeados) — depende de 6, 7.
14. `npx vitest run --coverage` — confirmar ≥90% en
    `server/services/cliente.ts`.
15. Verificación en vivo contra Neon real: CRUD completo de Cliente, guard
    de Público General (editar y suspender rechazados), búsqueda por
    nombre/celular, alta de PrecioKilo (fila nueva, vigente correcto,
    histórico intacto), idempotencia real (H5) en ambas entidades.
16. Verificación clic a clic en navegador / Product Owner.

## Comandos de referencia
```bash
npm run typecheck && npm run lint && npm test
npx vitest run --coverage
npx prisma validate
npm run build
```
Sin `npx prisma migrate dev` este sprint (ver "Sin migración de schema").

## Estructura de archivos esperada
```
src/
  lib/
    zod/
      cliente.ts             # nuevo: crearClienteSchema, editarClienteSchema, cambiarEstadoClienteSchema
      precioKilo.ts          # nuevo: crearPrecioKiloSchema
  server/
    services/
      cliente.ts             # nuevo: esClientePublicoGeneral
    repositories/
      cliente.ts             # nuevo: crearCliente, buscarClientePorId, actualizarCliente, cambiarEstadoCliente, listarClientes, contarClientes
      precioKilo.ts          # nuevo: crearPrecioKilo, buscarPrecioKiloPorId, obtenerPrecioKiloVigente
    actions/
      cliente.ts             # nuevo: crearCliente, editarCliente, cambiarEstadoClienteAction
      precioKilo.ts          # nuevo: crearPrecioKilo
    auth/
      rbac.ts                 # + entrada /precio-kilo
  components/domain/
    clientes/
      cliente-form-dialog.tsx      # nuevo
      clientes-tabla.tsx           # nuevo
      cliente-filtros.tsx          # nuevo
    precio-kilo/
      actualizar-precio-dialog.tsx # nuevo
  components/layout/nav-items.ts    # + "Clientes", "Precio por Kilo"
  app/(app)/
    clientes/page.tsx               # nuevo
    precio-kilo/page.tsx            # nuevo
tests/
  unit/services/cliente.test.ts               # nuevo: esClientePublicoGeneral
  unit/lib/zod-cliente.test.ts                # nuevo
  unit/lib/zod-precio-kilo.test.ts            # nuevo
  integration/actions/cliente.test.ts          # nuevo
  integration/actions/precio-kilo.test.ts      # nuevo
```

## Definition of Done aplicable a este sprint
- `npm run typecheck && npm run lint && npm test` en verde.
- `npx vitest run --coverage` ≥90% en `server/services/cliente.ts`.
- `npx prisma validate` en verde (sin migración nueva este sprint).
- `npm run build` en verde.
- Guard de "Público General" verificado en la Server Action (no solo en la
  UI) — un intento directo de `editarCliente`/`cambiarEstadoClienteAction`
  contra `CLIENTE_PUBLICO_GENERAL_ID` rechaza siempre, sin importar qué
  mande el cliente.
- Idempotencia real verificada contra Neon (H5) para `crearCliente` y para
  `crearPrecioKilo` — reintento exitoso sin duplicar, reintento con datos
  distintos rechazado, no solo con mocks.
- `PrecioKilo`: verificado en vivo que dos altas sucesivas dejan DOS filas
  reales en la base (nunca un `UPDATE`), y que `obtenerPrecioKiloVigente()`
  siempre resuelve la más reciente por `vigenteDesde`.
- `AuditLog` con filas reales `CREAR`/`EDITAR`/`CAMBIAR_ESTADO` sobre
  `Cliente` y `CREAR` sobre `PrecioKilo`, verificadas contra Neon.
- Verificación clic a clic en navegador real: CRUD completo de Cliente,
  búsqueda funcionando, "Público General" con acciones deshabilitadas en la
  UI, alta de precio con la pantalla reflejando el nuevo vigente sin
  recargar.
- `memory/estado-proyecto.md` actualizado al cerrar (registro de cierre de
  Sprint 8, con la decisión de no agregar `creadoEn`/`creadoEnCliente` a
  `Cliente` documentada explícitamente, ver `spec.md` R4).
