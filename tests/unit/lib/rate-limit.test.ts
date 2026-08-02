import { describe, expect, it } from "vitest";

import { verificarRateLimitAuth, verificarRateLimitOperativo } from "@/lib/rate-limit";

// Upstash todavía no está provisionado (ver specs/sprint-01-autenticacion/plan.md)
// y este entorno de test tampoco define UPSTASH_REDIS_REST_URL/TOKEN — este
// test fija el comportamiento de "no bloquear nada" mientras no exista la
// cuenta real. Cuando haya credenciales, agregar casos que mockeen
// @upstash/redis y ejerciten la ventana deslizante y el ban de 15 min.
describe("rate-limit (Upstash sin configurar)", () => {
  it("verificarRateLimitAuth no bloquea si no hay credenciales de Upstash", async () => {
    await expect(verificarRateLimitAuth("1.2.3.4")).resolves.toBe(true);
  });

  it("verificarRateLimitOperativo no bloquea si no hay credenciales de Upstash", async () => {
    await expect(verificarRateLimitOperativo("usuario-1")).resolves.toBe(true);
  });
});
