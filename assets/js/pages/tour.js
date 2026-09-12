// Perkenalan bertahap: menyorot menu aslinya di sidebar sambil menjelaskan
// apa gunanya, apa isinya, dan bagaimana jabatan lain menyambung ke situ.
import { S, can, h, $, on, rpc, errMsg, go } from '../core.js';

const STEPS = [
  {
    id: 'intro', icon: '👋', title: 'Selamat datang',
    need: () => true,
    body: `<p>Sistem ini mencatat seluruh perjalanan barang dan uang di Kertajaya Piala — dari komponen dibeli, dirakit jadi piala, sampai uangnya masuk rekening.</p>
      <p>Tiga aturan yang membentuk hampir semua isinya:</p>
      <ol><li><b>Tidak ada barang keluar tanpa dokumen.</b> Stok tidak bisa diketik ulang; ia berubah hanya lewat penerimaan, penjualan, transfer, produksi, atau opname.</li>
      <li><b>Satu orang tidak menutup satu lingkaran sendiri.</b> Yang memesan bukan yang menerima, yang menginput bukan yang memverifikasi.</li>
      <li><b>Tidak ada yang dihapus.</b> Salah input dibatalkan lewat void yang tercatat, bukan dihilangkan.</li></ol>
      <p class="small muted">Selanjutnya saya akan menunjuk langsung menunya satu per satu. Yang tidak Anda pakai tidak ditampilkan.</p>`,
  },
  {
    id: 'home', icon: '📊', title: 'Beranda', nav: 'home',
    need: () => can('dashboard'),
    body: `<p>Menunjukkan perjalanan uang dari omzet kotor sampai laba bersih, lengkap dengan potongan di tiap tahap: retur, diskon, biaya marketplace, HPP, kerugian stok, lalu biaya operasional.</p>
      <p><b>Isinya datang dari kerja orang lain:</b> omzet muncul saat kasir dan admin online menyelesaikan transaksi; HPP terbentuk dari harga beli yang diinput pembelian; kerugian stok muncul dari hasil opname gudang.</p>`,
  },
  {
    id: 'alerts', icon: '🔔', title: 'Peringatan & lonceng', nav: 'alerts',
    need: () => true,
    body: `<p>Lonceng di kanan atas mengumpulkan tiga hal: <b>tugas</b> yang menunggu keputusan Anda, <b>pengumuman</b> yang belum dibaca, dan <b>peringatan</b> operasional.</p>
      <p>Peringatan muncul sendiri: stok menipis, retur yang tak kunjung datang, transfer menggantung, selisih kas, piutang lewat tempo, sampai pola void kasir yang tidak wajar.</p>`,
  },
  {
    id: 'approvals', icon: '✅', title: 'Approval', nav: 'approvals',
    need: () => true,
    body: `<p>Semua yang perlu Anda setujui atau tolak berkumpul di sini. Setiap keputusan wajib disertai catatan dan tercatat di audit log dengan nama Anda.</p>
      <p>Sistem menolak jika Anda mencoba menyetujui sesuatu yang Anda buat sendiri — bukan karena tidak percaya, tapi supaya tidak ada satu orang pun yang bisa disalahkan sendirian kalau terjadi masalah.</p>`,
  },
  {
    id: 'pos', icon: '🧾', title: 'Kasir', nav: 'pos',
    need: () => can('pos'),
    body: `<p>Mulai giliran dengan <b>buka kas</b> — hitung uang modal di laci lalu catat. Akhiri dengan <b>tutup kas</b>: hitung fisik dulu, baru masukkan angkanya.</p>
      <p>Diskon di atas batas jabatan Anda tidak ditolak, tapi transaksinya <b>ditahan</b> sampai kepala cabang menyetujui. Begitu juga void: Anda mengajukan, atasan memutuskan.</p>
      <p><b>Sambungannya:</b> tiap penjualan langsung mengurangi stok yang dilihat gudang, dan uang tunainya jadi tanggung jawab Anda sampai disetor ke bank dan diverifikasi keuangan.</p>`,
  },
  {
    id: 'sales', icon: '📋', title: 'Pesanan', nav: 'sales',
    need: () => can('sales'),
    body: `<p>Semua pesanan dari channel mana pun masuk ke sini: WhatsApp, Instagram, marketplace, instansi, sampai walk-in.</p>
      <p>Untuk produk custom, mengkonfirmasi pesanan otomatis membuat <b>perintah kerja</b> dan memesan stok komponennya supaya tidak terjual dobel di kasir.</p>
      <p><b>Sambungannya:</b> desainer mengunggah mockup di sini, Anda mencatat bukti ACC pelanggan, keuangan memverifikasi DP-nya, baru produksi boleh mulai. Tanpa salah satu, tombol berikutnya tidak terbuka.</p>`,
  },
  {
    id: 'production', icon: '🏭', title: 'Papan produksi', nav: 'production',
    need: () => can('production') || can('design'),
    body: `<p>Perintah kerja bergerak dari kiri ke kanan: menunggu desain, menunggu ACC pelanggan, siap dikerjakan, dikerjakan, QC, selesai.</p>
      <p>Pekerjaan baru bisa dimulai kalau <b>desain sudah di-ACC pelanggan dengan bukti</b> dan <b>DP sudah diverifikasi keuangan</b>. Ini yang mencegah piala tergrafir nama salah atau dikerjakan tanpa uang muka.</p>
      <p>Barang rusak dicatat sebagai <b>scrap</b> — wajib foto, penyebab, dan nama operator. <b>Sambungannya:</b> operator tidak boleh mem-QC hasil kerjanya sendiri.</p>`,
  },
  {
    id: 'delivery', icon: '📦', title: 'Pengiriman', nav: 'delivery',
    need: () => can('logistics') || can('claims'),
    body: `<p>Barang keluar hanya dengan surat jalan. Saat packing, sistem meminta Anda <b>memindai tiap barang</b> sampai cocok dengan pesanan, lalu <b>memfoto isi paket</b> sebelum ditutup.</p>
      <p>Foto itu bukan formalitas: ketika pelanggan mengaku barang kurang, foto inilah yang menyelesaikan perdebatan.</p>
      <p><b>Sambungannya:</b> begitu paket dikirim, pendapatan baru diakui dan HPP dibukukan — itulah momen penjualan menjadi nyata di laporan keuangan.</p>`,
  },
  {
    id: 'returns', icon: '↩️', title: 'Retur', nav: 'returns',
    need: () => can('returns') || can('return_receive'),
    body: `<p>Retur dicatat <b>saat pelanggan mengajukan</b>, bukan saat barang datang. Sejak itu nilainya masuk pantauan "Retur Dalam Perjalanan" sehingga barang yang tak pernah sampai akan ketahuan.</p>
      <p>Saat barang tiba, penerima wajib merekam proses buka paket. Barang masuk <b>karantina</b> sampai ada keputusan: diperbaiki, dijual diskon, atau dihapus buku.</p>
      <p><b>Sambungannya:</b> penerima retur tidak boleh orang yang memproses refund, dan setiap disposisi wajib menyebut pihak yang menanggung biayanya.</p>`,
  },
  {
    id: 'stock', icon: '🗃️', title: 'Stok per lokasi', nav: 'stock',
    need: () => can('stock'),
    body: `<p>Stok selalu melekat pada <b>lokasi</b>, bukan sekadar cabang: utama, karantina retur, scrap, dan sisa bahan. Kolom "bisa dijual" sudah dikurangi barang yang dipesan pelanggan dan yang dialokasikan ke marketplace.</p>
      <p>Transfer antar cabang berjalan dua langkah: barang berstatus "dalam perjalanan" saat dikirim, dan baru jadi stok cabang setelah penerima <b>menghitung ulang</b>.</p>`,
  },
  {
    id: 'opname', icon: '🔢', title: 'Stock opname', nav: 'opname',
    need: () => can('opname'),
    body: `<p>Memakai <b>hitung buta</b> — angka sistem disembunyikan saat menghitung, supaya hasilnya jujur, bukan disesuaikan.</p>
      <p>Cycle count memilih SKU paling laris untuk dihitung rutin tanpa menutup toko. Selisih apa pun wajib disetujui atasan, dan nilainya masuk laporan shrinkage cabang.</p>`,
  },
  {
    id: 'po', icon: '🛒', title: 'Pembelian', nav: 'po',
    need: () => can('purchasing') || can('grn') || can('sup_invoice'),
    body: `<p>Semua pembelian lewat PO. Barang tidak bisa diterima tanpa acuan PO, dan <b>pembuat PO tidak boleh jadi penerima barang</b>.</p>
      <p>Faktur supplier dicocokkan tiga arah: PO, barang yang benar-benar diterima, dan nilai faktur. Yang tidak cocok otomatis diblokir.</p>
      <p><b>Sambungannya:</b> harga beli yang Anda input membentuk HPP rata-rata, yang menentukan apakah harga jual masih untung.</p>`,
  },
  {
    id: 'payments', icon: '💰', title: 'Keuangan', nav: 'payments',
    need: () => can('payments') || can('receivables') || can('cash'),
    body: `<p>Pembayaran baru sah setelah <b>dicocokkan dengan mutasi rekening</b>. Sebelum itu statusnya menunggu verifikasi dan belum mengurangi tagihan pelanggan.</p>
      <p>Kas cabang, setoran ke bank, biaya, utang supplier, dan pencairan marketplace semuanya bermuara ke jurnal otomatis — tidak ada entri manual.</p>
      <p><b>Sambungannya:</b> DP yang Anda verifikasi membuka kunci produksi. Verifikasi yang tertunda berarti pesanan pelanggan ikut tertunda.</p>`,
  },
  {
    id: 'payroll', icon: '👥', title: 'Penggajian', nav: 'payroll',
    need: () => can('payroll'),
    body: `<p>Gaji dirakit dari data yang sudah ada: hari hadir dari absensi, lembur dari jam tercatat, upah borongan dari unit yang <b>lulus QC</b>, dan komisi dari <b>laba</b> pesanan — bukan omzet, supaya obral diskon merugikan komisi si penjual sendiri.</p>
      <p><b>Sambungannya:</b> selisih kas, scrap, dan retur yang sudah ditetapkan penanggung jawabnya muncul sebagai usulan potongan. Potongan dibatasi persentase tertentu dari gaji; sisanya ditunda, bukan dihanguskan.</p>`,
  },
  {
    id: 'employees', icon: '🧑‍💼', title: 'Karyawan & absensi', nav: 'employees',
    need: () => can('employees') || can('attendance'),
    body: `<p>Data kepegawaian dan skema gaji. Absensi harian diisi di menu terpisah dan menjadi dasar tunjangan kehadiran, uang makan, lembur, serta potongan ketidakhadiran.</p>
      <p>Setelah gaji periode itu disetujui, absensinya terkunci — tidak bisa diubah belakangan.</p>`,
  },
  {
    id: 'reports', icon: '📈', title: 'Laporan', nav: 'reports',
    need: () => can('reports') || can('dashboard'),
    body: `<p>Sepuluh laporan untuk memutuskan, bukan sekadar melihat: margin per channel, produk paling menguntungkan, stok mati, shrinkage per cabang, rekonsiliasi retur, scrap per operator, audit void kasir, riwayat selisih opname, riwayat harga supplier, dan produktivitas produksi.</p>`,
  },
  {
    id: 'announcements', icon: '📣', title: 'Pengumuman', nav: 'announcements',
    need: () => true,
    body: `<p>Kabar internal untuk tim. Bisa ditujukan ke jabatan atau cabang tertentu, disematkan supaya selalu tampil, dan diberi tanda wajib konfirmasi dibaca.</p>
      <p>Pembuatnya bisa melihat siapa saja yang sudah membaca — berguna untuk perubahan aturan atau harga.</p>`,
  },
  {
    id: 'settings', icon: '⚙️', title: 'Pengaturan & data contoh', nav: 'settings',
    need: () => can('settings'),
    body: `<p>Ambang batas yang mengatur kapan sistem meminta approval dan kapan memunculkan peringatan: nilai PO yang butuh persetujuan, DP minimum, batas umur retur, ambang shrinkage, dan lainnya.</p>
      <p>Di halaman yang sama ada tombol <b>hapus data contoh</b> — jalankan sebelum mulai memakai sistem untuk data sungguhan. Kalau ingin berlatih lagi nanti, data contoh bisa dipasang ulang dari tempat yang sama.</p>`,
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
  if (document.querySelector('.tour-pop')) return false;
  const steps = tourSteps().filter(s => !s.nav || $(`.side .nav-items a[data-r="${s.nav}"]`));
  if (!steps.length) return false;
  let i = 0;

  const shell = $('.shell');
  const wasDrawer = !!shell?.classList.contains('drawer');
  const dim = h('<div class="tour-dim"></div>');
  const hole = h('<div class="tour-hole" hidden></div>');
  const pop = h(`<div class="tour-pop" role="dialog" aria-modal="true" aria-live="polite">
    <div class="th"><span class="tour-icon" data-icon></span><h2 data-title></h2></div>
    <div class="tb" data-body></div>
    <div class="tf">
      <button class="btn ghost sm" data-skipall>Lewati semua</button>
      <span class="grow"></span>
      <span class="tour-dots" data-dots></span>
      <button class="btn sm" data-prev aria-label="Sebelumnya">←</button>
      <button class="btn primary sm" data-next>Lanjut</button>
    </div></div>`);
  document.body.append(dim, hole, pop);
  hole.style.pointerEvents = 'auto';
  hole.style.cursor = 'pointer';

  const isNarrow = () => window.innerWidth <= 900;
  const target = () => steps[i].nav ? $(`.side .nav-items a[data-r="${steps[i].nav}"]`) : null;

  const place = () => {
    const el = target();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    if (!el) {
      hole.hidden = true;
      pop.dataset.arrow = 'none';
      pop.style.left = `${Math.max(12, (window.innerWidth - pw) / 2)}px`;
      pop.style.top = `${Math.max(12, (window.innerHeight - ph) / 2)}px`;
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0) { hole.hidden = true; return; }
    hole.hidden = false;
    hole.style.left = `${r.left - 4}px`;
    hole.style.top = `${r.top - 3}px`;
    hole.style.width = `${r.width + 8}px`;
    hole.style.height = `${r.height + 6}px`;

    const gap = 16;
    if (!isNarrow() && window.innerWidth - r.right > pw + gap) {
      pop.dataset.arrow = 'left';
      pop.style.left = `${r.right + gap}px`;
      const top = Math.min(Math.max(12, r.top - 24), Math.max(12, window.innerHeight - ph - 12));
      pop.style.top = `${top}px`;
      pop.style.setProperty('--ay', `${Math.max(14, Math.min(ph - 28, r.top + r.height / 2 - top - 7))}px`);
    } else {
      const below = r.bottom + gap + ph < window.innerHeight - 8;
      pop.dataset.arrow = below ? 'top' : 'bottom';
      const left = isNarrow() ? 8 : Math.max(12, Math.min(r.left, window.innerWidth - pw - 12));
      pop.style.left = `${left}px`;
      pop.style.top = below ? `${r.bottom + gap}px` : `${Math.max(12, r.top - gap - ph)}px`;
      pop.style.setProperty('--ax', `${Math.max(16, Math.min(pw - 30, r.left + r.width / 2 - left - 7))}px`);
    }
  };

  const draw = () => {
    const s = steps[i];
    $('[data-icon]', pop).textContent = s.icon;
    $('[data-title]', pop).textContent = s.title;
    $('[data-body]', pop).innerHTML = s.body;
    $('[data-dots]', pop).innerHTML = steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('[data-prev]', pop).disabled = i === 0;
    $('[data-next]', pop).textContent = i === steps.length - 1 ? 'Selesai' : 'Lanjut';
    $('[data-body]', pop).scrollTop = 0;

    if (s.nav) {
      if (isNarrow()) shell?.classList.add('drawer');
      const el = target();
      if (el) {
        const grp = el.closest('.nav-group');
        if (grp?.classList.contains('closed')) grp.classList.remove('closed');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } else if (isNarrow()) {
      shell?.classList.remove('drawer');
    }
    requestAnimationFrame(place);
    setTimeout(place, 300);
  };

  const finish = async () => {
    dim.remove(); hole.remove(); pop.remove();
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', key);
    if (!wasDrawer) shell?.classList.remove('drawer');
    try { await rpc('set_onboarded', { p_done: true }); if (S.me) S.me.onboarded_at = new Date().toISOString(); }
    catch (e) { console.warn(errMsg(e)); }
  };
  const next = () => { if (i < steps.length - 1) { i++; draw(); } else finish(); };
  const prev = () => { if (i > 0) { i--; draw(); } };
  const key = (e) => {
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  };
  document.addEventListener('keydown', key);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  on(pop, '[data-next]', 'click', next);
  on(pop, '[data-prev]', 'click', prev);
  on(pop, '[data-skipall]', 'click', finish);
  dim.addEventListener('click', finish);
  hole.addEventListener('click', () => { const s = steps[i]; if (s.nav) go(s.nav); next(); });

  draw();
  return true;
}
