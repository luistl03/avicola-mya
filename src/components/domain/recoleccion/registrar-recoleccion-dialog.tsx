"use client";

import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Egg, Plus } from "lucide-react";

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
import { toastManager } from "@/components/ui/toast";
import { UNIDADES_POR_PAQUETE } from "@/lib/constants";
import { registrarRecoleccion } from "@/server/actions/recoleccion";
import type { ActionResult } from "@/server/auth/with-auth";

type LoteOpcion = { id: string; codigo: string };

type RecoleccionPayload = {
  id: string;
  loteId: string;
  cantidadTotal: number;
  creadoEnCliente: Date;
  pesos: number[];
};

type Estado = ActionResult<{ id: string; paquetesCreados: number; sueltos: number }> | undefined;

// Mismo <Dialog> compacto que RegistrarMortalidadDialog/LoteFormDialog —
// no <Sheet side="bottom"> (Sprint 4 lo probó y se revirtió a pedido del
// Product Owner, ver memory/estado-proyecto.md).
const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

// Debe coincidir exactamente con calcularEmpaque() de
// server/services/recoleccion.ts — duplicado a propósito: un Client
// Component nunca importa server/services/* directo (cruzaría el límite
// de RSC, mismo chequeo que ya vigila npm run build desde Sprint 3).
// UNIDADES_POR_PAQUETE sí viene de lib/constants.ts (dato plano, sin
// Prisma) para no duplicar el número mágico una segunda vez.
function calcularEmpaquePreview(cantidadTotal: number): { paquetes: number; sueltos: number } {
  if (!Number.isInteger(cantidadTotal) || cantidadTotal <= 0) {
    return { paquetes: 0, sueltos: 0 };
  }
  return {
    paquetes: Math.floor(cantidadTotal / UNIDADES_POR_PAQUETE),
    sueltos: cantidadTotal % UNIDADES_POR_PAQUETE,
  };
}

