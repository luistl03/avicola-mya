import type { MetodoPago } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Lanzado dentro de la transacción cuando el guard atómico rechaza el
// abono — puede ser por saldo insuficiente O porque el Credito ya no está
// PENDIENTE (ya liquidado, o una carrera concurrente lo dejó sin margen
// justo antes). La Server Action distingue el motivo con un chequeo
// previo best-effort (R3, spec.md) — este repository no lo sabe, solo
// aplica el guard atómico real.
export class CreditoSobrepagoError extends Error {}

// Transacción interactiva nueva del proyecto. Orden: ANCLA primero (create
// de HistorialAbonos con id explícito), GUARD después — mismo orden que
// cerrarVenta/romperPaquete/romperBandeja, CORREGIDO durante la
// verificación en vivo de este sprint (S11-19) respecto al diseño
// original de plan.md, que proponía "guard primero" por analogía con
// registrarMortalidadYDescontarAves (avesVivas, un contador con margen).
// Esa analogía resultó incompleta: a diferencia de avesVivas (donde
// llegar exactamente a 0 es un caso posible pero no el desenlace normal
// de cada registro), Credito.montoPagado llegando exactamente a
// montoTotal es el desenlace ESPERADO y celebrado de todo crédito
// (auto-liquidación, H5) — con "guard primero", un reintento idempotente
// (doble clic) de JUSTO ESE abono que liquida el crédito encontraba
// estado ya LIQUIDADO / sin margen, y el guard lo rechazaba con
// CreditoSobrepagoError ANTES de llegar nunca al create con id explícito
// — la detección de idempotencia vía P2002 (ver "Idempotencia por id de
// cliente" en convenciones.md) nunca se disparaba, y el reintento
// recibía un mensaje de error confuso en vez de la respuesta idempotente
// exigida por H4 (quinto Gherkin, spec.md). Encontrado real contra Neon
// (S11-19), no solo en teoría — ver tasks.md.
//
// Con ANCLA primero: un reintento con el mismo id explota con P2002 en el
// primer statement, sin tocar Credito — la Server Action lo detecta y
// responde éxito idempotente (ver server/actions/credito.ts). Una carrera
// real (dos abonos con ids DISTINTOS peleando por el mismo margen) sigue
// atómica: si el create anida sin conflicto pero el guard después no
// encuentra margen, TODA la transacción se revierte, incluido el create
// recién hecho — no queda ningún HistorialAbonos huérfano (mismo
// mecanismo de rollback completo que ya documentaba convenciones.md).
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
    // ANCLA, primero — id explícito, protege contra doble envío. Un
    // reintento real (mismo id) explota acá con P2002, sin tocar Credito.
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
    // entrar a la transacción, mismo criterio que leer Paquete.peso antes
    // de cerrarVenta: montoTotal es inmutable una vez creado el Credito,
    // así que es seguro resolverlo fuera de la transacción. Si el guard
    // falla (carrera real o crédito ya liquidado por otra vía), la
    // transacción entera se revierte, deshaciendo también el create de
    // arriba — sin HistorialAbonos huérfano.
    const actualizado = await tx.credito.updateMany({
      where: { id: params.creditoId, estado: "PENDIENTE", montoPagado: { lte: techo } },
      data: { montoPagado: { increment: params.monto } },
    });
    if (actualizado.count === 0) {
      throw new CreditoSobrepagoError();
    }

    // Auto-liquidación: releída DENTRO de la misma transacción (visión
    // consistente del montoPagado recién incrementado). Si el abono deja
    // el saldo exactamente en cero, un segundo UPDATE marca LIQUIDADO.
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

// Reporte "Créditos y cobranza" de /reportes — créditos PENDIENTES cuya
// fechaLimite cae en el rango filtrado, usa el mismo índice
// Credito(estado, fechaLimite) que ya documenta modelo-datos.md. `hasta`
// es EXCLUSIVO (lt, no lte), mismo criterio que el resto de /reportes.
export function listarCreditosPendientesConFechaLimiteEnRango(desde: Date, hasta: Date) {
  return prisma.credito.findMany({
    where: { estado: "PENDIENTE", fechaLimite: { gte: desde, lt: hasta } },
    select: { montoTotal: true, montoPagado: true, fechaLimite: true },
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
