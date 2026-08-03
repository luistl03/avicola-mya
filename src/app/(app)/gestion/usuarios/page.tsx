import { notFound } from "next/navigation";

import { UsuarioFormDialog } from "@/components/domain/usuarios/usuario-form-dialog";
import { UsuariosTabla } from "@/components/domain/usuarios/usuarios-tabla";
import { auth } from "@/server/auth";
import { listarUsuarios } from "@/server/repositories/usuario";

export default async function UsuariosPage() {
  const session = await auth();
  // src/proxy.ts ya bloquea /gestion/* a quien no sea GERENTE (403, ver
  // server/auth/rbac.ts) — esto es una segunda capa de defensa, mismo
  // criterio que withAuth no confía únicamente en ese guard.
  if (session?.user?.rol !== "GERENTE") {
    notFound();
  }

  const usuarios = await listarUsuarios();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <UsuarioFormDialog modo="crear" />
      </div>
      <UsuariosTabla usuarios={usuarios} />
    </main>
  );
}
