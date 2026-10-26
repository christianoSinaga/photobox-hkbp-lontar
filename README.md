# Photobox Natal Remaja Naposo HKBP Lontar 2026

Panduan untuk operator photobox. Tidak perlu bisa memprogram, cukup ikuti langkah-langkahnya.

## Cara kerja singkat

1. Tamu melihat pilihan bingkai di layar awal, lalu menekan **Mulai Foto**.
2. Muncul petunjuk bersiap selama 15 detik (bisa dilewati dengan tombol **Saya Siap!**).
3. Diambil **8 foto**, masing-masing dengan hitungan mundur 5 detik.
4. Tamu mengedit: memilih bingkai, memilih foto untuk tiap kotak, menggeser posisi foto, dan memilih filter.
   Setelah 2 menit tanpa sentuhan, hasil disimpan otomatis.
5. Foto berbingkai dan ke-8 foto asli disimpan di laptop ini.
6. Di layar muncul **kode QR**. Tamu memindainya dengan HP untuk mendownload foto berbingkai
   dan semua foto aslinya.

Supaya HP tamu bisa membuka foto dari laptop ini, kita memakai fitur **Ports** di VS Code
yang membuat alamat internet sementara. Karena itu **laptop harus tersambung ke internet**
dan **VS Code harus tetap terbuka** selama acara.

---

## 1. Persiapan (cukup sekali)

Pastikan program berikut sudah terpasang di laptop:

- **Google Chrome**
- **Visual Studio Code** dan sudah **login dengan akun GitHub** (ikon orang di pojok kiri bawah VS Code)
- **.NET SDK** dan **Node.js** (biasanya sudah dipasang oleh tim teknis)

Lalu buat versi siap pakai aplikasinya:

1. Buka folder proyek ini di File Explorer.
2. Klik kanan **`build.ps1`** → **Run with PowerShell**.
3. Tunggu sampai muncul tulisan hijau **"Build selesai"**, lalu tekan Enter.

Ulangi langkah ini setiap kali ada perubahan aplikasi atau template baru.

> Jika muncul pertanyaan tentang *Execution Policy*, jawab **Y** (Yes).

---

## 2. Menyalakan photobox (hari-H)

Ikuti urutannya:

1. Colokkan charger laptop dan kamera.
2. Buka **VS Code**, lalu buka folder proyek ini (**File → Open Folder**).
3. Klik kanan **`start.ps1`** → **Run with PowerShell**.
   - Sebuah jendela biru (PowerShell) akan terbuka. **Ini adalah server, jangan ditutup selama acara.**
   - Chrome akan terbuka layar penuh (mode kiosk) dan menampilkan layar sambutan photobox.
4. Lakukan **forward port 3000** (bagian 3) dan **tempel URL-nya ke pengaturan** (bagian 4).
5. Coba berfoto sekali dan pindai QR-nya dengan HP (lihat checklist di bawah).

---

## 3. Forward port 3000 dan ubah ke Public

Langkah ini dilakukan di **VS Code**:

1. Buka tab **Ports**. Jika tidak terlihat: menu **View → Open View… → ketik "Ports"**.
   (Biasanya ada di panel bawah, di sebelah tab *Terminal*.)
2. Klik **Forward a Port**, ketik **`3000`**, tekan Enter.
3. Pada baris port 3000, **klik kanan → Port Visibility → Public**.
   Kolom *Visibility* harus bertuliskan **Public**. Kalau masih *Private*, HP tamu tidak bisa membuka foto.
4. Pada kolom **Forwarded Address**, klik kanan → **Copy Local Address** (atau klik ikon salin).
   Alamatnya mirip seperti `https://abcd1234-3000.asse.devtunnels.ms`.

> ⚠️ **Port 3000 = Public (untuk tamu). Port 4000 = ruang kendali operator.**
> Port 4000 hanya boleh di-forward sebagai **Private** (lihat bagian 3a), **tidak pernah Public**.
> Kalau port 4000 Public, siapa pun yang tahu alamatnya bisa melihat semua foto tamu dan mengganti link QR.

---

