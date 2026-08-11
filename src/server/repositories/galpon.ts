import type { EstadoGalpon } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function crearGalpon(data: { id: string; nombre: string; capacidadMaxima: number }) {
  return prisma.galpon.create({ data });
}

export function actualizarGalpon(id: string, data: { nombre: string; capacidadMaxima: number }) {
  return prisma.galpon.update({ where: { id }, data });
}

export function cambiarEstadoGalpon(id: string, estado: EstadoGalpon) {
  return prisma.galpon.update({ where: { id }, data: { estado } });
}

export function buscarGalponPorId(id: string) {
  return prisma.galpon.findUnique({ where: { id } });
}

// Ocupación de UN galpón: filas abiertas (fechaSalida null) de
// HistorialUbicacionLote con las avesVivas de cada lote alojado. Usada por
// las guards de alta/mudanza/editar/desactivar (server/services/galpon.ts)
// para calcular capacidad y cantidad de lotes alojados sin traer más datos
// de los que hace falta para sumar.
export function obtenerOcupacionGalpon(galponId: string) {
  return prisma.historialUbicacionLote.findMany({
    where: { galponId, fechaSalida: null },
    include: { lote: { select: { id: true, codigo: true, avesVivas: true } } },
  });
}

// Para poblar el <Select> de galpón destino en los formularios de alta y
// mudanza de lote (server/actions/lote.ts, Sprint 3) — sin paginar, son
// pocos galpones por granja.
export function listarGalponesActivos() {
  return prisma.galpon.findMany({ where: { estado: "ACTIVO" }, orderBy: { nombre: "asc" } });
}

// Para la tabla de /galpones: una sola query con include (no N+1) — cada
// fila ya trae sus lotes alojados actuales para calcular la ocupación en
// el Server Component, mismo criterio que listarUsuarios/contarUsuarios.
export function listarGalponesConOcupacion(params: { skip: number; take: number }) {
  return prisma.galpon.findMany({
    orderBy: { nombre: "asc" },
    skip: params.skip,
    take: params.take,
    include: {
      historialUbicaciones: {
        where: { fechaSalida: null },
        include: { lote: { select: { id: true, codigo: true, avesVivas: true } } },
      },
    },
  });
}

export function contarGalpones() {
  return prisma.galpon.count();
}
