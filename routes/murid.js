const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

const VALID_STATUS_MURID = ['AKTIF', 'LULUS', 'MUTASI_KELUAR'];

const parseId = (val) => {
  const p = parseInt(val, 10);
  return isNaN(p) ? null : p;
};

const cleanOptStr = (val) => {
  if (val === undefined) return undefined;
  if (val === null) return null;
  const s = String(val).trim();
  return s || null;
};

const parseOptionalDate = (val) => {
  if (val === undefined) return { provided: false, value: undefined };
  if (val === null || String(val).trim() === '') return { provided: true, value: null };
  const isoStr = String(val).trim().split('T')[0];
  const parts = isoStr.split('-');
  if (parts.length !== 3) return { provided: true, invalid: true };
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return { provided: true, invalid: true };
  const dateObj = new Date(Date.UTC(y, m, d));
  if (isNaN(dateObj.getTime())) return { provided: true, invalid: true };
  return { provided: true, value: dateObj };
};

const formatDateISO = (d) => (d ? new Date(d).toISOString().split('T')[0] : null);

const getCurrentAcademicYear = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = m >= 7 ? y : y - 1;
  return `${start}/${start + 1}`;
};

const formatMurid = (m) => ({
  id: m.id,
  no_urut: m.noUrut,
  nama_murid: m.namaMurid,
  nipd: m.nipd || null,
  nisn: m.nisn || null,
  nik: m.nik || null,
  tempat_lahir: m.tempatLahir || null,
  tanggal_lahir: formatDateISO(m.tanggalLahir),
  alamat: m.alamat || null,
  no_hp: m.noHp || null,
  status: m.status,
  tahun_keluar: m.tahunKeluar || null,
  tahun_ajaran_aktif: m.tahunAjaranAktif || null,
  kelas_id: m.kelasId,
  nama_kelas: m.kelas ? m.kelas.namaKelas : null,
  created_at: m.createdAt
});

async function upsertRiwayatKelas(tx, { muridId, tahunAjaran, kelasId }) {
  const kelas = await tx.kelas.findUnique({
    where: { id: kelasId },
    include: {
      guru: {
        where: { role: 'WALI_KELAS' },
        orderBy: { id: 'asc' },
        take: 1
      }
    }
  });
  if (!kelas) return null;

  const wali = kelas.guru?.[0] || null;
  return tx.riwayatKelasMurid.upsert({
    where: {
      muridId_tahunAjaran: {
        muridId,
        tahunAjaran
      }
    },
    update: {
      kelasId: kelas.id,
      namaKelas: kelas.namaKelas,
      waliKelasId: wali ? wali.id : null,
      namaWaliKelas: wali ? wali.namaGuru : null
    },
    create: {
      muridId,
      tahunAjaran,
      kelasId: kelas.id,
      namaKelas: kelas.namaKelas,
      waliKelasId: wali ? wali.id : null,
      namaWaliKelas: wali ? wali.namaGuru : null
    }
  });
}

async function resequenceClassAlphabetically(tx, kelasId) {
  const activeStudents = await tx.murid.findMany({
    where: { kelasId, status: 'AKTIF' },
    select: { id: true, namaMurid: true }
  });
  activeStudents.sort((a, b) =>
    a.namaMurid.localeCompare(b.namaMurid, 'id', { sensitivity: 'base' })
  );
  for (let i = 0; i < activeStudents.length; i++) {
    await tx.murid.update({
      where: { id: activeStudents[i].id },
      data: { noUrut: i + 1 }
    });
  }
  return activeStudents.length;
}

