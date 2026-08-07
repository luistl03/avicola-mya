import { notFound } from "next/navigation";

import { UsuarioFormDialog } from "@/components/domain/usuarios/usuario-form-dialog";
import { UsuariosTabla } from "@/components/domain/usuarios/usuarios-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { auth } from "@/server/auth";
import { contarUsuarios, listarUsuarios } from "@/server/repositories/usuario";

// Mismo tamaño de página que se documentó como estándar para toda tabla de
// gestión del proyecto (memory/convenciones.md) — no es un número elegido
// solo para Usuarios.
const PAGE_SIZE = 10;

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  // src/proxy.ts ya bloquea /usuarios a quien no sea GERENTE (403, ver
  // server/auth/rbac.ts) — esto es una segunda capa de defensa, mismo
  // criterio que withAuth no confía únicamente en ese guard.
  if (session?.user?.rol !== "GERENTE") {
    notFound();
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [usuarios, total] = await Promise.all([
    listarUsuarios({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    contarUsuarios(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Usuarios" actions={<UsuarioFormDialog modo="crear" />} />
      <UsuariosTabla usuarios={usuarios} />
      <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/usuarios" />
    </div>
  );
}
