# Kertajaya Piala — ERP Piala & Akrilik

Sistem ERP untuk usaha piala rakitan, akrilik custom, barang jadi, dan jasa grafir.
Berjalan sebagai web app statis (bisa di-hosting gratis di GitHub Pages) dengan database Supabase.
Dibuka di Chrome Android akan menawarkan diri untuk dipasang sebagai aplikasi (PWA).

---

## Bagian 1 — Siapkan database (sekali saja, ±10 menit)

### 1.1 Jalankan schema

1. Buka project Supabase Anda → menu **SQL Editor** → **New query**.
2. Buka file `supabase/schema.sql` di repo ini, salin **seluruh isinya**, tempel ke editor.
3. Tekan **Run**. Proses ±20 detik. Beberapa pesan `NOTICE ... does not exist, skipping` itu normal.

File ini aman dijalankan berulang kali — kalau nanti ada pembaruan, jalankan lagi saja.

> **Begitu Run selesai, sistem sudah berisi data contoh.** Panel hasil akan menampilkan
> pesan `Masuk dengan owner@kertajayapiala.demo / Demo#2026`. Anda bisa langsung login
> tanpa membuat akun apa pun dulu. Kalau ingin memakai akun sendiri, ikuti langkah 1.3.

### 1.2 Buat bucket penyimpanan bukti

Schema sudah otomatis membuat bucket bernama `erp-files`. Cek di menu **Storage** apakah sudah ada.
Kalau belum: **New bucket** → nama `erp-files` → biarkan **Private** → Create.

Bucket ini menyimpan bukti transfer, foto packing, foto unboxing retur, foto scrap, dan mockup desain.
Kebijakan aksesnya sengaja hanya mengizinkan *unggah* dan *lihat* — tidak ada yang bisa mengubah atau
menghapus bukti yang sudah masuk, termasuk Owner.

### 1.3 Buat akun pertama (Owner)

1. Menu **Authentication** → **Users** → **Add user** → **Create new user**.
2. Isi email & password Anda. Centang **Auto Confirm User** supaya bisa langsung login.
3. Kembali ke **SQL Editor**, jalankan (ganti emailnya):

```sql
insert into user_roles(user_id, role)
select id, 'owner' from auth.users where email = 'email-anda@contoh.com';
```

Owner punya akses ke semua modul dan semua cabang.

### 1.4 Atur alamat aplikasi

Menu **Authentication** → **URL Configuration**:

- **Site URL**: alamat aplikasi Anda, misal `https://namauser.github.io/kertajaya-piala/`
- **Redirect URLs**: tambahkan alamat yang sama.

Ini diperlukan agar tautan "lupa kata sandi" kembali ke aplikasi dengan benar.
Untuk uji coba lokal, tambahkan juga `http://localhost:8000/`.


---

## Bagian 1B — Data contoh

Data contoh **dipasang otomatis** saat `schema.sql` dijalankan pertama kali di database kosong.
Jadi begitu aplikasi dibuka, semua menu sudah ada isinya dan bisa langsung dijelajahi.

Setelah login, muncul bilah kuning di atas layar sebagai pengingat bahwa ini data contoh,
lengkap dengan tautan untuk mengelolanya. Bilah itu bisa disembunyikan.

Yang dibuat:

- **3 cabang**: Gudang Pusat Kertajaya, Cabang Kertajaya, Cabang Rungkut — lengkap dengan lokasi utama, karantina, scrap, dan sisa bahan
- **21 akun login**, satu untuk tiap jabatan, semua berkata sandi **`Demo#2026`**
- Produk lengkap: komponen, akrilik lembaran, barang jadi, piala rakitan dengan BOM, dan jasa
- Transaksi 45 hari terakhir: pembelian + penerimaan, transfer antar cabang (termasuk satu yang selisih),
  puluhan transaksi kasir, pesanan custom dari desain sampai kirim, pesanan marketplace, retur, settlement,
  cycle count, biaya operasional
- Absensi sebulan, kasbon berjalan, pembebanan kerugian, dan satu periode gaji yang sudah dibayar
- Tiga pengumuman internal

Akun contoh (semua `@kertajayapiala.demo`):

