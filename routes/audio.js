const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cronManager = require('../services/cronManager');

const router = express.Router();

// Direktori penyimpanan file audio
const AUDIO_DIR = path.resolve(__dirname, '../public/audio');

// Pastikan direktori ada
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// Konfigurasi Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AUDIO_DIR);
  },
  filename: (req, file, cb) => {
    // Bersihkan nama file agar aman dari spasi atau karakter khusus
    const originalExt = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, originalExt).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${baseName}${originalExt.toLowerCase()}`);
  }
});

// Filter hanya file .mp3
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.mp3' || file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3') {
    cb(null, true);
  } else {
    cb(new Error('Hanya file audio berekstensi .mp3 yang diizinkan!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // Maksimal 25MB
});

// ==========================================
// 1. POST /api/upload — Upload file audio MP3
// ==========================================
router.post('/upload', (req, res) => {
  upload.single('audio')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Tidak ada file audio yang diunggah. Gunakan field "audio".' });
    }

    return res.status(201).json({
      success: true,
      message: 'File audio MP3 berhasil diunggah',
      file: {
        filename: req.file.filename,
        original_name: req.file.originalname,
        size: req.file.size,
        path: `/public/audio/${req.file.filename}`
      }
    });
  });
});

// ==========================================
// 2. GET /api/audio — Ambil daftar file MP3 di folder /public/audio
// ==========================================
router.get('/audio', (req, res) => {
  try {
    if (!fs.existsSync(AUDIO_DIR)) {
      return res.status(200).json({ success: true, count: 0, files: [] });
    }

    const dirFiles = fs.readdirSync(AUDIO_DIR);
    const mp3Files = dirFiles
      .filter(file => file.toLowerCase().endsWith('.mp3'))
      .map(filename => {
        const filePath = path.join(AUDIO_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size_bytes: stats.size,
          size_formatted: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
          url: `/public/audio/${filename}`,
          created_at: stats.birthtime,
          modified_at: stats.mtime
        };
      });

    return res.status(200).json({
      success: true,
      count: mp3Files.length,
      files: mp3Files
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal membaca direktori audio: ' + error.message
    });
  }
});

// ==========================================
// 3. POST /api/audio/play/:filename — Test putar audio manual
// ==========================================
router.post('/audio/play/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const audioPath = path.join(AUDIO_DIR, filename);

    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ success: false, message: 'Berkas audio tidak ditemukan di server' });
    }

    cronManager.playAudioFile(audioPath, `Manual Test: ${filename}`);

    return res.status(200).json({
      success: true,
      message: `Memutar audio ${filename} pada perangkat audio server`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal memutar audio: ' + error.message
    });
  }
});

module.exports = router;
