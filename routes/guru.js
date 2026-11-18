const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

const VALID_GURU_ROLES = ['WALI_KELAS', 'GURU_MAPEL', 'PIKET'];

const parseId = (val) => {
  const p = parseInt(val, 10);
  return isNaN(p) ? null : p;
};

const parseIdArray = (raw) => {
  if (!Array.isArray(raw)) return null;
  const ids = raw
    .map((v) => parseId(v))
    .filter((v) => v !== null && v > 0);
  return [...new Set(ids)];
};

const formatGuruRow = (g) => {
  const kelasMapel = (g.kelasMapel || [])
    .map((km) => ({
      id: km.kelas.id,
      nama_kelas: km.kelas.namaKelas
    }))
    .sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas));

  return {
    id: g.id,
    username: g.username,
    nip: g.username, // backward compatibility
    nip_nikki: g.nipNikki || null,
    nama_guru: g.namaGuru,
    role: g.role,
    kelas_id: g.kelasId,
    nama_kelas: g.kelas ? g.kelas.namaKelas : null,
    kelas_mapel_ids: kelasMapel.map((k) => k.id),
    kelas_mapel: kelasMapel,
    created_at: g.createdAt
  };
};

// ==========================================
// 1. GET /api/guru (Daftar Guru)
// ==========================================
router.get('/', authFlexible, async (req, res) => {
  try {
    const listGuru = await prisma.guru.findMany({
      select: {
        id: true,
        username: true,
        nipNikki: true,
        namaGuru: true,
        role: true,
        kelasId: true,
        kelas: {
          select: {
            id: true,
            namaKelas: true
          }
        },
        kelasMapel: {
          include: {
            kelas: {
              select: {
                id: true,
                namaKelas: true
              }
            }
          }
        },
        createdAt: true
      },
      orderBy: [{ role: 'asc' }, { namaGuru: 'asc' }]
    });

    const formatted = listGuru.map(formatGuruRow);

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
        username: true,
        nipNikki: true,
        namaGuru: true,
        role: true,
        kelasId: true,
        kelas: {
          select: { id: true, namaKelas: true }
        },
        kelasMapel: {
          include: {
            kelas: { select: { id: true, namaKelas: true } }
          }
        },
        createdAt: true
      }
    });

    if (!guru) {
      return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
    }

    return res.status(200).json({
      success: true,
      data: formatGuruRow(guru)
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

    const {
      username,
      nip,
      nip_nikki,
      nipNikki,
      nama_guru,
      namaGuru,
      password,
      role,
      kelas_id,
      kelasId,
      kelas_mapel_ids,
      kelasMapelIds
    } = req.body;

    const usernameTarget = (username || nip || '').trim();
    const rawNipNikki = nip_nikki !== undefined ? nip_nikki : nipNikki;
    const nipNikkiTarget = rawNipNikki ? String(rawNipNikki).trim() : null;
    const namaTarget = (nama_guru || namaGuru || '').trim();
    const passTarget = (password || '').trim();
    const roleTarget = (role || 'WALI_KELAS').toUpperCase();
    const targetKelasId = (kelas_id !== undefined ? kelas_id : kelasId)
      ? parseId(kelas_id !== undefined ? kelas_id : kelasId)
      : null;
    const targetKelasMapelIds =
      parseIdArray(kelas_mapel_ids !== undefined ? kelas_mapel_ids : kelasMapelIds) || [];

    if (!usernameTarget || !namaTarget || !passTarget) {
      return res.status(400).json({
        success: false,
        message: 'Username, nama guru, dan password wajib diisi'
      });
    }

    if (!VALID_GURU_ROLES.includes(roleTarget)) {
      return res.status(400).json({
        success: false,
        message: "Role harus 'WALI_KELAS', 'GURU_MAPEL', atau 'PIKET'"
      });
    }

    const resolvedKelasId = roleTarget === 'WALI_KELAS' ? targetKelasId : null;

    // Cek apakah username sudah ada
    const existingUsername = await prisma.guru.findUnique({ where: { username: usernameTarget } });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: `Username '${usernameTarget}' sudah terdaftar`
      });
    }

    if (resolvedKelasId) {
      const existingKelas = await prisma.kelas.findUnique({ where: { id: resolvedKelasId } });
      if (!existingKelas) {
        return res.status(400).json({ success: false, message: 'Kelas yang dipilih tidak ditemukan' });
      }
    }

    if (roleTarget === 'GURU_MAPEL' && targetKelasMapelIds.length > 0) {
      const foundClasses = await prisma.kelas.findMany({
        where: { id: { in: targetKelasMapelIds } },
        select: { id: true }
      });
      if (foundClasses.length !== targetKelasMapelIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Sebagian kelas yang dipilih untuk Guru Mapel tidak ditemukan'
        });
      }
    }

    const hashedPassword = await bcrypt.hash(passTarget, 10);

    const baru = await prisma.guru.create({
      data: {
        username: usernameTarget,
        nipNikki: nipNikkiTarget || null,
        namaGuru: namaTarget,
        password: hashedPassword,
        role: roleTarget,
        kelasId: resolvedKelasId,
        ...(roleTarget === 'GURU_MAPEL' && targetKelasMapelIds.length > 0
          ? {
              kelasMapel: {
                create: targetKelasMapelIds.map((kid) => ({ kelasId: kid }))
              }
            }
          : {})
      },
      include: {
        kelas: true,
        kelasMapel: {
          include: {
            kelas: { select: { id: true, namaKelas: true } }
          }
        }
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Akun berhasil dibuat',
      data: formatGuruRow(baru)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. PUT /api/guru/:id (Edit Guru)
// Admin bisa edit apa saja. Guru bisa edit data diri / password / NIP-NIKKI sendiri.
// ==========================================
router.put('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID guru tidak valid' });

    const existing = await prisma.guru.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
    }

    // Otorisasi: Akun PIKET hanya boleh dikelola/edit oleh Admin.
    if (existing.role === 'PIKET' && !req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Akun Piket hanya dapat dikelola atau diubah oleh Admin'
      });
    }

    if (!req.isAdmin && (!req.isGuru || req.guru.id !== id)) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Anda tidak memiliki hak untuk mengubah data guru ini'
      });
    }

    const {
      username,
      nip,
      nip_nikki,
      nipNikki,
      nama_guru,
      namaGuru,
      password,
      role,
      kelas_id,
      kelasId,
      kelas_mapel_ids,
      kelasMapelIds
    } = req.body;
    const updateData = {};

    if (nama_guru || namaGuru) updateData.namaGuru = (nama_guru || namaGuru).trim();
    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password.trim(), 10);
    }
    if (nip_nikki !== undefined || nipNikki !== undefined) {
      const rawNikki = nip_nikki !== undefined ? nip_nikki : nipNikki;
      updateData.nipNikki = rawNikki ? String(rawNikki).trim() : null;
    }

    let nextKelasMapelIds = null;

    // Username, Role, Kelas_id, dan Kelas_mapel_ids hanya boleh diubah oleh Admin
    if (req.isAdmin) {
      const rawUsername = username !== undefined ? username : nip;
      if (rawUsername && String(rawUsername).trim()) {
        const usernameClean = String(rawUsername).trim();
        if (usernameClean !== existing.username) {
          const duplicate = await prisma.guru.findUnique({ where: { username: usernameClean } });
          if (duplicate) {
            return res.status(400).json({ success: false, message: 'Username sudah dipakai akun lain' });
          }
          updateData.username = usernameClean;
        }
      }

      if (role) {
        const roleClean = role.toUpperCase();
        if (!VALID_GURU_ROLES.includes(roleClean)) {
          return res.status(400).json({
            success: false,
            message: "Role harus 'WALI_KELAS', 'GURU_MAPEL', atau 'PIKET'"
          });
        }
        updateData.role = roleClean;
        if (roleClean !== 'WALI_KELAS') {
          updateData.kelasId = null;
        }
      }

      const nextRole = updateData.role || existing.role;
      if (nextRole === 'WALI_KELAS' && (kelas_id !== undefined || kelasId !== undefined)) {
        const rawKelasId = kelas_id !== undefined ? kelas_id : kelasId;
        updateData.kelasId = rawKelasId ? parseId(rawKelasId) : null;
      }

      if (nextRole !== 'GURU_MAPEL') {
        nextKelasMapelIds = [];
      } else if (kelas_mapel_ids !== undefined || kelasMapelIds !== undefined) {
        const parsedIds = parseIdArray(
          kelas_mapel_ids !== undefined ? kelas_mapel_ids : kelasMapelIds
        );
        if (parsedIds === null) {
          return res.status(400).json({
            success: false,
            message: 'Format kelas_mapel_ids harus berupa array ID kelas'
          });
        }
        if (parsedIds.length > 0) {
          const foundClasses = await prisma.kelas.findMany({
            where: { id: { in: parsedIds } },
            select: { id: true }
          });
          if (foundClasses.length !== parsedIds.length) {
            return res.status(400).json({
              success: false,
              message: 'Sebagian kelas yang dipilih untuk Guru Mapel tidak ditemukan'
            });
          }
        }
        nextKelasMapelIds = parsedIds;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (nextKelasMapelIds !== null) {
        await tx.guruKelas.deleteMany({ where: { guruId: id } });
        if (nextKelasMapelIds.length > 0) {
          await tx.guruKelas.createMany({
            data: nextKelasMapelIds.map((kid) => ({ guruId: id, kelasId: kid })),
            skipDuplicates: true
          });
        }
      }

      return tx.guru.update({
        where: { id },
        data: updateData,
        include: {
          kelas: true,
          kelasMapel: {
            include: {
              kelas: { select: { id: true, namaKelas: true } }
            }
          }
        }
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Data guru berhasil diperbarui',
      data: formatGuruRow(updated)
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
      message: `Akun '${existing.namaGuru}' (Username: ${existing.username}) berhasil dihapus`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
