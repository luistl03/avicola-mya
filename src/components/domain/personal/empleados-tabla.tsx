import Link from "next/link";
import type { EstadoEmpleado } from "@prisma/client";
import { Eye } from "lucide-react";

import { EmpleadoEstadoBoton } from "@/components/domain/personal/empleado-estado-boton";
import { EmpleadoFormDialog } from "@/components/domain/personal/empleado-form-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScrollArea } from "@/components/ui/table-scroll-area";
import { cn } from "@/lib/utils";

type Empleado = {
  id: string;
  nombre: string;
  celular: string | null;
  cargo: string | null;
  estado: EstadoEmpleado;
};

export function EmpleadosTabla({ empleados }: { empleados: Empleado[] }) {
  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Celular</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {empleados.map((empleado) => (
            <EmpleadoFila key={empleado.id} empleado={empleado} />
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}

function EmpleadoFila({ empleado }: { empleado: Empleado }) {
  return (
    <TableRow>
      <TableCell>{empleado.nombre}</TableCell>
      <TableCell>{empleado.celular ?? "-"}</TableCell>
      <TableCell>{empleado.cargo ?? "-"}</TableCell>
      <TableCell>
        <Badge
          variant="secondary"
          className={empleado.estado === "ACTIVO" ? "badge-estado-activo" : "badge-estado-inactivo"}
        >
          {empleado.estado === "ACTIVO" ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/personal/${empleado.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Eye data-icon="inline-start" />
            Ver detalle
          </Link>
          <EmpleadoFormDialog modo="editar" empleado={empleado} />
          <EmpleadoEstadoBoton empleado={empleado} />
        </div>
      </TableCell>
    </TableRow>
  );
}
