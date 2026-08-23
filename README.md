# PLTGU AI Workspace

Web chat internal untuk Ollama on-premise. Browser hanya berkomunikasi dengan backend Next.js; endpoint Ollama tidak dibuka langsung kepada pengguna.

## Stack

- Next.js 16 + React 19 + TypeScript + Tailwind CSS
- Auth.js Credentials + Argon2
- PostgreSQL + Prisma 6
- Ollama API streaming
- RAG privat dengan embedding Ollama serta OCR lokal untuk PDF, DOCX, TXT, Markdown, PNG, JPG, dan WebP
- Docker Compose untuk deployment

## Fitur

- Login lokal dan sesi 8 jam
- Role `ADMIN` dan `USER`, unit/divisi, serta scope data privat/unit
- Riwayat percakapan terisolasi dengan kebijakan akses server-side
- Streaming jawaban Ollama
- Identitas asisten konsisten sebagai **AI PLTGU Cilegon** untuk seluruh model yang diizinkan
- Ekspor percakapan menjadi PDF, Microsoft Word (DOCX), atau Microsoft Excel (XLSX)
- AI dapat membuat artifact DOCX, PDF, atau XLSX persisten melalui durable worker queue
- Upload dokumen maks. 10 MB diproses asynchronous; retrieval menyimpan sitasi chunk, halaman, skor, dan kutipan
- File Center untuk status, unduh, regenerate, dan hapus artifact
- Admin dapat mengelola unit, assignment pengguna, scope dokumen, audit, serta evaluasi kualitas RAG
- Rate limit database, health/readiness, metrik terproteksi, security headers, dan container non-root

## Menjalankan secara lokal

1. Salin `.env.example` menjadi `.env` dan ubah seluruh secret.
2. Pastikan PostgreSQL tersedia dan `DATABASE_URL` benar.
3. Jalankan:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
# terminal kedua
npm run worker
```

Buka `http://localhost:3006`, kemudian login menggunakan `ADMIN_USERNAME` dan `ADMIN_PASSWORD` dari `.env`.

Untuk mode production lokal, build ulang setiap kali kode atau `.env` yang dibutuhkan saat build berubah, lalu jalankan server standalone:

```bash
npm run build
npm run start
```

Setelah mengganti `ADMIN_PASSWORD`, jalankan `npm run db:seed`. Seed akan mengaktifkan akun admin dan mengganti hash password akun yang sudah ada.

## Deployment Docker

Buat `.env` minimal:

```env
POSTGRES_PASSWORD=password-database-yang-kuat
AUTH_SECRET=secret-acak-minimal-32-byte
OLLAMA_BASE_URL=http://10.8.140.75:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OCR_MAX_PAGES=20
STORAGE_DIR=/app/storage
METRICS_TOKEN=token-monitoring-acak-yang-kuat
ADMIN_USERNAME=admin
ADMIN_NAME=Administrator
ADMIN_PASSWORD=password-admin-yang-kuat
```

Lalu jalankan:

```bash
docker compose build
docker compose up -d db
docker compose run --rm web npx prisma migrate deploy
docker compose run --rm -e ADMIN_USERNAME -e ADMIN_NAME -e ADMIN_PASSWORD web npx tsx prisma/seed.ts
docker compose up -d web worker
```

> Untuk produksi, tempatkan reverse proxy HTTPS (Nginx/Traefik) di depan port 3006 dan batasi akses port Ollama `11434` hanya dari server web. Jangan publish PostgreSQL ke jaringan umum.

## RAG dokumen

RAG memakai model embedding terpisah dari model chat. Siapkan model tersebut satu kali pada server Ollama:

```bash
ollama pull nomic-embed-text
```

Jika memakai model embedding lain, ubah `OLLAMA_EMBED_MODEL` pada `.env`. Mengganti model setelah dokumen diunggah memerlukan upload ulang dokumen agar seluruh vector memiliki dimensi yang konsisten.

Alur penggunaan:

1. Buka atau buat percakapan.
2. Klik ikon penjepit kertas di kolom pesan.
3. Upload PDF/DOCX/TXT/MD/PNG/JPG/WebP (maks. 10 MB). PDF digital memakai text layer; PDF scan dan gambar dibaca melalui OCR lokal Bahasa Indonesia.
4. Centang maksimal 10 dokumen untuk percakapan tersebut.
5. Tunggu status dokumen `READY`, lalu ajukan pertanyaan. Backend mengambil enam potongan paling relevan dan menginstruksikan sitasi inline `[n]`.

