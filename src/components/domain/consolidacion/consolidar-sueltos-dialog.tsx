"use client";

import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Minus, Package, Plus, Rows3 } from "lucide-react";

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
import { toastManager } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { consolidarBandejaAction, consolidarPaqueteMixtoAction } from "@/server/actions/consolidacion";
import type { ActionResult } from "@/server/auth/with-auth";

type SaldoOrigen = {
  galponId: string;
  loteId: string;
  galponNombre: string;
  loteCodigo: string;
  disponible: number;
};

type PorcionOrigen = { galponId: string; loteId: string; cantidad: number };

type ConsolidarSueltosPayload = {
  id: string;
  origenes: { galponId: string; loteId: string }[];
  creadoEnCliente: Date;
  pesos: number[];
};

type Estado =
  | ActionResult<{ id: string; unidadesCreadas: number; totalConsolidado: number }>
  | undefined;

// Mismo <Dialog> compacto que el resto del proyecto.
const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

// Debe coincidir exactamente con calcularConsolidacion() de
// server/services/consolidacion.ts — duplicado a propósito, mismo criterio
// documentado que calcularEmpaquePreview en RegistrarRecoleccionDialog: un
// Client Component nunca importa server/services/* directo (cruzaría el
// límite de RSC).
function calcularConsolidacionPreview(
  origenes: { galponId: string; loteId: string; disponible: number }[],
  unidadDestino: number,
): { unidades: PorcionOrigen[][]; totalConsolidado: number } {
  const unidades: PorcionOrigen[][] = [];
  let unidadActual: PorcionOrigen[] = [];
  let acumuladoUnidadActual = 0;

  for (const origen of origenes) {
    let restante = origen.disponible;
    while (restante > 0) {
      const necesario = unidadDestino - acumuladoUnidadActual;
      const tomar = Math.min(necesario, restante);

      unidadActual.push({ galponId: origen.galponId, loteId: origen.loteId, cantidad: tomar });
      acumuladoUnidadActual += tomar;
      restante -= tomar;

      if (acumuladoUnidadActual === unidadDestino) {
        unidades.push(unidadActual);
        unidadActual = [];
        acumuladoUnidadActual = 0;
      }
    }
  }

  return { unidades, totalConsolidado: unidades.length * unidadDestino };
}

type ConsolidarSueltosDialogProps = {
  tipo: "PAQUETE_MIXTO" | "BANDEJA";
  unidadDestino: number;
  etiquetaUnidad: "paquete" | "bandeja";
  titulo: string;
  descripcion: string;
  variantTrigger: "default" | "outline";
  saldos: SaldoOrigen[];
};

