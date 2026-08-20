"use server";

import { Prisma } from "@prisma/client";

import { CLIENTE_PUBLICO_GENERAL_ID } from "@/lib/constants";
import { idUuid } from "@/lib/zod/comun";
import { cerrarVentaSchema } from "@/lib/zod/venta";
import { auth } from "@/server/auth";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { obtenerPrecioKiloVigente } from "@/server/repositories/precioKilo";
import {
  buscarBandejasNoDisponiblesEntreIds,
  buscarBandejasPorIds,
  buscarPaquetesNoDisponiblesEntreIds,
  buscarPaquetesPorIds,
  buscarVentaConDetallesPorId,
  cerrarVenta as cerrarVentaRepo,
  ItemsNoDisponiblesError,
} from "@/server/repositories/venta";
import {
  calcularBrutoVenta,
  calcularMontoCredito,
  calcularTotalCobrado,
  validarDescuento,
  validarMontoContado,
} from "@/server/services/venta";

// Mismo helper que usuario.ts/lote.ts/galpon.ts/recoleccion.ts/cliente.ts/precioKilo.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Forma exacta que espera ComprobanteDialog (VentaCerradaData) — extraída
// acá porque la necesitan dos consumidores: cerrarVentaAction (venta recién
// cerrada) y obtenerDetalleVentaAction (reabrir el comprobante de una venta
// vieja desde /ventas, "Ver detalle"). Mismo include en ambos casos
// (INCLUDE_COMPROBANTE, server/repositories/venta.ts), así que el shape de
// entrada es siempre el mismo.
function aVentaCerradaData(venta: NonNullable<Awaited<ReturnType<typeof buscarVentaConDetallesPorId>>>) {
  return {
    id: venta.id,
    fecha: venta.fecha.toISOString(),
    clienteNombre: venta.cliente.nombre,
    vendedorNombre: venta.usuario.nombre,
    totalCobrado: Number(venta.totalCobrado),
    descuento: Number(venta.descuento),
    metodoPago: venta.metodoPago,
    esCredito: venta.credito !== null,
    montoContado: Number(venta.montoContado),
    montoCredito: venta.montoCredito !== null ? Number(venta.montoCredito) : null,
    fechaLimiteCredito: venta.credito?.fechaLimite.toISOString() ?? null,
    // montoPagado ya viene actualizado atómicamente por registrarAbono
    // (repositories/credito.ts) — nunca se recalcula sumando el historial
    // acá, para no arrastrar diferencias de redondeo entre dos fuentes de
    // verdad. 0 (no null) en una venta recién cerrada, igual que
    // Credito.montoPagado en el schema.
    montoPagado: venta.credito ? Number(venta.credito.montoPagado) : null,
    // Historial de abonos posteriores a la venta (vacío en una venta recién
    // cerrada, poblado al reabrir el detalle desde /ventas) — ver
    // INCLUDE_COMPROBANTE en repositories/venta.ts.
    abonos: (venta.credito?.abonos ?? []).map((abono) => ({
      id: abono.id,
      fecha: abono.fecha.toISOString(),
      monto: Number(abono.monto),
      metodoPago: abono.metodoPago,
    })),
    items: venta.detalles.map((detalle) => ({
      // "" es un sentinel defensivo, nunca real (la granja no vende huevo
      // por unidad — confirmado con el Product Owner, Sprint 10).
      tipo: detalle.tipo as "PAQUETE" | "BANDEJA",
      pesoKg: Number(detalle.pesoKg),
      precioKiloAplicado: Number(detalle.precioKiloAplicado),
      subtotal: Number(detalle.subtotal),
    })),
  };
}

