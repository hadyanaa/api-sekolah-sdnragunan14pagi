-- Add optional jenis_kelamin, agama, and no_kk columns to murid
ALTER TABLE "murid"
ADD COLUMN "jenis_kelamin" TEXT,
ADD COLUMN "agama" TEXT,
ADD COLUMN "no_kk" TEXT;
