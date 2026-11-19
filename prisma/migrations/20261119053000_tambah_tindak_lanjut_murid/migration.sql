-- CreateEnum
CREATE TYPE "JenisTindakLanjut" AS ENUM ('KARTU_REFLEKSI', 'PEMANGGILAN_ORTU', 'HOME_VISIT');

-- CreateTable
CREATE TABLE "tindak_lanjut_murid" (
    "id" SERIAL NOT NULL,
    "murid_id" INTEGER NOT NULL,
    "jenis" "JenisTindakLanjut" NOT NULL,
    "tanggal" DATE NOT NULL,
    "catatan" TEXT,
    "file_name" TEXT,
    "file_path" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "dibuat_oleh_id" INTEGER,
    "dibuat_oleh_nama" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tindak_lanjut_murid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tindak_lanjut_murid_murid_id_tanggal_idx" ON "tindak_lanjut_murid"("murid_id", "tanggal");

-- AddForeignKey
ALTER TABLE "tindak_lanjut_murid" ADD CONSTRAINT "tindak_lanjut_murid_murid_id_fkey" FOREIGN KEY ("murid_id") REFERENCES "murid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
