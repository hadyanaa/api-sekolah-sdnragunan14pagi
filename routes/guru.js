const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

const parseId = (val) => {
  const p = parseInt(val, 10);
  return isNaN(p) ? null : p;
};

// ==========================================
// 1. GET /api/guru (Daftar Guru)
// ==========================================
router.get('/', authFlexible, async (req, res) => {
  try {
    const listGuru = await prisma.guru.findMany({
      select: {
        id: true,
        nip: true,
        namaGuru: true,
        role: true,
        kelasId: true,
        kelas: {
          select: {
            id: true,
            namaKelas: true
          }
        },
        createdAt: true
      },
      orderBy: [{ role: 'asc' }, { namaGuru: 'asc' }]
    });

    const formatted = listGuru.map((g) => ({
      id: g.id,
      nip: g.nip,
      nama_guru: g.namaGuru,
      role: g.role,
      kelas_id: g.kelasId,
      nama_kelas: g.kelas ? g.kelas.namaKelas : null,
      created_at: g.createdAt
    }));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data guru: ' + error.message
    });
  }
});

// ==========================================
// 2. GET /api/guru/:id (Detail 1 Guru)
// ==========================================
router.get('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID guru tidak valid' });

    const guru = await prisma.guru.findUnique({
      where: { id },
      select: {
        id: true,
        nip: true,
        namaGuru: true,
        role: true,
        kelasId: true,
        kelas: {
          select: { id: true, namaKelas: true }
        },
        createdAt: true
      }
    });

    if (!guru) {
      return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: guru.id,
        nip: guru.nip,
        nama_guru: guru.namaGuru,
        role: guru.role,
        kelas_id: guru.kelasId,
        nama_kelas: guru.kelas ? guru.kelas.namaKelas : null,
        created_at: guru.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. POST /api/guru (Tambah Guru Baru - Hanya Admin)
// ==========================================
router.post('/', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat menambahkan akun Guru'
      });
    }

    const { nip, nama_guru, namaGuru, password, role, kelas_id, kelasId } = req.body;
    const nipTarget = (nip || '').trim();
    const namaTarget = (nama_guru || namaGuru || '').trim();
    const passTarget = (password || '').trim();
    const roleTarget = (role || 'WALI_KELAS').toUpperCase();
    const targetKelasId = (kelas_id !== undefined ? kelas_id : kelasId) ? parseId(kelas_id || kelasId) : null;

    if (!nipTarget || !namaTarget || !passTarget) {
      return res.status(400).json({
        success: false,
        message: 'NIP, nama guru, dan password wajib diisi'
      });
    }

    if (!['WALI_KELAS', 'GURU_MAPEL'].includes(roleTarget)) {
      return res.status(400).json({
        success: false,
        message: "Role harus 'WALI_KELAS' atau 'GURU_MAPEL'"
      });
    }

    // Cek apakah NIP sudah ada
    const existingNip = await prisma.guru.findUnique({ where: { nip: nipTarget } });
    if (existingNip) {
      return res.status(400).json({ success: false, message: `NIP '${nipTarget}' sudah terdaftar` });
    }

    // Jika kelas_id diberikan, pastikan kelas ada
    if (targetKelasId) {
      const existingKelas = await prisma.kelas.findUnique({ where: { id: targetKelasId } });
      if (!existingKelas) {
        return res.status(400).json({ success: false, message: 'Kelas yang dipilih tidak ditemukan' });
      }
    }

    const hashedPassword = await bcrypt.hash(passTarget, 10);

    const baru = await prisma.guru.create({
      data: {
        nip: nipTarget,
        namaGuru: namaTarget,
        password: hashedPassword,
        role: roleTarget,
        kelasId: targetKelasId
      },
      include: {
        kelas: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Akun guru berhasil dibuat',
      data: {
        id: baru.id,
        nip: baru.nip,
        nama_guru: baru.namaGuru,
        role: baru.role,
        kelas_id: baru.kelasId,
        nama_kelas: baru.kelas ? baru.kelas.namaKelas : null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. PUT /api/guru/:id (Edit Guru)
// Admin bisa edit apa saja. Guru bisa edit data diri / password sendiri.
// ==========================================
router.put('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID guru tidak valid' });

    const existing = await prisma.guru.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
    }

    // Otorisasi: Admin atau Guru pemilik akun itu sendiri
    if (!req.isAdmin && (!req.isGuru || req.guru.id !== id)) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Anda tidak memiliki hak untuk mengubah data guru ini'
      });
    }

    const { nip, nama_guru, namaGuru, password, role, kelas_id, kelasId } = req.body;
    const updateData = {};

    if (nama_guru || namaGuru) updateData.namaGuru = (nama_guru || namaGuru).trim();
    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password.trim(), 10);
    }

    // Role, NIP, dan Kelas_id hanya boleh diubah oleh Admin
    if (req.isAdmin) {
      if (nip) {
        const nipClean = nip.trim();
        if (nipClean !== existing.nip) {
          const duplicate = await prisma.guru.findUnique({ where: { nip: nipClean } });
          if (duplicate) return res.status(400).json({ success: false, message: 'NIP sudah dipakai guru lain' });
          updateData.nip = nipClean;
        }
      }

      if (role) {
        const roleClean = role.toUpperCase();
        if (!['WALI_KELAS', 'GURU_MAPEL'].includes(roleClean)) {
          return res.status(400).json({ success: false, message: "Role harus 'WALI_KELAS' atau 'GURU_MAPEL'" });
        }
        updateData.role = roleClean;
      }

      if (kelas_id !== undefined || kelasId !== undefined) {
        const rawKelasId = kelas_id !== undefined ? kelas_id : kelasId;
        updateData.kelasId = rawKelasId ? parseId(rawKelasId) : null;
      }
    }

    const updated = await prisma.guru.update({
      where: { id },
      data: updateData,
      include: { kelas: true }
    });

    return res.status(200).json({
      success: true,
      message: 'Data guru berhasil diperbarui',
      data: {
        id: updated.id,
        nip: updated.nip,
        nama_guru: updated.namaGuru,
        role: updated.role,
        kelas_id: updated.kelasId,
        nama_kelas: updated.kelas ? updated.kelas.namaKelas : null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. DELETE /api/guru/:id (Hapus Guru - Hanya Admin)
// ==========================================
router.delete('/:id', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat menghapus akun Guru'
      });
    }

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID guru tidak valid' });

    const existing = await prisma.guru.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
    }

    await prisma.guru.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: `Akun guru '${existing.namaGuru}' (NIP: ${existing.nip}) berhasil dihapus`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

