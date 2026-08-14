"use client";

import { useState } from "react";
import { Download, Receipt, Share2 } from "lucide-react";

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
  };
}

// Se abre solo (el padre, PosWorkspace, lo monta cuando cerrarVentaAction
// responde éxito) — no es un <Dialog> disparado por un botón como el resto
// de dialogs del proyecto. Todos los datos vienen de VentaCerradaData
// (la respuesta real de la Server Action), nunca del estado del carrito en
// memoria — ver "Corrección real encontrada al empezar S9-10" en tasks.md.
export function ComprobanteDialog({
  venta,
  onCerrar,
}: {
  venta: VentaCerradaData;
  onCerrar: () => void;
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
            Venta cerrada
          </DialogTitle>
          <DialogDescription>Comprobante interno.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
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
            <p className="text-muted-foreground">Método de pago: {ETIQUETA_METODO_PAGO[venta.metodoPago]}</p>
          </div>
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
