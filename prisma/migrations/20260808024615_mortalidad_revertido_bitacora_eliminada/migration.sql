-- AlterTable
ALTER TABLE "BitacoraGlobal" ADD COLUMN     "eliminada" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RegistroMortalidad" ADD COLUMN     "revertido" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revertidoEn" TIMESTAMP(3);