| Email | Jabatan | Yang menarik dicoba |
|---|---|---|
| `owner@` | Owner | Semua menu, dashboard laba, matriks hak akses |
| `area@` | Manajer Operasional Wilayah | Kotak approval: PO, selisih opname, berita acara transfer |
| `kasir1@` | Kasir | Kasir dengan sesi kas terbuka + satu transaksi tertahan karena diskon |
| `kepalacabang1@` | Kepala Cabang | Menyetujui diskon kasir, tutup kas, absensi cabang |
| `produksi@` / `operator1@` | Kepala Produksi / Operator | Papan produksi, ambil bahan, scrap, sisa akrilik |
| `qc@` | QC & Retur | Antrean QC dan barang retur di karantina |
| `logistik@` | Logistik | Packing dengan scan + foto, klaim ekspedisi |
| `cs@` | Admin Online & CS | Pesanan chat, import marketplace, retur |
| `keuangan@` / `verifikator@` | Keuangan | Verifikasi pembayaran, rekonsiliasi, settlement |
| `hrd@` | Manajer SDM | Penggajian, skema gaji, pembebanan kerugian |
| `pembelian@` / `admingudang@` | Pembelian / Gudang | PO dan penerimaan barang (perhatikan keduanya tidak boleh orang yang sama) |

Selebihnya: `gudang@`, `desain@`, `operator2@`, `kepalacabang2@`, `kasir2@`, `akuntansi@`, `absensi@`.

### Menghapus dan memasang ulang

Keduanya ada di satu tempat: **Master data → Pengaturan → bagian Data contoh** (paling bawah).

- **Hapus semua data contoh** — ketik `HAPUS DATA CONTOH` sebagai konfirmasi. Mengosongkan seluruh
  transaksi, produk, pelanggan, cabang, karyawan, dan akun demo. Master jabatan, channel penjualan,
  dan bagan akun tetap ada. **Lakukan ini sebelum mulai memakai sistem untuk data sungguhan.**
- **Pasang data contoh** — tombol ini muncul di tempat yang sama setelah data contoh dihapus,
  kalau sewaktu-waktu ingin berlatih lagi.

> Data contoh hanya bisa dipasang saat belum ada transaksi sungguhan, jadi tidak mungkin tercampur
> dengan data asli Anda.

---

## Bagian 2 — Hosting di GitHub Pages

1. Buat repository baru di GitHub (boleh public atau private + Pages berbayar).
2. Unggah **semua isi folder ini** ke root repository (`index.html` harus ada di paling atas, bukan di dalam subfolder).
3. Buka **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main`, folder: `/ (root)` → Save.
4. Tunggu 1–2 menit, aplikasi bisa dibuka di `https://namauser.github.io/nama-repo/`.

File `.nojekyll` sudah disertakan supaya GitHub tidak memproses ulang isi folder.

### Menjalankan di komputer sendiri (untuk mencoba)

```bash
cd folder-ini
python3 -m http.server 8000
```

Lalu buka `http://localhost:8000`. Tidak ada proses build — semuanya file biasa.

---

## Bagian 3 — Urutan pengisian data awal

Login sebagai Owner, lalu isi berurutan:

| Urutan | Menu | Yang diisi |
|---|---|---|
| 1 | Master data → Cabang & lokasi | Gudang pusat dan tiap cabang. Lokasi stok (utama, karantina, scrap, sisa bahan) dibuat otomatis. |
| 2 | Master data → Rekening perusahaan | Semua rekening resmi. Pembayaran pelanggan hanya boleh ke rekening di daftar ini. |
| 3 | Master data → Channel penjualan | 13 channel sudah terisi. Sesuaikan persentase biaya admin tiap marketplace. |
| 4 | Master data → Supplier | Pemasok komponen, akrilik, dan bahan. |
| 5 | Master data → Produk & SKU | Komponen dulu (tatakan, tiang, figur, plat), lalu bahan baku, barang jadi, dan produk rakitan. |
| 6 | Master data → BOM / resep | Resep tiap piala rakitan: komponen apa saja per unit, plus perkiraan waste akrilik. |
| 7 | Master data → Pengguna & akses | Beri jabatan & cabang untuk tiap karyawan (buat akunnya dulu di Supabase Authentication). |
| 8 | Master data → Pengaturan | Ambang approval, DP minimum, batas peringatan. |
| 9 | SDM → Skema gaji, lalu Karyawan | Buat skema (bulanan, harian, borongan, komisi), lalu daftarkan karyawan dan hubungkan ke akun loginnya. |
| 10 | Pembelian → Purchase order | Masukkan stok awal lewat PO + penerimaan barang, supaya HPP terbentuk benar. |

> **Stok awal sebaiknya lewat PO**, bukan lewat penyesuaian. Dengan begitu harga beli tercatat dan
> HPP rata-rata punya dasar yang benar sejak hari pertama.

---

## Bagian 4 — Cara kerja pengamanan

Sistem ini dirancang supaya kecurangan butuh kerja sama beberapa orang sekaligus, bukan satu orang.

