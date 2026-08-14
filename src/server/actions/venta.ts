"use server";

import { Prisma } from "@prisma/client";

import { cerrarVentaSchema } from "@/lib/zod/venta";
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
import { calcularBrutoVenta, calcularTotalCobrado, validarDescuento } from "@/server/services/venta";

// Mismo helper que usuario.ts/lote.ts/galpon.ts/recoleccion.ts/cliente.ts/precioKilo.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Idempotencia por id de cliente (mismo patrón que crearCliente/crearGalpon):
// Venta no tiene ningún campo @unique. Ninguna rama lleva `rol` — abierta a
// GERENTE y OPERARIO (decisión de negocio 2, spec.md).
export const cerrarVentaAction = withAuth(
  { schema: cerrarVentaSchema, entidad: "Venta", accion: "CREAR" },
  async (input, ctx) => {
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
      throw new AccionError("Uno o más ítems del carrito ya no existen — actualiza el selector.");
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
      // "" es un sentinel defensivo, nunca real este sprint: todo
      // DetalleVenta de PAQUETE/BANDEJA siempre tiene paqueteId o bandejaId
      // seteado (SUELTO, el único caso con los dos en null, no se puebla
      // hasta Sprint 10).
      const idsExistentes = new Set(existente.detalles.map((detalle) => detalle.paqueteId ?? detalle.bandejaId ?? ""));
      const idsInput = new Set(input.items.map((item) => item.id));
      const mismosItems =
        idsExistentes.size === idsInput.size && [...idsExistentes].every((id) => idsInput.has(id));
      const coincide =
        existente.clienteId === input.clienteId &&
        existente.metodoPago === input.metodoPago &&
        Number(existente.descuento) === input.descuento &&
        mismosItems;
      if (!coincide) {
        throw new AccionError(
          "Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.",
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
      data: {
        id: venta.id,
        fecha: venta.fecha.toISOString(),
        clienteNombre: venta.cliente.nombre,
        vendedorNombre: venta.usuario.nombre,
        totalCobrado: Number(venta.totalCobrado),
        descuento: Number(venta.descuento),
        metodoPago: venta.metodoPago,
        items: venta.detalles.map((detalle) => ({
          tipo: detalle.tipo as "PAQUETE" | "BANDEJA",
          pesoKg: Number(detalle.pesoKg),
          precioKiloAplicado: Number(detalle.precioKiloAplicado),
          subtotal: Number(detalle.subtotal),
        })),
      },
      entidadId: venta.id,
      estadoDespues: {
        clienteId: venta.clienteId,
        totalCobrado: Number(venta.totalCobrado),
        metodoPago: venta.metodoPago,
        cantidadItems: venta.detalles.length,
      },
    };
  },
);
