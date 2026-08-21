import { defineConfig, devices } from "@playwright/test";

// D12 (memory/decisiones-tecnicas.md): corre contra Neon dev real, no una
// base aislada — mismo criterio de "verificación en vivo" que el resto
// del proyecto. `workers: 1` + `fullyParallel: false` a propósito: los 5
// specs comparten la misma Neon dev, correr en paralelo aumentaría el
// riesgo de datos cruzados entre flujos (ver "Aislamiento de datos de
// prueba", specs/sprint-16-push-hardening-uat/plan.md). Solo Chromium
// (sin Firefox/WebKit): esto es humo de 5 flujos críticos, no una matriz
// de compatibilidad — la verificación mobile/Safari real del proyecto ya
// se apoya en dispositivos reales del Product Owner, no en Playwright.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Espera un `npm run dev` ya corriendo (mismo criterio de "verificación
  // en vivo" contra el dev server real, no un build de producción) —
  // reuseExistingServer siempre true: no tiene sentido levantar un
  // segundo servidor en el mismo puerto.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
