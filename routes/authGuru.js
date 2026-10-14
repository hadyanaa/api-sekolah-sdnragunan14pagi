const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const authGuruMiddleware = require('../middleware/authGuru');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/auth/login
// Menerima NIP dan password. Kembalikan JWT token beserta data guru dan nama_kelas miliknya.
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

    // Cari guru berdasarkan NIP
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

    const secret = process.env.JWT_SECRET || 'sdn14ragunan_jwt_secret_key_super_secure_2026';
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

// GET /api/auth/me (Cek sesi profil guru saat ini)
router.get('/me', authGuruMiddleware, async (req, res) => {
  try {
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

