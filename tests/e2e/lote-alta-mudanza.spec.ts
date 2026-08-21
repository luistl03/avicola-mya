import { expect, test } from "@playwright/test";

import { borrarUsuarioPrueba, crearUsuarioPrueba, login, prisma } from "./helpers";

let gerente: Awaited<ReturnType<typeof crearUsuarioPrueba>>;
let galponOrigenId: string;
let galponDestinoId: string;
let loteId: string | undefined;
const loteCodigo = `E2E-LOTE-${crypto.randomUUID().slice(0, 8)}`;

test.beforeAll(async () => {
  gerente = await crearUsuarioPrueba("GERENTE");
  // Galpones de prueba propios, con capacidad generosa — no depender de
  // la ocupación real de los galpones sembrados en Neon dev (Sprint 16,
  // hallazgo: al planificar este sprint, Galpón 1/2 reales tenían apenas
  // 19 y 1 aves de margen libre).
  const origen = await prisma.galpon.create({
    data: {
      id: crypto.randomUUID(),
      nombre: `E2E Playwright Galpón Origen ${crypto.randomUUID().slice(0, 8)}`,
      capacidadMaxima: 1000,
      estado: "ACTIVO",
    },
  });
  galponOrigenId = origen.id;
  const destino = await prisma.galpon.create({
    data: {
      id: crypto.randomUUID(),
      nombre: `E2E Playwright Galpón Destino ${crypto.randomUUID().slice(0, 8)}`,
      capacidadMaxima: 1000,
      estado: "ACTIVO",
    },
  });
  galponDestinoId = destino.id;
});

test.afterAll(async () => {
  if (loteId) {
    await prisma.historialUbicacionLote.deleteMany({ where: { loteId } });
    await prisma.lote.delete({ where: { id: loteId } }).catch(() => undefined);
  }
  await prisma.galpon.delete({ where: { id: galponOrigenId } }).catch(() => undefined);
  await prisma.galpon.delete({ where: { id: galponDestinoId } }).catch(() => undefined);
  await borrarUsuarioPrueba(gerente.id);
});

test("dar de alta un lote y mudarlo refleja el cambio en HistorialUbicacionLote", async ({ page }) => {
  await login(page, gerente.usuario, gerente.password);
  await page.goto("/lotes");

  await page.getByRole("button", { name: "Nuevo lote" }).click();
  await page.getByLabel("Código").fill(loteCodigo);
  // D5 — América/Lima, no la fecha UTC cruda: el input tiene max="hoy en
  // Lima" (LoteFormDialog), y cerca de la medianoche UTC "hoy" en UTC ya
  // puede ser "mañana" en Lima (UTC-5), rechazado por el propio navegador
  // (hallazgo real durante el desarrollo de este spec).
  const hoyEnLima = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  await page.getByLabel("Fecha de ingreso").fill(hoyEnLima);
  await page.getByLabel("Aves iniciales").fill("50");
  await page.getByLabel("Galpón").click();
  await page
    .getByRole("option")
    .filter({ hasText: /Galpón Origen/ })
    .click();
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Lote creado")).toBeVisible();

  const loteCreado = await prisma.lote.findUniqueOrThrow({ where: { codigo: loteCodigo } });
  loteId = loteCreado.id;
  const ubicacionInicial = await prisma.historialUbicacionLote.findFirstOrThrow({
    where: { loteId, fechaSalida: null },
  });
  expect(ubicacionInicial.galponId).toBe(galponOrigenId);

  // Acotado a la fila real del lote de prueba (código único) — evita
  // ambigüedad con cualquier otro "Mudar" de un lote real en la tabla,
  // mismo criterio aprendido en S16-18 con "Registrar abono".
  const filaLote = page.getByRole("row", { name: new RegExp(loteCodigo) });
  await filaLote.getByRole("button", { name: "Mudar" }).click();

  await expect(page.getByRole("heading", { name: `Mudar ${loteCodigo}` })).toBeVisible();
  await page.getByLabel("Galpón destino").click();
  await page
    .getByRole("option")
    .filter({ hasText: /Galpón Destino/ })
    .click();
  await page.getByRole("button", { name: "Confirmar mudanza" }).click();

  await expect(page.getByText("Lote mudado")).toBeVisible();

  const historial = await prisma.historialUbicacionLote.findMany({
    where: { loteId },
    orderBy: { fechaEntrada: "asc" },
  });
  expect(historial).toHaveLength(2);
  expect(historial[0]).toMatchObject({ galponId: galponOrigenId });
  expect(historial[0].fechaSalida).not.toBeNull();
  expect(historial[1]).toMatchObject({ galponId: galponDestinoId, fechaSalida: null });
});
