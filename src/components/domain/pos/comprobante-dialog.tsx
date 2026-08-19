"use client";

import { useState } from "react";
import { CreditCard, Download, Receipt, Share2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toastManager } from "@/components/ui/toast";
import type { VentaCerradaData } from "@/components/domain/pos/pos-workspace";
import { generarComprobantePdf, nombreArchivoComprobante, type DatosComprobante } from "@/lib/pdf/comprobante";

const ETIQUETA_TIPO: Record<"PAQUETE" | "BANDEJA", string> = {
  PAQUETE: "Paquete",
  BANDEJA: "Bandeja",
};

const ETIQUETA_METODO_PAGO: Record<VentaCerradaData["metodoPago"], string> = {
  EFECTIVO: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  TRANSFERENCIA: "Transferencia",
};

function aDatosComprobante(venta: VentaCerradaData): DatosComprobante {
  return {
    ventaId: venta.id,
    fecha: new Date(venta.fecha),
    clienteNombre: venta.clienteNombre,
    vendedorNombre: venta.vendedorNombre,
    items: venta.items,
    descuento: venta.descuento,
    totalCobrado: venta.totalCobrado,
    metodoPago: venta.metodoPago,
    esCredito: venta.esCredito,
    montoContado: venta.montoContado,
    montoCredito: venta.montoCredito,
    fechaLimiteCredito: venta.fechaLimiteCredito ? new Date(venta.fechaLimiteCredito) : null,
  };
}

// Método de pago solo tiene sentido si se cobró algo AHORA — nunca en una
// venta 100% a crédito (montoContado: 0). Mismo criterio aplicado en
// PosCarrito y en el PDF (lib/pdf/comprobante.ts), pedido explícito del
// Product Owner tras cerrar Sprint 11.
function mostrarMetodoPago(venta: VentaCerradaData): boolean {
  return (venta.esCredito ? venta.montoContado : venta.totalCobrado) > 0;
}

