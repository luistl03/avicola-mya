import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScrollArea } from "@/components/ui/table-scroll-area";
import { formatearFechaHora } from "@/lib/fecha";

// Forma exacta de lo que devuelve listarPrecioKilo()
// (server/repositories/precioKilo.ts) — mismo criterio que
// MortalidadTabla/EgresosTabla. La primera fila (la más reciente) es
// siempre el precio vigente que ya muestra la tarjeta de arriba —
// redundante a propósito, mismo espíritu que cualquier historial que
// incluye el estado actual como su entrada más nueva.
type PrecioKiloConDatos = {
  id: string;
  precio: number;
  vigenteDesde: Date;
  usuario: { nombre: string };
};

export function PrecioKiloTabla({ precios }: { precios: PrecioKiloConDatos[] }) {
  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vigente desde</TableHead>
            <TableHead>Precio (S/)</TableHead>
            <TableHead>Fijado por</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {precios.map((precio) => (
            <TableRow key={precio.id}>
              <TableCell>{formatearFechaHora(precio.vigenteDesde)}</TableCell>
              <TableCell>S/ {precio.precio.toFixed(2)}</TableCell>
              <TableCell>{precio.usuario.nombre}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}
