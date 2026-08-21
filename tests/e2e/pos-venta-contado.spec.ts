import { expect, test } from "@playwright/test";

import { borrarUsuarioPrueba, crearUsuarioPrueba, login, prisma } from "./helpers";

let gerente: Awaited<ReturnType<typeof crearUsuarioPrueba>>;
let paqueteId: string;

// Paquete DISPONIBLE creado directo por Prisma (no hace falta pasar por
// Recolección/Consolidación real para este flujo — el punto es probar
// POS, no cómo llega el inventario) — peso reconocible (9.999 kg) para
// encontrarlo fácil en el selector si algo falla a mitad de camino.
const PESO_PAQUETE_PRUEBA = 9.999;

test.beforeAll(async () => {
  gerente = await crearUsuarioPrueba("GERENTE");
  const paquete = await prisma.paquete.create({
    data: { id: crypto.randomUUID(), peso: PESO_PAQUETE_PRUEBA, tipo: "PURO", estado: "DISPONIBLE" },
  });
  paqueteId = paquete.id;
});

test.afterAll(async () => {
  // Si la venta se cerró de verdad, el Paquete quedó VENDIDO con
  // DetalleVenta apuntando a él — hay que borrar en ese orden (hijo antes
  // que padre) o el DELETE de Venta/Paquete falla por FK.
  const detalle = await prisma.detalleVenta.findFirst({ where: { paqueteId } });
  if (detalle) {
    await prisma.venta.delete({ where: { id: detalle.ventaId } }).catch(() => undefined);
  }
  await prisma.paquete.delete({ where: { id: paqueteId } }).catch(() => undefined);
  await borrarUsuarioPrueba(gerente.id);
});

test("vender un paquete al contado descuenta el inventario y genera comprobante", async ({ page }) => {
  await login(page, gerente.usuario, gerente.password);
  await page.goto("/pos");

  // El paquete de prueba (9.999 kg) es el más nuevo → aparece primero en
  // el preview sin necesidad de buscar (PosSelectorItems, "más reciente
  // primero" cuando no hay búsqueda activa).
  const filaPaquete = page.getByText(`${PESO_PAQUETE_PRUEBA.toFixed(3)} kg`).locator("..");
  await filaPaquete.getByRole("button", { name: "Agregar" }).click();

  await expect(page.getByText("Carrito (1)")).toBeVisible();

  await page.getByRole("button", { name: "Cerrar venta" }).click();

  // ComprobanteDialog se monta al éxito — confirma con el título por
  // defecto ("Venta cerrada") y que el paquete ya no aparece disponible.
  // Acotado a data-slot="dialog-content" (ui/dialog.tsx): el toast de
  // éxito usa el mismo texto y también expone role="dialog".
  await expect(
    page.locator('[data-slot="dialog-content"]').getByRole("heading", { name: "Venta cerrada" }),
  ).toBeVisible();

  const paqueteActualizado = await prisma.paquete.findUniqueOrThrow({ where: { id: paqueteId } });
  expect(paqueteActualizado.estado).toBe("VENDIDO");
});
