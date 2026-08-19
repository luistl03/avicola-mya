import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

// Un <input> vacío llega como "" (no undefined) al pasar por FormData —
// mismo helper que ya usan lib/zod/usuario.ts y lib/zod/cliente.ts.
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((valor) => (valor === "" ? undefined : valor), schema.optional());
}

const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(120);
const celular = opcional(z.string().trim().max(20, "Máximo 20 caracteres"));
const cargo = opcional(z.string().trim().max(80, "Máximo 80 caracteres"));

// id generado en el cliente — Empleado.nombre no tiene @unique (dos
// empleados con el mismo nombre son plausibles en una granja familiar),
// así que aplica el patrón completo de idempotencia por id de cliente.
// Sin usuarioId (decisión 5, spec.md): Empleado queda 100% desacoplado
// de Usuario en este sprint, ningún formulario lo expone.
export const crearEmpleadoSchema = z.object({ id: idUuid(), nombre, celular, cargo });

export type CrearEmpleadoInput = z.infer<typeof crearEmpleadoSchema>;

export const editarEmpleadoSchema = z.object({ id: idUuid(), nombre, celular, cargo });

export type EditarEmpleadoInput = z.infer<typeof editarEmpleadoSchema>;

export const cambiarEstadoEmpleadoSchema = z.object({
  id: idUuid(),
  estado: z.enum(["ACTIVO", "INACTIVO"]),
});

export type CambiarEstadoEmpleadoInput = z.infer<typeof cambiarEstadoEmpleadoSchema>;
