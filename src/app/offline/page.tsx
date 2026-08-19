import { WifiOff } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

// Server Component estático, sin fetch a Prisma — es el fallback de
// navegación del Service Worker (fallbacks.entries en src/app/sw.ts,
// precacheado vía additionalPrecacheEntries en src/app/serwist/[path]/route.ts)
// cuando una pantalla que no está en caché falla por falta de red (H3,
// spec.md). Se sirve directo desde Cache Storage por el propio Service
// Worker cuando eso pasa — nunca llega a este servidor en ese caso, así
// que no puede depender de ninguna consulta real.
const PANTALLAS_DISPONIBLES_OFFLINE = [
  { href: "/mortalidad", label: "Mortalidad" },
  { href: "/bitacora", label: "Bitácora" },
  { href: "/recoleccion", label: "Recolección" },
] as const;

export default function OfflinePage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Sin conexión" />
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <WifiOff className="size-12 text-muted-foreground" aria-hidden />
        <p className="max-w-md text-muted-foreground">
          Esta pantalla no está disponible sin señal todavía. Mortalidad, Bitácora y Recolección sí
          funcionan sin conexión — probá con una de ellas mientras recuperás señal.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PANTALLAS_DISPONIBLES_OFFLINE.map((pantalla) => (
            <Link key={pantalla.href} href={pantalla.href} className={cn(buttonVariants({ variant: "outline" }))}>
              {pantalla.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
