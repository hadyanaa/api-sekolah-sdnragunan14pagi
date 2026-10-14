const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

const parseId = (val) => {
  const p = parseInt(val, 10);
  return isNaN(p) ? null : p;
};

// ==========================================
// 1. GET /api/murid (Daftar Murid)
// Support query: ?kelas_id=1 & ?q=budi
// Jika Wali Kelas tanpa query: otomatis filter kelasnya
// ==========================================
router.get('/', authFlexible, async (req, res) => {
  try {
    const where = {};

    if (req.query.kelas_id) {
      where.kelasId = parseId(req.query.kelas_id);
    } else if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      where.kelasId = req.guru.kelas_id;
    }

    if (req.query.q) {
      where.namaMurid = {
        contains: req.query.q.trim(),
        mode: 'insensitive'
      };
    }

    const listMurid = await prisma.murid.findMany({
      where,
      include: {
        kelas: {
          select: {
            id: true,
            namaKelas: true
          }
        }
      },
      orderBy: [
        { kelas: { namaKelas: 'asc' } },
        { noUrut: 'asc' }
      ]
    });

    const formatted = listMurid.map((m) => ({
      id: m.id,
      no_urut: m.noUrut,
      nama_murid: m.namaMurid,
      kelas_id: m.kelasId,
      nama_kelas: m.kelas ? m.kelas.namaKelas : null,
      created_at: m.createdAt
    }));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data murid: ' + error.message
    });
  }
});

