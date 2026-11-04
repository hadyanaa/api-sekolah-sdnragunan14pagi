const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/auth/login
// Menerima NIP/Username dan password. Mendukung login Admin maupun Guru.
router.post('/login', async (req, res) => {
  try {
    const { nip, username, password } = req.body;
    const nipTarget = (nip || username || '').trim();

    if (!nipTarget || !password) {
      return res.status(400).json({
        success: false,
        message: 'NIP dan password wajib diisi'
      });
    }

    const secret = process.env.JWT_SECRET || 'sdn14ragunan_jwt_secret_key_super_secure_2026';

    // 1. Cek apakah login sebagai Admin
    const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
    const expectedPassword = process.env.ADMIN_PASSWORD || '$2b$10$8nSzjNUC6gPXXhh9Ojor9.NCjVXId1XimBGk4jMbZgc2qkQqktsg.';

    if (nipTarget === expectedUsername) {
      const isAdminMatch = expectedPassword.startsWith('$2')
        ? bcrypt.compareSync(password, expectedPassword)
        : password === expectedPassword;

      if (isAdminMatch) {
        const adminProfile = {
          id: 0,
          nip: expectedUsername,
          nama_guru: 'Administrator Sekolah',
          role: 'ADMIN',
          kelas_id: null,
          nama_kelas: null
        };
        const token = jwt.sign(
          { username: expectedUsername, ...adminProfile },
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

    // 2. Cari guru berdasarkan NIP
    const guru = await prisma.guru.findUnique({
      where: { nip: nipTarget },
      include: {
        kelas: true
      }
    });

    if (!guru) {
      return res.status(401).json({
        success: false,
        message: 'NIP atau password salah'
      });
    }

    // Cek password hash
    const isPasswordValid = bcrypt.compareSync(password, guru.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'NIP atau password salah'
      });
    }

    const payload = {
      id: guru.id,
      nip: guru.nip,
      nama_guru: guru.namaGuru,
      role: guru.role,
      kelas_id: guru.kelasId,
      nama_kelas: guru.kelas ? guru.kelas.namaKelas : null
    };

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
          nip: req.user.username || req.user.nip || 'admin',
          nama_guru: 'Administrator Sekolah',
          role: 'ADMIN',
          kelas_id: null,
          nama_kelas: null
        }
      });
    }

    const guru = await prisma.guru.findUnique({
      where: { id: req.guru.id },
      include: { kelas: true }
    });

    if (!guru) {
      return res.status(404).json({
        success: false,
        message: 'Data guru tidak ditemukan'
      });
    }

    return res.status(200).json({
      success: true,
      guru: {
        id: guru.id,
        nip: guru.nip,
        nama_guru: guru.namaGuru,
        role: guru.role,
        kelas_id: guru.kelasId,
        nama_kelas: guru.kelas ? guru.kelas.namaKelas : null
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server: ' + error.message
    });
  }
});

module.exports = router;

