import { prisma } from "@/lib/prisma";

export function crearPrecioKilo(data: { id: string; precio: number; usuarioId: string; vigenteDesde: Date }) {
  return prisma.precioKilo.create({ data });
}

export function buscarPrecioKiloPorId(id: string) {
  return prisma.precioKilo.findUnique({ where: { id } });
}

// El precio "vigente" siempre es la fila con vigenteDesde más reciente —
// nunca se hace UPDATE sobre una fila existente (roadmap: "nueva fila,
// nunca UPDATE"), así que esta lectura es la única fuente de verdad de
// "cuánto cuesta el kilo hoy". Incluye el nombre de quien lo fijó, para
// mostrar "Fijado por X el DD/MM" en /precio-kilo sin una query aparte.
export function obtenerPrecioKiloVigente() {
  return prisma.precioKilo.findFirst({
    orderBy: { vigenteDesde: "desc" },
    include: { usuario: { select: { nombre: true } } },
  });
}

// Historial completo (no solo el vigente) para /precio-kilo — cada fila
// es un precio que estuvo vigente en algún momento, nunca se pisa
// (mismo criterio de "nueva fila, nunca UPDATE" de crearPrecioKilo).
// Paginado con el mismo patrón que el resto de tablas de gestión del
// proyecto (memory/convenciones.md, "Paginación de tablas de datos").
export function listarPrecioKilo(params: { skip: number; take: number }) {
  return prisma.precioKilo.findMany({
    orderBy: { vigenteDesde: "desc" },
    skip: params.skip,
    take: params.take,
    include: { usuario: { select: { nombre: true } } },
  });
}

export function contarPrecioKilo() {
  return prisma.precioKilo.count();
}
