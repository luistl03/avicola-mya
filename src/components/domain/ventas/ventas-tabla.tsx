import type { MetodoPago } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableScrollArea } from "@/components/ui/table-scroll-area";
import { formatearFechaHora } from "@/lib/fecha";

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
  totalCobrado: unknown; // Decimal — convertido a number antes de llegar acá (Server Component, ver page.tsx)
  metodoPago: MetodoPago;
  cliente: { nombre: string };
  usuario: { nombre: string };
  credito: { estado: "PENDIENTE" | "LIQUIDADO" } | null;
  _count: { detalles: number };
};

export function VentasTabla({ ventas }: { ventas: VentaConDatos[] }) {
  return (
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
              <TableCell>{ETIQUETA_METODO_PAGO[venta.metodoPago]}</TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}
