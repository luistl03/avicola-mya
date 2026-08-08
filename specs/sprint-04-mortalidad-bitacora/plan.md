# Plan técnico — Sprint 4

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma:162-204` — `RegistroMortalidad`, `BitacoraGlobal`,
  `TipoMortalidad`, `CategoriaBitacora` ya existen desde Sprint 0, sin
  cambios necesarios. **Sin migración en este sprint.**
- `server/repositories/lote.ts` ya tiene `buscarLotePorId`,
  `buscarUbicacionActual`. **No tiene** `listarLotesActivos` — se agrega acá.
- `server/auth/with-auth.ts` (`withAuth`, `AccionError`) sin cambios, se
  reusa para las dos mutaciones (`registrarMortalidad`, `crearNotaBitacora`).
- `server/repositories/auditLog.ts` (`crearAuditLog`) sin cambios.
- `components/ui/sheet.tsx` ya existe (usado hoy solo por el Sidebar
  mobile) — soporta `side="bottom"` de fábrica
  (`data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0`). No hace
  falta instalar ni tocar el componente shadcn, solo usarlo con contenido
  nuevo.
- `components/ui/data-table-pagination.tsx`, `table-scroll-area.tsx`,
  `page-header.tsx`, `toast.tsx`, `select.tsx`, `badge.tsx` sin cambios —
  este sprint no instala ningún componente shadcn nuevo.
- `server/auth/rbac.ts` (`RUTAS_POR_ROL`) — no se le agrega nada este
  sprint (ver decisión de diseño en spec.md: `/mortalidad` y `/bitacora`
  quedan sin restricción de rol).
- `components/layout/nav-items.ts` (`NAV_ITEMS`) — se amplía con
  "Mortalidad" y "Bitácora".
- `lib/zod/comun.ts` (`idUuid`) sin cambios, se reusa para `loteId`.

## Nueva pieza de arquitectura: transacción interactiva (primera vez en el proyecto)

### Por qué el array-form de `$transaction` no alcanza acá
Toda transacción de Sprints 2-3 (`desactivarUsuarioYRevocarSesiones`,
`crearLoteConUbicacion`, `mudarLote`, `finalizarLote`) usa el "array-form"
de `prisma.$transaction([...])`: una lista fija de queries que Prisma
agrupa en una sola transacción de base de datos, todas se ejecutan pase lo
que pase con las anteriores (no hay forma de leer el resultado de la
primera query para decidir si se ejecuta la segunda). Eso alcanzaba porque
ninguna de esas transacciones necesitaba abortar la segunda operación
según el resultado de la primera.

Esta sí: si el `UPDATE` condicional sobre `Lote.avesVivas` afecta 0 filas
(la cantidad pedida ya no cabe, por una carrera con otro registro
simultáneo), **no se debe crear `RegistroMortalidad`** — un array-form
crearía la fila igual, dejando un registro de mortalidad sin decremento
real detrás. Se necesita `prisma.$transaction(async (tx) => {...})`
(transacción interactiva): ejecuta el `updateMany` condicional, lee su
`count`, y solo si es `1` continúa con el `create`; si es `0`, lanza un
error que hace *rollback* de toda la transacción.

```ts
// server/repositories/mortalidad.ts
export class AvesInsuficientesError extends Error {}

