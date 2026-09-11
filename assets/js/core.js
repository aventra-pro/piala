// =====================================================================
//  Inti aplikasi: koneksi, status, komponen UI, router
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, BUCKET } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---------- status global ----------
export const S = {
  me: null,          // hasil rpc me()
  branch: localStorage.getItem('kp.branch') || '',   // '' = semua cabang (khusus HQ)
  cache: {},
};
export function setBranch(id) { S.branch = id || ''; localStorage.setItem('kp.branch', S.branch); S.cache = {}; }
export const branchName = (id) => S.me?.branches.find(b => b.id === id)?.name || '';
export const can = (m, a = 'v') => !!(S.me && (S.me.is_owner || S.me.perms?.[m]?.[a]));
export const hasRole = (r) => !!S.me?.roles?.some(x => x.code === r);
export const setting = (k) => S.me?.settings?.[k];

// ---------- format ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });
export const fmt = {
  rp: (n) => (n === null || n === undefined || n === '') ? '—' : 'Rp ' + nf0.format(Math.round(Number(n))),
  n: (n) => (n === null || n === undefined || n === '') ? '—' : nf2.format(Number(n)),
  pct: (n) => (n === null || n === undefined) ? '—' : nf2.format(Number(n)) + '%',
  date: (d) => d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  dt: (d) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—',
  ago: (d) => {
    if (!d) return '—';
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    return days <= 0 ? 'hari ini' : days + ' hari';
  },
};
export const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);   // WIB
export const daysAgo = (n) => new Date(Date.now() + 7 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
export const monthStart = () => today().slice(0, 8) + '01';
export const sum = (arr, f) => arr.reduce((a, x) => a + (Number(typeof f === 'function' ? f(x) : x[f]) || 0), 0);
export function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}

// ---------- data ----------
export function errMsg(e) {
  let m = e?.message || String(e);
  m = m.replace(/^.*?ERROR:\s*/, '').replace(/\s*CONTEXT:.*$/s, '');
  if (/JWT|token/i.test(m)) m = 'Sesi login berakhir. Silakan masuk lagi.';
  if (/Failed to fetch|NetworkError/i.test(m)) m = 'Tidak ada koneksi internet. Periksa jaringan lalu coba lagi.';
  if (/permission denied/i.test(m)) m = 'Akses ditolak oleh database untuk aksi ini.';
  return m;
}
export async function q(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(errMsg(error));
  return data;
}
export async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(errMsg(error));
  return data;
}
/** menjalankan aksi dengan toast otomatis */
export async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(errMsg(e), 'err'); throw e; }
}

