-- CreateEnum
CREATE TYPE "StatusGuru" AS ENUM ('AKTIF', 'MUTASI_KELUAR', 'PENSIUN');

-- AlterTable: add profile, employment, and active status columns to guru
ALTER TABLE "guru"
ADD COLUMN "nuptk" TEXT,
ADD COLUMN "nrg" TEXT,
ADD COLUMN "golongan_ruang" TEXT,
ADD COLUMN "jabatan" TEXT,
ADD COLUMN "tmt_kerja" DATE,
ADD COLUMN "tmt_sekolah" DATE,
ADD COLUMN "tingkat_pendidikan" TEXT,
ADD COLUMN "jurusan" TEXT,
ADD COLUMN "jenis_kelamin" TEXT,
ADD COLUMN "tempat_lahir" TEXT,
ADD COLUMN "tanggal_lahir" DATE,
ADD COLUMN "alamat" TEXT,
ADD COLUMN "status" "StatusGuru" NOT NULL DEFAULT 'AKTIF',
ADD COLUMN "tahun_keluar" TEXT;

CREATE INDEX "guru_status_idx" ON "guru"("status");

-- CreateTable: riwayat_mengajar_guru
CREATE TABLE "riwayat_mengajar_guru" (
    "id" SERIAL NOT NULL,
    "guru_id" INTEGER NOT NULL,
    "tahun_ajaran" TEXT NOT NULL,
    "role" "RoleGuru" NOT NULL,
    "jabatan" TEXT,
    "keterangan_kelas" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riwayat_mengajar_guru_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "riwayat_mengajar_guru_guru_id_tahun_ajaran_key" ON "riwayat_mengajar_guru"("guru_id", "tahun_ajaran");
CREATE INDEX "riwayat_mengajar_guru_tahun_ajaran_idx" ON "riwayat_mengajar_guru"("tahun_ajaran");

ALTER TABLE "riwayat_mengajar_guru" ADD CONSTRAINT "riwayat_mengajar_guru_guru_id_fkey" FOREIGN KEY ("guru_id") REFERENCES "guru"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill teaching history for currently existing guru accounts
INSERT INTO "riwayat_mengajar_guru" ("guru_id", "tahun_ajaran", "role", "jabatan", "keterangan_kelas", "updated_at")
SELECT
  g."id",
  CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 7
      THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT::TEXT || '/' || (EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1)::TEXT
    ELSE (EXTRACT(YEAR FROM CURRENT_DATE)::INT - 1)::TEXT || '/' || EXTRACT(YEAR FROM CURRENT_DATE)::INT::TEXT
  END,
  g."role",
  g."jabatan",
  CASE
    WHEN g."role" = 'WALI_KELAS' THEN COALESCE('Kelas ' || k."nama_kelas", 'Belum ditentukan')
    WHEN g."role" = 'PIKET' THEN 'Semua Kelas (Piket)'
    ELSE COALESCE(
      (
        SELECT 'Kelas ' || string_agg(k2."nama_kelas", ', ' ORDER BY k2."nama_kelas")
        FROM "guru_kelas" gk
        JOIN "kelas" k2 ON k2."id" = gk."kelas_id"
        WHERE gk."guru_id" = g."id"
      ),
      'Semua Kelas'
    )
  END,
  CURRENT_TIMESTAMP
FROM "guru" g
LEFT JOIN "kelas" k ON k."id" = g."kelas_id"
ON CONFLICT ("guru_id", "tahun_ajaran") DO NOTHING;
