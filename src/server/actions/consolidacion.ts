"use server";

import { Prisma } from "@prisma/client";

import { UNIDADES_POR_BANDEJA, UNIDADES_POR_PAQUETE } from "@/lib/constants";
import { consolidarSueltosSchema, type ConsolidarSueltosInput } from "@/lib/zod/consolidacion";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { listarInventarioSueltosConSaldo } from "@/server/repositories/inventario";
import {
  buscarRegistroConsolidacionConUnidadesPorId,
  consolidarSueltos,
  SaldoInsuficienteConsolidacionError,
} from "@/server/repositories/consolidacion";
import { calcularConsolidacion } from "@/server/services/consolidacion";

type Tipo = "PAQUETE_MIXTO" | "BANDEJA";

// Mismo criterio que server/actions/recoleccion.ts/inventario.ts: P2002 se
// atrapa acá, en la capa de action, no en el repository.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function etiquetaUnidad(tipo: Tipo): string {
  return tipo === "PAQUETE_MIXTO" ? "paquete" : "bandeja";
}

// Compartida por las dos Server Actions de abajo — la única diferencia
// real entre "Paquete Mixto" y "Armar Bandeja" es `tipo`/`unidadDestino`,
// no vale la pena duplicar ~40 líneas idénticas (a diferencia de la UI,
// donde cada wizard sigue siendo un componente parametrizado propio, ver
// spec.md/plan.md).
async function ejecutarConsolidacion(
  input: ConsolidarSueltosInput,
  ctx: { usuarioId: string },
  tipo: Tipo,
) {
  const unidadDestino = tipo === "PAQUETE_MIXTO" ? UNIDADES_POR_PAQUETE : UNIDADES_POR_BANDEJA;

  // Nunca se confía en el saldo que el cliente leyó al abrir el wizard —
  // se relee InventarioSueltos fresco para los orígenes pedidos, mismo
  // criterio que registrarRecoleccion recalculando calcularEmpaque
  // server-side.
  const saldosReales = await listarInventarioSueltosConSaldo();
  const saldoPorClave = new Map(saldosReales.map((s) => [`${s.galponId}:${s.loteId}`, s.cantidad]));
  const origenesConSaldo = input.origenes.map((o) => ({
    galponId: o.galponId,
    loteId: o.loteId,
    disponible: saldoPorClave.get(`${o.galponId}:${o.loteId}`) ?? 0,
  }));

  // porcionesMax: TODAS las unidades completas que el saldo permitiría —
  // es un techo, no una orden. Corrección real post-diseño (probado en
  // vivo, decisión confirmada por el Product Owner): el operario elige
  // CUÁNTAS de esas unidades arma en esta corrida (mínimo 1, hasta el
  // techo, incremental o todas de una vez desde el wizard) — el servidor
  // solo valida que no pida más de las que el saldo permite, nunca exige
  // que pida exactamente el máximo.
  const { unidades: porcionesMax } = calcularConsolidacion(origenesConSaldo, unidadDestino);

  if (porcionesMax.length === 0) {
    // "complet" + o/a (no "completo" + a, que da "completoa") — concordancia
    // de género con paquete (masculino) / bandeja (femenino).
    const generoFemenino = tipo === "BANDEJA";
    throw new AccionError(
      `No hay saldo suficiente para formar al menos ${generoFemenino ? "una" : "un"} ${etiquetaUnidad(
        tipo,
      )} complet${generoFemenino ? "a" : "o"} (mínimo ${unidadDestino}).`,
    );
  }
  if (input.pesos.length > porcionesMax.length) {
    throw new AccionError(
      `Los saldos cambiaron — el máximo disponible ahora es ${porcionesMax.length}, se recibieron ${input.pesos.length} pesos. Actualizá la pantalla e intentá de nuevo.`,
    );
  }

  // Solo se consolidan las primeras input.pesos.length unidades del techo
  // — el resto (si el operario eligió formar menos que el máximo) queda
  // sin tocar, sigue siendo InventarioSueltos.
  const porciones = porcionesMax.slice(0, input.pesos.length);
  const totalConsolidado = porciones.length * unidadDestino;
  const unidades = porciones.map((origenes, i) => ({ peso: input.pesos[i], origenes }));
  const ahora = new Date();

  let resultado: { registro: { id: string }; creadas: unknown[] };
  try {
    resultado = await consolidarSueltos({
      id: input.id,
      tipo,
      unidades,
      usuarioId: ctx.usuarioId,
      creadoEnCliente: input.creadoEnCliente,
      ahora,
    });
  } catch (error) {
    if (error instanceof SaldoInsuficienteConsolidacionError) {
      throw new AccionError(
        "El saldo ya no alcanza para esta consolidación — actualizá la pantalla e intentá de nuevo.",
      );
    }
    if (!esErrorDeUnicidad(error)) {
      throw error;
    }

    // Reintento idempotente (doble clic, reintento de red) — mismo
    // patrón que registrarRecoleccion/ajustarInventarioSueltos: el id ya
    // existe, se devuelve lo ya persistido sin volver a tocar
    // InventarioSueltos/MovimientoSueltos/Paquete/BandejaSuelta.
    const existente = await buscarRegistroConsolidacionConUnidadesPorId(input.id);
    if (!existente) {
      // P2002 dijo que el id ya existe, pero esta lectura inmediata no lo
      // encuentra — no debería pasar nunca en la práctica, se deja
      // propagar el error original en vez de esconderlo.
      throw error;
    }
    if (existente.cantidadUnidadesFormadas !== porciones.length) {
      throw new AccionError(
        "Ya existe una consolidación con este id pero con datos diferentes — no se sobrescribe.",
      );
    }
    resultado = {
      registro: existente,
      creadas: tipo === "PAQUETE_MIXTO" ? existente.paquetes : existente.bandejas,
    };
  }

  return {
    data: { id: resultado.registro.id, unidadesCreadas: resultado.creadas.length, totalConsolidado },
    entidadId: resultado.registro.id,
    estadoDespues: {
      tipo,
      unidadesCreadas: resultado.creadas.length,
      totalConsolidado,
    },
  };
}

// Sin `rol`: GERENTE y OPERARIO pueden consolidar sueltos por igual
// (decisión de negocio confirmada en spec.md) — mismo criterio que
// registrarRecoleccion/registrarMortalidad.
export const consolidarPaqueteMixtoAction = withAuth(
  {
    schema: consolidarSueltosSchema,
    entidad: "RegistroConsolidacion",
    accion: "CONSOLIDAR_PAQUETE_MIXTO",
  },
  (input, ctx) => ejecutarConsolidacion(input, ctx, "PAQUETE_MIXTO"),
);

export const consolidarBandejaAction = withAuth(
  {
    schema: consolidarSueltosSchema,
    entidad: "RegistroConsolidacion",
    accion: "CONSOLIDAR_BANDEJA",
  },
  (input, ctx) => ejecutarConsolidacion(input, ctx, "BANDEJA"),
);
