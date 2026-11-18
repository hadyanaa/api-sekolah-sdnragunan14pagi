const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

// Helper parse ID integer
const parseId = (val) => {
  const p = parseInt(val, 10);
  return isNaN(p) ? null : p;
};

// ==========================================
// 1. GET /api/kelas (Semua Kelas)
// ==========================================
router.get('/', async (req, res) => {
  try {
    const listKelas = await prisma.kelas.findMany({
      include: {
        guru: {
          where: { status: 'AKTIF' },
          select: {
            id: true,
            namaGuru: true,
            username: true,
            nipNikki: true,
            role: true
          }
        },
        guruMapel: {
          where: { guru: { status: 'AKTIF' } },
          include: {
            guru: {
              select: {
                id: true,
                namaGuru: true,
                username: true,
                nipNikki: true
              }
            }
          }
        },
        _count: {
          select: {
            murid: { where: { status: 'AKTIF' } }
          }
        }
      },
      orderBy: { namaKelas: 'asc' }
    });

    const formatted = listKelas.map((k) => {
      const wali = k.guru.find((g) => g.role === 'WALI_KELAS');
      const mapelList = (k.guruMapel || [])
        .map((gm) => ({
          id: gm.guru.id,
          nama_guru: gm.guru.namaGuru,
          username: gm.guru.username,
          nip_nikki: gm.guru.nipNikki || null
        }))
        .sort((a, b) => a.nama_guru.localeCompare(b.nama_guru));

      return {
        id: k.id,
        nama_kelas: k.namaKelas,
        jumlah_murid: k._count.murid,
        wali_kelas: wali
          ? {
              id: wali.id,
              nama_guru: wali.namaGuru,
              username: wali.username,
              nip_nikki: wali.nipNikki || null
            }
          : null,
        guru_mapel: mapelList
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data kelas: ' + error.message
    });
  }
});

// ==========================================
// 2. GET /api/kelas/:id (Detail 1 Kelas)
// ==========================================
router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID kelas tidak valid' });

    const kelas = await prisma.kelas.findUnique({
      where: { id },
      include: {
        guru: {
          select: { id: true, namaGuru: true, username: true, nipNikki: true, role: true }
        },
        guruMapel: {
          include: {
            guru: {
              select: { id: true, namaGuru: true, username: true, nipNikki: true }
            }
          }
        },
        murid: {
          where: { status: 'AKTIF' },
          orderBy: { noUrut: 'asc' }
        }
      }
    });

    if (!kelas) {
      return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: kelas.id,
        nama_kelas: kelas.namaKelas,
        wali_kelas: kelas.guru.find((g) => g.role === 'WALI_KELAS') || null,
        guru_mapel: (kelas.guruMapel || []).map((gm) => ({
          id: gm.guru.id,
          nama_guru: gm.guru.namaGuru,
          username: gm.guru.username,
          nip_nikki: gm.guru.nipNikki || null
        })),
        total_murid: kelas.murid.length,
        murid: kelas.murid.map((m) => ({
          id: m.id,
          no_urut: m.noUrut,
          nama_murid: m.namaMurid
        }))
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. POST /api/kelas (Tambah Kelas - Hanya Admin)
// ==========================================
router.post('/', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat menambah kelas'
      });
    }

    const { nama_kelas, namaKelas } = req.body;
    const namaTarget = (nama_kelas || namaKelas || '').trim();

    if (!namaTarget) {
      return res.status(400).json({ success: false, message: 'Nama kelas wajib diisi (misal: "1A")' });
    }

    const existing = await prisma.kelas.findUnique({ where: { namaKelas: namaTarget } });
    if (existing) {
      return res.status(400).json({ success: false, message: `Kelas '${namaTarget}' sudah ada` });
    }

    const baru = await prisma.kelas.create({
      data: { namaKelas: namaTarget }
    });

    return res.status(201).json({
      success: true,
      message: `Kelas '${baru.namaKelas}' berhasil ditambahkan`,
      data: { id: baru.id, nama_kelas: baru.namaKelas }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. PUT /api/kelas/:id (Edit Kelas - Hanya Admin)
// ==========================================
router.put('/:id', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat mengubah data kelas'
      });
    }

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID kelas tidak valid' });

    const { nama_kelas, namaKelas } = req.body;
    const namaTarget = (nama_kelas || namaKelas || '').trim();

    if (!namaTarget) {
      return res.status(400).json({ success: false, message: 'Nama kelas wajib diisi' });
    }

    const existing = await prisma.kelas.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
    }

    const updated = await prisma.kelas.update({
      where: { id },
      data: { namaKelas: namaTarget }
    });

    return res.status(200).json({
      success: true,
      message: 'Nama kelas berhasil diperbarui',
      data: { id: updated.id, nama_kelas: updated.namaKelas }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. DELETE /api/kelas/:id (Hapus Kelas - Hanya Admin)
// ==========================================
router.delete('/:id', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat menghapus kelas'
      });
    }

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID kelas tidak valid' });

    const existing = await prisma.kelas.findUnique({
      where: { id },
      include: { _count: { select: { murid: true } } }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
    }

    if (existing._count.murid > 0 && req.query.force !== 'true') {
      return res.status(400).json({
        success: false,
        message: `Kelas ini masih memiliki ${existing._count.murid} murid. Hapus atau pindahkan murid terlebih dahulu, atau sertakan ?force=true untuk menghapus beserta muridnya.`
      });
    }

    await prisma.kelas.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: `Kelas '${existing.namaKelas}' berhasil dihapus`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

