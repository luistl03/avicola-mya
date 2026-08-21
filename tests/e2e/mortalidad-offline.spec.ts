import { expect, test } from "@playwright/test";

import { borrarUsuarioPrueba, crearUsuarioPrueba, login, prisma } from "./helpers";

let operario: Awaited<ReturnType<typeof crearUsuarioPrueba>>;
let loteId: string;
let loteCodigo: string;
let galponId: string;

test.beforeAll(async () => {
  operario = await crearUsuarioPrueba("OPERARIO");
  loteCodigo = `E2E-${crypto.randomUUID().slice(0, 8)}`;

  // registrarMortalidad exige que el lote tenga una ubicación abierta real
  // (resuelve el galponId solo, "El galpón se resuelve solo" en el propio
  // dialog) — un Lote sin HistorialUbicacionLote es rechazado con "El
  // lote no tiene una ubicación registrada." (hallazgo real durante el
  // desarrollo de este spec: la primera versión no creaba el Galpón).
  const galpon = await prisma.galpon.create({
    data: {
      id: crypto.randomUUID(),
      nombre: `E2E Playwright Galpón ${crypto.randomUUID().slice(0, 8)}`,
      capacidadMaxima: 1000,
      estado: "ACTIVO",
    },
  });
  galponId = galpon.id;

  const lote = await prisma.lote.create({
    data: {
      id: crypto.randomUUID(),
      codigo: loteCodigo,
      fechaIngreso: new Date(),
      avesIniciales: 100,
      avesVivas: 100,
      edadInicialSemanas: 0,
      estado: "ACTIVO",
      historialUbicaciones: {
        create: { id: crypto.randomUUID(), galponId, fechaEntrada: new Date() },
      },
    },
  });
  loteId = lote.id;
});

test.afterAll(async () => {
  await prisma.registroMortalidad.deleteMany({ where: { loteId } });
  await prisma.historialUbicacionLote.deleteMany({ where: { loteId } });
  await prisma.lote.delete({ where: { id: loteId } }).catch(() => undefined);
  await prisma.galpon.delete({ where: { id: galponId } }).catch(() => undefined);
  await borrarUsuarioPrueba(operario.id);
});

// El evento "online" del navegador marca el ítem "OK" en IndexedDB en
// cuanto recibe la respuesta de /api/sync — el COMMIT en Neon ya ocurrió
// antes de esa respuesta (el handler espera la escritura real antes de
// responder). Aun así, dos triggers de sincronizarCola() pueden competir
// (el de "online" y el de "recién montado" de una navegación cercana) —
// un reintento corto de la lectura por Prisma absorbe ese margen sin
// depender de adivinar cuál de los dos ganó.
async function esperarRegistroMortalidad(loteIdBuscado: string, intentos = 10) {
  for (let intento = 0; intento < intentos; intento += 1) {
    const registro = await prisma.registroMortalidad.findFirst({ where: { loteId: loteIdBuscado } });
    if (registro) return registro;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No se encontró RegistroMortalidad para loteId=${loteIdBuscado} tras ${intentos} intentos.`);
}

test("registrar mortalidad sin conexión la encola y sincroniza sola al volver la señal", async ({
  page,
  context,
}) => {
  await login(page, operario.usuario, operario.password);
  await page.goto("/mortalidad");

  await context.setOffline(true);

  await page.getByRole("button", { name: "Registrar mortalidad" }).click();
  await page.getByLabel("Lote").click();
  await page.getByRole("option", { name: new RegExp(`^${loteCodigo}`) }).click();
  await page.getByLabel("Tipo").click();
  await page.getByRole("option", { name: "Muerte" }).click();
  await page.getByLabel("Cantidad").fill("3");
  await page.getByRole("button", { name: "Guardar" }).click();

  // H3 (Sprint 14): sin red, el fetch de la Server Action rechaza antes
  // de llegar al servidor — se encola en vez de solo avisar, mismo cierre
  // de diálogo que un guardado online exitoso.
  await expect(page.getByText("Guardado sin conexión")).toBeVisible();

  // Sin red, navegar a /pendientes (fuera de las 3 pantallas de campo que
  // Sprint 13 cachea) fallaría de verdad — se lee la cola directo de
  // IndexedDB en la misma pestaña, sin navegar.
  const itemsEnCola = await page.evaluate(
    () =>
      new Promise<{ estado: string; tipo: string }[]>((resolve, reject) => {
        const apertura = indexedDB.open("avicola-mya-cola");
        apertura.onerror = () => reject(apertura.error);
        apertura.onsuccess = () => {
          const tx = apertura.result.transaction("pendientes", "readonly");
          const solicitud = tx.objectStore("pendientes").getAll();
          solicitud.onsuccess = () => resolve(solicitud.result);
          solicitud.onerror = () => reject(solicitud.error);
        };
      }),
  );
  expect(itemsEnCola).toHaveLength(1);
  expect(itemsEnCola[0]).toMatchObject({ estado: "PENDIENTE", tipo: "MORTALIDAD" });

  // El registro NO debe existir todavía en Neon dev — sigue solo en
  // IndexedDB del navegador mientras la app está offline.
  const registrosMientrasOffline = await prisma.registroMortalidad.count({ where: { loteId } });
  expect(registrosMientrasOffline).toBe(0);

  await context.setOffline(false);

  const registro = await esperarRegistroMortalidad(loteId);
  expect(registro.cantidad).toBe(3);
  expect(registro.tipo).toBe("MUERTE");

  const loteActualizado = await prisma.lote.findUniqueOrThrow({ where: { id: loteId } });
  expect(loteActualizado.avesVivas).toBe(97);

  // Confirmación visual, en una pantalla real: /pendientes ya no muestra
  // nada pendiente de este dispositivo.
  await page.goto("/pendientes");
  await expect(
    page.getByText("No hay nada pendiente de sincronizar en este dispositivo."),
  ).toBeVisible();
});
