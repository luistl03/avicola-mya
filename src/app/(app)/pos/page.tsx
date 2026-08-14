import { PosWorkspace } from "@/components/domain/pos/pos-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { CLIENTE_PUBLICO_GENERAL_ID } from "@/lib/constants";
import { buscarClientePorId } from "@/server/repositories/cliente";
import { obtenerPrecioKiloVigente } from "@/server/repositories/precioKilo";
import { listarBandejasDisponibles, listarPaquetesDisponibles } from "@/server/repositories/venta";

// Sin guard de rol: /pos queda abierta a GERENTE y OPERARIO por igual
// (decisión de negocio 2, spec.md) — no hay entrada para /pos en
// server/auth/rbac.ts.
export default async function PosPage() {
  const [paquetes, bandejas, precioVigente, clientePublicoGeneral] = await Promise.all([
    listarPaquetesDisponibles(),
    listarBandejasDisponibles(),
    obtenerPrecioKiloVigente(),
    // "Público General" preseleccionado (decisión de negocio 4, spec.md) —
    // el nombre real se lee de la fila real, nunca hardcodeado como texto
    // en un Client Component (Público General no se puede editar, pero
    // igual la fuente de verdad es la base, no un string duplicado).
    buscarClientePorId(CLIENTE_PUBLICO_GENERAL_ID),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Punto de Venta" />

      {!precioVigente ? (
        <p className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          No hay ningún precio por kilo configurado — pedile a un Gerente que lo fije en{" "}
          <a href="/precio-kilo" className="text-primary underline underline-offset-4">
            Precio por Kilo
          </a>
          .
        </p>
      ) : clientePublicoGeneral ? (
        <PosWorkspace
          // Decimal de Prisma nunca cruza el límite Server→Client Component
          // (no es un objeto plano serializable, mismo tipo de restricción
          // que ya documentó el bug real de RSC de Sprint 7 con un
          // componente de ícono) — se convierte a number acá, en el Server
          // Component, antes de pasarlo a PosWorkspace.
          paquetesDisponibles={paquetes.map((paquete) => ({ id: paquete.id, peso: Number(paquete.peso) }))}
          bandejasDisponibles={bandejas.map((bandeja) => ({ id: bandeja.id, peso: Number(bandeja.peso) }))}
          precioKiloVigente={Number(precioVigente.precio)}
          clienteInicial={{ id: clientePublicoGeneral.id, nombre: clientePublicoGeneral.nombre }}
        />
      ) : (
        // Defensivo: "Público General" es un registro sembrado desde
        // prisma/seed.ts (Sprint 0) que nunca se borra (Cliente no permite
        // DELETE físico) — este caso no debería ocurrir en la práctica,
        // pero evita que la página reviente si alguna vez pasara.
        <p className="text-sm text-destructive">
          No se encontró el cliente &quot;Público General&quot; — contactá a soporte.
        </p>
      )}
    </div>
  );
}
