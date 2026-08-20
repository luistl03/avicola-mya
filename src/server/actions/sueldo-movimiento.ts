"use server";

import { Prisma } from "@prisma/client";

import {
  crearSueldoMovimientoSchema,
  revertirSueldoMovimientoSchema,
} from "@/lib/zod/sueldo-movimiento";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { buscarEmpleadoPorId } from "@/server/repositories/empleado";
import {
  buscarSueldoMovimientoPorId,
  crearSueldoMovimiento as crearSueldoMovimientoRepo,
  revertirSueldoMovimiento as revertirSueldoMovimientoRepo,
  SueldoMovimientoYaRevertidoError,
} from "@/server/repositories/sueldo-movimiento";
import { puedeRevertirSueldoMovimiento } from "@/server/services/sueldo-movimiento";

// Mismo helper que egreso.ts/empleado.ts/mortalidad.ts/credito.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Rol GERENTE únicamente (decisión 3, spec.md). Guard de "empleado
// activo" best-effort, no atómico (R2, spec.md: el riesgo real de
// carrera es bajo y sin impacto financiero-crítico, a diferencia del
// guard de sobrepago de Créditos). Idempotencia por id de cliente:
// SueldoMovimiento no tiene ningún campo con unicidad de negocio (dos
// movimientos idénticos del mismo empleado el mismo día son legítimos).
export const crearSueldoMovimientoAction = withAuth(
  { schema: crearSueldoMovimientoSchema, rol: "GERENTE", entidad: "SueldoMovimiento", accion: "CREAR" },
  async (input) => {
    const empleado = await buscarEmpleadoPorId(input.empleadoId);
    if (!empleado) {
      throw new AccionError("El empleado no existe.");
    }
    if (empleado.estado !== "ACTIVO") {
      throw new AccionError("No se puede registrar un movimiento para un empleado inactivo.");
    }

    let movimiento;
    try {
      movimiento = await crearSueldoMovimientoRepo(input);
    } catch (error) {
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarSueldoMovimientoPorId(input.id);
      if (!existente) {
        throw error;
      }
      const coincide =
        existente.empleadoId === input.empleadoId &&
        existente.tipo === input.tipo &&
        Number(existente.monto) === input.monto &&
        (existente.descripcion ?? undefined) === input.descripcion;
      if (!coincide) {
        throw new AccionError(
          "Ya existe un movimiento con este id pero con datos diferentes - no se sobrescribe.",
        );
      }
      movimiento = existente;
    }

    return {
      data: { id: movimiento.id },
      entidadId: movimiento.id,
      estadoDespues: {
        empleadoId: movimiento.empleadoId,
        tipo: movimiento.tipo,
        monto: Number(movimiento.monto),
        descripcion: movimiento.descripcion,
      },
    };
  },
);

// Ventana de gracia de 10 minutos, anclada a fecha (SueldoMovimiento no
// es editable, decisión 2 — fecha nunca cambia después del alta). El
// chequeo previo con puedeRevertirSueldoMovimiento() da el mensaje
// específico; el updateMany condicional del repository es el backstop
// real contra una carrera.
export const revertirSueldoMovimientoAction = withAuth(
  {
    schema: revertirSueldoMovimientoSchema,
    rol: "GERENTE",
    entidad: "SueldoMovimiento",
    accion: "REVERTIR",
  },
  async (input) => {
    const movimiento = await buscarSueldoMovimientoPorId(input.id);
    if (!movimiento) {
      throw new AccionError("El movimiento no existe.");
    }

    const guard = puedeRevertirSueldoMovimiento({
      revertido: movimiento.revertido,
      fecha: movimiento.fecha,
      ahora: new Date(),
    });
    if (!guard.permitido) {
      throw new AccionError(guard.motivo);
    }

    try {
      await revertirSueldoMovimientoRepo({ id: input.id, ahora: new Date() });
    } catch (error) {
      if (error instanceof SueldoMovimientoYaRevertidoError) {
        throw new AccionError("Este movimiento ya fue revertido - actualiza la pantalla.");
      }
      throw error;
    }

    return {
      data: { id: input.id },
      entidadId: input.id,
      estadoAntes: { revertido: false },
      estadoDespues: { revertido: true },
    };
  },
);
