import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { EmpleadoEstadoBoton } from "@/components/domain/personal/empleado-estado-boton";
import { EmpleadoFormDialog } from "@/components/domain/personal/empleado-form-dialog";
import { NetoMensualCard } from "@/components/domain/personal/neto-mensual-card";
import { SueldoMovimientoFormDialog } from "@/components/domain/personal/sueldo-movimiento-form-dialog";
import { SueldoMovimientosTabla } from "@/components/domain/personal/sueldo-movimientos-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buscarEmpleadoPorId } from "@/server/repositories/empleado";
import {
  listarSueldoMovimientosEnRango,
  listarSueldoMovimientosPorEmpleado,
} from "@/server/repositories/sueldo-movimiento";
import { calcularNetoMensual, calcularRangoMesCalendario } from "@/server/services/sueldo-movimiento";

function mesYAnioActualEnLima(): { mes: number; anio: number } {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }); // YYYY-MM-DD
  const [anio, mes] = hoy.split("-").map(Number);
  return { mes, anio };
}

export default async function PersonalDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ empleadoId: string }>;
  searchParams: Promise<{ mes?: string; anio?: string }>;
}) {
  // Sin guard de rol acá adentro: server/auth/rbac.ts restringe
  // /personal a GERENTE (S12-18), mismo criterio que el resto del módulo.
  const { empleadoId } = await params;
  const { mes: mesParam, anio: anioParam } = await searchParams;

  const empleado = await buscarEmpleadoPorId(empleadoId);
  if (!empleado) {
    notFound();
  }

  const defecto = mesYAnioActualEnLima();
  const mesNumerico = Number(mesParam);
  const anioNumerico = Number(anioParam);
  // searchParams manipulado a mano cae en el mes/año actual, sin romper
  // — mismo criterio que categoriaValida/tipoValido en las demás páginas.
  const mes = mesNumerico >= 1 && mesNumerico <= 12 ? mesNumerico : defecto.mes;
  const anio = Number.isInteger(anioNumerico) && anioNumerico > 2000 ? anioNumerico : defecto.anio;

  const { desde, hasta } = calcularRangoMesCalendario(mes, anio);

  const [movimientos, movimientosDelMes] = await Promise.all([
    listarSueldoMovimientosPorEmpleado(empleadoId),
    listarSueldoMovimientosEnRango({ empleadoId, desde, hasta }),
  ]);

  const desglose = calcularNetoMensual(
    movimientosDelMes.map((movimiento) => ({ tipo: movimiento.tipo, monto: Number(movimiento.monto) })),
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <Link
        href="/personal"
        prefetch={false}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
      >
        <ArrowLeft data-icon="inline-start" />
        Volver a Personal
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {empleado.nombre}
            <Badge
              variant="secondary"
              className={empleado.estado === "ACTIVO" ? "badge-estado-activo" : "badge-estado-inactivo"}
            >
              {empleado.estado === "ACTIVO" ? "Activo" : "Inactivo"}
            </Badge>
          </span>
        }
        description={empleado.cargo ?? undefined}
        actions={
          <>
            <EmpleadoFormDialog modo="editar" empleado={empleado} />
            <EmpleadoEstadoBoton empleado={empleado} />
            {empleado.estado === "ACTIVO" ? (
              <SueldoMovimientoFormDialog empleadoId={empleado.id} />
            ) : null}
          </>
        }
      />
      <NetoMensualCard empleadoId={empleado.id} mes={mes} anio={anio} desglose={desglose} />
      <SueldoMovimientosTabla
        movimientos={movimientos.map((movimiento) => ({ ...movimiento, monto: Number(movimiento.monto) }))}
      />
    </div>
  );
}