// ==========================================
// 2. GET /api/murid/:id (Detail 1 Murid)
// ==========================================
router.get('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID murid tidak valid' });

    const murid = await prisma.murid.findUnique({
      where: { id },
      include: {
        kelas: true,
        _count: { select: { absensi: true } }
      }
    });

    if (!murid) {
      return res.status(404).json({ success: false, message: 'Murid tidak ditemukan' });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: murid.id,
        no_urut: murid.noUrut,
        nama_murid: murid.namaMurid,
        kelas_id: murid.kelasId,
        nama_kelas: murid.kelas ? murid.kelas.namaKelas : null,
        total_rekaman_absensi: murid._count.absensi,
        created_at: murid.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. POST /api/murid (Tambah 1 Murid)
// Admin & Wali Kelas (Wali kelas hanya untuk kelasnya)
// ==========================================
router.post('/', authFlexible, async (req, res) => {
  try {
    const { nama_murid, namaMurid, no_urut, noUrut, kelas_id, kelasId } = req.body;
    const namaTarget = (nama_murid || namaMurid || '').trim();
    let targetKelasId = (kelas_id !== undefined ? kelas_id : kelasId) ? parseId(kelas_id || kelasId) : null;
    let targetNoUrut = (no_urut !== undefined ? no_urut : noUrut) ? parseId(no_urut || noUrut) : null;

    if (!namaTarget) {
      return res.status(400).json({ success: false, message: 'Nama murid wajib diisi' });
    }

    // Otorisasi Wali Kelas vs Admin
    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      if (!req.guru.kelas_id) {
        return res.status(403).json({ success: false, message: 'Akun Anda belum terhubung ke kelas manapun' });
      }
      targetKelasId = req.guru.kelas_id; // Paksa ke kelas wali kelas
    } else if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Hanya Admin atau Wali Kelas yang dapat menambah murid' });
    }

    if (!targetKelasId) {
      return res.status(400).json({ success: false, message: 'Parameter kelas_id wajib diisi' });
    }

    const kelas = await prisma.kelas.findUnique({ where: { id: targetKelasId } });
    if (!kelas) {
      return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
    }

    // Jika nomor urut tidak diisi, otomatis buat no_urut terakhir + 1
    if (!targetNoUrut) {
      const lastMurid = await prisma.murid.findFirst({
        where: { kelasId: targetKelasId },
        orderBy: { noUrut: 'desc' }
      });
      targetNoUrut = lastMurid ? lastMurid.noUrut + 1 : 1;
    }

    const baru = await prisma.murid.create({
      data: {
        namaMurid: namaTarget,
        noUrut: targetNoUrut,
        kelasId: targetKelasId
      },
      include: {
        kelas: true
      }
    });

    return res.status(201).json({
      success: true,
      message: `Murid '${baru.namaMurid}' berhasil ditambahkan ke kelas ${baru.kelas.namaKelas}`,
      data: {
        id: baru.id,
        no_urut: baru.noUrut,
        nama_murid: baru.namaMurid,
        kelas_id: baru.kelasId,
        nama_kelas: baru.kelas.namaKelas
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. POST /api/murid/bulk (Import Banyak Murid Sekaligus)
// Format body:
// { kelas_id: 1, murid: [ { nama_murid: "A", no_urut: 1 }, "Budi Santoso", ... ] }
// ==========================================
router.post('/bulk', authFlexible, async (req, res) => {
  try {
    let targetKelasId = (req.body.kelas_id || req.body.kelasId) ? parseId(req.body.kelas_id || req.body.kelasId) : null;
    const rawList = req.body.murid || req.body.data || req.body;

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Data murid harus berupa array (misal: { kelas_id: 1, murid: [...] })'
      });
    }

    // Otorisasi
    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      targetKelasId = req.guru.kelas_id;
    } else if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    if (!targetKelasId) {
      return res.status(400).json({ success: false, message: 'Parameter kelas_id wajib diisi' });
    }

    const kelas = await prisma.kelas.findUnique({ where: { id: targetKelasId } });
    if (!kelas) {
      return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
    }

    // Cari no urut tertinggi yang ada di kelas ini
    const lastMurid = await prisma.murid.findFirst({
      where: { kelasId: targetKelasId },
      orderBy: { noUrut: 'desc' }
    });
    let currentNoUrut = lastMurid ? lastMurid.noUrut : 0;

    const createOperations = [];
    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      let nama = '';
      let no = null;

      if (typeof item === 'string') {
        nama = item.trim();
      } else if (item && typeof item === 'object') {
        nama = (item.nama_murid || item.namaMurid || item.nama || '').trim();
        no = (item.no_urut || item.noUrut) ? parseId(item.no_urut || item.noUrut) : null;
      }

      if (nama) {
        if (!no) {
          currentNoUrut += 1;
          no = currentNoUrut;
        } else {
          currentNoUrut = Math.max(currentNoUrut, no);
        }

        createOperations.push(
          prisma.murid.create({
            data: {
              namaMurid: nama,
              noUrut: no,
              kelasId: targetKelasId
            }
          })
        );
      }
    }

    if (createOperations.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data nama murid yang valid dalam list' });
    }

    const results = await prisma.$transaction(createOperations);

    return res.status(201).json({
      success: true,
      message: `${results.length} murid berhasil ditambahkan ke kelas ${kelas.namaKelas}`,
      count: results.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. PUT /api/murid/:id (Edit Data Murid)
// Wali Kelas hanya bisa mengedit murid di kelas miliknya
// ==========================================
router.put('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID murid tidak valid' });

    const existing = await prisma.murid.findUnique({
      where: { id },
      include: { kelas: true }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Murid tidak ditemukan' });
    }

    // Otorisasi: Jika Wali Kelas, hanya boleh edit jika murid berada di kelasnya
    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      if (existing.kelasId !== req.guru.kelas_id) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Anda hanya dapat mengedit murid di kelas Anda'
        });
      }
    } else if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    const { nama_murid, namaMurid, no_urut, noUrut, kelas_id, kelasId } = req.body;
    const updateData = {};

    if (nama_murid || namaMurid) updateData.namaMurid = (nama_murid || namaMurid).trim();
    if (no_urut !== undefined || noUrut !== undefined) {
      updateData.noUrut = parseId(no_urut !== undefined ? no_urut : noUrut);
    }

    // Hanya Admin yang boleh memindahkan kelas murid (misal: kenaikan kelas)
    if (req.isAdmin && (kelas_id !== undefined || kelasId !== undefined)) {
      const targetKelas = parseId(kelas_id !== undefined ? kelas_id : kelasId);
      if (targetKelas) {
        const k = await prisma.kelas.findUnique({ where: { id: targetKelas } });
        if (!k) return res.status(400).json({ success: false, message: 'Kelas tujuan tidak ditemukan' });
        updateData.kelasId = targetKelas;
      }
    }

    const updated = await prisma.murid.update({
      where: { id },
      data: updateData,
      include: { kelas: true }
    });

    return res.status(200).json({
      success: true,
      message: 'Data murid berhasil diperbarui',
      data: {
        id: updated.id,
        no_urut: updated.noUrut,
        nama_murid: updated.namaMurid,
        kelas_id: updated.kelasId,
        nama_kelas: updated.kelas.namaKelas
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. DELETE /api/murid/:id (Hapus Murid)
// ==========================================
router.delete('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID murid tidak valid' });

    const existing = await prisma.murid.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Murid tidak ditemukan' });
    }

    // Otorisasi: Jika Wali Kelas, hanya boleh hapus murid di kelasnya
    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      if (existing.kelasId !== req.guru.kelas_id) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Anda hanya dapat menghapus murid di kelas Anda'
        });
      }
    } else if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    await prisma.murid.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: `Murid '${existing.namaMurid}' berhasil dihapus`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