/** data referensi yang sering dipakai, di-cache per sesi */
export async function lookups(force = false) {
  if (S.cache.lk && !force) return S.cache.lk;
  const [products, locations, channels, banks, branches, suppliers, profiles, adjReasons, retReasons, expCats, roles] = await Promise.all([
    q(sb.from('products').select('*').order('sku')),
    q(sb.from('stock_locations').select('*').order('code')),
    q(sb.from('sales_channels').select('*').order('name')),
    q(sb.from('bank_accounts').select('*').order('bank_name')),
    q(sb.from('branches').select('*').order('code')),
    q(sb.from('suppliers').select('*').order('name')),
    q(sb.from('profiles').select('id,full_name,email,active').order('full_name')),
    q(sb.from('adjustment_reasons').select('*')),
    q(sb.from('return_reasons').select('*')),
    q(sb.from('expense_categories').select('*')),
    q(sb.from('roles').select('*').order('sort')),
  ]);
  const lk = { products, locations, channels, banks, branches, suppliers, profiles, adjReasons, retReasons, expCats, roles };
  lk.prod = Object.fromEntries(products.map(p => [p.id, p]));
  lk.loc = Object.fromEntries(locations.map(l => [l.id, l]));
  lk.ch = Object.fromEntries(channels.map(c => [c.id, c]));
  lk.br = Object.fromEntries(branches.map(b => [b.id, b]));
  lk.user = Object.fromEntries(profiles.map(p => [p.id, p]));
  lk.bank = Object.fromEntries(banks.map(b => [b.id, b]));
  lk.sup = Object.fromEntries(suppliers.map(s => [s.id, s]));
  S.cache.lk = lk;
  return lk;
}
export const uname = (lk, id) => id ? (lk.user[id]?.full_name || lk.user[id]?.email || '—') : '—';
/** lokasi yang boleh dipakai user (sesuai cabang aktif) */
export function myLocations(lk, kinds = ['main']) {
  const ids = new Set(S.me.branches.map(b => b.id));
  return lk.locations.filter(l => l.active && kinds.includes(l.kind) && (!l.branch_id || ids.has(l.branch_id))
    && (!S.branch || l.branch_id === S.branch || !l.branch_id));
}
export function mainLoc(lk, branchId) { return lk.locations.find(l => l.branch_id === branchId && l.kind === 'main'); }
/** cabang aktif; kalau "semua cabang", minta pilih */
export async function needBranch() {
  if (S.branch) return S.branch;
  if (S.me.branches.length === 1) return S.me.branches[0].id;
  const v = await formModal({
    title: 'Pilih cabang', submitLabel: 'Lanjut',
    fields: [{ name: 'b', label: 'Cabang untuk transaksi ini', type: 'select', required: true, options: S.me.branches.map(b => ({ value: b.id, label: b.name })) }],
  });
  return v?.b || null;
}
/** filter query berdasarkan cabang aktif */
export function byBranch(builder, col = 'branch_id') { return S.branch ? builder.eq(col, S.branch) : builder; }
export function byLocBranch(builder, lk, col = 'location_id') {
  if (!S.branch) return builder;
  const ids = lk.locations.filter(l => l.branch_id === S.branch).map(l => l.id);
  return builder.in(col, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
}

// ---------- DOM ----------
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export function on(root, sel, ev, fn) {
  root.addEventListener(ev, (e) => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); });
}

export const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12l5 5L20 6"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v11m-5-5l5 5 5-5M5 20h14"/></svg>',
};

// ---------- komponen kecil ----------
export const plate = (no, cls = '') => no ? `<span class="plate ${cls}">${esc(no)}</span>` : '';
export const spinner = () => '<div class="spinner" role="status" aria-label="Memuat"></div>';
export const emptyBox = (title, hint = '') => `<div class="empty"><strong>${esc(title)}</strong>${esc(hint)}</div>`;

const STATUS = {
  draft: ['Draft', ''], quotation: ['Penawaran', 'info'], in_production: ['Produksi', 'info'], ready: ['Siap kirim', 'warn'],
  shipped: ['Dikirim', 'info'], completed: ['Selesai', 'ok'], cancelled: ['Batal', 'danger'], void: ['Void', 'danger'],
  pending: ['Menunggu', 'warn'], verified: ['Terverifikasi', 'ok'], rejected: ['Ditolak', 'danger'], approved: ['Disetujui', 'ok'],
  pending_approval: ['Menunggu approval', 'warn'], partial: ['Diterima sebagian', 'warn'], received: ['Diterima', 'ok'], closed: ['Ditutup', ''],
  in_transit: ['Dalam perjalanan', 'warn'], received_diff: ['Ada selisih', 'danger'], resolved: ['Selisih diselesaikan', 'ok'],
  counting: ['Sedang dihitung', 'info'], submitted: ['Menunggu approval', 'warn'],
  waiting_design: ['Menunggu desain', ''], waiting_approval: ['Menunggu ACC', 'warn'], in_progress: ['Dikerjakan', 'info'], qc: ['QC', 'warn'], done: ['Selesai', 'ok'],
  packing: ['Packing', 'info'], packed: ['Siap kirim', 'warn'], delivered: ['Diterima', 'ok'],
  expected: ['Menunggu barang', 'warn'], dispositioned: ['Selesai', 'ok'],
  matched: ['Cocok', 'ok'], blocked: ['Diblokir', 'danger'], paid: ['Lunas', 'ok'],
  open: ['Buka', 'info'], submitted_claim: ['Diajukan', 'warn'],
  available: ['Tersedia', 'ok'], used: ['Terpakai', ''], scrapped: ['Dibuang', 'danger'],
  none: ['—', ''],
};
export const chip = (s, label) => { const [l, c] = STATUS[s] || [s, '']; return `<span class="chip ${c}">${esc(label || l)}</span>`; };

