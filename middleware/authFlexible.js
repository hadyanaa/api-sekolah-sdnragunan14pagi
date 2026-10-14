const jwt = require('jsonwebtoken');

/**
 * Middleware autentikasi fleksibel:
 * Menerima token Admin (role: 'admin') maupun token Guru (WALI_KELAS / GURU_MAPEL).
 */
const authFlexible = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Akses ditolak: Token autentikasi tidak ditemukan'
    });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Akses ditolak: Format token tidak valid'
    });
  }

  const secret = process.env.JWT_SECRET || 'sdn14ragunan_jwt_secret_key_super_secure_2026';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak: Token tidak valid atau sudah kedaluwarsa'
      });
    }

    req.user = decoded;
    if (decoded.role === 'admin') {
      req.isAdmin = true;
      req.isGuru = false;
    } else {
      req.isAdmin = false;
      req.isGuru = true;
      req.guru = decoded;
    }

    next();
  });
};

module.exports = authFlexible;

