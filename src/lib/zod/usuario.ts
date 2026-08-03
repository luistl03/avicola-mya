import { z } from "zod";

const usuarioLogin = z
  .string()
  .trim()
  .min(3, "Mínimo 3 caracteres")
  .max(32, "Máximo 32 caracteres")
  .regex(/^[a-z0-9_.]+$/, "Solo minúsculas, números, punto y guion bajo");

const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(120);

const password = z.string().min(8, "Mínimo 8 caracteres");

const usuarioId = z.string().uuid("Id inválido");

// Un <input> vacío llega como "" (no undefined) al pasar por FormData —
// se normaliza a undefined antes de validar, para que los campos opcionales
// puedan dejarse en blanco sin disparar el error de formato (email, etc.).
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((valor) => (valor === "" ? undefined : valor), schema.optional());
}

const celular = opcional(z.string().trim().min(6, "Mínimo 6 dígitos").max(20));
const email = opcional(z.string().trim().email("Email inválido"));

// El Gerente elige el rol del usuario nuevo (GERENTE u OPERARIO) al crearlo
// — decisión confirmada por el Product Owner durante S2-7, amplía el
// alcance original de spec.md (que solo contemplaba Operarios). La action
// (S2-8) sigue exigiendo rol GERENTE para invocar esta creación, sin
// importar qué rol se le asigne al usuario nuevo.
export const crearUsuarioSchema = z.object({
  usuario: usuarioLogin,
  password,
  nombre,
  rol: z.enum(["GERENTE", "OPERARIO"]),
  celular,
  email,
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

// `usuario` (nombre de login) no es editable después de creado. `password`
// es opcional: solo se reescribe si el Gerente la completa (reseteo).
export const editarUsuarioSchema = z.object({
  usuarioId,
  nombre,
  celular,
  email,
  password: opcional(password),
});

export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;

export const cambiarEstadoUsuarioSchema = z.object({
  usuarioId,
  estado: z.enum(["ACTIVO", "INACTIVO"]),
});

export type CambiarEstadoUsuarioInput = z.infer<typeof cambiarEstadoUsuarioSchema>;