// Idempotencia por id de cliente (mismo patrón que crearCliente/crearGalpon):
// Venta no tiene ningún campo @unique. Ninguna rama lleva `rol` — abierta a
// GERENTE y OPERARIO (decisión de negocio 2, spec.md).
export const cerrarVentaAction = withAuth(
  { schema: cerrarVentaSchema, entidad: "Venta", accion: "CREAR" },
  async (input, ctx) => {
    // Guard nuevo, antes de cualquier otro cálculo: Público General nunca
    // recibe crédito (H2, spec.md) — rechazo del lado del servidor, no
    // solo un toggle deshabilitado en la UI.
    if (input.esCredito && input.clienteId === CLIENTE_PUBLICO_GENERAL_ID) {
      throw new AccionError("No se puede vender a crédito a Público General.");
    }

    const precioVigente = await obtenerPrecioKiloVigente();
    if (!precioVigente) {
      throw new AccionError("No hay ningún precio por kilo configurado.");
    }
    const precio = Number(precioVigente.precio);

    // Releer el peso REAL de cada ítem — nunca se confía en nada que no
    // sea el id del payload (H2, último Gherkin, spec.md).
    const paqueteIds = input.items.filter((item) => item.tipo === "PAQUETE").map((item) => item.id);
    const bandejaIds = input.items.filter((item) => item.tipo === "BANDEJA").map((item) => item.id);
    const [paquetes, bandejas] = await Promise.all([
      paqueteIds.length > 0 ? buscarPaquetesPorIds(paqueteIds) : Promise.resolve([]),
      bandejaIds.length > 0 ? buscarBandejasPorIds(bandejaIds) : Promise.resolve([]),
    ]);
    if (paquetes.length !== paqueteIds.length || bandejas.length !== bandejaIds.length) {
      throw new AccionError("Uno o más ítems del carrito ya no existen - actualiza el selector.");
    }

    const pesoPorId = new Map<string, number>([
      ...paquetes.map((paquete): [string, number] => [paquete.id, Number(paquete.peso)]),
      ...bandejas.map((bandeja): [string, number] => [bandeja.id, Number(bandeja.peso)]),
    ]);
    const bruto = calcularBrutoVenta(
      input.items.map((item) => pesoPorId.get(item.id)!),
      precio,
    );

    if (!validarDescuento(bruto, input.descuento)) {
      throw new AccionError("El descuento no puede superar el total de la venta.");
    }
    const totalCobrado = calcularTotalCobrado(bruto, input.descuento);

    // Sprint 11 — venta a crédito (total o parcial). credito queda
    // undefined cuando esCredito es false, comportamiento 100% idéntico a
    // Sprint 9 (montoContado = totalCobrado, montoCredito: null).
    let credito: { montoContado: number; montoCredito: number; fechaLimite: Date } | undefined;
    if (input.esCredito) {
      if (!validarMontoContado(totalCobrado, input.montoContado!)) {
        throw new AccionError("El monto al contado no puede superar el total de la venta.");
      }
      credito = {
        montoContado: input.montoContado!,
        montoCredito: calcularMontoCredito(totalCobrado, input.montoContado!),
        fechaLimite: input.fechaLimiteCredito!,
      };
    }

    const items = input.items.map((item) => {
      const pesoKg = pesoPorId.get(item.id)!;
      const subtotal = Math.round(pesoKg * precio * 100) / 100;
      return { tipo: item.tipo, id: item.id, pesoKg, precioKiloAplicado: precio, subtotal };
    });

    let venta;
    try {
      venta = await cerrarVentaRepo({
        id: input.id,
        clienteId: input.clienteId,
        usuarioId: ctx.usuarioId,
        items,
        descuento: input.descuento,
        totalCobrado,
        metodoPago: input.metodoPago,
        ahora: new Date(),
        credito,
      });
    } catch (error) {
      if (error instanceof ItemsNoDisponiblesError) {
        // Diagnóstico best-effort FUERA de la transacción ya revertida (R5,
        // spec.md) — solo para armar un mensaje específico, no autoritativo.
        const [paquetesNoDisp, bandejasNoDisp] = await Promise.all([
          paqueteIds.length > 0 ? buscarPaquetesNoDisponiblesEntreIds(paqueteIds) : Promise.resolve([]),
          bandejaIds.length > 0 ? buscarBandejasNoDisponiblesEntreIds(bandejaIds) : Promise.resolve([]),
        ]);
        const ids = [...paquetesNoDisp, ...bandejasNoDisp].map((item) => item.id).join(", ");
        throw new AccionError(`Estos ítems ya no están disponibles: ${ids}. Actualiza el carrito.`);
      }
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarVentaConDetallesPorId(input.id);
      if (!existente) {
        throw error;
      }
      // "" es un sentinel defensivo, nunca real (la granja no vende huevo
      // por unidad — confirmado con el Product Owner, Sprint 10 — así que
      // todo DetalleVenta siempre tiene paqueteId o bandejaId seteado).
      const idsExistentes = new Set(existente.detalles.map((detalle) => detalle.paqueteId ?? detalle.bandejaId ?? ""));
      const idsInput = new Set(input.items.map((item) => item.id));
      const mismosItems =
        idsExistentes.size === idsInput.size && [...idsExistentes].every((id) => idsInput.has(id));
      // Sprint 11 — un reintento con esCredito/montoContado distinto al
      // ya persistido tampoco es un reintento idempotente legítimo.
      const montoContadoExistente = existente.montoContado !== null ? Number(existente.montoContado) : null;
      const montoContadoEsperado = input.esCredito ? input.montoContado! : totalCobrado;
      const coincide =
        existente.clienteId === input.clienteId &&
        existente.metodoPago === input.metodoPago &&
        Number(existente.descuento) === input.descuento &&
        mismosItems &&
        (existente.credito !== null) === input.esCredito &&
        montoContadoExistente === montoContadoEsperado;
      if (!coincide) {
        throw new AccionError(
          "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
        );
      }
      venta = existente;
    }

    return {
      // Datos completos para el comprobante (H6, spec.md) — todo lo que
      // ComprobanteDialog necesita viaja en la respuesta de la propia
      // action, sin una query aparte del cliente. Nunca se arma con el
      // estado del carrito en memoria: cliente/vendedor/items/totales acá
      // son los que quedaron REALMENTE persistidos (via el include de
      // cliente/usuario agregado a cerrarVenta/buscarVentaConDetallesPorId).
      data: aVentaCerradaData(venta),
      entidadId: venta.id,
      estadoDespues: {
        clienteId: venta.clienteId,
        totalCobrado: Number(venta.totalCobrado),
        metodoPago: venta.metodoPago,
        cantidadItems: venta.detalles.length,
        esCredito: venta.credito !== null,
      },
    };
  },
);

// Lectura, no mutación → NO pasa por withAuth (mismo criterio que
// buscarClientesAutocompleteAction/obtenerEstadoCuentaAction,
// server/actions/cliente.ts): no hay una única entidad mutada que
// auditar. Verifica sesión a mano con auth(). "Ver detalle" en /ventas —
// reabre el comprobante de una venta ya cerrada, con la misma forma que
// devuelve cerrarVentaAction (ComprobanteDialog reusado tal cual, sin
// duplicar el componente).
export async function obtenerDetalleVentaAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "No autenticado." };
  }
  if (!idUuid().safeParse(id).success) {
    return { ok: false as const, error: "Venta inválida." };
  }

  const venta = await buscarVentaConDetallesPorId(id);
  if (!venta) {
    return { ok: false as const, error: "La venta no existe." };
  }

  return { ok: true as const, data: aVentaCerradaData(venta) };
}
