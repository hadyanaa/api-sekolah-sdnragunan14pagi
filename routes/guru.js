const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const authFlexible = require('../middleware/authFlexible');

const router = express.Router();
const prisma = new PrismaClient();

const VALID_GURU_ROLES = ['WALI_KELAS', 'GURU_MAPEL', 'PIKET'];
const VALID_STATUS_GURU = ['AKTIF', 'MUTASI_KELUAR', 'PENSIUN'];

const parseId = (val) => {
  const p = parseInt(val, 10);
  return isNaN(p) ? null : p;
};

const parseIdArray = (raw) => {
  if (!Array.isArray(raw)) return null;
  const ids = raw
    .map((v) => parseId(v))
    .filter((v) => v !== null && v > 0);
  return [...new Set(ids)];
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

const GURU_PROFILE_SELECT = {
  id: true,
  username: true,
  nipNikki: true,
  nuptk: true,
  nrg: true,
  golonganRuang: true,
  jabatan: true,
  tmtKerja: true,
  tmtSekolah: true,
  tingkatPendidikan: true,
  jurusan: true,
  jenisKelamin: true,
  tempatLahir: true,
  tanggalLahir: true,
  alamat: true,
  status: true,
  tahunKeluar: true,
  namaGuru: true,
  role: true,
  kelasId: true,
  kelas: {
    select: {
      id: true,
      namaKelas: true
    }
  },
  kelasMapel: {
    include: {
      kelas: {
        select: {
          id: true,
          namaKelas: true
        }
      }
    }
  },
  createdAt: true
};

const formatGuruRow = (g) => {
  const kelasMapel = (g.kelasMapel || [])
    .map((km) => ({
      id: km.kelas.id,
      nama_kelas: km.kelas.namaKelas
    }))
    .sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas));

  return {
    id: g.id,
    username: g.username,
    nip: g.username, // backward compatibility
    nip_nikki: g.nipNikki || null,
    nuptk: g.nuptk || null,
    nrg: g.nrg || null,
    golongan_ruang: g.golonganRuang || null,
    jabatan: g.jabatan || null,
    tmt_kerja: formatDateISO(g.tmtKerja),
    tmt_sekolah: formatDateISO(g.tmtSekolah),
    tingkat_pendidikan: g.tingkatPendidikan || null,
    jurusan: g.jurusan || null,
    jenis_kelamin: g.jenisKelamin || null,
    tempat_lahir: g.tempatLahir || null,
    tanggal_lahir: formatDateISO(g.tanggalLahir),
    alamat: g.alamat || null,
    status: g.status || 'AKTIF',
    tahun_keluar: g.tahunKeluar || null,
    nama_guru: g.namaGuru,
    role: g.role,
    kelas_id: g.kelasId,
    nama_kelas: g.kelas ? g.kelas.namaKelas : null,
    kelas_mapel_ids: kelasMapel.map((k) => k.id),
    kelas_mapel: kelasMapel,
    created_at: g.createdAt
  };
};

function buildKeteranganKelas(guruRow) {
  if (guruRow.role === 'WALI_KELAS') {
    return guruRow.kelas ? `Kelas ${guruRow.kelas.namaKelas}` : 'Belum ditentukan';
  }
  if (guruRow.role === 'PIKET') {
    return 'Semua Kelas (Piket)';
  }
  const mapelNames = (guruRow.kelasMapel || [])
    .map((km) => km.kelas.namaKelas)
    .sort((a, b) => a.localeCompare(b));
  return mapelNames.length > 0 ? `Kelas ${mapelNames.join(', ')}` : 'Semua Kelas';
}

async function upsertRiwayatMengajar(tx, guruRow, tahunAjaran) {
  const ta = tahunAjaran || getCurrentAcademicYear();
  const keteranganKelas = buildKeteranganKelas(guruRow);
  return tx.riwayatMengajarGuru.upsert({
    where: {
      guruId_tahunAjaran: {
        guruId: guruRow.id,
        tahunAjaran: ta
      }
    },
    update: {
      role: guruRow.role,
      jabatan: guruRow.jabatan || null,
      keteranganKelas
    },
    create: {
      guruId: guruRow.id,
      tahunAjaran: ta,
      role: guruRow.role,
      jabatan: guruRow.jabatan || null,
      keteranganKelas
    }
  });
}