**Tidak ada barang keluar tanpa dokumen.** Stok hanya berubah lewat penerimaan barang, penjualan,
transfer, produksi, opname, atau penyesuaian yang disetujui. Aplikasi bahkan tidak punya izin menulis
langsung ke tabel stok — semua lewat fungsi database yang memeriksa aturan.

**Pemisahan tugas.** Pembuat PO tidak bisa menerima barangnya. Operator tidak bisa mem-QC hasil kerjanya
sendiri. Penginput pembayaran tidak bisa memverifikasinya. Kasir tidak bisa menyetujui selisih kasnya.
Rangkap jabatan yang berbahaya ditolak saat pemberian jabatan.

**Tidak ada penghapusan.** Transaksi salah dibatalkan lewat void yang butuh persetujuan, dan dicatat
sebagai jurnal pembalik. Baris lama tetap ada. Audit log tidak bisa dihapus siapa pun.

**Bukti wajib.** Transfer non-tunai butuh bukti, packing butuh foto isi paket, retur butuh video/foto
unboxing, scrap butuh foto dan nama operator, biaya butuh nota.

**Rekonsiliasi tiga arah.** Faktur supplier dicocokkan dengan PO dan barang yang benar-benar diterima.
Pembayaran dicocokkan dengan mutasi bank. Pencairan marketplace dicocokkan dengan pesanan terkirim.

**Setiap selisih punya nama.** Selisih transfer, selisih kas, dan disposisi retur wajib mencantumkan
penanggung jawab — bukan sekadar "hilang".


---

## Bagian 4B — SDM & penggajian

Gaji tidak diketik dari nol; ia dirakit dari data yang sudah ada di sistem.

| Komponen | Diambil dari |
|---|---|
| Tunjangan transport & uang makan | Jumlah hari hadir di menu Absensi |
| Uang lembur | Jam lembur yang dicatat di absensi |
| Upah borongan | Unit yang **lulus QC** pada periode itu, bukan yang sekadar dikerjakan |
| Komisi penjualan | **Laba** pesanan yang ia buat, bukan omzet |
| Potongan ketidakhadiran | Hari alpa, dihitung dari gaji pokok dibagi hari kerja |
| Cicilan kasbon | Kasbon yang sudah disetujui dan dicairkan |
| Potongan tanggung jawab | Selisih kas, scrap, retur, atau selisih transfer yang sudah ditetapkan penanggung jawabnya |

Dua pilihan desain yang perlu diketahui:

**Komisi dihitung dari laba, bukan omzet.** Artinya obral diskon besar menurunkan komisi si penjual
sendiri. Kepentingan penjual jadi searah dengan kepentingan toko tanpa perlu diawasi terus-menerus.

**Potongan dibatasi 50% dari gaji bruto** (bisa diubah di Pengaturan). Kalau kasbon dan pembebanan
melebihi batas, kelebihannya **ditunda ke bulan berikutnya**, bukan dihanguskan — karyawan tetap
membawa pulang gaji yang layak, dan perusahaan tetap tidak kehilangan haknya.

Pemisahan tugas tetap berlaku: SDM menyusun daftar gaji, atasan menyetujui, keuangan mencairkan —
tiga orang berbeda. Jabatan Manajer SDM bahkan tidak boleh dirangkap dengan Manajer Keuangan.

Setiap karyawan bisa membuka **Slip gaji saya** untuk melihat rinciannya sendiri, termasuk alasan
tertulis di balik setiap potongan.

---

## Bagian 4C — Pengumuman & notifikasi

**Lonceng** di kanan atas menggabungkan tiga hal: tugas yang menunggu keputusan Anda, pengumuman
yang belum dibaca, dan peringatan operasional. Angka merahnya menyesuaikan jabatan — kasir tidak
melihat antrean approval PO.

**Pengumuman** (menu Komunikasi) bisa ditujukan ke jabatan atau cabang tertentu, disematkan supaya
selalu tampil, dan diberi tanda "wajib konfirmasi dibaca". Pembuatnya bisa melihat siapa saja yang
sudah membaca dan mengkonfirmasi — berguna untuk perubahan aturan atau harga.

**Perkenalan menu** muncul otomatis saat seseorang login pertama kali. Layar digelapkan dan menu
yang sedang dibahas **disorot langsung di sidebar**, dengan kotak penjelasan berpanah yang menunjuk
ke sana. Isinya menjelaskan apa gunanya menu itu, apa isinya, dan bagaimana pekerjaan jabatan lain
menyambung ke situ.

Langkahnya menyesuaikan jabatan — kasir tidak diperkenalkan pada menu penggajian. Bisa dilewati
satu per satu (Lanjut), sekaligus (Lewati semua), atau ditutup dengan Esc. Panah kiri/kanan di
keyboard juga berfungsi. Untuk membukanya lagi: menu akun di kanan atas → **Ulangi perkenalan**.

