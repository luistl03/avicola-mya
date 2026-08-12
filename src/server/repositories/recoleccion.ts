import { prisma } from "@/lib/prisma";
import { UNIDADES_POR_PAQUETE } from "@/lib/constants";

// Errores "esperados" de la transacción de reversión (Sprint 6), lanzados
// dentro de prisma.$transaction para forzar el rollback completo. No son
// AccionError: este archivo es un repository (ADR-000, no conoce
// server/auth/with-auth.ts) — la action los atrapa y los traduce al
// mensaje que ve el usuario. Mismo criterio que AvesInsuficientesError/
// YaRevertidoError de server/repositories/mortalidad.ts.
export class YaRevertidoError extends Error {}
export class PaquetesNoDisponiblesError extends Error {}
export class SaldoInsuficienteError extends Error {}

// Tercera transacción interactiva del proyecto (después de las dos de
// server/repositories/mortalidad.ts, Sprint 4) — mismo `prisma.$transaction
// (async (tx) => {...})`, no el array-form, porque esta es la primera vez
// que hace falta más de un `create` en cascada real: el padre
// (RegistroRecoleccion) más N Paquete (con su PaqueteOrigen anidado) más,
// condicionalmente, un upsert de InventarioSueltos y un MovimientoSueltos.
//
// Los `pesos.length` paquetes se crean en un `for` secuencial (`await`
// uno por uno), NO con `Promise.all` — Prisma documenta que las queries
// concurrentes dentro de una misma transacción interactiva comparten una
// sola conexión, así que ejecutarlas en paralelo es inseguro (puede
// romper contra el pooler de Neon, el mismo pooler que ya dio problemas
// reales en Sprint 0/1, ver memory/estado-proyecto.md, P1017).
//
// `sueltos` y la validación de `pesos.length` contra
// calcularEmpaque(cantidadTotal) los resuelve quien llama (la Server
// Action, server/actions/recoleccion.ts) — este repository no importa
// server/services/recoleccion.ts a propósito: un repository es la capa
// más baja de la arquitectura (ADR-000), no depende hacia arriba de la
// capa de servicios.
//
// Idempotencia por id de cliente: este `create` del padre puede fallar
// con P2002 si `input.id` ya existe (reintento offline-ready — mala
// señal, doble tap). Ese catch NO vive acá: mismo criterio que
// crearUsuario/crearGalpon (server/actions/usuario.ts, lote.ts), que ya
// atrapan P2002 en la capa de action, no en el repository — porque
// decidir "esto es un reintento válido, devolvé lo que ya existe" o "esto
// es una colisión real, es un error" requiere comparar cantidadTotal
// contra lo ya persistido, una decisión de la action, no del repository.
// Ver buscarRecoleccionConPaquetesPorId más abajo, que la action usa para
// esa comparación.
export function registrarRecoleccion(input: {
  id: string;
  loteId: string;
  galponId: string;
  usuarioId: string;
  cantidadTotal: number;
  creadoEnCliente: Date;
  pesos: number[];
  sueltos: number;
  ahora: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const registro = await tx.registroRecoleccion.create({
      data: {
        id: input.id,
        loteId: input.loteId,
        galponId: input.galponId,
        usuarioId: input.usuarioId,
        cantidadTotal: input.cantidadTotal,
        creadoEnCliente: input.creadoEnCliente,
        creadoEn: input.ahora,
      },
    });

    const paquetes = [];
    for (const peso of input.pesos) {
      // origenes anidado en el mismo create: un paquete PURO de este
      // sprint siempre tiene un único origen (el galpón de la
      // recolección) — MIXTO (multi-origen) es Sprint 7, no hace falta
      // un create separado de PaqueteOrigen para el caso de este sprint.
      const paquete = await tx.paquete.create({
        data: {
          peso,
          tipo: "PURO",
          registroRecoleccionId: registro.id,
          origenes: { create: { galponId: input.galponId, cantidad: UNIDADES_POR_PAQUETE } },
        },
      });
      paquetes.push(paquete);
    }

    // Si sueltos === 0 (total múltiplo exacto de UNIDADES_POR_PAQUETE),
    // no se toca InventarioSueltos ni se crea MovimientoSueltos — evita
    // ruido en el ledger (decisión de diseño confirmada en spec.md).
    if (input.sueltos > 0) {
      await tx.inventarioSueltos.upsert({
        where: { galponId_loteId: { galponId: input.galponId, loteId: input.loteId } },
        create: { galponId: input.galponId, loteId: input.loteId, cantidad: input.sueltos },
        update: { cantidad: { increment: input.sueltos } },
      });
      await tx.movimientoSueltos.create({
        data: {
          galponId: input.galponId,
          loteId: input.loteId,
          tipo: "RECOLECCION",
          cantidad: input.sueltos,
          referenciaId: registro.id,
          usuarioId: input.usuarioId,
          creadoEn: input.ahora,
        },
      });
    }

    return { registro, paquetes };
  });
}

// Usada por la Server Action solo en la rama de P2002 (reintento
// idempotente) para comparar el `cantidadTotal` ya persistido contra el
// del payload reenviado, y para poder responder con la cantidad real de
// paquetes ya creados sin volver a ejecutar la transacción. Reusada
// también por revertirRecoleccionAction (Sprint 6) para leer el registro
// completo (con paquetes) antes de revertir.
export function buscarRecoleccionConPaquetesPorId(id: string) {
  return prisma.registroRecoleccion.findUnique({
    where: { id },
    include: { paquetes: true },
  });
}