export const CATEGORY = { piala_rakitan: 'Piala rakitan', akrilik_custom: 'Akrilik custom', barang_jadi: 'Barang jadi', komponen: 'Komponen', bahan_baku: 'Bahan baku', jasa: 'Jasa' };
export const LOCKIND = { main: 'Utama', in_transit: 'In transit', quarantine: 'Karantina', scrap: 'Scrap', offcut: 'Sisa bahan' };
export const METHOD = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS', edc: 'EDC / kartu', marketplace: 'Marketplace' };

export function pageHead(title, sub = '', actions = '') {
  return `<div class="page-head"><div class="t"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
}

/**
 * tabel generik. cols: [{k, l, f:(row)=>html, cls, foot}]
 * rows diberi data-i agar bisa diklik.
 */
export function table(cols, rows, opt = {}) {
  if (!rows?.length) return emptyBox(opt.empty || 'Belum ada data', opt.emptyHint || '');
  const head = cols.map(c => `<th class="${c.cls || ''}">${esc(c.l)}</th>`).join('');
  const body = rows.map((r, i) => `<tr data-i="${i}" class="${opt.click ? 'click' : ''} ${opt.rowCls ? opt.rowCls(r) : ''}">` +
    cols.map(c => `<td class="${c.cls || ''}" data-l="${esc(c.l)}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join('') + '</tr>').join('');
  const foot = cols.some(c => c.foot) ? '<tfoot><tr>' + cols.map(c => `<td class="${c.cls || ''}" data-l="${esc(c.l)}">${c.foot ? c.foot(rows) : ''}</td>`).join('') + '</tr></tfoot>' : '';
  return `<div class="tbl-wrap"><table class="tbl ${opt.cards === false ? '' : 'cards'}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}
export function bindRows(root, rows, fn) {
  on(root, 'tbody tr[data-i]', 'click', (e, tr) => { if (e.target.closest('button,a,input,select')) return; fn(rows[+tr.dataset.i], e); });
}
export function tabs(items, active) {
  return `<div class="tabs" role="tablist">${items.map(t => `<button role="tab" data-tab="${t.k}" class="${t.k === active ? 'on' : ''}">${esc(t.l)}${t.n ? ` <span class="badge">${t.n}</span>` : ''}</button>`).join('')}</div>`;
}

// ---------- toast ----------
let toastBox;
export function toast(msg, type = 'ok') {
  toastBox ||= document.body.appendChild(h('<div class="toasts" aria-live="polite"></div>'));
  const t = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  toastBox.appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 7000 : 3200);
}

// ---------- modal ----------
export function modal({ title, body = '', actions = [], size = '', onClose }) {
  const back = h(`<div class="modal-back"><div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="mh"><h2>${esc(title)}</h2><button class="btn ghost icon" data-x aria-label="Tutup">${ICON.x}</button></div>
    <div class="mb"></div><div class="mf"></div></div></div>`);
  const mb = $('.mb', back), mf = $('.mf', back);
  if (typeof body === 'string') mb.innerHTML = body; else mb.appendChild(body);
  const close = () => { back.remove(); document.removeEventListener('keydown', esc_); onClose?.(); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  $('[data-x]', back).onclick = close;
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  for (const a of actions) {
    const b = h(`<button class="btn ${a.kind || ''}">${esc(a.label)}</button>`);
    b.onclick = async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try { const r = await a.onClick({ close, body: mb, btn: b }); if (r !== false) close(); }
      catch (e) { showErr(mb, e); }
      finally { b.disabled = false; }
    };
    mf.appendChild(b);
  }
  if (!actions.length) mf.remove();
  document.body.appendChild(back);
  setTimeout(() => $('input:not([type=hidden]):not([readonly]),select,textarea', mb)?.focus(), 30);
  return { el: back, body: mb, close };
}
export function showErr(root, e) {
  let box = $('.err', root);
  if (!box) { box = h('<div class="note danger err" role="alert"></div>'); root.appendChild(box); }
  box.textContent = errMsg(e);
  box.scrollIntoView({ block: 'nearest' });
}

/** konfirmasi dengan catatan wajib/opsional. Mengembalikan catatan (string) atau null. */
export function ask(title, message, { note = true, minLen = 5, label = 'Catatan', okLabel = 'Lanjutkan', danger = false, placeholder = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: `<p>${message}</p>${note ? `<label class="f ${minLen ? 'req' : ''}"><span>${esc(label)}</span><textarea data-note placeholder="${esc(placeholder)}"></textarea>${minLen ? `<small>Minimal ${minLen} karakter.</small>` : ''}</label>` : ''}`,
      actions: [
        { label: 'Batal' },
        { label: okLabel, kind: danger ? 'danger solid' : 'primary', onClick: ({ body }) => {
          const v = note ? $('[data-note]', body).value.trim() : '';
          if (note && v.length < minLen) throw new Error(`${label} minimal ${minLen} karakter.`);
          done = true; resolve(v || ' ');
        } },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

// ---------- form ----------
/**
 * field: {name,label,type,required,options,hint,value,min,step,span,placeholder,accept,readonly}
 * type: text|number|money|date|select|textarea|checkbox|photo|file|email|tel|password|info|product
 */
export function fieldsHTML(fields, values = {}) {
  return `<div class="grid g2">${fields.map(f => fieldHTML(f, values[f.name] ?? f.value)).join('')}</div>`;
}
function fieldHTML(f, v) {
  const span = f.span === 2 || ['textarea', 'info'].includes(f.type) ? 'span-all' : '';
  const req = f.required ? 'req' : '';
  const hint = f.hint ? `<small>${f.hint}</small>` : '';
  const attrs = `name="${f.name}" ${f.required ? 'required' : ''} ${f.readonly ? 'readonly' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}`;
  switch (f.type) {
    case 'info': return `<div class="span-all">${f.html || ''}</div>`;
    case 'hidden': return `<input type="hidden" ${attrs} value="${esc(v ?? '')}">`;
    case 'checkbox': return `<label class="chk ${span}"><input type="checkbox" ${attrs} ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
    case 'textarea': return `<label class="f ${req} ${span}"><span>${esc(f.label)}</span><textarea ${attrs}>${esc(v ?? '')}</textarea>${hint}</label>`;
    case 'select': return `<label class="f ${req} ${span}"><span>${esc(f.label)}</span><select ${attrs}>${f.required ? '' : '<option value="">—</option>'}${
      (f.options || []).map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(v ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${hint}</label>`;
    case 'photo': case 'file': return `<label class="f ${req} span-all"><span>${esc(f.label)}</span>
      <div class="photo-in"><input type="file" name="${f.name}" accept="${f.accept || (f.type === 'photo' ? 'image/*' : 'image/*,application/pdf')}" ${f.type === 'photo' ? 'capture="environment"' : ''}>
      ${v ? '<span class="chip ok">sudah ada</span>' : ''}<img hidden alt=""></div>${hint}</label>`;
    case 'money': case 'number':
      return `<label class="f ${req} ${span}"><span>${esc(f.label)}</span><input type="number" inputmode="decimal" step="${f.step || 'any'}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${attrs} value="${esc(v ?? '')}">${hint}</label>`;
    default:
      return `<label class="f ${req} ${span}"><span>${esc(f.label)}</span><input type="${f.type || 'text'}" ${attrs} value="${esc(v ?? '')}">${hint}</label>`;
  }
}
export function bindPhotoPreviews(root) {
  $$('input[type=file]', root).forEach(inp => inp.addEventListener('change', () => {
    const img = inp.parentElement.querySelector('img');
    const f = inp.files[0];
    if (img && f && f.type.startsWith('image/')) { img.src = URL.createObjectURL(f); img.hidden = false; }
  }));
}
export function readFields(root, fields, values = {}) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'info') continue;
    const el = root.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'photo' || f.type === 'file') out[f.name] = el.files[0] || values[f.name] || null;
    else if (f.type === 'number' || f.type === 'money') out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = el.value.trim();
    if (f.required && (out[f.name] === null || out[f.name] === '' || out[f.name] === undefined)) throw new Error(`${f.label} wajib diisi.`);
  }
  return out;
}
/** modal form. onSubmit(values) boleh async; kalau melempar error, modal tetap terbuka. */
export function formModal({ title, fields, values = {}, submitLabel = 'Simpan', onSubmit, size = '', intro = '' }) {
  return new Promise((resolve) => {
    let result = null;
    const m = modal({
      title, size,
      body: `${intro}<form onsubmit="return false">${fieldsHTML(fields, values)}</form>`,
      actions: [{ label: 'Batal' }, {
        label: submitLabel, kind: 'primary', onClick: async ({ body }) => {
          const v = readFields(body, fields, values);
          result = onSubmit ? await onSubmit(v) : v;
          if (result === undefined) result = v;
        },
      }],
      onClose: () => resolve(result),
    });
    bindPhotoPreviews(m.body);
  });
}