export function registrarMortalidadYDescontarAves(data: {
  loteId: string;
  galponId: string;
  usuarioId: string;
  tipo: TipoMortalidad;
  cantidad: number;
}) {
  return prisma.$transaction(async (tx) => {
    // UPDATE ... WHERE avesVivas >= cantidad: el guard real contra la
    // carrera vive acá, a nivel de base de datos, no en la lectura previa
    // que ya hizo la guard de aplicación (puedeRegistrarMortalidad) —
    // esa lectura pudo quedar desactualizada por otro registro
    // simultáneo. count === 0 significa "ya no alcanza", sin importar
    // qué decía la lectura de hace un instante.
    const actualizado = await tx.lote.updateMany({
      where: { id: data.loteId, avesVivas: { gte: data.cantidad } },
      data: { avesVivas: { decrement: data.cantidad } },
    });
    if (actualizado.count === 0) {
      throw new AvesInsuficientesError();
    }
    return tx.registroMortalidad.create({
      data: {
        loteId: data.loteId,
        galponId: data.galponId,
        usuarioId: data.usuarioId,
        tipo: data.tipo,
        cantidad: data.cantidad,
      },
    });
  });
}
```
`AvesInsuficientesError` (no `AccionError` directo) porque este archivo es
un `repository` — no importa `server/auth/with-auth.ts` (ADR-000: los
repositories no conocen la capa de actions). La action (abajo) la atrapa y
la traduce a `AccionError` con el mensaje que ve el usuario, mismo patrón
que `esErrorDeUnicidad`/`P2002` en `server/actions/lote.ts`.

**Nota para Sprint 9** (`Update condicional anti-doble-venta`): ese sprint
va a necesitar exactamente este mismo patrón (`UPDATE ... WHERE
estado='DISPONIBLE'` dentro de una transacción interactiva que aborte si
afecta 0 filas) — reusar esta forma, no reinventarla.

## Diseño de servicios puros

### `server/services/mortalidad.ts`
```ts
import type { EstadoLote } from "@prisma/client";
import type { GuardResultado } from "@/server/services/galpon";

export function puedeRegistrarMortalidad(params: {
  loteEstado: EstadoLote;
  avesVivas: number;
  cantidad: number;
}): GuardResultado {
  if (params.loteEstado !== "ACTIVO") {
    return { permitido: false, motivo: "Solo se puede registrar mortalidad de un lote activo." };
  }
  if (params.cantidad > params.avesVivas) {
    return {
      permitido: false,
      motivo: `Solo quedan ${params.avesVivas} aves vivas en este lote.`,
    };
  }
  return { permitido: true };
}
```
Reusa el tipo `GuardResultado` ya definido en `server/services/galpon.ts`
(Sprint 3) — mismo contrato `{ permitido: true } | { permitido: false;
motivo: string }` en todo el proyecto, no uno nuevo por módulo. Esta guard
es la que da el mensaje rápido y preciso ("solo quedan N aves") en el caso
común; el `UPDATE` condicional del repository es el backstop atómico para
la carrera, con un mensaje genérico (ver acción abajo) porque en ese caso
puntual no sabemos el número exacto sin una lectura extra.

`cantidad == avesVivas` (deja el lote en 0) está explícitamente permitido
— coincide con lo que Sprint 3 ya decidió para `avesVivas` en general
("puede ser cualquier valor ≥0, incluido 0").

### `server/services/bitacora.ts`
No hace falta ninguna guard de negocio — la única validación de
`BitacoraGlobal` es de forma (categoría válida, contenido no vacío), que
ya cubre Zod. Este archivo **no se crea** si no hay nada puro que
justifique su existencia (evita un archivo vacío solo por simetría con
`mortalidad.ts`).

## Diseño de repositories

### `server/repositories/lote.ts` (agregado)
```ts
// Para poblar el <Select> de lote en el formulario de mortalidad — sin
// paginar, mismo criterio que listarGalponesActivos(). avesVivas viaja
// junto para que el formulario pueda mostrar "quedan N vivas" sin una
// segunda consulta.
export function listarLotesActivos() {
  return prisma.lote.findMany({
    where: { estado: "ACTIVO" },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, avesVivas: true },
  });
}
```

### `server/repositories/mortalidad.ts`
```ts
export { AvesInsuficientesError, registrarMortalidadYDescontarAves }; // ver arriba

