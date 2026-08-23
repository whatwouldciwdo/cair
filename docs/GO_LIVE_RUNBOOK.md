# Go-Live, UAT, dan Incident Runbook

## Bundle Ubuntu 10.8.140.67
1. Salin repository ke `/opt/pltgu-ai`, lalu `cd /opt/pltgu-ai/deploy`.
2. `cp .env.production.example .env.production`; isi secret unik (`openssl rand -base64 48`) dan `chmod 600 .env.production`.
3. Pastikan Docker Engine + Compose plugin terpasang, port 80 hanya dapat diakses jaringan korporat, dan host dapat menjangkau Ollama `10.8.140.75:11434`.
4. Jalankan `bash deploy-ubuntu.sh`, lalu `BASE_URL=http://10.8.140.67 bash verify-production.sh`.
5. Untuk domain publik/internal DNS, pasang sertifikat TLS organisasi dan ubah Nginx menjadi listener 443 sebelum sign-off; IP HTTP hanya endpoint staging/UAT.
6. Bukti teknis tersimpan di `deploy/evidence/`; jangan menganggapnya sebagai persetujuan UAT bisnis.

## Gate produksi (wajib lulus)

1. Change freeze; backup database dan storage, lalu jalankan drill ke `DRILL_DATABASE_URL` yang benar-benar terpisah.
2. `npm ci`, `npx prisma validate`, `npx prisma generate`, `npm run lint`, `npm run typecheck`, `npm test`, dan `npm run build` harus exit 0.
3. Jalankan integration dengan DB test terpisah: `npm run test:integration`.
4. Jalankan browser gate dengan kredensial khusus UAT: `npm run test:e2e`. Verifikasi manual login, upload, jawaban dengan sitasi, unduh artifact PDF/DOCX/XLSX, File Center, admin, dan isolasi dua unit.
5. Jalankan `npm run test:load`; target default: error 0 dan p99 < 1 detik untuk health endpoints. Uji chat/upload terautentikasi di staging dengan data sintetis dan pantau queue/rate limiter.
6. `npm run security:audit`; high/critical harus ditutup, dimitigasi terdokumentasi, atau deployment ditolak.
7. Prometheus target `up`, alert rule termuat, Grafana datasource sehat, serta alert test diterima kanal on-call.

## Secrets dan akses

- Jangan commit `.env`, dump, storage, atau isi folder `secrets/`. Secret produksi berasal dari Vault/Kubernetes Secret/Docker secret dan dirotasi berkala.
- Gunakan nilai unik minimum 32 byte untuk `AUTH_SECRET` dan `METRICS_TOKEN`; password DB/admin/Grafana unik. File `secrets/metrics_token` harus sama dengan `METRICS_TOKEN` web dan hanya dapat dibaca akun service.
- Batasi PostgreSQL dan Ollama ke network internal. Hanya reverse proxy HTTPS yang mempublikasikan web; aktifkan TLS, HSTS, access log, dan allowlist admin bila tersedia.
- Akun E2E/UAT tidak digunakan di produksi; hapus atau nonaktifkan setelah sign-off.

## Deployment

1. Catat image digest, commit, migrasi, owner, jendela perubahan, dan rollback decision time.
2. Naikkan DB, backup, lalu `prisma migrate deploy` satu kali. Jangan memakai `migrate dev`.
3. Naikkan web, verifikasi `/api/health/live` dan `/api/health/ready`, kemudian worker. Pastikan web/worker memakai DB dan volume storage yang sama.
4. Smoke test `/login`, `/chat`, upload kecil, satu chat, sitasi, artifact, `/admin`, metrik. Pantau error, latency, queue dan resource minimal 30 menit.
5. Jalankan retention terjadwal harian (`npm run retention`) sebagai singleton; backup sebelum perubahan kebijakan retensi.

## UAT dan sign-off

| Area | Acceptance | Pemilik |
|---|---|---|
| Chat/RAG | Jawaban streaming; sitasi membuka sumber yang benar | Knowledge owner |
| Corporate template | PDF/DOCX/XLSX memiliki identitas PLN IP, klasifikasi, nomor, versi, tanggal, footer | Corporate secretary |
| RBAC | User tidak dapat membaca dokumen/conversation/artifact unit lain; admin sesuai mandat | Security owner |
| Operasi | Backup/restore, stale-lock recovery, alert dan retention terbukti | SRE/Infra |

Sign-off harus mencatat tanggal, environment, evidence test, temuan tersisa, approver bisnis, security, dan operasi.

## Incident

1. **Deteksi/triage:** tetapkan severity dan incident commander; simpan waktu, request ID, user/unit terdampak. Jangan menyalin isi dokumen sensitif ke kanal umum.
2. **Containment:** nonaktifkan endpoint/akun/token terdampak, scale worker ke nol untuk poison queue, atau isolasi Ollama/DB. Pertahankan audit log dan bukti.
3. **Recovery:** rollback ke image digest sebelumnya jika aplikasi gagal; migrasi database hanya dipulihkan dari backup terverifikasi setelah persetujuan DBA. Restart worker setelah stale locks pulih dan poison jobs ditinjau.
4. **Validasi:** readiness, smoke flow, queue drain, metrics/alerts, dan pemeriksaan lintas unit.
5. **Komunikasi:** update berkala sesuai severity; untuk dugaan kebocoran data segera libatkan security/legal dan ikuti kebijakan notifikasi korporat.
6. **Post-incident:** RCA tanpa menyalahkan, timeline, impact, corrective actions dengan owner/deadline, lalu uji ulang runbook.

## Rollback triggers

- Readiness gagal >5 menit, error rate signifikan, latensi kritis, migrasi gagal, queue terus tumbuh, kehilangan artifact, atau indikasi bypass RBAC.
- Hentikan rollout; rollback web/worker. Jangan rollback skema secara ad-hoc. Gunakan forward fix atau restore terkontrol dari backup sesuai keputusan DBA/incident commander.