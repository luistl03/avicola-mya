"use server";

import { Prisma } from "@prisma/client";

import {
  buscarClientesAutocompleteSchema,
  cambiarEstadoClienteSchema,
  crearClienteSchema,
  editarClienteSchema,
} from "@/lib/zod/cliente";
import { idUuid } from "@/lib/zod/comun";
import { auth } from "@/server/auth";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  actualizarCliente,
  buscarClientePorId,
  buscarClientesAutocomplete,
  cambiarEstadoCliente,
  crearCliente as crearClienteRepo,
} from "@/server/repositories/cliente";
import { buscarCreditosPorClienteConAbonos } from "@/server/repositories/credito";
import { esClientePublicoGeneral } from "@/server/services/cliente";

// Mismo helper que usuario.ts/lote.ts/galpon.ts/recoleccion.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Idempotencia por id de cliente (mismo patrón que server/actions/galpon.ts,
// Sprint 3 + auditoría post-Sprint 5): Cliente no tiene ningún campo
// @unique, así que el id generado en el cliente es la única defensa real
// contra un doble envío duplicando la fila.
export const crearCliente = withAuth(
  { schema: crearClienteSchema, entidad: "Cliente", accion: "CREAR" },
  async (input) => {
    let cliente;
    try {
      cliente = await crearClienteRepo(input);
    } catch (error) {
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarClientePorId(input.id);
      if (!existente) {
        throw error;
      }
      const coincide =
        existente.nombre === input.nombre &&
        (existente.celular ?? null) === (input.celular ?? null) &&
        (existente.direccion ?? null) === (input.direccion ?? null) &&
        existente.tipo === input.tipo;
      if (!coincide) {
        throw new AccionError(
          "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
        );
      }
      cliente = existente;
    }
    return {
      data: { id: cliente.id },
      entidadId: cliente.id,
      estadoDespues: { nombre: cliente.nombre, tipo: cliente.tipo },
    };
  },
);

export const editarCliente = withAuth(
  { schema: editarClienteSchema, entidad: "Cliente", accion: "EDITAR" },
  async (input) => {
    const existente = await buscarClientePorId(input.clienteId);
    if (!existente) {
      throw new AccionError("El cliente no existe.");
    }
    if (esClientePublicoGeneral(input.clienteId)) {
      throw new AccionError("Público General no se puede editar.");
    }

    const cliente = await actualizarCliente(input.clienteId, {
      nombre: input.nombre,
      celular: input.celular,
      direccion: input.direccion,
      tipo: input.tipo,
    });

    return {
      data: { id: cliente.id },
      entidadId: cliente.id,
      estadoAntes: { nombre: existente.nombre, tipo: existente.tipo },
      estadoDespues: { nombre: cliente.nombre, tipo: cliente.tipo },
    };
  },
);

export const cambiarEstadoClienteAction = withAuth(
  { schema: cambiarEstadoClienteSchema, entidad: "Cliente", accion: "CAMBIAR_ESTADO" },
  async (input) => {
    const existente = await buscarClientePorId(input.clienteId);
    if (!existente) {
      throw new AccionError("El cliente no existe.");
    }

    // Chequeo de "sin cambios" primero, guard de Público General después
    // — mismo orden que la lección de Sprint 2 ("puedeDesactivarUsuario
    // tenía el chequeo de 'último Gerente' después del de
    // autodesactivación — código muerto en la práctica"): acá el caso real
    // relevante es el que SÍ intenta un cambio real, no el no-op.
    if (input.estado === existente.estado) {
      return {
        data: { id: existente.id, estado: existente.estado },
        entidadId: existente.id,
        estadoAntes: { estado: existente.estado },
        estadoDespues: { estado: existente.estado },
      };
    }

    if (esClientePublicoGeneral(input.clienteId)) {
      throw new AccionError("Público General no se puede suspender.");
    }

    const cliente = await cambiarEstadoCliente(input.clienteId, input.estado);
    return {
      data: { id: cliente.id, estado: cliente.estado },
      entidadId: cliente.id,
      estadoAntes: { estado: existente.estado },
      estadoDespues: { estado: cliente.estado },
    };
  },
);

// Lectura, no mutación → NO pasa por withAuth a propósito (Sprint 9, mismo
// criterio que obtenerMasBitacora, memory/convenciones.md, "Server
// Actions"): no hay una única entidad mutada que auditar — forzarlo
// ensuciaría AuditLog con una fila por cada tecla escrita en el buscador
// del POS. Verifica sesión a mano con auth(). Acotado a ACTIVO y sin
// paginación en el repository (buscarClientesAutocomplete), no acá.
export async function buscarClientesAutocompleteAction(busqueda: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "No autenticado." };
  }

  const parsed = buscarClientesAutocompleteSchema.safeParse({ busqueda });
  if (!parsed.success) {
    // Búsqueda vacía/inválida (ej. el operario borró el input) no es un
    // error para el usuario del autocomplete — simplemente no hay
    // sugerencias que mostrar todavía.
    return { ok: true as const, data: [] };
  }

  const clientes = await buscarClientesAutocomplete(parsed.data.busqueda);
  return { ok: true as const, data: clientes };
}

// Lectura, no mutación → NO pasa por withAuth (Sprint 11, mismo criterio
// que buscarClientesAutocompleteAction arriba): no hay una única entidad
// mutada que auditar. Verifica sesión a mano con auth(). Devuelve TODOS
// los Credito del cliente (PENDIENTE y LIQUIDADO) con su historial de
// abonos completo — "Estado de cuenta por cliente" (H6, spec.md).
export async function obtenerEstadoCuentaAction(clienteId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "No autenticado." };
  }

  if (!idUuid().safeParse(clienteId).success) {
    return { ok: false as const, error: "Cliente inválido." };
  }

  const creditos = await buscarCreditosPorClienteConAbonos(clienteId);
  return {
    ok: true as const,
    data: creditos.map((credito) => ({
      id: credito.id,
      montoTotal: Number(credito.montoTotal),
      montoPagado: Number(credito.montoPagado),
      fechaLimite: credito.fechaLimite.toISOString(),
      estado: credito.estado,
      abonos: credito.abonos.map((abono) => ({
        id: abono.id,
        fecha: abono.fecha.toISOString(),
        monto: Number(abono.monto),
        metodoPago: abono.metodoPago,
      })),
    })),
  };
}