// Para la tabla de /mortalidad: una sola query con include (no N+1),
// mismo criterio que listarLotesConUbicacion.
export function listarRegistrosMortalidad(params: { skip: number; take: number }) {
  return prisma.registroMortalidad.findMany({
    orderBy: { fecha: "desc" },
    skip: params.skip,
    take: params.take,
    include: {
      lote: { select: { codigo: true } },
      galpon: { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
  });
}

export function contarRegistrosMortalidad() {
  return prisma.registroMortalidad.count();
}
```

### `server/repositories/bitacora.ts`
```ts
export function crearNotaBitacora(data: {
  categoria: CategoriaBitacora;
  contenido: string;
  usuarioId: string;
}) {
  return prisma.bitacoraGlobal.create({ data });
}

// Paginación por cursor (no por página/skip) — ver "Muro cronológico" en
// spec.md para el porqué. orderBy compuesto (fecha desc, id desc) para
// que el orden sea determinístico incluso si dos notas comparten
// timestamp exacto (poco probable en uso real, posible en un script de
// carga o en tests) — sin el segundo criterio, el cursor podría saltear o
// repetir una fila empatada en fecha.
export function listarBitacoraPagina(params: {
  cursorId?: string;
  take: number;
  categoria?: CategoriaBitacora;
  desde?: Date;
  hasta?: Date;
}) {
  return prisma.bitacoraGlobal.findMany({
    where: {
      categoria: params.categoria,
      fecha: {
        gte: params.desde,
        lte: params.hasta,
      },
    },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
    take: params.take,
    ...(params.cursorId
      ? { cursor: { id: params.cursorId }, skip: 1 } // skip 1: no repetir el cursor mismo
      : {}),
    include: { usuario: { select: { nombre: true } } },
  });
}
```
`categoria`/`fecha` como `undefined` en el `where` hacen que Prisma
simplemente omita esa condición (no filtra) — no hace falta armar el
objeto `where` condicionalmente a mano.

## Diseño de Zod schemas

### `lib/zod/mortalidad.ts`
```ts
import { z } from "zod";
import { idUuid } from "@/lib/zod/comun";

const loteId = idUuid("Seleccioná un lote");
const tipo = z.enum(["MUERTE", "DESCARTE"], { message: "Elegí un tipo." });
const cantidad = z.coerce.number().int().positive("Debe ser mayor a 0");

export const crearRegistroMortalidadSchema = z.object({ loteId, tipo, cantidad });
export type CrearRegistroMortalidadInput = z.infer<typeof crearRegistroMortalidadSchema>;
```

### `lib/zod/bitacora.ts`
```ts
import { z } from "zod";
import { idUuid } from "@/lib/zod/comun";

const categoria = z.enum(["ALIMENTACION", "VACUNACION", "OBSERVACION"], {
  message: "Elegí una categoría.",
});
const contenido = z.string().trim().min(1, "La nota no puede estar vacía.").max(2000);

export const crearNotaBitacoraSchema = z.object({ categoria, contenido });
export type CrearNotaBitacoraInput = z.infer<typeof crearNotaBitacoraSchema>;

// Input del fetch de scroll infinito — todo opcional salvo take, que el
// cliente no controla (constante fija, ver PAGE_SIZE_MURO en el
// componente). cursorId usa idUuid() igual que cualquier id — es un id
// real de BitacoraGlobal, no texto libre.
export const obtenerMasBitacoraSchema = z.object({
  cursorId: idUuid().optional(),
  categoria: categoria.optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});
export type ObtenerMasBitacoraInput = z.infer<typeof obtenerMasBitacoraSchema>;
```

## Diseño de Server Actions

### `server/actions/mortalidad.ts`
```ts
"use server";

import { crearRegistroMortalidadSchema } from "@/lib/zod/mortalidad";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { buscarLotePorId, buscarUbicacionActual } from "@/server/repositories/lote";
import {
  AvesInsuficientesError,
  registrarMortalidadYDescontarAves,
} from "@/server/repositories/mortalidad";
import { puedeRegistrarMortalidad } from "@/server/services/mortalidad";

// Sin `rol`: GERENTE y OPERARIO pueden registrar mortalidad por igual
// (decisión de diseño confirmada en spec.md) — withAuth ya soporta
// omitir `rol` para "alcanza con estar autenticado" (ver with-auth.ts).
export const registrarMortalidad = withAuth(
  { schema: crearRegistroMortalidadSchema, entidad: "RegistroMortalidad", accion: "CREAR" },
  async (input, ctx) => {
    const lote = await buscarLotePorId(input.loteId);
    if (!lote) {
      throw new AccionError("El lote no existe.");
    }

    const guard = puedeRegistrarMortalidad({
      loteEstado: lote.estado,
      avesVivas: lote.avesVivas,
      cantidad: input.cantidad,
    });
    if (!guard.permitido) {
      throw new AccionError(guard.motivo);
    }

    const ubicacion = await buscarUbicacionActual(input.loteId);
    if (!ubicacion) {
      // Defensivo: un lote ACTIVO siempre debería tener una ubicación
      // abierta (índice único parcial de S0-5 + Sprint 3 lo garantizan) —
      // no debería pasar en la práctica.
      throw new AccionError("El lote no tiene una ubicación registrada.");
    }

    let registro;
    try {
      registro = await registrarMortalidadYDescontarAves({
        loteId: input.loteId,
        galponId: ubicacion.galponId,
        usuarioId: ctx.usuarioId,
        tipo: input.tipo,
        cantidad: input.cantidad,
      });
    } catch (error) {
      if (error instanceof AvesInsuficientesError) {
        throw new AccionError(
          "Ya no quedan suficientes aves vivas para este registro — actualizá la pantalla e intentá de nuevo.",
        );
      }
      throw error;
    }

    return {
      data: { id: registro.id },
      entidadId: registro.id,
      estadoDespues: {
        loteId: input.loteId,
        galponId: ubicacion.galponId,
        tipo: input.tipo,
        cantidad: input.cantidad,
      },
    };
  },
);
```

### `server/actions/bitacora.ts`
```ts
"use server";

import { auth } from "@/server/auth";
import { crearNotaBitacoraSchema, obtenerMasBitacoraSchema } from "@/lib/zod/bitacora";
import { withAuth } from "@/server/auth/with-auth";
import { crearNotaBitacora as crearNotaBitacoraRepo, listarBitacoraPagina } from "@/server/repositories/bitacora";

// Mutación real → sí pasa por withAuth, sin `rol` (ambos roles escriben).
export const crearNotaBitacora = withAuth(
  { schema: crearNotaBitacoraSchema, entidad: "BitacoraGlobal", accion: "CREAR" },
  async (input, ctx) => {
    const nota = await crearNotaBitacoraRepo({
      categoria: input.categoria,
      contenido: input.contenido,
      usuarioId: ctx.usuarioId,
    });
    return {
      data: { id: nota.id },
      entidadId: nota.id,
      estadoDespues: { categoria: nota.categoria, contenido: nota.contenido },
    };
  },
);

const PAGE_SIZE_MURO = 20;

// Lectura, no mutación → NO pasa por withAuth (ver decisión de diseño en
// spec.md: withAuth es para mutaciones con AuditLog de una entidad
// puntual, no para paginar un listado). Verifica sesión a mano — mismo
// nivel de protección real (nadie sin sesión ve nada), sin la maquinaria
// de rol/AuditLog que acá no aplica.
export async function obtenerMasBitacora(rawInput: unknown) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "No autenticado." };
  }

  const parsed = obtenerMasBitacoraSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }

  const items = await listarBitacoraPagina({ ...parsed.data, take: PAGE_SIZE_MURO });
  return { ok: true as const, data: items };
}
```

## Diseño de UI

### `app/(app)/mortalidad/page.tsx`
Server Component, **sin** guard de rol (a diferencia de
`usuarios|galpones|lotes/page.tsx`, que rechazan con `notFound()` si el
rol no es GERENTE — acá cualquier rol autenticado entra). `Promise.all` de
`listarRegistrosMortalidad`, `contarRegistrosMortalidad`,
`listarLotesActivos`. `PageHeader` con `RegistrarMortalidadSheet` (recibe
`lotesActivos`) como `actions`.

`MortalidadTabla` columnas: Fecha | Lote (código) | Galpón | Tipo (badge
simple, sin `globals.css` nuevo — dos valores fijos, `variant="outline"`
alcanza, no hace falta una receta de color con nombre) | Cantidad |
Registrado por. `<TableScrollArea>`, sin acciones (no hay editar/revertir
en este sprint).

`RegistrarMortalidadSheet` (`components/domain/mortalidad/registrar-mortalidad-sheet.tsx`):
botón `size="lg"` (target táctil de campo, no `size="md"` — esta pantalla
es de campo, no de gestión de escritorio, ver comentario de
`ui/button.tsx`) que abre un `<Sheet side="bottom">`. Formulario con
`useActionState` + `registrarMortalidad`: `<Select>` de lote (opciones
`"{codigo} — {avesVivas} vivas"`, controlado igual que el `<Select>` de
galpón de `LoteFormDialog`/`MudanzaDialog` — Bug 2 de Sprint 3 enseñó que
`<SelectValue>` necesita `children` explícito, no confiar en la
resolución interna de Base UI), `<Select>` de tipo (MUERTE/DESCARTE,
texto legible, sin el problema del Bug 2 por la misma razón que el
`<Select>` de rol de Usuarios), input numérico de cantidad
(`inputmode="numeric"`, `min={1}`). Formulario gateado detrás de `{open ?
(...) : null}` (Bug 3 de Sprint 3: el `Sheet` no se desmonta solo con
`open=false`, hay que forzarlo para que `useActionState` no arrastre el
error de la tanda anterior).

### `app/(app)/bitacora/page.tsx`
Server Component, sin guard de rol. Lee `searchParams` (`categoria?`,
`desde?`, `hasta?`), llama `listarBitacoraPagina({ take: PAGE_SIZE_MURO,
categoria, desde, hasta })` (sin `cursorId` = primera tanda). `PageHeader`
con `NuevaNotaBitacoraSheet` como `actions`. Renderiza `<BitacoraFiltros
categoria desde hasta />` (Client Component, actualiza la URL vía
`useRouter().push` — mismo criterio "dirigido por URL" que
`DataTablePagination`) y `<BitacoraMuro itemsIniciales categoria desde
hasta />` (Client Component).

`BitacoraMuro` (`components/domain/bitacora/bitacora-muro.tsx`): lista de
tarjetas (fecha, badge de categoría, contenido, autor), con un `<div
ref={sentinelaRef}>` invisible al final. `IntersectionObserver` sobre esa
sentinela dispara `obtenerMasBitacora({ cursorId: ultimoId, categoria,
desde, hasta })`; agrega los items nuevos al estado local y actualiza
`ultimoId`; si la respuesta trae menos de `PAGE_SIZE_MURO` items, marca
"sin más resultados" y desconecta el observer (evita seguir pidiendo
tandas vacías). Sin librería nueva — `IntersectionObserver` es nativo del
navegador, no hace falta `react-intersection-observer` ni similar para
un solo sentinel.

`NuevaNotaBitacoraSheet`: mismo patrón que `RegistrarMortalidadSheet`
(`<Sheet side="bottom">`, `useActionState` + `crearNotaBitacora`,
gateado). Campos: `<Select>` de categoría (controlado, texto legible) +
`<textarea>` de contenido (no hay componente `Textarea` de shadcn
instalado todavía — se agrega `components/ui/textarea.tsx`, copia
estándar del primitivo de shadcn, mismo criterio de estilo que `input.tsx`).

## Badges de Tipo/Categoría — por qué no van a `globals.css`
`memory/convenciones.md` reserva `globals.css` para "recetas de color con
nombre que definen un estado visual" (éxito, error, activo/inactivo) que
se repiten en más de un lugar o requieren tonos específicos. Los badges de
`TipoMortalidad` y `CategoriaBitacora` de este sprint son etiquetas
neutras de clasificación, no estados con semántica de color (no hay un
"tipo bueno" o "categoría mala") — `<Badge variant="outline">` con el
texto tal cual (`"Muerte"`/`"Descarte"`, `"Alimentación"`/`"Vacunación"`/
`"Observación"`) alcanza sin inventar una paleta nueva. Si en un sprint
futuro se pide diferenciarlos por color, ahí sí se documenta en
`globals.css` siguiendo la regla existente.

## `NAV_ITEMS`
```ts
// components/layout/nav-items.ts
import { Home, Layers3, NotebookPen, Skull, Users, Warehouse } from "lucide-react";

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/usuarios", label: "Usuarios", icon: Users },
  { href: "/galpones", label: "Galpones", icon: Warehouse },
  { href: "/lotes", label: "Lotes", icon: Layers3 },
  { href: "/mortalidad", label: "Mortalidad", icon: Skull },
  { href: "/bitacora", label: "Bitácora", icon: NotebookPen },
];
```
Confirmar en la tarea de nav que `Skull`/`NotebookPen` existen en la
versión instalada de `lucide-react` (mismo chequeo que Sprint 3 hizo con
`Warehouse`/`Layers3`) — si no, usar el ícono equivalente más cercano
disponible sin bloquear la tarea.

`RUTAS_POR_ROL` **no se toca** — confirmar releyendo `rolPermitidoParaRuta()`
que una ruta ausente de la lista efectivamente queda abierta a cualquier
rol autenticado (ya es el comportamiento documentado en el propio archivo,
solo hay que no agregar una entrada nueva).

## Actualización de `memory/convenciones.md` en este mismo sprint
Dos adiciones (ver decisiones de diseño en spec.md):
1. Sección nueva "Tabla paginada vs. muro con scroll infinito" — cuándo
   usar cada patrón (gestión con volumen acotado y necesidad de ir a una
   fila específica → paginación por página; feed cronológico donde lo
   único que importa es "seguir bajando" → cursor + scroll infinito).
2. Corrección de la sección "Server Actions": aclarar que "toda Server
   Action pasa por `withAuth`" aplica a **mutaciones**; una lectura
   adicional para un feed/scroll infinito puede ser una Server Action
   liviana con su propia verificación de sesión, sin `AuditLog`.

## Orden de ejecución (hay dependencias entre tareas)
1. **S4-1** — `server/repositories/lote.ts`: agregar `listarLotesActivos`.
   Independiente, primero porque el formulario de mortalidad lo necesita.
2. **S4-2** — `lib/zod/mortalidad.ts` + `server/repositories/mortalidad.ts`
   (`AvesInsuficientesError`, `registrarMortalidadYDescontarAves`,
   `listarRegistrosMortalidad`, `contarRegistrosMortalidad`) +
   `server/services/mortalidad.ts` (`puedeRegistrarMortalidad`).
3. **S4-3** — `server/actions/mortalidad.ts` (`registrarMortalidad`, vía
   `withAuth` sin `rol`). Depende de S4-1, S4-2.
4. **S4-4** — `components/ui/textarea.tsx` (nuevo, shadcn estándar) +
   pantalla `/mortalidad` (`RegistrarMortalidadSheet`, `MortalidadTabla`,
   `page.tsx`). Depende de S4-3.
5. **S4-5** — `lib/zod/bitacora.ts` + `server/repositories/bitacora.ts`
   (`crearNotaBitacora`, `listarBitacoraPagina`). Independiente de
   Mortalidad.
6. **S4-6** — `server/actions/bitacora.ts` (`crearNotaBitacora` vía
   `withAuth`; `obtenerMasBitacora` liviana). Depende de S4-5.
7. **S4-7** — Pantalla `/bitacora` (`NuevaNotaBitacoraSheet`,
   `BitacoraFiltros`, `BitacoraMuro` con `IntersectionObserver`,
   `page.tsx`). Depende de S4-6.
8. **S4-8** — `NAV_ITEMS` ("Mortalidad", "Bitácora"). Depende de S4-4 y
   S4-7 (para no navegar a una pantalla que no existe todavía).
9. **S4-9** — Actualizar `memory/convenciones.md` (las dos adiciones de
   arriba). Puede hacerse en paralelo con cualquier tarea de UI, antes de
   cerrar el sprint.
10. **S4-10** — Tests unitarios de `services/mortalidad.ts`
    (`puedeRegistrarMortalidad`: INACTIVO, cantidad > avesVivas, cantidad
    == avesVivas exacto, caso con margen). Puede escribirse apenas S4-2
    existe.
11. **S4-11** — Tests de integración de `actions/mortalidad.ts` y
    `actions/bitacora.ts` (repositories mockeados, mismo patrón que
    `tests/integration/actions/lote.test.ts`), incluyendo el caso de
    `AvesInsuficientesError` mockeado. Depende de S4-3, S4-6.
12. **S4-12** — Verificación en vivo contra Neon real (guard anti-carrera
    forzado, flujo completo de ambas pantallas) + verificación mobile real
    (celular físico o extensión). Al final, cubre S4-1 a S4-9.

## Comandos de referencia
```bash
npx prisma validate    # confirma que no se necesitó tocar el schema
npx prisma studio       # verificar filas de RegistroMortalidad/BitacoraGlobal
npm run typecheck && npm run lint && npm test
npm run build
```

## Estructura de archivos esperada
```
src/
  server/
    actions/
      mortalidad.ts
      bitacora.ts
    services/
      mortalidad.ts               # puedeRegistrarMortalidad
    repositories/
      lote.ts                     # + listarLotesActivos
      mortalidad.ts                # AvesInsuficientesError, registrarMortalidadYDescontarAves, listar/contar
      bitacora.ts                  # crearNotaBitacora, listarBitacoraPagina
  lib/
    zod/
      mortalidad.ts
      bitacora.ts
  components/
    ui/
      textarea.tsx                 # nuevo
    layout/
      nav-items.ts                 # + Mortalidad, Bitácora
    domain/
      mortalidad/
        registrar-mortalidad-sheet.tsx
        mortalidad-tabla.tsx
      bitacora/
        nueva-nota-bitacora-sheet.tsx
        bitacora-filtros.tsx
        bitacora-muro.tsx
  app/
    (app)/
      mortalidad/
        page.tsx
      bitacora/
        page.tsx
