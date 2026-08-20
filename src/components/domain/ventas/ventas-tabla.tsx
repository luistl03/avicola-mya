"use client";

import { useState } from "react";
import type { MetodoPago } from "@prisma/client";
import { Eye } from "lucide-react";

import { ComprobanteDialog } from "@/components/domain/pos/comprobante-dialog";
import type { VentaCerradaData } from "@/components/domain/pos/pos-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableScrollArea } from "@/components/ui/table-scroll-area";
import { formatearFechaHora } from "@/lib/fecha";
import { obtenerDetalleVentaAction } from "@/server/actions/venta";

const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  TRANSFERENCIA: "Transferencia",
};

// Forma exacta de lo que devuelve listarVentas() (server/repositories/venta.ts)
// — mismo criterio que MortalidadTabla/LotesTabla: reconstruida a mano en
// vez de importar el tipo de retorno del repository.
type VentaConDatos = {
  id: string;
  fecha: Date;
  totalCobrado: number; // Decimal convertido a number antes de llegar acá (Server Component, ver page.tsx) — obligatorio: VentasTabla es Client Component, no puede recibir un Decimal por props.
  montoContado: number; // idem
  metodoPago: MetodoPago;
  cliente: { nombre: string };
  usuario: { nombre: string };
  credito: { estado: "PENDIENTE" | "LIQUIDADO" } | null;
  _count: { detalles: number };
};

// "use client" (a diferencia de la versión original, Server Component puro):
// necesita estado para el botón "Ver detalle" por fila, que llama a
// obtenerDetalleVentaAction (lectura, no pasa por withAuth) y reabre el
// mismo ComprobanteDialog que arma PosWorkspace al cerrar una venta nueva —
// con titulo="Detalle de venta" para distinguir el contexto. Sugerencia
// aceptada por el Product Owner tras cerrar los ajustes de comprobante.
export function VentasTabla({ ventas }: { ventas: VentaConDatos[] }) {
  const [detalle, setDetalle] = useState<VentaCerradaData | null>(null);
  const [cargandoId, setCargandoId] = useState<string | null>(null);

  async function verDetalle(id: string) {
    setCargandoId(id);
    try {
      const resultado = await obtenerDetalleVentaAction(id);
      if (!resultado.ok) {
        toastManager.add({ type: "error", title: "No se pudo abrir el detalle", description: resultado.error });
        return;
      }
      setDetalle(resultado.data);
    } finally {
      setCargandoId(null);
    }
  }

  return (
    <>
      <TableScrollArea>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Ítems</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Método de pago</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ventas.map((venta) => (
              <TableRow key={venta.id}>
                <TableCell>{formatearFechaHora(venta.fecha)}</TableCell>
                <TableCell>{venta.cliente.nombre}</TableCell>
                <TableCell>{venta.usuario.nombre}</TableCell>
                <TableCell>{venta._count.detalles}</TableCell>
                <TableCell>S/ {Number(venta.totalCobrado).toFixed(2)}</TableCell>
                {/* Método de pago solo tiene sentido si se cobró algo AHORA
                — en una venta 100% a crédito (montoContado: 0) mostrar
                "Efectivo" sería un dato técnico sin significado real
                (nunca se cobró nada por ese medio). Mismo criterio que
                PosCarrito/ComprobanteDialog/PDF. */}
                <TableCell>
                  {Number(venta.montoContado) > 0 ? (
                    ETIQUETA_METODO_PAGO[venta.metodoPago]
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {venta.credito ? (
                    <Badge
                      variant="outline"
                      className={venta.credito.estado === "PENDIENTE" ? "badge-estado-activo" : "badge-estado-inactivo"}
                    >
                      Crédito {venta.credito.estado === "PENDIENTE" ? "pendiente" : "liquidado"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Contado</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={cargandoId === venta.id}
                    onClick={() => verDetalle(venta.id)}
                  >
                    <Eye data-icon="inline-start" />
                    Ver detalle
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScrollArea>

      {detalle ? (
        <ComprobanteDialog
          venta={detalle}
          onCerrar={() => setDetalle(null)}
          titulo="Detalle de venta"
          mostrarAbonos
        />
      ) : null}
    </>
  );
}
