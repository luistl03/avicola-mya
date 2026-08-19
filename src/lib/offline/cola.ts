import { dbOffline, type ItemColaOffline, type TipoColaOffline } from "@/lib/offline/db";

// Encolar es la única forma de crear un ítem — nace siempre PENDIENTE,
// con 0 intentos. `id` viene del payload (mismo id de cliente que ya
// genera cada dialog, ver plan.md).
export async function encolar(
  tipo: TipoColaOffline,
  payload: Record<string, unknown> & { id: string; creadoEnCliente: Date },
): Promise<void> {
  const ahora = new Date();
  const item: ItemColaOffline = {
    id: payload.id,
    tipo,
    payload,
    estado: "PENDIENTE",
    intentos: 0,
    creadoEnCliente: payload.creadoEnCliente,
    actualizadoEn: ahora,
  };
  await dbOffline.pendientes.put(item);
}

// Todo lo que no está en OK — PENDIENTE, ENVIANDO (un ítem que quedó a
// mitad de un envío interrumpido, ej. el navegador se cerró) y ERROR, para
// la pantalla de pendientes (H6).
export function listarPendientes(): Promise<ItemColaOffline[]> {
  return dbOffline.pendientes.where("estado").notEqual("OK").sortBy("actualizadoEn");
}

// Solo lo que el sincronizador va a intentar enviar ahora — ENVIANDO no
// se reintoma acá: si un envío anterior quedó a mitad de camino (pestaña
// cerrada), vuelve a PENDIENTE recién cuando el sincronizador arranca de
// nuevo (marcarPendiente se llama también al inicio de sincronizarCola,
// ver sincronizador.ts) en vez de reintentarlo automáticamente desde acá.
export function listarParaEnviar(): Promise<ItemColaOffline[]> {
  return dbOffline.pendientes.where("estado").equals("PENDIENTE").sortBy("actualizadoEn");
}

async function actualizarEstado(
  id: string,
  cambios: Partial<Pick<ItemColaOffline, "estado" | "ultimoError" | "intentos">>,
): Promise<void> {
  await dbOffline.pendientes.update(id, { ...cambios, actualizadoEn: new Date() });
}

export function marcarEnviando(id: string): Promise<void> {
  return actualizarEstado(id, { estado: "ENVIANDO" });
}

// Vuelve a PENDIENTE tras un fallo de red real (transitorio, no un
// rechazo de negocio) — incrementa `intentos` para que la pantalla de
// pendientes pueda mostrar cuántas veces se intentó, sin que eso cambie
// el comportamiento de reintento (no hay backoff ni tope de intentos:
// decisión de negocio 6, spec.md — un ítem nunca se descarta solo).
export async function marcarPendiente(id: string): Promise<void> {
  const item = await dbOffline.pendientes.get(id);
  await actualizarEstado(id, { estado: "PENDIENTE", intentos: (item?.intentos ?? 0) + 1 });
}

export function marcarOk(id: string): Promise<void> {
  return actualizarEstado(id, { estado: "OK", ultimoError: undefined });
}

export function marcarError(id: string, motivo: string): Promise<void> {
  return actualizarEstado(id, { estado: "ERROR", ultimoError: motivo });
}

// Único DELETE físico real de todo el proyecto sobre esta tabla — no es
// una entidad de negocio en Postgres, es una cola de trabajo local (ver
// nota en plan.md). Nunca se llama automáticamente, solo desde el botón
// "Descartar" con confirmación explícita (H7).
export async function descartar(id: string): Promise<void> {
  await dbOffline.pendientes.delete(id);
}