// ==========================================
// 1. GET /api/murid (Daftar Murid)
// Support query: ?kelas_id=1 & ?q=budi & ?status=AKTIF|LULUS|MUTASI_KELUAR|NONAKTIF|SEMUA
// Jika Wali Kelas tanpa query: otomatis filter kelasnya
// ==========================================
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

    const formatted = listMurid.map(formatMurid);

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
        ...formatMurid(murid),
        total_rekaman_absensi: murid._count.absensi
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2B. GET /api/murid/:id/history (Riwayat Kehadiran, Biodata & Kelas per Tahun Ajaran)
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
      include: {
        kelas: true,
        riwayatKelas: {
          orderBy: { tahunAjaran: 'desc' }
        }
      }
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

    // Kumpulkan tahun ajaran dari absensi DAN dari riwayat kelas
    const academicYearsSet = new Set();
    allRecords.forEach((rec) => {
      const d = new Date(rec.tanggal);
      const startYr = getAcademicStartYear(d.getUTCFullYear(), d.getUTCMonth() + 1);
      academicYearsSet.add(startYr);
    });
    (murid.riwayatKelas || []).forEach((rk) => {
      const match = String(rk.tahunAjaran || '').match(/^(\d{4})\s*\/\s*(\d{4})$/);
      if (match) academicYearsSet.add(parseInt(match[1], 10));
    });

    const sortedStartYears = Array.from(academicYearsSet).sort((a, b) => b - a);
    const availableTahunAjaran = sortedStartYears.map((yr) => `${yr}/${yr + 1}`);

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
    const rangeStart = new Date(Date.UTC(selectedStartYear, 6, 1));
    const rangeEnd = new Date(Date.UTC(selectedStartYear + 1, 5, 30, 23, 59, 59, 999));

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

    const riwayatList = (murid.riwayatKelas || []).map((rk) => ({
      tahun_ajaran: rk.tahunAjaran,
      kelas_id: rk.kelasId,
      nama_kelas: rk.namaKelas,
      nama_wali_kelas: rk.namaWaliKelas || null
    }));

    const matchedRiwayat =
      riwayatList.find((r) => r.tahun_ajaran === selectedTahunAjaran) || null;

    return res.status(200).json({
      success: true,
      data: {
        murid: formatMurid(murid),
        tahun_ajaran: selectedTahunAjaran,
        available_tahun_ajaran: availableTahunAjaran,
        kelas_tahun_ajaran: matchedRiwayat,
        riwayat_kelas: riwayatList,
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
    const {
      nama_murid,
      namaMurid,
      no_urut,
      noUrut,
      kelas_id,
      kelasId,
      nipd,
      nisn,
      nik,
      tempat_lahir,
      tempatLahir,
      tanggal_lahir,
      tanggalLahir,
      alamat,
      no_hp,
      noHp
    } = req.body;

    const namaTarget = (nama_murid || namaMurid || '').trim();
    let targetKelasId = (kelas_id !== undefined ? kelas_id : kelasId)
      ? parseId(kelas_id !== undefined ? kelas_id : kelasId)
      : null;
    let targetNoUrut = (no_urut !== undefined ? no_urut : noUrut)
      ? parseId(no_urut !== undefined ? no_urut : noUrut)
      : null;

    if (!namaTarget) {
      return res.status(400).json({ success: false, message: 'Nama murid wajib diisi' });
    }

    const parsedTgl = parseOptionalDate(
      tanggal_lahir !== undefined ? tanggal_lahir : tanggalLahir
    );
    if (parsedTgl.invalid) {
      return res.status(400).json({
        success: false,
        message: 'Format tanggal lahir tidak valid (gunakan YYYY-MM-DD)'
      });
    }

    // Otorisasi Wali Kelas vs Admin
    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      if (!req.guru.kelas_id) {
        return res.status(403).json({ success: false, message: 'Akun Anda belum terhubung ke kelas manapun' });
      }
      targetKelasId = req.guru.kelas_id;
    } else if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin atau Wali Kelas yang dapat menambah murid'
      });
    }

    if (!targetKelasId) {
      return res.status(400).json({ success: false, message: 'Parameter kelas_id wajib diisi' });
    }

    const kelas = await prisma.kelas.findUnique({ where: { id: targetKelasId } });
    if (!kelas) {
      return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
    }

    if (!targetNoUrut) {
      const lastMurid = await prisma.murid.findFirst({
        where: { kelasId: targetKelasId, status: 'AKTIF' },
        orderBy: { noUrut: 'desc' }
      });
      targetNoUrut = lastMurid ? lastMurid.noUrut + 1 : 1;
    }

    const currentTA = getCurrentAcademicYear();

    const baru = await prisma.$transaction(async (tx) => {
      const created = await tx.murid.create({
        data: {
          namaMurid: namaTarget,
          noUrut: targetNoUrut,
          kelasId: targetKelasId,
          tahunAjaranAktif: currentTA,
          nipd: cleanOptStr(nipd) ?? null,
          nisn: cleanOptStr(nisn) ?? null,
          nik: cleanOptStr(nik) ?? null,
          tempatLahir: cleanOptStr(tempat_lahir !== undefined ? tempat_lahir : tempatLahir) ?? null,
          tanggalLahir: parsedTgl.provided ? parsedTgl.value : null,
          alamat: cleanOptStr(alamat) ?? null,
          noHp: cleanOptStr(no_hp !== undefined ? no_hp : noHp) ?? null
        },
        include: { kelas: true }
      });

      await upsertRiwayatKelas(tx, {
        muridId: created.id,
        tahunAjaran: currentTA,
        kelasId: targetKelasId
      });

      return created;
    });

    return res.status(201).json({
      success: true,
      message: `Murid '${baru.namaMurid}' berhasil ditambahkan ke kelas ${baru.kelas.namaKelas}`,
      data: formatMurid(baru)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. POST /api/murid/bulk (Import Banyak Murid Sekaligus)
// ==========================================
router.post('/bulk', authFlexible, async (req, res) => {
  try {
    let targetKelasId = (req.body.kelas_id || req.body.kelasId)
      ? parseId(req.body.kelas_id || req.body.kelasId)
      : null;
    const rawList = req.body.murid || req.body.data || req.body;

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Data murid harus berupa array (misal: { kelas_id: 1, murid: [...] })'
      });
    }

    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      targetKelasId = req.guru.kelas_id;
    } else if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    if (!targetKelasId) {
      return res.status(400).json({ success: false, message: 'Parameter kelas_id wajib diisi' });
    }

    const kelas = await prisma.kelas.findUnique({
      where: { id: targetKelasId },
      include: {
        guru: {
          where: { role: 'WALI_KELAS' },
          orderBy: { id: 'asc' },
          take: 1
        }
      }
    });
    if (!kelas) {
      return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });
    }

    const lastMurid = await prisma.murid.findFirst({
      where: { kelasId: targetKelasId, status: 'AKTIF' },
      orderBy: { noUrut: 'desc' }
    });
    let currentNoUrut = lastMurid ? lastMurid.noUrut : 0;
    const currentTA = getCurrentAcademicYear();
    const wali = kelas.guru?.[0] || null;

    const prepared = [];
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
        prepared.push({ namaMurid: nama, noUrut: no });
      }
    }

    if (prepared.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data nama murid yang valid dalam list' });
    }

    const results = await prisma.$transaction(async (tx) => {
      const createdList = [];
      for (const item of prepared) {
        const created = await tx.murid.create({
          data: {
            namaMurid: item.namaMurid,
            noUrut: item.noUrut,
            kelasId: targetKelasId,
            tahunAjaranAktif: currentTA
          }
        });
        await tx.riwayatKelasMurid.create({
          data: {
            muridId: created.id,
            tahunAjaran: currentTA,
            kelasId: kelas.id,
            namaKelas: kelas.namaKelas,
            waliKelasId: wali ? wali.id : null,
            namaWaliKelas: wali ? wali.namaGuru : null
          }
        });
        createdList.push(created);
      }
      return createdList;
    });

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
// 4B. POST /api/murid/promote (Kenaikan Kelas & Kelulusan Massal - Hanya Admin)
// Body: { murid_ids: [1,2], aksi: "NAIK_KELAS" | "LULUS", target_kelas_id, tahun_ajaran_baru, tahun_keluar }
// Catatan: Untuk NAIK_KELAS, nomor urut kelas tujuan otomatis diurutkan ulang berdasarkan abjad nama!
// ==========================================
router.post('/promote', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat memproses kenaikan kelas atau kelulusan'
      });
    }

    const {
      murid_ids,
      muridIds,
      aksi,
      target_kelas_id,
      targetKelasId,
      tahun_ajaran_baru,
      tahunAjaranBaru,
      tahun_keluar,
      tahunKeluar
    } = req.body;

    const rawIds = Array.isArray(murid_ids) ? murid_ids : muridIds;
    const validIds = Array.isArray(rawIds)
      ? [...new Set(rawIds.map((v) => parseId(v)).filter((v) => v !== null && v > 0))]
      : [];

    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Pilih minimal 1 siswa untuk diproses'
      });
    }

    const actionType = String(aksi || 'NAIK_KELAS').trim().toUpperCase();
    if (!['NAIK_KELAS', 'LULUS'].includes(actionType)) {
      return res.status(400).json({
        success: false,
        message: "Aksi tidak valid. Pilihan: 'NAIK_KELAS' atau 'LULUS'"
      });
    }

    if (actionType === 'LULUS') {
      const resolvedTahunKeluar = cleanOptStr(
        tahun_keluar !== undefined
          ? tahun_keluar
          : tahunKeluar !== undefined
            ? tahunKeluar
            : tahun_ajaran_baru || tahunAjaranBaru
      );

      const updated = await prisma.murid.updateMany({
        where: { id: { in: validIds } },
        data: {
          status: 'LULUS',
          ...(resolvedTahunKeluar ? { tahunKeluar: resolvedTahunKeluar } : {})
        }
      });

      return res.status(200).json({
        success: true,
        message: `${updated.count} siswa berhasil diluluskan dan masuk ke arsip Alumni`,
        count: updated.count
      });
    }

    // Aksi NAIK_KELAS
    const destKelasId = parseId(
      target_kelas_id !== undefined ? target_kelas_id : targetKelasId
    );
    if (!destKelasId) {
      return res.status(400).json({
        success: false,
        message: 'Kelas tujuan wajib dipilih'
      });
    }

    const destKelas = await prisma.kelas.findUnique({ where: { id: destKelasId } });
    if (!destKelas) {
      return res.status(404).json({ success: false, message: 'Kelas tujuan tidak ditemukan' });
    }

    const rawTA = cleanOptStr(
      tahun_ajaran_baru !== undefined ? tahun_ajaran_baru : tahunAjaranBaru
    );
    const targetTA = rawTA || getCurrentAcademicYear();
    if (!/^\d{4}\s*\/\s*\d{4}$/.test(targetTA)) {
      return res.status(400).json({
        success: false,
        message: 'Format Tahun Ajaran baru harus YYYY/YYYY (contoh: 2026/2027)'
      });
    }
    const normalizedTA = targetTA.replace(/\s+/g, '');

    const totalInDest = await prisma.$transaction(async (tx) => {
      await tx.murid.updateMany({
        where: { id: { in: validIds } },
        data: {
          kelasId: destKelasId,
          status: 'AKTIF',
          tahunKeluar: null,
          tahunAjaranAktif: normalizedTA
        }
      });

      for (const mId of validIds) {
        await upsertRiwayatKelas(tx, {
          muridId: mId,
          tahunAjaran: normalizedTA,
          kelasId: destKelasId
        });
      }

      // Urutkan ulang no_urut berdasarkan abjad nama di kelas tujuan
      return resequenceClassAlphabetically(tx, destKelasId);
    });

    return res.status(200).json({
      success: true,
      message: `${validIds.length} siswa berhasil dinaikkan ke Kelas ${destKelas.namaKelas} (TA ${normalizedTA}) dan diurutkan ulang sesuai abjad (${totalInDest} siswa aktif).`,
      count: validIds.length,
      total_kelas_tujuan: totalInDest
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. PUT /api/murid/:id (Edit Data & Biodata Murid)
// Hak edit biodata: Wali Kelas masing-masing & Admin (Guru Mapel & Piket ditolak)
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

    if (req.isGuru && req.guru.role === 'WALI_KELAS') {
      if (existing.kelasId !== req.guru.kelas_id) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Anda hanya dapat mengedit murid di kelas Anda'
        });
      }
    } else if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin atau Wali Kelas yang dapat mengedit data murid'
      });
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
      tahunKeluar,
      tahun_ajaran_aktif,
      tahunAjaranAktif,
      nipd,
      nisn,
      nik,
      tempat_lahir,
      tempatLahir,
      tanggal_lahir,
      tanggalLahir,
      alamat,
      no_hp,
      noHp
    } = req.body;

    const updateData = {};

    if (nama_murid || namaMurid) updateData.namaMurid = (nama_murid || namaMurid).trim();
    if (no_urut !== undefined || noUrut !== undefined) {
      updateData.noUrut = parseId(no_urut !== undefined ? no_urut : noUrut);
    }

    // Biodata opsional (boleh diedit oleh Admin dan Wali Kelas)
    if (nipd !== undefined) updateData.nipd = cleanOptStr(nipd);
    if (nisn !== undefined) updateData.nisn = cleanOptStr(nisn);
    if (nik !== undefined) updateData.nik = cleanOptStr(nik);
    if (tempat_lahir !== undefined || tempatLahir !== undefined) {
      updateData.tempatLahir = cleanOptStr(
        tempat_lahir !== undefined ? tempat_lahir : tempatLahir
      );
    }
    const parsedTgl = parseOptionalDate(
      tanggal_lahir !== undefined ? tanggal_lahir : tanggalLahir
    );
    if (parsedTgl.invalid) {
      return res.status(400).json({
        success: false,
        message: 'Format tanggal lahir tidak valid (gunakan YYYY-MM-DD)'
      });
    }
    if (parsedTgl.provided) updateData.tanggalLahir = parsedTgl.value;
    if (alamat !== undefined) updateData.alamat = cleanOptStr(alamat);
    if (no_hp !== undefined || noHp !== undefined) {
      updateData.noHp = cleanOptStr(no_hp !== undefined ? no_hp : noHp);
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

    let movedToNewClass = false;
    let targetKelas = existing.kelasId;

    // Hanya Admin yang boleh memindahkan kelas murid
    if (req.isAdmin && (kelas_id !== undefined || kelasId !== undefined)) {
      const parsedKelas = parseId(kelas_id !== undefined ? kelas_id : kelasId);
      if (parsedKelas && parsedKelas !== existing.kelasId) {
        const k = await prisma.kelas.findUnique({ where: { id: parsedKelas } });
        if (!k) return res.status(400).json({ success: false, message: 'Kelas tujuan tidak ditemukan' });
        updateData.kelasId = parsedKelas;
        targetKelas = parsedKelas;
        movedToNewClass = true;
      }
    }

    const explicitTA = cleanOptStr(
      tahun_ajaran_aktif !== undefined ? tahun_ajaran_aktif : tahunAjaranAktif
    );
    const activeTA = explicitTA || existing.tahunAjaranAktif || getCurrentAcademicYear();
    if (movedToNewClass || explicitTA) {
      updateData.tahunAjaranAktif = explicitTA || getCurrentAcademicYear();
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.murid.update({
        where: { id },
        data: updateData,
        include: { kelas: true }
      });

      if (movedToNewClass || explicitTA) {
        await upsertRiwayatKelas(tx, {
          muridId: saved.id,
          tahunAjaran: saved.tahunAjaranAktif || activeTA,
          kelasId: targetKelas
        });
      }

      return saved;
    });

    return res.status(200).json({
      success: true,
      message: 'Data murid berhasil diperbarui',
      data: formatMurid(updated)
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
