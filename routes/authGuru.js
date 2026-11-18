const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

const formatGuruAuthProfile = (guru) => {
  const kelasMapel = (guru.kelasMapel || [])
    .map((km) => ({
      id: km.kelas.id,
      nama_kelas: km.kelas.namaKelas
    }))
    .sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas));

  return {
    id: guru.id,
    username: guru.username,
    nip: guru.username, // backward compatibility
    nip_nikki: guru.nipNikki || null,
    nama_guru: guru.namaGuru,
    role: guru.role,
    kelas_id: guru.kelasId,
    nama_kelas: guru.kelas ? guru.kelas.namaKelas : null,
    kelas_mapel_ids: kelasMapel.map((k) => k.id),
    kelas_mapel: kelasMapel
  };
};

// POST /api/auth/login
// Menerima Username (atau NIP) dan password. Mendukung login Admin, Guru, maupun Piket.
router.post('/login', async (req, res) => {
  try {
    const { nip, username, password } = req.body;
    const loginId = (username || nip || '').trim();

    if (!loginId || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan password wajib diisi'
      });
    }

    const secret = process.env.JWT_SECRET || 'sdn14ragunan_jwt_secret_key_super_secure_2026';

    // 1. Cek apakah login sebagai Admin
    const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
    const expectedPassword = process.env.ADMIN_PASSWORD || '$2b$10$8nSzjNUC6gPXXhh9Ojor9.NCjVXId1XimBGk4jMbZgc2qkQqktsg.';

    if (loginId === expectedUsername) {
      const isAdminMatch = expectedPassword.startsWith('$2')
        ? bcrypt.compareSync(password, expectedPassword)
        : password === expectedPassword;

      if (isAdminMatch) {
        const adminProfile = {
          id: 0,
          username: expectedUsername,
          nip: expectedUsername,
          nip_nikki: null,
          nama_guru: 'Administrator Sekolah',
          role: 'ADMIN',
          kelas_id: null,
          nama_kelas: null,
          kelas_mapel_ids: [],
          kelas_mapel: []
        };
        const token = jwt.sign(
          { ...adminProfile },
          secret,
          { expiresIn: '24h' }
        );
        return res.status(200).json({
          success: true,
          message: 'Login Admin berhasil',
          token,
          role: 'ADMIN',
          guru: adminProfile
        });
      }
    }

    // 2. Cari guru/piket berdasarkan username
    const guru = await prisma.guru.findUnique({
      where: { username: loginId },
      include: {
        kelas: true,
        kelasMapel: {
          include: {
            kelas: { select: { id: true, namaKelas: true } }
          }
        }
      }
    });

    if (!guru) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      });
    }

    // Cek password hash
    const isPasswordValid = bcrypt.compareSync(password, guru.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      });
    }

    // Tolak login bila akun guru berstatus non-aktif (Mutasi Keluar / Pensiun)
    if (guru.status && guru.status !== 'AKTIF') {
      return res.status(403).json({
        success: false,
        message: `Akun Anda berstatus ${guru.status === 'PENSIUN' ? 'Pensiun' : 'Mutasi Keluar'} dan sudah tidak dapat digunakan untuk login`
      });
    }

    const payload = formatGuruAuthProfile(guru);
    const token = jwt.sign(payload, secret, { expiresIn: '7d' });

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      token,
      guru: payload
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server: ' + error.message
    });
  }
});

// GET /api/auth/me (Cek sesi profil guru/admin saat ini)
router.get('/me', authFlexible, async (req, res) => {
  try {
    if (req.isAdmin) {
      return res.status(200).json({
        success: true,
        guru: {
          id: 0,
          username: req.user.username || req.user.nip || 'admin',
          nip: req.user.username || req.user.nip || 'admin',
          nip_nikki: null,
          nama_guru: 'Administrator Sekolah',
          role: 'ADMIN',
          kelas_id: null,
          nama_kelas: null,
          kelas_mapel_ids: [],
          kelas_mapel: []
        }
      });
    }

    const guru = await prisma.guru.findUnique({
      where: { id: req.guru.id },
      include: {
        kelas: true,
        kelasMapel: {
          include: {
            kelas: { select: { id: true, namaKelas: true } }
          }
        }
      }
    });

    if (!guru) {
      return res.status(404).json({
        success: false,
        message: 'Data guru tidak ditemukan'
      });
    }

    if (guru.status && guru.status !== 'AKTIF') {
      return res.status(403).json({
        success: false,
        message: `Akun Anda berstatus ${guru.status === 'PENSIUN' ? 'Pensiun' : 'Mutasi Keluar'}`
      });
    }

    return res.status(200).json({
      success: true,
      guru: formatGuruAuthProfile(guru)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server: ' + error.message
    });
  }
});

module.exports = router;

