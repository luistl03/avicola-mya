"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, HandCoins } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { registrarAbonoAction } from "@/server/actions/credito";
import type { ActionResult } from "@/server/auth/with-auth";

const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

type MetodoPago = "EFECTIVO" | "YAPE" | "PLIN" | "TRANSFERENCIA";
const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "YAPE", label: "Yape" },
  { value: "PLIN", label: "Plin" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

type DatosAbono = { id: string; creditoId: string; monto: number };
type Estado = ActionResult<DatosAbono> | undefined;

// Botón "Registrar abono" — reusado tanto por TarjetaCredito (panel de
// alertas) como por EstadoCuentaCliente (un Credito PENDIENTE con más de
// 3 días de margen no aparece en ningún nivel de alerta, pero igual debe
// poder recibir un abono). Abierto a GERENTE y OPERARIO por igual
// (decisión 7/10, spec.md). Al confirmar, router.refresh() trae de nuevo
// los créditos/saldos del panel de alertas (Server Component), incluida
// la posible auto-liquidación (H5, spec.md); `onRegistrado` opcional
// avisa al padre para que refresque su propio estado si lo mantiene aparte
// (EstadoCuentaCliente no viene de un Server Component, así que
// router.refresh() no le llega solo).
export function RegistrarAbonoDialog({
  creditoId,
  saldoPendiente,
  onRegistrado,
}: {
  creditoId: string;
  saldoPendiente: number;
  onRegistrado?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <HandCoins data-icon="inline-start" />
            Registrar abono
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <HandCoins className="size-4 text-primary" />
            Registrar abono
          </DialogTitle>
          <DialogDescription>Saldo pendiente: S/ {saldoPendiente.toFixed(2)}</DialogDescription>
        </DialogHeader>

        {open ? (
          <RegistrarAbonoForm
            creditoId={creditoId}
            saldoPendiente={saldoPendiente}
            onExito={() => {
              setOpen(false);
              onRegistrado?.();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RegistrarAbonoForm({
  creditoId,
  saldoPendiente,
  onExito,
}: {
  creditoId: string;
  saldoPendiente: number;
  onExito: () => void;
}) {
  const router = useRouter();
  // Generado una sola vez por apertura del diálogo, no en cada submit —
  // mismo criterio de idempotencia que ClienteFormDialog/RegistrarRecoleccionDialog
  // (S5-13): reusado ante un reintento tras un error de validación.
  const [id] = useState(() => crypto.randomUUID());
  const [montoInput, setMontoInput] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await registrarAbonoAction(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: "Abono registrado",
        description: `S/ ${resultado.data.monto.toFixed(2)} registrados.`,
      });
      onExito();
    }
    return resultado;
  }, undefined);

  const monto = Number(montoInput);
  // Preview cliente-side del mismo guard que server/actions/credito.ts —
  // el servidor siempre revalida contra el saldo real.
  const montoValido = montoInput.trim() !== "" && monto > 0 && monto <= saldoPendiente;
  const seleccionado = METODOS.find((metodo) => metodo.value === metodoPago);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="creditoId" value={creditoId} />
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="monto" className={LABEL_COMPACTO}>
          Monto (S/)
        </Label>
        <Input
          id="monto"
          name="monto"
          type="number"
          inputMode="decimal"
          step="0.01"
          required
          value={montoInput}
          onChange={(evento) => setMontoInput(evento.target.value)}
          aria-invalid={montoInput.trim() !== "" && !montoValido}
          className={INPUT_COMPACTO}
        />
        {montoInput.trim() !== "" && !montoValido ? (
          <p role="alert" className="text-sm text-destructive">
            El abono debe ser mayor a 0 y no superar el saldo pendiente (S/ {saldoPendiente.toFixed(2)}).
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="metodoPago" className={LABEL_COMPACTO}>
          Método de pago
        </Label>
        <input type="hidden" name="metodoPago" value={metodoPago} />
        <Select value={metodoPago} onValueChange={(valor) => setMetodoPago(valor as MetodoPago)}>
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

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending || !montoValido}>
          <Check data-icon="inline-start" />
          {pending ? "Registrando..." : "Confirmar abono"}
        </Button>
      </DialogFooter>
    </form>
  );
}
