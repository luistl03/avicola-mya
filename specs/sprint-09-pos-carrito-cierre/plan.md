# Plan técnico — Sprint 9

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `model Venta` (`id`, `clienteId`, `usuarioId`,
  `fecha @default(now())`, `totalCobrado Decimal(10,2)`, `descuento
  Decimal(10,2) @default(0)`, `metodoPago MetodoPago`, `montoContado
  Decimal(10,2)?`, `montoCredito Decimal(10,2)?`, relación `credito
  Credito?`), `model DetalleVenta` (`id`, `ventaId`, `tipo
  TipoDetalleVenta`, `paqueteId?`, `bandejaId?`, `galponId?`, `loteId?`,
  `cantidadUnidades?`, `pesoKg Decimal(6,3)`, `precioKiloAplicado
  Decimal(10,2)`, `subtotal Decimal(10,2)`) — ambos sin cambios este sprint,
  **sin migración de schema**. `enum MetodoPago`
  (`EFECTIVO`/`YAPE`/`PLIN`/`TRANSFERENCIA`), `enum TipoDetalleVenta`
  (`PAQUETE`/`BANDEJA`/`SUELTO` — este sprint solo puebla las dos primeras),
  `enum EstadoPaquete` (`DISPONIBLE`/`VENDIDO`/`ROTO`/`ANULADO`), `enum
  EstadoBandeja` (`DISPONIBLE`/`VENDIDO`) — todos completos desde Sprint 0.
- `Paquete.peso`/`BandejaSuelta.peso` (`Decimal(6,3)`) son **inmutables**
  una vez creados — ningún código del proyecto los actualiza después de
  `registrarRecoleccion`/`consolidarSueltos` (confirmado leyendo ambos
  repositories). Esto importa para el diseño de abajo: leer el peso ANTES
  de la transacción de cierre es seguro, porque no puede cambiar entre esa
  lectura y el `updateMany` del guard (solo `estado` cambia).
- `server/repositories/cliente.ts`: `listarClientes`/`contarClientes`
  (paginadas, con `whereFiltros({ busqueda?, tipo? })` — no reusables tal
  cual para el autocomplete del POS, que necesita `estado: ACTIVO` fijo y
  sin paginación).
- `server/repositories/precioKilo.ts`: `obtenerPrecioKiloVigente()` —
  reusada tal cual, sin cambios.
- `server/repositories/mortalidad.ts` (`registrarMortalidadYDescontarAves`)
  y `server/repositories/consolidacion.ts` (`consolidarSueltos`) son las dos
  referencias directas de transacción interactiva para `cerrarVenta` — ver
  "Hallazgo de diseño: el orden del anclaje de idempotencia" más abajo, que
  explica por qué este sprint sigue el orden de `consolidarSueltos`, no el
  de `registrarMortalidadYDescontarAves`.
- `server/repositories/recoleccion.ts` (`revertirRecoleccion`) es la
  referencia directa del guard "todo o nada" por `updateMany` + comparación
  de conteo sobre un CONJUNTO de filas (acá: `Paquete`+`BandejaSuelta` en
  vez de solo `Paquete`).
- `server/auth/with-auth.ts` (`withAuth`, `AccionError`) — sin cambios.
- `server/auth/rbac.ts` (`RUTAS_POR_ROL`) — sin entrada nueva (`/pos`
  abierto a ambos roles, decisión de negocio 2).
- `lib/zod/comun.ts` (`idUuid`) — reusado tal cual para `Venta.id`,
  `Paquete.id`/`BandejaSuelta.id` referenciados desde el carrito.

## Sin migración de schema este sprint
Confirmado releyendo `prisma/schema.prisma` real: `Venta`/`DetalleVenta`/
`Paquete`/`BandejaSuelta`/`Cliente`/`PrecioKilo` ya tienen todo lo que este
sprint necesita. Único chequeo de schema: `npx prisma validate` en verde
antes de escribir código, sin `npx prisma migrate dev`.

## Hallazgo de diseño: el orden del anclaje de idempotencia — `consolidarSueltos`, no `registrarMortalidadYDescontarAves`
El proyecto ya tiene dos órdenes distintos para combinar "ancla de
idempotencia por id de cliente" con "guard `UPDATE` condicional" dentro de
una misma transacción interactiva:

1. **Guard primero, ancla después** (`registrarMortalidadYDescontarAves`,
   `revertirMortalidad`, Sprint 4): el `UPDATE` condicional
   (`avesVivas`/`revertido`) se ejecuta antes del `create` con `id`
   explícito. Funciona porque, en un reintento con el mismo `id`, volver a
   ejecutar el guard **no es necesariamente idempotente por sí solo**
   (`avesVivas` podría, en teoría, volver a tener margen) — pero como el
   `create` final siempre explota con `P2002` en un reintento real, Prisma
   revierte la transacción COMPLETA, deshaciendo también el efecto del
   guard. Verificado en vivo contra Neon en S5-12.