// Componente único parametrizado, usado dos veces en
// app/(app)/consolidacion/page.tsx (Paquete Mixto y Armar Bandeja) — la
// única diferencia real entre los dos wizards es una constante
// (unidadDestino) y el texto, no vale la pena clonar el componente entero
// (a diferencia de RevertirRecoleccionBoton/RevertirMortalidadBoton, que sí
// son un clon deliberado porque esos dos módulos tienen formas de registro
// genuinamente distintas — ver spec.md).
//
// El ícono NO llega como prop: un componente de ícono (referencia de
// función) no se puede pasar de un Server Component a un Client Component
// — React solo serializa objetos planos a través de ese límite ("Only
// plain objects can be passed to Client Components from Server
// Components", bug real encontrado probando en vivo, S7-15). Se resuelve
// acá mismo a partir de `tipo`, que sí es un string plano.
export function ConsolidarSueltosDialog(props: ConsolidarSueltosDialogProps) {
  const { tipo, titulo, descripcion, variantTrigger } = props;
  const Icon = tipo === "PAQUETE_MIXTO" ? Package : Rows3;
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={variantTrigger} size="md">
            <Icon data-icon="inline-start" />
            {titulo}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Icon className="size-4 text-primary" />
            {titulo}
          </DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>

        {/* Mismo criterio que el resto de los dialogs de formulario del
        proyecto: el formulario vive en un componente aparte que solo se
        monta mientras `open` es true. */}
        {open ? <ConsolidarSueltosForm {...props} onExito={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ConsolidarSueltosForm({
  tipo,
  unidadDestino,
  etiquetaUnidad,
  saldos,
  onExito,
}: ConsolidarSueltosDialogProps & { onExito: () => void }) {
  const router = useRouter();
  // Solo orígenes con saldo real — seleccionar uno en 0 no tiene sentido.
  const saldosDisponibles = saldos.filter((s) => s.disponible > 0);

  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [pesos, setPesos] = useState<string[]>([]);
  // Cuántas unidades de las que el saldo permitiría el operario decidió
  // armar realmente en esta corrida — corrección real post-diseño (el
  // Product Owner probó el diseño original, automático, y pidió control
  // manual): calcularConsolidacionPreview() sigue calculando el TECHO
  // (todo lo que el saldo seleccionado permite), pero ya no se aplica
  // solo — el operario elige cuánto de ese techo arma de verdad, con los
  // botones +/Agregar todas/− de abajo.
  const [cantidadAConsolidar, setCantidadAConsolidar] = useState(0);
  // Generado una sola vez por apertura del diálogo — mismo criterio
  // establecido en todo el proyecto desde el fix de S5-13 (RegistroConsolidacion
  // es una fila nueva con id de cliente, necesita el patrón completo de
  // idempotencia).
  const [id] = useState(() => crypto.randomUUID());

  const origenesSeleccionados = saldosDisponibles.filter((s) =>
    seleccionados.has(`${s.galponId}:${s.loteId}`),
  );
  const totalSeleccionado = origenesSeleccionados.reduce((acc, o) => acc + o.disponible, 0);
  const { unidades: unidadesMax } = calcularConsolidacionPreview(
    origenesSeleccionados.map((o) => ({
      galponId: o.galponId,
      loteId: o.loteId,
      disponible: o.disponible,
    })),
    unidadDestino,
  );
  const maxUnidades = unidadesMax.length;
  const totalAConsolidar = cantidadAConsolidar * unidadDestino;
  const sueltosSinConsolidar = totalSeleccionado - totalAConsolidar;

  // Redimensiona `pesos` para que su longitud siga siempre a
  // `cantidadAConsolidar` — usado tanto por los botones +/Agregar
  // todas/− como por toggleOrigen (cuando cambiar la selección obliga a
  // recortar la cantidad elegida porque el techo bajó).
  function redimensionarPesos(nuevaCantidad: number) {
    setPesos((anterior) => {
      if (nuevaCantidad === anterior.length) return anterior;
      if (nuevaCantidad < anterior.length) return anterior.slice(0, nuevaCantidad);
      return [...anterior, ...Array(nuevaCantidad - anterior.length).fill("")];
    });
  }

  // Cambia la cantidad elegida a mano (botones +1/−1/Agregar todas) — se
  // limita al techo real (`maxUnidades`), sin piso mínimo: el operario
  // puede bajar hasta 0 si se pasó de clics.
  function aplicarCantidad(nuevaCantidadDeseada: number) {
    const nuevaCantidad = Math.max(0, Math.min(nuevaCantidadDeseada, maxUnidades));
    setCantidadAConsolidar(nuevaCantidad);
    redimensionarPesos(nuevaCantidad);
  }

  function toggleOrigen(clave: string) {
    const siguiente = new Set(seleccionados);
    if (siguiente.has(clave)) siguiente.delete(clave);
    else siguiente.add(clave);
    setSeleccionados(siguiente);

    const nuevosOrigenes = saldosDisponibles.filter((s) => siguiente.has(`${s.galponId}:${s.loteId}`));
    const { unidades: nuevoTecho } = calcularConsolidacionPreview(
      nuevosOrigenes.map((o) => ({ galponId: o.galponId, loteId: o.loteId, disponible: o.disponible })),
      unidadDestino,
    );
    const nuevoMax = nuevoTecho.length;
    // Al aparecer saldo por primera vez (pasa de 0 a algo), se muestra
    // como mínimo 1 campo — el resto queda a elección del operario. Si ya
    // había unidades elegidas, se conservan mientras entren en el nuevo
    // techo; si el techo bajó, se recortan a lo que todavía cabe.
    const nuevaCantidad = nuevoMax === 0 ? 0 : Math.max(1, Math.min(cantidadAConsolidar, nuevoMax));
    setCantidadAConsolidar(nuevaCantidad);
    redimensionarPesos(nuevaCantidad);
  }

  function handlePesoChange(indice: number, value: string) {
    setPesos((anterior) => anterior.map((peso, i) => (i === indice ? value : peso)));
  }

  const accion = tipo === "PAQUETE_MIXTO" ? consolidarPaqueteMixtoAction : consolidarBandejaAction;

  // Payload como objeto plano, no FormData: `origenes`/`pesos` son
  // arreglos de longitud variable, mismo motivo que RegistrarRecoleccionDialog
  // (FormData + Object.fromEntries en with-auth.ts solo se queda con el
  // último valor de una clave repetida, no arma un arreglo).
  const [state, formAction, pending] = useActionState<Estado, ConsolidarSueltosPayload>(
    async (_prev, payload) => {
      const resultado = await accion(payload);
      if (resultado.ok) {
        router.refresh();
        toastManager.add({
          type: "success",
          title: `${etiquetaUnidad === "paquete" ? "Paquete mixto" : "Bandeja"} armado`,
          description: `${resultado.data.unidadesCreadas} ${etiquetaUnidad}${
            resultado.data.unidadesCreadas === 1 ? "" : "s"
          } de ${unidadDestino}`,
        });
        onExito();
      }
      return resultado;
    },
    undefined,
  );

  const pesosCompletos = pesos.every((peso) => Number(peso) > 0);
  const puedeGuardar = cantidadAConsolidar > 0 && pesosCompletos;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!puedeGuardar || pending) return;
        // startTransition: mismo motivo que RegistrarRecoleccionDialog —
        // useActionState() exige que su dispatch se invoque dentro de una
        // transición cuando no se llama vía <form action>.
        startTransition(() => {
          formAction({
            id,
            origenes: origenesSeleccionados.map((o) => ({ galponId: o.galponId, loteId: o.loteId })),
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
        <Label className={LABEL_COMPACTO}>Orígenes (galpón — lote)</Label>
        {saldosDisponibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay sueltos disponibles para consolidar.</p>
        ) : (
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
            {saldosDisponibles.map((saldo) => {
              const clave = `${saldo.galponId}:${saldo.loteId}`;
              const seleccionado = seleccionados.has(clave);
              return (
                <button
                  key={clave}
                  type="button"
                  aria-pressed={seleccionado}
                  onClick={() => toggleOrigen(clave)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors",
                    seleccionado ? "origen-seleccionado" : "border-border hover:bg-muted",
                  )}
                >
                  <span>
                    {saldo.galponNombre} — {saldo.loteCodigo}
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {saldo.disponible} sueltos
                    {seleccionado ? <Check className="size-4 text-primary" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {origenesSeleccionados.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
          {maxUnidades > 0 ? (
            <>
              <p className={LABEL_COMPACTO}>
                Vas a armar {cantidadAConsolidar} {etiquetaUnidad}
                {cantidadAConsolidar === 1 ? "" : "s"} de {unidadDestino} (podés armar hasta{" "}
                {maxUnidades} con lo seleccionado) — quedan {sueltosSinConsolidar} sueltos sin
                consolidar.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => aplicarCantidad(cantidadAConsolidar + 1)}
                  disabled={cantidadAConsolidar >= maxUnidades}
                >
                  <Plus data-icon="inline-start" />
                  Agregar {etiquetaUnidad}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => aplicarCantidad(maxUnidades)}
                  disabled={cantidadAConsolidar >= maxUnidades}
                >
                  <CheckCheck data-icon="inline-start" />
                  Agregar todas ({maxUnidades})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => aplicarCantidad(cantidadAConsolidar - 1)}
                  disabled={cantidadAConsolidar <= 0}
                >
                  <Minus data-icon="inline-start" />
                  Quitar
                </Button>
              </div>
            </>
          ) : (
            <p className={LABEL_COMPACTO}>
              No hay saldo suficiente para formar {etiquetaUnidad === "bandeja" ? "una" : "un"}{" "}
              {etiquetaUnidad} complet{etiquetaUnidad === "bandeja" ? "a" : "o"} (mínimo {unidadDestino}
              ).
            </p>
          )}

          {cantidadAConsolidar > 0 ? (
            <div className="flex flex-col gap-3">
              {pesos.map((peso, indice) => (
                <div key={indice} className="flex flex-col gap-1">
                  <Label htmlFor={`peso-${indice}`} className={LABEL_COMPACTO}>
                    Peso {etiquetaUnidad} {indice + 1} (kg)
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
        </div>
      ) : null}

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending || !puedeGuardar}>
          <Check data-icon="inline-start" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
