import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";

// PrismaClient propio (no @/lib/prisma): los specs de Playwright corren
// fuera del proceso de Next, y este helper solo necesita crear/borrar
// datos de prueba directo contra Neon dev (D12) — mismo patrón que los
// scripts temporales usados en la verificación en vivo de sprints
// anteriores.
export const prisma = new PrismaClient();

// Prefijo reconocible en todo dato de prueba que crea este helper —
// permite identificar (y limpiar) datos huérfanos si un test se corta a
// mitad de camino sin llegar a su afterAll.
export const PREFIJO_E2E = "E2E Playwright";

const PASSWORD_PRUEBA = "PlaywrightE2E123!";

export async function crearUsuarioPrueba(rol: "GERENTE" | "OPERARIO") {
  const passwordHash = await bcrypt.hash(PASSWORD_PRUEBA, 12);
  const sufijo = crypto.randomUUID().slice(0, 8);
  const usuario = await prisma.usuario.create({
    data: {
      id: crypto.randomUUID(),
      usuario: `e2e.${rol.toLowerCase()}.${sufijo}`,
      nombre: `${PREFIJO_E2E} ${rol}`,
      celular: "900000000",
      passwordHash,
      rol,
      estado: "ACTIVO",
    },
  });
  return { id: usuario.id, usuario: usuario.usuario, password: PASSWORD_PRUEBA };
}

export async function borrarUsuarioPrueba(id: string) {
  // AuditLog.usuarioId es onDelete: Restrict (confirmado en
  // schema.prisma) — cualquier mutación real que el usuario de prueba
  // haya hecho vía withAuth (cerrar una venta, registrar un abono, etc.)
  // deja una fila ahí, y bloquea el DELETE de Usuario si no se limpia
  // primero (hallazgo real: 3 usuarios de prueba quedaron huérfanos
  // durante el desarrollo de estos specs, encontrado y corregido acá).
  // SesionActiva no tiene esa restricción (confirmado en schema.prisma),
  // no hace falta borrarla aparte. Venta/Credito/Egreso/etc. que el
  // usuario de prueba haya creado los borra cada spec explícitamente
  // (tienen su propio ciclo de vida, no algo genérico de este helper).
  await prisma.auditLog.deleteMany({ where: { usuarioId: id } });
  await prisma.usuario.delete({ where: { id } }).catch(() => undefined);
}

export async function login(page: Page, usuario: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill(usuario);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}
