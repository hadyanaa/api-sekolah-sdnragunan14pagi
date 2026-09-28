const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username dan password wajib diisi' });
    }

    const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
    const expectedPassword = process.env.ADMIN_PASSWORD || '$2b$10$8nSzjNUC6gPXXhh9Ojor9.NCjVXId1XimBGk4jMbZgc2qkQqktsg.';

    const isUsernameMatch = username === expectedUsername;
    let isPasswordMatch = false;

    if (isUsernameMatch) {
      if (expectedPassword.startsWith('$2')) {
        isPasswordMatch = bcrypt.compareSync(password, expectedPassword);
      } else {
        isPasswordMatch = password === expectedPassword;
      }
    }

    if (!isUsernameMatch || !isPasswordMatch) {
      return res.status(401).json({ message: 'Username atau password salah' });
    }

    const secret = process.env.JWT_SECRET || 'sdn14ragunan_jwt_secret_key_super_secure_2026';
    const token = jwt.sign(
      { username: expectedUsername, role: 'admin' },
      secret,
      { expiresIn: '24h' }
    );

    return res.status(200).json({ token });
  } catch (error) {
    return res.status(500).json({ message: 'Terjadi kesalahan pada server: ' + error.message });
  }
});

module.exports = router;