---

## Bagian 5 — Alur harian singkat

**Kasir**: buka kas (hitung modal laci) → jualan → tutup kas (hitung fisik dulu, baru isi) → setor ke bank + unggah bukti.

**Pesanan custom**: buat pesanan → konfirmasi → unggah mockup → catat ACC pelanggan (dengan bukti chat)
→ DP masuk & diverifikasi keuangan → produksi jalan → QC → packing + foto → kirim.

**Barang masuk**: PO → (approval bila besar) → barang datang, dihitung penerima → faktur supplier dicatat
→ sistem cocokkan tiga arah → bayar.

**Retur**: dicatat saat pelanggan mengajukan (bukan saat barang datang) → barang sampai, direkam unboxing
→ masuk karantina → disposisi (perbaiki / jual diskon / hapus buku) dengan penanggung jawab biaya.

**Gaji bulanan**: absensi diisi tiap hari → akhir bulan SDM membuat periode gaji → sistem menarik
absensi, lembur, unit lulus QC, komisi, kasbon, dan pembebanan → diajukan → atasan menyetujui →
keuangan mencairkan dan mengunggah bukti.

---

## Bagian 6 — Isi folder

```
index.html                  halaman utama
manifest.webmanifest        agar bisa dipasang sebagai aplikasi
sw.js                       service worker (cache kerangka; data tidak pernah di-cache)
assets/css/app.css          seluruh tampilan
assets/js/config.js         alamat & kunci Supabase
assets/js/core.js           koneksi, komponen UI, router
assets/js/app.js            login, menu, kerangka aplikasi
assets/js/pages/            satu berkas per kelompok halaman
                            (termasuk hr.js, announce.js, tour.js)
supabase/schema.sql         seluruh database (jalankan di SQL Editor)
supabase/parts/             sumber schema, terpisah per bagian (01 inti … 12 data contoh)
```

---

## Pertanyaan yang sering muncul

**Kunci Supabase terlihat di kode, apakah aman?**
Ya. Kunci publishable memang dirancang untuk dipasang di aplikasi web. Yang menjaga data adalah Row Level
Security dan fungsi database: pengguna hanya bisa melihat cabangnya sendiri, dan semua penulisan harus
lewat fungsi yang memeriksa jabatan serta pemisahan tugas.

**Karyawan baru tidak bisa login.**
Akun dibuat di Supabase → Authentication → Users. Setelah itu beri jabatan dan cabang lewat menu
Pengguna & akses. Tanpa jabatan, aplikasi akan menampilkan pesan "menunggu jabatan".

**Ada yang salah input kemarin, hapus saja bisa?**
Tidak bisa, dan memang disengaja. Gunakan void (butuh persetujuan) atau penyesuaian dengan alasan.
Riwayatnya tetap ada supaya bisa ditelusuri.

**HPP produk kok tidak sesuai?**
HPP dihitung rata-rata bergerak dari pembelian yang benar-benar masuk. Untuk produk rakitan, buka
Master data → BOM lalu tekan "Hitung ulang HPP semua" setelah resep atau harga komponen berubah.

**Aplikasi tidak menawarkan "pasang ke layar utama".**
Buka lewat Chrome Android dengan alamat `https://` (bukan `file://`), dan pastikan sudah dibuka
beberapa detik. Bisa juga lewat menu titik tiga → "Tambahkan ke layar utama".

**Apakah data contoh bisa tercampur dengan data asli?**
Tidak. Pemasangan data contoh ditolak kalau sudah ada transaksi sungguhan di sistem. Sebaliknya,
penghapusan data contoh mengosongkan seluruh transaksi — jadi lakukan sebelum mulai memakai
sistem untuk data asli, bukan sesudahnya.

**Akun demo tidak bisa login.**
Kalau pemasangan data contoh gagal membuat akun (versi Supabase berbeda-beda), sistem akan memberi
tahu akun mana yang gagal. Buat akun itu manual di Authentication → Users dengan email yang sama,
lalu pasang ulang data contohnya lewat Pengaturan.

**Data contoh tidak terpasang otomatis saat menjalankan schema.**
Itu berarti database sudah berisi data, atau pembuatan akun gagal. Pesannya muncul di panel hasil
SQL Editor. Pasang manual lewat Master data → Pengaturan → Data contoh.

**Bisakah perkenalan menu dimatikan untuk semua orang?**
Perkenalan hanya muncul sekali per orang. Setelah diselesaikan atau dilewati, ia tidak muncul lagi
kecuali dibuka sendiri dari menu akun.