// ---------- berkas (bukti, foto) ----------
async function compress(file, max = 1600) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  return blob && blob.size < file.size ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file;
}
/** unggah berkas; kalau v sudah berupa path string, dikembalikan apa adanya */
export async function upl(v, folder) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  const f = await compress(v);
  const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${folder}/${today().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error('Gagal mengunggah berkas: ' + error.message);
  return path;
}
const urlCache = new Map();
export async function fileUrl(path) {
  if (!path) return null;
  if (urlCache.has(path)) return urlCache.get(path);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  urlCache.set(path, data.signedUrl);
  return data.signedUrl;
}
export async function viewFile(path, title = 'Bukti') {
  const url = await fileUrl(path);
  if (!url) return toast('Berkas tidak ditemukan.', 'err');
  if (/\.pdf$/i.test(path)) return window.open(url, '_blank');
  modal({ title, body: `<img class="proof" src="${url}" alt="${esc(title)}"><p class="small muted" style="margin-top:8px"><a href="${url}" target="_blank" rel="noopener">Buka ukuran penuh</a></p>`, size: 'wide' });
}
export const fileBtn = (path, label = 'Lihat bukti') => path ? `<button class="btn sm" data-file="${esc(path)}" data-ft="${esc(label)}">${esc(label)}</button>` : '<span class="muted small">—</span>';
export function bindFiles(root) { on(root, '[data-file]', 'click', (e, b) => { e.stopPropagation(); viewFile(b.dataset.file, b.dataset.ft); }); }

