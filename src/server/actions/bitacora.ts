"use server";

import { PAGE_SIZE_MURO } from "@/lib/constants";
import {
  crearNotaBitacoraSchema,
  editarNotaBitacoraSchema,
  eliminarNotaBitacoraSchema,
  obtenerMasBitacoraSchema,
} from "@/lib/zod/bitacora";
import { auth } from "@/server/auth";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  buscarNotaBitacoraPorId,
  crearNotaBitacora as crearNotaBitacoraRepo,
  editarNotaBitacora as editarNotaBitacoraRepo,
  eliminarNotaBitacora as eliminarNotaBitacoraRepo,
  listarBitacoraPagina,
} from "@/server/repositories/bitacora";

// Mutación real → pasa por withAuth, sin `rol` (GERENTE y OPERARIO
// escriben notas por igual, mismo criterio que registrarMortalidad).
export const crearNotaBitacora = withAuth(
  { schema: crearNotaBitacoraSchema, entidad: "BitacoraGlobal", accion: "CREAR" },
  async (input, ctx) => {
    const nota = await crearNotaBitacoraRepo({
      categoria: input.categoria,
      contenido: input.contenido,
      usuarioId: ctx.usuarioId,
    });

    return {
      data: { id: nota.id },
      entidadId: nota.id,
      estadoDespues: { categoria: nota.categoria, contenido: nota.contenido },
    };
  },
);

// Sin restricción de rol ni de autoría (decisión de negocio confirmada):
// cualquier usuario autenticado puede editar o eliminar cualquier nota —
// no solo la propia. Sin ventana de tiempo tampoco, a diferencia de
// Mortalidad: una nota de texto no tiene efectos en cascada sobre otro
// dato, corregirla en cualquier momento es seguro.
export const editarNotaBitacora = withAuth(
  { schema: editarNotaBitacoraSchema, entidad: "BitacoraGlobal", accion: "EDITAR" },
  async (input) => {
    const existente = await buscarNotaBitacoraPorId(input.notaId);
    if (!existente || existente.eliminada) {
      throw new AccionError("La nota no existe.");
    }

    const nota = await editarNotaBitacoraRepo(input.notaId, {
      categoria: input.categoria,
      contenido: input.contenido,
    });

    return {
      data: { id: nota.id, categoria: nota.categoria, contenido: nota.contenido },
      entidadId: nota.id,
      estadoAntes: { categoria: existente.categoria, contenido: existente.contenido },
      estadoDespues: { categoria: nota.categoria, contenido: nota.contenido },
    };
  },
);

export const eliminarNotaBitacora = withAuth(
  { schema: eliminarNotaBitacoraSchema, entidad: "BitacoraGlobal", accion: "ELIMINAR" },
  async (input) => {
    const existente = await buscarNotaBitacoraPorId(input.notaId);
    if (!existente || existente.eliminada) {
      throw new AccionError("La nota no existe.");
    }

    const nota = await eliminarNotaBitacoraRepo(input.notaId);

    return {
      data: { id: nota.id },
      entidadId: nota.id,
      estadoAntes: { eliminada: false },
      estadoDespues: { eliminada: true },
    };
  },
);

// Lectura, no mutación → NO pasa por withAuth a propósito (ver decisión
// de diseño en spec.md/plan.md: withAuth está pensado para mutaciones con
// AuditLog de una entidad puntual — cada "cargar más" del scroll infinito
// no tiene una única entidad afectada, y pasar por ahí ensuciaría
// AuditLog con decenas de filas LISTAR por sesión de scroll). Verifica
// sesión a mano con auth() — mismo nivel real de protección (nadie sin
// sesión ve nada), sin la maquinaria de rol/AuditLog que acá no aplica.
export async function obtenerMasBitacora(rawInput: unknown) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "No autenticado." };
  }

  const parsed = obtenerMasBitacoraSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos." };
  }

  const items = await listarBitacoraPagina({ ...parsed.data, take: PAGE_SIZE_MURO });
  return { ok: true as const, data: items };
}
