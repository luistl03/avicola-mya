"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Cliente, EstadoCliente } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScrollArea } from "@/components/ui/table-scroll-area";
import { toastManager } from "@/components/ui/toast";
import { ClienteFormDialog } from "@/components/domain/clientes/cliente-form-dialog";
import { cambiarEstadoClienteAction } from "@/server/actions/cliente";
import { esClientePublicoGeneral } from "@/server/services/cliente";

const TIPO_LABEL: Record<Cliente["tipo"], string> = {
  MAYORISTA: "Mayorista",
  MINORISTA: "Minorista",
  EVENTUAL: "Eventual",
};

const TIPO_CLASE: Record<Cliente["tipo"], string> = {
  MAYORISTA: "badge-tipo-cliente-mayorista",
  MINORISTA: "badge-tipo-cliente-minorista",
  EVENTUAL: "badge-tipo-cliente-eventual",
};

export function ClientesTabla({ clientes }: { clientes: Cliente[] }) {
  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Celular</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientes.map((cliente) => (
            <ClienteFila key={cliente.id} cliente={cliente} />
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}

function ClienteFila({ cliente }: { cliente: Cliente }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const esPublicoGeneral = esClientePublicoGeneral(cliente.id);

  const proximoEstado: EstadoCliente = cliente.estado === "ACTIVO" ? "SUSPENDIDO" : "ACTIVO";

  function alternarEstado() {
    startTransition(async () => {
      const resultado = await cambiarEstadoClienteAction({
        clienteId: cliente.id,
        estado: proximoEstado,
      });
      if (!resultado.ok) {
        toastManager.add({
          type: "error",
          priority: "high",
          title: "No se pudo cambiar el estado",
          description: resultado.error,
        });
        return;
      }
      toastManager.add({
        type: "success",
        title: proximoEstado === "ACTIVO" ? "Cliente activado" : "Cliente suspendido",
        description: `${cliente.nombre} ahora está ${proximoEstado === "ACTIVO" ? "activo" : "suspendido"}.`,
      });
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell>{cliente.nombre}</TableCell>
      <TableCell>{cliente.celular ?? <span className="text-muted-foreground">-</span>}</TableCell>
      <TableCell>{cliente.direccion ?? <span className="text-muted-foreground">-</span>}</TableCell>
      <TableCell>
        <Badge variant="outline" className={TIPO_CLASE[cliente.tipo]}>
          {TIPO_LABEL[cliente.tipo]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant="secondary"
          className={cliente.estado === "ACTIVO" ? "badge-estado-activo" : "badge-estado-inactivo"}
        >
          {cliente.estado === "ACTIVO" ? "Activo" : "Suspendido"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {esPublicoGeneral ? (
            <span
              className="text-sm text-muted-foreground"
              title="Público General es el cliente del sistema para ventas de mostrador - no se puede editar ni suspender."
            >
              Cliente del sistema
            </span>
          ) : (
            <>
              <ClienteFormDialog modo="editar" cliente={cliente} />
              <Button
                type="button"
                variant={cliente.estado === "ACTIVO" ? "destructive" : "outline"}
                size="sm"
                disabled={pending}
                onClick={alternarEstado}
              >
                {cliente.estado === "ACTIVO" ? "Suspender" : "Activar"}
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