// ==========================================
// 1. GET /api/guru (Daftar Guru)
// Support query: ?status=AKTIF | MUTASI_KELUAR | PENSIUN | NONAKTIF | SEMUA
// ==========================================
router.get('/', authFlexible, async (req, res) => {
  try {
    const statusParam = String(req.query.status || 'AKTIF').trim().toUpperCase();

    if (statusParam !== 'AKTIF' && !req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat melihat arsip guru non-aktif'
      });
    }

    const where = {};
    if (statusParam === 'NONAKTIF') {
      where.status = { in: ['MUTASI_KELUAR', 'PENSIUN'] };
    } else if (VALID_STATUS_GURU.includes(statusParam)) {
      where.status = statusParam;
    } else if (statusParam !== 'SEMUA') {
      where.status = 'AKTIF';
    }

    const listGuru = await prisma.guru.findMany({
      where,
      select: GURU_PROFILE_SELECT,
      orderBy: [{ role: 'asc' }, { namaGuru: 'asc' }]
    });

    const formatted = listGuru.map(formatGuruRow);

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data guru: ' + error.message
    });
  }
});

// ==========================================
// 2. GET /api/guru/:id (Detail 1 Guru)
// ==========================================
router.get('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID guru tidak valid' });

    const guru = await prisma.guru.findUnique({
      where: { id },
      select: GURU_PROFILE_SELECT
    });

    if (!guru) {
      return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
    }

    return res.status(200).json({
      success: true,
      data: formatGuruRow(guru)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2B. GET /api/guru/:id/history (Detail Profil Lengkap & Riwayat Mengajar per TA - HANYA ADMIN)
// ==========================================
router.get('/:id/history', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Riwayat lengkap dan biodata guru hanya dapat dilihat oleh Admin'
      });
    }

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID guru tidak valid' });

    const guru = await prisma.guru.findUnique({
      where: { id },
      select: {
        ...GURU_PROFILE_SELECT,
        riwayatMengajar: {
          orderBy: { tahunAjaran: 'desc' }
        }
      }
    });

    if (!guru) {
      return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
    }

    return res.status(200).json({
      success: true,
      data: {
        guru: formatGuruRow(guru),
        riwayat_mengajar: (guru.riwayatMengajar || []).map((rm) => ({
          id: rm.id,
          tahun_ajaran: rm.tahunAjaran,
          role: rm.role,
          jabatan: rm.jabatan || null,
          keterangan_kelas: rm.keteranganKelas
        }))
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil riwayat mengajar guru: ' + error.message
    });
  }
});