// ---------- scanner barcode / QR (kamera HP) ----------
export async function scanCode(title = 'Scan barcode / QR') {
  return new Promise(async (resolve) => {
    let stream, stop = false, done = false;
    const hasDetector = 'BarcodeDetector' in window;
    const m = modal({
      title,
      body: `<div class="scanner">${hasDetector ? '<video playsinline muted></video>' : '<p class="note warn">Kamera scanner tidak didukung browser ini. Ketik kodenya, atau pakai scanner USB.</p>'}
        <label class="f" style="margin-top:10px"><span>Atau ketik / tembak scanner</span><input data-code autocomplete="off" inputmode="text"></label></div>`,
      actions: [{ label: 'Batal' }, { label: 'Pakai kode', kind: 'primary', onClick: ({ body }) => { const v = $('[data-code]', body).value.trim(); if (!v) throw new Error('Kode kosong.'); done = true; resolve(v); } }],
      onClose: () => { stop = true; stream?.getTracks().forEach(t => t.stop()); if (!done) resolve(null); },
    });
    $('[data-code]', m.body).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { done = true; resolve(e.target.value.trim()); m.close(); } });
    if (!hasDetector) return;
    try {
      const video = $('video', m.body);
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream; await video.play();
      const det = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a'] });
      const loop = async () => {
        if (stop) return;
        try { const r = await det.detect(video); if (r[0]?.rawValue) { done = true; navigator.vibrate?.(60); resolve(r[0].rawValue); m.close(); return; } } catch { /* frame belum siap */ }
        requestAnimationFrame(loop);
      };
      loop();
    } catch { $('video', m.body)?.replaceWith(h('<p class="note warn">Izin kamera ditolak. Ketik kode secara manual.</p>')); }
  });
}
export function findProduct(lk, code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return null;
  return lk.products.find(p => p.sku.toLowerCase() === c || (p.barcode || '').toLowerCase() === c)
    || lk.products.find(p => `${p.sku} · ${p.name}`.toLowerCase() === c) || null;
}
export function productDatalist(lk, filter = () => true) {
  let dl = document.getElementById('dl-products');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-products'; document.body.appendChild(dl); }
  dl.innerHTML = lk.products.filter(p => p.active && filter(p)).map(p => `<option value="${esc(p.sku + ' · ' + p.name)}"></option>`).join('');
  return 'dl-products';
}

