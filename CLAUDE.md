# Photobox Natal Naposo HKBP Lontar

## Konteks
Aplikasi photobox untuk acara Natal Naposo gereja HKBP Lontar, 19 Desember 2026.
Berjalan lokal di satu laptop operator. Tamu berfoto, hasilnya disusun ke template,
lalu tamu scan QR untuk melihat dan download fotonya di HP masing-masing.
Anggaran nol: tidak ada cloud storage, database, atau layanan berbayar.

## Arsitektur
- `web/`: Vue 3 + Vite + JavaScript, Composition API dengan `<script setup>`.
  Semua logika photobox ada di sini: akses kamera, hitung mundur, pengambilan foto,
  penyusunan template di `<canvas>`, dan pembuatan QR (library `qrcode`).
- `server/`: ASP.NET Core minimal API (pakai versi .NET SDK yang terinstal, cek `dotnet --version`).
  Hanya bertugas menyimpan foto ke disk dan menyajikan halaman download.
- Build Vue masuk ke `server/wwwroot` (atur `build.outDir` di vite.config.js).
- Saat development, Vite mem-proxy `/api` ke `http://localhost:4000`.

## Model dua port (WAJIB, ini batas keamanan)
Kestrel mendengarkan di `http://localhost:4000` dan `http://localhost:3000`.
- Port 4000 = ADMIN, hanya diakses dari laptop. Menyajikan aplikasi Vue dan semua `/api/*`.
- Port 3000 = PUBLIK, di-forward ke internet lewat VS Code Ports (Dev Tunnels).
  Hanya boleh mengakses route `/p/{id}`, `/f/{id}`, dan `/d/{id}`.
- Penjagaan dilakukan di middleware berdasarkan `HttpContext.Connection.LocalPort`.
  Request lewat port 3000 ke path lain wajib mendapat 404, termasuk file statis Vue.
- Jangan pernah mengandalkan header Host untuk penjagaan ini.

## Kontrak API (jangan diubah tanpa persetujuan)
Admin (port 4000):
- `POST /api/photos`: body berupa JPEG mentah, `Content-Type: image/jpeg`.
  Respons: `{ "id": string, "url": string | null }`. `url` bernilai null jika URL publik belum diatur.
- `GET /api/config`: `{ "publicBaseUrl": string | null }`
- `PUT /api/config`: body `{ "publicBaseUrl": string | null }`, bisa diubah saat runtime tanpa restart.
- `GET /api/photos`: daftar foto terbaru (id, waktu dibuat), untuk galeri operator.

Publik (port 3000):
- `GET /p/{id}`: halaman HTML mobile-friendly berisi foto, tombol "Download Foto",
  dan petunjuk untuk iPhone (tekan lama lalu Simpan ke Foto).
- `GET /f/{id}`: file JPEG inline.
- `GET /d/{id}`: file JPEG sebagai attachment, nama file `natal-naposo-{id}.jpg`.

## Aturan data
- ID foto: 16 karakter hex huruf kecil dari `RandomNumberGenerator`. Validasi dengan regex `^[a-f0-9]{16}$`
  di SETIAP route yang menerima id, sebelum menyentuh file system.
- Foto disimpan di `server/photos/{id}.jpg`. Folder dibuat otomatis jika belum ada.
- Tidak ada halaman publik yang menampilkan daftar foto.

## Format template
Template ada di `web/public/templates/`. Setiap template terdiri dari PNG frame dengan
lubang transparan dan file JSON:
```json
{ "id": "natal-2x3", "name": "Natal Naposo 2x3", "frame": "/templates/natal-2x3.png",
  "width": 1200, "height": 1800,
  "slots": [{ "x": 40, "y": 80, "w": 540, "h": 400 }] }
```
Daftar template dibaca dari `web/public/templates/index.json` (array berisi path file JSON).
Jumlah foto per sesi = jumlah `slots`. Foto digambar dengan crop tengah (object-fit: cover),
lalu PNG frame digambar di atasnya. Hasil akhir berupa JPEG kualitas 0.92.

## Kamera
- Pakai `navigator.mediaDevices.getUserMedia`, minta resolusi ideal 1920x1080.
- Sediakan pemilih kamera dari `enumerateDevices()`, dan simpan pilihan di localStorage.
  Sekarang dites dengan webcam laptop; nanti diganti kamera Pubdok yang dipasang sebagai webcam.
- Preview di-mirror dengan CSS `scaleX(-1)`. Foto hasil TIDAK di-mirror.

## Konvensi UI
- Semua teks yang terlihat tamu dalam Bahasa Indonesia.
- Ramah layar sentuh: tombol besar, minim teks, terbaca dari jarak 1–2 meter.
- Dipakai dalam mode kiosk fullscreen (`chrome --kiosk http://localhost:4000`).
- Tema Natal: merah, putih, hijau tua, emas. Tetap bersih dan tidak ramai.

## Jangan lakukan
- Jangan tambahkan upload cloud, database, autentikasi, atau Docker.
- Jangan tambahkan dependency baru tanpa menjelaskan alasannya terlebih dahulu.
- Jangan pakai UI framework berat (Vuetify, dsb.); cukup CSS biasa atau scoped CSS.
- Jangan ubah kontrak API dan model dua port di atas.

## Perintah
- Dev: `cd server && dotnet run`, lalu `cd web && npm run dev`, buka http://localhost:5173
- Build: `cd web && npm run build`, lalu `cd server && dotnet publish -c Release -o ../publish`