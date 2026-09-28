const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Helper untuk validasi & parse tanggal
const parseDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// Helper parse integer ID
const parseId = (val) => {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? null : parsed;
};

// ==========================================
// 1. VISI MISI — /admin/visi-misi
// ==========================================
router.put('/visi-misi', async (req, res) => {
  try {
    const { visi, misi } = req.body;

    if (!visi || typeof visi !== 'string' || !visi.trim()) {
      return res.status(400).json({ message: 'Visi wajib diisi' });
    }
    if (!misi || typeof misi !== 'string' || !misi.trim()) {
      return res.status(400).json({ message: 'Misi wajib diisi' });
    }

    const dataPayload = {
      visi: visi.trim(),
      misi: misi.trim(),
      tujuan: req.body.tujuan ? req.body.tujuan.trim() : null,
      visiEkskul: (req.body.visiEkskul || req.body.visi_ekskul || '').trim() || null,
      misiEkskul: (req.body.misiEkskul || req.body.misi_ekskul || '').trim() || null,
      tujuanEkskul: (req.body.tujuanEkskul || req.body.tujuan_ekskul || '').trim() || null,
      fungsiEkskul: (req.body.fungsiEkskul || req.body.fungsi_ekskul || '').trim() || null
    };

    const existing = await prisma.visiMisi.findFirst({
      orderBy: { id: 'desc' }
    });

    let result;
    if (existing) {
      result = await prisma.visiMisi.update({
        where: { id: existing.id },
        data: dataPayload
      });
    } else {
      result = await prisma.visiMisi.create({
        data: dataPayload
      });
    }

    return res.status(200).json({
      message: 'Visi misi berhasil diperbarui',
      data: result
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal memperbarui visi misi: ' + error.message });
  }
});

// ==========================================
// 2. SDM SEKOLAH — /admin/sdm
// ==========================================
router.post('/sdm', async (req, res) => {
  try {
    const { nama, nipNikki, gender, status, jabatan, pendidikan, jurusan } = req.body;

    if (!nama || !nama.trim()) return res.status(400).json({ message: 'Nama lengkap wajib diisi' });
    if (!nipNikki || !nipNikki.trim()) return res.status(400).json({ message: 'NIP/NIKKI wajib diisi' });
    if (!gender || !gender.trim()) return res.status(400).json({ message: 'Gender wajib diisi' });
    if (!['L', 'P'].includes(gender.trim())) return res.status(400).json({ message: "Gender harus 'L' atau 'P'" });
    if (!status || !status.trim()) return res.status(400).json({ message: 'Status wajib diisi' });
    if (!['PNS', 'CPNS', 'Non-PNS'].includes(status.trim())) {
      return res.status(400).json({ message: "Status harus salah satu dari: 'PNS', 'CPNS', 'Non-PNS'" });
    }
    if (!jabatan || !jabatan.trim()) return res.status(400).json({ message: 'Jabatan wajib diisi' });
    if (!pendidikan || !pendidikan.trim()) return res.status(400).json({ message: 'Jenjang pendidikan wajib diisi' });
    if (!jurusan || !jurusan.trim()) return res.status(400).json({ message: 'Jurusan pendidikan wajib diisi' });

    const created = await prisma.sdm.create({
      data: {
        nama: nama.trim(),
        nipNikki: nipNikki.trim(),
        gender: gender.trim(),
        status: status.trim(),
        jabatan: jabatan.trim(),
        deskripsiJabatan: req.body.deskripsiJabatan ? req.body.deskripsiJabatan.trim() : jabatan.trim(),
        pendidikan: pendidikan.trim(),
        jurusan: jurusan.trim(),
        fotoUrl: req.body.fotoUrl || req.body.foto || null,
        noTelp: req.body.noTelp || null,
        email: req.body.email || null
      }
    });

    return res.status(201).json({
      message: 'SDM berhasil ditambahkan',
      data: created
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menambahkan SDM: ' + error.message });
  }
});

router.put('/sdm/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID SDM tidak valid' });

    const existing = await prisma.sdm.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data SDM tidak ditemukan' });

    const { nama, nipNikki, gender, status, jabatan, pendidikan, jurusan } = req.body;

    if (!nama || !nama.trim()) return res.status(400).json({ message: 'Nama lengkap wajib diisi' });
    if (!nipNikki || !nipNikki.trim()) return res.status(400).json({ message: 'NIP/NIKKI wajib diisi' });
    if (!gender || !gender.trim()) return res.status(400).json({ message: 'Gender wajib diisi' });
    if (!['L', 'P'].includes(gender.trim())) return res.status(400).json({ message: "Gender harus 'L' atau 'P'" });
    if (!status || !status.trim()) return res.status(400).json({ message: 'Status wajib diisi' });
    if (!['PNS', 'CPNS', 'Non-PNS'].includes(status.trim())) {
      return res.status(400).json({ message: "Status harus salah satu dari: 'PNS', 'CPNS', 'Non-PNS'" });
    }
    if (!jabatan || !jabatan.trim()) return res.status(400).json({ message: 'Jabatan wajib diisi' });
    if (!pendidikan || !pendidikan.trim()) return res.status(400).json({ message: 'Jenjang pendidikan wajib diisi' });
    if (!jurusan || !jurusan.trim()) return res.status(400).json({ message: 'Jurusan pendidikan wajib diisi' });

    const updated = await prisma.sdm.update({
      where: { id },
      data: {
        nama: nama.trim(),
        nipNikki: nipNikki.trim(),
        gender: gender.trim(),
        status: status.trim(),
        jabatan: jabatan.trim(),
        deskripsiJabatan: req.body.deskripsiJabatan ? req.body.deskripsiJabatan.trim() : jabatan.trim(),
        pendidikan: pendidikan.trim(),
        jurusan: jurusan.trim(),
        fotoUrl: req.body.fotoUrl !== undefined ? (req.body.fotoUrl || null) : (req.body.foto !== undefined ? req.body.foto : existing.fotoUrl)
      }
    });

    return res.status(200).json({
      message: 'SDM berhasil diperbarui',
      data: updated
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal memperbarui SDM: ' + error.message });
  }
});

router.delete('/sdm/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID SDM tidak valid' });

    const existing = await prisma.sdm.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data SDM tidak ditemukan' });

    await prisma.sdm.delete({ where: { id } });

    return res.status(200).json({
      message: 'SDM berhasil dihapus'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menghapus SDM: ' + error.message });
  }
});

