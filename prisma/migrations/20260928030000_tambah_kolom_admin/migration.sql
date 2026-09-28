-- AlterTable
ALTER TABLE "prestasi" ADD COLUMN IF NOT EXISTS "peraih" TEXT;

-- AlterTable
ALTER TABLE "ekskul" ADD COLUMN IF NOT EXISTS "hari" TEXT;
ALTER TABLE "ekskul" ADD COLUMN IF NOT EXISTS "jam" TEXT;
ALTER TABLE "ekskul" ADD COLUMN IF NOT EXISTS "deskripsi" TEXT;

-- AlterTable
ALTER TABLE "agenda" ADD COLUMN IF NOT EXISTS "lokasi" TEXT;

-- AlterTable
ALTER TABLE "pengumuman" ADD COLUMN IF NOT EXISTS "deskripsi" TEXT;
