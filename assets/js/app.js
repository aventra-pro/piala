// =====================================================================
//  Boot aplikasi: login, kerangka, navigasi, PWA
// =====================================================================
import { sb, S, $, $$, h, esc, on, toast, rpc, errMsg, setBranch, can, ICON, parseHash, allRoutes, routeAllowed, spinner, go, formModal, lookups } from './core.js';
import { APP_NAME, APP_VERSION } from './config.js';
import { countApprovals } from './pages/dashboard.js';
import { startTour } from './pages/tour.js';
import { notifPanel, announceCard, bindAnnounce } from './pages/announce.js';
import './pages/sales.js';
import './pages/production.js';
import './pages/logistics.js';
import './pages/inventory.js';
import './pages/purchasing.js';
import './pages/finance.js';
import './pages/reports.js';
import './pages/master.js';
import './pages/hr.js';
import './pages/announce.js';

const NAV = [
  ['Ringkasan', [['home', 'Beranda'], ['approvals', 'Approval'], ['alerts', 'Peringatan']]],
  ['Penjualan', [['pos', 'Kasir (POS)'], ['sales', 'Pesanan'], ['quotations', 'Penawaran'], ['mp-import', 'Import marketplace'], ['customers', 'Pelanggan']]],
  ['Produksi', [['production', 'Papan produksi'], ['designs', 'Desain & mockup'], ['offcuts', 'Sisa bahan akrilik']]],
  ['Pengiriman & retur', [['delivery', 'Pengiriman'], ['claims', 'Klaim ekspedisi'], ['returns', 'Retur penjualan']]],
  ['Persediaan', [['stock', 'Stok per lokasi'], ['ledger', 'Kartu stok'], ['transfers', 'Transfer stok'], ['opname', 'Stock opname'], ['adjustments', 'Penyesuaian stok'], ['allocation', 'Alokasi channel'], ['labels', 'Label barcode & serial']]],
  ['Pembelian', [['po', 'Purchase order'], ['grn', 'Penerimaan barang'], ['sup-invoices', 'Faktur supplier'], ['purchase-returns', 'Retur pembelian']]],
  ['Keuangan', [['payments', 'Verifikasi pembayaran'], ['receivables', 'Piutang'], ['cash', 'Kas cabang'], ['expenses', 'Biaya operasional'], ['payables', 'Utang supplier'], ['bank', 'Rekonsiliasi bank'], ['settlement', 'Settlement marketplace'], ['accounting', 'Laporan keuangan']]],
  ['SDM & penggajian', [['employees', 'Karyawan'], ['attendance', 'Absensi'], ['payroll', 'Penggajian'], ['advances', 'Kasbon'], ['charges', 'Pembebanan kerugian'], ['schemes', 'Skema gaji'], ['my-payslip', 'Slip gaji saya']]],
  ['Laporan', [['reports', 'Laporan manajemen'], ['hr-report', 'Laporan SDM']]],
  ['Master data', [['products', 'Produk & SKU'], ['bom', 'BOM / resep'], ['branches', 'Cabang & lokasi'], ['channels', 'Channel penjualan'], ['suppliers', 'Supplier'], ['banks', 'Rekening perusahaan'], ['users', 'Pengguna & akses'], ['settings', 'Pengaturan'], ['audit', 'Audit log']]],
  ['Komunikasi', [['announcements', 'Pengumuman']]],
];

const app = document.getElementById('app');
let deferredInstall = null;

