import Dexie, { type EntityTable } from "dexie";

export type TipoColaOffline = "MORTALIDAD" | "BITACORA" | "RECOLECCION";
export type EstadoColaOffline = "PENDIENTE" | "ENVIANDO" | "OK" | "ERROR";

// El id de la fila ES el id de cliente de la entidad real (el mismo
// crypto.randomUUID() que ya generan los 3 dialogs de campo) — no un id
// de cola aparte. Así la cola nunca necesita un mapeo id-de-cola ↔
// id-de-entidad, y el resultado de /api/sync (idLocal) se reconcilia
// directo contra esta clave primaria.
export type ItemColaOffline = {
  id: string;
  tipo: TipoColaOffline;
  // Objeto plano ya validado en forma por el dialog antes de encolar —
  // Dexie serializa con structured clone, así que Date sobrevive tal cual
  // (no hace falta convertirlo a string). Si un módulo futuro con Decimal
  // se agrega a la cola, ESE payload sí debe convertir Decimal a string
  // antes de encolar (Contrato Offline-Ready, memory/convenciones.md) —
  // no aplica a las 3 entidades de este sprint (ninguna tiene Decimal en
  // su schema Zod de creación, confirmado en spec.md).
  payload: Record<string, unknown>;
  estado: EstadoColaOffline;
  intentos: number;
  ultimoError?: string;
  creadoEnCliente: Date;
  actualizadoEn: Date;
};

export const dbOffline = new Dexie("avicola-mya-cola") as Dexie & {
  pendientes: EntityTable<ItemColaOffline, "id">;
};

dbOffline.version(1).stores({
  // `estado` indexado: la pantalla de pendientes y el sincronizador
  // filtran por estado constantemente, sin recorrer toda la tabla.
  pendientes: "id, estado, tipo",
});
