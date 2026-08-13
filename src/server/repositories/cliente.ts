import type { TipoCliente } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DatosCliente = {
  nombre: string;
  celular?: string;
  direccion?: string;
  tipo: TipoCliente;
};

export function crearCliente(data: DatosCliente & { id: string }) {
  return prisma.cliente.create({
    data: {
      id: data.id,
      nombre: data.nombre,
      celular: data.celular ?? null,
      direccion: data.direccion ?? null,
      tipo: data.tipo,
    },
  });
}

export function buscarClientePorId(id: string) {
  return prisma.cliente.findUnique({ where: { id } });
}

export function actualizarCliente(id: string, data: DatosCliente) {
  return prisma.cliente.update({
    where: { id },
    data: {
      nombre: data.nombre,
      celular: data.celular ?? null,
      direccion: data.direccion ?? null,
      tipo: data.tipo,
    },
  });
}

export function cambiarEstadoCliente(id: string, estado: "ACTIVO" | "SUSPENDIDO") {
  return prisma.cliente.update({ where: { id }, data: { estado } });
}

// Para /clientes: tabla paginada + filtros por nombre/celular (texto libre)
// Y tipo (mismo criterio de "server-side, dirigida por URL" que
// memory/convenciones.md exige para toda tabla de gestión, mismo patrón de
// combinar texto + Select que MortalidadFiltros con tipo/loteId). contains
// + mode "insensitive" — los índices ya existentes (@@index([nombre]),
// @@index([estado])) alcanzan para el volumen esperado de esta granja, sin
// índice nuevo. Los dos filtros se combinan con AND (si ambos están
// presentes, tienen que cumplirse los dos), cada uno opcional por separado.
function whereFiltros(params: { busqueda?: string; tipo?: TipoCliente }) {
  const condiciones = [];
  if (params.busqueda) {
    condiciones.push({
      OR: [
        { nombre: { contains: params.busqueda, mode: "insensitive" as const } },
        { celular: { contains: params.busqueda, mode: "insensitive" as const } },
      ],
    });
  }
  if (params.tipo) {
    condiciones.push({ tipo: params.tipo });
  }
  return condiciones.length > 0 ? { AND: condiciones } : undefined;
}

export function listarClientes(params: {
  skip: number;
  take: number;
  busqueda?: string;
  tipo?: TipoCliente;
}) {
  return prisma.cliente.findMany({
    where: whereFiltros(params),
    orderBy: { nombre: "asc" },
    skip: params.skip,
    take: params.take,
  });
}

export function contarClientes(params: { busqueda?: string; tipo?: TipoCliente }) {
  return prisma.cliente.count({ where: whereFiltros(params) });
}
