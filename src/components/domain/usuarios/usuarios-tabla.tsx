"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoUsuario, Rol, Usuario } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UsuarioFormDialog } from "@/components/domain/usuarios/usuario-form-dialog";
import { cambiarEstadoUsuarioAction } from "@/server/actions/usuario";

const ROL_LABEL: Record<Rol, string> = {
  GERENTE: "Gerente",
  OPERARIO: "Operario",
};

export function UsuariosTabla({ usuarios }: { usuarios: Usuario[] }) {
  return (
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
  );
}

function UsuarioFila({ usuario }: { usuario: Usuario }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const proximoEstado: EstadoUsuario = usuario.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

  function alternarEstado() {
    setError(null);
    startTransition(async () => {
      const resultado = await cambiarEstadoUsuarioAction({
        usuarioId: usuario.id,
        estado: proximoEstado,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell>{usuario.usuario}</TableCell>
      <TableCell>{usuario.nombre}</TableCell>
      <TableCell>{ROL_LABEL[usuario.rol]}</TableCell>
      <TableCell>
        <Badge variant={usuario.estado === "ACTIVO" ? "default" : "secondary"}>
          {usuario.estado === "ACTIVO" ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <UsuarioFormDialog
            modo="editar"
            usuario={{
              id: usuario.id,
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
        {error ? (
          <p role="alert" className="mt-1 text-right text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