// ==========================================
// 3. PRESTASI — /admin/prestasi
// ==========================================
router.post('/prestasi', async (req, res) => {
  try {
    const { nama, tingkat, peraih, tanggal } = req.body;

    if (!nama || !nama.trim()) return res.status(400).json({ message: 'Nama/judul prestasi wajib diisi' });
    const validTingkat = ['Kecamatan', 'Kota', 'Provinsi', 'Nasional', 'Internasional'];
    if (!tingkat || !validTingkat.includes(tingkat.trim())) {
      return res.status(400).json({ message: 'Tingkat harus salah satu dari: Kecamatan, Kota, Provinsi, Nasional, Internasional' });
    }
    if (!peraih || !peraih.trim()) return res.status(400).json({ message: 'Nama peraih prestasi wajib diisi' });
    if (!tanggal) return res.status(400).json({ message: 'Tanggal wajib diisi' });

    const parsedTanggal = parseDate(tanggal);
    if (!parsedTanggal) return res.status(400).json({ message: 'Format tanggal tidak valid (gunakan format YYYY-MM-DD)' });

    const created = await prisma.prestasi.create({
      data: {
        nama: nama.trim(),
        tingkat: tingkat.trim(),
        namaPeserta: peraih.trim(),
        peraih: peraih.trim(),
        tanggal: parsedTanggal,
        deskripsi: req.body.deskripsi ? req.body.deskripsi.trim() : null,
        kategori: req.body.kategori ? req.body.kategori.trim() : 'Umum',
        peringkat: req.body.peringkat ? req.body.peringkat.trim() : null,
        penyelenggara: req.body.penyelenggara ? req.body.penyelenggara.trim() : null,
        tempat: req.body.tempat ? req.body.tempat.trim() : null,
        linkFoto: req.body.linkFoto || req.body.foto || null
      }
    });

    return res.status(201).json({
      message: 'Prestasi berhasil ditambahkan',
      data: {
        ...created,
        peraih: created.peraih || created.namaPeserta
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menambahkan prestasi: ' + error.message });
  }
});

router.put('/prestasi/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID prestasi tidak valid' });

    const existing = await prisma.prestasi.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data prestasi tidak ditemukan' });

    const { nama, tingkat, peraih, tanggal } = req.body;

    if (!nama || !nama.trim()) return res.status(400).json({ message: 'Nama/judul prestasi wajib diisi' });
    const validTingkat = ['Kecamatan', 'Kota', 'Provinsi', 'Nasional', 'Internasional'];
    if (!tingkat || !validTingkat.includes(tingkat.trim())) {
      return res.status(400).json({ message: 'Tingkat harus salah satu dari: Kecamatan, Kota, Provinsi, Nasional, Internasional' });
    }
    if (!peraih || !peraih.trim()) return res.status(400).json({ message: 'Nama peraih prestasi wajib diisi' });
    if (!tanggal) return res.status(400).json({ message: 'Tanggal wajib diisi' });

    const parsedTanggal = parseDate(tanggal);
    if (!parsedTanggal) return res.status(400).json({ message: 'Format tanggal tidak valid (gunakan format YYYY-MM-DD)' });

    const updated = await prisma.prestasi.update({
      where: { id },
      data: {
        nama: nama.trim(),
        tingkat: tingkat.trim(),
        namaPeserta: peraih.trim(),
        peraih: peraih.trim(),
        tanggal: parsedTanggal,
        deskripsi: req.body.deskripsi !== undefined ? (req.body.deskripsi ? req.body.deskripsi.trim() : null) : existing.deskripsi,
        linkFoto: req.body.linkFoto !== undefined ? (req.body.linkFoto || null) : (req.body.foto !== undefined ? req.body.foto : existing.linkFoto)
      }
    });

    return res.status(200).json({
      message: 'Prestasi berhasil diperbarui',
      data: {
        ...updated,
        peraih: updated.peraih || updated.namaPeserta
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal memperbarui prestasi: ' + error.message });
  }
});

router.delete('/prestasi/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID prestasi tidak valid' });

    const existing = await prisma.prestasi.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data prestasi tidak ditemukan' });

    await prisma.prestasi.delete({ where: { id } });

    return res.status(200).json({
      message: 'Prestasi berhasil dihapus'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menghapus prestasi: ' + error.message });
  }
});

