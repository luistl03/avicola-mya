-- CreateEnum
CREATE TYPE "EstadoGalpon" AS ENUM ('ACTIVO', 'INACTIVO');

-- AlterTable
ALTER TABLE "Galpon" ADD COLUMN     "estado" "EstadoGalpon" NOT NULL DEFAULT 'ACTIVO';

-- CreateIndex
CREATE INDEX "Galpon_estado_idx" ON "Galpon"("estado");
