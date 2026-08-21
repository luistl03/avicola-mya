import { expect, test } from "@playwright/test";

import { borrarUsuarioPrueba, crearUsuarioPrueba, login, prisma, PREFIJO_E2E } from "./helpers";

let gerente: Awaited<ReturnType<typeof crearUsuarioPrueba>>;
let clienteId: string;
let clienteNombre: string;
let paqueteId: string;
let ventaId: string | undefined;

const PESO_PAQUETE_PRUEBA = 8.888;

test.beforeAll(async () => {
  gerente = await crearUsuarioPrueba("GERENTE");
  clienteNombre = `${PREFIJO_E2E} Cliente ${crypto.randomUUID().slice(0, 8)}`;
  const cliente = await prisma.cliente.create({
    data: { id: crypto.randomUUID(), nombre: clienteNombre, tipo: "MINORISTA", estado: "ACTIVO" },
  });
  clienteId = cliente.id;
  const paquete = await prisma.paquete.create({
    data: { id: crypto.randomUUID(), peso: PESO_PAQUETE_PRUEBA, tipo: "PURO", estado: "DISPONIBLE" },
  });
  paqueteId = paquete.id;
});

test.afterAll(async () => {
  if (!ventaId) {
    const detalle = await prisma.detalleVenta.findFirst({ where: { paqueteId } });
    ventaId = detalle?.ventaId;
  }
  if (ventaId) {
    // HistorialAbonos es onDelete: Cascade sobre Credito (schema.prisma) —
    // borrar el Credito ya se lleva sus abonos. Credito.ventaId es
    // onDelete: Restrict hacia Venta, así que el Credito se borra antes.
    await prisma.credito.deleteMany({ where: { ventaId } });
    await prisma.venta.delete({ where: { id: ventaId } }).catch(() => undefined);
  }
  await prisma.paquete.delete({ where: { id: paqueteId } }).catch(() => undefined);
  await prisma.cliente.delete({ where: { id: clienteId } }).catch(() => undefined);
  await borrarUsuarioPrueba(gerente.id);
});

test("cerrar una venta a crédito y registrar un abono actualiza el saldo pendiente", async ({ page }) => {
  await login(page, gerente.usuario, gerente.password);
  await page.goto("/pos");

  // Selecciona el cliente de prueba (reemplaza a "Público General",
  // preseleccionado por defecto) — venta a crédito exige un cliente real.
  await page.getByPlaceholder("Buscar otro cliente por nombre o celular...").fill(clienteNombre);
  await page.getByRole("button", { name: clienteNombre }).click();

  const filaPaquete = page.getByText(`${PESO_PAQUETE_PRUEBA.toFixed(3)} kg`).locator("..");
  await filaPaquete.getByRole("button", { name: "Agregar" }).click();

  await page.getByRole("checkbox", { name: "Venta a crédito" }).check();
  // Monto al contado 0 — venta 100% a crédito, sin método de pago que
  // elegir (H4, spec.md de Sprint 11: "método de pago" no aparece si no
  // se cobra nada ahora).
  await page.getByLabel("Monto al contado (S/, puede ser 0)").fill("0");

  await page.getByRole("button", { name: "Cerrar venta" }).click();
  await expect(
    page.locator('[data-slot="dialog-content"]').getByRole("heading", { name: "Venta cerrada" }),
  ).toBeVisible();

  const creditoCreado = await prisma.credito.findFirstOrThrow({ where: { clienteId } });
  expect(creditoCreado.estado).toBe("PENDIENTE");
  expect(Number(creditoCreado.montoPagado)).toBe(0);
  ventaId = creditoCreado.ventaId;

  // Cierra el comprobante para volver a /pos y navega a /creditos —
  // registrar el abono desde ahí (H2 spec.md: "Estado de cuenta por
  // cliente" es el único lugar donde un crédito recién creado, con más
  // de 3 días de margen, puede recibir un abono).
  await page.getByRole("button", { name: "Close" }).click();
  await page.goto("/creditos");

  await page.getByLabel("Buscar cliente").fill(clienteNombre);
  await page.getByRole("button", { name: clienteNombre }).click();

  // Acotado a la fila de ESTE crédito (no el genérico "Registrar abono"):
  // la seed real de Neon dev suele tener otro crédito real "por vencer"
  // en el panel de Alertas de arriba, con su propio botón "Registrar
  // abono" — un locator sin acotar es ambiguo entre los dos.
  const montoTotalTexto = Number(creditoCreado.montoTotal).toFixed(2);
  const filaCredito = page.locator("li").filter({ hasText: `S/ ${montoTotalTexto}` });
  await filaCredito.getByRole("button", { name: "Registrar abono" }).click();
  await expect(page.getByRole("heading", { name: "Registrar abono" })).toBeVisible();

  const montoAbono = Number((Number(creditoCreado.montoTotal) / 2).toFixed(2));
  await page.getByLabel("Monto (S/)").fill(montoAbono.toFixed(2));
  await expect(page.getByRole("button", { name: "Confirmar abono" })).toBeEnabled();
  await page.getByRole("button", { name: "Confirmar abono" }).click();

  await expect(filaCredito.getByText(`saldo S/ ${(Number(creditoCreado.montoTotal) - montoAbono).toFixed(2)}`)).toBeVisible({
    timeout: 15_000,
  });

  const creditoActualizado = await prisma.credito.findUniqueOrThrow({ where: { id: creditoCreado.id } });
  expect(Number(creditoActualizado.montoPagado)).toBe(montoAbono);
});