export function RegistrarRecoleccionDialog({ lotesActivos }: { lotesActivos: LoteOpcion[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="md">
            <Plus data-icon="inline-start" />
            Registrar recolección
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Egg className="size-4 text-primary" />
            Registrar recolección
          </DialogTitle>
          <DialogDescription>
            El galpón se resuelve solo. Los paquetes se calculan automáticamente.
          </DialogDescription>
        </DialogHeader>

        {/* Mismo criterio que el resto de los dialogs de formulario del
        proyecto: el formulario vive en un componente aparte que solo se
        monta mientras `open` es true, para que useActionState() arranque
        limpio en cada apertura en vez de arrastrar el error de una tanda
        anterior. */}
        {open ? (
          <RegistrarRecoleccionForm lotesActivos={lotesActivos} onExito={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RegistrarRecoleccionForm({
  lotesActivos,
  onExito,
}: {
  lotesActivos: LoteOpcion[];
  onExito: () => void;
}) {
  const router = useRouter();
  // Controlado por el mismo motivo que el <Select> de lote en
  // RegistrarMortalidadDialog (Bug 2 de Sprint 3): sin esto, Base UI
  // puede caer en un fallback que muestra el value crudo en vez de la
  // etiqueta legible.
  const [loteId, setLoteId] = useState<string | null>(null);
  const [cantidadTotalInput, setCantidadTotalInput] = useState("");
  const [pesos, setPesos] = useState<string[]>([]);

  // Generado una sola vez por apertura del diálogo (no en cada submit) —
  // bug real encontrado en vivo en S5-13: un doble clic accidental (el
  // botón tardó en deshabilitarse, ver el fix de startTransition más
  // abajo) generaba dos ids distintos, así que la protección de
  // idempotencia por P2002 (server/actions/recoleccion.ts) nunca se
  // activaba — cada clic terminaba en un RegistroRecoleccion real y
  // distinto. Es seguro reusar el mismo id mientras el diálogo sigue
  // abierto: un guardado exitoso cierra el diálogo (onExito) y desmonta
  // este componente por completo (gateado por `open` en el padre), así
  // que un reintento después de un guardado exitoso siempre parte de un
  // id nuevo, no del mismo.
  const [id] = useState(() => crypto.randomUUID());

  const cantidadTotal = Number(cantidadTotalInput) || 0;
  const { paquetes, sueltos } = calcularEmpaquePreview(cantidadTotal);

  // Redimensiona `pesos` en el mismo evento que cambia cantidadTotal, no
  // en un useEffect separado observando `paquetes` — evita el
  // anti-patrón de sincronizar prop/estado derivado con useEffect +
  // setState que el propio linter de React ya marcó una vez en este
  // proyecto (BitacoraMuro, Sprint 4). Al reducirse, los valores
  // sobrantes se descartan, no se conservan "por si vuelven a aparecer".
  function handleCantidadTotalChange(value: string) {
    setCantidadTotalInput(value);
    const { paquetes: nuevosPaquetes } = calcularEmpaquePreview(Number(value) || 0);
    setPesos((anterior) => {
      if (nuevosPaquetes === anterior.length) return anterior;
      if (nuevosPaquetes < anterior.length) return anterior.slice(0, nuevosPaquetes);
      return [...anterior, ...Array(nuevosPaquetes - anterior.length).fill("")];
    });
  }

  function handlePesoChange(indice: number, value: string) {
    setPesos((anterior) => anterior.map((peso, i) => (i === indice ? value : peso)));
  }

  // Payload como objeto plano, no FormData: a diferencia de
  // RegistrarMortalidadDialog, este formulario tiene un campo `pesos` de
  // longitud variable — FormData + Object.fromEntries (server/auth/with-auth.ts,
  // normalizarInput) solo puede quedarse con el último valor de una clave
  // repetida, no arma un arreglo. withAuth acepta cualquier `unknown`
  // serializable como rawInput, no solo FormData, así que se llama
  // formAction(payload) directo desde onSubmit en vez de usar
  // <form action={formAction}>.
  const [state, formAction, pending] = useActionState<Estado, RecoleccionPayload>(
    async (_prev, payload) => {
      let resultado: Estado;
      try {
        resultado = await registrarRecoleccion(payload);
      } catch {
        // Ver el mismo catch en nueva-nota-bitacora-dialog.tsx — sin red,
        // el fetch de la Server Action rechaza antes de llegar al
        // servidor; sin este catch React lo trata como error no manejado
        // en vez de mostrarlo con el mismo mensaje en rojo del resto del
        // formulario (H3, spec.md Sprint 13).
        return { ok: false, error: "Sin conexión. Guarda de nuevo cuando recuperes señal." };
      }
      if (resultado.ok) {
        router.refresh();
        toastManager.add({
          type: "success",
          title: "Recolección registrada",
          description: `${resultado.data.paquetesCreados} paquete(s), ${resultado.data.sueltos} sueltos`,
        });
        onExito();
      }
      return resultado;
    },
    undefined,
  );

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const loteSeleccionado = lotesActivos.find((lote) => lote.id === loteId);

  // Deshabilitado hasta que: haya un lote elegido, cantidadTotal sea
  // válido (> 0), y cada campo de peso desplegado tenga un valor > 0 —
  // decisión de negocio confirmada en spec.md: no se guarda con pesos
  // pendientes, la transacción completa se ejecuta una sola vez.
  const pesosCompletos = pesos.every((peso) => Number(peso) > 0);
  const puedeGuardar = Boolean(loteId) && cantidadTotal > 0 && pesosCompletos;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!loteId || !puedeGuardar || pending) return;
        // startTransition: useActionState() exige que su dispatch se
        // invoque dentro de una transición (o vía <form action>, que lo
        // envuelve sola). Sin esto, React advierte en consola "isPending
        // will not update correctly" — y de hecho no actualiza: es
        // exactamente el bug real de S5-13, `pending` no se ponía en
        // `true` a tiempo entre el primer y el segundo clic de un doble
        // clic real, así que el botón no llegaba a deshabilitarse.
        startTransition(() => {
          formAction({
            id,
            loteId,
            cantidadTotal,
            creadoEnCliente: new Date(),
            pesos: pesos.map(Number),
          });
        });
      }}
    >
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="loteId" className={LABEL_COMPACTO}>
          Lote
        </Label>
        <Select value={loteId} onValueChange={setLoteId}>
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
        <Label htmlFor="cantidadTotal" className={LABEL_COMPACTO}>
          Cantidad total recolectada
        </Label>
        <Input
          id="cantidadTotal"
          type="number"
          inputMode="numeric"
          min={1}
          required
          autoFocus
          value={cantidadTotalInput}
          onChange={(evento) => handleCantidadTotalChange(evento.target.value)}
          className={INPUT_COMPACTO}
        />
        {erroresDe("cantidadTotal")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      {paquetes > 0 || sueltos > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
          {paquetes > 0 ? (
            <div className="flex flex-col gap-3">
              <p className={LABEL_COMPACTO}>
                Se {paquetes === 1 ? "forma" : "forman"} {paquetes} paquete
                {paquetes === 1 ? "" : "s"} de {UNIDADES_POR_PAQUETE} — pesá cada uno en la
                balanza:
              </p>
              {pesos.map((peso, indice) => (
                <div key={indice} className="flex flex-col gap-1">
                  <Label htmlFor={`peso-${indice}`} className={LABEL_COMPACTO}>
                    Peso paquete {indice + 1} (kg)
                  </Label>
                  <Input
                    id={`peso-${indice}`}
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min={0.001}
                    required
                    value={peso}
                    onChange={(evento) => handlePesoChange(indice, evento.target.value)}
                    className={INPUT_COMPACTO}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {sueltos > 0 ? (
            <p className={LABEL_COMPACTO}>{sueltos} unidades sueltas (sin paquete completo).</p>
          ) : null}
        </div>
      ) : null}
      {erroresDe("pesos")?.map((error) => (
        <p key={error} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ))}

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending || !puedeGuardar}>
          <Check data-icon="inline-start" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