2. **Ancla primero, guard después** (`consolidarSueltos`, Sprint 7): el
   `create` de `RegistroConsolidacion` (con `id` explícito) se ejecuta
   ANTES del guard sobre `InventarioSueltos`. Necesario ahí porque el guard
   necesita el `id` del padre como `referenciaId` en `MovimientoSueltos`.

**Para `cerrarVenta`, el orden correcto es el de `consolidarSueltos` (ancla
primero), por un motivo distinto y más importante que la conveniencia de una
FK:** a diferencia de `avesVivas` (un contador que casi siempre sigue
teniendo margen después de un decremento previo), el guard anti-doble-venta
de este sprint es sobre un campo **binario que cambia una sola vez para
siempre** (`estado: DISPONIBLE → VENDIDO`, sin ningún camino de vuelta en
este sprint). Si el guard se ejecutara ANTES del `create` de `Venta` (orden
1), un reintento idempotente legítimo (mismo `id`, mismo carrito, ya
persistido con éxito la primera vez) encontraría los ítems YA en `VENDIDO` —
el `updateMany` afectaría 0 filas, y la transacción lanzaría
`ItemsNoDisponiblesError` **incorrectamente**, confundiendo un reintento
válido con una carrera real. Con el orden de `consolidarSueltos` (`Venta`
creada primero), un reintento real explota con `P2002` en el primer
`statement` de la transacción, ANTES de que el guard se vuelva a ejecutar —
así que los ítems ya `VENDIDO` de la primera ejecución exitosa nunca se
tocan de nuevo. Este es el hallazgo real de diseño de este sprint: **el
orden de `registrarMortalidadYDescontarAves` no generaliza a un guard sobre
un estado de una sola dirección** — hay que evaluar caso por caso cuál de
los dos precedentes aplica, no copiar el más reciente sin pensar por qué
funciona.

## Diseño de `server/services/venta.ts` (funciones puras)
Mismo criterio que `calcularEmpaque`/`calcularConsolidacion`: la aritmética
de negocio vive en `services/`, 100% testeable sin Prisma, la Server Action
solo orquesta.

```ts
// server/services/venta.ts
export function calcularBrutoVenta(pesosKg: number[], precioKiloVigente: number): number {
  const bruto = pesosKg.reduce((suma, peso) => suma + peso * precioKiloVigente, 0);
  return Math.round(bruto * 100) / 100; // redondeo a centavos, mismo criterio que Decimal(10,2)
}

export function validarDescuento(bruto: number, descuento: number): boolean {
  return descuento >= 0 && descuento <= bruto;
}

export function calcularTotalCobrado(bruto: number, descuento: number): number {
  return Math.round((bruto - descuento) * 100) / 100;
}
```
Tests: `calcularBrutoVenta` con 1 ítem, con varios ítems, con lista vacía
(retorna 0 — caso defensivo, aunque el schema Zod ya exige `items`
no-vacío, más barato cubrirlo que dejarlo sin ejercitar);
`validarDescuento` con descuento 0 (válido), igual al bruto (válido, límite
exacto), mayor al bruto (inválido), negativo (inválido); `calcularTotalCobrado`
con descuento 0 y con descuento parcial. Cobertura 100% (funciones
puras de pocas ramas, mismo umbral ≥90% que el resto de `server/services/`).

## Diseño de Zod schemas

### `lib/zod/venta.ts` (nuevo)
```ts
import { z } from "zod";
import { idUuid } from "@/lib/zod/comun";

const itemCarrito = z.object({
  tipo: z.enum(["PAQUETE", "BANDEJA"]),
  id: idUuid(),
});

export const cerrarVentaSchema = z.object({
  id: idUuid(), // Venta.id, generado en el cliente una sola vez por intento de checkout
  clienteId: idUuid(),
  items: z.array(itemCarrito).min(1, "El carrito no puede estar vacío"),
  descuento: z.coerce.number().min(0, "El descuento no puede ser negativo").default(0),
  metodoPago: z.enum(["EFECTIVO", "YAPE", "PLIN", "TRANSFERENCIA"]),
});
export type CerrarVentaInput = z.infer<typeof cerrarVentaSchema>;
```
**A propósito, este schema NO incluye `peso` ni `precioKiloAplicado` por
ítem** — esos valores nunca se confían del payload del cliente (ver H2,
último Gherkin), se releen del lado del servidor. El guard de "el descuento
no supera el bruto" (`validarDescuento`) tampoco vive acá — Zod no conoce el
bruto (depende de los ítems reales, resueltos server-side), así que ese
guard vive en la Server Action, después de resolver los ítems.

