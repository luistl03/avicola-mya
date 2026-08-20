import { listarParaEnviar, marcarEnviando, marcarError, marcarOk, marcarPendiente } from "@/lib/offline/cola";
import type { ItemColaOffline } from "@/lib/offline/db";

const TAMANIO_LOTE = 25; // mismo tope que bodySchema en app/api/sync/route.ts

type ResultadoSync = { idLocal: string; ok: boolean; error?: string };

function enLotes<T>(items: T[], tamanio: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamanio) {
    lotes.push(items.slice(i, i + tamanio));
  }
  return lotes;
}

// Disparada por: el evento "online" del navegador, el montaje del Shell
// autenticado, y el botón "Reintentar" manual (H6) — ver plan.md,
// "Disparadores de sincronizarCola()". No hay polling por temporizador:
// si no hay señal, reintentar cada N segundos no cambia nada hasta que
// el evento "online" dispare de todos modos.
export async function sincronizarCola(): Promise<void> {
  const pendientes = await listarParaEnviar();
  if (pendientes.length === 0) return;

  for (const lote of enLotes(pendientes, TAMANIO_LOTE)) {
    await Promise.all(lote.map((item: ItemColaOffline) => marcarEnviando(item.id)));

    let resultados: ResultadoSync[];
    try {
      const respuesta = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lote.map((item) => ({ idLocal: item.id, tipo: item.tipo, payload: item.payload })),
        }),
      });
      if (!respuesta.ok) {
        // 4xx/5xx de la propia request (ej. 400 por lote corrupto, 429 por
        // rate limit) — no es un resultado por ítem, se trata como fallo
        // transitorio del lote completo: vuelve todo a PENDIENTE.
        throw new Error(`HTTP ${respuesta.status}`);
      }
      const cuerpo = (await respuesta.json()) as { resultados: ResultadoSync[] };
      resultados = cuerpo.resultados;
    } catch {
      // Sin red real (o se cortó a mitad del batch) — vuelven a PENDIENTE,
      // el próximo disparador los reintenta. Nunca se marcan ERROR: esa
      // distinción transitorio/permanente es la que separa un fallo de
      // red (reintentable solo) de un rechazo de negocio del servidor
      // (ver plan.md).
      await Promise.all(lote.map((item) => marcarPendiente(item.id)));
      return; // no seguir con el siguiente lote si ya no hay red
    }

    for (const resultado of resultados) {
      if (resultado.ok) {
        await marcarOk(resultado.idLocal);
      } else {
        await marcarError(resultado.idLocal, resultado.error ?? "Error desconocido del servidor.");
      }
    }
  }
}
