"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoEmpleado } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { cambiarEstadoEmpleadoAction } from "@/server/actions/empleado";

// Extraído de EmpleadosTabla para reusarlo tal cual en el header de
// /personal/[empleadoId] (plan.md lo listaba como acción del detalle sin
// anticipar el archivo aparte) — a diferencia del helper trivial
// `opcional()` (duplicado a propósito en cada lib/zod/*.ts), este botón
// tiene lógica real (Server Action, transición, toast) que sí vale la
// pena no repetir dos veces.
export function EmpleadoEstadoBoton({
  empleado,
}: {
  empleado: { id: string; nombre: string; estado: EstadoEmpleado };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const proximoEstado: EstadoEmpleado = empleado.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

  function alternarEstado() {
    startTransition(async () => {
      const resultado = await cambiarEstadoEmpleadoAction({ id: empleado.id, estado: proximoEstado });
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
        title: proximoEstado === "ACTIVO" ? "Empleado reactivado" : "Empleado dado de baja",
        description: `${empleado.nombre} ahora está ${proximoEstado === "ACTIVO" ? "activo" : "inactivo"}.`,
      });
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={empleado.estado === "ACTIVO" ? "destructive" : "outline"}
      size="sm"
      disabled={pending}
      onClick={alternarEstado}
    >
      {empleado.estado === "ACTIVO" ? "Dar de baja" : "Reactivar"}
    </Button>
  );
}
