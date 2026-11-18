-- CreateEnum
CREATE TYPE "StatusMurid" AS ENUM ('AKTIF', 'LULUS', 'MUTASI_KELUAR');

-- AlterTable
ALTER TABLE "murid"
ADD COLUMN "status" "StatusMurid" NOT NULL DEFAULT 'AKTIF',
ADD COLUMN "tahun_keluar" TEXT;

-- CreateIndex
CREATE INDEX "murid_status_idx" ON "murid"("status");
