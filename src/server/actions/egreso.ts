"use server";

import { Prisma } from "@prisma/client";

import { crearEgresoSchema, editarEgresoSchema, revertirEgresoSchema } from "@/lib/zod/egreso";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  buscarEgresoPorId,
  crearEgreso as crearEgresoRepo,
  editarEgreso as editarEgresoRepo,
  EgresoRevertidoError,
  EgresoYaRevertidoError,
  revertirEgreso as revertirEgresoRepo,
} from "@/server/repositories/egreso";
import { puedeRevertirEgreso } from "@/server/services/egreso";

// Mismo helper que usuario.ts/lote.ts/galpon.ts/mortalidad.ts/credito.ts/...
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Rol GERENTE únicamente (decisión 3, spec.md) — Egresos es información
// financiera que el roadmap describe explícitamente como "el Gerente
// registra". Idempotencia por id de cliente: Egreso no tiene ningún
// campo con unicidad de negocio (convenciones.md).
export const crearEgresoAction = withAuth(
  { schema: crearEgresoSchema, rol: "GERENTE", entidad: "Egreso", accion: "CREAR" },
  async (input, ctx) => {
    let egreso;
    try {
      egreso = await crearEgresoRepo({
        id: input.id,
        categoria: input.categoria,
        monto: input.monto,
        descripcion: input.descripcion,
        fecha: input.fecha,
        usuarioId: ctx.usuarioId,
      });
    } catch (error) {
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarEgresoPorId(input.id);
      if (!existente) {
        throw error;
      }
      const coincide =
        existente.categoria === input.categoria &&
        Number(existente.monto) === input.monto &&
        existente.descripcion === input.descripcion &&
        existente.fecha.getTime() === input.fecha.getTime();
      if (!coincide) {
        throw new AccionError("Ya existe un egreso con este id pero con datos diferentes - no se sobrescribe.");
      }
      egreso = existente;
    }

    return {
      data: { id: egreso.id },
      entidadId: egreso.id,
      estadoDespues: {
        categoria: egreso.categoria,
        monto: Number(egreso.monto),
        descripcion: egreso.descripcion,
        fecha: egreso.fecha.toISOString(),
      },
    };
  },
);

// Editable sin límite de tiempo mientras no esté anulado (decisión 1,
// spec.md) — el guard real (no editar un ya revertido) vive en el
// updateMany condicional del repository.
export const editarEgresoAction = withAuth(
  { schema: editarEgresoSchema, rol: "GERENTE", entidad: "Egreso", accion: "EDITAR" },
  async (input) => {
    const existente = await buscarEgresoPorId(input.id);
    if (!existente) {
      throw new AccionError("El egreso no existe.");
    }

    try {
      await editarEgresoRepo(input);
    } catch (error) {
      if (error instanceof EgresoRevertidoError) {
        throw new AccionError("No se puede editar un egreso ya anulado.");
      }
      throw error;
    }

    return {
      data: { id: input.id },
      entidadId: input.id,
      estadoAntes: {
        categoria: existente.categoria,
        monto: Number(existente.monto),
        descripcion: existente.descripcion,
        fecha: existente.fecha.toISOString(),
      },
      estadoDespues: {
        categoria: input.categoria,
        monto: input.monto,
        descripcion: input.descripcion,
        fecha: input.fecha.toISOString(),
      },
    };
  },
);

// Ventana de gracia de 10 minutos, anclada a creadoEn (decisión 1,
// spec.md — nunca a fecha, que es editable). El chequeo previo con
// puedeRevertirEgreso() da el mensaje específico ("ya pasó la ventana"
// vs. "ya fue anulado"); el updateMany condicional del repository es el
// backstop real contra una carrera.
export const revertirEgresoAction = withAuth(
  { schema: revertirEgresoSchema, rol: "GERENTE", entidad: "Egreso", accion: "ANULAR" },
  async (input) => {
    const egreso = await buscarEgresoPorId(input.id);
    if (!egreso) {
      throw new AccionError("El egreso no existe.");
    }

    const guard = puedeRevertirEgreso({
      revertido: egreso.revertido,
      creadoEn: egreso.creadoEn,
      ahora: new Date(),
    });
    if (!guard.permitido) {
      throw new AccionError(guard.motivo);
    }

    try {
      await revertirEgresoRepo({ id: input.id, ahora: new Date() });
    } catch (error) {
      if (error instanceof EgresoYaRevertidoError) {
        throw new AccionError("Este egreso ya fue anulado - actualiza la pantalla.");
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
