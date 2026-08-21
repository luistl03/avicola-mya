import { expect, test } from "@playwright/test";

import { borrarUsuarioPrueba, crearUsuarioPrueba, login } from "./helpers";

let gerente: Awaited<ReturnType<typeof crearUsuarioPrueba>>;

test.beforeAll(async () => {
  gerente = await crearUsuarioPrueba("GERENTE");
});

test.afterAll(async () => {
  await borrarUsuarioPrueba(gerente.id);
});

test("credenciales válidas llevan al dashboard con sesión activa", async ({ page }) => {
  await login(page, gerente.usuario, gerente.password);

  await expect(page).toHaveURL("/");
  // Confirma sesión real: el Sidebar muestra el rol del usuario logueado.
  await expect(page.getByText("Gerente", { exact: false }).first()).toBeVisible();
});

test("credenciales inválidas muestran error, sin sesión", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill(gerente.usuario);
  await page.getByLabel("Contraseña", { exact: true }).fill("password-incorrecta");
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("una ruta protegida sin sesión redirige a /login", async ({ page }) => {
  await page.goto("/lotes");

  await expect(page).toHaveURL(/\/login/);
});