Tests: payload válido completo; `items` vacío rechazado; un `tipo` fuera de
`PAQUETE`/`BANDEJA` rechazado (confirma que `SUELTO` no se puede enviar este
sprint, sin necesidad de un caso de negocio — el propio enum de Zod lo
bloquea); `descuento` negativo rechazado; `descuento` faltante usa el
default `0`; `metodoPago` fuera de los 4 valores reales rechazado; `id`/
`clienteId`/`items[].id` con formato inválido rechazados.

### `lib/zod/cliente.ts` (modifica)
```ts
export const buscarClientesAutocompleteSchema = z.object({
  busqueda: z.string().trim().min(1).max(120),
});
```
Nuevo, junto a los schemas ya existentes de Sprint 8.

## Diseño de repositories

### `server/repositories/venta.ts` (nuevo)
```ts
import { prisma } from "@/lib/prisma";

// Lanzado dentro de la transacción para forzar el rollback cuando al menos
// un ítem del carrito ya no está DISPONIBLE — no es un AccionError (ADR-000,
// este archivo no conoce server/auth/with-auth.ts), la Server Action lo
// traduce y arma el mensaje con el/los ítems específicos (ver R5, spec.md).
export class ItemsNoDisponiblesError extends Error {}

type ItemVenta = {
  tipo: "PAQUETE" | "BANDEJA";
  id: string;
  pesoKg: number;
  precioKiloAplicado: number;
  subtotal: number;
};

// Séptima transacción interactiva del proyecto. Orden: ANCLA primero (Venta
// + N DetalleVenta con id explícito, mismo motivo que consolidarSueltos —
// ver "Hallazgo de diseño" en plan.md, no el orden de
// registrarMortalidadYDescontarAves), guard todo-o-nada después (updateMany
// por lote de ids, no ítem por ítem — mismo patrón que el guard de Paquete
// en revertirRecoleccion, extendido acá a dos tablas: Paquete Y
// BandejaSuelta en la misma operación).
//
// pesoKg/precioKiloAplicado/subtotal por ítem ya vienen resueltos por la
// Server Action (peso releído de la fila real, precio de
// obtenerPrecioKiloVigente() del servidor) — este repository no valida
// negocio, solo persiste y aplica el guard atómico (ADR-000: capa más baja,
// no decide).
export function cerrarVenta(params: {
  id: string;
  clienteId: string;
  usuarioId: string;
  items: ItemVenta[];
  descuento: number;
  totalCobrado: number;
  metodoPago: "EFECTIVO" | "YAPE" | "PLIN" | "TRANSFERENCIA";
  ahora: Date;
}) {
  const paqueteIds = params.items.filter((i) => i.tipo === "PAQUETE").map((i) => i.id);
  const bandejaIds = params.items.filter((i) => i.tipo === "BANDEJA").map((i) => i.id);

  return prisma.$transaction(async (tx) => {
    const venta = await tx.venta.create({
      data: {
        id: params.id,
        clienteId: params.clienteId,
        usuarioId: params.usuarioId,
        fecha: params.ahora,
        totalCobrado: params.totalCobrado,
        descuento: params.descuento,
        metodoPago: params.metodoPago,
        montoContado: params.totalCobrado, // 100% contado este sprint (spec.md)
        montoCredito: null,
        detalles: {
          create: params.items.map((item) => ({
            tipo: item.tipo,
            paqueteId: item.tipo === "PAQUETE" ? item.id : null,
            bandejaId: item.tipo === "BANDEJA" ? item.id : null,
            pesoKg: item.pesoKg,
            precioKiloAplicado: item.precioKiloAplicado,
            subtotal: item.subtotal,
          })),
        },
      },
      include: { detalles: true },
    });

    let vendidos = 0;
    if (paqueteIds.length > 0) {
      const r = await tx.paquete.updateMany({
        where: { id: { in: paqueteIds }, estado: "DISPONIBLE" },
        data: { estado: "VENDIDO" },
      });
      vendidos += r.count;
    }
    if (bandejaIds.length > 0) {
      const r = await tx.bandejaSuelta.updateMany({
        where: { id: { in: bandejaIds }, estado: "DISPONIBLE" },
        data: { estado: "VENDIDO" },
      });
      vendidos += r.count;
    }
    if (vendidos !== paqueteIds.length + bandejaIds.length) {
      throw new ItemsNoDisponiblesError();
    }

    return venta;
  });
}

// Usada por la Server Action en la rama de P2002 (reintento idempotente),
// mismo criterio que buscarRecoleccionConPaquetesPorId.
export function buscarVentaConDetallesPorId(id: string) {
  return prisma.venta.findUnique({ where: { id }, include: { detalles: true } });
}

// Para el selector de items del POS — mismo criterio que
// Paquete(estado)/BandejaSuelta(estado) ya indexados desde Sprint 0
// ("el POS filtra constantemente por DISPONIBLE, es la query más frecuente
// del sistema", memory/modelo-datos.md). Sin paginación: el POS es una
// pantalla operativa de una sola vista, no una tabla de gestión — el
// volumen esperado de ítems DISPONIBLE simultáneos en esta granja es bajo
// (se venden rápido, no se acumulan).
export function listarPaquetesDisponibles() {
  return prisma.paquete.findMany({
    where: { estado: "DISPONIBLE" },
    orderBy: { creadoEn: "asc" }, // FIFO — vender lo más viejo primero
  });
}

export function listarBandejasDisponibles() {
  return prisma.bandejaSuelta.findMany({
    where: { estado: "DISPONIBLE" },
    orderBy: { creadoEn: "asc" },
  });
}

// Usadas por la Server Action para releer el peso REAL de cada ítem del
// carrito antes de armar la transacción (peso es inmutable una vez creado,
// seguro leerlo unos milisegundos antes del updateMany atómico del guard) y
// para el diagnóstico best-effort de ItemsNoDisponiblesError — ADR-000: la
// action nunca importa Prisma directo, ni siquiera para una lectura
// puntual, mismo criterio confirmado revisando que ningún otro
// server/actions/*.ts del proyecto lo hace.
export function buscarPaquetesPorIds(ids: string[]) {
  return prisma.paquete.findMany({ where: { id: { in: ids } } });
}
export function buscarBandejasPorIds(ids: string[]) {
  return prisma.bandejaSuelta.findMany({ where: { id: { in: ids } } });
}
export function buscarPaquetesNoDisponiblesEntreIds(ids: string[]) {
  return prisma.paquete.findMany({
    where: { id: { in: ids }, estado: { not: "DISPONIBLE" } },
    select: { id: true },
  });
}
export function buscarBandejasNoDisponiblesEntreIds(ids: string[]) {
  return prisma.bandejaSuelta.findMany({
    where: { id: { in: ids }, estado: { not: "DISPONIBLE" } },
    select: { id: true },
  });
}
```

