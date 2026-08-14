"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Campo controlado por el padre (PosCarrito) — sin lógica propia más allá
// del <Input>. El guard real de "no supera el bruto" vive en el servidor
// (validarDescuento, server/services/venta.ts); `error` es un mensaje ya
// resuelto por quien lo usa, este componente solo lo muestra.
export function DescuentoInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="descuento" className="text-sm text-muted-foreground">
        Descuento (S/)
      </Label>
      <Input
        id="descuento"
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        placeholder="0.00"
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        aria-invalid={Boolean(error)}
        className="h-10"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
