import type { TipoMortalidad } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
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
import { RevertirMortalidadBoton } from "@/components/domain/mortalidad/revertir-mortalidad-boton";

// Forma exacta de lo que devuelve listarRegistrosMortalidad()
// (server/repositories/mortalidad.ts), reconstruida a mano en vez de
// importar el tipo de retorno del repository — mismo criterio que
// LotesTabla/GalponesTabla (Sprint 3). `revertido` agregado post-Sprint 4
// (ventana de gracia).
type RegistroMortalidadConDatos = {
  id: string;
  fecha: Date;
  tipo: TipoMortalidad;
  cantidad: number;
  revertido: boolean;
  lote: { codigo: string };
  galpon: { nombre: string };
  usuario: { nombre: string };
};

// Un color por tipo (a pedido del Product Owner, revierte la decisión
// original de "variant=outline alcanza" — ver globals.css,
// .badge-tipo-muerte/.badge-tipo-descarte, para el porqué de cada tono):
// ayuda a distinguir de un vistazo en una tabla con muchos registros.
const TIPO_LABEL: Record<TipoMortalidad, string> = {
  MUERTE: "Muerte",
  DESCARTE: "Descarte",
};

const TIPO_CLASE: Record<TipoMortalidad, string> = {
  MUERTE: "badge-tipo-muerte",
  DESCARTE: "badge-tipo-descarte",
};

export function MortalidadTabla({ registros }: { registros: RegistroMortalidadConDatos[] }) {
  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Lote</TableHead>
            <TableHead>Galpón</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cantidad</TableHead>
            <TableHead>Registrado por</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registros.map((registro) => (
            <TableRow
              key={registro.id}
              className={registro.revertido ? "opacity-60" : undefined}
            >
              <TableCell>{formatearFechaHora(registro.fecha)}</TableCell>
              <TableCell>{registro.lote.codigo}</TableCell>
              <TableCell>{registro.galpon.nombre}</TableCell>
              <TableCell>
                <Badge variant="outline" className={TIPO_CLASE[registro.tipo]}>
                  {TIPO_LABEL[registro.tipo]}
                </Badge>
              </TableCell>
              <TableCell className={registro.revertido ? "line-through" : undefined}>
                {registro.cantidad}
              </TableCell>
              <TableCell>{registro.usuario.nombre}</TableCell>
              <TableCell className="text-right">
                <RevertirMortalidadBoton registro={registro} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}