// ---------- login ----------
function renderLogin(mode = 'login') {
  app.innerHTML = `<div class="login"><div class="login-card">
    <div class="mark"><img src="assets/icons/icon-192.png" alt=""><span class="plate">${esc(APP_NAME)}</span></div>
    <h1>${mode === 'reset' ? 'Buat kata sandi baru' : 'Masuk ke ERP'}</h1>
    <p class="muted small">${mode === 'reset' ? 'Masukkan kata sandi baru untuk akun Anda.' : 'Gunakan email & kata sandi yang diberikan admin.'}</p>
    <form class="stack" id="lf" style="margin-top:14px">
      ${mode === 'reset' ? `<label class="f"><span>Kata sandi baru</span><input type="password" name="pw" minlength="8" required autocomplete="new-password"></label>`
      : `<label class="f"><span>Email</span><input type="email" name="email" required autocomplete="username" inputmode="email"></label>
         <label class="f"><span>Kata sandi</span><input type="password" name="pw" required autocomplete="current-password"></label>`}
      <button class="btn primary" style="width:100%">${mode === 'reset' ? 'Simpan kata sandi' : 'Masuk'}</button>
      ${mode === 'reset' ? '' : '<button type="button" class="btn ghost sm" id="forgot" style="width:100%">Lupa kata sandi?</button>'}
      <div id="lerr"></div>
    </form>
    <div id="demoHint"></div>
    <p class="small muted" style="margin:16px 0 0">v${APP_VERSION}</p>
  </div></div>`;
  const f = $('#lf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button', f); btn.disabled = true; $('#lerr').innerHTML = '';
    try {
      if (mode === 'reset') {
        const { error } = await sb.auth.updateUser({ password: f.pw.value }); if (error) throw error;
        toast('Kata sandi diperbarui.'); history.replaceState(null, '', location.pathname); boot();
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.pw.value });
        if (error) throw new Error(/Invalid login/i.test(error.message) ? 'Email atau kata sandi salah.' : error.message);
      }
    } catch (err) { $('#lerr').innerHTML = `<div class="note danger">${esc(errMsg(err))}</div>`; }
    finally { btn.disabled = false; }
  };
  if (mode !== 'reset') {
    rpc('demo_login_hint').then(hint => {
      if (!hint?.on || !$('#demoHint')) return;
      $('#demoHint').innerHTML = `<div class="demo-hint"><b>Sistem berisi data contoh.</b> Coba masuk sebagai Owner:<br>
        <code>${esc(hint.email)}</code> / <code>${esc(hint.password)}</code>
        <div class="actions" style="margin-top:8px"><button class="btn sm" id="fillDemo">Isi otomatis & masuk</button></div></div>`;
      $('#fillDemo').onclick = () => { f.email.value = hint.email; f.pw.value = hint.password; f.requestSubmit(); };
    }).catch(() => {});
  }
  $('#forgot')?.addEventListener('click', async () => {
    const email = f.email.value.trim();
    if (!email) return $('#lerr').innerHTML = '<div class="note warn">Isi email dulu, lalu tekan "Lupa kata sandi?".</div>';
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    $('#lerr').innerHTML = error ? `<div class="note danger">${esc(error.message)}</div>` : '<div class="note ok">Tautan reset dikirim ke email Anda.</div>';
  });
}

// ---------- kerangka ----------
function navHTML() {
  const routes = allRoutes();
  const closed = JSON.parse(localStorage.getItem('kp.navclosed') || '[]');
  return NAV.map(([g, items]) => {
    const vis = items.filter(([r]) => routes[r] && routeAllowed(routes[r]));
    if (!vis.length) return '';
    return `<div class="nav-group ${closed.includes(g) ? 'closed' : ''}" data-g="${esc(g)}"><button type="button">${esc(g)}</button><div class="nav-items">${
      vis.map(([r, l]) => `<a href="#/${r}" data-r="${r}">${esc(l)}<span class="badge hide" data-badge="${r}"></span></a>`).join('')}</div></div>`;
  }).join('');
}