Upload disimpan sementara di storage privat lalu job `DOCUMENT_PROCESS` diklaim worker PostgreSQL dengan retry/backoff dan pemulihan stale lock. Setelah ekstraksi berhasil, sumber sementara dihapus; metadata dokumen, potongan teks, halaman, dan embedding tetap di PostgreSQL. Menghapus dokumen juga menghapus sumber sementara, potongan, dan relasinya.

OCR berjalan di backend menggunakan Tesseract.js dan model Bahasa Indonesia yang dibundel dalam aplikasi, sehingga gambar tidak dikirim ke layanan OCR eksternal. Pemrosesan PDF scan dibatasi oleh `OCR_MAX_PAGES` (default 20 halaman) karena OCR lebih berat daripada ekstraksi PDF digital. Dokumen campuran yang memiliki text layer memadai akan memakai text layer dan tidak menjalankan OCR.

## Ekspor percakapan

Buka percakapan yang sudah memiliki pesan, klik ikon unduh di kanan atas, lalu pilih PDF, Word, atau Excel. File dibuat server-side dari percakapan milik akun yang sedang login. Ekspor dibatasi hingga 500 pesan terbaru per percakapan untuk menjaga penggunaan memori server tetap terkendali.

### File sebagai jawaban AI

Minta format file secara eksplisit, misalnya: `Buatkan surat tugas dalam format DOCX` atau `Buat tabel jadwal inspeksi sebagai XLSX`. Kartu file muncul dengan status antrean. Worker membangkitkan file secara asynchronous ke durable storage; metadata dan checksum disimpan di database. File dapat dikelola dari menu **File Center** dan aksesnya selalu diverifikasi server-side.

## Operasional produksi

- Liveness: `GET /api/health/live`
- Readiness database: `GET /api/health/ready`
- Metrik: `GET /api/metrics` dengan header `Authorization: Bearer <METRICS_TOKEN>`
- Worker: `npm run worker` (wajib berjalan terpisah dari web)
- Seluruh instance web/worker harus memakai `DATABASE_URL` dan `STORAGE_DIR` yang sama; storage harus berupa volume persisten bersama.

Jalankan quality gate sebelum deploy:

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm test
npm run lint
npm run build
```

Gate tambahan tersedia melalui `npm run test:integration` (memerlukan `TEST_DATABASE_URL` terpisah), `npm run test:e2e`, `npm run test:load`, dan `npm run security:audit`. Prosedur UAT, secrets, deployment, rollback, dan incident lengkap berada di [`docs/GO_LIVE_RUNBOOK.md`](docs/GO_LIVE_RUNBOOK.md).

### Backup dan restore

PowerShell scripts tersedia di `scripts/backup.ps1` dan `scripts/restore.ps1`. Backup mencakup PostgreSQL dan direktori storage agar metadata dan file tetap konsisten. Contoh:

```powershell
.\scripts\backup.ps1 -Destination .\backups
.\scripts\restore.ps1 -BackupDirectory .\backups\<timestamp>
```

Uji restore secara berkala di environment terisolasi. Hentikan penulisan aplikasi/worker selama snapshot atau gunakan prosedur snapshot database dan volume yang konsisten.

Drill otomatis ke database terpisah: `./scripts/backup-restore-drill.ps1`. Script menolak apabila source dan target URL sama.

### Observability dan retensi

Simpan token metrik tanpa newline di `secrets/metrics_token` (folder ini tidak boleh di-commit), lalu jalankan `docker compose --profile observability up -d prometheus grafana`. Prometheus tersedia internal di port 9090 dan Grafana di 3001; batasi port tersebut dengan firewall/reverse proxy. Cleanup terjadwal dijalankan melalui `npm run retention`, dengan hari retensi yang dapat diatur memakai `RETENTION_ARTIFACT_DAYS`, `RETENTION_DOCUMENT_DAYS`, `RETENTION_AUDIT_DAYS`, dan `RETENTION_JOB_DAYS`.

## Migrasi database

Pada workstation development dengan PostgreSQL aktif:

```bash
npx prisma migrate deploy
```

Gunakan `prisma migrate dev` hanya saat membuat migration baru di workstation development. Folder `prisma/migrations` wajib di-commit dan production hanya menjalankan `prisma migrate deploy` sebelum web/worker dinaikkan.

## Pemeriksaan konektivitas Ollama

Dari host/container web:

```bash
curl http://10.8.140.75:11434/api/tags
```

Jika gagal, periksa firewall dan konfigurasi bind Ollama (`OLLAMA_HOST`).