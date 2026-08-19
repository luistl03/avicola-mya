"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DesgloseNetoMensual } from "@/server/services/sueldo-movimiento";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function moneda(valor: number): string {
  return `S/ ${valor.toFixed(2)}`;
}

// Selector de mes/año dirigido por searchParams
// (/personal/[empleadoId]?mes=N&anio=N) — sin Server Action de lectura,
// mismo criterio que cualquier fetch inicial de página (plan.md,
// "Diseño de UI"). El desglose lo calcula el Server Component padre
// (calcularNetoMensual, server/services/sueldo-movimiento.ts) y llega ya
// resuelto como prop — este componente solo navega y muestra.
export function NetoMensualCard({
  empleadoId,
  mes,
  anio,
  desglose,
}: {
  empleadoId: string;
  mes: number;
  anio: number;
  desglose: DesgloseNetoMensual;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Año actual y el anterior — rango razonable para una granja que recién
  // empieza a llevar planilla digital (plan.md).
  const anioActual = new Date().getFullYear();
  const anios = [anioActual, anioActual - 1];

  function navegar(nuevoMes: number, nuevoAnio: number) {
    startTransition(() => {
      router.replace(`/personal/${empleadoId}?mes=${nuevoMes}&anio=${nuevoAnio}`);
    });
  }

  const sinMovimientos =
    desglose.sueldoBase === 0 && desglose.bonos === 0 && desglose.adelantos === 0 && desglose.descuentos === 0;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Calculator className="size-4 text-primary" />
          Neto mensual (informativo)
        </h2>
        <div className="flex items-center gap-2">
          <Select value={String(mes)} onValueChange={(valor) => navegar(Number(valor), anio)}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue>{MESES[mes - 1]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MESES.map((nombre, indice) => (
                <SelectItem key={nombre} value={String(indice + 1)}>
                  {nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(anio)} onValueChange={(valor) => navegar(mes, Number(valor))}>
            <SelectTrigger className="h-9 w-24 text-sm">
              <SelectValue>{String(anio)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {anios.map((valor) => (
                <SelectItem key={valor} value={String(valor)}>
                  {valor}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {sinMovimientos ? (
        <p className="text-sm text-muted-foreground">Sin movimientos este mes.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Sueldo base</dt>
            <dd className="font-medium text-foreground">{moneda(desglose.sueldoBase)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bonos</dt>
            <dd className="font-medium text-foreground">{moneda(desglose.bonos)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Adelantos</dt>
            <dd className="font-medium text-foreground">−{moneda(desglose.adelantos)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Descuentos</dt>
            <dd className="font-medium text-foreground">−{moneda(desglose.descuentos)}</dd>
          </div>
        </dl>
      )}

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-medium text-muted-foreground">Neto</span>
        <span className="text-lg font-semibold text-foreground">{moneda(desglose.neto)}</span>
      </div>
    </div>
  );
}
