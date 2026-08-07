"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoUsuario, Rol, Usuario } from "@prisma/client";

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
import { UsuarioFormDialog } from "@/components/domain/usuarios/usuario-form-dialog";
import { cambiarEstadoUsuarioAction } from "@/server/actions/usuario";

const ROL_LABEL: Record<Rol, string> = {
  GERENTE: "Gerente",
  OPERARIO: "Operario",
};

export function UsuariosTabla({ usuarios }: { usuarios: Usuario[] }) {
  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuario</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((usuario) => (
            <UsuarioFila key={usuario.id} usuario={usuario} />
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}

function UsuarioFila({ usuario }: { usuario: Usuario }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const proximoEstado: EstadoUsuario = usuario.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

  function alternarEstado() {
    startTransition(async () => {
      const resultado = await cambiarEstadoUsuarioAction({
        usuarioId: usuario.id,
        estado: proximoEstado,
      });
      if (!resultado.ok) {
        // priority: "high" — se anuncia de inmediato a lectores de pantalla
        // (antes esto vivía en un <p role="alert"> propio de la fila; el
        // toast reemplaza esa función además de dar feedback visual).
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
        title: proximoEstado === "ACTIVO" ? "Usuario activado" : "Usuario desactivado",
        description: `${usuario.nombre} ahora está ${proximoEstado === "ACTIVO" ? "activo" : "inactivo"}.`,
      });
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell>{usuario.usuario}</TableCell>
      <TableCell>{usuario.nombre}</TableCell>
      <TableCell>{ROL_LABEL[usuario.rol]}</TableCell>
      <TableCell>
        <Badge
          variant="secondary"
          className={usuario.estado === "ACTIVO" ? "badge-estado-activo" : "badge-estado-inactivo"}
        >
          {usuario.estado === "ACTIVO" ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <UsuarioFormDialog
            modo="editar"
            usuario={{
              id: usuario.id,
              usuario: usuario.usuario,
              nombre: usuario.nombre,
              celular: usuario.celular,
              email: usuario.email,
            }}
          />
          <Button
            type="button"
            variant={usuario.estado === "ACTIVO" ? "destructive" : "outline"}
            size="sm"
            disabled={pending}
            onClick={alternarEstado}
          >
            {usuario.estado === "ACTIVO" ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
