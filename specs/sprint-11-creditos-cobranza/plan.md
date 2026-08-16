# Plan técnico — Sprint 11

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `model Credito` (`id`, `ventaId String @unique`,
  `clienteId`, `montoTotal Decimal(10,2)`, `montoPagado Decimal(10,2)
  @default(0)`, `fechaLimite DateTime`, `estado EstadoCredito @default(PENDIENTE)`,
  índices `@@index([estado, fechaLimite])` y `@@index([clienteId])`),
  `model HistorialAbonos` (`id`, `creditoId`, `fecha @default(now())`,
  `monto Decimal(10,2)`, `metodoPago MetodoPago`, `usuarioId`, índice
  `@@index([creditoId])`, `onDelete: Cascade` desde `Credito`) — completos
  desde Sprint 0, sin código encima. `enum EstadoCredito`
  (`PENDIENTE`/`LIQUIDADO`). `model Venta` tiene `montoContado`/
  `montoCredito` (`Decimal(10,2)?`) y `credito Credito?` — sin usar. `model
  Cliente` **no** tiene ningún campo de límite de crédito (confirmado
  releyendo el schema real) y sigue sin tenerlo este sprint (decisión de
  negocio 4).
- `src/lib/zod/venta.ts`/`src/server/repositories/venta.ts`/
  `src/server/actions/venta.ts`: confirmados en el estado exacto que
  Sprint 9 dejó y Sprint 10 no tocó — `cerrarVentaSchema` con `items`
  (`PAQUETE`/`BANDEJA` únicamente), `cerrarVenta()` ancla `Venta`+
  `DetalleVenta` primero (`tx.venta.create` con `id` explícito), guard
  `updateMany` anti-doble-venta después sobre `Paquete`/`BandejaSuelta`.
  `INCLUDE_COMPROBANTE` ya trae `detalles`/`cliente`/`usuario`.
- `src/lib/zod/lote.ts`: `hoyEnLima()` — función local, no exportada, que
  calcula "hoy" en América/Lima (D5) vía
  `toLocaleDateString("en-CA", { timeZone: "America/Lima" })`. Este sprint
  la necesita también en `lib/zod/venta.ts` — se extrae a
  `lib/zod/comun.ts` (junto a `idUuid()`) en vez de duplicarla una tercera
  vez; `lote.ts` pasa a importarla desde ahí.
- `src/server/repositories/mortalidad.ts`
  (`registrarMortalidadYDescontarAves`): referencia directa del orden
  "guard primero (`updateMany` condicional sobre un contador con margen),
  ancla después (`create` con `id` explícito)" — ver "Hallazgo de diseño"
  más abajo, por qué este sprint sigue este orden y no el de `cerrarVenta`.
- `src/components/domain/pos/pos-carrito.tsx`: dueño real de la sumisión
  de `cerrarVentaAction` (`useActionState`, `ventaId` generado una vez por
  intento de checkout). `metodo-pago-select.tsx`, `pos-workspace.tsx`
  (orquestador de estado entre selector/carrito/cliente).
- `src/lib/constants.ts`: `CLIENTE_PUBLICO_GENERAL_ID`.
- `src/server/auth/with-auth.ts` (`withAuth`, `AccionError`) — sin
  cambios. `src/server/auth/rbac.ts` (`RUTAS_POR_ROL`) — sin entrada nueva
  (`/creditos` abierto a ambos roles, decisión 10).
- `src/app/page.tsx`: dashboard real, Server Component `async`, hoy 100%
  `TARJETAS_EJEMPLO` sin datos reales.

## Sin migración de schema este sprint
Confirmado releyendo `prisma/schema.prisma` real: `Credito`/
`HistorialAbonos`/`enum EstadoCredito`/`Venta.montoContado`/`montoCredito`
ya tienen todo lo que este sprint necesita. Único chequeo de schema:
`npx prisma validate` en verde, sin `npx prisma migrate dev`.

## Hallazgo de diseño, CORREGIDO durante la verificación en vivo (S11-19): el guard de sobrepago usa el orden de `cerrarVenta`/`romperPaquete`, no el de `registrarMortalidadYDescontarAves`
**Nota de alcance (léase antes que el resto de esta sección):** el diseño
original de este documento proponía "guard primero, ancla después" (mismo
razonamiento de `registrarMortalidadYDescontarAves`, ver más abajo) — se
implementó así, y el script de verificación en vivo contra Neon real
(S11-19) encontró que esa analogía era incompleta y producía un bug real.
Esta sección describe el diseño FINAL, ya corregido — el detalle de qué
falló y por qué queda documentado en `tasks.md` (mismo criterio que
`specs/sprint-10-romper-paquete-sueltos/plan.md` documentó su propia
corrección de diseño, sin reescribir la historia real).

El proyecto ya tiene los dos órdenes documentados (`memory/estado-proyecto.md`,
"Cómo continuar desde acá", punto 5, y el hallazgo de diseño de
`specs/sprint-09-pos-carrito-cierre/plan.md`):

1. **Guard primero, ancla después** — cuando el guard es sobre un
   **contador con margen** (`avesVivas`), un reintento con el mismo `id`
   podría, en teoría, volver a tener margen y aplicar el guard de nuevo —
   pero como el `create` final con `id` explícito siempre explota con
   `P2002` en un reintento real, Prisma revierte la transacción COMPLETA,
   deshaciendo también el efecto del guard. Seguro.
