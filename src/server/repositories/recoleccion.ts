import { prisma } from "@/lib/prisma";
import { UNIDADES_POR_PAQUETE } from "@/lib/constants";

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
// paquetes ya creados sin volver a ejecutar la transacción.
export function buscarRecoleccionConPaquetesPorId(id: string) {
  return prisma.registroRecoleccion.findUnique({
    where: { id },
    include: { paquetes: true },
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
      paquetes: { select: { id: true } },
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
