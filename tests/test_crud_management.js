const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authGuruRouter = require('../routes/authGuru');
const kelasRouter = require('../routes/kelas');
const guruRouter = require('../routes/guru');
const muridRouter = require('../routes/murid');

const app = express();
app.use(express.json());
app.use('/api/auth', authGuruRouter);
app.use('/api/kelas', kelasRouter);
app.use('/api/guru', guruRouter);
app.use('/api/murid', muridRouter);

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
  console.log('🚀 Memulai Pengujian CRUD Master Data (Kelas, Guru, Murid)...');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 Server pengujian berjalan di ${baseUrl}`);

  const secret = process.env.JWT_SECRET || 'sdn14ragunan_jwt_secret_key_super_secure_2026';

  // 1. Token Admin
  const adminToken = jwt.sign({ username: 'admin', role: 'admin' }, secret, { expiresIn: '1h' });

  // 2. Token Wali Kelas 1A (Login via API)
  const loginWali = await request('/api/auth/login', {
    method: 'POST',
    body: { nip: '198501012010011001', password: 'guru123' }
  });
  const waliToken = loginWali.data.token;
  const waliKelasId = loginWali.data.guru.kelas_id;

  try {
    // ==========================================
    // PENGUJIAN 1: KELAS
    // ==========================================
    console.log('\n--- 1. PENGUJIAN KELAS ---');

    // 1.1 GET daftar kelas
    const resKelasList = await request('/api/kelas');
    console.log('1.1 GET /api/kelas: HTTP', resKelasList.status, 'Total kelas:', resKelasList.data.count);
    if (resKelasList.status !== 200 || resKelasList.data.count < 1) throw new Error('GET kelas gagal');

    // 1.2 Wali Kelas coba buat kelas -> 403 Forbidden
    const resWaliAddKelas = await request('/api/kelas', {
      method: 'POST',
      token: waliToken,
      body: { nama_kelas: 'TestKelas' }
    });
    console.log('1.2 Wali Kelas coba buat kelas: HTTP', resWaliAddKelas.status, '(Diharapkan: 403)');
    if (resWaliAddKelas.status !== 403) throw new Error('Wali kelas tidak boleh buat kelas');

    // 1.3 Admin buat kelas baru
    const resAdminAddKelas = await request('/api/kelas', {
      method: 'POST',
      token: adminToken,
      body: { nama_kelas: '1Z_TEST' }
    });
    console.log('1.3 Admin buat kelas baru: HTTP', resAdminAddKelas.status, resAdminAddKelas.data.message);
    if (resAdminAddKelas.status !== 201) throw new Error('Admin gagal buat kelas');
    const createdKelasId = resAdminAddKelas.data.data.id;

    // 1.4 Admin edit kelas
    const resEditKelas = await request(`/api/kelas/${createdKelasId}`, {
      method: 'PUT',
      token: adminToken,
      body: { nama_kelas: '1Z_EDITED' }
    });
    console.log('1.4 Admin edit kelas: HTTP', resEditKelas.status, resEditKelas.data.data.nama_kelas);
    if (resEditKelas.status !== 200) throw new Error('Edit kelas gagal');

    // 1.5 Admin hapus kelas
    const resDeleteKelas = await request(`/api/kelas/${createdKelasId}`, {
      method: 'DELETE',
      token: adminToken
    });
    console.log('1.5 Admin hapus kelas: HTTP', resDeleteKelas.status, resDeleteKelas.data.message);
    if (resDeleteKelas.status !== 200) throw new Error('Hapus kelas gagal');

    // ==========================================
    // PENGUJIAN 2: GURU
    // ==========================================
    console.log('\n--- 2. PENGUJIAN GURU ---');

    // 2.1 GET guru
    const resGuruList = await request('/api/guru', { token: adminToken });
    console.log('2.1 GET /api/guru: HTTP', resGuruList.status, 'Total guru:', resGuruList.data.count);
    if (resGuruList.status !== 200) throw new Error('GET guru gagal');

    // 2.2 Admin buat guru baru
    const resAddGuru = await request('/api/guru', {
      method: 'POST',
      token: adminToken,
      body: {
        nip: '199512122020121099',
        nama_guru: 'Guru Baru Test, S.Pd',
        password: 'password123',
        role: 'GURU_MAPEL'
      }
    });
    console.log('2.2 Admin tambah guru: HTTP', resAddGuru.status, resAddGuru.data.message);
    if (resAddGuru.status !== 201) throw new Error('Tambah guru gagal');
    const createdGuruId = resAddGuru.data.data.id;

    // 2.3 Guru test login dengan password yang baru dibuat
    const resLoginGuruBaru = await request('/api/auth/login', {
      method: 'POST',
      body: { nip: '199512122020121099', password: 'password123' }
    });
    console.log('2.3 Guru baru login: HTTP', resLoginGuruBaru.status, resLoginGuruBaru.data.guru.nama_guru);
    if (resLoginGuruBaru.status !== 200) throw new Error('Login guru baru gagal');
    const guruBaruToken = resLoginGuruBaru.data.token;

    // 2.4 Guru edit nama sendiri
    const resGuruSelfEdit = await request(`/api/guru/${createdGuruId}`, {
      method: 'PUT',
      token: guruBaruToken,
      body: { nama_guru: 'Guru Baru Updated, M.Pd' }
    });
    console.log('2.4 Guru edit nama sendiri: HTTP', resGuruSelfEdit.status, resGuruSelfEdit.data.data.nama_guru);
    if (resGuruSelfEdit.status !== 200) throw new Error('Guru edit diri sendiri gagal');

    // 2.5 Admin hapus akun guru uji
    const resDeleteGuru = await request(`/api/guru/${createdGuruId}`, {
      method: 'DELETE',
      token: adminToken
    });
    console.log('2.5 Admin hapus guru: HTTP', resDeleteGuru.status, resDeleteGuru.data.message);
    if (resDeleteGuru.status !== 200) throw new Error('Hapus guru gagal');

    // ==========================================
    // PENGUJIAN 3: MURID (Wali Kelas & Admin)
    // ==========================================
    console.log('\n--- 3. PENGUJIAN MURID ---');

    // 3.1 Wali kelas melihat daftar murid (otomatis terfilter kelas 1A)
    const resMuridWali = await request('/api/murid', { token: waliToken });
    console.log('3.1 Wali Kelas GET /api/murid: HTTP', resMuridWali.status, 'Jumlah murid kelas 1A:', resMuridWali.data.count);
    if (resMuridWali.status !== 200) throw new Error('GET murid wali kelas gagal');

    // 3.2 Wali Kelas menambah 1 murid baru ke kelasnya
    const resAddMurid = await request('/api/murid', {
      method: 'POST',
      token: waliToken,
      body: {
        nama_murid: 'Zaki Mubarak (Murid Uji)',
        no_urut: 99
      }
    });
    console.log('3.2 Wali Kelas tambah murid: HTTP', resAddMurid.status, resAddMurid.data.message);
    if (resAddMurid.status !== 201) throw new Error('Wali kelas tambah murid gagal');
    const createdMuridId = resAddMurid.data.data.id;

    // 3.3 Wali Kelas edit data murid tersebut
    const resEditMurid = await request(`/api/murid/${createdMuridId}`, {
      method: 'PUT',
      token: waliToken,
      body: {
        nama_murid: 'Zaki Mubarak Al-Khatib'
      }
    });
    console.log('3.3 Wali Kelas edit murid: HTTP', resEditMurid.status, resEditMurid.data.data.nama_murid);
    if (resEditMurid.status !== 200 || resEditMurid.data.data.nama_murid !== 'Zaki Mubarak Al-Khatib') {
      throw new Error('Edit murid gagal');
    }

    // 3.4 Wali Kelas Bulk Import 3 murid sekaligus
    const resBulkMurid = await request('/api/murid/bulk', {
      method: 'POST',
      token: waliToken,
      body: {
        murid: [
          { nama_murid: 'Bulk Siswa 1', no_urut: 101 },
          { nama_murid: 'Bulk Siswa 2', no_urut: 102 },
          { nama_murid: 'Bulk Siswa 3', no_urut: 103 }
        ]
      }
    });
    console.log('3.4 Wali Kelas Bulk Import murid: HTTP', resBulkMurid.status, resBulkMurid.data.message);
    if (resBulkMurid.status !== 201 || resBulkMurid.data.count !== 3) throw new Error('Bulk import murid gagal');

    // 3.5 Wali Kelas hapus murid uji
    const resDeleteMurid = await request(`/api/murid/${createdMuridId}`, {
      method: 'DELETE',
      token: waliToken
    });
    console.log('3.5 Wali Kelas hapus murid uji: HTTP', resDeleteMurid.status, resDeleteMurid.data.message);
    if (resDeleteMurid.status !== 200) throw new Error('Hapus murid gagal');

    console.log('\n🎉 SEMUA PENGUJIAN MASTER DATA (KELAS, GURU, MURID) 100% SUKSES! 🎉\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ PENGUJIAN CRUD GAGAL:', err);
  process.exit(1);
});