memory/
  convenciones.md                  # + muro con scroll infinito, withAuth solo mutaciones
tests/
  factories/
    mortalidad.factory.ts
    bitacora.factory.ts
  unit/
    services/
      mortalidad.test.ts
  integration/
    actions/
      mortalidad.test.ts
      bitacora.test.ts
```

## Definition of Done aplicable a este sprint
`memory/definition-of-done.md` sigue sin existir (mismo hallazgo que
Sprints 2 y 3). Hasta que se cree, este sprint se verifica contra:
- Ningún componente ni service importa Prisma directamente — solo
  `server/repositories/lote.ts`, `mortalidad.ts`, `bitacora.ts`.
- Las dos mutaciones nuevas (`registrarMortalidad`, `crearNotaBitacora`)
  pasan por `withAuth`. `obtenerMasBitacora` (lectura) verifica sesión a
  mano, con Zod, documentado como excepción deliberada (ver spec.md).
- El decremento de `avesVivas` + la creación de `RegistroMortalidad` va
  dentro de una única transacción (interactiva, ver arriba) — nunca dos
  escrituras separadas.
- TypeScript strict, cero `any`, cero `@ts-ignore`.
- `npm run typecheck && npm run lint && npm test`, `npm run build` y
  `npx prisma validate` en verde antes de cerrar el sprint.
- Guard anti-carrera verificada con un test de integración (mock del
  repository devolviendo `count: 0`) y con al menos un intento real
  forzado contra Neon (dos llamadas a
  `registrarMortalidadYDescontarAves` con la misma cantidad restante,
  disparadas antes de que la primera confirme, o un `UPDATE` manual
  previo que deje `avesVivas` justo debajo de lo pedido).
- `memory/convenciones.md` actualizado en este mismo sprint (S4-9), no
  después.
