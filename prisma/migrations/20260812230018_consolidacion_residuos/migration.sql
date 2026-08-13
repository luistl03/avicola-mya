-- CreateEnum
CREATE TYPE "TipoConsolidacion" AS ENUM ('PAQUETE_MIXTO', 'BANDEJA');

-- AlterTable
ALTER TABLE "BandejaOrigen" ADD COLUMN     "loteId" TEXT;

-- AlterTable
ALTER TABLE "BandejaSuelta" ADD COLUMN     "registroConsolidacionId" TEXT;

-- AlterTable
ALTER TABLE "Paquete" ADD COLUMN     "registroConsolidacionId" TEXT;

-- AlterTable
ALTER TABLE "PaqueteOrigen" ADD COLUMN     "loteId" TEXT;

-- CreateTable
CREATE TABLE "RegistroConsolidacion" (
    "id" TEXT NOT NULL,
    "tipo" "TipoConsolidacion" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "creadoEnCliente" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cantidadUnidadesFormadas" INTEGER NOT NULL,
    "cantidadConsolidada" INTEGER NOT NULL,

    CONSTRAINT "RegistroConsolidacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroConsolidacion_creadoEn_idx" ON "RegistroConsolidacion"("creadoEn");

-- CreateIndex
CREATE INDEX "BandejaSuelta_registroConsolidacionId_idx" ON "BandejaSuelta"("registroConsolidacionId");

-- CreateIndex
CREATE INDEX "Paquete_registroConsolidacionId_idx" ON "Paquete"("registroConsolidacionId");

-- AddForeignKey
ALTER TABLE "RegistroConsolidacion" ADD CONSTRAINT "RegistroConsolidacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paquete" ADD CONSTRAINT "Paquete_registroConsolidacionId_fkey" FOREIGN KEY ("registroConsolidacionId") REFERENCES "RegistroConsolidacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaqueteOrigen" ADD CONSTRAINT "PaqueteOrigen_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandejaSuelta" ADD CONSTRAINT "BandejaSuelta_registroConsolidacionId_fkey" FOREIGN KEY ("registroConsolidacionId") REFERENCES "RegistroConsolidacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandejaOrigen" ADD CONSTRAINT "BandejaOrigen_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
