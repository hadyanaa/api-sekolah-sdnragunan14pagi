-- Add student biodata & active academic year columns to murid
ALTER TABLE "murid"
ADD COLUMN "nipd" TEXT,
ADD COLUMN "nisn" TEXT,
ADD COLUMN "nik" TEXT,
ADD COLUMN "tempat_lahir" TEXT,
ADD COLUMN "tanggal_lahir" DATE,
ADD COLUMN "alamat" TEXT,
ADD COLUMN "no_hp" TEXT,
ADD COLUMN "tahun_ajaran_aktif" TEXT;

-- Create riwayat_kelas_murid table to track class & homeroom teacher per academic year
CREATE TABLE "riwayat_kelas_murid" (
    "id" SERIAL NOT NULL,
    "murid_id" INTEGER NOT NULL,
    "tahun_ajaran" TEXT NOT NULL,
    "kelas_id" INTEGER,
    "nama_kelas" TEXT NOT NULL,
    "wali_kelas_id" INTEGER,
    "nama_wali_kelas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riwayat_kelas_murid_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "riwayat_kelas_murid_murid_id_tahun_ajaran_key" ON "riwayat_kelas_murid"("murid_id", "tahun_ajaran");
CREATE INDEX "riwayat_kelas_murid_tahun_ajaran_idx" ON "riwayat_kelas_murid"("tahun_ajaran");

ALTER TABLE "riwayat_kelas_murid" ADD CONSTRAINT "riwayat_kelas_murid_murid_id_fkey" FOREIGN KEY ("murid_id") REFERENCES "murid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "riwayat_kelas_murid" ADD CONSTRAINT "riwayat_kelas_murid_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "kelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill tahun_ajaran_aktif & riwayat_kelas_murid for existing students based on current date
UPDATE "murid"
SET "tahun_ajaran_aktif" = CASE
  WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 7
    THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT::TEXT || '/' || (EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1)::TEXT
  ELSE (EXTRACT(YEAR FROM CURRENT_DATE)::INT - 1)::TEXT || '/' || EXTRACT(YEAR FROM CURRENT_DATE)::INT::TEXT
END
WHERE "tahun_ajaran_aktif" IS NULL;

INSERT INTO "riwayat_kelas_murid" ("murid_id", "tahun_ajaran", "kelas_id", "nama_kelas", "wali_kelas_id", "nama_wali_kelas", "updated_at")
SELECT
  m."id",
  m."tahun_ajaran_aktif",
  k."id",
  k."nama_kelas",
  g."id",
  g."nama_guru",
  CURRENT_TIMESTAMP
FROM "murid" m
JOIN "kelas" k ON k."id" = m."kelas_id"
LEFT JOIN LATERAL (
  SELECT "id", "nama_guru"
  FROM "guru"
  WHERE "kelas_id" = k."id" AND "role" = 'WALI_KELAS'
  ORDER BY "id" ASC
  LIMIT 1
) g ON TRUE
ON CONFLICT ("murid_id", "tahun_ajaran") DO NOTHING;