2. **Ancla primero, guard después** — cuando el guard es sobre un
   **estado binario de una sola dirección** (`DISPONIBLE → VENDIDO`/`ROTO`),
   necesario porque un reintento idempotente legítimo encontraría el
   recurso YA en el estado final y el guard fallaría por error si corriera
   antes del ancla.

**El diseño original de este documento clasificó mal el guard de
sobrepago:** razonó que `Credito.montoPagado` era "un contador con margen,
exactamente como `avesVivas`" y eligió el orden 1. La diferencia real que
esa analogía pasó por alto: `avesVivas` llegando exactamente a 0 es un
caso posible pero no el desenlace normal de cada `RegistroMortalidad`,
mientras que `Credito.montoPagado` llegando exactamente a `montoTotal` es
el desenlace ESPERADO y celebrado de todo crédito (auto-liquidación, H5)
— no un caso límite raro. Con el orden 1, un reintento idempotente (doble
clic) de **justo el abono que liquida el crédito** encontraba el guard
(`WHERE estado: "PENDIENTE", montoPagado: { lte: techo }`) ya sin margen
— `estado` había pasado a `LIQUIDADO` y/o `montoPagado` ya no dejaba
margen para ese mismo monto — y lo rechazaba con `CreditoSobrepagoError`
**antes de llegar nunca al `create` con `id` explícito**: la detección de
idempotencia vía `P2002` nunca se disparaba, y el reintento recibía un
mensaje de error confuso ("el saldo cambió...") en vez de la respuesta
idempotente que exige H4 (quinto Gherkin, spec.md). Confirmado con un
`assert` real fallando contra Neon en S11-19, no solo en teoría.

**Diseño corregido: ANCLA primero (`create` de `HistorialAbonos` con `id`
explícito), GUARD después (`updateMany` condicional sobre
`montoPagado`)** — mismo orden que `cerrarVenta`/`romperPaquete`/
`romperBandeja`. Un reintento real (mismo `id`) explota con `P2002` en el
primer statement, sin tocar `Credito` en absoluto — la Server Action lo
detecta y responde éxito idempotente. Una carrera real (dos abonos con
`id` DISTINTOS peleando por el mismo margen) sigue atómica: si el `create`
persiste sin conflicto pero el guard después no encuentra margen, TODA la
transacción se revierte, incluido el `create` recién hecho — sin ningún
`HistorialAbonos` huérfano (mismo mecanismo de rollback completo que
`memory/convenciones.md` ya documentaba para el orden contrario). La
condición `estado: "PENDIENTE"` del guard queda como defensa explícita,
aunque matemáticamente redundante una vez que `montoPagado` nunca puede
superar `montoTotal` (el guard numérico solo ya lo impide) — con ancla
primero, un reintento idempotente nunca vuelve a evaluar el guard (lo
intercepta el `P2002` del `create`), así que esa condición ya no genera el
falso rechazo que sí producía con el orden 1.