// ==========================================
// 4. EKSTRAKURIKULER — /admin/ekskul
// ==========================================
router.post('/ekskul', async (req, res) => {
  try {
    const { nama, pembina, hari, jam } = req.body;

    if (!nama || !nama.trim()) return res.status(400).json({ message: 'Nama ekskul wajib diisi' });
    if (!pembina || !pembina.trim()) return res.status(400).json({ message: 'Nama pembina wajib diisi' });
    if (!hari || !hari.trim()) return res.status(400).json({ message: 'Hari pelaksanaan wajib diisi' });
    if (!jam || !jam.trim()) return res.status(400).json({ message: 'Waktu pelaksanaan (jam) wajib diisi' });

    const created = await prisma.ekskul.create({
      data: {
        nama: nama.trim(),
        pembina: pembina.trim(),
        hari: hari.trim(),
        jam: jam.trim(),
        waktu: `${hari.trim()}, ${jam.trim()}`,
        deskripsi: req.body.deskripsi ? req.body.deskripsi.trim() : null,
        tujuan: req.body.deskripsi ? req.body.deskripsi.trim() : null,
        linkFoto: req.body.linkFoto || req.body.foto || null,
        sifat: req.body.sifat ? req.body.sifat.trim() : 'Pilihan',
        peserta: req.body.peserta ? req.body.peserta.trim() : 'Kelas 1-6'
      }
    });

    return res.status(201).json({
      message: 'Ekstrakurikuler berhasil ditambahkan',
      data: created
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menambahkan ekskul: ' + error.message });
  }
});

router.put('/ekskul/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID ekskul tidak valid' });

    const existing = await prisma.ekskul.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data ekskul tidak ditemukan' });

    const { nama, pembina, hari, jam } = req.body;

    if (!nama || !nama.trim()) return res.status(400).json({ message: 'Nama ekskul wajib diisi' });
    if (!pembina || !pembina.trim()) return res.status(400).json({ message: 'Nama pembina wajib diisi' });
    if (!hari || !hari.trim()) return res.status(400).json({ message: 'Hari pelaksanaan wajib diisi' });
    if (!jam || !jam.trim()) return res.status(400).json({ message: 'Waktu pelaksanaan (jam) wajib diisi' });

    const updated = await prisma.ekskul.update({
      where: { id },
      data: {
        nama: nama.trim(),
        pembina: pembina.trim(),
        hari: hari.trim(),
        jam: jam.trim(),
        waktu: `${hari.trim()}, ${jam.trim()}`,
        deskripsi: req.body.deskripsi !== undefined ? (req.body.deskripsi ? req.body.deskripsi.trim() : null) : existing.deskripsi,
        tujuan: req.body.deskripsi !== undefined ? (req.body.deskripsi ? req.body.deskripsi.trim() : null) : existing.tujuan,
        linkFoto: req.body.linkFoto !== undefined ? (req.body.linkFoto || null) : (req.body.foto !== undefined ? req.body.foto : existing.linkFoto)
      }
    });

    return res.status(200).json({
      message: 'Ekstrakurikuler berhasil diperbarui',
      data: updated
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal memperbarui ekskul: ' + error.message });
  }
});

