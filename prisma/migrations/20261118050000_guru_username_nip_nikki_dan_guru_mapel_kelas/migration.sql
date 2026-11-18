-- Rename nip -> username while preserving all existing login identifiers
ALTER TABLE "guru" RENAME COLUMN "nip" TO "username";
ALTER INDEX IF EXISTS "guru_nip_key" RENAME TO "guru_username_key";

-- Add optional profile field NIP/NIKKI
ALTER TABLE "guru" ADD COLUMN "nip_nikki" TEXT;

-- Create many-to-many join table for Guru Mapel <-> Kelas
CREATE TABLE "guru_kelas" (
    "guru_id" INTEGER NOT NULL,
    "kelas_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guru_kelas_pkey" PRIMARY KEY ("guru_id","kelas_id")
);

-- Foreign keys
ALTER TABLE "guru_kelas" ADD CONSTRAINT "guru_kelas_guru_id_fkey" FOREIGN KEY ("guru_id") REFERENCES "guru"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guru_kelas" ADD CONSTRAINT "guru_kelas_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "kelas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
