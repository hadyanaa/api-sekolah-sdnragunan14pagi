-- CreateEnum
CREATE TYPE "RoleGuru" AS ENUM ('WALI_KELAS', 'GURU_MAPEL');

-- CreateEnum
CREATE TYPE "StatusAbsensi" AS ENUM ('H', 'S', 'I', 'A', 'L');

-- CreateTable
CREATE TABLE "kelas" (
    "id" SERIAL NOT NULL,
    "nama_kelas" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guru" (
    "id" SERIAL NOT NULL,
    "nip" TEXT NOT NULL,
    "nama_guru" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "RoleGuru" NOT NULL DEFAULT 'WALI_KELAS',
    "kelas_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guru_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "murid" (
    "id" SERIAL NOT NULL,
    "nama_murid" TEXT NOT NULL,
    "no_urut" INTEGER NOT NULL,
    "kelas_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "murid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absensi" (
    "id" SERIAL NOT NULL,
    "murid_id" INTEGER NOT NULL,
    "tanggal" DATE NOT NULL,
    "status" "StatusAbsensi" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absensi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kelas_nama_kelas_key" ON "kelas"("nama_kelas");

-- CreateIndex
CREATE UNIQUE INDEX "guru_nip_key" ON "guru"("nip");

-- CreateIndex
CREATE INDEX "absensi_tanggal_idx" ON "absensi"("tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "absensi_murid_id_tanggal_key" ON "absensi"("murid_id", "tanggal");

-- AddForeignKey
ALTER TABLE "guru" ADD CONSTRAINT "guru_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "kelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "murid" ADD CONSTRAINT "murid_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "kelas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absensi" ADD CONSTRAINT "absensi_murid_id_fkey" FOREIGN KEY ("murid_id") REFERENCES "murid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
