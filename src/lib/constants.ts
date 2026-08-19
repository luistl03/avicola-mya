/** ID fijo del cliente usado para ventas de mostrador sin cliente registrado. Sembrado en prisma/seed.ts. */
export const CLIENTE_PUBLICO_GENERAL_ID = "00000000-0000-0000-0000-000000000001";

/** Minutos de inactividad tras los que el IdleTimer muestra el aviso previo. */
export const SESION_IDLE_AVISO_MIN = 28;

/** Minutos de inactividad tras los que la sesión se considera expirada. */
export const SESION_IDLE_LIMITE_MIN = 30;

/** Throttle mínimo (ms) entre heartbeats de actividad al servidor — ver R3 en specs/sprint-01-autenticacion/spec.md: sin esto, un ping por evento satura Neon. */
export const SESION_HEARTBEAT_THROTTLE_MS = 60_000;

/** Tamaño de tanda del muro cronológico de Bitácora (scroll infinito) — no son las 10 filas de una tabla paginada de gestión (ver memory/convenciones.md, "Tabla paginada vs. muro con scroll infinito"): es un feed, conviene traer más por tanda. Compartida entre server/actions/bitacora.ts, app/(app)/bitacora/page.tsx y bitacora-muro.tsx para que las tres no puedan desincronizarse. */
export const PAGE_SIZE_MURO = 20;

/** Minutos de ventana de gracia para revertir un registro (RegistroMortalidad restaura avesVivas, RegistroRecoleccion restaura Paquete/InventarioSueltos — Sprint 6). Antes MORTALIDAD_VENTANA_GRACIA_MIN, exclusiva de Mortalidad; renombrada al pasar a ser compartida por los dos módulos. Compartida entre server/services/mortalidad.ts, server/services/recoleccion.ts (guards reales) y el countdown de ambas UI. */
export const VENTANA_GRACIA_MIN = 10;

/** Unidades por paquete cerrado de Recolección (Sprint 5) — un paquete PURO siempre suma exactamente esta cantidad (ver "suma exacta 180" de Paquete Mixto, Sprint 7, mismo tamaño). Compartida entre server/services/recoleccion.ts (calcularEmpaque, autoritativo) y el helper de preview reactivo del formulario en el cliente, que debe coincidir exactamente. */
export const UNIDADES_POR_PAQUETE = 180;

/** Unidades por bandeja suelta armada en Consolidación (Sprint 7) — mismo criterio que UNIDADES_POR_PAQUETE: constante compartida entre server/services/consolidacion.ts (calcularConsolidacion, autoritativo) y el preview reactivo del wizard "Armar Bandeja" en el cliente, que debe coincidir exactamente. */
export const UNIDADES_POR_BANDEJA = 30;

/** Días que el prompt de instalación de Android espera antes de volver a ofrecerse solo, después de que el usuario lo cierra sin instalar (Sprint 13, decisión de negocio 3). Usada por install-prompt-android.tsx. */
export const INSTALL_PROMPT_COOLDOWN_DIAS = 30;
