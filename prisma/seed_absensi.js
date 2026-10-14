const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedAbsensi() {
  console.log('🌱 Menjalankan Seeder Modul Absensi...');

  // 1. Data Kelas 1A sampai 6B
  const kelasList = [
    '1A', '1B',
    '2A', '2B',
    '3A', '3B',
    '4A', '4B',
    '5A', '5B',
    '6A', '6B'
  ];

  console.log('🏫 Membuat data Kelas 1A - 6B...');
  const kelasRecords = {};
  for (const namaKelas of kelasList) {
    const k = await prisma.kelas.upsert({
      where: { namaKelas },
      update: {},
      create: { namaKelas }
    });
    kelasRecords[namaKelas] = k;
  }

  // 2. Data Guru
  console.log('👨‍🏫 Membuat data Guru (Wali Kelas & Guru Mapel)...');
  const defaultPassword = await bcrypt.hash('guru123', 10);

  // Wali Kelas 1A
  await prisma.guru.upsert({
    where: { nip: '198501012010011001' },
    update: {
      namaGuru: 'Siti Aminah, S.Pd',
      password: defaultPassword,
      role: 'WALI_KELAS',
      kelasId: kelasRecords['1A'].id
    },
    create: {
      nip: '198501012010011001',
      namaGuru: 'Siti Aminah, S.Pd',
      password: defaultPassword,
      role: 'WALI_KELAS',
      kelasId: kelasRecords['1A'].id
    }
  });

  // Guru Bidang Studi PJOK
  await prisma.guru.upsert({
    where: { nip: '199002022015022002' },
    update: {
      namaGuru: 'Bambang Irawan, S.Pd',
      password: defaultPassword,
      role: 'GURU_MAPEL',
      kelasId: null
    },
    create: {
      nip: '199002022015022002',
      namaGuru: 'Bambang Irawan, S.Pd',
      password: defaultPassword,
      role: 'GURU_MAPEL',
      kelasId: null
    }
  });

  // 3. Data Murid untuk Kelas 1A
  console.log('👦 Membuat sampel data Murid di Kelas 1A...');
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
    const existing = await prisma.murid.findFirst({
      where: {
        kelasId: kelasRecords['1A'].id,
        noUrut: m.noUrut
      }
    });

    if (!existing) {
      await prisma.murid.create({
        data: {
          namaMurid: m.namaMurid,
          noUrut: m.noUrut,
          kelasId: kelasRecords['1A'].id
        }
      });
    }
  }

  console.log('✅ SEEDING ABSENSI BERHASIL!');
  console.log('Akun Guru untuk pengujian:');
  console.log('1. Wali Kelas 1A: NIP: 198501012010011001 | Password: guru123');
  console.log('2. Guru Mapel:    NIP: 199002022015022002 | Password: guru123');
}

seedAbsensi()
  .catch((e) => {
    console.error('❌ Error saat seeding absensi:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

