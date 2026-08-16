import { UNIDADES_POR_BANDEJA, UNIDADES_POR_PAQUETE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { type OrigenUnidad, repartirDevolucion } from "@/server/services/rotura";

// Lanzados dentro de la transacción para forzar el rollback — no son
// AccionError (ADR-000, este archivo no conoce server/auth/with-auth.ts),
// la Server Action los traduce.
export class PaqueteNoDisponibleError extends Error {}
export class BandejaNoDisponibleError extends Error {}

// Octava transacción interactiva del proyecto. Orden: ANCLA primero
// (RoturaPaquete.create), guard después (updateMany sobre Paquete) — mismo
// motivo que cerrarVenta (Sprint 9): EstadoPaquete DISPONIBLE→ROTO es un
// estado de una sola dirección este sprint (sin reversión). Si el guard
// corriera ANTES del create, un reintento idempotente legítimo (mismo
// paqueteId, mismo peso, ya persistido con éxito antes) encontraría el
// Paquete YA ROTO y lanzaría PaqueteNoDisponibleError por error,
// confundiendo un reintento válido con una carrera real.
//
// A diferencia de cerrarVenta (Sprint 9), acá NO hace falta un id de
// cliente generado aparte: RoturaPaquete.paqueteId ya es @unique — el
// propio create sirve de ancla de idempotencia Y de guard anti-doble-rotura
// a la vez (memory/convenciones.md, "Idempotencia por id de cliente": "Si
// el modelo ya tiene un campo @unique que el formulario llena siempre... no
// hace falta agregar un id de cliente").
export function romperPaquete(params: {
  paqueteId: string;
  pesoExtraido: number;
  origenes: OrigenUnidad[]; // PaqueteOrigen real, releído fresco por la Server Action antes de entrar
  usuarioId: string;
  ahora: Date;
}) {
  const { porciones, unidadesSinLote, unidadesDevueltas } = repartirDevolucion(
    params.origenes,
    UNIDADES_POR_PAQUETE,
  );

  return prisma.$transaction(async (tx) => {
    const rotura = await tx.roturaPaquete.create({
      data: {
        paqueteId: params.paqueteId,
        pesoExtraido: params.pesoExtraido,
        unidadesExtraidas: UNIDADES_POR_PAQUETE,
        unidadesDevueltas,
        creadoEn: params.ahora,
      },
    });

    const actualizado = await tx.paquete.updateMany({
      where: { id: params.paqueteId, estado: "DISPONIBLE" },
      data: { estado: "ROTO" },
    });
    if (actualizado.count !== 1) {
      throw new PaqueteNoDisponibleError();
    }

    // Secuencial, no Promise.all — una transacción interactiva comparte una
    // sola conexión (mismo criterio que registrarRecoleccion/consolidarSueltos).
    for (const porcion of porciones) {
      await tx.inventarioSueltos.upsert({
        where: { galponId_loteId: { galponId: porcion.galponId, loteId: porcion.loteId } },
        create: { galponId: porcion.galponId, loteId: porcion.loteId, cantidad: porcion.cantidad },
        update: { cantidad: { increment: porcion.cantidad } },
      });
      await tx.movimientoSueltos.create({
        data: {
          galponId: porcion.galponId,
          loteId: porcion.loteId,
          tipo: "ROTURA_PAQUETE_ENTRADA",
          cantidad: porcion.cantidad,
          referenciaId: rotura.id,
          usuarioId: params.usuarioId,
          creadoEn: params.ahora,
        },
      });
    }

    return { rotura, unidadesSinLote };
  });
}

// Usada por la Server Action en la rama de P2002 (reintento idempotente o
// carrera real — distinguidos comparando pesoExtraido, ver plan.md).
export function buscarRoturaPaquetePorPaqueteId(paqueteId: string) {
  return prisma.roturaPaquete.findUnique({ where: { paqueteId } });
}

// PaqueteOrigen es inmutable una vez creado (ningún repository lo actualiza
// después de registrarRecoleccion/consolidarSueltos) — seguro leerlo unos
// milisegundos antes de entrar a la transacción.
export function buscarPaqueteOrigenesPorPaqueteId(paqueteId: string) {
  return prisma.paqueteOrigen.findMany({ where: { paqueteId } });
}

export function buscarPaquetePorId(id: string) {
  return prisma.paquete.findUnique({ where: { id } });
}

// romperBandeja — mismo patrón exacto que romperPaquete (novena transacción
// interactiva del proyecto), mirror completo con RoturaBandeja,
// ROTURA_BANDEJA_ENTRADA y UNIDADES_POR_BANDEJA.
export function romperBandeja(params: {
  bandejaId: string;
  pesoExtraido: number;
  origenes: OrigenUnidad[]; // BandejaOrigen real, releído fresco por la Server Action antes de entrar
  usuarioId: string;
  ahora: Date;
}) {
  const { porciones, unidadesSinLote, unidadesDevueltas } = repartirDevolucion(
    params.origenes,
    UNIDADES_POR_BANDEJA,
  );

  return prisma.$transaction(async (tx) => {
    const rotura = await tx.roturaBandeja.create({
      data: {
        bandejaId: params.bandejaId,
        pesoExtraido: params.pesoExtraido,
        unidadesExtraidas: UNIDADES_POR_BANDEJA,
        unidadesDevueltas,
        creadoEn: params.ahora,
      },
    });

    const actualizado = await tx.bandejaSuelta.updateMany({
      where: { id: params.bandejaId, estado: "DISPONIBLE" },
      data: { estado: "ROTO" },
    });
    if (actualizado.count !== 1) {
      throw new BandejaNoDisponibleError();
    }

    for (const porcion of porciones) {
      await tx.inventarioSueltos.upsert({
        where: { galponId_loteId: { galponId: porcion.galponId, loteId: porcion.loteId } },
        create: { galponId: porcion.galponId, loteId: porcion.loteId, cantidad: porcion.cantidad },
        update: { cantidad: { increment: porcion.cantidad } },
      });
      await tx.movimientoSueltos.create({
        data: {
          galponId: porcion.galponId,
          loteId: porcion.loteId,
          tipo: "ROTURA_BANDEJA_ENTRADA",
          cantidad: porcion.cantidad,
          referenciaId: rotura.id,
          usuarioId: params.usuarioId,
          creadoEn: params.ahora,
        },
      });
    }

    return { rotura, unidadesSinLote };
  });
}

export function buscarRoturaBandejaPorBandejaId(bandejaId: string) {
  return prisma.roturaBandeja.findUnique({ where: { bandejaId } });
}

export function buscarBandejaOrigenesPorBandejaId(bandejaId: string) {
  return prisma.bandejaOrigen.findMany({ where: { bandejaId } });
}

export function buscarBandejaPorId(id: string) {
  return prisma.bandejaSuelta.findUnique({ where: { id } });
}
