const jwt = require('jsonwebtoken');

const authGuruMiddleware = (req, res, next) => {
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

    // Pastikan token adalah token Guru
    if (!decoded.nip || !decoded.role) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Token ini bukan untuk akses Guru'
      });
    }

    req.guru = decoded;
    req.user = decoded;
    next();
  });
};

module.exports = authGuruMiddleware;

