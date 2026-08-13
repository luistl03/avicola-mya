import { prisma } from "@/lib/prisma";
import { UNIDADES_POR_BANDEJA, UNIDADES_POR_PAQUETE } from "@/lib/constants";

// Lanzado dentro de la transacción de consolidarSueltos para forzar el
// rollback cuando el saldo real de al menos un origen no alcanza — no es
// un AccionError (ADR-000, este archivo no conoce
// server/auth/with-auth.ts), la Server Action lo traduce.
export class SaldoInsuficienteConsolidacionError extends Error {}

type PorcionOrigen = { galponId: string; loteId: string; cantidad: number };

// Sexta transacción interactiva del proyecto — combina el patrón de
// "create padre con id de cliente al frente" (registrarRecoleccion,
// Sprint 5) con el guard "todo o nada" agregado (revertirRecoleccion,
// Sprint 6, extendido acá de N filas de Paquete con la MISMA condición a N
// filas de InventarioSueltos con cantidades DISTINTAS por fila, según
// cuánto necesita cada origen en total).
//
// `unidades` ya viene calculado por quien llama (la Server Action, vía
// calcularConsolidacion() de server/services/consolidacion.ts) — este
// repository no importa esa función a propósito, mismo criterio de
// ADR-000 que registrarRecoleccion/revertirRecoleccion ya siguen (un
// repository es la capa más baja de la arquitectura, no depende hacia
// arriba de la capa de servicios).
export function consolidarSueltos(params: {
  id: string; // RegistroConsolidacion.id, generado en el cliente
  tipo: "PAQUETE_MIXTO" | "BANDEJA";
  unidades: { peso: number; origenes: PorcionOrigen[] }[];
  usuarioId: string;
  creadoEnCliente: Date;
  ahora: Date;
}) {
  const cantidadUnidadesFormadas = params.unidades.length;
  const unidadDestino = params.tipo === "PAQUETE_MIXTO" ? UNIDADES_POR_PAQUETE : UNIDADES_POR_BANDEJA;

  return prisma.$transaction(async (tx) => {
    // 1) Ancla de idempotencia — si params.id ya existe, P2002 acá aborta
    //    TODO antes de tocar InventarioSueltos/Paquete/BandejaSuelta.
    const registro = await tx.registroConsolidacion.create({
      data: {
        id: params.id,
        tipo: params.tipo,
        usuarioId: params.usuarioId,
        creadoEnCliente: params.creadoEnCliente,
        creadoEn: params.ahora,
        cantidadUnidadesFormadas,
        cantidadConsolidada: cantidadUnidadesFormadas * unidadDestino,
      },
    });

    // 2) Agregar cuánto necesita CADA origen distinto, sumando a través de
    //    todas las unidades — un mismo origen puede aparecer en varias
    //    (decisión de negocio confirmada, ver spec.md).
    const necesarioPorOrigen = new Map<string, PorcionOrigen>();
    for (const unidad of params.unidades) {
      for (const porcion of unidad.origenes) {
        const clave = `${porcion.galponId}:${porcion.loteId}`;
        const previo = necesarioPorOrigen.get(clave);
        necesarioPorOrigen.set(clave, {
          galponId: porcion.galponId,
          loteId: porcion.loteId,
          cantidad: (previo?.cantidad ?? 0) + porcion.cantidad,
        });
      }
    }

    // 3) Guard todo o nada: un UPDATE condicional por origen distinto
    //    (secuencial, no Promise.all — mismo motivo que
    //    registrarRecoleccion: una transacción interactiva comparte una
    //    sola conexión). Si la cantidad de filas afectadas no coincide con
    //    la cantidad de orígenes distintos, al menos uno no alcanzó —
    //    aborta TODO (incluido el create del paso 1).
    let filasAfectadas = 0;
    for (const { galponId, loteId, cantidad } of necesarioPorOrigen.values()) {
      const resultado = await tx.inventarioSueltos.updateMany({
        where: { galponId, loteId, cantidad: { gte: cantidad } },
        data: { cantidad: { decrement: cantidad } },
      });
      filasAfectadas += resultado.count;
    }
    if (filasAfectadas !== necesarioPorOrigen.size) {
      throw new SaldoInsuficienteConsolidacionError();
    }

    // 4) Ledger: un MovimientoSueltos CONSOLIDACION_SALIDA por origen
    //    distinto (no por unidad de destino) — mismo criterio de "sin
    //    ruido redundante en el ledger" que Sprint 5/6 ya establecieron.
    for (const { galponId, loteId, cantidad } of necesarioPorOrigen.values()) {
      await tx.movimientoSueltos.create({
        data: {
          galponId,
          loteId,
          tipo: "CONSOLIDACION_SALIDA",
          cantidad,
          referenciaId: registro.id,
          usuarioId: params.usuarioId,
          creadoEn: params.ahora,
        },
      });
    }

    // 5) Crear las unidades de destino con su detalle de origen anidado —
    //    ids server-default (Prisma), NO client-generated: el reintento ya
    //    quedó bloqueado en el paso 1 (P2002 del padre), así que no hace
    //    falta que estos hijos también sean idempotentes por separado,
    //    mismo criterio que los N Paquete de registrarRecoleccion.
    const paquetes = [];
    const bandejas = [];
    for (const unidad of params.unidades) {
      if (params.tipo === "PAQUETE_MIXTO") {
        const paquete = await tx.paquete.create({
          data: {
            peso: unidad.peso,
            tipo: "MIXTO",
            registroConsolidacionId: registro.id,
            origenes: {
              create: unidad.origenes.map((o) => ({
                galponId: o.galponId,
                loteId: o.loteId,
                cantidad: o.cantidad,
              })),
            },
          },
        });
        paquetes.push(paquete);
      } else {
        const bandeja = await tx.bandejaSuelta.create({
          data: {
            peso: unidad.peso,
            registroConsolidacionId: registro.id,
            origenes: {
              create: unidad.origenes.map((o) => ({
                galponId: o.galponId,
                loteId: o.loteId,
                cantidad: o.cantidad,
              })),
            },
          },
        });
        bandejas.push(bandeja);
      }
    }

    return { registro, creadas: params.tipo === "PAQUETE_MIXTO" ? paquetes : bandejas };
  });
}

// Usada por la Server Action en la rama de P2002 (reintento idempotente)
// para comparar cantidadUnidadesFormadas contra el plan recalculado, y
// para devolver las unidades ya creadas sin re-ejecutar la transacción —
// mismo criterio que buscarRecoleccionConPaquetesPorId.
export function buscarRegistroConsolidacionConUnidadesPorId(id: string) {
  return prisma.registroConsolidacion.findUnique({
    where: { id },
    include: { paquetes: true, bandejas: true },
  });
}