**Por qué `updateMany` por lote de ids (no ítem por ítem en un `for`, a
diferencia de `consolidarSueltos`):** acá no hace falta agregar por clave
(cada `id` de `Paquete`/`BandejaSuelta` es único por naturaleza, no hay
riesgo de que un mismo ítem aparezca dos veces sumando cantidades distintas
como sí pasaba con `galponId:loteId` en Consolidación) — un solo `updateMany`
con `id: { in: [...] }` por tabla es más simple y hace menos round-trips
contra el pooler de Neon.

### `server/repositories/cliente.ts` (modifica)
```ts
// Autocomplete liviano para el selector de cliente del POS (Sprint 8 lo
// dejó pospuesto explícitamente — "Sprint 9 puede agregar un endpoint de
// autocomplete si hace falta", ahora existe el consumidor real). A
// diferencia de listarClientes/contarClientes (tabla de gestión paginada),
// este NO pagina — un límite fijo alcanza para tipeo en vivo, y siempre
// filtra por ACTIVO (no tiene sentido venderle a un cliente SUSPENDIDO).
const LIMITE_AUTOCOMPLETE_CLIENTES = 10;

export function buscarClientesAutocomplete(busqueda: string) {
  return prisma.cliente.findMany({
    where: {
      estado: "ACTIVO",
      OR: [
        { nombre: { contains: busqueda, mode: "insensitive" } },
        { celular: { contains: busqueda, mode: "insensitive" } },
      ],
    },
    orderBy: { nombre: "asc" },
    take: LIMITE_AUTOCOMPLETE_CLIENTES,
  });
}
```

## Diseño de Server Actions

### `server/actions/venta.ts` (nuevo)
**Corregido respecto al primer borrador de este documento (ver S9-6 en
`tasks.md`):** el borrador original hacía que esta Server Action importara
`prisma` directo para releer `Paquete`/`BandejaSuelta` y para el
diagnóstico de `ItemsNoDisponiblesError` — eso viola ADR-000 en la práctica
real del proyecto: ninguna otra `server/actions/*.ts` importa
`@/lib/prisma` (confirmado con una búsqueda antes de implementar). Se
agregaron 4 funciones al repository en su lugar
(`buscarPaquetesPorIds`/`buscarBandejasPorIds`/
`buscarPaquetesNoDisponiblesEntreIds`/`buscarBandejasNoDisponiblesEntreIds`,
ya reflejadas arriba en "Diseño de repositories") — el pseudocódigo de
abajo ya está actualizado con la versión real implementada.