## 3a. Memakai tablet sebagai layar photobox (opsional)

Kalau photobox dijalankan di tablet (bukan di laptop), laptop tetap menjadi server.

**Di laptop (VS Code):**
1. Di tab **Ports**, klik **Forward a Port**, ketik **`4000`**, tekan Enter.
2. Pastikan kolom *Visibility* untuk port 4000 bertuliskan **Private**. Jangan diubah ke Public.
3. Salin alamat port 4000, misalnya `https://abcd1234-4000.asse.devtunnels.ms`.
   Kirim alamat ini ke tablet, misalnya lewat chat ke diri sendiri.

**Di tablet:**
1. Buka alamat port 4000 di **Chrome** (Android) atau **Safari** (iPad).
2. Akan muncul halaman login. Masuk dengan **akun GitHub yang sama** dengan yang dipakai di VS Code.
3. Izinkan akses kamera saat diminta.
4. Supaya tampil layar penuh tanpa address bar, pakai menu browser **Tambahkan ke Layar Utama**
   (*Add to Home Screen*), lalu buka photobox dari ikon tersebut.
   Selain itu, aplikasi juga otomatis masuk layar penuh saat tamu menekan **Mulai Foto**.
5. Di pengaturan tablet, atur layar **tidak pernah mati** dan matikan rotasi otomatis bila perlu.
   (Aplikasi juga berusaha menjaga layar tetap menyala, tapi tidak semua tablet mendukung.)

**Kamera di tablet:** aplikasi hanya bisa memakai kamera yang terbaca oleh browser tablet.
Kamera DSLR harus mendukung mode **webcam USB (UVC)** dan tablet harus bisa membacanya.
**Wajib dites sebelum hari-H.** Kalau DSLR tidak muncul di pilihan kamera, pakai kamera bawaan tablet,
atau jalankan photobox di laptop seperti biasa.

**Internet:** semua foto dikirim dari tablet ke laptop lewat internet (sekitar 3–6 MB per tamu).
Pastikan sinyal di lokasi cukup kuat.

---

## 3b. Domain tetap untuk QR lewat GitHub Pages (disarankan)

Alamat tunnel VS Code bisa berubah, misalnya setelah laptop restart. Kalau QR langsung memakai alamat
tunnel, QR yang sudah dipindai tamu bisa mati. Dengan GitHub Pages, QR memakai alamat tetap
`https://NAMA.github.io/photobox/...`, dan halaman itu meneruskan tamu ke tunnel laptop.
Foto tetap tersimpan di laptop, bukan di GitHub.

**Persiapan (sekali saja):**
1. Login ke **github.com**, klik **+** di kanan atas → **New repository**.
2. Isi *Repository name* dengan **`photobox`**, pilih **Public**, lalu klik **Create repository**.
3. Klik **uploading an existing file**, lalu seret ketiga file dari folder **`pages/`** di proyek ini:
   `index.html`, `404.html`, dan `config.json`. Klik **Commit changes**.
4. Buka **Settings → Pages**. Pada *Branch*, pilih **main** dan folder **/ (root)**, lalu **Save**.
5. Tunggu 1–2 menit. Alamatnya akan muncul: `https://NAMA.github.io/photobox/`
   (NAMA = username GitHub kamu).

**Setiap kali photobox dinyalakan:**
1. Forward port **3000** dengan visibility **Public** (bagian 3), lalu salin alamatnya.
2. Di github.com, buka repo **photobox** → file **`config.json`** → ikon pensil (**Edit**).
   Ganti isinya menjadi alamat tunnel port 3000, misalnya:
   ```json
   { "tunnelUrl": "https://abcd1234-3000.asse.devtunnels.ms" }
   ```
   Klik **Commit changes**. Perubahan aktif dalam beberapa menit.
3. Di **Pengaturan Operator**, isi **URL publik** dengan `https://NAMA.github.io/photobox`
   (cukup sekali, karena alamat ini tidak pernah berubah).

