"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type MetodoPago = "EFECTIVO" | "YAPE" | "PLIN" | "TRANSFERENCIA";

// Los 4 valores reales del enum MetodoPago — ninguno representa "crédito"
// este sprint (confirmado, ver "Hallazgo real" en spec.md).
const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "YAPE", label: "Yape" },
  { value: "PLIN", label: "Plin" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

// <Select> controlado con <SelectValue> resuelto a mano (children
// explícito) — mismo fix del Bug 2 de Sprint 3: sin esto, Base UI puede
// caer en un fallback que muestra el value crudo del enum en vez de la
// etiqueta legible.
export function MetodoPagoSelect({
  value,
  onChange,
}: {
  value: MetodoPago;
  onChange: (value: MetodoPago) => void;
}) {
  const seleccionado = METODOS.find((metodo) => metodo.value === value);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="metodoPago" className="text-sm text-muted-foreground">
        Método de pago
      </Label>
      <Select value={value} onValueChange={(valor) => onChange(valor as MetodoPago)}>
        <SelectTrigger id="metodoPago" className="h-10 w-full">
          <SelectValue placeholder="Selecciona un método">{seleccionado?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {METODOS.map((metodo) => (
            <SelectItem key={metodo.value} value={metodo.value}>
              {metodo.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
