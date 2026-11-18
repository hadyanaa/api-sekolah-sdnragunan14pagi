const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

const parseId = (val) => {
  const p = parseInt(val, 10);
  return isNaN(p) ? null : p;
};

// ==========================================
// 1. GET /api/murid (Daftar Murid)
// Support query: ?kelas_id=1 & ?q=budi & ?status=AKTIF|LULUS|MUTASI_KELUAR|NONAKTIF|SEMUA
// Jika Wali Kelas tanpa query: otomatis filter kelasnya
// ==========================================
const VALID_STATUS_MURID = ['AKTIF', 'LULUS', 'MUTASI_KELUAR'];

router.get('/', authFlexible, async (req, res) => {
  try {
    const where = {};

    if (req.query.kelas_id) {
      const requestedKelasId = parseId(req.query.kelas_id);
      if (req.isGuru && req.guru.role === 'GURU_MAPEL') {
        const assigned = await prisma.guruKelas.findMany({
          where: { guruId: req.guru.id },
          select: { kelasId: true }
        });
        const assignedIds = assigned.map((a) => a.kelasId);
        if (assignedIds.length > 0 && !assignedIds.includes(requestedKelasId)) {
          return res.status(403).json({
            success: false,
            message: 'Akses ditolak: Kelas ini bukan bagian dari kelas yang Anda ampu'
          });
        }
      }
      where.kelasId = requestedKelasId;
    } else if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      where.kelasId = req.guru.kelas_id;
    } else if (req.isGuru && req.guru.role === 'GURU_MAPEL') {
      const assigned = await prisma.guruKelas.findMany({
        where: { guruId: req.guru.id },
        select: { kelasId: true }
      });
      const assignedIds = assigned.map((a) => a.kelasId);
      if (assignedIds.length > 0) {
        where.kelasId = { in: assignedIds };
      }
    }

    const statusParam = String(req.query.status || 'AKTIF').trim().toUpperCase();
    if (statusParam === 'NONAKTIF') {
      where.status = { in: ['LULUS', 'MUTASI_KELUAR'] };
    } else if (VALID_STATUS_MURID.includes(statusParam)) {
      where.status = statusParam;
    } else if (statusParam !== 'SEMUA') {
      where.status = 'AKTIF';
    }

    if (req.query.q) {
      where.namaMurid = {
        contains: req.query.q.trim(),
        mode: 'insensitive'
      };
    }

    const listMurid = await prisma.murid.findMany({
      where,
      include: {
        kelas: {
          select: {
            id: true,
            namaKelas: true
          }
        }
      },
      orderBy: [
        { kelas: { namaKelas: 'asc' } },
        { noUrut: 'asc' }
      ]
    });

    const formatted = listMurid.map((m) => ({
      id: m.id,
      no_urut: m.noUrut,
      nama_murid: m.namaMurid,
      status: m.status,
      tahun_keluar: m.tahunKeluar,
      kelas_id: m.kelasId,
      nama_kelas: m.kelas ? m.kelas.namaKelas : null,
      created_at: m.createdAt
    }));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data murid: ' + error.message
    });
  }
});

