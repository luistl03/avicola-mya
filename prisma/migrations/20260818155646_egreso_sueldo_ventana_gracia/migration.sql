-- DropIndex
DROP INDEX "SueldoMovimiento_empleadoId_fecha_idx";

-- AlterTable
ALTER TABLE "Egreso" ADD COLUMN     "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "revertido" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revertidoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SueldoMovimiento" ADD COLUMN     "revertido" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revertidoEn" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Egreso_creadoEn_revertido_idx" ON "Egreso"("creadoEn", "revertido");

-- CreateIndex
CREATE INDEX "SueldoMovimiento_empleadoId_fecha_revertido_idx" ON "SueldoMovimiento"("empleadoId", "fecha", "revertido");
