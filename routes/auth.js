const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/login', async (req, res) => {
  try {
    const { username, nip, password } = req.body;
    const identifier = (nip || username || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ message: 'NIP/Username dan password wajib diisi' });
    }

    // 1. Cek apakah ini Admin Web Profil
    const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
    const expectedPassword = process.env.ADMIN_PASSWORD || '$2b$10$8nSzjNUC6gPXXhh9Ojor9.NCjVXId1XimBGk4jMbZgc2qkQqktsg.';

    if (identifier === expectedUsername) {
      let isPasswordMatch = false;
      if (expectedPassword.startsWith('$2')) {
        isPasswordMatch = bcrypt.compareSync(password, expectedPassword);
      } else {
        isPasswordMatch = password === expectedPassword;
      }

      if (isPasswordMatch) {
        const secret = process.env.JWT_SECRET || 'sdn14ragunan_jwt_secret_key_super_secure_2026';
        const token = jwt.sign(
          { username: expectedUsername, role: 'admin' },
          secret,
          { expiresIn: '24h' }
        );

        return res.status(200).json({
          success: true,
          token,
          role: 'admin'
        });
      }
    }

    // 2. Jika bukan admin, cek apakah Guru di database
    const guru = await prisma.guru.findUnique({
      where: { nip: identifier },
      include: { kelas: true }
    });

    if (guru && bcrypt.compareSync(password, guru.password)) {
      const secret = process.env.JWT_SECRET || 'sdn14ragunan_jwt_secret_key_super_secure_2026';
      const token = jwt.sign(
        {
          id: guru.id,
          nip: guru.nip,
          nama_guru: guru.namaGuru,
          role: guru.role,
          kelas_id: guru.kelasId,
          nama_kelas: guru.kelas ? guru.kelas.namaKelas : null
        },
        secret,
        { expiresIn: '7d' }
      );

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
    }

    return res.status(401).json({ message: 'NIP/Username atau password salah' });
  } catch (error) {
    return res.status(500).json({ message: 'Terjadi kesalahan pada server: ' + error.message });
  }
});

module.exports = router;

