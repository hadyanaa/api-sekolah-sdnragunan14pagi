const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authGuruMiddleware = require('../middleware/authGuru');

const router = express.Router();
const prisma = new PrismaClient();

// Helper parsing tanggal ke UTC Midnight (menghindari selisih jam timezone)
const parseDateOnlyUTC = (str) => {
  if (!str) return null;
  const isoStr = typeof str === 'string' ? str.split('T')[0] : new Date(str).toISOString().split('T')[0];
  const parts = isoStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(Date.UTC(y, m, d));
};

// ==========================================
// 1. GET /api/absensi
// Endpoint diproteksi JWT.
// Otomatis deteksi kelas_id dari token guru (atau query param jika Guru Mapel).
// Parameter: ?bulan=10&tahun=2026 (&kelas_id=1 opsional untuk Guru Mapel)
// Format response: Grid (baris = murid, kolom = tanggal 1-31).
// ==========================================
router.get('/', authGuruMiddleware, async (req, res) => {
  try {
    const guru = req.guru;
    let targetKelasId = null;

    if (guru.role === 'WALI_KELAS') {
      targetKelasId = guru.kelas_id;
      if (!targetKelasId) {
        return res.status(400).json({
          success: false,
          message: 'Akun Anda belum dihubungkan ke kelas manapun sebagai Wali Kelas'
        });
      }
    } else {
      // Guru Mapel bisa mengirim kelas_id lewat query
      if (req.query.kelas_id) {
        targetKelasId = parseInt(req.query.kelas_id, 10);
      } else if (guru.kelas_id) {
        targetKelasId = guru.kelas_id;
      } else {
        // Jika tidak kirim kelas_id, ambil kelas pertama yang ada
        const firstClass = await prisma.kelas.findFirst({ orderBy: { namaKelas: 'asc' } });
        if (firstClass) targetKelasId = firstClass.id;
      }
    }

    if (!targetKelasId) {
      return res.status(400).json({
        success: false,
        message: 'Parameter kelas_id wajib ditentukan'
      });
    }

    // Ambil info kelas
    const kelas = await prisma.kelas.findUnique({
      where: { id: targetKelasId }
    });

    if (!kelas) {
      return res.status(404).json({
        success: false,
        message: 'Kelas tidak ditemukan'
      });
    }

    // Tentukan bulan dan tahun
    const now = new Date();
    const bulan = req.query.bulan ? parseInt(req.query.bulan, 10) : (now.getMonth() + 1);
    const tahun = req.query.tahun ? parseInt(req.query.tahun, 10) : now.getFullYear();

    if (isNaN(bulan) || bulan < 1 || bulan > 12) {
      return res.status(400).json({
        success: false,
        message: 'Parameter bulan harus antara 1 sampai 12'
      });
    }

    if (isNaN(tahun) || tahun < 2000 || tahun > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Parameter tahun tidak valid'
      });
    }

    // Hitung jumlah hari dalam bulan tersebut (28, 29, 30, atau 31)
    const daysInMonth = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
    const startDate = new Date(Date.UTC(tahun, bulan - 1, 1));
    const endDate = new Date(Date.UTC(tahun, bulan - 1, daysInMonth, 23, 59, 59, 999));

    // Ambil semua murid di kelas tersebut
    const murids = await prisma.murid.findMany({
      where: { kelasId: targetKelasId },
      orderBy: { noUrut: 'asc' }
    });

    const muridIds = murids.map((m) => m.id);

    // Ambil data absensi murid-murid tersebut pada rentang bulan yang diminta
    const absensiRecords = await prisma.absensi.findMany({
      where: {
        muridId: { in: muridIds },
        tanggal: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    // Petakan absensi berdasarkan murid_id dan tanggal hari (1-31)
    const absensiMap = {};
    for (const record of absensiRecords) {
      const dayNum = new Date(record.tanggal).getUTCDate();
      if (!absensiMap[record.muridId]) {
        absensiMap[record.muridId] = {};
      }
      absensiMap[record.muridId][dayNum] = record.status;
    }

    // Bentuk struktur data grid yang mudah di-map frontend
    const gridData = murids.map((murid) => {
      const mAbsensi = absensiMap[murid.id] || {};
      const gridRow = {};
      const rekap = { H: 0, S: 0, I: 0, A: 0, L: 0 };

      for (let day = 1; day <= daysInMonth; day++) {
        const st = mAbsensi[day] || null;
        gridRow[day] = st;
        if (st && rekap[st] !== undefined) {
          rekap[st]++;
        }
      }

      return {
        murid_id: murid.id,
        no_urut: murid.noUrut,
        nama_murid: murid.namaMurid,
        absensi: gridRow,
        rekap
      };
    });

    return res.status(200).json({
      success: true,
      kelas: {
        id: kelas.id,
        nama_kelas: kelas.namaKelas
      },
      bulan,
      tahun,
      total_hari: daysInMonth,
      total_murid: murids.length,
      data: gridData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data absensi: ' + error.message
    });
  }
});

// ==========================================
// 2. POST /api/absensi
// Endpoint diproteksi JWT.
// Untuk menyimpan / mengupdate status absensi (upsert).
// Menerima array object { murid_id, tanggal, status }
// atau { data: [ ... ] }
// ==========================================
router.post('/', authGuruMiddleware, async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body) ? req.body : (req.body.data || [req.body]);

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Body request harus berupa array data absensi atau object { murid_id, tanggal, status }'
      });
    }

    const validStatus = ['H', 'S', 'I', 'A', 'L'];
    const validItems = [];

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const muridId = parseInt(item.murid_id || item.muridId, 10);
      const status = (item.status || '').toUpperCase();
      const parsedDate = parseDateOnlyUTC(item.tanggal);

      if (!muridId || isNaN(muridId)) {
        return res.status(400).json({
          success: false,
          message: `Item ke-${i + 1}: murid_id tidak valid`
        });
      }

      if (!validStatus.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Item ke-${i + 1}: status '${item.status}' tidak valid. Pilihan: H, S, I, A, L`
        });
      }

      if (!parsedDate) {
        return res.status(400).json({
          success: false,
          message: `Item ke-${i + 1}: format tanggal '${item.tanggal}' tidak valid (gunakan format YYYY-MM-DD)`
        });
      }

      validItems.push({
        muridId,
        tanggal: parsedDate,
        status
      });
    }

    // Keamanan: Jika Wali Kelas, pastikan semua murid_id yang diinput adalah murid di kelasnya
    if (req.guru.role === 'WALI_KELAS') {
      const muridIds = [...new Set(validItems.map((v) => v.muridId))];
      const muridLain = await prisma.murid.findFirst({
        where: {
          id: { in: muridIds },
          kelasId: { not: req.guru.kelas_id }
        }
      });

      if (muridLain) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Anda hanya dapat menyimpan absensi untuk murid di kelas Anda'
        });
      }
    }

    // Jalankan batch upsert menggunakan Prisma Transaction
    const upsertOperations = validItems.map((item) =>
      prisma.absensi.upsert({
        where: {
          muridId_tanggal: {
            muridId: item.muridId,
            tanggal: item.tanggal
          }
        },
        update: {
          status: item.status
        },
        create: {
          muridId: item.muridId,
          tanggal: item.tanggal,
          status: item.status
        }
      })
    );

    const results = await prisma.$transaction(upsertOperations);

    return res.status(200).json({
      success: true,
      message: `${results.length} data absensi berhasil disimpan`,
      count: results.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan absensi: ' + error.message
    });
  }
});

// ==========================================
// 3. GET /api/absensi/daftar-kelas (Helper untuk dropdown)
// ==========================================
router.get('/daftar-kelas', authGuruMiddleware, async (req, res) => {
  try {
    const listKelas = await prisma.kelas.findMany({
      include: {
        _count: {
          select: { murid: true }
        }
      },
      orderBy: { namaKelas: 'asc' }
    });

    const formatted = listKelas.map((k) => ({
      id: k.id,
      nama_kelas: k.namaKelas,
      jumlah_murid: k._count.murid
    }));

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar kelas: ' + error.message
    });
  }
});

module.exports = router;

