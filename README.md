# Photobox Natal Naposo HKBP Lontar

Panduan untuk operator photobox. Tidak perlu bisa memprogram, cukup ikuti langkah-langkahnya.

## Cara kerja singkat

1. Tamu menyentuh layar, memilih bingkai, lalu berfoto (hitung mundur 3-2-1).
2. Foto disusun ke dalam bingkai dan disimpan di laptop ini.
3. Di layar muncul **kode QR**. Tamu memindainya dengan HP untuk melihat dan mendownload fotonya.

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

> ⚠️ **Hanya port 3000 yang boleh di-forward.** Jangan pernah forward port **4000**
> karena port itu adalah ruang kendali operator.

---

## 4. Menempel URL di pengaturan

1. Di layar photobox, tekan **Ctrl + Shift + S** di keyboard laptop.
   Panel **Pengaturan Operator** akan muncul (tamu tidak bisa melihat tombolnya).
2. Pada bagian **URL publik**, tempel alamat dari langkah 3 ke kotak isian, lalu tekan **Simpan**.
3. Pastikan tulisan **Aktif:** sekarang menampilkan alamat tersebut.
4. Tekan **Tutup** atau tombol **Esc**.

Alamat ini tersimpan otomatis. Tapi kalau VS Code memberi alamat baru (misalnya setelah laptop
restart), tempel ulang alamat yang baru.

---

## 5. Mengganti kamera

1. Colokkan kamera baru (misalnya kamera Pubdok).
2. Tekan **Ctrl + Shift + S**.
3. Pada bagian **Kamera**, pilih kamera yang diinginkan dari daftar.
4. Kalau gambar tidak muncul, tekan **Muat Ulang Kamera**.

Pilihan kamera diingat. Kalau kamera pilihan tercabut lalu dicolok lagi, photobox akan
otomatis kembali memakainya.

---

## 6. Tamu terlambat memindai QR

1. Tekan **Ctrl + Shift + S**.
2. Di bagian **Galeri**, sentuh foto tamu tersebut.
3. Kode QR-nya akan tampil lagi. Minta tamu memindainya.

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
   - Jumlah foto per sesi = jumlah `slots`.
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

Semua foto tersimpan di folder **`server/photos`**. Salin folder ini ke flashdisk setelah acara sebagai cadangan.

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
- [ ] Tes satu foto dan pindai QR-nya dengan HP. Fotonya terbuka dan bisa didownload.
- [ ] Notifikasi Windows dimatikan (Focus Assist / Do not disturb) agar tidak muncul di layar.
- [ ] Pencahayaan di area foto cukup terang.

**Setelah acara**
- [ ] Salin folder `server/photos` ke flashdisk/cadangan.
- [ ] Biarkan server dan port tetap menyala beberapa hari jika tamu masih perlu mendownload,
      atau umumkan batas waktu download.
