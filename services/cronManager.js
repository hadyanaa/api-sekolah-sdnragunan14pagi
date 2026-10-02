const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class CronManager {
  constructor() {
    this.jobs = new Map(); // Map<scheduleId, CronTask>
  }

  /**
   * Inisialisasi awal saat server Express menyala
   */
  async init() {
    console.log('🔔 [CronManager] Menginisialisasi sistem Bel Sekolah Otomatis...');
    await this.syncSchedules();
  }

  /**
   * Sinkronisasi ulang seluruh jadwal aktif dari database tanpa restart server
   */
  async syncSchedules() {
    try {
      // 1. Hentikan dan hapus semua job yang sedang berjalan
      this.stopAllJobs();

      // 2. Ambil semua jadwal yang berstatus is_active = true
      const activeSchedules = await prisma.schedule.findMany({
        where: { isActive: true },
        orderBy: { time: 'asc' }
      });

      console.log(`🔔 [CronManager] Ditemukan ${activeSchedules.length} jadwal bel aktif di database.`);

      // 3. Daftarkan setiap jadwal ke node-cron
      for (const schedule of activeSchedules) {
        this.registerJob(schedule);
      }
    } catch (error) {
      console.error('❌ [CronManager] Gagal sinkronisasi jadwal bel:', error.message);
    }
  }

  /**
   * Mendaftarkan satu jadwal ke node-cron
   */
  registerJob(schedule) {
    try {
      const { id, name, days, time, audioFile } = schedule;

      if (!time || !time.includes(':')) {
        console.warn(`⚠️ [CronManager] Format waktu tidak valid untuk jadwal #${id} (${name}): ${time}`);
        return;
      }

      const [hourStr, minuteStr] = time.split(':');
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      if (isNaN(hour) || isNaN(minute)) {
        console.warn(`⚠️ [CronManager] Jam atau menit tidak valid untuk jadwal #${id}: ${time}`);
        return;
      }

      // Format days: "1,2,3,4,5" -> jika kosong, default ke "*" (setiap hari)
      const cleanDays = days ? days.replace(/\s+/g, '') : '*';

      // node-cron format: minute hour day-of-month month day-of-week
      const cronExpression = `${minute} ${hour} * * ${cleanDays}`;

      if (!cron.validate(cronExpression)) {
        console.warn(`⚠️ [CronManager] Ekspresi cron tidak valid "${cronExpression}" untuk jadwal #${id}`);
        return;
      }

      const audioPath = path.resolve(__dirname, '../public/audio', audioFile);

      // Buat task cron
      const task = cron.schedule(cronExpression, () => {
        console.log(`⏰ [BEL BERBUNYI] "${name}" (${time}) -> Memutar ${audioFile}`);
        this.playAudioFile(audioPath, name);
      });

      this.jobs.set(id, task);
      console.log(`   ✅ [Terdaftar #${id}] "${name}" [${cronExpression}] -> ${audioFile}`);
    } catch (err) {
      console.error(`❌ [CronManager] Gagal mendaftarkan jadwal #${schedule.id}:`, err.message);
    }
  }

  /**
   * Menjalankan pemutar audio mpg123 melalui child_process.exec
   */
  playAudioFile(audioPath, scheduleName = 'Bel Sekolah') {
    if (!fs.existsSync(audioPath)) {
      console.error(`❌ [Audio Error] Berkas audio tidak ditemukan di: ${audioPath}`);
      return;
    }

    const command = `mpg123 "${audioPath}"`;
    console.log(`🔊 [Eksekusi Player] ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        // Jika mpg123 belum terpasang (misal di lokal Windows tanpa mpg123)
        console.warn(`⚠️ [Player Output] mpg123 message: ${error.message}`);
        return;
      }
      console.log(`🔔 [Selesai] Bel "${scheduleName}" selesai berbunyi.`);
    });
  }

  /**
   * Menghentikan seluruh job yang aktif
   */
  stopAllJobs() {
    for (const [id, task] of this.jobs.entries()) {
      task.stop();
    }
    this.jobs.clear();
  }
}

// Export singleton instance
const cronManager = new CronManager();
module.exports = cronManager;