**Tes:** buka `https://NAMA.github.io/photobox/s/0000000000000000` di HP. Kalau server menyala,
kamu akan diteruskan ke tunnel dan melihat halaman "tidak ditemukan" dari photobox. Itu tanda pengalihan berjalan.

> Kalau alamat tunnel berubah di tengah acara, cukup ubah `config.json` lagi.
> QR yang sudah dipindai tamu tetap berfungsi.

---

## 4. Menempel URL di pengaturan

1. Buka **Pengaturan Operator**:
   - di laptop: tekan **Ctrl + Shift + S**;
   - di tablet: **tahan tulisan judul** di layar awal selama **3 detik**.

   Tamu tidak bisa melihat tombolnya.
2. Pada bagian **URL publik**, tempel alamat dari langkah 3 ke kotak isian, lalu tekan **Simpan**.
3. Pastikan tulisan **Aktif:** sekarang menampilkan alamat tersebut.
4. Tekan **Tutup** atau tombol **Esc**.

Alamat ini tersimpan otomatis. Tapi kalau VS Code memberi alamat baru (misalnya setelah laptop
restart), tempel ulang alamat yang baru.

---

## 5. Mengganti kamera

1. Colokkan kamera baru (misalnya kamera Pubdok).
2. Buka **Pengaturan Operator** (Ctrl + Shift + S, atau tahan judul 3 detik di tablet).
3. Pada bagian **Kamera**, pilih kamera yang diinginkan dari daftar.
4. Kalau gambar tidak muncul, tekan **Muat Ulang Kamera**.

Pilihan kamera diingat. Kalau kamera pilihan tercabut lalu dicolok lagi, photobox akan
otomatis kembali memakainya.

---

## 6. Tamu terlambat memindai QR

1. Buka **Pengaturan Operator** (Ctrl + Shift + S, atau tahan judul 3 detik di tablet).
2. Di bagian **Galeri sesi**, sentuh foto tamu tersebut (urutan terbaru di atas).
3. Kode QR sesinya akan tampil lagi. Minta tamu memindainya.

---

## 7. Menambah template (bingkai) baru

Setiap template terdiri dari **dua file** di folder `web/public/templates/`:

1. **Gambar bingkai PNG.** Bagian tempat foto harus **transparan (bolong)**.
   Ukuran gambar harus sama persis dengan `width` × `height` di file JSON.
2. **File JSON**, contohnya `natal-baru.json`:

   ```json
   {
     "id": "natal-baru",
     "name": "Natal Naposo Baru",
     "frame": "/templates/natal-baru.png",
     "width": 1200,
     "height": 1800,
     "slots": [
       { "x": 40, "y": 80, "w": 540, "h": 400 },
       { "x": 620, "y": 80, "w": 540, "h": 400 }
     ]
   }
   ```

   - `slots` adalah daftar lubang foto. `x`, `y` = posisi pojok kiri atas, `w`, `h` = lebar dan tinggi (dalam piksel).
   - Jumlah `slots` maksimal 8, karena satu sesi mengambil 8 foto.
   - Minta tim desain mencatat koordinat lubang-lubang ini.

Lalu:

3. Tambahkan nama file JSON ke `web/public/templates/index.json`, contoh:
   ```json
   ["/templates/natal-2x3.json", "/templates/natal-strip-4.json", "/templates/natal-baru.json"]
   ```
4. **Cek koordinatnya** (butuh bantuan tim teknis): jalankan mode development
   (`cd web` lalu `npm run dev`), buka `http://localhost:5173/template-preview.html`.
   Kotak berwarna harus pas dengan lubang bingkai, dan halaman itu harus menampilkan
   "✓ Semua pengecekan lolos".
5. Jalankan ulang **`build.ps1`**, lalu **`start.ps1`**.

---

## 8. Keluar dari mode kiosk

- Tekan **Alt + F4** untuk menutup Chrome mode kiosk.
- Server tetap menyala di jendela PowerShell. Untuk membuka photobox lagi, jalankan **`start.ps1`**
  sekali lagi. Skrip akan mendeteksi server yang sudah menyala dan hanya membuka Chrome.

**Mematikan photobox sepenuhnya** (setelah acara):

