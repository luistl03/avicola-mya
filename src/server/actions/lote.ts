"use server";

import { Prisma } from "@prisma/client";

import { crearLoteSchema, finalizarLoteSchema, mudarLoteSchema } from "@/lib/zod/lote";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { buscarGalponPorId, obtenerOcupacionGalpon } from "@/server/repositories/galpon";
import {
  buscarLotePorCodigo,
  buscarLotePorId,
  buscarUbicacionActual,
  crearLoteConUbicacion,
  finalizarLote,
  mudarLote,
} from "@/server/repositories/lote";
import { puedeAlojarEnGalpon } from "@/server/services/galpon";
import { puedeFinalizarLote, puedeMudarLote } from "@/server/services/lote";

const ERROR_CODIGO_DUPLICADO = "Ya existe un lote con ese código.";

function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function sumarAvesAlojadas(ocupacion: { lote: { avesVivas: number } }[]): number {
  return ocupacion.reduce((suma, fila) => suma + fila.lote.avesVivas, 0);
}

export const crearLote = withAuth(
  { schema: crearLoteSchema, rol: "GERENTE", entidad: "Lote", accion: "CREAR" },
  async (input) => {
    // Chequeo previo: evita el round-trip de un error de Prisma en el caso
    // común. El catch de P2002 de abajo cubre la carrera entre dos altas
    // simultáneas con el mismo código (mismo patrón que crearUsuario).
    const existente = await buscarLotePorCodigo(input.codigo);
    if (existente) {
      throw new AccionError(ERROR_CODIGO_DUPLICADO);
    }

    const galpon = await buscarGalponPorId(input.galponId);
    if (!galpon) {
      throw new AccionError("El galpón no existe.");
    }

    const ocupacion = await obtenerOcupacionGalpon(input.galponId);
    const avesActuales = sumarAvesAlojadas(ocupacion);
    const guard = puedeAlojarEnGalpon({
      galponEstado: galpon.estado,
      capacidadMaxima: galpon.capacidadMaxima,
      avesActualesAlojadas: avesActuales,
      avesEntrantes: input.avesIniciales,
    });
    if (!guard.permitido) {
      throw new AccionError(guard.motivo);
    }

    let resultado;
    try {
      resultado = await crearLoteConUbicacion(input);
    } catch (error) {
      if (esErrorDeUnicidad(error)) {
        throw new AccionError(ERROR_CODIGO_DUPLICADO);
      }
      throw error;
    }
    const [lote] = resultado;

    return {
      data: { id: lote.id },
      entidadId: lote.id,
      estadoDespues: {
        codigo: lote.codigo,
        fechaIngreso: lote.fechaIngreso.toISOString(),
        avesIniciales: lote.avesIniciales,
        edadInicialSemanas: lote.edadInicialSemanas,
        galponId: input.galponId,
      },
    };
  },
);

export const mudarLoteAction = withAuth(
  { schema: mudarLoteSchema, rol: "GERENTE", entidad: "Lote", accion: "MUDAR" },
  async (input) => {
    const lote = await buscarLotePorId(input.loteId);
    if (!lote) {
      throw new AccionError("El lote no existe.");
    }

    const ubicacionActual = await buscarUbicacionActual(input.loteId);
    const guardMudanza = puedeMudarLote({
      loteEstado: lote.estado,
      galponOrigenId: ubicacionActual?.galponId ?? null,
      galponDestinoId: input.galponDestinoId,
    });
    if (!guardMudanza.permitido) {
      throw new AccionError(guardMudanza.motivo);
    }

    const destino = await buscarGalponPorId(input.galponDestinoId);
    if (!destino) {
      throw new AccionError("El galpón destino no existe.");
    }

    const ocupacionDestino = await obtenerOcupacionGalpon(input.galponDestinoId);
    const avesDestino = sumarAvesAlojadas(ocupacionDestino);
    const guardCapacidad = puedeAlojarEnGalpon({
      galponEstado: destino.estado,
      capacidadMaxima: destino.capacidadMaxima,
      avesActualesAlojadas: avesDestino,
      avesEntrantes: lote.avesVivas,
    });
    if (!guardCapacidad.permitido) {
      throw new AccionError(guardCapacidad.motivo);
    }

    // No necesita idempotencia por id de cliente como
    // Recolección/Galpón/Bitácora/Mortalidad (auditoría post-Sprint 5,
    // ver memory/estado-proyecto.md): un reintento secuencial genuino ya
    // queda cubierto por la guard de arriba (galponOrigenId ===
    // galponDestinoId, "El lote ya está en ese galpón" tras la primera
    // mudanza exitosa). Solo una carrera verdaderamente concurrente
    // podría chocar contra el índice único parcial de S0-5 (una sola
    // ubicación abierta por lote) — este catch solo le da un mensaje
    // claro a ese caso límite, no protege contra duplicación real de
    // datos (esa ya la da el índice de la base).
    try {
      await mudarLote(input.loteId, input.galponDestinoId, new Date());
    } catch (error) {
      if (esErrorDeUnicidad(error)) {
        throw new AccionError(
          "Este lote ya fue mudado - actualiza la pantalla antes de reintentar.",
        );
      }
      throw error;
    }

    return {
      data: { id: lote.id },
      entidadId: lote.id,
      estadoAntes: { galponId: ubicacionActual?.galponId ?? null },
      estadoDespues: { galponId: input.galponDestinoId },
    };
  },
);

export const finalizarLoteAction = withAuth(
  { schema: finalizarLoteSchema, rol: "GERENTE", entidad: "Lote", accion: "FINALIZAR" },
  async (input) => {
    const lote = await buscarLotePorId(input.loteId);
    if (!lote) {
      throw new AccionError("El lote no existe.");
    }

    const guard = puedeFinalizarLote({ loteEstado: lote.estado });
    if (!guard.permitido) {
      throw new AccionError(guard.motivo);
    }

    await finalizarLote(input.loteId, new Date());

    return {
      data: { id: lote.id },
      entidadId: lote.id,
      estadoAntes: { estado: lote.estado },
      estadoDespues: { estado: "INACTIVO" },
    };
  },
);