function renderShell() {
  const me = S.me;
  const initials = (me.full_name || me.email).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const brOpts = (me.is_global || me.branches.length > 1 ? `<option value="">Semua cabang</option>` : '') +
    me.branches.map(b => `<option value="${b.id}" ${S.branch === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  if (!me.is_global && me.branches.length === 1) setBranch(me.branches[0].id);
  if (S.branch && !me.branches.some(b => b.id === S.branch)) setBranch('');
  const second = can('pos', 'c') ? ['pos', 'Kasir', ICON.cart] : ['sales', 'Pesanan', ICON.cart];
  const fourth = can('stock') ? ['stock', 'Stok', ICON.box] : ['production', 'Produksi', ICON.box];
  app.innerHTML = `<div class="shell">
    <aside class="side" aria-label="Menu utama">
      <div class="brand"><img src="assets/icons/icon-192.png" alt=""><span class="plate">${esc(APP_NAME)}</span></div>
      <nav>${navHTML()}</nav>
    </aside>
    <div class="main">
      <div class="demo-bar" id="demoBar" hidden>
        <span class="grow" style="flex:1">Sistem ini sedang berisi <b>data contoh</b> — aman untuk dicoba, semua angka fiktif.</span>
        <a class="btn sm" href="#/settings">Hapus / kelola</a>
        <button class="btn sm ghost" id="demoHide" aria-label="Sembunyikan">Sembunyikan</button>
      </div>
      <div class="install-bar" id="install"><span class="grow">Pasang aplikasi ini di layar utama HP agar bisa dibuka seperti aplikasi biasa.</span><button class="btn sm brass" id="doInstall">Pasang</button><button class="btn sm ghost" id="noInstall">Nanti</button></div>
      <header class="topbar">
        <button class="btn ghost icon menu-btn" id="menuBtn" aria-label="Buka menu">${ICON.menu}</button>
        <select id="brSel" aria-label="Cabang aktif">${brOpts}</select>
        <div class="grow"></div>
        <button class="btn ghost icon" id="bellBtn" aria-label="Notifikasi" style="position:relative">${ICON.bell}<span class="badge red hide" data-badge="notif" style="position:absolute;top:2px;right:0"></span></button>
        <button class="user-chip" id="userBtn"><span class="av">${esc(initials)}</span><span class="nm">${esc(me.full_name || me.email)}<br><span class="muted small">${esc(me.roles.map(r => r.name).join(', ') || 'Belum ada jabatan')}</span></span></button>
      </header>
      <main class="content"><div id="pinned" class="stack" style="margin-bottom:14px"></div><div id="view"></div></main>
    </div>
    <nav class="bottom-nav" aria-label="Navigasi cepat">
      <a href="#/home" data-r="home">${ICON.home}<span>Beranda</span></a>
      <a href="#/${second[0]}" data-r="${second[0]}">${second[2]}<span>${second[1]}</span></a>
      <a href="#/approvals" data-r="approvals">${ICON.check}<span>Approval</span><span class="badge hide" data-badge="approvals"></span></a>
      <a href="#/${fourth[0]}" data-r="${fourth[0]}">${fourth[2]}<span>${fourth[1]}</span></a>
      <a href="#" id="menuBtn2">${ICON.menu}<span>Menu</span></a>
    </nav>
  </div>`;
  const shell = $('.shell');
  const toggle = (open) => shell.classList.toggle('drawer', open);
  $('#menuBtn').onclick = () => toggle(true);
  $('#menuBtn2').onclick = (e) => { e.preventDefault(); toggle(true); };
  shell.addEventListener('click', (e) => { if (shell.classList.contains('drawer') && !e.target.closest('.side') && !e.target.closest('#menuBtn,#menuBtn2')) toggle(false); });
  on($('.side'), '.nav-items a', 'click', () => toggle(false));
  on($('.side'), '.nav-group > button', 'click', (e, b) => {
    const g = b.parentElement; g.classList.toggle('closed');
    localStorage.setItem('kp.navclosed', JSON.stringify($$('.nav-group.closed').map(x => x.dataset.g)));
  });
  $('#brSel').onchange = (e) => { setBranch(e.target.value); render(); updateBadges(); };
  $('#userBtn').onclick = userMenu;
  $('#bellBtn').onclick = (e) => { e.stopPropagation(); notifPanel(e.currentTarget); };
  if (String(S.me.settings?.demo_data) === 'on' && !localStorage.getItem('kp.demohide')) $('#demoBar').hidden = false;
  $('#demoHide').onclick = () => { $('#demoBar').hidden = true; localStorage.setItem('kp.demohide', '1'); };
  if (deferredInstall && !localStorage.getItem('kp.noinstall')) $('#install').classList.add('show');
  $('#doInstall').onclick = async () => { $('#install').classList.remove('show'); deferredInstall?.prompt(); deferredInstall = null; };
  $('#noInstall').onclick = () => { $('#install').classList.remove('show'); localStorage.setItem('kp.noinstall', '1'); };
}

async function userMenu() {
  const me = S.me;
  const v = await formModal({
    title: 'Akun saya', submitLabel: 'Ganti kata sandi',
    intro: `<dl class="kv" style="margin-bottom:14px"><dt>Nama</dt><dd>${esc(me.full_name || '—')}</dd><dt>Email</dt><dd>${esc(me.email)}</dd>
      <dt>Jabatan</dt><dd>${esc(me.roles.map(r => r.name).join(', ') || '—')}</dd><dt>Cabang</dt><dd>${me.is_global ? 'Semua cabang (HQ)' : esc(me.branches.map(b => b.name).join(', '))}</dd>
      <dt>Batas diskon</dt><dd>${me.discount_limit}%</dd></dl>
      <div class="actions" style="margin-bottom:14px"><button class="btn" id="replayTour">Ulangi perkenalan</button><button class="btn danger" id="logout">Keluar</button></div>`,
    fields: [{ name: 'pw', label: 'Kata sandi baru (kosongkan jika tidak diganti)', type: 'password', span: 2 }],
    onSubmit: async (v) => {
      if (!v.pw) return v;
      if (v.pw.length < 8) throw new Error('Kata sandi minimal 8 karakter.');
      const { error } = await sb.auth.updateUser({ password: v.pw }); if (error) throw error;
      toast('Kata sandi diganti.'); return v;
    },
  });
  void v;
}
document.addEventListener('click', async (e) => {
  if (e.target.id === 'replayTour') { $('.modal-back')?.remove(); startTour({ force: true }); }
  if (e.target.id === 'logout') { await sb.auth.signOut(); localStorage.removeItem('kp.branch'); location.hash = ''; location.reload(); }
});

// ---------- render halaman ----------
let renderSeq = 0;
async function render() {
  const view = $('#view'); if (!view) return;
  const { name, params } = parseHash();
  const def = allRoutes()[name];
  $$('[data-r]').forEach(a => a.classList.toggle('active', a.dataset.r === name));
  if (!def) { view.innerHTML = `<div class="empty"><strong>Halaman tidak ditemukan</strong><a href="#/home">Kembali ke beranda</a></div>`; return; }
  if (!routeAllowed(def)) { view.innerHTML = `<div class="empty"><strong>Anda tidak punya akses ke halaman ini</strong>Minta Owner menambahkan izin untuk jabatan Anda.</div>`; return; }
  document.title = `${def.title} · ${APP_NAME}`;
  const seq = ++renderSeq;
  view.innerHTML = spinner();
  try {
    const el = document.createElement('div');
    await def.render(el, params);
    if (seq !== renderSeq) return;       // user sudah pindah halaman
    view.replaceChildren(el);
    window.scrollTo({ top: 0 });
  } catch (err) {
    if (seq !== renderSeq) return;
    console.error(err);
    view.innerHTML = `<div class="note danger">${esc(errMsg(err))}</div><p style="margin-top:12px"><button class="btn" onclick="location.reload()">Muat ulang</button></p>`;
  }
}

async function updateBadges() {
  try {
    const [n, notif] = await Promise.all([countApprovals(), rpc('rpt_notifications', { p_branch: S.branch || null })]);
    const set = (k, v) => $$(`[data-badge="${k}"]`).forEach(b => { b.textContent = v > 99 ? '99+' : v; b.classList.toggle('hide', !v); });
    set('approvals', n);
    set('notif', notif?.unread || 0);
    set('announcements', (notif?.announcements || []).length);
    renderPinned(notif?.announcements || []);
  } catch { /* abaikan */ }
}

function renderPinned(list) {
  const host = $('#pinned'); if (!host) return;
  const urgent = list.filter(a => a.pinned || a.level === 'darurat' || a.require_ack);
  host.innerHTML = urgent.map(a => announceCard(a, { compact: true })).join('');
  bindAnnounce(host, updateBadges);
}

// ---------- boot ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  try {
    S.me = await rpc('me');
  } catch (e) {
    app.innerHTML = `<div class="login"><div class="login-card"><h1>Tidak bisa terhubung</h1><p class="note danger" style="margin-top:10px">${esc(errMsg(e))}</p>
      <p class="small muted">Pastikan file <b>supabase/schema.sql</b> sudah dijalankan di Supabase.</p><button class="btn" onclick="location.reload()">Coba lagi</button> <button class="btn ghost" id="logout">Keluar</button></div></div>`;
    return;
  }
  if (!S.me?.active) {
    app.innerHTML = `<div class="login"><div class="login-card"><h1>Akun nonaktif</h1><p>Hubungi Owner.</p><button class="btn" id="logout">Keluar</button></div></div>`; return;
  }
  if (!S.me.roles.length) {
    app.innerHTML = `<div class="login"><div class="login-card"><h1>Menunggu jabatan</h1><p>Akun <b>${esc(S.me.email)}</b> sudah terdaftar, tetapi belum diberi jabatan & cabang. Minta Owner mengatur di menu Pengguna & akses.</p><button class="btn" onclick="location.reload()">Muat ulang</button> <button class="btn ghost" id="logout">Keluar</button></div></div>`; return;
  }
  renderShell();
  lookups().catch(() => {});
  await render();
  updateBadges();
  if (!S.me.onboarded_at) setTimeout(() => startTour(), 600);
  clearInterval(window.__badgeTimer);
  window.__badgeTimer = setInterval(updateBadges, 60000);
}

window.addEventListener('hashchange', () => { if (S.me) { render(); } });
window.addEventListener('kp:changed', updateBadges);
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') renderLogin('reset');
  else if (ev === 'SIGNED_IN' && !S.me) boot();
  else if (ev === 'SIGNED_OUT') { S.me = null; renderLogin(); }
});

// ---------- PWA ----------
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredInstall = e;
  if (!localStorage.getItem('kp.noinstall')) $('#install')?.classList.add('show');
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
window.addEventListener('offline', () => toast('Koneksi terputus. Data tidak bisa disimpan sampai online lagi.', 'err'));
window.addEventListener('online', () => toast('Kembali online.'));

boot();
export { go };
