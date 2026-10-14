const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Memulai proses seeding data dari API Web Profile SDN Ragunan 14 Pagi.xlsx...');

  const dataPath = path.join(__dirname, 'seed_data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`File seed data tidak ditemukan di ${dataPath}`);
  }

  const raw = fs.readFileSync(dataPath, 'utf-8');
  const data = JSON.parse(raw);

  // 1. Bersihkan data lama agar tidak duplikat saat di-seed ulang
  console.log('🧹 Mengosongkan data lama pada tabel target...');
  await prisma.visiMisi.deleteMany();
  await prisma.sdm.deleteMany();
  await prisma.prestasi.deleteMany();
  await prisma.ekskul.deleteMany();
  await prisma.agenda.deleteMany();
  await prisma.kalenderAkademik.deleteMany();
  await prisma.pengumuman.deleteMany();
  await prisma.fasilitas.deleteMany();

  // 2. Seed Visi Misi
  console.log('📌 Seeding Visi & Misi...');
  await prisma.visiMisi.create({
    data: {
      visi: data.visiMisi.visi,
      misi: data.visiMisi.misi,
      tujuan: data.visiMisi.tujuan,
      visiEkskul: data.visiMisi.visiEkskul,
      misiEkskul: data.visiMisi.misiEkskul,
      tujuanEkskul: data.visiMisi.tujuanEkskul,
      fungsiEkskul: data.visiMisi.fungsiEkskul
    }
  });

  // 3. Seed SDM
  console.log(`📌 Seeding SDM (${data.sdm.length} data)...`);
  for (const s of data.sdm) {
    await prisma.sdm.create({
      data: {
        nama: s.nama,
        nipNikki: s.nipNikki || null,
        gender: s.gender || null,
        tglLahir: s.tglLahir ? new Date(s.tglLahir) : null,
        tmt: s.tmt ? new Date(s.tmt) : null,
        status: s.status || null,
        jabatan: s.jabatan,
        deskripsiJabatan: s.deskripsiJabatan || null,
        pendidikan: s.pendidikan || null,
        jurusan: s.jurusan || null
      }
    });
  }

  // 4. Seed Prestasi
  console.log(`📌 Seeding Prestasi (${data.prestasi.length} data)...`);
  for (const p of data.prestasi) {
    await prisma.prestasi.create({
      data: {
        nama: p.nama,
        namaPeserta: p.namaPeserta || null,
        tanggal: p.tanggal ? new Date(p.tanggal) : null,
        kategori: p.kategori || null,
        deskripsi: p.deskripsi || null,
        peringkat: p.peringkat || null,
        tingkat: p.tingkat || null,
        penyelenggara: p.penyelenggara || null,
        tempat: p.tempat || null,
        linkFoto: p.linkFoto || null
      }
    });
  }

  // 5. Seed Ekskul
  console.log(`📌 Seeding Ekskul (${data.ekskul.length} data)...`);
  for (const e of data.ekskul) {
    await prisma.ekskul.create({
      data: {
        nama: e.nama,
        pembina: e.pembina || null,
        pj: e.pj || null,
        waktu: e.waktu || null,
        tujuan: e.tujuan || null,
        materi: e.materi || null,
        sifat: e.sifat || null,
        peserta: e.peserta || null
      }
    });
  }

  // 6. Seed Agenda
  console.log(`📌 Seeding Agenda (${data.agenda.length} data)...`);
  for (const a of data.agenda) {
    await prisma.agenda.create({
      data: {
        judul: a.judul,
        deskripsi: a.deskripsi,
        kategori: a.kategori || null,
        tanggal: new Date(a.tanggal),
        linkFoto: a.linkFoto || null
      }
    });
  }

  // 7. Seed Kalender Akademik
  console.log(`📌 Seeding Kalender Akademik (${data.kalenderAkademik.length} data)...`);
  for (const k of data.kalenderAkademik) {
    await prisma.kalenderAkademik.create({
      data: {
        title: k.title,
        start: new Date(k.start),
        end: k.end ? new Date(k.end) : null,
        kategori: k.kategori || null,
        deskripsi: k.deskripsi || null,
        tahunAjaran: k.tahunAjaran || null
      }
    });
  }

  // 8. Seed Pengumuman
  console.log(`📌 Seeding Pengumuman (${data.pengumuman.length} data)...`);
  for (const pg of data.pengumuman) {
    await prisma.pengumuman.create({
      data: {
        judul: pg.judul,
        tanggal: new Date(pg.tanggal),
        urlFile: pg.urlFile || null,
        kategori: pg.kategori || null
      }
    });
  }

  // 9. Seed Fasilitas
  console.log(`📌 Seeding Fasilitas (${data.fasilitas.length} data)...`);
  for (const f of data.fasilitas) {
    await prisma.fasilitas.create({
      data: {
        nama: f.nama,
        linkFoto: f.linkFoto || null
      }
    });
  }

  // 10. Seed Absensi (Kelas 1A-6B, Guru, Murid)
  console.log('📌 Seeding Absensi (Kelas, Guru, Murid)...');
  const bcrypt = require('bcryptjs');
  const kelasList = ['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B', '5A', '5B', '6A', '6B'];
  const kelasRecords = {};
  for (const namaKelas of kelasList) {
    kelasRecords[namaKelas] = await prisma.kelas.upsert({
      where: { namaKelas },
      update: {},
      create: { namaKelas }
    });
  }

  const defaultPassword = await bcrypt.hash('guru123', 10);
  await prisma.guru.upsert({
    where: { nip: '198501012010011001' },
    update: { password: defaultPassword, role: 'WALI_KELAS', kelasId: kelasRecords['1A'].id },
    create: {
      nip: '198501012010011001',
      namaGuru: 'Siti Aminah, S.Pd',
      password: defaultPassword,
      role: 'WALI_KELAS',
      kelasId: kelasRecords['1A'].id
    }
  });

  await prisma.guru.upsert({
    where: { nip: '199002022015022002' },
    update: { password: defaultPassword, role: 'GURU_MAPEL', kelasId: null },
    create: {
      nip: '199002022015022002',
      namaGuru: 'Bambang Irawan, S.Pd',
      password: defaultPassword,
      role: 'GURU_MAPEL',
      kelasId: null
    }
  });

  const sampelMurid1A = [
    { noUrut: 1, namaMurid: 'Aditya Pratama' },
    { noUrut: 2, namaMurid: 'Aisyah Putri' },
    { noUrut: 3, namaMurid: 'Bagas Firmansyah' },
    { noUrut: 4, namaMurid: 'Citra Kirana' },
    { noUrut: 5, namaMurid: 'Dimas Anggara' },
    { noUrut: 6, namaMurid: 'Eka Lestari' },
    { noUrut: 7, namaMurid: 'Fajar Nugraha' },
    { noUrut: 8, namaMurid: 'Gita Gutawa' },
    { noUrut: 9, namaMurid: 'Hafiz Al-Fath' },
    { noUrut: 10, namaMurid: 'Indah Permatasari' }
  ];

  for (const m of sampelMurid1A) {
    const exist = await prisma.murid.findFirst({
      where: { kelasId: kelasRecords['1A'].id, noUrut: m.noUrut }
    });
    if (!exist) {
      await prisma.murid.create({
        data: { namaMurid: m.namaMurid, noUrut: m.noUrut, kelasId: kelasRecords['1A'].id }
      });
    }
  }

  console.log('✅ SEEDING SELESAI!');
  console.log(`- Visi Misi: 1 data`);
  console.log(`- SDM: ${data.sdm.length} data`);
  console.log(`- Prestasi: ${data.prestasi.length} data`);
  console.log(`- Ekskul: ${data.ekskul.length} data`);
  console.log(`- Agenda: ${data.agenda.length} data`);
  console.log(`- Kalender Akademik: ${data.kalenderAkademik.length} data`);
  console.log(`- Pengumuman: ${data.pengumuman.length} data`);
  console.log(`- Fasilitas: ${data.fasilitas.length} data`);
  console.log(`- Kelas: 12 data`);
  console.log(`- Guru: 2 akun uji (NIP 198501012010011001 & 199002022015022002)`);
  console.log(`- Murid: 10 data (Kelas 1A)`);
}

main()
  .catch((e) => {
    console.error('❌ Gagal melakukan seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
