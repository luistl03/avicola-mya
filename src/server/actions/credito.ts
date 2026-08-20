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

// Mismo helper que usuario.ts/lote.ts/galpon.ts/recoleccion.ts/cliente.ts/
// precioKilo.ts/venta.ts/rotura.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Idempotencia por id de cliente (mismo patrón que crearCliente/Venta):
// HistorialAbonos no tiene ningún campo @unique salvo id. Sin `rol` —
// abierta a GERENTE y OPERARIO (decisión 7/10, spec.md).
export const registrarAbonoAction = withAuth(
  { schema: registrarAbonoSchema, entidad: "HistorialAbonos", accion: "REGISTRAR" },
  async (input, ctx) => {
    // Chequeo previo (best-effort, R3 spec.md) — arma un mensaje razonable
    // ANTES de tocar la transacción; el guard atómico real vive en el
    // repository y es la fuente de verdad ante una carrera.
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
          "El saldo cambió justo antes de registrar este abono - revisa el crédito y reintenta.",
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
        throw new AccionError("Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.");
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
