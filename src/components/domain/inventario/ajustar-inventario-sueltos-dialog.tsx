"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, SlidersHorizontal } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
import { ajustarInventarioSueltosAction } from "@/server/actions/inventario";
import type { ActionResult } from "@/server/auth/with-auth";

type LoteOpcion = { id: string; codigo: string };

type Estado = ActionResult<{ id: string }> | undefined;

// Mismo <Dialog> compacto que el resto del proyecto — no hay campos de
// longitud variable acá (a diferencia de RegistrarRecoleccionDialog), así
// que <form action={formAction}> normal alcanza, sin el bypass de
// startTransition.
const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

// Debe coincidir con el mínimo real de ajustarInventarioSueltosSchema
// (lib/zod/inventario.ts) — duplicado a propósito, mismo criterio que
// UNIDADES_POR_PAQUETE/calcularEmpaquePreview en
// RegistrarRecoleccionDialog: un Client Component no importa un schema de
// server directo solo para leer un número, y este es un valor de UX
// (contador de caracteres), no la validación real (esa la revalida el
// servidor siempre).
const MOTIVO_MIN = 10;

// Visible solo para GERENTE — el chequeo real vive en el Server
// Component que renderiza este componente (app/(app)/recoleccion/page.tsx,
// via session.user.rol), no acá. withAuth (rol: "GERENTE" en
// server/actions/inventario.ts) es la defensa real; este componente ni
// siquiera se monta para un Operario.
export function AjustarInventarioSueltosDialog({ lotesActivos }: { lotesActivos: LoteOpcion[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="md">
            <SlidersHorizontal data-icon="inline-start" />
            Ajustar inventario
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <SlidersHorizontal className="size-4 text-primary" />
            Ajustar inventario de sueltos
          </DialogTitle>
          <DialogDescription>
            Corrige el saldo de sueltos de un lote fuera de la ventana automática de 10 minutos. El
            galpón se resuelve solo, queda auditado con tu motivo.
          </DialogDescription>
        </DialogHeader>

        {/* Mismo criterio que el resto de los dialogs de formulario del
        proyecto: el formulario vive en un componente aparte que solo se
        monta mientras `open` es true. */}
        {open ? (
          <AjustarInventarioSueltosForm lotesActivos={lotesActivos} onExito={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AjustarInventarioSueltosForm({
  lotesActivos,
  onExito,
}: {
  lotesActivos: LoteOpcion[];
  onExito: () => void;
}) {
  const router = useRouter();
  // Un solo <Select> — el galpón NO se elige a mano, se resuelve
  // automático en el servidor vía buscarUbicacionActual(loteId), mismo
  // patrón que RegistrarRecoleccionDialog/RegistrarMortalidadDialog.
  // Corrección real post-diseño (S6-16): el diseño original tenía un
  // segundo <Select> de galpón independiente, pensado para poder ajustar
  // una combinación galpón/lote histórica — el Product Owner señaló
  // probando en vivo que un lote ya sabe su galpón actual y que ese caso
  // no era el real que hacía falta resolver.
  const [loteId, setLoteId] = useState<string | null>(null);
  const [deltaInput, setDeltaInput] = useState("");
  const [motivo, setMotivo] = useState("");
  // Generado una sola vez por apertura del diálogo, mismo criterio ya
  // establecido en todo el proyecto (Recolección/Galpón/Bitácora/
  // Mortalidad) — es la fila nueva de MovimientoSueltos, así que sí
  // necesita idempotencia por id de cliente.
  const [id] = useState(() => crypto.randomUUID());

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await ajustarInventarioSueltosAction(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({ type: "success", title: "Inventario ajustado" });
      onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const loteSeleccionado = lotesActivos.find((lote) => lote.id === loteId);

  const delta = Number(deltaInput);
  const motivoValido = motivo.trim().length >= MOTIVO_MIN;
  const puedeGuardar = Boolean(loteId) && Number.isInteger(delta) && delta !== 0 && motivoValido;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="loteId" className={LABEL_COMPACTO}>
          Lote
        </Label>
        <Select name="loteId" value={loteId} onValueChange={setLoteId}>
          <SelectTrigger id="loteId" className="h-10 w-full">
            <SelectValue placeholder="Selecciona un lote">{loteSeleccionado?.codigo}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {lotesActivos.map((lote) => (
              <SelectItem key={lote.id} value={lote.id}>
                {lote.codigo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {erroresDe("loteId")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="delta" className={LABEL_COMPACTO}>
          Ajuste (unidades sueltas)
        </Label>
        <Input
          id="delta"
          name="delta"
          type="number"
          inputMode="numeric"
          step={1}
          required
          value={deltaInput}
          onChange={(evento) => setDeltaInput(evento.target.value)}
          className={INPUT_COMPACTO}
        />
        <p className="text-xs text-muted-foreground">
          Positivo compensa un faltante, negativo corrige un excedente.
        </p>
        {erroresDe("delta")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="motivo" className={LABEL_COMPACTO}>
          Motivo
        </Label>
        <Textarea
          id="motivo"
          name="motivo"
          required
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          placeholder="Explica por qué hace falta este ajuste"
        />
        <p className="text-xs text-muted-foreground">
          {motivo.trim().length}/{MOTIVO_MIN} caracteres mínimos
        </p>
        {erroresDe("motivo")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending || !puedeGuardar}>
          <Check data-icon="inline-start" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
