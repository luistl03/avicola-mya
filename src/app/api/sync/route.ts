import { NextResponse } from "next/server";
import { z } from "zod";

import { crearNotaBitacora } from "@/server/actions/bitacora";
import { registrarMortalidad } from "@/server/actions/mortalidad";
import { registrarRecoleccion } from "@/server/actions/recoleccion";
import type { ActionResult } from "@/server/auth/with-auth";

// Cada handler es la misma Server Action que ya usan los dialogs online —
// misma validación Zod, misma verificación de sesión/rol/idle timeout,
// misma idempotencia por P2002, mismo AuditLog. Este endpoint no duplica
// ninguna regla de negocio, es un adaptador de transporte (HTTP batch en
// vez de Server Action individual) sobre lógica que ya existe y ya está
// testeada (ver plan.md, "POST /api/sync — batch idempotente").
const HANDLERS: Record<string, (rawInput: unknown) => Promise<ActionResult<unknown>>> = {
  MORTALIDAD: registrarMortalidad,
  BITACORA: crearNotaBitacora,
  RECOLECCION: registrarRecoleccion,
};

const itemSchema = z.object({
  idLocal: z.string(),
  tipo: z.enum(["MORTALIDAD", "BITACORA", "RECOLECCION"]),
  payload: z.record(z.string(), z.unknown()),
});

// Tope por request — ver "Tamaño de lote" en plan.md: evita una única
// request enorme cerca del timeout de función de Vercel; si la cola local
// tiene más, el sincronizador manda varios POST seguidos.
const bodySchema = z.object({ items: z.array(itemSchema).max(25) });

type ResultadoSync = { idLocal: string } & ActionResult<unknown>;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido — se esperaba JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  }

  // Secuencial, no Promise.all — no abrir N conexiones pooled de golpe
  // contra Neon (plan gratuito, D6 en memory/decisiones-tecnicas.md, R2 en
  // spec.md), y mantener el orden de AuditLog coherente con el orden real
  // de captura. Cada ítem se procesa de forma independiente: un handler
  // que falla (rechazo de negocio dentro de withAuth, nunca lanza — ver
  // server/auth/with-auth.ts) no impide que se procesen los siguientes.
  const resultados: ResultadoSync[] = [];
  for (const item of parsed.data.items) {
    const handler = HANDLERS[item.tipo];
    const resultado = await handler(item.payload);
    resultados.push({ idLocal: item.idLocal, ...resultado });
  }

  return NextResponse.json({ resultados });
}
