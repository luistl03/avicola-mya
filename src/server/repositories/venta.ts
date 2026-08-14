import type { MetodoPago } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Lanzado dentro de la transacción para forzar el rollback cuando al menos
// un ítem del carrito ya no está DISPONIBLE — no es un AccionError (ADR-000,
// este archivo no conoce server/auth/with-auth.ts), la Server Action lo
// atrapa y arma el mensaje con el/los ítems específicos (R5, spec.md).
export class ItemsNoDisponiblesError extends Error {}

type ItemVenta = {
  tipo: "PAQUETE" | "BANDEJA";
  id: string;
  pesoKg: number;
  precioKiloAplicado: number;
  subtotal: number;
};

// Séptima transacción interactiva del proyecto. Orden: ANCLA primero (Venta
// + N DetalleVenta con id explícito), guard todo-o-nada después
// (updateMany por lote de ids sobre Paquete Y BandejaSuelta) — mismo orden
// que consolidarSueltos (Sprint 7), NO el de
// registrarMortalidadYDescontarAves (Sprint 4). El motivo real, no solo de
// conveniencia: el guard de acá es sobre un estado binario de una sola
// dirección (DISPONIBLE → VENDIDO, sin reversión en este sprint) — si el
// guard corriera ANTES del create, un reintento idempotente legítimo (mismo
// id, mismo carrito, ya persistido con éxito antes) encontraría los ítems
// YA en VENDIDO y lanzaría ItemsNoDisponiblesError por error, confundiendo
// un reintento válido con una carrera real. Con la Venta creada primero, un
// reintento real explota con P2002 en el primer statement, antes de volver
// a tocar Paquete/BandejaSuelta. Ver "Hallazgo de diseño" en
// specs/sprint-09-pos-carrito-cierre/plan.md para el detalle completo.
//
// pesoKg/precioKiloAplicado/subtotal por ítem ya vienen resueltos por la
// Server Action (peso releído de la fila real, precio de
// obtenerPrecioKiloVigente() del servidor) — este repository no valida
// negocio, solo persiste y aplica el guard atómico (ADR-000: capa más baja,
// no decide).
//
// include: { cliente, usuario } — agregado al construir el comprobante
// (H6, spec.md): el nombre del cliente y del vendedor son datos reales que
// tienen que salir del propio registro persistido, no de un estado del
// carrito en el cliente (que podría ir desactualizado si, por ejemplo, el
// operario cambió de cliente seleccionado a mitad de armar el carrito y
// algo quedó desincronizado) — mismo criterio de "nunca confiar en el
// cliente para lo que ya se puede leer de la fila real" que ya aplica a
// pesoKg/precioKiloAplicado.
const INCLUDE_COMPROBANTE = {
  detalles: true,
  cliente: { select: { nombre: true } },
  usuario: { select: { nombre: true } },
} as const;

export function cerrarVenta(params: {
  id: string;
  clienteId: string;
  usuarioId: string;
  items: ItemVenta[];
  descuento: number;
  totalCobrado: number;
  metodoPago: MetodoPago;
  ahora: Date;
}) {
  const paqueteIds = params.items.filter((item) => item.tipo === "PAQUETE").map((item) => item.id);
  const bandejaIds = params.items.filter((item) => item.tipo === "BANDEJA").map((item) => item.id);

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
        // 100% al contado este sprint (decisión de negocio 3, spec.md) —
        // montoCredito/credito quedan sin usar hasta Sprint 11.
        montoContado: params.totalCobrado,
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
      include: INCLUDE_COMPROBANTE,
    });

    // Un solo updateMany por tabla (no ítem por ítem en un for, a
    // diferencia de consolidarSueltos): cada id de Paquete/BandejaSuelta es
    // único por naturaleza, sin riesgo de que un mismo ítem aparezca dos
    // veces sumando cantidades distintas (a diferencia de
    // galponId:loteId en Consolidación) — un updateMany con
    // id: { in: [...] } por tabla alcanza y hace menos round-trips contra
    // el pooler de Neon.
    let vendidos = 0;
    if (paqueteIds.length > 0) {
      const resultado = await tx.paquete.updateMany({
        where: { id: { in: paqueteIds }, estado: "DISPONIBLE" },
        data: { estado: "VENDIDO" },
      });
      vendidos += resultado.count;
    }
    if (bandejaIds.length > 0) {
      const resultado = await tx.bandejaSuelta.updateMany({
        where: { id: { in: bandejaIds }, estado: "DISPONIBLE" },
        data: { estado: "VENDIDO" },
      });
      vendidos += resultado.count;
    }
    if (vendidos !== paqueteIds.length + bandejaIds.length) {
      throw new ItemsNoDisponiblesError();
    }

    return venta;
  });
}

// Usada por la Server Action en la rama de P2002 (reintento idempotente),
// mismo criterio que buscarRecoleccionConPaquetesPorId/
// buscarRegistroConsolidacionConUnidadesPorId. Mismo include que
// cerrarVenta — un reintento idempotente también arma un comprobante
// completo, no solo confirma que "ya existe".
export function buscarVentaConDetallesPorId(id: string) {
  return prisma.venta.findUnique({ where: { id }, include: INCLUDE_COMPROBANTE });
}

// Para el selector de items del POS — Paquete(estado)/BandejaSuelta(estado)
// ya indexados desde Sprint 0 ("el POS filtra constantemente por
// DISPONIBLE, es la query más frecuente del sistema",
// memory/modelo-datos.md). Sin paginación: el POS es una pantalla
// operativa de una sola vista, no una tabla de gestión. orderBy asc — FIFO,
// vender lo más viejo primero.
export function listarPaquetesDisponibles() {
  return prisma.paquete.findMany({
    where: { estado: "DISPONIBLE" },
    orderBy: { creadoEn: "asc" },
  });
}

export function listarBandejasDisponibles() {
  return prisma.bandejaSuelta.findMany({
    where: { estado: "DISPONIBLE" },
    orderBy: { creadoEn: "asc" },
  });
}

// Usadas por la Server Action para releer el peso REAL de cada ítem del
// carrito antes de armar la transacción — nunca se confía en un peso que
// venga del payload del cliente (H2, spec.md). peso es inmutable una vez
// creado (ningún código del proyecto lo actualiza después de
// registrarRecoleccion/consolidarSueltos), así que leerlo acá, unos
// milisegundos antes del updateMany atómico del guard dentro de
// cerrarVenta, es seguro — solo `estado` puede cambiar entre esta lectura
// y la transacción, y ese es justamente el campo que el guard revalida de
// forma atómica.
export function buscarPaquetesPorIds(ids: string[]) {
  return prisma.paquete.findMany({ where: { id: { in: ids } } });
}

export function buscarBandejasPorIds(ids: string[]) {
  return prisma.bandejaSuelta.findMany({ where: { id: { in: ids } } });
}

// Diagnóstico best-effort para el mensaje de error de la Server Action
// cuando cerrarVenta lanza ItemsNoDisponiblesError — se consulta DESPUÉS de
// que la transacción ya se revirtió, así que no es autoritativo (un ítem
// podría volver a cambiar de estado entre este chequeo y que el usuario lea
// el mensaje), solo sirve para decirle qué quitar del carrito (R5, spec.md).
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