// Cuarta transacción interactiva del proyecto (Sprint 6) — extiende el
// patrón de UPDATE condicional de server/repositories/mortalidad.ts
// (una sola fila) a un guard "todo o nada" sobre un CONJUNTO de filas
// (Paquete), pieza nueva de arquitectura. Tres guards atómicos en orden,
// cualquiera que falle aborta la transacción COMPLETA (incluidos los
// pasos ya aplicados antes de él — Prisma revierte todo ante una
// excepción):
//
// 1) "Ya revertido" — UPDATE condicional sobre RegistroRecoleccion
//    (WHERE revertido = false), mismo patrón exacto que
//    revertirMortalidad. Se chequea primero por ser el guard más barato
//    y el que más frecuentemente falla en la práctica (doble clic).
// 2) "Todo o nada" sobre Paquete — el total se cuenta DENTRO de esta
//    misma transacción (no antes, no en la Server Action) para que la
//    comparación sea consistente con el propio UPDATE de abajo. Se
//    intenta anular TODOS los Paquete de este registro que sigan
//    DISPONIBLE; si la cantidad de filas afectadas no coincide con el
//    total, algún Paquete ya se vendió/rompió justo en el medio (la
//    carrera real que pide el roadmap) — aborta.
// 3) Saldo suficiente sobre InventarioSueltos — mismo patrón UPDATE
//    condicional que avesVivas en Mortalidad, no un decrement a ciegas
//    que dependa del CHECK (cantidad >= 0) de la base (S0-5).
//
// `sueltos` lo recalcula quien llama (la Server Action, vía
// calcularEmpaque(registro.cantidadTotal)) — este repository no importa
// server/services/recoleccion.ts, mismo criterio de ADR-000 que
// registrarRecoleccion ya sigue arriba.
export function revertirRecoleccion(params: {
  id: string;
  galponId: string;
  loteId: string;
  sueltos: number;
  usuarioId: string;
  ahora: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const marcado = await tx.registroRecoleccion.updateMany({
      where: { id: params.id, revertido: false },
      data: { revertido: true, revertidoEn: params.ahora },
    });
    if (marcado.count === 0) {
      throw new YaRevertidoError();
    }

    const totalPaquetes = await tx.paquete.count({
      where: { registroRecoleccionId: params.id },
    });
    if (totalPaquetes > 0) {
      const anulados = await tx.paquete.updateMany({
        where: { registroRecoleccionId: params.id, estado: "DISPONIBLE" },
        data: { estado: "ANULADO" },
      });
      if (anulados.count !== totalPaquetes) {
        throw new PaquetesNoDisponiblesError();
      }
    }

    if (params.sueltos > 0) {
      const descontado = await tx.inventarioSueltos.updateMany({
        where: {
          galponId: params.galponId,
          loteId: params.loteId,
          cantidad: { gte: params.sueltos },
        },
        data: { cantidad: { decrement: params.sueltos } },
      });
      if (descontado.count === 0) {
        throw new SaldoInsuficienteError();
      }

      await tx.movimientoSueltos.create({
        data: {
          galponId: params.galponId,
          loteId: params.loteId,
          tipo: "REVERSION",
          cantidad: params.sueltos,
          referenciaId: params.id,
          usuarioId: params.usuarioId,
          creadoEn: params.ahora,
        },
      });
    }
  });
}

// Para la tabla de /recoleccion: una sola query con include (no N+1),
// mismo criterio que listarRegistrosMortalidad. No es "...Pagina" (esa
// terminación queda reservada para paginación por cursor tipo muro
// cronológico, ver memory/convenciones.md) — Recolección es una tabla de
// gestión con paginación por página (skip/take vía URL), igual que
// Mortalidad. Filtros (post-Sprint 5): mismo criterio que
// listarRegistrosMortalidad/listarBitacoraPagina — undefined se omite del
// where.
export function listarRecolecciones(params: {
  skip: number;
  take: number;
  loteId?: string;
  desde?: Date;
  hasta?: Date;
}) {
  return prisma.registroRecoleccion.findMany({
    where: {
      loteId: params.loteId,
      creadoEn: { gte: params.desde, lte: params.hasta },
    },
    orderBy: { creadoEn: "desc" },
    skip: params.skip,
    take: params.take,
    include: {
      lote: { select: { codigo: true } },
      galpon: { select: { nombre: true } },
      usuario: { select: { nombre: true } },
      // estado agregado en Sprint 6: RecoleccionesTabla lo necesita para
      // saber si algún Paquete ya no está DISPONIBLE (vendido/roto) y así
      // ocultar el botón "Deshacer" de forma consistente con la guard
      // real del servidor (puedeRevertirRecoleccion), en vez de mostrar
      // un botón que siempre va a ser rechazado al hacer clic.
      paquetes: { select: { id: true, estado: true } },
    },
  });
}

export function contarRecolecciones(
  params: { loteId?: string; desde?: Date; hasta?: Date } = {},
) {
  return prisma.registroRecoleccion.count({
    where: {
      loteId: params.loteId,
      creadoEn: { gte: params.desde, lte: params.hasta },
    },
  });
}
