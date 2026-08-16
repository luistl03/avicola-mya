-- AlterEnum
ALTER TYPE "EstadoBandeja" ADD VALUE 'ROTO';

-- AlterEnum
ALTER TYPE "TipoMovimientoSueltos" ADD VALUE 'ROTURA_BANDEJA_ENTRADA';

-- CreateTable
CREATE TABLE "RoturaBandeja" (
    "id" TEXT NOT NULL,
    "bandejaId" TEXT NOT NULL,
    "pesoExtraido" DECIMAL(6,3) NOT NULL,
    "unidadesExtraidas" INTEGER NOT NULL,
    "unidadesDevueltas" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoturaBandeja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoturaBandeja_bandejaId_key" ON "RoturaBandeja"("bandejaId");

-- AddForeignKey
ALTER TABLE "RoturaBandeja" ADD CONSTRAINT "RoturaBandeja_bandejaId_fkey" FOREIGN KEY ("bandejaId") REFERENCES "BandejaSuelta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
