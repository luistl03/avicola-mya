"use client";

import type { ReactNode } from "react";
import { CreditCard } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mismo criterio que hoyEnLimaComoStringDeInput() de LoteFormDialog: solo
// comodidad de UX para el date picker del navegador — la validación real
// (fecha estrictamente posterior a hoy, en América/Lima) vive en
// lib/zod/venta.ts (cerrarVentaSchema), no acá.
function hoyEnLimaComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

function fechaADiasDeStringDeInput(base: string, dias: number): string {
  const fecha = new Date(`${base}T00:00:00.000Z`);
  return new Date(fecha.getTime() + dias * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
    timeZone: "UTC",
  });
}

// Fecha sugerida por defecto para un nuevo intento de venta a crédito —
// hoy + 15 días (decisión de negocio adicional, spec.md), editable.
export function fechaLimiteCreditoSugerida(): string {
  return fechaADiasDeStringDeInput(hoyEnLimaComoStringDeInput(), 15);
}

// Toggle "Venta a crédito" + monto al contado + fecha límite — vive como
// componente propio, mismo criterio de granularidad que DescuentoInput/
// MetodoPagoSelect (un archivo por campo del carrito), controlado por el
// padre (PosCarrito, que arma el payload real de cerrarVentaAction).
export function VentaCreditoFields({
  esCredito,
  onEsCreditoChange,
  disabled,
  montoContado,
  onMontoContadoChange,
  errorMontoContado,
  fechaLimite,
  onFechaLimiteChange,
  metodoPagoSlot,
}: {
  esCredito: boolean;
  onEsCreditoChange: (valor: boolean) => void;
  disabled: boolean;
  montoContado: string;
  onMontoContadoChange: (valor: string) => void;
  errorMontoContado?: string;
  fechaLimite: string;
  onFechaLimiteChange: (valor: string) => void;
  // MetodoPagoSelect, renderizado acá (debajo de "Monto al contado") en
  // vez de en su posición habitual del carrito — mismo <select>, solo se
  // reubica visualmente mientras la venta es a crédito, para que quede
  // junto al resto de los datos de la parte al contado. PosCarrito decide
  // dónde montarlo (acá o en su lugar de siempre), este componente no
  // conoce el estado de metodoPago en sí, solo dónde dibujarlo.
  metodoPagoSlot: ReactNode;
}) {
  const minFechaLimite = fechaADiasDeStringDeInput(hoyEnLimaComoStringDeInput(), 1); // mínimo mañana

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={esCredito}
          disabled={disabled}
          onChange={(evento) => onEsCreditoChange(evento.target.checked)}
          className="size-5 accent-primary disabled:opacity-50"
        />
        <CreditCard className="size-4 text-primary" />
        Venta a crédito
      </label>

      {disabled ? (
        <p className="text-sm text-muted-foreground">No se puede vender a crédito a Público General.</p>
      ) : null}

      {esCredito && !disabled ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="montoContado" className="text-sm text-muted-foreground">
              Monto al contado (S/, puede ser 0)
            </Label>
            <Input
              id="montoContado"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              placeholder="0.00"
              value={montoContado}
              onChange={(evento) => onMontoContadoChange(evento.target.value)}
              aria-invalid={Boolean(errorMontoContado)}
              className="h-10"
            />
            {errorMontoContado ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMontoContado}
              </p>
            ) : null}
          </div>
          {metodoPagoSlot}
          <div className="flex flex-col gap-2">
            <Label htmlFor="fechaLimiteCredito" className="text-sm text-muted-foreground">
              Fecha límite
            </Label>
            <Input
              id="fechaLimiteCredito"
              type="date"
              min={minFechaLimite}
              value={fechaLimite}
              onChange={(evento) => onFechaLimiteChange(evento.target.value)}
              className="h-10"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
