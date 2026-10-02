const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cronManager = require('../services/cronManager');

const router = express.Router();
const prisma = new PrismaClient();

// Helper parse ID
const parseId = (val) => {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? null : parsed;
};

// Formatter untuk kompatibilitas camelCase & snake_case
const formatSchedule = (s) => ({
  id: s.id,
  name: s.name,
  days: s.days,
  time: s.time,
  audio_file: s.audioFile,
  audioFile: s.audioFile,
  is_active: s.isActive,
  isActive: s.isActive,
  created_at: s.createdAt,
  updated_at: s.updatedAt
});

// ==========================================
// 1. GET /api/schedules — Ambil semua jadwal bel
// ==========================================
router.get('/', async (req, res) => {
  try {
    const schedules = await prisma.schedule.findMany({
      orderBy: { time: 'asc' }
    });

    return res.status(200).json({
      success: true,
      count: schedules.length,
      data: schedules.map(formatSchedule)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil jadwal bel: ' + error.message
    });
  }
});

// ==========================================
// 2. POST /api/schedules — Tambah jadwal baru
// ==========================================
router.post('/', async (req, res) => {
  try {
    const { name, days, time } = req.body;
    const audioFile = req.body.audio_file || req.body.audioFile;
    const isActiveInput = req.body.is_active !== undefined ? req.body.is_active : req.body.isActive;

    // Validasi input
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Field name wajib diisi' });
    }
    if (!days || typeof days !== 'string' || !days.trim()) {
      return res.status(400).json({ success: false, message: 'Field days wajib diisi (contoh: "1,2,3,4,5")' });
    }
    if (!time || typeof time !== 'string' || !time.trim()) {
      return res.status(400).json({ success: false, message: 'Field time wajib diisi (format: "HH:MM")' });
    }
    if (!audioFile || typeof audioFile !== 'string' || !audioFile.trim()) {
      return res.status(400).json({ success: false, message: 'Field audio_file wajib diisi (contoh: "bel_masuk.mp3")' });
    }

    const newSchedule = await prisma.schedule.create({
      data: {
        name: name.trim(),
        days: days.trim(),
        time: time.trim(),
        audioFile: audioFile.trim(),
        isActive: isActiveInput !== undefined ? Boolean(isActiveInput) : true
      }
    });

    // Otomatis sinkronisasi ulang cron job tanpa restart server
    await cronManager.syncSchedules();

    return res.status(201).json({
      success: true,
      message: 'Jadwal bel berhasil ditambahkan',
      data: formatSchedule(newSchedule)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menambahkan jadwal bel: ' + error.message
    });
  }
});

// ==========================================
// 3. PUT /api/schedules/:id — Update jadwal bel
// ==========================================
router.put('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID jadwal tidak valid' });
    }

    const existing = await prisma.schedule.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Jadwal bel tidak ditemukan' });
    }

    const { name, days, time } = req.body;
    const audioFile = req.body.audio_file !== undefined ? req.body.audio_file : req.body.audioFile;
    const isActiveInput = req.body.is_active !== undefined ? req.body.is_active : req.body.isActive;

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (days !== undefined) updateData.days = days.trim();
    if (time !== undefined) updateData.time = time.trim();
    if (audioFile !== undefined) updateData.audioFile = audioFile.trim();
    if (isActiveInput !== undefined) updateData.isActive = Boolean(isActiveInput);

    const updated = await prisma.schedule.update({
      where: { id },
      data: updateData
    });

    // Otomatis sinkronisasi ulang cron job tanpa restart server
    await cronManager.syncSchedules();

    return res.status(200).json({
      success: true,
      message: 'Jadwal bel berhasil diperbarui',
      data: formatSchedule(updated)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui jadwal bel: ' + error.message
    });
  }
});

// ==========================================
// 4. DELETE /api/schedules/:id — Hapus jadwal bel
// ==========================================
router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID jadwal tidak valid' });
    }

    const existing = await prisma.schedule.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Jadwal bel tidak ditemukan' });
    }

    await prisma.schedule.delete({ where: { id } });

    // Otomatis sinkronisasi ulang cron job tanpa restart server
    await cronManager.syncSchedules();

    return res.status(200).json({
      success: true,
      message: 'Jadwal bel berhasil dihapus'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus jadwal bel: ' + error.message
    });
  }
});

module.exports = router;
