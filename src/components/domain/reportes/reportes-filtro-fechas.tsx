"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mismas restricciones que ya usa EgresoFiltros/MortalidadFiltros/
// VentaFiltros para desde/hasta (app/(app)/egresos/page.tsx +
// egreso-filtros.tsx): "hasta" no puede ser un día futuro, "hasta" no
// puede ser anterior a "desde" — pedido explícito del Product Owner tras
// el cierre inicial de Sprint 15 ("con las restricciones que venimos
// trabajando siempre"), reemplaza el selector de mes calendario único.
function hoyEnLimaComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// Filtro dirigido por URL (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD) — mismo
// patrón de useSearchParams + router.replace en startTransition que el
// resto de los filtros de rango del proyecto. Ambos campos viajan siempre
// juntos en cada cambio (si faltara uno, parsearRangoFechas del servidor
// cae al mes actual por defecto — server/services/reportes.ts).
export function ReportesFiltroFechas({ desde, hasta }: { desde: string; hasta: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [desdeValue, setDesdeValue] = useState(desde);
  const [hastaValue, setHastaValue] = useState(hasta);

  function actualizarRango(clave: "desde" | "hasta", valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("desde", clave === "desde" ? valor : desdeValue);
    params.set("hasta", clave === "hasta" ? valor : hastaValue);
    startTransition(() => {
      router.replace(`/reportes?${params.toString()}`);
    });
  }

  const hoy = hoyEnLimaComoStringDeInput();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reportes-desde" className="text-sm text-muted-foreground">
          Desde
        </Label>
        <Input
          id="reportes-desde"
          type="date"
          value={desdeValue}
          max={hastaValue || hoy}
          onChange={(evento) => {
            setDesdeValue(evento.target.value);
            if (evento.target.value) actualizarRango("desde", evento.target.value);
          }}
          className="h-10 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reportes-hasta" className="text-sm text-muted-foreground">
          Hasta
        </Label>
        <Input
          id="reportes-hasta"
          type="date"
          value={hastaValue}
          min={desdeValue || undefined}
          max={hoy}
          onChange={(evento) => {
            setHastaValue(evento.target.value);
            if (evento.target.value) actualizarRango("hasta", evento.target.value);
          }}
          className="h-10 text-sm"
        />
      </div>
    </div>
  );
}
