import { PantallaPendientes } from "@/components/domain/offline/pantalla-pendientes";
import { PageHeader } from "@/components/layout/page-header";

// Sin fetch de Prisma — la cola vive enteramente en IndexedDB del
// dispositivo, no hay nada que un Server Component pueda precargar acá
// (mismo motivo que R4, spec.md Sprint 13: este sprint no tiene capa de
// repositories que testear para esta pantalla). Sin restricción de rol en
// server/auth/rbac.ts (decisión de negocio 5): cualquier autenticado ve
// la cola de su propio dispositivo.
export default function PendientesPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="Pendientes de sincronizar"
        description="Registros guardados sin señal en este dispositivo, a la espera de enviarse al servidor."
      />
      <PantallaPendientes />
    </div>
  );
}
