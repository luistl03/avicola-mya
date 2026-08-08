import { prisma } from "@/lib/prisma";

// $transaction en array-form (mismo patrón que
// desactivarUsuarioYRevocarSesiones, Sprint 2) — el id del lote se genera
// acá mismo con crypto.randomUUID() para poder referenciarlo en la
// segunda operación (abrir la primera fila de HistorialUbicacionLote) sin
// necesitar el resultado de la primera query, que el array-form de
// $transaction no expone hasta que toda la transacción termina. No se
// introduce prisma.$transaction(async tx => ...) acá: sería un patrón
// nuevo en el repo, no usado en ningún otro lugar todavía.
export function crearLoteConUbicacion(data: {
  codigo: string;
  fechaIngreso: Date;
  avesIniciales: number;
  edadInicialSemanas: number;
  galponId: string;
}) {
  const loteId = crypto.randomUUID();
  const ahora = new Date();
  return prisma.$transaction([
    prisma.lote.create({
      data: {
        id: loteId,
        codigo: data.codigo,
        fechaIngreso: data.fechaIngreso,
        avesIniciales: data.avesIniciales,
        avesVivas: data.avesIniciales,
        edadInicialSemanas: data.edadInicialSemanas,
      },
    }),
    prisma.historialUbicacionLote.create({
      data: { loteId, galponId: data.galponId, fechaEntrada: ahora },
    }),
  ]);
}

// updateMany (no update) para cerrar la fila vieja — mismo motivo que
// revocarSesionesPorUsuario desde Sprint 1: si por algún motivo no hubiera
// fila abierta (no debería pasar, lo garantiza el índice único parcial de
// S0-5), es un no-op silencioso, no un throw de P2025.
export function mudarLote(loteId: string, galponDestinoId: string, ahora: Date) {
  return prisma.$transaction([
    prisma.historialUbicacionLote.updateMany({
      where: { loteId, fechaSalida: null },
      data: { fechaSalida: ahora },
    }),
    prisma.historialUbicacionLote.create({
      data: { loteId, galponId: galponDestinoId, fechaEntrada: ahora },
    }),
  ]);
}

export function finalizarLote(id: string, ahora: Date) {
  return prisma.$transaction([
    prisma.lote.update({ where: { id }, data: { estado: "INACTIVO" } }),
    prisma.historialUbicacionLote.updateMany({
      where: { loteId: id, fechaSalida: null },
      data: { fechaSalida: ahora },
    }),
  ]);
}

export function buscarLotePorId(id: string) {
  return prisma.lote.findUnique({ where: { id } });
}

export function buscarLotePorCodigo(codigo: string) {
  return prisma.lote.findUnique({ where: { codigo } });
}

// Ubicación abierta de UN lote — usada por la guard de mudanza (necesita
// el galponOrigenId para el chequeo "no mudar al mismo galpón") y por la
// action para saber qué fila se va a cerrar.
export function buscarUbicacionActual(loteId: string) {
  return prisma.historialUbicacionLote.findFirst({ where: { loteId, fechaSalida: null } });
}

// Para la tabla de /lotes: una sola query con include (no N+1), mismo
// criterio que listarGalponesConOcupacion.
//
// Trae la ÚLTIMA fila de historial (orderBy fechaEntrada desc, take 1),
// esté abierta o cerrada — no solo la abierta (`fechaSalida: null`) como
// hacía hasta antes del campo de edad. Para un lote ACTIVO da lo mismo
// (la última fila siempre es la abierta, por el índice único parcial de
// S0-5); para uno INACTIVO, esa fila cerrada es la que
// finalizarLote() dejó al cerrar la ubicación — su fechaSalida es
// exactamente el momento de finalización, que calcularEdadEnSemanas()
// usa como fechaReferencia para "congelar" la edad mostrada (ver
// server/services/lote.ts). Evita agregar un campo
// fechaFinalizacion nuevo: ese dato ya vive acá.
export function listarLotesConUbicacion(params: { skip: number; take: number }) {
  return prisma.lote.findMany({
    orderBy: { fechaIngreso: "desc" },
    skip: params.skip,
    take: params.take,
    include: {
      historialUbicaciones: {
        orderBy: { fechaEntrada: "desc" },
        take: 1,
        include: { galpon: { select: { id: true, nombre: true } } },
      },
    },
  });
}

export function contarLotes() {
  return prisma.lote.count();
}

// Para poblar el <Select> de lote en el formulario de mortalidad (Sprint
// 4) — sin paginar, mismo criterio que listarGalponesActivos(). avesVivas
// viaja junto para que el formulario pueda mostrar "quedan N vivas" sin
// una segunda consulta.
export function listarLotesActivos() {
  return prisma.lote.findMany({
    where: { estado: "ACTIVO" },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, avesVivas: true },
  });
}
