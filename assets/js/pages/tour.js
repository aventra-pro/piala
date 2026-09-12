// Perkenalan bertahap saat pertama kali masuk.
// Isinya menjelaskan tiap menu: apa gunanya, apa isinya, dan bagaimana
// pekerjaan jabatan lain menyambung ke situ.
import { S, can, esc, h, $, $$, on, rpc, toast, errMsg, go } from '../core.js';

const STEPS = [
  {
    id: 'intro', icon: '👋', title: 'Selamat datang',
    need: () => true,
    body: `<p>Sistem ini mencatat seluruh perjalanan barang dan uang di Kertajaya Piala — dari komponen dibeli, dirakit jadi piala, sampai uangnya masuk rekening.</p>
      <p>Tiga aturan yang membentuk hampir semua isinya:</p>
      <ol><li><b>Tidak ada barang keluar tanpa dokumen.</b> Stok tidak bisa diketik ulang; ia berubah hanya lewat penerimaan, penjualan, transfer, produksi, atau opname.</li>
      <li><b>Satu orang tidak menutup satu lingkaran sendiri.</b> Yang memesan bukan yang menerima, yang menginput bukan yang memverifikasi.</li>
      <li><b>Tidak ada yang dihapus.</b> Salah input dibatalkan lewat void yang tercatat, bukan dihilangkan.</li></ol>
      <p class="small muted">Perkenalan ini menyesuaikan jabatan Anda — yang tidak Anda pakai tidak ditampilkan. Bisa dibuka lagi kapan saja lewat menu akun.</p>`,
  },
  {
    id: 'home', icon: '📊', title: 'Beranda & Peringatan', route: 'home',
    need: () => can('dashboard'),
    body: `<p>Beranda menunjukkan perjalanan uang dari omzet kotor sampai laba bersih, lengkap dengan potongan di tiap tahap: retur, diskon, biaya marketplace, HPP, kerugian stok, lalu biaya operasional.</p>
      <p><b>Isinya datang dari kerja orang lain:</b> angka omzet muncul saat kasir dan admin online menyelesaikan transaksi; HPP terbentuk dari harga beli yang diinput pembelian; kerugian stok muncul dari hasil opname gudang.</p>
      <p>Menu <b>Peringatan</b> memunculkan hal yang butuh perhatian: stok menipis, retur yang tak kunjung datang, transfer menggantung, selisih kas, piutang lewat tempo.</p>`,
  },
  {
    id: 'pos', icon: '🧾', title: 'Kasir', route: 'pos',
    need: () => can('pos'),
    body: `<p>Mulai giliran dengan <b>buka kas</b> — hitung uang modal di laci lalu catat. Akhiri dengan <b>tutup kas</b>: hitung fisik dulu, baru masukkan angkanya.</p>
      <p>Diskon di atas batas jabatan Anda tidak ditolak, tapi transaksinya <b>ditahan</b> sampai kepala cabang menyetujui. Begitu juga void: Anda mengajukan, atasan yang memutuskan.</p>
      <p><b>Sambungannya:</b> setiap penjualan langsung mengurangi stok yang dilihat gudang, dan uang tunainya jadi tanggung jawab Anda sampai disetor ke bank dan diverifikasi keuangan.</p>`,
  },
  {
    id: 'sales', icon: '📋', title: 'Pesanan & Penawaran', route: 'sales',
    need: () => can('sales'),
    body: `<p>Semua pesanan dari channel mana pun masuk ke sini: WhatsApp, Instagram, marketplace, instansi, sampai walk-in. Tiap pesanan wajib punya channel dan kontak pelanggan.</p>
      <p>Untuk produk custom, mengkonfirmasi pesanan otomatis membuat <b>perintah kerja</b> untuk produksi dan memesan (reserve) stok komponennya, supaya tidak terjual dobel di kasir.</p>
      <p><b>Sambungannya:</b> desainer mengunggah mockup di sini, Anda mencatat bukti ACC pelanggan, keuangan memverifikasi DP-nya, baru produksi boleh mulai. Tanpa salah satu, tombol berikutnya tidak terbuka.</p>`,
  },
  {
    id: 'production', icon: '🏭', title: 'Produksi & Desain', route: 'production',
    need: () => can('production') || can('design'),
    body: `<p>Papan produksi menampilkan perintah kerja dari kiri ke kanan: menunggu desain, menunggu ACC pelanggan, siap dikerjakan, dikerjakan, QC, selesai.</p>
      <p>Pekerjaan baru bisa dimulai kalau <b>desain sudah di-ACC pelanggan dengan bukti</b> dan <b>DP sudah diverifikasi keuangan</b>. Ini yang mencegah piala tergrafir nama salah atau dikerjakan tanpa uang muka.</p>
      <p>Bahan diambil sesuai BOM. Barang rusak dicatat sebagai <b>scrap</b> — wajib foto, penyebab, dan nama operator. Sisa potongan akrilik yang masih layak dicatat supaya dipakai lagi, bukan dibuang.</p>
      <p><b>Sambungannya:</b> operator tidak boleh mem-QC hasil kerjanya sendiri; QC dilakukan orang lain sebelum barang boleh dikirim.</p>`,
  },
  {
    id: 'delivery', icon: '📦', title: 'Pengiriman & Klaim', route: 'delivery',
    need: () => can('logistics') || can('claims'),
    body: `<p>Barang keluar hanya dengan surat jalan. Saat packing, sistem meminta Anda <b>memindai tiap barang</b> sampai cocok dengan pesanan, lalu <b>memfoto isi paket</b> sebelum ditutup.</p>
      <p>Foto itu bukan formalitas: ketika pelanggan mengaku barang kurang, foto inilah yang menyelesaikan perdebatan. Paket hilang atau rusak diajukan sebagai <b>klaim ke ekspedisi</b>, bukan langsung dianggap rugi toko.</p>
      <p><b>Sambungannya:</b> begitu paket dikirim, pendapatan baru diakui dan HPP dibukukan — itulah momen penjualan menjadi nyata di laporan keuangan.</p>`,
  },
  {
    id: 'returns', icon: '↩️', title: 'Retur', route: 'returns',
    need: () => can('returns') || can('return_receive'),
    body: `<p>Retur dicatat <b>saat pelanggan mengajukan</b>, bukan saat barang datang. Sejak itu nilainya masuk pantauan "Retur Dalam Perjalanan" sehingga barang yang tak pernah sampai akan ketahuan.</p>
      <p>Saat barang tiba, penerima wajib merekam/memfoto proses buka paket. Barang masuk <b>karantina</b> — belum jadi stok jual — sampai ada keputusan: diperbaiki, dijual diskon, atau dihapus buku.</p>
      <p><b>Sambungannya:</b> penerima retur tidak boleh orang yang memproses refund. Setiap disposisi wajib menyebut pihak yang menanggung biayanya, dan itu bisa berujung ke potongan gaji lewat modul SDM.</p>`,
  },
  {
    id: 'stock', icon: '📦', title: 'Persediaan & Opname', route: 'stock',
    need: () => can('stock') || can('opname'),
    body: `<p>Stok selalu melekat pada <b>lokasi</b>, bukan sekadar cabang: utama, karantina retur, scrap, dan sisa bahan. Kolom "bisa dijual" sudah dikurangi barang yang dipesan pelanggan dan yang dialokasikan ke marketplace.</p>
      <p>Transfer antar cabang berjalan dua langkah: barang masuk status "dalam perjalanan" saat dikirim, dan baru jadi stok cabang setelah penerima <b>menghitung ulang</b>. Selisih memicu berita acara yang wajib menyebut penanggung jawab.</p>
      <p>Stock opname memakai <b>hitung buta</b> — angka sistem disembunyikan saat menghitung, supaya hasilnya jujur, bukan disesuaikan.</p>`,
  },
  {
    id: 'purchasing', icon: '🛒', title: 'Pembelian', route: 'po',
    need: () => can('purchasing') || can('grn') || can('sup_invoice'),
    body: `<p>Semua pembelian lewat PO. Barang tidak bisa diterima tanpa acuan PO, dan <b>pembuat PO tidak boleh jadi penerima barang</b>.</p>
      <p>Faktur supplier dicocokkan tiga arah: PO, barang yang benar-benar diterima, dan nilai faktur. Yang tidak cocok otomatis diblokir dan tidak bisa dibayar sebelum keuangan memutuskan.</p>
      <p><b>Sambungannya:</b> harga beli yang Anda input membentuk HPP rata-rata, yang menentukan apakah harga jual masih untung. Riwayat harga per supplier bisa dilihat di Laporan.</p>`,
  },
  {
    id: 'finance', icon: '💰', title: 'Keuangan', route: 'payments',
    need: () => can('payments') || can('receivables') || can('cash') || can('accounting'),
    body: `<p>Pembayaran baru sah setelah <b>dicocokkan dengan mutasi rekening</b>. Sebelum itu statusnya menunggu verifikasi dan belum mengurangi tagihan pelanggan.</p>
      <p>Kas cabang, setoran ke bank, biaya operasional, utang supplier, dan pencairan marketplace semuanya bermuara ke jurnal yang dibuat otomatis. Tidak ada entri manual, jadi angka laporan keuangan tidak bisa dikarang.</p>
      <p><b>Sambungannya:</b> DP yang Anda verifikasi membuka kunci produksi. Verifikasi yang tertunda berarti pesanan pelanggan ikut tertunda.</p>`,
  },
  {
    id: 'hr', icon: '👥', title: 'SDM & Penggajian', route: 'employees',
    need: () => can('employees') || can('payroll') || can('attendance'),
    body: `<p>Data karyawan, absensi harian, skema gaji, kasbon, dan penggajian bulanan.</p>
      <p>Gaji dihitung dari data yang sudah ada di sistem: hari hadir dari absensi, lembur dari jam tercatat, upah borongan dari unit yang <b>lulus QC</b>, dan komisi penjualan dari <b>laba</b> pesanan — bukan omzet, supaya obral diskon merugikan komisi si penjual sendiri.</p>
      <p><b>Sambungannya:</b> selisih kas, scrap, dan retur yang sudah ditetapkan penanggung jawabnya muncul di sini sebagai usulan potongan. Potongan dibatasi persentase tertentu dari gaji, sisanya ditunda — bukan dihanguskan.</p>`,
  },
  {
    id: 'approvals', icon: '✅', title: 'Approval & Notifikasi', route: 'approvals',
    need: () => true,
    body: `<p>Lonceng di kanan atas mengumpulkan tiga hal: <b>pengumuman</b> yang belum Anda baca, <b>peringatan</b> operasional, dan <b>tugas</b> yang menunggu keputusan Anda.</p>
      <p>Halaman Approval memuat semua yang perlu Anda setujui atau tolak. Setiap keputusan wajib disertai catatan dan tercatat di audit log dengan nama Anda.</p>
      <p>Sistem akan menolak jika Anda mencoba menyetujui sesuatu yang Anda buat sendiri — bukan karena tidak percaya, tapi supaya tidak ada satu orang pun yang bisa disalahkan sendirian kalau terjadi masalah.</p>`,
  },
  {
    id: 'end', icon: '🏁', title: 'Sudah siap',
    need: () => true,
    body: `<p>Itu saja pengenalannya. Beberapa hal yang membantu di hari pertama:</p>
      <ul><li>Kalau tombol yang Anda cari tidak ada, biasanya ada langkah sebelumnya yang belum selesai — bukan menu yang hilang.</li>
      <li>Pesan merah dari sistem selalu menjelaskan <i>apa</i> yang kurang, bukan sekadar "gagal".</li>
      <li>Ragu soal angka? Buka <b>Kartu stok</b> atau <b>Audit log</b>; keduanya menyimpan siapa melakukan apa dan kapan.</li></ul>
      <p class="small muted">Perkenalan ini bisa dibuka lagi dari menu akun di kanan atas.</p>`,
  },
];