router.delete('/ekskul/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID ekskul tidak valid' });

    const existing = await prisma.ekskul.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data ekskul tidak ditemukan' });

    await prisma.ekskul.delete({ where: { id } });

    return res.status(200).json({
      message: 'Ekstrakurikuler berhasil dihapus'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menghapus ekskul: ' + error.message });
  }
});

// ==========================================
// 5. AGENDA — /admin/agenda
// ==========================================
router.post('/agenda', async (req, res) => {
  try {
    const { judul, deskripsi, tanggal } = req.body;

    if (!judul || !judul.trim()) return res.status(400).json({ message: 'Judul agenda wajib diisi' });
    if (!deskripsi || !deskripsi.trim()) return res.status(400).json({ message: 'Deskripsi agenda wajib diisi' });
    if (!tanggal) return res.status(400).json({ message: 'Tanggal wajib diisi' });

    const parsedTanggal = parseDate(tanggal);
    if (!parsedTanggal) return res.status(400).json({ message: 'Format tanggal tidak valid (gunakan format YYYY-MM-DD)' });

    const lokasiVal = req.body.lokasi || req.body.tempat || null;

    const created = await prisma.agenda.create({
      data: {
        judul: judul.trim(),
        deskripsi: deskripsi.trim(),
        tanggal: parsedTanggal,
        tempat: lokasiVal ? lokasiVal.trim() : null,
        lokasi: lokasiVal ? lokasiVal.trim() : null,
        linkFoto: req.body.linkFoto || req.body.foto || null,
        kategori: req.body.kategori ? req.body.kategori.trim() : 'Kegiatan Sekolah'
      }
    });

    return res.status(201).json({
      message: 'Agenda berhasil ditambahkan',
      data: {
        ...created,
        lokasi: created.lokasi || created.tempat
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menambahkan agenda: ' + error.message });
  }
});

router.put('/agenda/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID agenda tidak valid' });

    const existing = await prisma.agenda.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data agenda tidak ditemukan' });

    const { judul, deskripsi, tanggal } = req.body;

    if (!judul || !judul.trim()) return res.status(400).json({ message: 'Judul agenda wajib diisi' });
    if (!deskripsi || !deskripsi.trim()) return res.status(400).json({ message: 'Deskripsi agenda wajib diisi' });
    if (!tanggal) return res.status(400).json({ message: 'Tanggal wajib diisi' });

    const parsedTanggal = parseDate(tanggal);
    if (!parsedTanggal) return res.status(400).json({ message: 'Format tanggal tidak valid (gunakan format YYYY-MM-DD)' });

    const lokasiVal = req.body.lokasi !== undefined ? req.body.lokasi : req.body.tempat;

    const updated = await prisma.agenda.update({
      where: { id },
      data: {
        judul: judul.trim(),
        deskripsi: deskripsi.trim(),
        tanggal: parsedTanggal,
        tempat: lokasiVal !== undefined ? (lokasiVal ? lokasiVal.trim() : null) : existing.tempat,
        lokasi: lokasiVal !== undefined ? (lokasiVal ? lokasiVal.trim() : null) : (existing.lokasi || existing.tempat),
        linkFoto: req.body.linkFoto !== undefined ? (req.body.linkFoto || null) : (req.body.foto !== undefined ? req.body.foto : existing.linkFoto)
      }
    });

    return res.status(200).json({
      message: 'Agenda berhasil diperbarui',
      data: {
        ...updated,
        lokasi: updated.lokasi || updated.tempat
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal memperbarui agenda: ' + error.message });
  }
});

router.delete('/agenda/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID agenda tidak valid' });

    const existing = await prisma.agenda.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data agenda tidak ditemukan' });

    await prisma.agenda.delete({ where: { id } });

    return res.status(200).json({
      message: 'Agenda berhasil dihapus'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menghapus agenda: ' + error.message });
  }
});

