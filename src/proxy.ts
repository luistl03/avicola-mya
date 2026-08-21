import { NextResponse } from "next/server";

import { verificarRateLimitAuth, verificarRateLimitOperativo } from "@/lib/rate-limit";
import { auth } from "@/server/auth";
import { rolPermitidoParaRuta } from "@/server/auth/rbac";

function obtenerIdentificador(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [primero] = forwardedFor.split(",");
    return primero.trim();
  }
  return request.headers.get("x-real-ip") ?? "anonimo";
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/auth")) {
    const permitido = await verificarRateLimitAuth(obtenerIdentificador(req));
    if (!permitido) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
        { status: 429 },
      );
    }
    return NextResponse.next();
  }

  // /api/cron/* (Sprint 16): invocado por Vercel Cron, sin cookie de
  // sesión — se autentica solo con CRON_SECRET dentro del propio Route
  // Handler (src/app/api/cron/creditos-vencidos/route.ts). Sin esta
  // exclusión, el guard de abajo redirigiría el cron a /login antes de
  // que la ruta pueda verificar su secreto.
  const esRutaPublica = pathname === "/login" || pathname.startsWith("/api/cron");

  if (!req.auth && !esRutaPublica) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  if (req.auth) {
    const rol = req.auth.user?.rol;
    if (rol && !rolPermitidoParaRuta(pathname, rol)) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const permitido = await verificarRateLimitOperativo(
      req.auth.user?.id ?? obtenerIdentificador(req),
    );
    if (!permitido) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en un momento." },
        { status: 429 },
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  // Excluye assets internos de Next, archivos estáticos de public/
  // (favicon, logo, etc.), el manifest de la PWA (.webmanifest) y la ruta
  // de servicio del Service Worker (/serwist/*, Sprint 13) — sin esto, un
  // dispositivo SIN sesión (incluido el primer chequeo de instalabilidad
  // de Chrome desde /login) recibe un 302/307 a /login en vez del
  // manifest/SW real. Mismo tipo de bug ya corregido una vez con el logo
  // (Sprint 1/2, ver memory/estado-proyecto.md). /api/auth/* SÍ está
  // incluido a propósito: necesita pasar por acá para el rate limiting.
  matcher: [
    "/((?!_next/static|_next/image|serwist|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|webmanifest)$).*)",
  ],
};
