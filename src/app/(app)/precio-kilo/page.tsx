import { notFound } from "next/navigation";

import { ActualizarPrecioDialog } from "@/components/domain/precio-kilo/actualizar-precio-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/server/auth";
import { obtenerPrecioKiloVigente } from "@/server/repositories/precioKilo";

export default async function PrecioKiloPage() {
  const session = await auth();
  // src/proxy.ts ya bloquea /precio-kilo a quien no sea GERENTE (403, ver
  // server/auth/rbac.ts) — esto es una segunda capa de defensa, mismo
  // criterio que galpones/page.tsx, lotes/page.tsx, usuarios/page.tsx.
  if (session?.user?.rol !== "GERENTE") {
    notFound();
  }

  const vigente = await obtenerPrecioKiloVigente();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Precio por Kilo" actions={<ActualizarPrecioDialog />} />
      {vigente ? (
        <div className="rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground">Precio vigente</p>
          <p className="text-3xl font-semibold text-foreground">S/ {Number(vigente.precio).toFixed(2)}</p>
          <p className="text-sm text-muted-foreground">
            Fijado por {vigente.usuario.nombre} el{" "}
            {vigente.vigenteDesde.toLocaleDateString("es-PE", { timeZone: "America/Lima" })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay ningún precio fijado.</p>
      )}
    </div>
  );
}
