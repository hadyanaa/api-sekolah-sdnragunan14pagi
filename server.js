const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper function untuk parsing tanggal aman
const parseDate = (val) => (val ? new Date(val) : null);

// Root Endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'API SDN 14 Ragunan Pagi siap digunakan 🚀',
    version: '1.0.0',
    endpoints: {
      public: [
        '/public/siswa (atau /public/murid)',
        '/public/sdm (atau /public/pegawai)',
        '/public/visi-misi',
        '/public/prestasi',
        '/public/ekskul',
        '/public/agenda',
        '/public/kalender-akademik',
        '/public/pengumuman',
        '/public/fasilitas'
      ],
      api_crud: [
        '/api/siswa',
        '/api/visi-misi',
        '/api/sdm',
        '/api/prestasi',
        '/api/ekskul',
        '/api/agenda',
        '/api/kalender-akademik',
        '/api/pengumuman',
        '/api/fasilitas'
      ]
    }
  });
});

// ==========================================
// 1. RUTE SISWA (Publik & Internal / CRUD)
// ==========================================

// GET Publik: Data ringkas siswa (mendukung filter query ?status=AKTIF atau ?status=ALUMNI & ?kelas=)
const getPublicSiswa = async (req, res) => {
  try {
    const { status, kelas } = req.query;
    const where = {};
    if (status) where.status = status.toUpperCase();
    if (kelas) where.kelas = kelas;

    const siswa = await prisma.siswa.findMany({
      where,
      select: {
        id: true,
        nisn: true,
        nis: true,
        nama: true,
        gender: true,
        kelas: true,
        status: true,
        tahunLulus: true
      },
      orderBy: { nama: 'asc' }
    });
    res.json({ success: true, count: siswa.length, data: siswa });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
app.get('/public/siswa', getPublicSiswa);
app.get('/public/murid', getPublicSiswa); // Kompatibilitas dengan rute lama

// GET Internal: Semua data siswa lengkap (termasuk alamat, ortu, no telp)
const getInternalSiswa = async (req, res) => {
  try {
    const { status, kelas, q } = req.query;
    const where = {};
    if (status) where.status = status.toUpperCase();
    if (kelas) where.kelas = kelas;
    if (q) {
      where.OR = [
        { nama: { contains: q, mode: 'insensitive' } },
        { nisn: { contains: q, mode: 'insensitive' } },
        { nis: { contains: q, mode: 'insensitive' } }
      ];
    }

    const siswa = await prisma.siswa.findMany({
      where,
      orderBy: { id: 'desc' }
    });
    res.json({ success: true, count: siswa.length, data: siswa });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
app.get('/internal/siswa', getInternalSiswa);
app.get('/internal/murid', getInternalSiswa); // Kompatibilitas dengan rute lama
app.get('/api/siswa', getInternalSiswa);

// GET Detail 1 Siswa
app.get('/api/siswa/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await prisma.siswa.findUnique({ where: { id } });
    if (!data) return res.status(404).json({ success: false, message: 'Data siswa tidak ditemukan' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Tambah Siswa Baru
const createSiswa = async (req, res) => {
  try {
    const {
      nisn, nis, nama, gender, kelas,
      tglLahir, tempatLahir, alamat,
      namaOrtu, noTelpOrtu, status, tahunLulus
    } = req.body;

    const dataBaru = await prisma.siswa.create({
      data: {
        nisn: nisn || null,
        nis: nis || null,
        nama,
        gender: gender || null,
        kelas: kelas || null,
        tglLahir: parseDate(tglLahir),
        tempatLahir: tempatLahir || null,
        alamat: alamat || null,
        namaOrtu: namaOrtu || null,
        noTelpOrtu: noTelpOrtu || null,
        status: status ? status.toUpperCase() : 'AKTIF',
        tahunLulus: tahunLulus || null
      }
    });
    res.status(201).json({ success: true, message: 'Siswa berhasil ditambahkan', data: dataBaru });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
app.post('/internal/siswa', createSiswa);
app.post('/internal/murid', createSiswa);
app.post('/api/siswa', createSiswa);

// PUT: Update Siswa
app.put('/api/siswa/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      nisn, nis, nama, gender, kelas,
      tglLahir, tempatLahir, alamat,
      namaOrtu, noTelpOrtu, status, tahunLulus
    } = req.body;

    const updateData = {
      ...(nisn !== undefined && { nisn }),
      ...(nis !== undefined && { nis }),
      ...(nama !== undefined && { nama }),
      ...(gender !== undefined && { gender }),
      ...(kelas !== undefined && { kelas }),
      ...(tglLahir !== undefined && { tglLahir: parseDate(tglLahir) }),
      ...(tempatLahir !== undefined && { tempatLahir }),
      ...(alamat !== undefined && { alamat }),
      ...(namaOrtu !== undefined && { namaOrtu }),
      ...(noTelpOrtu !== undefined && { noTelpOrtu }),
      ...(status !== undefined && { status: status.toUpperCase() }),
      ...(tahunLulus !== undefined && { tahunLulus })
    };

    const updated = await prisma.siswa.update({
      where: { id },
      data: updateData
    });
    res.json({ success: true, message: 'Data siswa berhasil diperbarui', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus Siswa
app.delete('/api/siswa/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.siswa.delete({ where: { id } });
    res.json({ success: true, message: 'Data siswa berhasil dihapus' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. RUTE VISI-MISI (Sekolah & Ekskul)
// ==========================================

// GET Visi Misi (publik & internal)
app.get(['/public/visi-misi', '/api/visi-misi'], async (req, res) => {
  try {
    // Mengambil data visi misi terbaru
    const visiMisi = await prisma.visiMisi.findFirst({
      orderBy: { id: 'desc' }
    });
    res.json({ success: true, data: visiMisi || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Tambah Visi Misi Baru
app.post('/api/visi-misi', async (req, res) => {
  try {
    const { visi, misi, tujuan, visiEkskul, misiEkskul, tujuanEkskul, fungsiEkskul } = req.body;
    const dataBaru = await prisma.visiMisi.create({
      data: {
        visi,
        misi,
        tujuan: tujuan || null,
        visiEkskul: visiEkskul || null,
        misiEkskul: misiEkskul || null,
        tujuanEkskul: tujuanEkskul || null,
        fungsiEkskul: fungsiEkskul || null
      }
    });
    res.status(201).json({ success: true, message: 'Visi misi berhasil disimpan', data: dataBaru });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT: Update Visi Misi by ID
app.put('/api/visi-misi/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { visi, misi, tujuan, visiEkskul, misiEkskul, tujuanEkskul, fungsiEkskul } = req.body;
    const updated = await prisma.visiMisi.update({
      where: { id },
      data: {
        ...(visi !== undefined && { visi }),
        ...(misi !== undefined && { misi }),
        ...(tujuan !== undefined && { tujuan }),
        ...(visiEkskul !== undefined && { visiEkskul }),
        ...(misiEkskul !== undefined && { misiEkskul }),
        ...(tujuanEkskul !== undefined && { tujuanEkskul }),
        ...(fungsiEkskul !== undefined && { fungsiEkskul })
      }
    });
    res.json({ success: true, message: 'Visi misi berhasil diperbarui', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. RUTE SDM (Pendidik & Tenaga Kependidikan)
// ==========================================

// GET Publik: SDM
const getPublicSdm = async (req, res) => {
  try {
    const { status, jabatan } = req.query;
    const where = {};
    if (status) where.status = status;
    if (jabatan) where.jabatan = jabatan;

    const sdm = await prisma.sdm.findMany({
      where,
      select: {
        id: true,
        nama: true,
        nipNikki: true,
        gender: true,
        jabatan: true,
        deskripsiJabatan: true,
        status: true,
        pendidikan: true,
        jurusan: true,
        fotoUrl: true
      },
      orderBy: { id: 'asc' }
    });
    res.json({ success: true, count: sdm.length, data: sdm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
app.get('/public/sdm', getPublicSdm);
app.get('/public/pegawai', getPublicSdm); // Kompatibilitas dengan rute lama

// GET Internal: Semua SDM lengkap
const getInternalSdm = async (req, res) => {
  try {
    const sdm = await prisma.sdm.findMany({
      orderBy: { id: 'asc' }
    });
    res.json({ success: true, count: sdm.length, data: sdm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
app.get('/internal/sdm', getInternalSdm);
app.get('/internal/pegawai', getInternalSdm); // Kompatibilitas dengan rute lama
app.get('/api/sdm', getInternalSdm);

// GET Detail 1 SDM
app.get('/api/sdm/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await prisma.sdm.findUnique({ where: { id } });
    if (!data) return res.status(404).json({ success: false, message: 'Data SDM tidak ditemukan' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Tambah SDM Baru
app.post(['/internal/sdm', '/api/sdm'], async (req, res) => {
  try {
    const {
      nama, nipNikki, gender, tglLahir, tmt,
      status, jabatan, deskripsiJabatan,
      pendidikan, jurusan, fotoUrl, noTelp, email
    } = req.body;

    const dataBaru = await prisma.sdm.create({
      data: {
        nama,
        nipNikki: nipNikki || null,
        gender: gender || null,
        tglLahir: parseDate(tglLahir),
        tmt: parseDate(tmt),
        status: status || null,
        jabatan,
        deskripsiJabatan: deskripsiJabatan || null,
        pendidikan: pendidikan || null,
        jurusan: jurusan || null,
        fotoUrl: fotoUrl || null,
        noTelp: noTelp || null,
        email: email || null
      }
    });
    res.status(201).json({ success: true, message: 'Data SDM berhasil ditambahkan', data: dataBaru });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT: Update SDM
app.put('/api/sdm/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      nama, nipNikki, gender, tglLahir, tmt,
      status, jabatan, deskripsiJabatan,
      pendidikan, jurusan, fotoUrl, noTelp, email
    } = req.body;

    const updated = await prisma.sdm.update({
      where: { id },
      data: {
        ...(nama !== undefined && { nama }),
        ...(nipNikki !== undefined && { nipNikki }),
        ...(gender !== undefined && { gender }),
        ...(tglLahir !== undefined && { tglLahir: parseDate(tglLahir) }),
        ...(tmt !== undefined && { tmt: parseDate(tmt) }),
        ...(status !== undefined && { status }),
        ...(jabatan !== undefined && { jabatan }),
        ...(deskripsiJabatan !== undefined && { deskripsiJabatan }),
        ...(pendidikan !== undefined && { pendidikan }),
        ...(jurusan !== undefined && { jurusan }),
        ...(fotoUrl !== undefined && { fotoUrl }),
        ...(noTelp !== undefined && { noTelp }),
        ...(email !== undefined && { email })
      }
    });
    res.json({ success: true, message: 'Data SDM berhasil diperbarui', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus SDM
app.delete('/api/sdm/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.sdm.delete({ where: { id } });
    res.json({ success: true, message: 'Data SDM berhasil dihapus' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. RUTE PRESTASI
// ==========================================

// GET Prestasi (publik & internal)
app.get(['/public/prestasi', '/api/prestasi'], async (req, res) => {
  try {
    const { kategori, tingkat } = req.query;
    const where = {};
    if (kategori) where.kategori = kategori;
    if (tingkat) where.tingkat = tingkat;

    const data = await prisma.prestasi.findMany({
      where,
      orderBy: { tanggal: 'desc' }
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET Detail Prestasi
app.get('/api/prestasi/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await prisma.prestasi.findUnique({ where: { id } });
    if (!data) return res.status(404).json({ success: false, message: 'Prestasi tidak ditemukan' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Tambah Prestasi
app.post('/api/prestasi', async (req, res) => {
  try {
    const {
      nama, namaPeserta, tanggal, kategori,
      deskripsi, peringkat, tingkat, penyelenggara, tempat, linkFoto
    } = req.body;

    const dataBaru = await prisma.prestasi.create({
      data: {
        nama,
        namaPeserta: namaPeserta || null,
        tanggal: parseDate(tanggal),
        kategori: kategori || null,
        deskripsi: deskripsi || null,
        peringkat: peringkat || null,
        tingkat: tingkat || null,
        penyelenggara: penyelenggara || null,
        tempat: tempat || null,
        linkFoto: linkFoto || null
      }
    });
    res.status(201).json({ success: true, message: 'Prestasi berhasil ditambahkan', data: dataBaru });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT: Update Prestasi
app.put('/api/prestasi/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      nama, namaPeserta, tanggal, kategori,
      deskripsi, peringkat, tingkat, penyelenggara, tempat, linkFoto
    } = req.body;

    const updated = await prisma.prestasi.update({
      where: { id },
      data: {
        ...(nama !== undefined && { nama }),
        ...(namaPeserta !== undefined && { namaPeserta }),
        ...(tanggal !== undefined && { tanggal: parseDate(tanggal) }),
        ...(kategori !== undefined && { kategori }),
        ...(deskripsi !== undefined && { deskripsi }),
        ...(peringkat !== undefined && { peringkat }),
        ...(tingkat !== undefined && { tingkat }),
        ...(penyelenggara !== undefined && { penyelenggara }),
        ...(tempat !== undefined && { tempat }),
        ...(linkFoto !== undefined && { linkFoto })
      }
    });
    res.json({ success: true, message: 'Prestasi berhasil diperbarui', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus Prestasi
app.delete('/api/prestasi/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.prestasi.delete({ where: { id } });
    res.json({ success: true, message: 'Prestasi berhasil dihapus' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. RUTE EKSKUL (Ekstrakurikuler)
// ==========================================

// GET Ekskul (publik & internal)
app.get(['/public/ekskul', '/api/ekskul'], async (req, res) => {
  try {
    const data = await prisma.ekskul.findMany({
      orderBy: { nama: 'asc' }
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET Detail Ekskul
app.get('/api/ekskul/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await prisma.ekskul.findUnique({ where: { id } });
    if (!data) return res.status(404).json({ success: false, message: 'Ekskul tidak ditemukan' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Tambah Ekskul
app.post('/api/ekskul', async (req, res) => {
  try {
    const { nama, pembina, pj, waktu, tujuan, materi, sifat, peserta, linkFoto } = req.body;
    const dataBaru = await prisma.ekskul.create({
      data: {
        nama,
        pembina: pembina || null,
        pj: pj || null,
        waktu: waktu || null,
        tujuan: tujuan || null,
        materi: materi || null,
        sifat: sifat || null,
        peserta: peserta || null,
        linkFoto: linkFoto || null
      }
    });
    res.status(201).json({ success: true, message: 'Ekskul berhasil ditambahkan', data: dataBaru });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT: Update Ekskul
app.put('/api/ekskul/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nama, pembina, pj, waktu, tujuan, materi, sifat, peserta, linkFoto } = req.body;
    const updated = await prisma.ekskul.update({
      where: { id },
      data: {
        ...(nama !== undefined && { nama }),
        ...(pembina !== undefined && { pembina }),
        ...(pj !== undefined && { pj }),
        ...(waktu !== undefined && { waktu }),
        ...(tujuan !== undefined && { tujuan }),
        ...(materi !== undefined && { materi }),
        ...(sifat !== undefined && { sifat }),
        ...(peserta !== undefined && { peserta }),
        ...(linkFoto !== undefined && { linkFoto })
      }
    });
    res.json({ success: true, message: 'Ekskul berhasil diperbarui', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus Ekskul
app.delete('/api/ekskul/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.ekskul.delete({ where: { id } });
    res.json({ success: true, message: 'Ekskul berhasil dihapus' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. RUTE AGENDA
// ==========================================

// GET Agenda (publik & internal)
app.get(['/public/agenda', '/api/agenda'], async (req, res) => {
  try {
    const { kategori } = req.query;
    const where = {};
    if (kategori) where.kategori = kategori;

    const data = await prisma.agenda.findMany({
      where,
      orderBy: { tanggal: 'asc' }
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET Detail Agenda
app.get('/api/agenda/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await prisma.agenda.findUnique({ where: { id } });
    if (!data) return res.status(404).json({ success: false, message: 'Agenda tidak ditemukan' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Tambah Agenda
app.post('/api/agenda', async (req, res) => {
  try {
    const { judul, deskripsi, kategori, tanggal, waktu, tempat, linkFoto } = req.body;
    const dataBaru = await prisma.agenda.create({
      data: {
        judul,
        deskripsi: deskripsi || null,
        kategori: kategori || null,
        tanggal: parseDate(tanggal) || new Date(),
        waktu: waktu || null,
        tempat: tempat || null,
        linkFoto: linkFoto || null
      }
    });
    res.status(201).json({ success: true, message: 'Agenda berhasil ditambahkan', data: dataBaru });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT: Update Agenda
app.put('/api/agenda/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { judul, deskripsi, kategori, tanggal, waktu, tempat, linkFoto } = req.body;
    const updated = await prisma.agenda.update({
      where: { id },
      data: {
        ...(judul !== undefined && { judul }),
        ...(deskripsi !== undefined && { deskripsi }),
        ...(kategori !== undefined && { kategori }),
        ...(tanggal !== undefined && { tanggal: parseDate(tanggal) }),
        ...(waktu !== undefined && { waktu }),
        ...(tempat !== undefined && { tempat }),
        ...(linkFoto !== undefined && { linkFoto })
      }
    });
    res.json({ success: true, message: 'Agenda berhasil diperbarui', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus Agenda
app.delete('/api/agenda/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.agenda.delete({ where: { id } });
    res.json({ success: true, message: 'Agenda berhasil dihapus' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 7. RUTE KALENDER AKADEMIK
// ==========================================

// GET Kalender Akademik (publik & internal)
app.get(['/public/kalender-akademik', '/api/kalender-akademik'], async (req, res) => {
  try {
    const { tahunAjaran, semester, kategori } = req.query;
    const where = {};
    if (tahunAjaran) where.tahunAjaran = tahunAjaran;
    if (semester) where.semester = semester;
    if (kategori) where.kategori = kategori;

    const data = await prisma.kalenderAkademik.findMany({
      where,
      orderBy: { start: 'asc' }
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET Detail Kalender Akademik
app.get('/api/kalender-akademik/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await prisma.kalenderAkademik.findUnique({ where: { id } });
    if (!data) return res.status(404).json({ success: false, message: 'Kalender akademik tidak ditemukan' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Tambah Kalender Akademik
app.post('/api/kalender-akademik', async (req, res) => {
  try {
    const { title, start, end, kategori, deskripsi, tahunAjaran, semester } = req.body;
    const dataBaru = await prisma.kalenderAkademik.create({
      data: {
        title,
        start: parseDate(start) || new Date(),
        end: parseDate(end),
        kategori: kategori || null,
        deskripsi: deskripsi || null,
        tahunAjaran: tahunAjaran || null,
        semester: semester || null
      }
    });
    res.status(201).json({ success: true, message: 'Jadwal kalender akademik berhasil ditambahkan', data: dataBaru });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT: Update Kalender Akademik
app.put('/api/kalender-akademik/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { title, start, end, kategori, deskripsi, tahunAjaran, semester } = req.body;
    const updated = await prisma.kalenderAkademik.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(start !== undefined && { start: parseDate(start) }),
        ...(end !== undefined && { end: parseDate(end) }),
        ...(kategori !== undefined && { kategori }),
        ...(deskripsi !== undefined && { deskripsi }),
        ...(tahunAjaran !== undefined && { tahunAjaran }),
        ...(semester !== undefined && { semester })
      }
    });
    res.json({ success: true, message: 'Jadwal kalender akademik berhasil diperbarui', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus Kalender Akademik
app.delete('/api/kalender-akademik/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.kalenderAkademik.delete({ where: { id } });
    res.json({ success: true, message: 'Jadwal kalender akademik berhasil dihapus' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 8. RUTE PENGUMUMAN
// ==========================================

// GET Pengumuman (publik & internal)
app.get(['/public/pengumuman', '/api/pengumuman'], async (req, res) => {
  try {
    const { kategori } = req.query;
    const where = {};
    if (kategori) where.kategori = kategori;

    const data = await prisma.pengumuman.findMany({
      where,
      orderBy: { tanggal: 'desc' }
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET Detail Pengumuman
app.get('/api/pengumuman/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await prisma.pengumuman.findUnique({ where: { id } });
    if (!data) return res.status(404).json({ success: false, message: 'Pengumuman tidak ditemukan' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Tambah Pengumuman
app.post('/api/pengumuman', async (req, res) => {
  try {
    const { judul, isi, tanggal, urlFile, kategori, penulis } = req.body;
    const dataBaru = await prisma.pengumuman.create({
      data: {
        judul,
        isi: isi || null,
        tanggal: parseDate(tanggal) || new Date(),
        urlFile: urlFile || null,
        kategori: kategori || null,
        penulis: penulis || null
      }
    });
    res.status(201).json({ success: true, message: 'Pengumuman berhasil ditambahkan', data: dataBaru });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT: Update Pengumuman
app.put('/api/pengumuman/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { judul, isi, tanggal, urlFile, kategori, penulis } = req.body;
    const updated = await prisma.pengumuman.update({
      where: { id },
      data: {
        ...(judul !== undefined && { judul }),
        ...(isi !== undefined && { isi }),
        ...(tanggal !== undefined && { tanggal: parseDate(tanggal) }),
        ...(urlFile !== undefined && { urlFile }),
        ...(kategori !== undefined && { kategori }),
        ...(penulis !== undefined && { penulis })
      }
    });
    res.json({ success: true, message: 'Pengumuman berhasil diperbarui', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus Pengumuman
app.delete('/api/pengumuman/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.pengumuman.delete({ where: { id } });
    res.json({ success: true, message: 'Pengumuman berhasil dihapus' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 9. RUTE FASILITAS
// ==========================================

// GET Fasilitas (publik & internal)
app.get(['/public/fasilitas', '/api/fasilitas'], async (req, res) => {
  try {
    const data = await prisma.fasilitas.findMany({
      orderBy: { id: 'asc' }
    });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET Detail Fasilitas
app.get('/api/fasilitas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await prisma.fasilitas.findUnique({ where: { id } });
    if (!data) return res.status(404).json({ success: false, message: 'Fasilitas tidak ditemukan' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST: Tambah Fasilitas
app.post('/api/fasilitas', async (req, res) => {
  try {
    const { nama, deskripsi, kondisi, linkFoto } = req.body;
    const dataBaru = await prisma.fasilitas.create({
      data: {
        nama,
        deskripsi: deskripsi || null,
        kondisi: kondisi || null,
        linkFoto: linkFoto || null
      }
    });
    res.status(201).json({ success: true, message: 'Fasilitas berhasil ditambahkan', data: dataBaru });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT: Update Fasilitas
app.put('/api/fasilitas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nama, deskripsi, kondisi, linkFoto } = req.body;
    const updated = await prisma.fasilitas.update({
      where: { id },
      data: {
        ...(nama !== undefined && { nama }),
        ...(deskripsi !== undefined && { deskripsi }),
        ...(kondisi !== undefined && { kondisi }),
        ...(linkFoto !== undefined && { linkFoto })
      }
    });
    res.json({ success: true, message: 'Fasilitas berhasil diperbarui', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE: Hapus Fasilitas
app.delete('/api/fasilitas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.fasilitas.delete({ where: { id } });
    res.json({ success: true, message: 'Fasilitas berhasil dihapus' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`Server API SDN Ragunan 14 Pagi berjalan di port ${PORT}`);
});