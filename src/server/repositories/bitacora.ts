import type { CategoriaBitacora } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function crearNotaBitacora(data: {
  id: string;
  categoria: CategoriaBitacora;
  contenido: string;
  usuarioId: string;
  creadoEnCliente: Date;
}) {
  return prisma.bitacoraGlobal.create({ data });
}

export function buscarNotaBitacoraPorId(id: string) {
  return prisma.bitacoraGlobal.findUnique({ where: { id } });
}

export function editarNotaBitacora(
  id: string,
  data: { categoria: CategoriaBitacora; contenido: string },
) {
  return prisma.bitacoraGlobal.update({ where: { id }, data });
}

// Soft-delete (nunca DELETE físico, modelo-datos.md) — sin ventana de
// tiempo: una nota es texto suelto sin efecto sobre otro dato, corregirla
// o borrarla el mismo día o una semana después es igual de seguro
// (decisión de negocio confirmada por el Product Owner, a diferencia de
// Mortalidad).
export function eliminarNotaBitacora(id: string) {
  return prisma.bitacoraGlobal.update({ where: { id }, data: { eliminada: true } });
}

// Paginación por cursor (no por página/skip) — el muro de Bitácora es un
// feed cronológico con scroll infinito, no una tabla de gestión (ver
// "Tabla paginada vs. muro con scroll infinito" en memory/convenciones.md).
//
// orderBy compuesto ([{fecha: "desc"}, {id: "desc"}]) para que el orden
// sea determinístico incluso si dos notas comparten timestamp exacto
// (poco probable en uso real, posible en un script de carga o en tests)
// — sin el segundo criterio de desempate, el cursor podría saltear o
// repetir una fila empatada en fecha.
//
// categoria/fecha quedan undefined en el where cuando no se filtra por
// ellos: Prisma simplemente omite esa condición, no hace falta armar el
// objeto where condicionalmente a mano.
export function listarBitacoraPagina(params: {
  cursorId?: string;
  take: number;
  categoria?: CategoriaBitacora;
  desde?: Date;
  hasta?: Date;
}) {
  return prisma.bitacoraGlobal.findMany({
    where: {
      eliminada: false,
      categoria: params.categoria,
      fecha: {
        gte: params.desde,
        lte: params.hasta,
      },
    },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
    take: params.take,
    ...(params.cursorId ? { cursor: { id: params.cursorId }, skip: 1 } : {}),
    include: { usuario: { select: { nombre: true } } },
  });
}