**Lección para sprints futuros:** "guard primero" no generaliza a
cualquier contador con margen — generaliza solo cuando llegar al límite
del contador es un caso límite infrecuente, no el desenlace normal y
esperado de la operación. Evaluar caso por caso, con el mismo criterio que
Sprint 9 ya dejó explícito ("no copiar el precedente más reciente sin
pensar por qué funciona") — y, si el caso es ambiguo, verificarlo con un
reintento real contra Neon antes de dar el orden por bueno, no solo con
tests unitarios/de integración mockeados (que no distinguen ambos órdenes,
ver S11-17/S11-18 — pasaron en verde con el diseño original, roto, porque
mockean el repository entero).

## Diseño de `server/services/credito.ts` (funciones puras, nuevo)
```ts
export type NivelAlertaCredito = "POR_VENCER" | "VENCIDO_RECIENTE" | "VENCIDO_CRITICO";

const DIAS_POR_VENCER = 3;
const DIAS_LIMITE_RECIENTE = 7;
const DIAS_FECHA_LIMITE_SUGERIDA = 15;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Piso a días completos, mismo criterio que calcularEdadEnSemanas
// (server/services/lote.ts) — sin horas/minutos sueltos.
function diasEntre(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / MS_POR_DIA);
}

// null = sin alerta (todavía falta más de DIAS_POR_VENCER para el límite).
// Solo tiene sentido llamarla con un Credito.estado === "PENDIENTE" — un
// LIQUIDADO nunca entra acá (el caller filtra antes, ver H3/H5).
export function calcularNivelAlerta(fechaLimite: Date, hoy: Date): NivelAlertaCredito | null {
  const diasVencido = diasEntre(fechaLimite, hoy); // negativo si aún no vence
  if (diasVencido < 0) {
    return diasVencido >= -DIAS_POR_VENCER ? "POR_VENCER" : null;
  }
  return diasVencido <= DIAS_LIMITE_RECIENTE ? "VENCIDO_RECIENTE" : "VENCIDO_CRITICO";
}

export function calcularSaldoPendiente(montoTotal: number, montoPagado: number): number {
  return Math.round((montoTotal - montoPagado) * 100) / 100;
}

export function calcularFechaLimiteSugerida(hoy: Date): Date {
  return new Date(hoy.getTime() + DIAS_FECHA_LIMITE_SUGERIDA * MS_POR_DIA);
}

// Estrictamente posterior a hoy ("mínimo mañana") — comparación en
// América/Lima, mismo criterio D5 que fechaIngreso de Lote.
export function validarFechaLimite(fechaLimite: Date, hoy: Date): boolean {
  return fechaLimite.getTime() > hoy.getTime();
}

// Agrega SOLO los niveles ya vencidos (VENCIDO_RECIENTE + VENCIDO_CRITICO)
// — "Por vencer" todavía no es deuda vencida, no cuenta para el resumen
// del dashboard. Recibe la misma lista que ya trajo listarCreditosPendientesConCliente
// (repository) — sin una query aparte, dashboard y /creditos comparten
// una sola fuente de datos.
export function resumirAlertasCredito(
  creditos: { montoTotal: number; montoPagado: number; fechaLimite: Date }[],
  hoy: Date,
): { cantidadVencidos: number; montoVencido: number } {
  return creditos.reduce(
    (resumen, credito) => {
      const nivel = calcularNivelAlerta(credito.fechaLimite, hoy);
      if (nivel === "VENCIDO_RECIENTE" || nivel === "VENCIDO_CRITICO") {
        resumen.cantidadVencidos += 1;
        resumen.montoVencido += calcularSaldoPendiente(credito.montoTotal, credito.montoPagado);
      }
      return resumen;
    },
    { cantidadVencidos: 0, montoVencido: 0 },
  );
}
```
Tests (cobertura 100%): `calcularNivelAlerta` en cada frontera exacta (10
días antes → null; exactamente 3 días antes → `POR_VENCER`; 1 día antes →
`POR_VENCER`; el día exacto de `fechaLimite` → `VENCIDO_RECIENTE`,
`diasVencido === 0`; exactamente 7 días vencido → `VENCIDO_RECIENTE`;
8 días vencido → `VENCIDO_CRITICO`); `calcularSaldoPendiente` con saldo
parcial y saldo cero; `calcularFechaLimiteSugerida` (hoy + 15 exacto);
`validarFechaLimite` con fecha futura (válida), hoy exacto (inválida,
límite estricto) y fecha pasada (inválida); `resumirAlertasCredito` con
lista vacía, con solo `POR_VENCER` (no suma), con mezcla de los tres
niveles (suma solo los dos vencidos).

## Diseño de extensión de `server/services/venta.ts` (modifica)
```ts
// Mismo patrón que validarDescuento — el guard real de "no supera el
// total cobrado" vive acá, la Server Action lo invoca después de resolver
// items/bruto/descuento reales del lado del servidor.
export function validarMontoContado(totalCobrado: number, montoContado: number): boolean {
  return montoContado >= 0 && montoContado <= totalCobrado;
}

export function calcularMontoCredito(totalCobrado: number, montoContado: number): number {
  return Math.round((totalCobrado - montoContado) * 100) / 100;
}
```
Tests nuevos en `tests/unit/services/venta.test.ts`: `validarMontoContado`
con 0 (válido, todo a crédito), igual al total (válido, límite exacto —
"todo al contado" dentro de una venta marcada a crédito, caso límite
aceptado sin caso de negocio especial), mayor al total (inválido),
negativo (inválido); `calcularMontoCredito` con monto parcial y con 0.

## Diseño de Zod schemas

### `lib/zod/comun.ts` (modifica — extrae `hoyEnLima()`)
```ts
// Movida desde lib/zod/lote.ts (duplicado exacto) — este sprint la
// necesita también en lib/zod/venta.ts. lote.ts pasa a importarla de acá,
// sin cambiar su comportamiento.
export function hoyEnLima(): Date {
  return new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
}
```

### `lib/zod/venta.ts` (modifica)
```ts
import { hoyEnLima, idUuid } from "@/lib/zod/comun";

// ...itemCarrito, id, clienteId, items, descuento, metodoPago sin cambios...

const esCredito = z.coerce.boolean().default(false);
const montoContado = z.coerce.number().min(0, "No puede ser negativo").optional();
const fechaLimiteCredito = z.coerce.date({ message: "Fecha inválida" }).optional();

export const cerrarVentaSchema = z
  .object({ id, clienteId, items, descuento, metodoPago, esCredito, montoContado, fechaLimiteCredito })
  .refine((data) => !data.esCredito || data.montoContado !== undefined, {
    message: "Indicá el monto al contado (puede ser 0).",
    path: ["montoContado"],
  })
  .refine((data) => !data.esCredito || data.fechaLimiteCredito !== undefined, {
    message: "Indicá la fecha límite del crédito.",
    path: ["fechaLimiteCredito"],
  })
  .refine(
    (data) => !data.esCredito || !data.fechaLimiteCredito || data.fechaLimiteCredito.getTime() > hoyEnLima().getTime(),
    { message: "La fecha límite debe ser posterior a hoy.", path: ["fechaLimiteCredito"] },
  );
```
**A propósito, este schema sigue sin incluir `montoTotal`/`montoCredito`
calculados** — se resuelven server-side a partir de `totalCobrado`
(bruto - descuento, ya resuelto con precio real) y `montoContado`, mismo
criterio que `precioKiloAplicado`/`subtotal` nunca se confían del cliente
(H2, Sprint 9). El guard "no supera el bruto" (`validarMontoContado`)
tampoco vive acá, por el mismo motivo que `validarDescuento`: Zod no
conoce `totalCobrado` (depende de ítems reales resueltos server-side).

Tests nuevos en `tests/unit/lib/zod-venta.test.ts`: `esCredito: false`
(default, sin exigir `montoContado`/`fechaLimiteCredito`); `esCredito:
true` con ambos presentes y válidos; `esCredito: true` sin
`montoContado` (rechazado); `esCredito: true` sin `fechaLimiteCredito`
(rechazado); `esCredito: true` con `fechaLimiteCredito` = hoy exacto
(rechazado, límite estricto); `esCredito: true` con `fechaLimiteCredito`
pasada (rechazada); `montoContado` negativo (rechazado independientemente
de `esCredito`).

### `lib/zod/credito.ts` (nuevo)
```ts
import { z } from "zod";
import { idUuid } from "@/lib/zod/comun";

export const registrarAbonoSchema = z.object({
  id: idUuid(), // HistorialAbonos.id, generado en el cliente una sola vez
  creditoId: idUuid(),
  monto: z.coerce.number().positive("El abono debe ser mayor a 0"),
  metodoPago: z.enum(["EFECTIVO", "YAPE", "PLIN", "TRANSFERENCIA"]),
});
export type RegistrarAbonoInput = z.infer<typeof registrarAbonoSchema>;
```
Sin `.max()` sobre `monto` — el guard real (no superar el saldo pendiente)
depende de `Credito.montoTotal`/`montoPagado`, que Zod no conoce; vive en
`server/repositories/credito.ts` (guard atómico) con un chequeo previo en
la Server Action para el mensaje.

Tests: payload válido; `monto` cero o negativo rechazado; `id`/`creditoId`
con formato inválido rechazados; `metodoPago` fuera de los 4 valores
reales rechazado.

## Diseño de repositories

### `server/repositories/venta.ts` (modifica — `cerrarVenta`)
```ts
export function cerrarVenta(params: {
  id: string;
  clienteId: string;
  usuarioId: string;
  items: ItemVenta[];
  descuento: number;
  totalCobrado: number;
  metodoPago: MetodoPago;
  ahora: Date;
  // Nuevo: presente solo cuando la venta es a crédito. montoContado ya
  // viene resuelto (puede ser 0); montoCredito = totalCobrado - montoContado,
  // ya calculado por la Server Action (calcularMontoCredito).
  credito?: { montoContado: number; montoCredito: number; fechaLimite: Date };
}) {
  // ...paqueteIds/bandejaIds sin cambios...
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
        // Sin crédito: idéntico a Sprint 9 (100% contado). Con crédito:
        // montoContado puede ser 0 (crédito total) o parcial.
        montoContado: params.credito ? params.credito.montoContado : params.totalCobrado,
        montoCredito: params.credito ? params.credito.montoCredito : null,
        detalles: { create: [...] }, // sin cambios
        // Credito anidado dentro del MISMO tx.venta.create — atómico con
        // el ancla, sin un segundo statement ni id de cliente separado:
        // Credito.ventaId @unique ya lo protege (si Venta.create falla por
        // P2002, la transacción entera se revierte, incluido este nested
        // create, que nunca llega a persistir a medias).
        ...(params.credito
          ? {
              credito: {
                create: {
                  clienteId: params.clienteId,
                  montoTotal: params.credito.montoCredito,
                  fechaLimite: params.credito.fechaLimite,
                },
              },
            }
          : {}),
      },
      include: { ...INCLUDE_COMPROBANTE, credito: true },
    });

    // ...guard anti-doble-venta updateMany sobre Paquete/BandejaSuelta,
    // SIN CAMBIOS...

    return venta;
  });
}
```
`INCLUDE_COMPROBANTE` gana `credito: true` para que el comprobante (y la
rama de reintento idempotente de `buscarVentaConDetallesPorId`) puedan
mostrar el desglose contado/crédito sin una query aparte.

### `server/repositories/credito.ts` (nuevo, diseño FINAL ya corregido — ver "Hallazgo de diseño" arriba)
```ts
import { prisma } from "@/lib/prisma";
import type { MetodoPago } from "@prisma/client";

// Lanzado dentro de la transacción cuando el guard atómico rechaza el
// abono — puede ser por saldo insuficiente O porque el Credito ya no está
// PENDIENTE. La Server Action distingue el motivo con un chequeo previo
// best-effort (R3, spec.md) — este repository no lo sabe, solo aplica el
// guard atómico real.
export class CreditoSobrepagoError extends Error {}

// Transacción interactiva nueva del proyecto. Orden: ANCLA primero
// (create de HistorialAbonos con id explícito), GUARD después — mismo
// orden que cerrarVenta/romperPaquete/romperBandeja, no el de
// registrarMortalidadYDescontarAves (ver "Hallazgo de diseño" arriba: el
// diseño original probó guard-primero y encontró un bug real en S11-19).
export function registrarAbono(params: {
  id: string; // HistorialAbonos.id
  creditoId: string;
  monto: number;
  metodoPago: MetodoPago;
  usuarioId: string;
  montoTotalCredito: number; // leído antes de la transacción (buscarCreditoPorId)
  ahora: Date;
}) {
  const techo = Math.round((params.montoTotalCredito - params.monto) * 100) / 100;

  return prisma.$transaction(async (tx) => {
    // ANCLA, primero — id explícito. Un reintento real (mismo id) explota
    // acá con P2002, sin tocar Credito en absoluto.
    const abono = await tx.historialAbonos.create({
      data: {
        id: params.id,
        creditoId: params.creditoId,
        monto: params.monto,
        metodoPago: params.metodoPago,
        usuarioId: params.usuarioId,
        fecha: params.ahora,
      },
    });

    // GUARD, después — updateMany condicional: "actualizá montoPagado
    // solo si el Credito sigue PENDIENTE Y el montoPagado actual todavía
    // deja margen para este abono sin pasarse del total" — comparación
    // contra un techo ya calculado (montoTotalCredito - monto) ANTES de
    // entrar a la transacción (montoTotal es inmutable una vez creado el
    // Credito). Si falla, TODA la transacción se revierte, deshaciendo
    // también el create de arriba — sin HistorialAbonos huérfano.
    const actualizado = await tx.credito.updateMany({
      where: { id: params.creditoId, estado: "PENDIENTE", montoPagado: { lte: techo } },
      data: { montoPagado: { increment: params.monto } },
    });
    if (actualizado.count === 0) {
      throw new CreditoSobrepagoError();
    }

    // Auto-liquidación: releída DENTRO de la misma transacción. Si el
    // abono deja el saldo exactamente en cero, un segundo UPDATE marca
    // LIQUIDADO.
    const creditoActualizado = await tx.credito.findUniqueOrThrow({ where: { id: params.creditoId } });
    if (Number(creditoActualizado.montoPagado) >= params.montoTotalCredito) {
      await tx.credito.update({ where: { id: params.creditoId }, data: { estado: "LIQUIDADO" } });
    }

    return abono;
  });
}

export function buscarCreditoPorId(id: string) {
  return prisma.credito.findUnique({ where: { id } });
}

// Usada por la Server Action en la rama de P2002 (reintento idempotente).
export function buscarHistorialAbonoPorId(id: string) {
  return prisma.historialAbonos.findUnique({ where: { id } });
}

// Fuente única para el resumen del dashboard Y el panel completo de
// /creditos — ambos consumidores llaman esta misma función (mismo
// criterio que listarPaquetesDisponibles reusada entre /pos y
// /consolidacion, Sprint 10) y agregan/muestran distinto en la capa de
// UI/service, sin una segunda query. Usa el índice
// Credito(estado, fechaLimite) ya documentado en modelo-datos.md.
export function listarCreditosPendientesConCliente() {
  return prisma.credito.findMany({
    where: { estado: "PENDIENTE" },
    orderBy: { fechaLimite: "asc" },
    include: { cliente: { select: { nombre: true } } },
  });
}

// Estado de cuenta: TODOS los créditos de un cliente (PENDIENTE y
// LIQUIDADO), con su historial de abonos completo — usa el índice
// Credito(clienteId).
export function buscarCreditosPorClienteConAbonos(clienteId: string) {
  return prisma.credito.findMany({
    where: { clienteId },
    orderBy: { fechaLimite: "desc" },
    include: { abonos: { orderBy: { fecha: "desc" } } },
  });
}
```

## Diseño de Server Actions

### `server/actions/venta.ts` (modifica — `cerrarVentaAction`)
```ts
export const cerrarVentaAction = withAuth(
  { schema: cerrarVentaSchema, entidad: "Venta", accion: "CREAR" },
  async (input, ctx) => {
    // Guard nuevo, antes de cualquier otro cálculo: Público General nunca
    // recibe crédito (H2, spec.md) — rechazo del lado del servidor, no
    // solo un toggle deshabilitado en la UI.
    if (input.esCredito && input.clienteId === CLIENTE_PUBLICO_GENERAL_ID) {
      throw new AccionError("No se puede vender a crédito a Público General.");
    }

    // ...precioVigente, releer pesos, calcularBrutoVenta, validarDescuento,
    // calcularTotalCobrado — SIN CAMBIOS respecto a Sprint 9...

    let credito: { montoContado: number; montoCredito: number; fechaLimite: Date } | undefined;
    if (input.esCredito) {
      if (!validarMontoContado(totalCobrado, input.montoContado!)) {
        throw new AccionError("El monto al contado no puede superar el total de la venta.");
      }
      credito = {
        montoContado: input.montoContado!,
        montoCredito: calcularMontoCredito(totalCobrado, input.montoContado!),
        fechaLimite: input.fechaLimiteCredito!,
      };
    }

    let venta;
    try {
      venta = await cerrarVentaRepo({ /* ...sin cambios..., */ credito });
    } catch (error) {
      // ...ItemsNoDisponiblesError, P2002 — SIN CAMBIOS, salvo que la
      // comparación de idempotencia (mismosItems/coincide) ahora también
      // compara `esCredito`/`credito?.montoContado` contra lo existente,
      // para no confirmar "éxito idempotente" ante un reintento con datos
      // de crédito distintos...
    }

    return {
      data: {
        // ...campos existentes..., más:
        esCredito: venta.credito !== null,
        montoContado: Number(venta.montoContado),
        montoCredito: venta.montoCredito !== null ? Number(venta.montoCredito) : null,
        fechaLimiteCredito: venta.credito?.fechaLimite.toISOString() ?? null,
      },
      entidadId: venta.id,
      estadoDespues: {
        // ...campos existentes..., esCredito: venta.credito !== null,
      },
    };
  },
);
```

### `server/actions/credito.ts` (nuevo)
```ts
"use server";

import { Prisma } from "@prisma/client";

import { registrarAbonoSchema } from "@/lib/zod/credito";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  buscarCreditoPorId,
  buscarHistorialAbonoPorId,
  CreditoSobrepagoError,
  registrarAbono as registrarAbonoRepo,
} from "@/server/repositories/credito";
import { calcularSaldoPendiente } from "@/server/services/credito";

function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Idempotencia por id de cliente (mismo patrón que crearCliente/Venta):
// HistorialAbonos no tiene ningún campo @unique salvo id. Sin `rol` —
// abierta a GERENTE y OPERARIO (decisión 7/10, spec.md).
export const registrarAbonoAction = withAuth(
  { schema: registrarAbonoSchema, entidad: "HistorialAbonos", accion: "REGISTRAR" },
  async (input, ctx) => {
    // Chequeo previo (best-effort, R3 spec.md) — arma un mensaje
    // razonable ANTES de tocar la transacción; el guard atómico real vive
    // en el repository y es la fuente de verdad ante una carrera.
    const credito = await buscarCreditoPorId(input.creditoId);
    if (!credito) {
      throw new AccionError("El crédito no existe.");
    }
    if (credito.estado === "LIQUIDADO") {
      throw new AccionError("Este crédito ya está liquidado.");
    }
    const saldoPendiente = calcularSaldoPendiente(Number(credito.montoTotal), Number(credito.montoPagado));
    if (input.monto > saldoPendiente) {
      throw new AccionError(
        `El abono (S/ ${input.monto.toFixed(2)}) supera el saldo pendiente (S/ ${saldoPendiente.toFixed(2)}).`,
      );
    }

    let abono;
    try {
      abono = await registrarAbonoRepo({
        id: input.id,
        creditoId: input.creditoId,
        monto: input.monto,
        metodoPago: input.metodoPago,
        usuarioId: ctx.usuarioId,
        montoTotalCredito: Number(credito.montoTotal),
        ahora: new Date(),
      });
    } catch (error) {
      if (error instanceof CreditoSobrepagoError) {
        // El chequeo previo pasó, pero el guard atómico rechazó de todos
        // modos — solo puede ser una carrera real (otro abono concurrente
        // consumió el margen justo antes), no un caso ya cubierto arriba.
        throw new AccionError(
          "El saldo cambió justo antes de registrar este abono — revisá el crédito y reintentá.",
        );
      }
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarHistorialAbonoPorId(input.id);
      if (!existente) {
        throw error;
      }
      const coincide =
        existente.creditoId === input.creditoId &&
        Number(existente.monto) === input.monto &&
        existente.metodoPago === input.metodoPago;
      if (!coincide) {
        throw new AccionError("Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.");
      }
      abono = existente;
    }

    return {
      data: { id: abono.id, creditoId: abono.creditoId, monto: Number(abono.monto) },
      entidadId: abono.id,
      estadoDespues: {
        creditoId: abono.creditoId,
        monto: Number(abono.monto),
        metodoPago: abono.metodoPago,
      },
    };
  },
);
```

## Diseño de UI

### `components/domain/pos/pos-carrito.tsx` (modifica)
Gana: toggle "Venta a crédito" (`<Switch>` o checkbox — deshabilitado si
`clienteId === CLIENTE_PUBLICO_GENERAL_ID`, con la nota de H2), input
"Monto al contado" (visible solo si el toggle está activo, default `"0"`,
mismo patrón controlado que `DescuentoInput`), selector de fecha límite
(`<input type="date">`, precargado con `calcularFechaLimiteSugerida(hoy)`
en el `useState` inicial — mismo criterio que el `max` de
`LoteFormDialog`, comodidad de UX del lado del cliente, la validación real
vive en Zod/servicio). El payload de `cerrarVentaAction` gana
`esCredito`/`montoContado`/`fechaLimiteCredito` cuando aplica. Preview
cliente-side de `validarMontoContado`/saldo a crédito, mismo criterio que
el preview de `validarDescuento` ya existente — el servidor siempre
revalida con los valores reales.

### `components/domain/pos/comprobante-dialog.tsx` (modifica, menor)
Cuando `venta.esCredito`, agrega una sección corta: "Pagado: S/ X — A
crédito: S/ Y — Vence: fecha". Sin cambios cuando la venta es 100% al
contado (comportamiento de Sprint 9 intacto).

### `components/domain/creditos/panel-alertas.tsx` (nuevo)
Recibe la lista de `Credito` PENDIENTE con cliente (server, ya con
`Decimal→number` convertido) — agrupa en las tres secciones usando
`calcularNivelAlerta()` en el cliente (función pura, sin Prisma, segura de
importar en un Client o Server Component) y renderiza
`<TarjetaCredito>` por cada uno, agrupadas visualmente (ámbar/rojo/rojo
oscuro), cada sección omitida si está vacía.

### `components/domain/creditos/tarjeta-credito.tsx` (nuevo)
Una tarjeta: cliente, saldo pendiente, fecha límite, días de
antigüedad/margen, botón "Registrar abono" que abre
`<RegistrarAbonoDialog>`.

### `components/domain/creditos/registrar-abono-dialog.tsx` (nuevo)
Mismo `<Dialog>` compacto del proyecto, `<form action={formAction}>` con
`FormData` (sin campos de longitud variable, mismo patrón que
`AjustarInventarioSueltosDialog`/`RomperPaqueteDialog`). Captura `monto` y
`metodoPago`, `id` generado una sola vez por apertura del diálogo
(`useState(() => crypto.randomUUID())`, mismo criterio de idempotencia que
`ClienteFormDialog`). Muestra el saldo pendiente vigente como referencia.
`router.refresh()` al tener éxito (trae de nuevo créditos/saldos
actualizados, incluida la posible auto-liquidación).

### `components/domain/creditos/estado-cuenta-cliente.tsx` (nuevo)
Reusa el mismo patrón de búsqueda con debounce que `ClienteAutocomplete`
(Sprint 9) llamando a `buscarClientesAutocompleteAction` (sin cambios). Al
elegir un cliente, dispara una Server Action de lectura nueva
(`obtenerEstadoCuentaAction`, sin `withAuth` — mismo criterio que
`obtenerMasBitacora`/`buscarClientesAutocompleteAction`: lectura sin una
única entidad mutada) que llama `buscarCreditosPorClienteConAbonos()` y
devuelve la lista ya convertida a `number`. Renderiza cada `Credito` con
su estado (badge `.badge-estado-activo`-like para PENDIENTE/LIQUIDADO,
mismo criterio de `globals.css` de `convenciones.md`) y, expandible, su
`HistorialAbonos` completo (fecha, monto, metodoPago, quién lo registró).
Estado vacío explícito si el cliente no tiene ningún `Credito` (H6, último
Gherkin).

### `app/(app)/creditos/page.tsx` (nuevo)
Server Component: fetch inicial de `listarCreditosPendientesConCliente()`
(`Promise.all` si se agrega algo más), convierte `Decimal→number` (mismo
criterio que `/pos`/`consolidacion`). Sin guard de rol — sin entrada en
`RUTAS_POR_ROL` (decisión 10). Estructura: `<PageHeader title="Créditos">`,
`<PanelAlertas>` arriba, `<EstadoCuentaCliente>` debajo con su propio
buscador.

### `app/page.tsx` (modifica — dashboard)
Agrega el fetch de `listarCreditosPendientesConCliente()` +
`resumirAlertasCredito()` (server/services/credito.ts) para construir una
tarjeta real ("Créditos vencidos: N — S/ monto") que reemplaza o se agrega
junto a las 4 de `TARJETAS_EJEMPLO` — **primera tarjeta real de todo el
archivo**, las otras 4 quedan de ejemplo sin tocar (conectarlas es Sprint
15). `Home` ya es `async`, el cambio es agregar un `await` más al
`Promise.all` existente (hoy solo trae la sesión).

### `components/layout/nav-items.ts` (modifica)
Agrega `{ href: "/creditos", label: "Créditos", icon: CreditCard }` (ícono
nuevo de `lucide-react`, ya en el paquete instalado).

## Manejo del `id` de abono (contrato de idempotencia)
Mismo criterio que `ventaId` en `PosCarrito`/`RegistrarAbonoDialog` de
Sprint 5-10: el `id` se genera **una sola vez por apertura del diálogo**
(`useState(() => crypto.randomUUID())`), no en cada submit — si el
registro falla por un error real de negocio (ej. sobrepago) y el usuario
corrige el monto y reintenta, debe reusar el MISMO `id` para que la
protección de idempotencia siga aplicando. Se genera un `id` nuevo recién
al reabrir el diálogo para un abono distinto.

## Orden de ejecución (hay dependencias entre tareas)
1. `lib/zod/comun.ts` (extraer `hoyEnLima()`) + ajustar `lib/zod/lote.ts`
   para importarla — independiente de todo lo demás, primero porque
   `lib/zod/venta.ts` depende de esto.
2. `server/services/credito.ts` + tests — independiente.
3. `server/services/venta.ts` (`validarMontoContado`, `calcularMontoCredito`)
   + tests — independiente.
4. `lib/zod/venta.ts` (extensión) + tests — depende de 1.
5. `lib/zod/credito.ts` + tests — independiente.
6. `server/repositories/venta.ts` (`cerrarVenta` extendido) — depende de
   nada nuevo (schema ya existe).
7. `server/repositories/credito.ts` — depende de nada nuevo.
8. `server/actions/venta.ts` (`cerrarVentaAction` extendida) — depende de
   3, 4, 6.
9. `server/actions/credito.ts` (`registrarAbonoAction`) — depende de 2, 5, 7.
10. `server/actions/cliente.ts` (`obtenerEstadoCuentaAction`, lectura
    nueva) — depende de 7.
11. UI: extensión de `PosCarrito`/`ComprobanteDialog` — depende de 8.
12. UI: `PanelAlertas`, `TarjetaCredito`, `RegistrarAbonoDialog` — depende
    de 9.
13. UI: `EstadoCuentaCliente` — depende de 10.
14. `app/(app)/creditos/page.tsx` — depende de 12, 13.
15. `app/page.tsx` (tarjeta real) — depende de 2, 7.
16. `components/layout/nav-items.ts` — depende de 14.
17. Tests de integración de `registrarAbonoAction`/extensión de
    `cerrarVentaAction` (repositories mockeados) — depende de 8, 9.
18. `npx vitest run --coverage` — confirmar ≥90% en
    `server/services/credito.ts` y en la porción nueva de
    `server/services/venta.ts`.
19. Verificación en vivo contra Neon real: venta a crédito total, venta a
    crédito parcial, venta 100% contado (sin regresión), bloqueo de
    Público General forzado por payload, abono parcial, auto-liquidación
    exacta, guard de sobrepago rechazado, **carrera real de sobrepago
    forzada** (dos abonos concurrentes que juntos superan el saldo),
    idempotencia real de abono.
20. Verificación clic a clic en navegador: flujo completo de venta a
    crédito desde `/pos` (toggle, monto parcial, fecha sugerida y
    editada), comprobante con el desglose, dashboard con la tarjeta real,
    `/creditos` con el panel de alertas y el estado de cuenta, registrar
    un abono y confirmar la auto-liquidación visual sin recargar
    manualmente.

## Comandos de referencia
```bash
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
      comun.ts               # modifica: + hoyEnLima() (extraída de lote.ts)
      lote.ts                # modifica: importa hoyEnLima() en vez de definirla
      venta.ts                # modifica: + esCredito, montoContado, fechaLimiteCredito
      credito.ts               # nuevo: registrarAbonoSchema
  server/
    services/
      venta.ts                # modifica: + validarMontoContado, calcularMontoCredito
      credito.ts               # nuevo: calcularNivelAlerta, calcularSaldoPendiente,
                                #        calcularFechaLimiteSugerida, validarFechaLimite,
                                #        resumirAlertasCredito
    repositories/
      venta.ts                # modifica: cerrarVenta + Credito anidado
      credito.ts               # nuevo: registrarAbono, buscarCreditoPorId,
                                #        buscarHistorialAbonoPorId,
                                #        listarCreditosPendientesConCliente,
                                #        buscarCreditosPorClienteConAbonos
    actions/
      venta.ts                # modifica: cerrarVentaAction + guards de crédito
      credito.ts               # nuevo: registrarAbonoAction
      cliente.ts               # modifica: + obtenerEstadoCuentaAction (lectura)
  components/domain/
    pos/
      pos-carrito.tsx           # modifica: + toggle crédito, monto contado, fecha límite
      comprobante-dialog.tsx    # modifica: + desglose contado/crédito
    creditos/
      panel-alertas.tsx         # nuevo
      tarjeta-credito.tsx       # nuevo
      registrar-abono-dialog.tsx # nuevo
      estado-cuenta-cliente.tsx  # nuevo
  components/layout/nav-items.ts    # + "Créditos"
  app/
    page.tsx                      # modifica: + tarjeta real de créditos vencidos
    (app)/
      creditos/page.tsx           # nuevo
tests/
  unit/services/credito.test.ts             # nuevo
  unit/services/venta.test.ts                # modifica: + validarMontoContado, calcularMontoCredito
  unit/lib/zod-venta.test.ts                 # modifica: + esCredito, montoContado, fechaLimiteCredito
  unit/lib/zod-credito.test.ts               # nuevo
  unit/lib/zod-lote.test.ts                  # sin cambios de comportamiento (hoyEnLima movida, mismo resultado)
  integration/actions/venta.test.ts          # modifica: + casos de crédito
  integration/actions/credito.test.ts        # nuevo
```

## Definition of Done aplicable a este sprint
- `npm run typecheck && npm run lint && npm test` en verde.
- `npx vitest run --coverage` ≥90% en `server/services/credito.ts` y en
  las funciones nuevas de `server/services/venta.ts`.
- `npx prisma validate` en verde (sin migración nueva este sprint).
- `npm run build` en verde.
- Guard de sobrepago verificado bajo carrera real forzada contra Neon
  (dos abonos concurrentes que juntos superan el saldo) — exactamente un
  éxito, el otro rechazado, sin `montoPagado` inconsistente.
- Auto-liquidación verificada contra Neon: el abono que deja el saldo en
  exactamente cero liquida el `Credito` en la misma transacción.
- Idempotencia real (H4, quinto Gherkin) confirmada contra Neon para
  `registrarAbonoAction`.
- Venta a crédito verificada contra Neon: total, parcial, y el caso de
  Público General bloqueado incluso forzando el payload directo (sin
  pasar por la UI).
- Ninguna venta 100% al contado cambia de comportamiento respecto a
  Sprint 9 (regresión verificada explícitamente, no solo asumida).
- `AuditLog` con filas reales `CREAR` sobre `Venta` (con el detalle de
  crédito en `estadoDespues` cuando aplica) y `REGISTRAR` sobre
  `HistorialAbonos`, verificadas contra Neon.
- Verificación clic a clic en navegador real: venta a crédito completa
  desde `/pos`, dashboard con la tarjeta real de créditos vencidos,
  `/creditos` con el panel de alertas por los tres niveles y el estado de
  cuenta por cliente, registro de un abono con confirmación visual de la
  auto-liquidación sin recargar manualmente.
- `memory/estado-proyecto.md` actualizado al cerrar (registro de cierre de
  Sprint 11, incluidas las diez decisiones de negocio y el hallazgo de
  diseño del orden guard-primero/ancla-después).
