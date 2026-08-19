import type { MetodoPago } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Lanzado dentro de la transacción para forzar el rollback cuando al menos
// un ítem del carrito ya no está DISPONIBLE — no es un AccionError (ADR-000,
// este archivo no conoce server/auth/with-auth.ts), la Server Action lo
// atrapa y arma el mensaje con el/los ítems específicos (R5, spec.md de
// Sprint 9).
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
  // Sprint 11 — desglose contado/crédito en el comprobante. abonos (orden
  // desc, mismo criterio que buscarCreditoConAbonosPorId en
  // repositories/credito.ts) — historial de pagos posteriores a la venta,
  // mostrado solo en "Ver detalle" de /ventas (VentasTabla), nunca en el
  // PDF descargable: el comprobante es el documento de la venta al momento
  // de cerrarse, no un ledger que cambia con el tiempo.
  credito: { include: { abonos: { orderBy: { fecha: "desc" } } } },
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
  // Sprint 11 — presente solo cuando la venta es a crédito (total o
  // parcial). montoContado ya viene resuelto (puede ser 0); montoCredito
  // = totalCobrado - montoContado, ya calculado por la Server Action
  // (calcularMontoCredito).
  credito?: { montoContado: number; montoCredito: number; fechaLimite: Date };
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
        // Sin crédito: idéntico a Sprint 9 (100% al contado). Con
        // crédito: montoContado puede ser 0 (crédito total) o parcial.
        montoContado: params.credito ? params.credito.montoContado : params.totalCobrado,
        montoCredito: params.credito ? params.credito.montoCredito : null,
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
        // Credito anidado dentro del MISMO tx.venta.create — atómico con
        // el ancla, sin un segundo statement ni id de cliente separado:
        // Credito.ventaId @unique ya lo protege (si Venta.create falla
        // por P2002 en un reintento, la transacción entera se revierte,
        // incluido este nested create, que nunca llega a persistir a
        // medias).
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

// Para el selector de items del POS y del listado de "Romper" de
// Consolidación (Sprint 10) — Paquete(estado)/BandejaSuelta(estado) ya
// indexados desde Sprint 0 ("el POS filtra constantemente por DISPONIBLE,
// es la query más frecuente del sistema", memory/modelo-datos.md). Sin
// paginación: son pantallas operativas de una sola vista, no una tabla de
// gestión. orderBy asc — FIFO, vender/romper lo más viejo primero.
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

type FiltrosVentas = {
  desde?: Date;
  hasta?: Date;
  metodoPago?: MetodoPago;
  // true = solo ventas con Credito asociado (total o parcial), false =
  // solo 100% al contado (sin Credito), undefined = ambas.
  esCredito?: boolean;
  // Búsqueda libre combinada — un solo campo en VentaFiltros que matchea
  // por nombre de cliente O por N° de comprobante (prefijo hex de
  // Venta.id, mismo valor que imprime lib/pdf/comprobante.ts,
  // referenciaCorta()) a la vez, sin que el operario tenga que elegir cuál
  // de los dos está tipeando. Antes eran dos campos separados (clienteId
  // exacto vía autocomplete + comprobante); se unificaron en S11-hotfix
  // porque con 7 controles la fila de filtros ya no entraba en una sola
  // línea sin romperse en pantallas comunes (hallazgo real del Product
  // Owner). Ningún nombre de cliente real matchea un prefijo hex de UUID
  // por accidente salvo que coincida caracter a caracter, así que el OR no
  // genera falsos positivos cruzados en la práctica.
  busqueda?: string;
};

function whereVentas(filtros: FiltrosVentas) {
  return {
    fecha: { gte: filtros.desde, lte: filtros.hasta },
    metodoPago: filtros.metodoPago,
    credito: filtros.esCredito === undefined ? undefined : filtros.esCredito ? { isNot: null } : { is: null },
    ...(filtros.busqueda
      ? {
          OR: [
            { cliente: { nombre: { contains: filtros.busqueda, mode: "insensitive" as const } } },
            { id: { startsWith: filtros.busqueda, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

// Listado de ventas (/ventas, tabla de gestión) — mismo patrón de
// paginación server-side dirigida por URL que Mortalidad/Recolección
// (memory/convenciones.md). `credito: { select: { estado } }` trae lo
// justo para mostrar el badge Contado/Crédito sin una query aparte.
export function listarVentas(params: FiltrosVentas & { skip: number; take: number }) {
  return prisma.venta.findMany({
    where: whereVentas(params),
    orderBy: { fecha: "desc" },
    skip: params.skip,
    take: params.take,
    include: {
      cliente: { select: { nombre: true } },
      usuario: { select: { nombre: true } },
      credito: { select: { estado: true } },
      _count: { select: { detalles: true } },
    },
  });
}

export function contarVentas(params: FiltrosVentas = {}) {
  return prisma.venta.count({ where: whereVentas(params) });
}