```ts
"use server";

import { Prisma } from "@prisma/client";

import { cerrarVentaSchema } from "@/lib/zod/venta";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { obtenerPrecioKiloVigente } from "@/server/repositories/precioKilo";
import {
  buscarBandejasNoDisponiblesEntreIds,
  buscarBandejasPorIds,
  buscarPaquetesNoDisponiblesEntreIds,
  buscarPaquetesPorIds,
  buscarVentaConDetallesPorId,
  cerrarVenta as cerrarVentaRepo,
  ItemsNoDisponiblesError,
} from "@/server/repositories/venta";
import { calcularBrutoVenta, calcularTotalCobrado, validarDescuento } from "@/server/services/venta";

function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Idempotencia por id de cliente (mismo patrón que crearCliente/crearGalpon):
// Venta no tiene ningún campo @unique.
export const cerrarVentaAction = withAuth(
  { schema: cerrarVentaSchema, entidad: "Venta", accion: "CREAR" },
  async (input, ctx) => {
    const precioVigente = await obtenerPrecioKiloVigente();
    if (!precioVigente) {
      throw new AccionError("No hay ningún precio por kilo configurado.");
    }
    const precio = Number(precioVigente.precio);

    // Releer el peso REAL de cada ítem — nunca se confía en nada que no sea
    // el id del payload (H2, último Gherkin).
    const paqueteIds = input.items.filter((i) => i.tipo === "PAQUETE").map((i) => i.id);
    const bandejaIds = input.items.filter((i) => i.tipo === "BANDEJA").map((i) => i.id);
    const [paquetes, bandejas] = await Promise.all([
      paqueteIds.length > 0 ? buscarPaquetesPorIds(paqueteIds) : Promise.resolve([]),
      bandejaIds.length > 0 ? buscarBandejasPorIds(bandejaIds) : Promise.resolve([]),
    ]);
    if (paquetes.length !== paqueteIds.length || bandejas.length !== bandejaIds.length) {
      throw new AccionError("Uno o más ítems del carrito ya no existen — actualiza el selector.");
    }

    const pesoPorId = new Map<string, number>([
      ...paquetes.map((p): [string, number] => [p.id, Number(p.peso)]),
      ...bandejas.map((b): [string, number] => [b.id, Number(b.peso)]),
    ]);
    const bruto = calcularBrutoVenta(
      input.items.map((item) => pesoPorId.get(item.id)!),
      precio,
    );

    if (!validarDescuento(bruto, input.descuento)) {
      throw new AccionError("El descuento no puede superar el total de la venta.");
    }
    const totalCobrado = calcularTotalCobrado(bruto, input.descuento);

    const items = input.items.map((item) => {
      const pesoKg = pesoPorId.get(item.id)!;
      const subtotal = Math.round(pesoKg * precio * 100) / 100;
      return { tipo: item.tipo, id: item.id, pesoKg, precioKiloAplicado: precio, subtotal };
    });

    let venta;
    try {
      venta = await cerrarVentaRepo({
        id: input.id,
        clienteId: input.clienteId,
        usuarioId: ctx.usuarioId,
        items,
        descuento: input.descuento,
        totalCobrado,
        metodoPago: input.metodoPago,
        ahora: new Date(),
      });
    } catch (error) {
      if (error instanceof ItemsNoDisponiblesError) {
        // Diagnóstico best-effort FUERA de la transacción ya revertida
        // (R5, spec.md) — solo para armar un mensaje específico, no
        // autoritativo.
        const [pNoDisp, bNoDisp] = await Promise.all([
          paqueteIds.length > 0 ? buscarPaquetesNoDisponiblesEntreIds(paqueteIds) : Promise.resolve([]),
          bandejaIds.length > 0 ? buscarBandejasNoDisponiblesEntreIds(bandejaIds) : Promise.resolve([]),
        ]);
        const ids = [...pNoDisp, ...bNoDisp].map((x) => x.id).join(", ");
        throw new AccionError(`Estos ítems ya no están disponibles: ${ids}. Actualiza el carrito.`);
      }
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarVentaConDetallesPorId(input.id);
      if (!existente) {
        throw error;
      }
      // "" es un sentinel defensivo, nunca real este sprint (SUELTO, el
      // único caso con paqueteId Y bandejaId en null, no se puebla hasta
      // Sprint 10).
      const idsExistentes = new Set(existente.detalles.map((d) => d.paqueteId ?? d.bandejaId ?? ""));
      const idsInput = new Set(input.items.map((i) => i.id));
      const mismosItems =
        idsExistentes.size === idsInput.size && [...idsExistentes].every((id) => idsInput.has(id));
      const coincide =
        existente.clienteId === input.clienteId &&
        existente.metodoPago === input.metodoPago &&
        Number(existente.descuento) === input.descuento &&
        mismosItems;
      if (!coincide) {
        throw new AccionError("Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.");
      }
      venta = existente;
    }

    return {
      data: { id: venta.id, totalCobrado: Number(venta.totalCobrado) },
      entidadId: venta.id,
      estadoDespues: {
        clienteId: venta.clienteId,
        totalCobrado: Number(venta.totalCobrado),
        metodoPago: venta.metodoPago,
        cantidadItems: venta.detalles.length,
      },
    };
  },
);
```

