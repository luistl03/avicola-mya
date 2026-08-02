import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const upstashConfigurado = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

// Upstash todavía no está provisionado en este entorno (ver
// specs/sprint-01-autenticacion/plan.md). Sin credenciales, no se bloquea
// nada — evita tumbar el resto del desarrollo del sprint mientras se crea
// la cuenta. Esto debe quedar resuelto antes de ir a producción.
const redis = upstashConfigurado ? Redis.fromEnv() : null;

const BAN_AUTH_SEGUNDOS = 15 * 60;

const authRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      prefix: "ratelimit:auth",
    })
  : null;

const operativoRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "ratelimit:operativo",
    })
  : null;

/** /api/auth/*: 5 solicitudes/min, y quien supere el límite queda baneado 15 min. */
export async function verificarRateLimitAuth(identificador: string): Promise<boolean> {
  if (!redis || !authRatelimit) return true;

  const banKey = `ratelimit:auth:ban:${identificador}`;
  const baneado = await redis.get(banKey);
  if (baneado) return false;

  const { success } = await authRatelimit.limit(identificador);
  if (!success) {
    await redis.set(banKey, "1", { ex: BAN_AUTH_SEGUNDOS });
    return false;
  }
  return true;
}

/** Rutas operativas autenticadas: 60 solicitudes/min por usuario. */
export async function verificarRateLimitOperativo(identificador: string): Promise<boolean> {
  if (!redis || !operativoRatelimit) return true;

  const { success } = await operativoRatelimit.limit(identificador);
  return success;
}