export function tourSteps() { return STEPS.filter(s => s.need()); }

export function startTour({ force = false } = {}) {
  if (!force && S.me?.onboarded_at) return false;
  const steps = tourSteps();
  let i = 0;
  const back = h(`<div class="modal-back tour"><div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><span class="tour-icon" data-icon></span><h2 data-title></h2><span class="small muted" data-count></span></div>
    <div class="mb" data-body></div>
    <div class="mf">
      <button class="btn ghost" data-skipall>Lewati semua</button>
      <span style="flex:1"></span>
      <button class="btn" data-prev>Kembali</button>
      <button class="btn primary" data-next>Lanjut</button>
    </div></div></div>`);
  const draw = () => {
    const s = steps[i];
    $('[data-icon]', back).textContent = s.icon;
    $('[data-title]', back).textContent = s.title;
    $('[data-count]', back).textContent = `${i + 1} / ${steps.length}`;
    $('[data-body]', back).innerHTML = s.body + (s.route ? `<p style="margin-top:12px"><button class="btn sm" data-goto="${s.route}">Buka menu ini sekarang</button></p>` : '');
    $('[data-prev]', back).disabled = i === 0;
    $('[data-next]', back).textContent = i === steps.length - 1 ? 'Selesai' : 'Lanjut';
    $('[data-body]', back).scrollTop = 0;
  };
  const finish = async () => {
    back.remove();
    document.removeEventListener('keydown', key);
    try { await rpc('set_onboarded', { p_done: true }); if (S.me) S.me.onboarded_at = new Date().toISOString(); }
    catch (e) { console.warn(errMsg(e)); }
  };
  const key = (e) => {
    if (e.key === 'Escape') finish();
    if (e.key === 'ArrowRight') { if (i < steps.length - 1) { i++; draw(); } }
    if (e.key === 'ArrowLeft') { if (i > 0) { i--; draw(); } }
  };
  document.addEventListener('keydown', key);
  on(back, '[data-next]', 'click', () => { if (i < steps.length - 1) { i++; draw(); } else finish(); });
  on(back, '[data-prev]', 'click', () => { if (i > 0) { i--; draw(); } });
  on(back, '[data-skipall]', 'click', finish);
  on(back, '[data-goto]', 'click', (e, b) => { finish(); go(b.dataset.goto); });
  document.body.appendChild(back);
  draw();
  return true;
}
