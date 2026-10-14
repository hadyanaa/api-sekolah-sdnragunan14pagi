const http = require('http');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();
const authGuruRouter = require('../routes/authGuru');
const absensiRouter = require('../routes/absensi');

const app = express();
app.use(express.json());
app.use('/api/auth', authGuruRouter);
app.use('/api/absensi', absensiRouter);

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('🚀 Memulai Pengujian Endpoint Absensi...');

  // Start test server on ephemeral port (0)
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 Server pengujian berjalan di ${baseUrl}`);

  try {
    // ----------------------------------------------------
    // TEST 1: POST /api/auth/login (Login Guru)
    // ----------------------------------------------------
    console.log('\n--- TEST 1: POST /api/auth/login ---');

    // 1.1 Password salah
    const resFail = await request('/api/auth/login', {
      method: 'POST',
      body: { nip: '198501012010011001', password: 'password_salah' }
    });
    console.log('1.1 Login password salah: HTTP', resFail.status, '(Diharapkan: 401)');
    if (resFail.status !== 401) throw new Error('Seharusnya gagal 401');

    // 1.2 Login Wali Kelas 1A
    const resWali = await request('/api/auth/login', {
      method: 'POST',
      body: { nip: '198501012010011001', password: 'guru123' }
    });
    console.log('1.2 Login Wali Kelas: HTTP', resWali.status, '(Diharapkan: 200)');
    if (resWali.status !== 200 || !resWali.data.token) throw new Error('Login Wali Kelas gagal');
    console.log('    Nama Guru:', resWali.data.guru.nama_guru);
    console.log('    Role:', resWali.data.guru.role);
    console.log('    Kelas:', resWali.data.guru.nama_kelas);
    const tokenWali = resWali.data.token;

    // 1.3 Login Guru Mapel PJOK
    const resMapel = await request('/api/auth/login', {
      method: 'POST',
      body: { nip: '199002022015022002', password: 'guru123' }
    });
    console.log('1.3 Login Guru Mapel: HTTP', resMapel.status, '(Diharapkan: 200)');
    if (resMapel.status !== 200 || !resMapel.data.token) throw new Error('Login Guru Mapel gagal');
    console.log('    Nama Guru:', resMapel.data.guru.nama_guru);
    console.log('    Role:', resMapel.data.guru.role);
    const tokenMapel = resMapel.data.token;

    // ----------------------------------------------------
    // TEST 2: GET /api/absensi (Proteksi & Format Grid)
    // ----------------------------------------------------
    console.log('\n--- TEST 2: GET /api/absensi ---');

    // 2.1 Tanpa Token
    const resNoAuth = await request('/api/absensi');
    console.log('2.1 Akses tanpa token: HTTP', resNoAuth.status, '(Diharapkan: 401)');
    if (resNoAuth.status !== 401) throw new Error('Seharusnya 401 Unauthorized');

    // 2.2 Wali Kelas melihat absensi bulan Oktober 2026
    const resGetWali = await request('/api/absensi?bulan=10&tahun=2026', { token: tokenWali });
    console.log('2.2 Wali Kelas GET absensi: HTTP', resGetWali.status, '(Diharapkan: 200)');
    if (resGetWali.status !== 200) throw new Error('GET absensi wali kelas gagal');
    console.log('    Kelas Terdeteksi:', resGetWali.data.kelas.nama_kelas);
    console.log('    Total Hari:', resGetWali.data.total_hari);
    console.log('    Total Murid:', resGetWali.data.total_murid);

    const muridSample = resGetWali.data.data[0];
    console.log('    Contoh Murid:', muridSample.no_urut, muridSample.nama_murid);
    console.log('    Struktur grid kolom 1 s.d. 31 ada:', Object.keys(muridSample.absensi).length === 31);
    console.log('    Rekap awal:', muridSample.rekap);

    // ----------------------------------------------------
    // TEST 3: POST /api/absensi (Batch Upsert)
    // ----------------------------------------------------
    console.log('\n--- TEST 3: POST /api/absensi (Batch Upsert) ---');

    const murid1Id = resGetWali.data.data[0].murid_id;
    const murid2Id = resGetWali.data.data[1].murid_id;

    const payloadAbsen = [
      { murid_id: murid1Id, tanggal: '2026-10-01', status: 'H' },
      { murid_id: murid1Id, tanggal: '2026-10-02', status: 'S' },
      { murid_id: murid2Id, tanggal: '2026-10-01', status: 'H' }
    ];

    const resPost = await request('/api/absensi', {
      method: 'POST',
      token: tokenWali,
      body: payloadAbsen
    });
    console.log('3.1 Simpan absensi murid oleh Wali Kelas: HTTP', resPost.status, resPost.data.message);
    if (resPost.status !== 200) throw new Error('POST absensi gagal');

    // Cek hasil update di GET
    const resVerify1 = await request('/api/absensi?bulan=10&tahun=2026', { token: tokenWali });
    const updatedMurid1 = resVerify1.data.data.find((m) => m.murid_id === murid1Id);
    console.log('3.2 Verifikasi data tersimpan di Grid:');
    console.log('    Tanggal 1:', updatedMurid1.absensi['1'], '(Diharapkan: H)');
    console.log('    Tanggal 2:', updatedMurid1.absensi['2'], '(Diharapkan: S)');
    console.log('    Rekap:', updatedMurid1.rekap);
    if (updatedMurid1.absensi['1'] !== 'H' || updatedMurid1.absensi['2'] !== 'S') {
      throw new Error('Data absensi tidak cocok');
    }

    // ----------------------------------------------------
    // TEST 4: Guru Mapel Mengubah Absensi (Shared Update)
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Guru Mapel Update Absensi (Shared Record) ---');

    // Guru mapel mengubah status murid 1 di tanggal 1 menjadi 'I' (Izin)
    const resMapelUpdate = await request('/api/absensi', {
      method: 'POST',
      token: tokenMapel,
      body: [{ murid_id: murid1Id, tanggal: '2026-10-01', status: 'I' }]
    });
    console.log('4.1 Guru Mapel ubah status tanggal 1 jadi "I": HTTP', resMapelUpdate.status);
    if (resMapelUpdate.status !== 200) throw new Error('Guru mapel update gagal');

    // Wali Kelas melihat perubahan secara realtime
    const resVerify2 = await request('/api/absensi?bulan=10&tahun=2026', { token: tokenWali });
    const finalMurid1 = resVerify2.data.data.find((m) => m.murid_id === murid1Id);
    console.log('4.2 Wali Kelas membaca perubahan yang dilakukan Guru Mapel:');
    console.log('    Tanggal 1 sekarang:', finalMurid1.absensi['1'], '(Diharapkan: I)');
    console.log('    Tanggal 2 sekarang:', finalMurid1.absensi['2'], '(Diharapkan: S)');
    console.log('    Rekap ter-update:', finalMurid1.rekap);
    if (finalMurid1.absensi['1'] !== 'I') {
      throw new Error('Shared update gagal merefleksikan perubahan guru mapel');
    }

    // ----------------------------------------------------
    // TEST 5: GET /api/absensi/daftar-kelas (Helper)
    // ----------------------------------------------------
    console.log('\n--- TEST 5: GET /api/absensi/daftar-kelas ---');
    const resKelas = await request('/api/absensi/daftar-kelas', { token: tokenMapel });
    console.log('5.1 Ambil daftar kelas untuk dropdown: HTTP', resKelas.status);
    console.log('    Jumlah kelas terdaftar:', resKelas.data.data.length);
    if (resKelas.data.data.length !== 12) throw new Error('Jumlah kelas harus 12');

    console.log('\n🎉 SEMUA PENGUJIAN ENDPOINT ABSENSI BERHASIL 100%! 🎉\n');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error('\n❌ PENGUJIAN GAGAL:', err);
  process.exit(1);
});