/**
 * editor baris barang. opts: {price, cost, engraving, filter, priceOf(p), serial}
 * mengembalikan {el, get(): lines[]}
 */
export function lineEditor(lk, lines = [], opts = {}) {
  const dl = productDatalist(lk, opts.filter || (() => true));
  const el = h(`<div><table class="lines"><thead><tr><th>Barang</th><th style="width:100px">Jumlah</th>
    ${opts.price ? '<th style="width:140px">Harga</th>' : ''}${opts.cost ? '<th style="width:140px">Harga/HPP satuan</th>' : ''}
    ${opts.engraving ? '<th>Teks grafir</th>' : ''}<th style="width:40px"></th></tr></thead><tbody></tbody></table>
    <div class="actions" style="margin-top:8px"><button type="button" class="btn sm" data-add>${ICON.plus} Tambah baris</button>
    <button type="button" class="btn sm" data-scan>${ICON.scan} Scan</button><span class="small muted" data-total></span></div></div>`);
  const tb = $('tbody', el);
  const row = (l = {}) => {
    const p = lk.prod[l.product_id];
    const tr = h(`<tr><td class="wide" data-l="Barang"><input list="${dl}" data-p placeholder="Ketik SKU atau nama" value="${p ? esc(p.sku + ' · ' + p.name) : ''}"><div class="pname small muted" data-info></div></td>
      <td data-l="Jumlah"><input type="number" inputmode="decimal" step="any" min="0" data-q value="${l.qty ?? 1}"></td>
      ${opts.price ? `<td data-l="Harga"><input type="number" inputmode="decimal" step="any" min="0" data-pr value="${l.price ?? ''}"></td>` : ''}
      ${opts.cost ? `<td data-l="Harga satuan"><input type="number" inputmode="decimal" step="any" min="0" data-c value="${l.unit_cost ?? l.price ?? ''}"></td>` : ''}
      ${opts.engraving ? `<td class="wide" data-l="Teks grafir"><input data-en value="${esc(l.engraving_text || '')}" placeholder="Nama/juara/acara"></td>` : ''}
      <td data-l=""><button type="button" class="btn ghost icon sm" data-del aria-label="Hapus baris">${ICON.x}</button></td></tr>`);
    tr._pid = l.product_id || null;
    const inp = $('[data-p]', tr);
    const setP = () => {
      const pr = findProduct(lk, inp.value);
      tr._pid = pr?.id || null;
      $('[data-info]', tr).textContent = pr ? `${CATEGORY[pr.category]} · ${pr.uom}${opts.info ? ' · ' + opts.info(pr) : ''}` : (inp.value ? 'Produk tidak dikenal' : '');
      if (pr && opts.price && !$('[data-pr]', tr).value && opts.priceOf) $('[data-pr]', tr).value = opts.priceOf(pr);
      if (pr && opts.cost && !$('[data-c]', tr).value && opts.costOf) $('[data-c]', tr).value = opts.costOf(pr);
      calc();
    };
    inp.addEventListener('change', setP);
    if (p) setTimeout(setP);
    tb.appendChild(tr);
    return tr;
  };
  const calc = () => {
    if (!opts.price) return;
    const t = get(true).reduce((a, l) => a + (l.qty || 0) * (l.price || 0), 0);
    $('[data-total]', el).textContent = 'Subtotal ' + fmt.rp(t);
    opts.onChange?.(t);
  };
  const get = (loose = false) => $$('tr', tb).map(tr => ({
    product_id: tr._pid, qty: Number($('[data-q]', tr).value),
    ...(opts.price ? { price: $('[data-pr]', tr).value === '' ? null : Number($('[data-pr]', tr).value) } : {}),
    ...(opts.cost ? { unit_cost: $('[data-c]', tr).value === '' ? null : Number($('[data-c]', tr).value) } : {}),
    ...(opts.engraving ? { engraving_text: $('[data-en]', tr).value.trim() } : {}),
  })).filter(l => loose || l.product_id || l.qty);
  on(el, '[data-add]', 'click', () => $('[data-p]', row()).focus());
  on(el, '[data-del]', 'click', (e, b) => { b.closest('tr').remove(); calc(); });
  on(el, 'input', 'input', calc);
  on(el, '[data-scan]', 'click', async () => {
    const code = await scanCode(); if (!code) return;
    const p = findProduct(lk, code); if (!p) return toast('Kode tidak dikenal: ' + code, 'err');
    const exist = $$('tr', tb).find(tr => tr._pid === p.id);
    if (exist) { const qi = $('[data-q]', exist); qi.value = Number(qi.value || 0) + 1; calc(); return; }
    const tr = row({ product_id: p.id, qty: 1 }); if (opts.price && opts.priceOf) $('[data-pr]', tr).value = opts.priceOf(p);
  });
  (lines.length ? lines : [{}]).forEach(row);
  return {
    el, get: () => {
      const ls = get();
      if (!ls.length) throw new Error('Isi minimal satu barang.');
      ls.forEach((l, i) => { if (!l.product_id) throw new Error(`Baris ${i + 1}: pilih produk dari daftar.`); if (!(l.qty > 0)) throw new Error(`Baris ${i + 1}: jumlah harus lebih dari 0.`); });
      return ls;
    },
  };
}