Ninguna lleva `rol` — abierta a GERENTE y OPERARIO (decisión de negocio 2).

### `server/actions/cliente.ts` (modifica — nueva Server Action de lectura)
```ts
// Lectura disparada desde un Client Component (tipeo en vivo del
// autocomplete) — NO pasa por withAuth, mismo criterio que
// obtenerMasBitacora (memory/convenciones.md, "Server Actions"): no hay una
// única entidad mutada que auditar, forzarlo ensuciaría AuditLog con una
// fila por cada tecla escrita. Sí verifica sesión a mano con auth().
export async function buscarClientesAutocompleteAction(busqueda: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "No autenticado." };

  const parsed = buscarClientesAutocompleteSchema.safeParse({ busqueda });
  if (!parsed.success) return { ok: true as const, data: [] };

  const clientes = await buscarClientesAutocomplete(parsed.data.busqueda);
  return { ok: true as const, data: clientes };
}
```

## Decisión de diseño: generación de PDF con `jsPDF`
`memory/stack-tecnologico.md` no incluye ninguna librería de PDF —
confirmado antes de diseñar. El Product Owner pidió explícitamente un
comprobante descargable en PDF y compartible (spec.md, decisión de negocio
7), más allá del link `wa.me` de solo texto que este documento había
propuesto como opción más simple. Evaluadas dos familias de solución:

1. **Generación en servidor** (Puppeteer/Playwright renderizando HTML a
   PDF, o un servicio externo tipo PDF-as-a-service) — descartado: agrega
   una función serverless pesada (Puppeteer no corre bien en el runtime
   gratuito de Vercel sin configuración especial de binarios), o una
   dependencia de un servicio de pago — rompe el presupuesto $0 de
   `stack-tecnologico.md` sin necesidad real (el comprobante es un
   documento de texto simple, no un layout complejo).
