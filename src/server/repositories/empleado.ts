import type { EstadoEmpleado } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function crearEmpleado(data: { id: string; nombre: string; celular?: string; cargo?: string }) {
  return prisma.empleado.create({ data });
}

// Sin updateMany/guard — a diferencia de Egreso, no hay ningún estado
// "revertido" que proteger acá (Empleado se desactiva, nunca se anula un
// alta).
export function editarEmpleado(data: { id: string; nombre: string; celular?: string; cargo?: string }) {
  return prisma.empleado.update({ where: { id: data.id }, data });
}

export function cambiarEstadoEmpleado(params: { id: string; estado: EstadoEmpleado }) {
  return prisma.empleado.update({ where: { id: params.id }, data: { estado: params.estado } });
}

export function listarEmpleados(params: { skip: number; take: number; estado?: EstadoEmpleado }) {
  return prisma.empleado.findMany({
    where: { estado: params.estado },
    orderBy: { nombre: "asc" },
    skip: params.skip,
    take: params.take,
  });
}

export function contarEmpleados(params: { estado?: EstadoEmpleado } = {}) {
  return prisma.empleado.count({ where: { estado: params.estado } });
}

export function buscarEmpleadoPorId(id: string) {
  return prisma.empleado.findUnique({ where: { id } });
}

// Para el <Select> de "Registrar movimiento" (H4, decisión 6, spec.md) —
// solo empleados ACTIVO pueden recibir un SueldoMovimiento nuevo. Sin
// paginar: la lista de empleados activos de una granja familiar es chica.
export function listarEmpleadosActivos() {
  return prisma.empleado.findMany({ where: { estado: "ACTIVO" }, orderBy: { nombre: "asc" } });
}