1. Tekan **Alt + F4** untuk menutup Chrome.
2. Di jendela PowerShell server, tekan **Ctrl + C** atau tutup jendelanya.

---

## 9. Kalau ada masalah

| Masalah | Solusi |
|---|---|
| Layar menampilkan "Kamera tidak terdeteksi" | Periksa kabel kamera, lalu sentuh **Coba Lagi**. Cek pilihan kamera di Ctrl+Shift+S. |
| "Kamera sedang dipakai aplikasi lain" | Tutup Zoom, Teams, OBS, atau aplikasi kamera lain, lalu **Coba Lagi**. |
| "Izin kamera ditolak" | Tutup Chrome (Alt+F4) dan jalankan ulang `start.ps1`. |
| Ada pita merah "Server belum tersambung" | Jendela PowerShell server tertutup. Jalankan ulang `start.ps1`. |
| "Foto gagal disimpan" | Pastikan server menyala, lalu sentuh **Coba Lagi**. Foto tidak hilang selama tombol Coba Lagi masih ada. |
| Layar hasil bertuliskan "Link download belum tersedia" | URL publik belum diatur (bagian 3 dan 4). Fotonya sudah aman. Tampilkan ulang QR lewat galeri (bagian 6). |
| HP tamu tidak bisa membuka link | Periksa port 3000 masih **Public** di VS Code, VS Code masih terbuka, dan internet laptop menyala. |
| HP tamu menampilkan halaman peringatan "developer tunnel" | Itu normal dari VS Code. Minta tamu menekan **Continue**. |
| Aplikasi menampilkan "Terjadi kesalahan" | Sentuh **Muat Ulang**. |

Semua foto tersimpan di folder **`server/photos`**, dan data pengelompokan per tamu ada di
**`server/sessions`**. Salin kedua folder ini ke flashdisk setelah acara sebagai cadangan.

---

## ✅ Checklist sebelum acara

**H-1 (sehari sebelumnya)**
- [ ] `build.ps1` sudah dijalankan dan berhasil.
- [ ] Kamera yang akan dipakai sudah dicoba dan dipilih lewat Ctrl+Shift+S.
- [ ] Template bingkai yang dipakai sudah benar dan terlihat bagus di hasil foto.
- [ ] Sudah tes lengkap: foto → scan QR dengan **HP Android dan iPhone** → foto bisa didownload.

**Hari-H, sebelum tamu datang**
- [ ] Charger laptop tercolok. Mode *sleep* laptop dimatikan
      (Settings → System → Power → Screen and sleep → **Never**).
- [ ] Laptop tersambung ke internet (Wi-Fi gereja atau hotspot).
- [ ] VS Code terbuka dan login GitHub.
- [ ] `start.ps1` sudah dijalankan. Jendela PowerShell server terbuka dan tidak ditutup.
- [ ] Port 3000 sudah di-forward dan **Public**.
- [ ] URL publik sudah ditempel di Ctrl+Shift+S, dan tulisan **Aktif** menampilkan alamat yang benar.
- [ ] Jika memakai GitHub Pages: `config.json` di GitHub sudah berisi alamat tunnel port 3000 **hari ini**,
      dan link tes `https://NAMA.github.io/photobox/s/0000000000000000` meneruskan ke photobox.
- [ ] Jika memakai tablet: port 4000 di-forward sebagai **Private** (bukan Public), tablet sudah login GitHub,
      kamera DSLR terbaca di pilihan kamera, dan layar tablet diatur tidak pernah mati.
- [ ] Tes satu foto dan pindai QR-nya dengan HP. Fotonya terbuka dan bisa didownload.
- [ ] Notifikasi Windows dimatikan (Focus Assist / Do not disturb) agar tidak muncul di layar.
- [ ] Pencahayaan di area foto cukup terang.

**Setelah acara**
- [ ] Salin folder `server/photos` dan `server/sessions` ke flashdisk/cadangan.
- [ ] Biarkan server dan port tetap menyala beberapa hari jika tamu masih perlu mendownload,
      atau umumkan batas waktu download.
