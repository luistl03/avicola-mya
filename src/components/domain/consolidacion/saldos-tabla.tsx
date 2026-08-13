import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableScrollArea } from "@/components/ui/table-scroll-area";

// Forma exacta de lo que devuelve listarInventarioSueltosConSaldo()
// (server/repositories/inventario.ts), reconstruida a mano — mismo
// criterio que RecoleccionesTabla/MortalidadTabla en vez de importar el
// tipo de retorno del repository.
type InventarioSueltosConSaldo = {
  id: string;
  cantidad: number;
  galpon: { nombre: string };
  lote: { codigo: string };
};

// Tabla de solo lectura para /consolidacion — sin paginación (mismo
// criterio que listarInventarioSueltosConSaldo: pocas combinaciones
// galpón/lote por granja). No se ocultan filas con cantidad = 0: es
// información real del sistema (ver H1 en spec.md).
export function SaldosTabla({ saldos }: { saldos: InventarioSueltosConSaldo[] }) {
  if (saldos.length === 0) {
    return <p className="text-muted-foreground">Todavía no hay sueltos registrados.</p>;
  }

  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Galpón</TableHead>
            <TableHead>Lote</TableHead>
            <TableHead>Sueltos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {saldos.map((saldo) => (
            <TableRow key={saldo.id}>
              <TableCell>{saldo.galpon.nombre}</TableCell>
              <TableCell>{saldo.lote.codigo}</TableCell>
              <TableCell>{saldo.cantidad}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}