// ==========================================
// 6. PENGUMUMAN — /admin/pengumuman
// ==========================================
router.post('/pengumuman', async (req, res) => {
  try {
    const { judul, deskripsi, tanggal } = req.body;

    if (!judul || !judul.trim()) return res.status(400).json({ message: 'Judul pengumuman wajib diisi' });
    if (!deskripsi || !deskripsi.trim()) return res.status(400).json({ message: 'Isi pengumuman wajib diisi' });
    if (!tanggal) return res.status(400).json({ message: 'Tanggal wajib diisi' });

    const parsedTanggal = parseDate(tanggal);
    if (!parsedTanggal) return res.status(400).json({ message: 'Format tanggal tidak valid (gunakan format YYYY-MM-DD)' });

    const created = await prisma.pengumuman.create({
      data: {
        judul: judul.trim(),
        isi: deskripsi.trim(),
        deskripsi: deskripsi.trim(),
        tanggal: parsedTanggal,
        urlFile: req.body.urlFile ? req.body.urlFile.trim() : null,
        kategori: req.body.kategori ? req.body.kategori.trim() : 'Umum',
        penulis: req.body.penulis ? req.body.penulis.trim() : 'Admin Sekolah'
      }
    });

    return res.status(201).json({
      message: 'Pengumuman berhasil ditambahkan',
      data: {
        ...created,
        deskripsi: created.deskripsi || created.isi
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menambahkan pengumuman: ' + error.message });
  }
});

router.put('/pengumuman/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID pengumuman tidak valid' });

    const existing = await prisma.pengumuman.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data pengumuman tidak ditemukan' });

    const { judul, deskripsi, tanggal } = req.body;

    if (!judul || !judul.trim()) return res.status(400).json({ message: 'Judul pengumuman wajib diisi' });
    if (!deskripsi || !deskripsi.trim()) return res.status(400).json({ message: 'Isi pengumuman wajib diisi' });
    if (!tanggal) return res.status(400).json({ message: 'Tanggal wajib diisi' });

    const parsedTanggal = parseDate(tanggal);
    if (!parsedTanggal) return res.status(400).json({ message: 'Format tanggal tidak valid (gunakan format YYYY-MM-DD)' });

    const updated = await prisma.pengumuman.update({
      where: { id },
      data: {
        judul: judul.trim(),
        isi: deskripsi.trim(),
        deskripsi: deskripsi.trim(),
        tanggal: parsedTanggal,
        urlFile: req.body.urlFile !== undefined ? (req.body.urlFile ? req.body.urlFile.trim() : null) : existing.urlFile
      }
    });

    return res.status(200).json({
      message: 'Pengumuman berhasil diperbarui',
      data: {
        ...updated,
        deskripsi: updated.deskripsi || updated.isi
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal memperbarui pengumuman: ' + error.message });
  }
});

router.delete('/pengumuman/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID pengumuman tidak valid' });

    const existing = await prisma.pengumuman.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data pengumuman tidak ditemukan' });

    await prisma.pengumuman.delete({ where: { id } });

    return res.status(200).json({
      message: 'Pengumuman berhasil dihapus'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menghapus pengumuman: ' + error.message });
  }
});