// ==========================================
// 3. POST /api/guru (Tambah Guru Baru - Hanya Admin)
// ==========================================
router.post('/', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat menambahkan akun Guru'
      });
    }

    const {
      username,
      nip,
      nip_nikki,
      nipNikki,
      nuptk,
      nrg,
      golongan_ruang,
      golonganRuang,
      jabatan,
      tmt_kerja,
      tmtKerja,
      tmt_sekolah,
      tmtSekolah,
      tingkat_pendidikan,
      tingkatPendidikan,
      jurusan,
      jenis_kelamin,
      jenisKelamin,
      tempat_lahir,
      tempatLahir,
      tanggal_lahir,
      tanggalLahir,
      alamat,
      nama_guru,
      namaGuru,
      password,
      role,
      kelas_id,
      kelasId,
      kelas_mapel_ids,
      kelasMapelIds
    } = req.body;

    const usernameTarget = (username || nip || '').trim();
    const namaTarget = (nama_guru || namaGuru || '').trim();
    const passTarget = (password || '').trim();
    const roleTarget = (role || 'WALI_KELAS').toUpperCase();
    const targetKelasId = (kelas_id !== undefined ? kelas_id : kelasId)
      ? parseId(kelas_id !== undefined ? kelas_id : kelasId)
      : null;
    const targetKelasMapelIds =
      parseIdArray(kelas_mapel_ids !== undefined ? kelas_mapel_ids : kelasMapelIds) || [];

    if (!usernameTarget || !namaTarget || !passTarget) {
      return res.status(400).json({
        success: false,
        message: 'Username, nama guru, dan password wajib diisi'
      });
    }

    if (!VALID_GURU_ROLES.includes(roleTarget)) {
      return res.status(400).json({
        success: false,
        message: "Role harus 'WALI_KELAS', 'GURU_MAPEL', atau 'PIKET'"
      });
    }

    const parsedTmtKerja = parseOptionalDate(tmt_kerja !== undefined ? tmt_kerja : tmtKerja);
    const parsedTmtSekolah = parseOptionalDate(
      tmt_sekolah !== undefined ? tmt_sekolah : tmtSekolah
    );
    const parsedTglLahir = parseOptionalDate(
      tanggal_lahir !== undefined ? tanggal_lahir : tanggalLahir
    );

    if (parsedTmtKerja.invalid || parsedTmtSekolah.invalid || parsedTglLahir.invalid) {
      return res.status(400).json({
        success: false,
        message: 'Format tanggal pada profil guru tidak valid (gunakan YYYY-MM-DD)'
      });
    }

    const resolvedKelasId = roleTarget === 'WALI_KELAS' ? targetKelasId : null;

    const existingUsername = await prisma.guru.findUnique({ where: { username: usernameTarget } });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: `Username '${usernameTarget}' sudah terdaftar`
      });
    }

    if (resolvedKelasId) {
      const existingKelas = await prisma.kelas.findUnique({ where: { id: resolvedKelasId } });
      if (!existingKelas) {
        return res.status(400).json({ success: false, message: 'Kelas yang dipilih tidak ditemukan' });
      }
    }

    if (roleTarget === 'GURU_MAPEL' && targetKelasMapelIds.length > 0) {
      const foundClasses = await prisma.kelas.findMany({
        where: { id: { in: targetKelasMapelIds } },
        select: { id: true }
      });
      if (foundClasses.length !== targetKelasMapelIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Sebagian kelas yang dipilih untuk Guru Mapel tidak ditemukan'
        });
      }
    }

    const hashedPassword = await bcrypt.hash(passTarget, 10);

    const baru = await prisma.$transaction(async (tx) => {
      const created = await tx.guru.create({
        data: {
          username: usernameTarget,
          nipNikki: cleanOptStr(nip_nikki !== undefined ? nip_nikki : nipNikki) ?? null,
          nuptk: cleanOptStr(nuptk) ?? null,
          nrg: cleanOptStr(nrg) ?? null,
          golonganRuang:
            cleanOptStr(golongan_ruang !== undefined ? golongan_ruang : golonganRuang) ?? null,
          jabatan: cleanOptStr(jabatan) ?? null,
          tmtKerja: parsedTmtKerja.provided ? parsedTmtKerja.value : null,
          tmtSekolah: parsedTmtSekolah.provided ? parsedTmtSekolah.value : null,
          tingkatPendidikan:
            cleanOptStr(
              tingkat_pendidikan !== undefined ? tingkat_pendidikan : tingkatPendidikan
            ) ?? null,
          jurusan: cleanOptStr(jurusan) ?? null,
          jenisKelamin:
            cleanOptStr(jenis_kelamin !== undefined ? jenis_kelamin : jenisKelamin) ?? null,
          tempatLahir:
            cleanOptStr(tempat_lahir !== undefined ? tempat_lahir : tempatLahir) ?? null,
          tanggalLahir: parsedTglLahir.provided ? parsedTglLahir.value : null,
          alamat: cleanOptStr(alamat) ?? null,
          namaGuru: namaTarget,
          password: hashedPassword,
          role: roleTarget,
          kelasId: resolvedKelasId,
          ...(roleTarget === 'GURU_MAPEL' && targetKelasMapelIds.length > 0
            ? {
                kelasMapel: {
                  create: targetKelasMapelIds.map((kid) => ({ kelasId: kid }))
                }
              }
            : {})
        },
        select: GURU_PROFILE_SELECT
      });

      await upsertRiwayatMengajar(tx, created);
      return created;
    });

    return res.status(201).json({
      success: true,
      message: 'Akun berhasil dibuat',
      data: formatGuruRow(baru)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. PUT /api/guru/:id (Edit Guru)
// Admin bisa edit semua profil, status keaktifan, dan penugasan kelas.
// Guru bisa edit data diri / password / biodata sendiri (kecuali PIKET).
// ==========================================
router.put('/:id', authFlexible, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID guru tidak valid' });

    const existing = await prisma.guru.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
    }

    if (existing.role === 'PIKET' && !req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Akun Piket hanya dapat dikelola atau diubah oleh Admin'
      });
    }

    if (!req.isAdmin && (!req.isGuru || req.guru.id !== id)) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Anda tidak memiliki hak untuk mengubah data guru ini'
      });
    }

    const {
      username,
      nip,
      nip_nikki,
      nipNikki,
      nuptk,
      nrg,
      golongan_ruang,
      golonganRuang,
      jabatan,
      tmt_kerja,
      tmtKerja,
      tmt_sekolah,
      tmtSekolah,
      tingkat_pendidikan,
      tingkatPendidikan,
      jurusan,
      jenis_kelamin,
      jenisKelamin,
      tempat_lahir,
      tempatLahir,
      tanggal_lahir,
      tanggalLahir,
      alamat,
      status,
      tahun_keluar,
      tahunKeluar,
      nama_guru,
      namaGuru,
      password,
      role,
      kelas_id,
      kelasId,
      kelas_mapel_ids,
      kelasMapelIds
    } = req.body;

    const updateData = {};

    if (nama_guru || namaGuru) updateData.namaGuru = (nama_guru || namaGuru).trim();
    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password.trim(), 10);
    }

    // Biodata & profil kepegawaian opsional
    if (nip_nikki !== undefined || nipNikki !== undefined) {
      updateData.nipNikki = cleanOptStr(nip_nikki !== undefined ? nip_nikki : nipNikki);
    }
    if (nuptk !== undefined) updateData.nuptk = cleanOptStr(nuptk);
    if (nrg !== undefined) updateData.nrg = cleanOptStr(nrg);
    if (golongan_ruang !== undefined || golonganRuang !== undefined) {
      updateData.golonganRuang = cleanOptStr(
        golongan_ruang !== undefined ? golongan_ruang : golonganRuang
      );
    }
    if (jabatan !== undefined) updateData.jabatan = cleanOptStr(jabatan);
    if (tingkat_pendidikan !== undefined || tingkatPendidikan !== undefined) {
      updateData.tingkatPendidikan = cleanOptStr(
        tingkat_pendidikan !== undefined ? tingkat_pendidikan : tingkatPendidikan
      );
    }
    if (jurusan !== undefined) updateData.jurusan = cleanOptStr(jurusan);
    if (jenis_kelamin !== undefined || jenisKelamin !== undefined) {
      updateData.jenisKelamin = cleanOptStr(
        jenis_kelamin !== undefined ? jenis_kelamin : jenisKelamin
      );
    }
    if (tempat_lahir !== undefined || tempatLahir !== undefined) {
      updateData.tempatLahir = cleanOptStr(
        tempat_lahir !== undefined ? tempat_lahir : tempatLahir
      );
    }
    if (alamat !== undefined) updateData.alamat = cleanOptStr(alamat);

    const parsedTmtKerja = parseOptionalDate(tmt_kerja !== undefined ? tmt_kerja : tmtKerja);
    const parsedTmtSekolah = parseOptionalDate(
      tmt_sekolah !== undefined ? tmt_sekolah : tmtSekolah
    );
    const parsedTglLahir = parseOptionalDate(
      tanggal_lahir !== undefined ? tanggal_lahir : tanggalLahir
    );
    if (parsedTmtKerja.invalid || parsedTmtSekolah.invalid || parsedTglLahir.invalid) {
      return res.status(400).json({
        success: false,
        message: 'Format tanggal pada profil guru tidak valid (gunakan YYYY-MM-DD)'
      });
    }
    if (parsedTmtKerja.provided) updateData.tmtKerja = parsedTmtKerja.value;
    if (parsedTmtSekolah.provided) updateData.tmtSekolah = parsedTmtSekolah.value;
    if (parsedTglLahir.provided) updateData.tanggalLahir = parsedTglLahir.value;

    let nextKelasMapelIds = null;

    // Username, Role, Kelas, dan Status Keaktifan hanya boleh diubah oleh Admin
    if (req.isAdmin) {
      const rawUsername = username !== undefined ? username : nip;
      if (rawUsername && String(rawUsername).trim()) {
        const usernameClean = String(rawUsername).trim();
        if (usernameClean !== existing.username) {
          const duplicate = await prisma.guru.findUnique({ where: { username: usernameClean } });
          if (duplicate) {
            return res.status(400).json({ success: false, message: 'Username sudah dipakai akun lain' });
          }
          updateData.username = usernameClean;
        }
      }

      if (role) {
        const roleClean = role.toUpperCase();
        if (!VALID_GURU_ROLES.includes(roleClean)) {
          return res.status(400).json({
            success: false,
            message: "Role harus 'WALI_KELAS', 'GURU_MAPEL', atau 'PIKET'"
          });
        }
        updateData.role = roleClean;
        if (roleClean !== 'WALI_KELAS') {
          updateData.kelasId = null;
        }
      }

      const nextRole = updateData.role || existing.role;
      if (nextRole === 'WALI_KELAS' && (kelas_id !== undefined || kelasId !== undefined)) {
        const rawKelasId = kelas_id !== undefined ? kelas_id : kelasId;
        updateData.kelasId = rawKelasId ? parseId(rawKelasId) : null;
      }

      if (nextRole !== 'GURU_MAPEL') {
        nextKelasMapelIds = [];
      } else if (kelas_mapel_ids !== undefined || kelasMapelIds !== undefined) {
        const parsedIds = parseIdArray(
          kelas_mapel_ids !== undefined ? kelas_mapel_ids : kelasMapelIds
        );
        if (parsedIds === null) {
          return res.status(400).json({
            success: false,
            message: 'Format kelas_mapel_ids harus berupa array ID kelas'
          });
        }
        if (parsedIds.length > 0) {
          const foundClasses = await prisma.kelas.findMany({
            where: { id: { in: parsedIds } },
            select: { id: true }
          });
          if (foundClasses.length !== parsedIds.length) {
            return res.status(400).json({
              success: false,
              message: 'Sebagian kelas yang dipilih untuk Guru Mapel tidak ditemukan'
            });
          }
        }
        nextKelasMapelIds = parsedIds;
      }

      if (status !== undefined) {
        const normalizedStatus = String(status).trim().toUpperCase();
        if (!VALID_STATUS_GURU.includes(normalizedStatus)) {
          return res.status(400).json({
            success: false,
            message: 'Status keaktifan guru tidak valid. Pilihan: AKTIF, MUTASI_KELUAR, PENSIUN'
          });
        }
        updateData.status = normalizedStatus;
        if (normalizedStatus === 'AKTIF') {
          if (tahun_keluar === undefined && tahunKeluar === undefined) {
            updateData.tahunKeluar = null;
          }
        } else {
          // Lepas penugasan kelas aktif saat guru mutasi keluar / pensiun (histori tetap utuh)
          updateData.kelasId = null;
          nextKelasMapelIds = [];
        }
      }

      if (tahun_keluar !== undefined || tahunKeluar !== undefined) {
        updateData.tahunKeluar = cleanOptStr(
          tahun_keluar !== undefined ? tahun_keluar : tahunKeluar
        );
      }
    }

    const finalStatus = updateData.status || existing.status || 'AKTIF';

    const updated = await prisma.$transaction(async (tx) => {
      if (nextKelasMapelIds !== null) {
        await tx.guruKelas.deleteMany({ where: { guruId: id } });
        if (nextKelasMapelIds.length > 0) {
          await tx.guruKelas.createMany({
            data: nextKelasMapelIds.map((kid) => ({ guruId: id, kelasId: kid })),
            skipDuplicates: true
          });
        }
      }

      const saved = await tx.guru.update({
        where: { id },
        data: updateData,
        select: GURU_PROFILE_SELECT
      });

      // Perbarui histori mengajar tahun ajaran berjalan hanya bila guru aktif
      if (finalStatus === 'AKTIF') {
        await upsertRiwayatMengajar(tx, saved);
      }

      return saved;
    });

    return res.status(200).json({
      success: true,
      message: 'Data guru berhasil diperbarui',
      data: formatGuruRow(updated)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. DELETE /api/guru/:id (Hapus Guru - Hanya Admin)
// ==========================================
router.delete('/:id', authFlexible, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Hanya Admin yang dapat menghapus akun Guru'
      });
    }

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID guru tidak valid' });

    const existing = await prisma.guru.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
    }

    await prisma.guru.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: `Akun '${existing.namaGuru}' (Username: ${existing.username}) berhasil dihapus`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
