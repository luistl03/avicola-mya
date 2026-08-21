import { NextResponse } from "next/server";

import { enviarNotificacionPush } from "@/lib/webPush";
import { hoyEnLima } from "@/lib/zod/comun";
import {
  listarCreditosPendientesSinNotificar,
  marcarCreditosComoNotificados,
} from "@/server/repositories/credito";
import {
  eliminarSuscripcionPushPorId,
  listarSuscripcionesPushDeGerentesActivos,
} from "@/server/repositories/pushSubscription";
import { construirMensajePush, creditosParaNotificar } from "@/server/services/credito";

// Invocado por Vercel Cron (vercel.json), sin sesión de usuario — no pasa
// por withAuth (pensado para mutaciones disparadas por un Usuario real
// con AuditLog). Se autentica con un secreto compartido, mismo criterio
// de "adaptador de transporte con su propia verificación" que ya usa
// api/sync/route.ts (Sprint 14). src/proxy.ts excluye esta ruta del guard
// de sesión — sin eso, redirigiría a /login antes de llegar acá.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const [creditos, suscripciones] = await Promise.all([
    listarCreditosPendientesSinNotificar(),
    listarSuscripcionesPushDeGerentesActivos(),
  ]);

  const creditosAplanados = creditos.map((credito) => ({
    ...credito,
    montoTotal: Number(credito.montoTotal),
    montoPagado: Number(credito.montoPagado),
  }));
  const idsParaNotificar = creditosParaNotificar(creditosAplanados, hoyEnLima());
  const creditosParaEnviar = creditosAplanados.filter((credito) => idsParaNotificar.includes(credito.id));

  for (const credito of creditosParaEnviar) {
    const mensaje = construirMensajePush(credito);
    for (const suscripcion of suscripciones) {
      const resultado = await enviarNotificacionPush(suscripcion, { ...mensaje, url: "/creditos" });
      if (!resultado.ok && resultado.suscripcionInvalida) {
        await eliminarSuscripcionPushPorId(suscripcion.id);
      }
    }
  }

  // Best-effort (corolario de diseño 4, spec.md): se marca aunque algún
  // envío individual haya fallado por un motivo transitorio — el push es
  // un canal de conveniencia, no la única fuente de verdad del crédito
  // vencido.
  if (idsParaNotificar.length > 0) {
    await marcarCreditosComoNotificados(idsParaNotificar);
  }

  return NextResponse.json({ notificados: idsParaNotificar.length });
}
