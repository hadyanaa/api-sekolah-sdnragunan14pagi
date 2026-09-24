# API Backend Web Profile SDN 14 Ragunan Pagi

API Backend berbasis Express.js dan Prisma ORM dengan database PostgreSQL untuk website profil dan sistem informasi SDN 14 Ragunan Pagi.

---

## 🛠️ Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **ORM:** Prisma ORM (v5)
- **Database:** PostgreSQL
- **Language:** JavaScript (CommonJS)

---

## 📋 Fitur & Modul API
API menyediakan endpoint publik dan CRUD internal untuk:
1. **Siswa** (Lengkap dengan status `AKTIF` atau `ALUMNI`)
2. **Visi & Misi** (Sekolah & Ekstrakurikuler)
3. **SDM** (Pendidik, Tenaga Kependidikan, Staf)
4. **Prestasi** (Akademik, Olahraga, Seni)
5. **Ekstrakurikuler** (Pramuka, Futsal, Tari, Karate, Marawis, Taekwondo)
6. **Agenda Kegiatan**
7. **Kalender Akademik**
8. **Pengumuman Sekolah**
9. **Fasilitas Sekolah**

---

## 🚀 Setup & Instalasi

### 1. Clone & Install Dependencies
```bash
npm install
```

### 2. Konfigurasi Environment
Salin file `.env.example` menjadi `.env` lalu sesuaikan kredensial PostgreSQL Anda:
```env
PORT=5000
DATABASE_URL="postgresql://username:password@localhost:5432/db_ragunan14?schema=public"
```

### 3. Migrasi Database & Generate Client
```bash
npx prisma migrate dev
npx prisma generate
```

### 4. Seeding Data Awal
Untuk mengisi database dengan data profil sekolah awal:
```bash
npx prisma db seed
```

### 5. Jalankan Server
```bash
# Mode development (auto-reload)
npm run dev

# Mode production
npm start
```
Akses `http://localhost:5000` di browser untuk melihat ringkasan endpoint yang tersedia.