// ---------- CSV ----------
export function toCSV(rows, cols) {
  const e = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map(c => e(c.l)).join(','), ...rows.map(r => cols.map(c => e(c.csv ? c.csv(r) : r[c.k])).join(','))].join('\n');
}
export function downloadCSV(name, rows, cols) {
  const blob = new Blob(['\ufeff' + toCSV(rows, cols)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(x => x.trim() !== ''));
  const head = (clean.shift() || []).map(x => x.replace(/^\ufeff/, '').trim());
  return { head, rows: clean.map(r => Object.fromEntries(head.map((k, i) => [k, (r[i] ?? '').trim()]))) };
}

// ---------- cetak ----------
export function printHTML(inner, { width = '', title = 'Cetak' } = {}) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const w = width ? `@page{size:${width} auto;margin:3mm} body{width:${width}}` : '@page{margin:12mm}';
  f.contentDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    ${w} body{font-family:Archivo,Arial,sans-serif;font-size:12px;color:#000;margin:0}
    table{width:100%;border-collapse:collapse} td,th{padding:3px 4px;text-align:left;vertical-align:top} .r{text-align:right}
    .line td{border-bottom:1px dashed #999} h1{font-size:16px;margin:0 0 4px} .muted{color:#555} .c{text-align:center}
    .box{border:1px solid #000;padding:6px;margin-top:8px} th{border-bottom:1px solid #000}
  </style></head><body>${inner}</body></html>`);
  f.contentDocument.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 350);
}
/** memuat pustaka dari CDN hanya saat dibutuhkan */
const loaded = {};
export function loadScript(src) {
  return loaded[src] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + src)); document.head.appendChild(s); });
}

// ---------- WhatsApp ----------
export function waLink(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('0')) p = '62' + p.slice(1);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

// ---------- router ----------
const routes = {};
export function route(name, def) { routes[name] = def; }
export const allRoutes = () => routes;
export function parseHash() {
  const [path, qs] = (location.hash.replace(/^#\/?/, '') || '').split('?');
  return { name: path || 'home', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export function go(name, params = {}) {
  const qs = new URLSearchParams(params).toString();
  location.hash = '#/' + name + (qs ? '?' + qs : '');
}
export function refresh() { window.dispatchEvent(new HashChangeEvent('hashchange')); }
export function routeAllowed(def) { return !def.perm || (typeof def.perm === 'function' ? def.perm() : def.perm.some(p => can(p))); }

/** beri tahu kerangka bahwa data berubah (badge approval/alert diperbarui) */
export const changed = () => window.dispatchEvent(new Event('kp:changed'));