// ==========================================
// 2. GET /api/murid/:id (Detail 1 Murid)
// ==========================================
router.get('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID murid tidak valid' });

    const murid = await prisma.murid.findUnique({
      where: { id },
      include: {
        kelas: true,
        _count: { select: { absensi: true } }
      }
    });

    if (!murid) {
      return res.status(404).json({ success: false, message: 'Murid tidak ditemukan' });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: murid.id,
        no_urut: murid.noUrut,
        nama_murid: murid.namaMurid,
        status: murid.status,
        tahun_keluar: murid.tahunKeluar,
        kelas_id: murid.kelasId,
        nama_kelas: murid.kelas ? murid.kelas.namaKelas : null,
        total_rekaman_absensi: murid._count.absensi,
        created_at: murid.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2B. GET /api/murid/:id/history (Riwayat Kehadiran Per Tahun Ajaran)
// Query opsional: ?tahun_ajaran=2026/2027
// ==========================================
const NAMA_BULAN_LIST = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const getAcademicStartYear = (year, month1Based) =>
  month1Based >= 7 ? year : year - 1;

const buildSemesterData = ({ label, periode, monthsSpec, byMonthMap }) => {
  const rekap = { H: 0, S: 0, I: 0, A: 0, L: 0 };
  const bulanan = monthsSpec.map(({ bulan, tahun }) => {
    const key = `${tahun}-${bulan}`;
    const entry = byMonthMap[key] || {
      rekap: { H: 0, S: 0, I: 0, A: 0, L: 0 },
      detail_ketidakhadiran: []
    };

    rekap.H += entry.rekap.H;
    rekap.S += entry.rekap.S;
    rekap.I += entry.rekap.I;
    rekap.A += entry.rekap.A;
    rekap.L += entry.rekap.L;

    const totalAktifBulan = entry.rekap.H + entry.rekap.S + entry.rekap.I + entry.rekap.A;
    return {
      bulan,
      tahun,
      nama_bulan: NAMA_BULAN_LIST[bulan - 1],
      rekap: entry.rekap,
      total_aktif: totalAktifBulan,
      persentase_hadir:
        totalAktifBulan > 0 ? Math.round((entry.rekap.H / totalAktifBulan) * 100) : null,
      detail_ketidakhadiran: entry.detail_ketidakhadiran
    };
  });

  const totalAktifSem = rekap.H + rekap.S + rekap.I + rekap.A;
  return {
    label,
    periode,
    rekap,
    total_aktif: totalAktifSem,
    persentase_hadir: totalAktifSem > 0 ? Math.round((rekap.H / totalAktifSem) * 100) : null,
    bulanan
  };
};

router.get('/:id/history', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID murid tidak valid' });

    const murid = await prisma.murid.findUnique({
      where: { id },
      include: { kelas: true }
    });

    if (!murid) {
      return res.status(404).json({ success: false, message: 'Murid tidak ditemukan' });
    }

    // Otorisasi: Wali Kelas hanya boleh melihat murid di kelasnya; Guru Mapel sesuai kelas ampu (jika dibatasi)
    if (req.isGuru && req.guru && req.guru.role === 'WALI_KELAS') {
      if (murid.kelasId !== req.guru.kelas_id) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Anda hanya dapat melihat riwayat murid di kelas Anda'
        });
      }
    } else if (req.isGuru && req.guru && req.guru.role === 'GURU_MAPEL') {
      const assigned = await prisma.guruKelas.findMany({
        where: { guruId: req.guru.id },
        select: { kelasId: true }
      });
      const assignedIds = assigned.map((a) => a.kelasId);
      if (assignedIds.length > 0 && !assignedIds.includes(murid.kelasId)) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Anda hanya dapat melihat riwayat murid di kelas yang Anda ampu'
        });
      }
    } else if (!req.isAdmin && !req.isGuru) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    // Ambil seluruh catatan absensi siswa ini (ringan: hanya tanggal & status)
    const allRecords = await prisma.absensi.findMany({
      where: { muridId: id },
      select: { tanggal: true, status: true },
      orderBy: { tanggal: 'asc' }
    });

    // Kumpulkan tahun ajaran yang benar-benar tercatat di database
    const academicYearsSet = new Set();
    allRecords.forEach((rec) => {
      const d = new Date(rec.tanggal);
      const startYr = getAcademicStartYear(d.getUTCFullYear(), d.getUTCMonth() + 1);
      academicYearsSet.add(startYr);
    });

    const sortedStartYears = Array.from(academicYearsSet).sort((a, b) => b - a);
    const availableTahunAjaran = sortedStartYears.map((yr) => `${yr}/${yr + 1}`);

    // Tentukan tahun ajaran aktif yang dipilih
    const now = new Date();
    const fallbackStartYear = getAcademicStartYear(now.getFullYear(), now.getMonth() + 1);
    let selectedStartYear = sortedStartYears.length > 0 ? sortedStartYears[0] : fallbackStartYear;

    if (req.query.tahun_ajaran) {
      const match = String(req.query.tahun_ajaran).trim().match(/^(\d{4})\s*\/\s*(\d{4})$/);
      if (!match) {
        return res.status(400).json({
          success: false,
          message: 'Format tahun_ajaran tidak valid (gunakan format YYYY/YYYY, misal 2026/2027)'
        });
      }
      selectedStartYear = parseInt(match[1], 10);
    }

    const selectedTahunAjaran = `${selectedStartYear}/${selectedStartYear + 1}`;
    const rangeStart = new Date(Date.UTC(selectedStartYear, 6, 1)); // 1 Juli X
    const rangeEnd = new Date(Date.UTC(selectedStartYear + 1, 5, 30, 23, 59, 59, 999)); // 30 Juni X+1

    // Petakan rekaman dalam tahun ajaran terpilih per bulan
    const byMonthMap = {};
    allRecords.forEach((rec) => {
      const d = new Date(rec.tanggal);
      if (d < rangeStart || d > rangeEnd) return;

      const yr = d.getUTCFullYear();
      const mo = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      const key = `${yr}-${mo}`;

      if (!byMonthMap[key]) {
        byMonthMap[key] = {
          rekap: { H: 0, S: 0, I: 0, A: 0, L: 0 },
          detail_ketidakhadiran: []
        };
      }

      if (byMonthMap[key].rekap[rec.status] !== undefined) {
        byMonthMap[key].rekap[rec.status]++;
      }

      if (rec.status === 'S' || rec.status === 'I' || rec.status === 'A') {
        byMonthMap[key].detail_ketidakhadiran.push({
          tanggal: `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          hari: day,
          bulan: mo,
          tahun: yr,
          status: rec.status
        });
      }
    });

    const ganjilMonths = [7, 8, 9, 10, 11, 12].map((b) => ({
      bulan: b,
      tahun: selectedStartYear
    }));
    const genapMonths = [1, 2, 3, 4, 5, 6].map((b) => ({
      bulan: b,
      tahun: selectedStartYear + 1
    }));

    const ganjil = buildSemesterData({
      label: 'Semester Ganjil',
      periode: `Juli - Desember ${selectedStartYear}`,
      monthsSpec: ganjilMonths,
      byMonthMap
    });

    const genap = buildSemesterData({
      label: 'Semester Genap',
      periode: `Januari - Juni ${selectedStartYear + 1}`,
      monthsSpec: genapMonths,
      byMonthMap
    });

    const tahunanRekap = {
      H: ganjil.rekap.H + genap.rekap.H,
      S: ganjil.rekap.S + genap.rekap.S,
      I: ganjil.rekap.I + genap.rekap.I,
      A: ganjil.rekap.A + genap.rekap.A,
      L: ganjil.rekap.L + genap.rekap.L
    };
    const totalAktifTahun = tahunanRekap.H + tahunanRekap.S + tahunanRekap.I + tahunanRekap.A;

    return res.status(200).json({
      success: true,
      data: {
        murid: {
          id: murid.id,
          no_urut: murid.noUrut,
          nama_murid: murid.namaMurid,
          status: murid.status,
          tahun_keluar: murid.tahunKeluar,
          kelas_id: murid.kelasId,
          nama_kelas: murid.kelas ? murid.kelas.namaKelas : null
        },
        tahun_ajaran: selectedTahunAjaran,
        available_tahun_ajaran: availableTahunAjaran,
        semester: {
          ganjil,
          genap
        },
        tahunan: {
          rekap: tahunanRekap,
          total_aktif: totalAktifTahun,
          persentase_hadir:
            totalAktifTahun > 0 ? Math.round((tahunanRekap.H / totalAktifTahun) * 100) : null
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil riwayat kehadiran siswa: ' + error.message
    });
  }
});

// ==========================================
// 3. POST /api/murid (Tambah 1 Murid)
// Admin & Wali Kelas (Wali kelas hanya untuk kelasnya)
// ==========================================
router.post('/', authFlexible, async (req, res) => {
  try {
    const { nama_murid, namaMurid, no_urut, noUrut, kelas_id, kelasId } = req.body;
    const namaTarget = (nama_murid || namaMurid || '').trim();
    let targetKelasId = (kelas_id !== undefined ? kelas_id : kelasId) ? parseId(kelas_id || kelasId) : null;
    let targetNoUrut = (no_urut !== undefined ? no_urut : noUrut) ? parseId(no_urut || noUrut) : null;

    if (!namaTarget) {
      return res.status(400).json({ success: false, message: 'Nama murid wajib diisi' });
    }

    // Otorisasi Wali Kelas vs Admin
    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      if (!req.guru.kelas_id) {
        return res.status(403).json({ success: false, message: 'Akun Anda belum terhubung ke kelas manapun' });
      }
      targetKelasId = req.guru.kelas_id; // Paksa ke kelas wali kelas
    } else if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Hanya Admin atau Wali Kelas yang dapat menambah murid' });
    }

    if (!targetKelasId) {
      return res.status(400).json({ success: false, message: 'Parameter kelas_id wajib diisi' });
    }

    const kelas = await prisma.kelas.findUnique({ where: { id: targetKelasId } });
    if (!kelas) {
      return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
    }

    // Jika nomor urut tidak diisi, otomatis buat no_urut terakhir + 1 (dari murid aktif)
    if (!targetNoUrut) {
      const lastMurid = await prisma.murid.findFirst({
        where: { kelasId: targetKelasId, status: 'AKTIF' },
        orderBy: { noUrut: 'desc' }
      });
      targetNoUrut = lastMurid ? lastMurid.noUrut + 1 : 1;
    }

    const baru = await prisma.murid.create({
      data: {
        namaMurid: namaTarget,
        noUrut: targetNoUrut,
        kelasId: targetKelasId
      },
      include: {
        kelas: true
      }
    });

    return res.status(201).json({
      success: true,
      message: `Murid '${baru.namaMurid}' berhasil ditambahkan ke kelas ${baru.kelas.namaKelas}`,
      data: {
        id: baru.id,
        no_urut: baru.noUrut,
        nama_murid: baru.namaMurid,
        status: baru.status,
        tahun_keluar: baru.tahunKeluar,
        kelas_id: baru.kelasId,
        nama_kelas: baru.kelas.namaKelas
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. POST /api/murid/bulk (Import Banyak Murid Sekaligus)
// Format body:
// { kelas_id: 1, murid: [ { nama_murid: "A", no_urut: 1 }, "Budi Santoso", ... ] }
// ==========================================
router.post('/bulk', authFlexible, async (req, res) => {
  try {
    let targetKelasId = (req.body.kelas_id || req.body.kelasId) ? parseId(req.body.kelas_id || req.body.kelasId) : null;
    const rawList = req.body.murid || req.body.data || req.body;

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Data murid harus berupa array (misal: { kelas_id: 1, murid: [...] })'
      });
    }

    // Otorisasi
    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      targetKelasId = req.guru.kelas_id;
    } else if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    if (!targetKelasId) {
      return res.status(400).json({ success: false, message: 'Parameter kelas_id wajib diisi' });
    }

    const kelas = await prisma.kelas.findUnique({ where: { id: targetKelasId } });
    if (!kelas) {
      return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
    }

    // Cari no urut tertinggi yang aktif di kelas ini
    const lastMurid = await prisma.murid.findFirst({
      where: { kelasId: targetKelasId, status: 'AKTIF' },
      orderBy: { noUrut: 'desc' }
    });
    let currentNoUrut = lastMurid ? lastMurid.noUrut : 0;

    const createOperations = [];
    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      let nama = '';
      let no = null;

      if (typeof item === 'string') {
        nama = item.trim();
      } else if (item && typeof item === 'object') {
        nama = (item.nama_murid || item.namaMurid || item.nama || '').trim();
        no = (item.no_urut || item.noUrut) ? parseId(item.no_urut || item.noUrut) : null;
      }

      if (nama) {
        if (!no) {
          currentNoUrut += 1;
          no = currentNoUrut;
        } else {
          currentNoUrut = Math.max(currentNoUrut, no);
        }

        createOperations.push(
          prisma.murid.create({
            data: {
              namaMurid: nama,
              noUrut: no,
              kelasId: targetKelasId
            }
          })
        );
      }
    }

    if (createOperations.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data nama murid yang valid dalam list' });
    }

    const results = await prisma.$transaction(createOperations);

    return res.status(201).json({
      success: true,
      message: `${results.length} murid berhasil ditambahkan ke kelas ${kelas.namaKelas}`,
      count: results.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. PUT /api/murid/:id (Edit Data Murid)
// Wali Kelas hanya bisa mengedit murid di kelas miliknya
// ==========================================
router.put('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID murid tidak valid' });

    const existing = await prisma.murid.findUnique({
      where: { id },
      include: { kelas: true }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Murid tidak ditemukan' });
    }

    // Otorisasi: Jika Wali Kelas, hanya boleh edit jika murid berada di kelasnya
    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      if (existing.kelasId !== req.guru.kelas_id) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Anda hanya dapat mengedit murid di kelas Anda'
        });
      }
    } else if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    const {
      nama_murid,
      namaMurid,
      no_urut,
      noUrut,
      kelas_id,
      kelasId,
      status,
      tahun_keluar,
      tahunKeluar
    } = req.body;
    const updateData = {};

    if (nama_murid || namaMurid) updateData.namaMurid = (nama_murid || namaMurid).trim();
    if (no_urut !== undefined || noUrut !== undefined) {
      updateData.noUrut = parseId(no_urut !== undefined ? no_urut : noUrut);
    }

    // Status keaktifan siswa & tahun keluar hanya bisa diubah oleh Admin
    if (status !== undefined) {
      const normalizedStatus = String(status).trim().toUpperCase();
      if (!VALID_STATUS_MURID.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Status keaktifan tidak valid. Pilihan: AKTIF, LULUS, MUTASI_KELUAR'
        });
      }
      if (normalizedStatus !== existing.status && !req.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Hanya Admin yang dapat mengubah status keaktifan siswa'
        });
      }
      if (req.isAdmin) {
        updateData.status = normalizedStatus;
        if (normalizedStatus === 'AKTIF' && tahun_keluar === undefined && tahunKeluar === undefined) {
          updateData.tahunKeluar = null;
        }
      }
    }

    if (req.isAdmin && (tahun_keluar !== undefined || tahunKeluar !== undefined)) {
      const rawTahun = tahun_keluar !== undefined ? tahun_keluar : tahunKeluar;
      updateData.tahunKeluar = rawTahun ? String(rawTahun).trim() : null;
    }

    // Hanya Admin yang boleh memindahkan kelas murid (misal: kenaikan kelas)
    if (req.isAdmin && (kelas_id !== undefined || kelasId !== undefined)) {
      const targetKelas = parseId(kelas_id !== undefined ? kelas_id : kelasId);
      if (targetKelas) {
        const k = await prisma.kelas.findUnique({ where: { id: targetKelas } });
        if (!k) return res.status(400).json({ success: false, message: 'Kelas tujuan tidak ditemukan' });
        updateData.kelasId = targetKelas;
      }
    }

    const updated = await prisma.murid.update({
      where: { id },
      data: updateData,
      include: { kelas: true }
    });

    return res.status(200).json({
      success: true,
      message: 'Data murid berhasil diperbarui',
      data: {
        id: updated.id,
        no_urut: updated.noUrut,
        nama_murid: updated.namaMurid,
        status: updated.status,
        tahun_keluar: updated.tahunKeluar,
        kelas_id: updated.kelasId,
        nama_kelas: updated.kelas.namaKelas
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. DELETE /api/murid/:id (Hapus Murid)
// ==========================================
router.delete('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID murid tidak valid' });

    const existing = await prisma.murid.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Murid tidak ditemukan' });
    }

    // Otorisasi: Jika Wali Kelas, hanya boleh hapus murid di kelasnya
    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      if (existing.kelasId !== req.guru.kelas_id) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Anda hanya dapat menghapus murid di kelas Anda'
        });
      }
    } else if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    await prisma.murid.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: `Murid '${existing.namaMurid}' berhasil dihapus`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

