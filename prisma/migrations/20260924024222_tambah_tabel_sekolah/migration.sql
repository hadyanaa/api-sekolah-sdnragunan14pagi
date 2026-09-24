/*
  Warnings:

  - You are about to drop the `kelas` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `murid` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `pegawai` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "StatusSiswa" AS ENUM ('AKTIF', 'ALUMNI');

-- DropForeignKey
ALTER TABLE "kelas" DROP CONSTRAINT "kelas_wali_kelas_id_fkey";

-- DropForeignKey
ALTER TABLE "murid" DROP CONSTRAINT "murid_kelas_id_fkey";

-- DropTable
DROP TABLE "kelas";

-- DropTable
DROP TABLE "murid";

-- DropTable
DROP TABLE "pegawai";

-- CreateTable
CREATE TABLE "siswa" (
    "id" SERIAL NOT NULL,
    "nisn" TEXT,
    "nis" TEXT,
    "nama" TEXT NOT NULL,
    "gender" TEXT,
    "kelas" TEXT,
    "tgl_lahir" TIMESTAMP(3),
    "tempat_lahir" TEXT,
    "alamat" TEXT,
    "nama_ortu" TEXT,
    "no_telp_ortu" TEXT,
    "status" "StatusSiswa" NOT NULL DEFAULT 'AKTIF',
    "tahun_lulus" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "siswa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visi_misi" (
    "id" SERIAL NOT NULL,
    "visi" TEXT NOT NULL,
    "misi" TEXT NOT NULL,
    "tujuan" TEXT,
    "visi_ekskul" TEXT,
    "misi_ekskul" TEXT,
    "tujuan_ekskul" TEXT,
    "fungsi_ekskul" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visi_misi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sdm" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "nip_nikki" TEXT,
    "gender" TEXT,
    "tgl_lahir" TIMESTAMP(3),
    "tmt" TIMESTAMP(3),
    "status" TEXT,
    "jabatan" TEXT NOT NULL,
    "deskripsi_jabatan" TEXT,
    "pendidikan" TEXT,
    "jurusan" TEXT,
    "foto_url" TEXT,
    "no_telp" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sdm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prestasi" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "nama_peserta" TEXT,
    "tanggal" TIMESTAMP(3),
    "kategori" TEXT,
    "deskripsi" TEXT,
    "peringkat" TEXT,
    "tingkat" TEXT,
    "penyelenggara" TEXT,
    "tempat" TEXT,
    "link_foto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prestasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ekskul" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "pembina" TEXT,
    "pj" TEXT,
    "waktu" TEXT,
    "tujuan" TEXT,
    "materi" TEXT,
    "sifat" TEXT,
    "peserta" TEXT,
    "link_foto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ekskul_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda" (
    "id" SERIAL NOT NULL,
    "judul" TEXT NOT NULL,
    "deskripsi" TEXT,
    "kategori" TEXT,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "waktu" TEXT,
    "tempat" TEXT,
    "link_foto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kalender_akademik" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),
    "kategori" TEXT,
    "deskripsi" TEXT,
    "tahun_ajaran" TEXT,
    "semester" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kalender_akademik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pengumuman" (
    "id" SERIAL NOT NULL,
    "judul" TEXT NOT NULL,
    "isi" TEXT,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url_file" TEXT,
    "kategori" TEXT,
    "penulis" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pengumuman_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fasilitas" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "deskripsi" TEXT,
    "kondisi" TEXT,
    "link_foto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fasilitas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "siswa_nisn_key" ON "siswa"("nisn");