2. **Generación en cliente** (`jsPDF`, o alternativas como
   `@react-pdf/renderer`) — elegido: corre enteramente en el navegador, sin
   backend nuevo, sin costo, y el comprobante de este sprint es
   suficientemente simple (encabezado + tabla de ítems + totales) para no
   necesitar un motor de layout más pesado. `jsPDF` es la opción más chica
   y madura de esta familia (MIT, sin dependencias pesadas) — se agrega
   como dependencia nueva de `package.json` y se documenta en
   `memory/stack-tecnologico.md` (nueva sección o ampliación de "Offline /
   PWA", ya que corre 100% client-side igual que el resto de esa capa).

`lib/pdf/comprobante.ts` (nuevo, **cliente-only** — nunca se importa desde
un Server Component ni desde `server/`, evita cualquier duda del límite
RSC): función pura `generarComprobantePdf(venta: DatosComprobante): jsPDF`
que arma el documento (texto plano: encabezado "Avícola M&A — Comprobante
interno, no es boleta/factura electrónica", cliente, fecha, tabla de ítems,
descuento, total, método de pago, vendedor). El componente `ComprobanteDialog`
la invoca en el `onClick` de "Descargar PDF" (`doc.save("comprobante-{id}.pdf")`)
y en "Compartir" (`doc.output("blob")` → `File` → `navigator.share({ files:
[file] })` si `navigator.canShare?.({ files: [file] })` es `true`; si no,
cae al mismo botón de descarga con un toast informativo "Tu navegador no
soporta compartir archivos directamente — se descargó el PDF, adjúntalo a
mano").

## Diseño de UI

### `app/(app)/pos/page.tsx` (nuevo)
Server Component: fetch inicial de `listarPaquetesDisponibles()` +
`listarBandejasDisponibles()` + `obtenerPrecioKiloVigente()` (`Promise.all`).
Si `precioVigente` es `null`, la página entera muestra el aviso de H1 (último
Gherkin) en vez de montar el selector. Sin guard de rol — sin entrada en
`RUTAS_POR_ROL` (decisión de negocio 2).

### `components/domain/pos/pos-selector-items.tsx` (nuevo, Client Component)
Recibe la lista inicial de disponibles (server) + el carrito actual (estado
del padre) — filtra en memoria los que ya están en el carrito (no hace falta
volver a pedir al servidor cada vez que se agrega/quita un ítem, el estado
ya lo tiene todo localmente desde el fetch inicial). Dos secciones
(Paquetes/Bandejas), cada fila con peso + botón "Agregar".

### `components/domain/pos/pos-carrito.tsx` (nuevo, Client Component)
Lista de ítems agregados con su subtotal (peso × precio vigente, mismo
`precioKiloVigente` recibido como prop desde la página — el subtotal que ve
el operario ANTES de cerrar es un preview con el mismo valor que el servidor
va a usar de verdad al cerrar, dado que ambos leen `obtenerPrecioKiloVigente()`
en la misma ventana de tiempo corta de una sesión de venta; el valor real
que se persiste siempre es el que resuelve el servidor en el momento del
cierre, no este preview), botón "Quitar" por fila, total bruto, campo de
descuento (`DescuentoInput`), selector de método de pago
(`MetodoPagoSelect`), botón "Cerrar venta" (deshabilitado si el carrito está
vacío).

### `components/domain/pos/cliente-autocomplete.tsx` (nuevo, Client Component)
`Público General` preseleccionado por defecto (decisión de negocio 4) —
`<Input>` de búsqueda con debounce de 300ms (mismo patrón que
`ClienteFiltros`, Sprint 8) que llama a `buscarClientesAutocompleteAction`
directo (no `useActionState`, es una lectura simple) y muestra una lista de
sugerencias debajo; al elegir una, reemplaza al cliente seleccionado.

### `components/domain/pos/descuento-input.tsx` + `metodo-pago-select.tsx` (nuevos)
Campos simples controlados por el padre (`PosCarrito`) — sin lógica propia
más allá de un `<Input type="number">` y un `<Select>` de los 4 valores de
`MetodoPago` (mismo fix de `<SelectValue>` con `children` resuelto a mano
que ya se aplicó en Sprint 3/8).

### `components/domain/pos/comprobante-dialog.tsx` (nuevo, Client Component)
Se abre automáticamente al recibir una respuesta exitosa de
`cerrarVentaAction` (no es un `<Dialog>` disparado por un botón — aparece
solo, como confirmación del cierre). Muestra todos los datos de la venta
(recibidos directo de la respuesta de la action, sin una query aparte —
`estadoDespues` ya trae lo necesario, y el propio `input` del carrito en
memoria del cliente tiene el detalle de ítems para mostrar). Botones
"Descargar PDF" y "Compartir" (ver diseño de `lib/pdf/comprobante.ts`
arriba). Al cerrar el diálogo, la página se resetea (nuevo `id` de venta
generado, carrito vacío, selector de items refrescado — `router.refresh()`
para traer la lista actualizada de `DISPONIBLE` desde el servidor, ya que
los ítems vendidos deben desaparecer del selector).

### `components/layout/nav-items.ts` (modifica)
Agrega `{ href: "/pos", label: "Punto de Venta", icon: ShoppingCart }`
(ícono nuevo de `lucide-react`, ya en el paquete instalado).

## Manejo del `id` de venta (contrato de idempotencia, sin ser offline-ready completo)
Mismo criterio que `ClienteFormDialog`/`RegistrarRecoleccionDialog`: el `id`
se genera **una sola vez por intento de checkout**
(`useState(() => crypto.randomUUID())` en el componente que arma el
`<form>`/dispara la action), no en cada clic — si el cierre falla por un
error real de negocio (ej. descuento inválido) y el operario corrige y
reintenta, debe reusar el MISMO `id` (no generar uno nuevo), para que un
reintento tras un error de validación siga cayendo bajo la misma protección
de idempotencia. Solo se genera un `id` nuevo después de un cierre EXITOSO
(nueva venta) o si el operario cancela explícitamente el carrito.

## Orden de ejecución (hay dependencias entre tareas)
1. `server/services/venta.ts` + tests — independiente de todo lo demás.
2. `lib/zod/venta.ts` + tests — independiente.
3. `lib/zod/cliente.ts` (`buscarClientesAutocompleteSchema`) + tests —
   independiente.
4. `server/repositories/venta.ts` — depende de nada nuevo (schema ya
   existe).
5. `server/repositories/cliente.ts` (`buscarClientesAutocomplete`) —
   depende de nada nuevo.
6. `server/actions/venta.ts` (`cerrarVentaAction`) — depende de 1, 2, 4.
7. `server/actions/cliente.ts` (`buscarClientesAutocompleteAction`) —
   depende de 3, 5.
8. `npm install jspdf` + `lib/pdf/comprobante.ts` — independiente de las
   Server Actions (solo necesita la forma de los datos de una venta).
9. `memory/stack-tecnologico.md` actualizado con la dependencia nueva.
10. UI: `PosSelectorItems`, `PosCarrito`, `ClienteAutocomplete`,
    `DescuentoInput`, `MetodoPagoSelect` — depende de 6, 7.
11. UI: `ComprobanteDialog` — depende de 8, 10.
12. `app/(app)/pos/page.tsx` — depende de 10, 11.
13. `components/layout/nav-items.ts` — depende de 12 (la ruta ya tiene que
    existir).
14. Tests de integración de `cerrarVentaAction`/
    `buscarClientesAutocompleteAction` (repositories mockeados) — depende
    de 6, 7.
15. `npx vitest run --coverage` — confirmar ≥90% en
    `server/services/venta.ts`.
16. Verificación en vivo contra Neon real: cierre completo (ítems pasan a
    VENDIDO, Venta+DetalleVenta reales, precioKiloAplicado congelado),
    carrera concurrente forzada (dos cierres simultáneos con el mismo
    ítem — script con dos promesas disparadas a la vez, mismo criterio que
    Sprint 6/7), idempotencia real (H7), descuento inválido rechazado,
    precio no configurado rechazado.
17. Verificación clic a clic en navegador: flujo completo del POS,
    incluyendo descarga real del PDF (abrir el archivo generado y confirmar
    que los datos coinciden) y, si el entorno de prueba lo permite,
    compartir por Web Share API en un dispositivo real (celular del
    Product Owner, mismo camino que Sprints 1-2 usaron para verificación
    móvil real — no `resize_window` de Claude in Chrome).

## Comandos de referencia
```bash
npm install jspdf
npm run typecheck && npm run lint && npm test
npx vitest run --coverage
npx prisma validate
npm run build
```
Sin `npx prisma migrate dev` este sprint.

## Estructura de archivos esperada
```
src/
  lib/
    zod/
      venta.ts               # nuevo: cerrarVentaSchema
      cliente.ts             # modifica: + buscarClientesAutocompleteSchema
    pdf/
      comprobante.ts         # nuevo, cliente-only: generarComprobantePdf
  server/
    services/
      venta.ts               # nuevo: calcularBrutoVenta, validarDescuento, calcularTotalCobrado
    repositories/
      venta.ts               # nuevo: cerrarVenta, buscarVentaConDetallesPorId, listarPaquetesDisponibles, listarBandejasDisponibles
      cliente.ts             # modifica: + buscarClientesAutocomplete
    actions/
      venta.ts               # nuevo: cerrarVentaAction
      cliente.ts             # modifica: + buscarClientesAutocompleteAction
  components/domain/
    pos/
      pos-workspace.tsx          # nuevo, no listado originalmente — ver S9-10 en tasks.md
      pos-selector-items.tsx     # nuevo
      pos-carrito.tsx            # nuevo
      cliente-autocomplete.tsx   # nuevo
      descuento-input.tsx        # nuevo
      metodo-pago-select.tsx     # nuevo
      comprobante-dialog.tsx     # nuevo
    clientes/
      cliente-form-dialog.tsx    # modifica (Sprint 8): + onCreado? opcional, reusado desde ClienteAutocomplete
  components/layout/nav-items.ts    # + "Punto de Venta"
  app/(app)/
    pos/page.tsx                    # nuevo
tests/
  unit/services/venta.test.ts               # nuevo
  unit/lib/zod-venta.test.ts                # nuevo
  unit/lib/zod-cliente.test.ts              # modifica: + buscarClientesAutocompleteSchema
  integration/actions/venta.test.ts          # nuevo
  integration/actions/cliente.test.ts        # modifica: + buscarClientesAutocompleteAction
memory/
  stack-tecnologico.md                       # modifica: + jsPDF
```

## Definition of Done aplicable a este sprint
- `npm run typecheck && npm run lint && npm test` en verde.
- `npx vitest run --coverage` ≥90% en `server/services/venta.ts`.
- `npx prisma validate` en verde (sin migración nueva este sprint).
- `npm run build` en verde.
- Guard anti-doble-venta verificado bajo carrera real forzada contra Neon
  (dos cierres concurrentes con el mismo ítem, no solo secuencial) —
  exactamente un éxito, el otro rechazado, sin Venta a medias.
- Idempotencia real (H7) confirmada contra Neon para `cerrarVentaAction` —
  reintento exitoso sin duplicar, reintento con carrito distinto rechazado.
- `precioKiloAplicado` verificado como snapshot real: cambiar el precio
  vigente después de una venta cerrada no afecta sus `DetalleVenta` ya
  persistidos.
- `AuditLog` con una fila real `CREAR` sobre `Venta`, verificada contra Neon.
- PDF verificado en vivo: se descarga, abre, y sus datos coinciden con la
  pantalla de comprobante — en al menos un dispositivo móvil real (no solo
  escritorio).
- "Compartir" verificado en al menos un dispositivo real — con su camino de
  fallback (descarga simple) confirmado si el navegador de prueba no
  soporta archivos en la Web Share API.
- Verificación clic a clic en navegador real: selector de items, carrito,
  autocomplete de cliente (incluye "Público General" por defecto),
  descuento con guard, cierre de venta, comprobante.
- `memory/estado-proyecto.md` actualizado al cerrar (registro de cierre de
  Sprint 9, incluida la decisión de sprint único sin dividir, el hallazgo
  del orden de idempotencia, y la dependencia nueva `jsPDF`).
- `memory/stack-tecnologico.md` actualizado con `jsPDF` (ver R2, spec.md).
