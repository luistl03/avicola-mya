import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { CLIENTE_PUBLICO_GENERAL_ID } from "../src/lib/constants";

const prisma = new PrismaClient();

const GERENTE_USUARIO = "gerente";
const GERENTE_PASSWORD = "Cambiar123!";

const GALPON_IDS = {
  galpon1: "00000000-0000-0000-0000-000000000101",
  galpon2: "00000000-0000-0000-0000-000000000102",
  galpon3: "00000000-0000-0000-0000-000000000103",
};

const PRECIO_KILO_ID = "00000000-0000-0000-0000-000000000201";

async function main() {
  const gerente = await prisma.usuario.upsert({
    where: { usuario: GERENTE_USUARIO },
    update: {},
    create: {
      usuario: GERENTE_USUARIO,
      passwordHash: bcrypt.hashSync(GERENTE_PASSWORD, 12),
      nombre: "Gerente",
      rol: "GERENTE",
    },
  });

  await prisma.cliente.upsert({
    where: { id: CLIENTE_PUBLICO_GENERAL_ID },
    update: {},
    create: {
      id: CLIENTE_PUBLICO_GENERAL_ID,
      nombre: "Público General",
      tipo: "EVENTUAL",
    },
  });

  await prisma.precioKilo.upsert({
    where: { id: PRECIO_KILO_ID },
    update: {},
    create: {
      id: PRECIO_KILO_ID,
      precio: 8.5,
      usuarioId: gerente.id,
    },
  });

  const galpones = await Promise.all(
    [
      { id: GALPON_IDS.galpon1, nombre: "Galpón 1", capacidadMaxima: 500 },
      { id: GALPON_IDS.galpon2, nombre: "Galpón 2", capacidadMaxima: 500 },
      { id: GALPON_IDS.galpon3, nombre: "Galpón 3", capacidadMaxima: 500 },
    ].map((galpon) =>
      prisma.galpon.upsert({
        where: { id: galpon.id },
        update: {},
        create: galpon,
      }),
    ),
  );

  const lote = await prisma.lote.upsert({
    where: { codigo: "LOTE-DEMO-01" },
    update: {},
    create: {
      codigo: "LOTE-DEMO-01",
      fechaIngreso: new Date(),
      avesIniciales: 500,
      avesVivas: 500,
    },
  });

  const ubicacionAbierta = await prisma.historialUbicacionLote.findFirst({
    where: { loteId: lote.id, fechaSalida: null },
  });

  if (!ubicacionAbierta) {
    await prisma.historialUbicacionLote.create({
      data: {
        loteId: lote.id,
        galponId: galpones[0].id,
      },
    });
  }

  console.log("Seed completo.");
  console.log(`Gerente -> usuario: "${GERENTE_USUARIO}" / password: "${GERENTE_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