// ==========================================
// 7. KALENDER AKADEMIK — /admin/kalender-akademik
// ==========================================
router.post('/kalender-akademik', async (req, res) => {
  try {
    const { title, start, end, kategori } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ message: 'Judul event wajib diisi' });
    if (!start) return res.status(400).json({ message: 'Tanggal mulai wajib diisi' });
    if (!end) return res.status(400).json({ message: 'Tanggal selesai wajib diisi' });

    const parsedStart = parseDate(start);
    if (!parsedStart) return res.status(400).json({ message: 'Format tanggal mulai tidak valid (gunakan format YYYY-MM-DD)' });

    const parsedEnd = parseDate(end);
    if (!parsedEnd) return res.status(400).json({ message: 'Format tanggal selesai tidak valid (gunakan format YYYY-MM-DD)' });

    const validKategori = ['Event', 'Libur', 'Ujian', 'Kegiatan'];
    if (!kategori || !validKategori.includes(kategori.trim())) {
      return res.status(400).json({ message: "Kategori harus salah satu dari: 'Event', 'Libur', 'Ujian', 'Kegiatan'" });
    }

    const created = await prisma.kalenderAkademik.create({
      data: {
        title: title.trim(),
        start: parsedStart,
        end: parsedEnd,
        kategori: kategori.trim(),
        deskripsi: req.body.deskripsi ? req.body.deskripsi.trim() : null,
        tahunAjaran: req.body.tahunAjaran ? req.body.tahunAjaran.trim() : null,
        semester: req.body.semester ? req.body.semester.trim() : null
      }
    });

    return res.status(201).json({
      message: 'Event kalender akademik berhasil ditambahkan',
      data: created
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menambahkan event kalender: ' + error.message });
  }
});

router.put('/kalender-akademik/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID event kalender tidak valid' });

    const existing = await prisma.kalenderAkademik.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data event kalender tidak ditemukan' });

    const { title, start, end, kategori } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ message: 'Judul event wajib diisi' });
    if (!start) return res.status(400).json({ message: 'Tanggal mulai wajib diisi' });
    if (!end) return res.status(400).json({ message: 'Tanggal selesai wajib diisi' });

    const parsedStart = parseDate(start);
    if (!parsedStart) return res.status(400).json({ message: 'Format tanggal mulai tidak valid (gunakan format YYYY-MM-DD)' });

    const parsedEnd = parseDate(end);
    if (!parsedEnd) return res.status(400).json({ message: 'Format tanggal selesai tidak valid (gunakan format YYYY-MM-DD)' });

    const validKategori = ['Event', 'Libur', 'Ujian', 'Kegiatan'];
    if (!kategori || !validKategori.includes(kategori.trim())) {
      return res.status(400).json({ message: "Kategori harus salah satu dari: 'Event', 'Libur', 'Ujian', 'Kegiatan'" });
    }

    const updated = await prisma.kalenderAkademik.update({
      where: { id },
      data: {
        title: title.trim(),
        start: parsedStart,
        end: parsedEnd,
        kategori: kategori.trim(),
        deskripsi: req.body.deskripsi !== undefined ? (req.body.deskripsi ? req.body.deskripsi.trim() : null) : existing.deskripsi
      }
    });

    return res.status(200).json({
      message: 'Event kalender akademik berhasil diperbarui',
      data: updated
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal memperbarui event kalender: ' + error.message });
  }
});

router.delete('/kalender-akademik/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID event kalender tidak valid' });

    const existing = await prisma.kalenderAkademik.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data event kalender tidak ditemukan' });

    await prisma.kalenderAkademik.delete({ where: { id } });

    return res.status(200).json({
      message: 'Event kalender akademik berhasil dihapus'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Gagal menghapus event kalender: ' + error.message });
  }
});

module.exports = router;