// Se abre solo (el padre lo monta cuando hay datos que mostrar) — no es un
// <Dialog> disparado por un botón con trigger propio como el resto de
// dialogs del proyecto. Todos los datos vienen de VentaCerradaData, nunca
// del estado del carrito en memoria — ver "Corrección real encontrada al
// empezar S9-10" en tasks.md. Reusado en dos contextos: PosWorkspace lo
// monta cuando cerrarVentaAction responde éxito (venta recién cerrada,
// titulo por defecto "Venta cerrada"), y VentasTabla lo monta al hacer clic
// en "Ver detalle" sobre una venta ya cerrada (titulo="Detalle de venta") —
// mismo componente, mismo botón "Descargar PDF"/"Compartir" en ambos
// casos, sin duplicar el diseño del comprobante. mostrarAbonos (default
// false) separa el historial de pagos posteriores del documento de venta:
// PosWorkspace nunca lo pasa (una venta recién cerrada no tiene abonos
// todavía, mostrar la sección igual sería ruido); VentasTabla sí lo pasa en
// "Ver detalle" — pedido explícito del Product Owner para tener control de
// los abonos de una venta a crédito sin salir de /ventas. Nunca aparece en
// el PDF descargable (lib/pdf/comprobante.ts): el comprobante es el
// documento de la venta al momento de cerrarse, no un ledger que cambia.
export function ComprobanteDialog({
  venta,
  onCerrar,
  titulo = "Venta cerrada",
  mostrarAbonos = false,
}: {
  venta: VentaCerradaData;
  onCerrar: () => void;
  titulo?: string;
  mostrarAbonos?: boolean;
}) {
  const bruto = venta.totalCobrado + venta.descuento;
  const datosComprobante = aDatosComprobante(venta);
  // generarComprobantePdf() es async (carga el logo antes de armar el PDF,
  // ver lib/pdf/comprobante.ts) — este estado solo evita que un doble clic
  // dispare dos generaciones a la vez, no representa ningún guardado real.
  const [generando, setGenerando] = useState(false);

  async function descargarPdf() {
    setGenerando(true);
    try {
      const doc = await generarComprobantePdf(datosComprobante);
      doc.save(nombreArchivoComprobante(datosComprobante));
    } finally {
      setGenerando(false);
    }
  }

  // Web Share API con archivo adjunto (R3, spec.md) — no está garantizada
  // en todos los navegadores/dispositivos, y el protocolo wa.me no soporta
  // adjuntar un archivo (solo texto). Si navigator.canShare({ files }) no
  // existe o devuelve false, cae al mismo camino de descarga simple con un
  // aviso — nunca falla en silencio.
  async function compartir() {
    setGenerando(true);
    try {
      const doc = await generarComprobantePdf(datosComprobante);
      const nombreArchivo = nombreArchivoComprobante(datosComprobante);
      const archivo = new File([doc.output("blob")], nombreArchivo, { type: "application/pdf" });

      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [archivo] })) {
        try {
          await navigator.share({
            files: [archivo],
            title: `Comprobante — ${venta.clienteNombre}`,
            text: `Comprobante de venta — ${venta.clienteNombre}`,
          });
        } catch {
          // El operario canceló el selector nativo de compartir, o falló a
          // mitad de camino — no es un error real que reportar, el
          // comprobante sigue disponible con "Descargar PDF".
        }
        return;
      }

      doc.save(nombreArchivo);
      toastManager.add({
        type: "info",
        title: "Tu navegador no soporta compartir archivos directamente",
        description: "Se descargó el PDF — podés adjuntarlo a mano en WhatsApp.",
      });
    } finally {
      setGenerando(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCerrar();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Receipt className="size-4 text-primary" />
            {titulo}
          </DialogTitle>
          <DialogDescription>Comprobante interno.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          {/* Tipo de venta, explícito desde el principio del comprobante
          — no solo inferible por la presencia del bloque de crédito más
          abajo (pedido explícito del Product Owner: "debe estar
          especificado"). Mismo criterio visual que la columna "Tipo" de
          /ventas: badge-estado-activo (ámbar) para crédito recién
          creado (siempre PENDIENTE en este momento), outline neutro
          para contado. */}
          <div>
            <Badge variant="outline" className={venta.esCredito ? "badge-estado-activo" : undefined}>
              {venta.esCredito ? <CreditCard data-icon="inline-start" /> : null}
              {venta.esCredito ? "Venta a crédito" : "Venta al contado"}
            </Badge>
          </div>

          <div className="flex flex-col gap-1">
            <p>
              <span className="text-muted-foreground">Cliente:</span> {venta.clienteNombre}
            </p>
            <p>
              <span className="text-muted-foreground">Vendedor:</span> {venta.vendedorNombre}
            </p>
            <p>
              <span className="text-muted-foreground">Fecha:</span>{" "}
              {new Date(venta.fecha).toLocaleString("es-PE", { timeZone: "America/Lima" })}
            </p>
          </div>

          <ul className="flex flex-col gap-1 rounded-md border border-border p-2">
            {venta.items.map((item, indice) => (
              <li key={indice} className="flex justify-between text-muted-foreground">
                <span>
                  {ETIQUETA_TIPO[item.tipo]} — {item.pesoKg.toFixed(3)} kg
                </span>
                <span>S/ {item.subtotal.toFixed(2)}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Bruto</span>
              <span>S/ {bruto.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Descuento</span>
              <span>S/ {venta.descuento.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold text-foreground">
              <span>Total cobrado</span>
              <span>S/ {venta.totalCobrado.toFixed(2)}</span>
            </div>
            {/* Método de pago solo tiene sentido si se cobró algo AHORA —
            en una venta a crédito se muestra dentro del bloque de abajo
            (junto a "Pagado ahora"), no acá. */}
            {!venta.esCredito && mostrarMetodoPago(venta) ? (
              <p className="text-muted-foreground">Método de pago: {ETIQUETA_METODO_PAGO[venta.metodoPago]}</p>
            ) : null}
          </div>

          {venta.esCredito ? (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2">
              <p className="font-medium text-foreground">Desglose del pago</p>
              <div className="flex justify-between text-muted-foreground">
                <span>Pagado ahora</span>
                <span>S/ {venta.montoContado.toFixed(2)}</span>
              </div>
              {mostrarMetodoPago(venta) ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Método de pago</span>
                  <span>{ETIQUETA_METODO_PAGO[venta.metodoPago]}</span>
                </div>
              ) : null}
              <div className="flex justify-between font-medium text-foreground">
                <span>A crédito</span>
                <span>S/ {(venta.montoCredito ?? 0).toFixed(2)}</span>
              </div>
              {/* Solo en "Ver detalle" (mostrarAbonos): en una venta recién
              cerrada el saldo pendiente es siempre igual a "A crédito" (0
              abonos todavía) — mostrarlo ahí sería una línea redundante.
              "A crédito" arriba es el monto financiado AL CERRAR la venta,
              fijo; el saldo sí baja con cada abono registrado después
              (Credito.montoPagado, repositories/credito.ts). */}
              {mostrarAbonos ? (
                <div className="flex justify-between font-medium text-foreground">
                  <span>Saldo pendiente</span>
                  <span>S/ {((venta.montoCredito ?? 0) - (venta.montoPagado ?? 0)).toFixed(2)}</span>
                </div>
              ) : null}
              {venta.fechaLimiteCredito ? (
                <p className="text-muted-foreground">
                  Vence:{" "}
                  {/* fechaLimiteCredito es una fecha-calendario pura
                  (medianoche UTC, sin componente de hora — mismo criterio
                  que hoyEnLima()/D5), no un instante real como venta.fecha.
                  Formatearla con timeZone: "America/Lima" le restaría un
                  día (medianoche UTC cae la noche anterior en Lima,
                  UTC-5) — se formatea en UTC para recuperar exactamente el
                  día calendario que se guardó. */}
                  {new Date(venta.fechaLimiteCredito).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                </p>
              ) : null}
            </div>
          ) : null}

          {venta.esCredito && mostrarAbonos ? (
            <div className="flex flex-col gap-1 rounded-md border border-border p-2">
              <p className="font-medium text-foreground">Historial de abonos</p>
              {venta.abonos.length === 0 ? (
                <p className="text-muted-foreground">Sin abonos registrados todavía.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {venta.abonos.map((abono) => (
                    <li key={abono.id} className="flex justify-between gap-2 text-muted-foreground">
                      <span>
                        {new Date(abono.fecha).toLocaleString("es-PE", { timeZone: "America/Lima" })} —{" "}
                        {ETIQUETA_METODO_PAGO[abono.metodoPago]}
                      </span>
                      <span className="shrink-0">S/ {abono.monto.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="md" disabled={generando} onClick={descargarPdf}>
            <Download data-icon="inline-start" />
            Descargar PDF
          </Button>
          <Button type="button" variant="default" size="md" disabled={generando} onClick={compartir}>
            <Share2 data-icon="inline-start" />
            {generando ? "Generando..." : "Compartir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
