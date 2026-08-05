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

  const esRutaPublica = pathname === "/login";

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
  // Excluye assets internos de Next y archivos estáticos de public/
  // (favicon, logo, etc.) — sin esto el propio guard bloquea la petición
  // interna del optimizador de imágenes de Next. /api/auth/* SÍ está
  // incluido a propósito: necesita pasar por acá para el rate limiting.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
