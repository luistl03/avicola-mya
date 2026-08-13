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
