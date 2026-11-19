const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

const UPLOAD_DIR = path.resolve(__dirname, '../uploads/tindak-lanjut');
const VALID_JENIS = ['KARTU_REFLEKSI', 'PEMANGGILAN_ORTU', 'HOME_VISIT'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const ensureUploadDir = () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
};

const parseId = (val) => {
  const p = parseInt(val, 10);
  return isNaN(p) ? null : p;
};

const parseDateOnlyUTC = (str) => {
  if (!str) return null;
  const isoStr = String(str).trim().split('T')[0];
  const parts = isoStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const dateObj = new Date(Date.UTC(y, m, d));
  return isNaN(dateObj.getTime()) ? null : dateObj;
};

const removeFileQuietly = (storedFilename) => {
  if (!storedFilename) return;
  try {
    const safeName = path.basename(storedFilename);
    const fullPath = path.join(UPLOAD_DIR, safeName);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch {
    // Abaikan error saat bersih-bersih file yatim
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const token = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}_${token}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_EXTS.includes(ext) && ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error('Format file tidak didukung. Gunakan gambar (JPG, PNG, WEBP) atau PDF.'),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // Maksimal 5 MB
});

const runMulterOptional = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Ukuran file terlalu besar. Maksimal 5 MB per file.'
        });
      }
      return res.status(400).json({ success: false, message: `Upload gagal: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return next();
  });
};

async function checkViewPermission(req, muridKelasId) {
  if (req.isAdmin) return { ok: true };
  if (!req.isGuru || !req.guru) {
    return { ok: false, status: 403, message: 'Akses ditolak' };
  }
  if (req.guru.role === 'PIKET') {
    return {
      ok: false,
      status: 403,
      message: 'Akses ditolak: Akun Piket tidak memiliki akses melihat Tindak Lanjut siswa'
    };
  }
  if (req.guru.role === 'WALI_KELAS') {
    if (muridKelasId !== req.guru.kelas_id) {
      return {
        ok: false,
        status: 403,
        message: 'Akses ditolak: Anda hanya dapat melihat tindak lanjut murid di kelas Anda'
      };
    }
    return { ok: true };
  }
  if (req.guru.role === 'GURU_MAPEL') {
    const assigned = await prisma.guruKelas.findMany({
      where: { guruId: req.guru.id },
      select: { kelasId: true }
    });
    const assignedIds = assigned.map((a) => a.kelasId);
    if (assignedIds.length > 0 && !assignedIds.includes(muridKelasId)) {
      return {
        ok: false,
        status: 403,
        message: 'Akses ditolak: Anda hanya dapat melihat murid di kelas yang Anda ampu'
      };
    }
    return { ok: true };
  }
  return { ok: false, status: 403, message: 'Akses ditolak' };
}

function checkUploadPermission(req, muridKelasId) {
  if (req.isAdmin) return { ok: true };
  if (req.isGuru && req.guru && req.guru.role === 'WALI_KELAS') {
    if (muridKelasId !== req.guru.kelas_id) {
      return {
        ok: false,
        status: 403,
        message: 'Akses ditolak: Anda hanya dapat menambah tindak lanjut untuk murid di kelas Anda'
      };
    }
    return { ok: true };
  }
  return {
    ok: false,
    status: 403,
    message: 'Akses ditolak: Hanya Admin atau Wali Kelas kelas tersebut yang dapat mengunggah tindak lanjut'
  };
}

const formatRecord = (r) => ({
  id: r.id,
  murid_id: r.muridId,
  jenis: r.jenis,
  tanggal: r.tanggal ? new Date(r.tanggal).toISOString().split('T')[0] : null,
  catatan: r.catatan || null,
  has_file: Boolean(r.filePath),
  file_name: r.fileName || null,
  mime_type: r.mimeType || null,
  file_size: r.fileSize || null,
  dibuat_oleh_nama: r.dibuatOlehNama || null,
  created_at: r.createdAt
});

// ==========================================
// 1. GET /api/murid/:id/tindak-lanjut
// Akses: Admin, Wali Kelas kelasnya, Guru Mapel (view only). Piket -> 403.
// ==========================================
router.get('/:id/tindak-lanjut', authFlexible, async (req, res) => {
  try {
    const muridId = parseId(req.params.id);
    if (!muridId) return res.status(400).json({ success: false, message: 'ID murid tidak valid' });

    const murid = await prisma.murid.findUnique({ where: { id: muridId } });
    if (!murid) {
      return res.status(404).json({ success: false, message: 'Murid tidak ditemukan' });
    }

    const perm = await checkViewPermission(req, murid.kelasId);
    if (!perm.ok) {
      return res.status(perm.status).json({ success: false, message: perm.message });
    }

    const records = await prisma.tindakLanjutMurid.findMany({
      where: { muridId },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }]
    });

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records.map(formatRecord)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal memuat riwayat tindak lanjut: ' + error.message
    });
  }
});

// Middleware pre-check upload sebelum multer menulis file ke disk
const verifyCreateUploadPermission = async (req, res, next) => {
  try {
    const muridId = parseId(req.params.id);
    if (!muridId) return res.status(400).json({ success: false, message: 'ID murid tidak valid' });

    const murid = await prisma.murid.findUnique({ where: { id: muridId } });
    if (!murid) {
      return res.status(404).json({ success: false, message: 'Murid tidak ditemukan' });
    }

    const perm = checkUploadPermission(req, murid.kelasId);
    if (!perm.ok) {
      return res.status(perm.status).json({ success: false, message: perm.message });
    }

    req.targetMurid = murid;
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. POST /api/murid/:id/tindak-lanjut
// Akses: Admin & Wali Kelas kelas tersebut. Upload file bersifat opsional.
// ==========================================
router.post(
  '/:id/tindak-lanjut',
  authFlexible,
  verifyCreateUploadPermission,
  runMulterOptional,
  async (req, res) => {
    try {
      const jenisRaw = String(req.body.jenis || '').trim().toUpperCase();
      if (!VALID_JENIS.includes(jenisRaw)) {
        if (req.file) removeFileQuietly(req.file.filename);
        return res.status(400).json({
          success: false,
          message: 'Jenis tindak lanjut tidak valid. Pilihan: KARTU_REFLEKSI, PEMANGGILAN_ORTU, HOME_VISIT'
        });
      }

      const parsedTanggal = parseDateOnlyUTC(req.body.tanggal);
      if (!parsedTanggal) {
        if (req.file) removeFileQuietly(req.file.filename);
        return res.status(400).json({
          success: false,
          message: 'Tanggal kegiatan wajib diisi dengan format YYYY-MM-DD'
        });
      }

      const catatanClean = req.body.catatan ? String(req.body.catatan).trim() : null;
      const authorId = req.isAdmin ? 0 : req.guru?.id || null;
      const authorName = req.isAdmin
        ? 'Administrator Sekolah'
        : req.guru?.nama_guru || 'Wali Kelas';

      const created = await prisma.tindakLanjutMurid.create({
        data: {
          muridId: req.targetMurid.id,
          jenis: jenisRaw,
          tanggal: parsedTanggal,
          catatan: catatanClean || null,
          fileName: req.file ? req.file.originalname : null,
          filePath: req.file ? req.file.filename : null,
          mimeType: req.file ? req.file.mimetype : null,
          fileSize: req.file ? req.file.size : null,
          dibuatOlehId: authorId,
          dibuatOlehNama: authorName
        }
      });

      return res.status(201).json({
        success: true,
        message: 'Catatan tindak lanjut berhasil disimpan',
        data: formatRecord(created)
      });
    } catch (error) {
      if (req.file) removeFileQuietly(req.file.filename);
      return res.status(500).json({
        success: false,
        message: 'Gagal menyimpan catatan tindak lanjut: ' + error.message
      });
    }
  }
);

// Middleware pre-check upload lampiran susulan
const verifyAttachPermission = async (req, res, next) => {
  try {
    const recordId = parseId(req.params.recordId);
    if (!recordId) return res.status(400).json({ success: false, message: 'ID catatan tidak valid' });

    const existing = await prisma.tindakLanjutMurid.findUnique({
      where: { id: recordId },
      include: { murid: { select: { kelasId: true } } }
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Catatan tindak lanjut tidak ditemukan' });
    }

    const perm = checkUploadPermission(req, existing.murid.kelasId);
    if (!perm.ok) {
      return res.status(perm.status).json({ success: false, message: perm.message });
    }

    req.existingRecord = existing;
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 3. POST /api/murid/tindak-lanjut/:recordId/lampiran
// Unggah file susulan pada catatan yang belum punya lampiran.
// ==========================================
router.post(
  '/tindak-lanjut/:recordId/lampiran',
  authFlexible,
  verifyAttachPermission,
  runMulterOptional,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Pilih file gambar (JPG/PNG/WEBP) atau PDF untuk diunggah'
        });
      }

      const oldFilePath = req.existingRecord.filePath;
      const updated = await prisma.tindakLanjutMurid.update({
        where: { id: req.existingRecord.id },
        data: {
          fileName: req.file.originalname,
          filePath: req.file.filename,
          mimeType: req.file.mimetype,
          fileSize: req.file.size
        }
      });

      if (oldFilePath && oldFilePath !== req.file.filename) {
        removeFileQuietly(oldFilePath);
      }

      return res.status(200).json({
        success: true,
        message: 'Lampiran file berhasil diunggah',
        data: formatRecord(updated)
      });
    } catch (error) {
      if (req.file) removeFileQuietly(req.file.filename);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengunggah lampiran: ' + error.message
      });
    }
  }
);

// ==========================================
// 4. GET /api/murid/tindak-lanjut/:recordId/file
// Unduh / preview file lampiran secara aman (terproteksi JWT).
// ==========================================
router.get('/tindak-lanjut/:recordId/file', authFlexible, async (req, res) => {
  try {
    const recordId = parseId(req.params.recordId);
    if (!recordId) return res.status(400).json({ success: false, message: 'ID catatan tidak valid' });

    const existing = await prisma.tindakLanjutMurid.findUnique({
      where: { id: recordId },
      include: { murid: { select: { kelasId: true } } }
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Catatan tindak lanjut tidak ditemukan' });
    }

    const perm = await checkViewPermission(req, existing.murid.kelasId);
    if (!perm.ok) {
      return res.status(perm.status).json({ success: false, message: perm.message });
    }

    if (!existing.filePath) {
      return res.status(404).json({ success: false, message: 'Catatan ini belum memiliki lampiran file' });
    }

    const safeName = path.basename(existing.filePath);
    const fullPath = path.join(UPLOAD_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Berkas fisik tidak ditemukan di server' });
    }

    if (existing.mimeType) {
      res.setHeader('Content-Type', existing.mimeType);
    }
    const displayFileName = (existing.fileName || safeName).replace(/["\r\n]/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${displayFileName}"`);
    return res.sendFile(fullPath);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. DELETE /api/murid/tindak-lanjut/:recordId (Hanya Admin)
// ==========================================
router.delete('/tindak-lanjut/:recordId', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat menghapus catatan tindak lanjut'
      });
    }

    const recordId = parseId(req.params.recordId);
    if (!recordId) return res.status(400).json({ success: false, message: 'ID catatan tidak valid' });

    const existing = await prisma.tindakLanjutMurid.findUnique({ where: { id: recordId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Catatan tindak lanjut tidak ditemukan' });
    }

    await prisma.tindakLanjutMurid.delete({ where: { id: recordId } });
    if (existing.filePath) {
      removeFileQuietly(existing.filePath);
    }

    return res.status(200).json({
      success: true,
      message: 'Catatan tindak lanjut berhasil dihapus'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus catatan tindak lanjut: ' + error.message
    });
  }
});

module.exports = router;
