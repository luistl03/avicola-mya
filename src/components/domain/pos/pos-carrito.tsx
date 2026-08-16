"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { Check, ShoppingCart, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { DescuentoInput } from "@/components/domain/pos/descuento-input";
import { MetodoPagoSelect, type MetodoPago } from "@/components/domain/pos/metodo-pago-select";
import type { ItemCarrito, VentaCerradaData } from "@/components/domain/pos/pos-workspace";
import { fechaLimiteCreditoSugerida, VentaCreditoFields } from "@/components/domain/pos/venta-credito-fields";
import { CLIENTE_PUBLICO_GENERAL_ID } from "@/lib/constants";
import { cerrarVentaAction } from "@/server/actions/venta";
import type { ActionResult } from "@/server/auth/with-auth";

type Estado = ActionResult<VentaCerradaData> | undefined;

type VentaPayload = {
  id: string;
  clienteId: string;
  items: { tipo: "PAQUETE" | "BANDEJA"; id: string }[];
  descuento: number;
  metodoPago: MetodoPago;
  esCredito: boolean;
  montoContado?: number;
  fechaLimiteCredito?: string;
};

function redondearCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// Owns la sumisión real de cerrarVentaAction — mismo criterio que
// RegistrarRecoleccionForm (el Form llama a la action, no delega a un
// padre) y que el payload como objeto plano en vez de FormData (`items`
// tiene longitud variable). bruto/totalCobrado calculados acá son solo un
// PREVIEW con precioKiloVigente (fetched una vez al cargar la página) —
// el valor real y autoritativo siempre lo resuelve el servidor
// (cerrarVentaAction relee precio y peso reales, ver H2 en spec.md).
export function PosCarrito({
  items,
  clienteId,
  precioKiloVigente,
  onQuitar,
  onVentaCerrada,
}: {
  items: ItemCarrito[];
  clienteId: string;
  precioKiloVigente: number;
  onQuitar: (id: string) => void;
  onVentaCerrada: (venta: VentaCerradaData) => void;
}) {
  const [descuentoInput, setDescuentoInput] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");
  // Sprint 11 — venta a crédito. clienteEsPublicoGeneral bloquea el toggle
  // (H2, spec.md) — el guard real vive en el servidor (cerrarVentaAction).
  // esCreditoEfectivo (derivado en cada render, no sincronizado con un
  // useEffect — mismo criterio que "Tabla paginada vs. muro con scroll
  // infinito" en convenciones.md: sincronizar props→state con setState
  // dentro de un effect genera renders en cascada) ignora el toggle
  // guardado si el cliente seleccionado cambia a Público General a mitad
  // de armar el carrito, sin necesidad de resetear esCredito a mano.
  const clienteEsPublicoGeneral = clienteId === CLIENTE_PUBLICO_GENERAL_ID;
  const [esCredito, setEsCredito] = useState(false);
  const esCreditoEfectivo = esCredito && !clienteEsPublicoGeneral;
  const [montoContadoInput, setMontoContadoInput] = useState("0");
  const [fechaLimiteInput, setFechaLimiteInput] = useState(() => fechaLimiteCreditoSugerida());
  // Generado una sola vez por intento de checkout, no en cada clic — mismo
  // motivo que RegistrarRecoleccionDialog (bug real de S5-13): reusado
  // entre reintentos tras un error de validación, para que la protección
  // de idempotencia por id (server/actions/venta.ts) siga aplicando.
  // Regenerado explícitamente solo tras un cierre exitoso (ver reducer más
  // abajo) — nunca en cada render.
  const [ventaId, setVentaId] = useState(() => crypto.randomUUID());

  const bruto = useMemo(
    () => redondearCentavos(items.reduce((suma, item) => suma + item.pesoKg * precioKiloVigente, 0)),
    [items, precioKiloVigente],
  );
  const descuento = Number(descuentoInput) || 0;
  // Preview cliente-side del mismo guard que validarDescuento()
  // (server/services/venta.ts) — evita un viaje de ida y vuelta con un
  // error obvio; el servidor lo vuelve a validar siempre, con el bruto
  // real, no este preview.
  const descuentoValido = descuento >= 0 && descuento <= bruto;
  const totalCobrado = redondearCentavos(bruto - (descuentoValido ? descuento : 0));

  // Preview cliente-side del mismo guard que validarMontoContado()
  // (server/services/venta.ts) — el servidor siempre revalida con los
  // valores reales.
  const montoContado = Number(montoContadoInput) || 0;
  const montoContadoValido = !esCreditoEfectivo || (montoContado >= 0 && montoContado <= totalCobrado);

  const [state, formAction, pending] = useActionState<Estado, VentaPayload>(async (_prev, payload) => {
    const resultado = await cerrarVentaAction(payload);
    if (resultado.ok) {
      toastManager.add({
        type: "success",
        title: "Venta cerrada",
        description: `Total cobrado: S/ ${resultado.data.totalCobrado.toFixed(2)}`,
      });
      onVentaCerrada(resultado.data);
      // Nuevo intento de checkout desde cero — el carrito en sí lo limpia
      // el padre (PosWorkspace) recién al cerrar el comprobante, no acá.
      setVentaId(crypto.randomUUID());
      setDescuentoInput("");
      setMetodoPago("EFECTIVO");
      setEsCredito(false);
      setMontoContadoInput("0");
      setFechaLimiteInput(fechaLimiteCreditoSugerida());
    }
    return resultado;
  }, undefined);

  const puedeCerrar = items.length > 0 && descuentoValido && montoContadoValido && !pending;

  return (
    <div className="flex h-fit flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="size-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Carrito ({items.length})</p>
      </div>

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Agrega paquetes o bandejas del selector.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <Badge variant="outline">{item.tipo === "PAQUETE" ? "Paquete" : "Bandeja"}</Badge>
                {item.pesoKg.toFixed(3)} kg — S/ {(item.pesoKg * precioKiloVigente).toFixed(2)}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => onQuitar(item.id)}>
                <X data-icon="inline-start" />
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <DescuentoInput
          value={descuentoInput}
          onChange={setDescuentoInput}
          error={!descuentoValido ? "El descuento no puede superar el total de la venta." : undefined}
        />
        {/* Método de pago vive en su posición habitual (acá, debajo de
        Descuento) mientras la venta es al contado; en cuanto se activa
        "Venta a crédito" se reubica dentro de VentaCreditoFields, debajo
        de "Monto al contado" — mismo <select> controlado, solo cambia
        dónde se monta, para que quede junto al resto de los datos de la
        parte al contado en vez de separado arriba del todo. */}
        {!esCreditoEfectivo ? <MetodoPagoSelect value={metodoPago} onChange={setMetodoPago} /> : null}

        <VentaCreditoFields
          esCredito={esCreditoEfectivo}
          onEsCreditoChange={setEsCredito}
          disabled={clienteEsPublicoGeneral}
          montoContado={montoContadoInput}
          onMontoContadoChange={setMontoContadoInput}
          errorMontoContado={!montoContadoValido ? "El monto al contado no puede superar el total de la venta." : undefined}
          fechaLimite={fechaLimiteInput}
          onFechaLimiteChange={setFechaLimiteInput}
          metodoPagoSlot={
            esCreditoEfectivo ? <MetodoPagoSelect value={metodoPago} onChange={setMetodoPago} /> : null
          }
        />

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Bruto</span>
            <span>S/ {bruto.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold text-foreground">
            <span>Total a cobrar</span>
            <span>S/ {totalCobrado.toFixed(2)}</span>
          </div>
        </div>

        <Button
          type="button"
          variant="default"
          disabled={!puedeCerrar}
          onClick={() => {
            if (!puedeCerrar) return;
            startTransition(() => {
              formAction({
                id: ventaId,
                clienteId,
                items: items.map((item) => ({ tipo: item.tipo, id: item.id })),
                descuento,
                metodoPago,
                esCredito: esCreditoEfectivo,
                montoContado: esCreditoEfectivo ? montoContado : undefined,
                fechaLimiteCredito: esCreditoEfectivo ? fechaLimiteInput : undefined,
              });
            });
          }}
        >
          <Check data-icon="inline-start" />
          {pending ? "Cerrando..." : "Cerrar venta"}
        </Button>
      </div>
    </div>
  );
}
