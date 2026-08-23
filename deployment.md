# Deployment CAIR di Ubuntu

Panduan ini digunakan untuk melakukan **clone pertama**, **deployment**, dan **update melalui `git pull`** pada server Ubuntu. Arsitektur produksi menggunakan Docker Compose: Nginx, web Next.js, worker, retention job, PostgreSQL, backup, Prometheus, dan Grafana.

> Target bawaan konfigurasi saat ini adalah `http://10.8.140.67`. Sesuaikan `PUBLIC_HOST` bila alamat server berbeda. Secret produksi tidak boleh disimpan di Git.

## 1. Prasyarat

- Ubuntu 22.04/24.04 LTS x86_64.
- Minimal 4 vCPU, RAM 8 GB, disk 50 GB (sesuaikan dengan dokumen dan model).
- Server dapat mengakses Ollama, bawaan: `http://10.8.140.75:11434`.
- Port TCP `80` dapat diakses oleh pengguna. Batasi SSH/monitoring dengan firewall internal.
- Akun GitHub memiliki akses ke repository bila repository bersifat private.

Pasang Git, curl, Docker Engine, dan plugin Compose:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
docker --version
docker compose version
```

Aktifkan firewall bila UFW digunakan:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
```

## 2. Clone pertama

```bash
sudo mkdir -p /opt/cair
sudo chown "$USER":"$USER" /opt/cair
git clone https://github.com/whatwouldciwdo/cair.git /opt/cair
cd /opt/cair
```

Untuk repository private, gunakan SSH deploy key atau GitHub Personal Access Token; jangan menaruh token di command history atau file repository.

## 3. Buat secret produksi

Salin template khusus deployment:

```bash
cd /opt/cair
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
```

Buat nilai acak:

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -hex 32      # METRICS_TOKEN
openssl rand -hex 32      # AUDIT_IP_SALT bila menjalankan aplikasi di luar Compose
openssl rand -base64 36   # password PostgreSQL/Grafana
```

Edit `deploy/.env.production`:

```bash
nano deploy/.env.production
```

Variable wajib:

| Variable | Keterangan |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER` | Nama database dan user internal Compose. |
| `POSTGRES_PASSWORD` | Minimal 24 karakter, unik untuk produksi. |
| `AUTH_SECRET` | Minimal 32 karakter; jangan dirotasi tanpa rencana invalidasi sesi. |
| `METRICS_TOKEN` | Minimal 32 karakter untuk scrape endpoint metrics. |
| `GRAFANA_ADMIN_PASSWORD` | Password administrator Grafana. |
| `OLLAMA_BASE_URL` | URL Ollama yang dapat dijangkau container. Jangan gunakan `localhost` jika Ollama berada di host lain. |
| `OLLAMA_EMBED_MODEL` | Model embedding, bawaan `nomic-embed-text`. |
| `PUBLIC_HOST` | IP/FQDN server tanpa protokol, misalnya `10.8.140.67`. |
| `BACKUP_RETENTION_DAYS` | Masa simpan dump harian, bawaan 14 hari. |

Validasi agar tidak ada placeholder yang tertinggal:

```bash
grep -nE 'GANTI|change-me|replace-with' deploy/.env.production && echo "PERBAIKI PLACEHOLDER" || echo "OK"
```

## 4. Deployment pertama

Script deployment memvalidasi konfigurasi, build image, menjalankan migration Prisma, menyalakan seluruh service, dan menyimpan bukti readiness.

```bash
cd /opt/cair
chmod +x deploy/deploy-ubuntu.sh deploy/verify-production.sh
./deploy/deploy-ubuntu.sh
```

Verifikasi:

```bash
cd /opt/cair/deploy
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl -fsS http://127.0.0.1/api/health/live
curl -fsS http://127.0.0.1/api/health/ready
./verify-production.sh
```

Akses:

- Aplikasi: `http://10.8.140.67/chat`
- Grafana: `http://10.8.140.67/grafana/`

Login awal memakai admin yang dihasilkan oleh proses seed hanya jika seed memang dijalankan. Untuk produksi, kelola user sesuai prosedur organisasi dan segera ganti password bootstrap. Jangan menjalankan `prisma db seed` berulang tanpa memeriksa dampaknya.

## 5. Update setelah `git pull`

Sebelum update, baca release note/diff dan pastikan backup terbaru tersedia.

```bash
cd /opt/cair
git status --short
git fetch origin
git pull --ff-only origin master
./deploy/deploy-ubuntu.sh
```

`deploy/.env.production`, volume PostgreSQL, volume artifact, dan folder backup tidak akan diganti oleh `git pull`. Migration dijalankan otomatis sebelum web/worker baru aktif.

Pantau setelah update:

```bash
cd /opt/cair/deploy
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 web worker migrate
curl -fsS http://127.0.0.1/api/health/ready
```

## 6. Operasional umum

Melihat log:

```bash
cd /opt/cair/deploy
docker compose --env-file .env.production -f docker-compose.production.yml logs -f --tail=200 web worker nginx
```

Restart service tanpa menghapus data:

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.production.yml restart web worker nginx
```

Stop/start stack:

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.production.yml stop
docker compose --env-file deploy/.env.production -f deploy/docker-compose.production.yml start
```

> Jangan gunakan `docker compose down -v`; opsi `-v` menghapus volume database, artifact, Prometheus, dan Grafana.

Backup otomatis disimpan di `deploy/backups/`. Salin backup secara berkala ke media/server lain dan uji restore ke database terpisah. Detail UAT, monitoring, incident response, rollback, serta backup/restore tersedia di [`docs/GO_LIVE_RUNBOOK.md`](docs/GO_LIVE_RUNBOOK.md).

## 7. Rollback aplikasi

Rollback kode harus tetap mempertimbangkan kompatibilitas schema database. Jangan rollback migration secara manual tanpa backup dan persetujuan DBA.

```bash
cd /opt/cair
git log --oneline -10
git checkout <COMMIT_YANG_SUDAH_DISETUJUI>
./deploy/deploy-ubuntu.sh
```

Untuk kembali mengikuti branch sesudah insiden:

```bash
git switch master
git pull --ff-only origin master
```

Jika readiness gagal, kumpulkan bukti sebelum perubahan lanjutan:

```bash
cd /opt/cair/deploy
docker compose --env-file .env.production -f docker-compose.production.yml ps > evidence/incident-ps.txt
docker compose --env-file .env.production -f docker-compose.production.yml logs --no-color --tail=500 web worker migrate nginx > evidence/incident-logs.txt
```

## 8. Checklist serah terima

- [ ] `deploy/.env.production` mode `600`, berisi secret unik, dan tidak terlacak Git.
- [ ] Ollama/model dapat diakses dari container web dan worker.
- [ ] Seluruh container sehat; migration selesai tanpa error.
- [ ] Endpoint live dan ready mengembalikan HTTP 200.
- [ ] Login, upload, chat, citation, artifact/export, admin, dan RBAC lintas unit lolos UAT.
- [ ] Grafana menerima metrics dan alert rules termuat.
- [ ] Backup harian tersedia dan restore drill ke DB terpisah berhasil.
- [ ] PIC deployment, rollback, database, Ollama, dan incident response telah ditetapkan.