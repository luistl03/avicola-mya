/** ID fijo del cliente usado para ventas de mostrador sin cliente registrado. Sembrado en prisma/seed.ts. */
export const CLIENTE_PUBLICO_GENERAL_ID = "00000000-0000-0000-0000-000000000001";

/** Minutos de inactividad tras los que el IdleTimer muestra el aviso previo. */
export const SESION_IDLE_AVISO_MIN = 28;

/** Minutos de inactividad tras los que la sesión se considera expirada. */
export const SESION_IDLE_LIMITE_MIN = 30;

/** Throttle mínimo (ms) entre heartbeats de actividad al servidor — ver R3 en specs/sprint-01-autenticacion/spec.md: sin esto, un ping por evento satura Neon. */
export const SESION_HEARTBEAT_THROTTLE_MS = 60_000;
