// Persediaan: stok, kartu stok, transfer, opname, penyesuaian, alokasi channel, label
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go, refresh,
  modal, formModal, upl, fileBtn, bindFiles, lineEditor, scanCode, findProduct, myLocations, byLocBranch, needBranch, mainLoc,
  tabs, on, $, $$, h, ICON, printHTML, downloadCSV, changed, emptyBox, CATEGORY, LOCKIND, sum, today, setting } from '../core.js';

const locOpts = (lk, kinds = ['main', 'quarantine', 'scrap', 'offcut', 'in_transit']) =>
  myLocations(lk, kinds).map(l => ({ value: l.id, label: `${lk.br[l.branch_id]?.name || 'Global'} · ${l.name}` }));

// ---------------------------------------------------------------------
route('stock', {
  title: 'Stok per lokasi', perm: ['stock'],
  async render(el, params) {
    const lk = await lookups();
    let b = sb.from('v_stock').select('*').order('sku').limit(3000);
    b = byLocBranch(b, lk);
    if (params.loc) b = b.eq('location_id', params.loc);
    else b = b.in('loc_kind', ['main', 'quarantine']);
    if (params.cat) b = b.eq('category', params.cat);
    let rows = await q(b);
    if (params.s) { const k = params.s.toLowerCase(); rows = rows.filter(r => (r.sku + ' ' + r.name).toLowerCase().includes(k)); }
    if (params.low) rows = rows.filter(r => r.min_stock > 0 && Number(r.qty) < Number(r.min_stock));
    const low = rows.filter(r => r.min_stock > 0 && Number(r.qty) < Number(r.min_stock)).length;
    el.innerHTML = pageHead('Stok per lokasi', 'Angka di sini hanya berubah lewat dokumen: penerimaan, penjualan, transfer, produksi, opname, atau penyesuaian yang disetujui.',
      `<button class="btn" id="csv">${ICON.dl} Unduh CSV</button>${can('opname', 'c') ? '<a class="btn" href="#/opname">Stock opname</a>' : ''}`) +
      `<form class="filters" id="flt"><input type="search" name="s" placeholder="Cari SKU / nama" value="${esc(params.s || '')}">
        <select name="loc"><option value="">Semua lokasi (utama & karantina)</option>${locOpts(lk).map(o => `<option value="${o.value}" ${params.loc === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
        <select name="cat"><option value="">Semua kategori</option>${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}" ${params.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" name="low" value="1" ${params.low ? 'checked' : ''}> Di bawah minimum${low ? ` (${low})` : ''}</label>
        <button class="btn">Terapkan</button></form>` +
      `<div class="metrics" style="margin-bottom:14px"><div class="metric"><div class="l">Nilai persediaan (tampil)</div><div class="v">${fmt.rp(sum(rows, 'value'))}</div></div>
        <div class="metric"><div class="l">SKU di bawah minimum</div><div class="v">${low}</div></div></div>` +
      table([
        { l: 'SKU', f: r => `<b>${esc(r.sku)}</b><br><span class="small muted">${esc(r.name)}</span>` },
        { l: 'Lokasi', f: r => `${esc(r.branch_name || 'Global')}<br><span class="small muted">${esc(r.location_name)}</span>` },
        { l: 'Fisik', cls: 'num', f: r => fmt.n(r.qty) }, { l: 'Dipesan', cls: 'num', f: r => fmt.n(r.reserved) },
        { l: 'Dialokasi channel', cls: 'num', f: r => fmt.n(r.allocated) },
        { l: 'Bisa dijual', cls: 'num', f: r => `<b>${fmt.n(Number(r.available) - Number(r.allocated))}</b>` },
        { l: 'Min', cls: 'num', f: r => r.min_stock > 0 ? fmt.n(r.min_stock) : '—' },
        { l: 'HPP rata-rata', cls: 'num', f: r => fmt.rp(r.avg_cost) }, { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.value), foot: rs => fmt.rp(sum(rs, 'value')) },
      ], rows, { click: true, empty: 'Tidak ada stok', rowCls: r => r.min_stock > 0 && Number(r.qty) < Number(r.min_stock) ? 'warn' : '' });
    $('#flt', el).onsubmit = (e) => { e.preventDefault(); go('stock', Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v))); };
    $('#csv', el).onclick = () => downloadCSV('stok-' + today(), rows, [{ l: 'SKU', k: 'sku' }, { l: 'Nama', k: 'name' }, { l: 'Cabang', k: 'branch_name' }, { l: 'Lokasi', k: 'location_name' },
      { l: 'Fisik', k: 'qty' }, { l: 'Dipesan', k: 'reserved' }, { l: 'HPP', k: 'avg_cost' }, { l: 'Nilai', k: 'value' }]);
    bindRows(el, rows, r => go('ledger', { p: r.product_id, loc: r.location_id }));
  },
});

// ---------------------------------------------------------------------
route('ledger', {
  title: 'Kartu stok', perm: ['stock'],
  async render(el, params) {
    const lk = await lookups();
    let b = sb.from('v_ledger').select('*').order('at', { ascending: false }).limit(500);
    b = byLocBranch(b, lk);
    if (params.p) b = b.eq('product_id', params.p);
    if (params.loc) b = b.eq('location_id', params.loc);
    const rows = await q(b);
    const p = params.p ? lk.prod[params.p] : null;
    el.innerHTML = pageHead('Kartu stok', p ? `${esc(p.sku)} · ${esc(p.name)}` : 'Setiap pergerakan stok, lengkap dengan dokumen dan siapa yang melakukannya. Baris di sini tidak bisa diubah atau dihapus.',
      `<button class="btn" id="csv">${ICON.dl} Unduh CSV</button>`) +
      `<form class="filters" id="flt"><input name="p" list="dl-p" placeholder="Semua produk" value="${p ? esc(p.sku + ' · ' + p.name) : ''}">
        <datalist id="dl-p">${lk.products.map(x => `<option value="${esc(x.sku + ' · ' + x.name)}"></option>`).join('')}</datalist>
        <select name="loc"><option value="">Semua lokasi</option>${locOpts(lk).map(o => `<option value="${o.value}" ${params.loc === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
        <button class="btn">Terapkan</button></form>` +
      table([
        { l: 'Waktu', f: r => fmt.dt(r.at) }, { l: 'Produk', f: r => `${esc(r.sku)}<br><span class="small muted">${esc(r.name)}</span>` },
        { l: 'Lokasi', f: r => esc(r.location_name) }, { l: 'Dokumen', f: r => `${plate(r.doc_no)}<br><span class="small muted">${esc(r.doc_type)}</span>` },
        { l: 'Masuk', cls: 'num', f: r => Number(r.qty) > 0 ? fmt.n(r.qty) : '' }, { l: 'Keluar', cls: 'num', f: r => Number(r.qty) < 0 ? fmt.n(-r.qty) : '' },
        { l: 'HPP satuan', cls: 'num', f: r => fmt.rp(r.unit_cost) }, { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.value) },
        { l: 'Serial', f: r => esc(r.serial || '') }, { l: 'Oleh', f: r => `${esc(r.user_name || '—')}<br><span class="small muted">${esc(r.note || '')}</span>` },
      ], rows, { empty: 'Belum ada pergerakan' });
    $('#flt', el).onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const pr = findProduct(lk, f.p);
      go('ledger', { ...(pr ? { p: pr.id } : {}), ...(f.loc ? { loc: f.loc } : {}) });
    };
    $('#csv', el).onclick = () => downloadCSV('kartu-stok-' + today(), rows, [{ l: 'Waktu', k: 'at' }, { l: 'SKU', k: 'sku' }, { l: 'Lokasi', k: 'location_name' },
      { l: 'Dokumen', k: 'doc_no' }, { l: 'Qty', k: 'qty' }, { l: 'HPP', k: 'unit_cost' }, { l: 'Nilai', k: 'value' }, { l: 'Oleh', k: 'user_name' }]);
  },
});

// ---------------------------------------------------------------------
route('transfers', {
  title: 'Transfer stok', perm: ['transfer'],
  async render(el, params) {
    const lk = await lookups();
    const tab = params.t || 'in_transit';
    let b = sb.from('stock_transfers').select('*, transfer_lines(*)').order('sent_at', { ascending: false }).limit(300);
    if (tab !== 'all') b = b.eq('status', tab);
    const rows = await q(b);
    const aging = Number(setting('transit_aging_days') || 3);
    el.innerHTML = pageHead('Transfer stok', 'Transfer dua langkah: barang masuk "dalam perjalanan" saat dikirim, dan baru jadi stok cabang setelah penerima menghitung ulang. Selisih wajib diselesaikan dengan berita acara.',
      can('transfer', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Kirim barang</button>` : '') +
      tabs([{ k: 'in_transit', l: 'Dalam perjalanan' }, { k: 'received_diff', l: 'Ada selisih' }, { k: 'received', l: 'Diterima' }, { k: 'resolved', l: 'Selisih selesai' }, { k: 'all', l: 'Semua' }], tab) +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Dari', f: r => esc(lk.loc[r.from_location_id]?.name) }, { l: 'Ke', f: r => esc(lk.loc[r.to_location_id]?.name) },
        { l: 'Barang', f: r => r.transfer_lines.map(l => `${esc(lk.prod[l.product_id]?.sku)} ${fmt.n(l.qty_sent)}${l.qty_received !== null && Number(l.qty_received) !== Number(l.qty_sent) ? ` → <b>${fmt.n(l.qty_received)}</b>` : ''}`).join('<br>') },
        { l: 'Dikirim', f: r => `${fmt.dt(r.sent_at)}<br><span class="small muted">${esc(uname(lk, r.sent_by))}</span>` },
        { l: 'Diterima', f: r => r.received_at ? `${fmt.dt(r.received_at)}<br><span class="small muted">${esc(uname(lk, r.received_by))}</span>` : `<span class="${Math.floor((Date.now() - new Date(r.sent_at)) / 86400e3) > aging ? 'chip danger' : 'muted'}">menunggu ${fmt.ago(r.sent_at)}</span>` },
        { l: 'Selisih', cls: 'num', f: r => Number(r.diff_value) ? fmt.rp(r.diff_value) : '—' },
        { l: 'Status', f: r => chip(r.status) + (r.responsible ? `<br><span class="small">PJ: ${esc(r.responsible)}</span>` : '') },
        { l: '', f: r => r.status === 'in_transit' && can('transfer', 'c') ? '<button class="btn sm primary" data-recv>Terima</button>' : '' },
      ], rows, { empty: 'Tidak ada transfer', rowCls: r => r.status === 'received_diff' ? 'bad' : '' });
    on(el, '[data-tab]', 'click', (e, b2) => go('transfers', { t: b2.dataset.tab }));
    $('#new', el)?.addEventListener('click', async () => {
      const froms = locOpts(lk, ['main']);
      const tos = lk.locations.filter(l => l.active && l.kind === 'main').map(l => ({ value: l.id, label: `${lk.br[l.branch_id]?.name} · ${l.name}` }));
      const le = lineEditor(lk, [], {});
      const body = h(`<div class="stack"><div class="grid g2">
        <label class="f req"><span>Dari lokasi</span><select data-from>${froms.map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></label>
        <label class="f req"><span>Ke lokasi</span><select data-to>${tos.map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></label></div>
        <label class="f"><span>Catatan / nama pengantar</span><input data-note></label></div>`);
      body.appendChild(le.el);
      modal({ title: 'Kirim barang antar lokasi', body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Kirim', kind: 'primary', onClick: async () => {
        await rpc('transfer_send', { p: { from_location_id: $('[data-from]', body).value, to_location_id: $('[data-to]', body).value, note: $('[data-note]', body).value, lines: le.get() } });
        toast('Barang dikirim. Stok masuk "dalam perjalanan" sampai penerima mengonfirmasi.'); changed(); refresh();
      } }] });
    });
    on(el, '[data-recv]', 'click', async (e, b2) => {
      const t = rows[+b2.closest('tr').dataset.i];
      const body = h(`<div class="stack"><p class="note warn small">Hitung ulang fisik barang sebelum mengisi. Selisih apa pun akan memicu berita acara dan harus ada penanggung jawab.</p>
        <table class="lines"><thead><tr><th>Barang</th><th style="width:110px">Dikirim</th><th style="width:110px">Diterima</th></tr></thead><tbody>${
        t.transfer_lines.map(l => `<tr data-id="${l.id}"><td data-l="Barang">${esc(lk.prod[l.product_id]?.sku)} ${esc(lk.prod[l.product_id]?.name)}</td>
          <td data-l="Dikirim" class="num">${fmt.n(l.qty_sent)}</td><td data-l="Diterima"><input type="number" step="any" min="0" data-q value="${l.qty_sent}"></td></tr>`).join('')}</tbody></table>
        <label class="f"><span>Catatan penerimaan</span><textarea data-note></textarea></label></div>`);
      modal({ title: 'Terima ' + t.no, body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Konfirmasi terima', kind: 'primary', onClick: async () => {
        const lines = $$('tbody tr', body).map(tr => ({ line_id: tr.dataset.id, qty_received: Number($('[data-q]', tr).value || 0) }));
        const st = await rpc('transfer_receive', { p_id: t.id, p_lines: lines, p_note: $('[data-note]', body).value });
        toast(st === 'received_diff' ? 'Ada selisih — menunggu berita acara dari atasan.' : 'Barang diterima.'); changed(); refresh();
      } }] });
    });
  },
});

// ---------------------------------------------------------------------
route('opname', {
  title: 'Stock opname', perm: ['opname'],
  async render(el, params) {
    const lk = await lookups();
    if (params.id) return opnameSheet(el, params.id, lk);
    const rows = await q(sb.from('stock_opnames').select('*').order('created_at', { ascending: false }).limit(200));
    el.innerHTML = pageHead('Stock opname', 'Penghitungan buta: sistem tidak menampilkan jumlah tercatat saat menghitung, supaya angka tidak "disesuaikan". Selisih wajib disetujui atasan.',
      can('opname', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Mulai opname</button>` : '') +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Jenis', f: r => chip(r.kind === 'cycle' ? 'info' : 'dark', r.kind === 'cycle' ? 'Cycle count' : 'Opname penuh') },
        { l: 'Lokasi', f: r => esc(lk.loc[r.location_id]?.name) }, { l: 'Dibuat', f: r => `${fmt.date(r.created_at)}<br><span class="small muted">${esc(uname(lk, r.created_by))}</span>` },
        { l: 'Penghitung', f: r => esc(uname(lk, r.counted_by)) }, { l: 'Selisih nilai', cls: 'num', f: r => r.status === 'counting' ? '—' : fmt.rp(r.diff_value) },
        { l: 'Status', f: r => chip(r.status) }, { l: 'Disetujui', f: r => r.approved_by ? `${esc(uname(lk, r.approved_by))}<br><span class="small muted">${esc(r.approve_note || '')}</span>` : '—' },
      ], rows, { click: true, empty: 'Belum ada opname' });
    bindRows(el, rows, r => go('opname', { id: r.id }));
    $('#new', el)?.addEventListener('click', async () => {
      await formModal({ title: 'Mulai stock opname', submitLabel: 'Buat lembar hitung',
        intro: '<p class="note small">Cycle count memilih SKU paling laris untuk dihitung rutin tanpa menutup toko. Opname penuh menghitung seluruh isi lokasi.</p>',
        fields: [{ name: 'loc', label: 'Lokasi', type: 'select', required: true, options: locOpts(lk, ['main', 'quarantine']) },
          { name: 'kind', label: 'Jenis', type: 'select', required: true, options: [{ value: 'cycle', label: 'Cycle count (sebagian)' }, { value: 'full', label: 'Opname penuh' }] },
          { name: 'sample', label: 'Jumlah SKU untuk cycle count', type: 'number', value: 20 }, { name: 'note', label: 'Catatan' }],
        onSubmit: async v => { const id = await rpc('opname_create', { p_location: v.loc, p_kind: v.kind, p_sample: v.sample || 20, p_note: v.note }); go('opname', { id }); } });
    });
  },
});

async function opnameSheet(el, id, lk) {
  const o = await q(sb.from('stock_opnames').select('*, opname_lines(*)').eq('id', id).single());
  const lines = o.opname_lines.map(l => ({ ...l, p: lk.prod[l.product_id] })).sort((a, b) => (a.p?.sku || '').localeCompare(b.p?.sku || ''));
  const counting = o.status === 'counting';
  const blind = counting;   // hitung buta: sistem disembunyikan sampai disubmit
  el.innerHTML = `<p><a href="#/opname">← Semua opname</a></p>` +
    pageHead('Lembar hitung', `${plate(o.no, 'lg')} ${chip(o.status)} · ${esc(lk.loc[o.location_id]?.name)}`,
      counting ? `<button class="btn" id="scan">${ICON.scan} Scan</button><button class="btn" id="save">Simpan sementara</button><button class="btn primary" id="submit">Kirim untuk approval</button>` :
        `<button class="btn" id="print">${ICON.print} Cetak</button>`) +
    (blind ? '<p class="note small">Jumlah menurut sistem sengaja disembunyikan. Hitung fisik apa adanya — selisih bukan kesalahan yang perlu ditutupi, justru itu yang dicari.</p>' : '') +
    table([
      { l: 'SKU', f: r => `<b>${esc(r.p?.sku)}</b><br><span class="small muted">${esc(r.p?.name)}</span>` },
      ...(blind ? [] : [{ l: 'Sistem', cls: 'num', f: r => fmt.n(r.system_qty) }]),
      { l: 'Hitungan fisik', cls: 'num', f: r => counting ? `<input type="number" step="any" min="0" data-id="${r.id}" value="${r.counted_qty ?? ''}" style="max-width:110px">` : fmt.n(r.counted_qty) },
      ...(blind ? [] : [
        { l: 'Selisih', cls: 'num', f: r => { const d = Number(r.counted_qty) - Number(r.system_qty); return d ? `<b style="color:${d < 0 ? 'var(--danger)' : 'var(--ok)'}">${d > 0 ? '+' : ''}${fmt.n(d)}</b>` : '—'; } },
        { l: 'Nilai selisih', cls: 'num', f: r => fmt.rp((Number(r.counted_qty) - Number(r.system_qty)) * Number(r.unit_cost)) }]),
    ], lines, { cards: false, empty: 'Tidak ada baris' });
  if (!counting) el.innerHTML += `<p class="small muted" style="margin-top:10px">Selisih total ${fmt.rp(o.diff_value)}. ${o.approve_note ? 'Catatan approval: ' + esc(o.approve_note) : ''}</p>`;
  const collect = () => $$('[data-id]', el).map(i => ({ line_id: i.dataset.id, counted_qty: i.value === '' ? null : Number(i.value) })).filter(x => x.counted_qty !== null);
  $('#save', el)?.addEventListener('click', async () => { try { await rpc('opname_count', { p_id: id, p_lines: collect() }); toast('Disimpan.'); } catch (e) { toast(errMsg(e), 'err'); } });
  $('#submit', el)?.addEventListener('click', async () => {
    const blanks = $$('[data-id]', el).filter(i => i.value === '').length;
    const c = await ask('Kirim hasil hitung', blanks ? `${blanks} baris belum diisi dan akan dianggap 0. Lanjutkan?` : 'Setelah dikirim, hitungan tidak bisa diubah dan selisih akan diajukan ke atasan.', { note: false, okLabel: 'Kirim' });
    if (c === null) return;
    try { await rpc('opname_count', { p_id: id, p_lines: collect() }); const d = await rpc('opname_submit', { p_id: id }); toast('Terkirim. Selisih ' + fmt.rp(d)); changed(); refresh(); }
    catch (e) { toast(errMsg(e), 'err'); }
  });
  $('#scan', el)?.addEventListener('click', async () => {
    const c = await scanCode('Scan SKU untuk lompat ke barisnya'); if (!c) return;
    const p = findProduct(lk, c); const row = lines.find(l => l.product_id === p?.id);
    if (!row) return toast('SKU tidak ada di lembar ini.', 'err');
    const inp = $(`[data-id="${row.id}"]`, el); inp.scrollIntoView({ block: 'center' }); inp.focus(); inp.select();
  });
  $('#print', el)?.addEventListener('click', () => printHTML(`<h1>${esc(o.no)}</h1><p>${esc(lk.loc[o.location_id]?.name)} · ${fmt.date(o.created_at)}</p>
    <table><thead><tr><th>SKU</th><th>Nama</th><th class="r">Sistem</th><th class="r">Fisik</th><th class="r">Selisih</th></tr></thead><tbody>${
      lines.map(l => `<tr><td>${esc(l.p?.sku)}</td><td>${esc(l.p?.name)}</td><td class="r">${fmt.n(l.system_qty)}</td><td class="r">${fmt.n(l.counted_qty)}</td><td class="r">${fmt.n(Number(l.counted_qty) - Number(l.system_qty))}</td></tr>`).join('')}</tbody></table>`, { title: o.no }));
}

// ---------------------------------------------------------------------
route('adjustments', {
  title: 'Penyesuaian stok', perm: ['adjustment'],
  async render(el) {
    const lk = await lookups();
    const rows = await q(sb.from('stock_adjustments').select('*, adjustment_lines(*)').order('requested_at', { ascending: false }).limit(300));
    el.innerHTML = pageHead('Penyesuaian stok', 'Dipakai hanya untuk barang rusak, hilang, atau koreksi yang jelas sebabnya — bukan untuk "merapikan" angka. Semua perlu alasan, foto, dan approval.',
      can('adjustment', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Ajukan penyesuaian</button>` : '') +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Lokasi', f: r => esc(lk.loc[r.location_id]?.name) },
        { l: 'Alasan', f: r => `<b>${esc(lk.adjReasons.find(x => x.code === r.reason_code)?.name)}</b><br><span class="small muted">${esc(r.note)}</span>` },
        { l: 'Barang', f: r => r.adjustment_lines.map(l => `${esc(lk.prod[l.product_id]?.sku)} ${Number(l.qty) > 0 ? '+' : ''}${fmt.n(l.qty)}`).join('<br>') },
        { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.total_value) },
        { l: 'Pengaju', f: r => `${esc(uname(lk, r.requested_by))}<br><span class="small muted">${fmt.date(r.requested_at)}</span>` },
        { l: 'Status', f: r => chip(r.status) + (r.decide_note ? `<br><span class="small muted">${esc(r.decide_note)}</span>` : '') },
        { l: 'Foto', f: r => fileBtn(r.photo_path, 'Foto') },
      ], rows, { empty: 'Belum ada penyesuaian' });
    bindFiles(el);
    $('#new', el)?.addEventListener('click', async () => {
      const le = lineEditor(lk, [], { cost: false });
      const body = h(`<div class="stack">
        <p class="note warn small">Isi jumlah <b>positif untuk menambah</b> dan <b>negatif untuk mengurangi</b>. Penyesuaian besar butuh approval kantor pusat.</p>
        <div class="grid g2"><label class="f req"><span>Lokasi</span><select data-loc>${locOpts(lk, ['main', 'quarantine', 'scrap']).map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></label>
        <label class="f req"><span>Alasan</span><select data-reason>${lk.adjReasons.map(r => `<option value="${r.code}">${esc(r.name)}</option>`).join('')}</select></label></div>
        <label class="f req"><span>Penjelasan (min. 10 karakter)</span><textarea data-note placeholder="Apa yang terjadi, kapan, siapa yang tahu"></textarea></label>
        <label class="f req"><span>Foto bukti</span><div class="photo-in"><input type="file" accept="image/*" capture="environment" data-photo><img hidden alt=""></div></label></div>`);
      body.insertBefore(le.el, $('[data-note]', body).parentElement);
      $('[data-photo]', body).addEventListener('change', e => { const f = e.target.files[0]; const i = $('img', body); if (f) { i.src = URL.createObjectURL(f); i.hidden = false; } });
      modal({ title: 'Ajukan penyesuaian stok', body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Ajukan', kind: 'primary', onClick: async () => {
        const f = $('[data-photo]', body).files[0];
        if (!f) throw new Error('Foto bukti wajib diunggah.');
        const lines = le.get().map(l => ({ ...l, qty: l.qty }));
        await rpc('adjustment_create', { p: { location_id: $('[data-loc]', body).value, reason_code: $('[data-reason]', body).value, note: $('[data-note]', body).value, photo_path: await upl(f, 'penyesuaian'), lines } });
        toast('Diajukan, menunggu approval.'); changed(); refresh();
      } }] });
    });
  },
});

// ---------------------------------------------------------------------
route('allocation', {
  title: 'Alokasi channel', perm: ['allocation'],
  async render(el, params) {
    const lk = await lookups();
    const loc = params.loc || myLocations(lk, ['main'])[0]?.id;
    if (!loc) { el.innerHTML = emptyBox('Tidak ada lokasi'); return; }
    const [stock, allocs] = await Promise.all([
      q(sb.from('v_stock').select('*').eq('location_id', loc).gt('qty', 0).order('sku')),
      q(sb.from('channel_allocations').select('*').eq('location_id', loc)),
    ]);
    const mps = lk.channels.filter(c => c.active && c.kind === 'marketplace');
    const at = (p, c) => allocs.find(a => a.product_id === p && a.channel_id === c)?.qty ?? 0;
    el.innerHTML = pageHead('Alokasi stok per channel', 'Batasi berapa unit yang boleh terjual di tiap marketplace supaya stok satu unit tidak dijual dobel di beberapa tempat. Sisanya tetap bisa dijual di toko.') +
      `<div class="filters"><select id="loc">${locOpts(lk, ['main']).map(o => `<option value="${o.value}" ${o.value === loc ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>` +
      table([
        { l: 'SKU', f: r => `<b>${esc(r.sku)}</b><br><span class="small muted">${esc(r.name)}</span>` },
        { l: 'Fisik', cls: 'num', f: r => fmt.n(r.qty) }, { l: 'Dipesan', cls: 'num', f: r => fmt.n(r.reserved) },
        ...mps.map(c => ({ l: c.name, cls: 'num', f: r => can('allocation', 'e') ? `<input type="number" step="any" min="0" style="max-width:90px" data-p="${r.product_id}" data-c="${c.id}" value="${at(r.product_id, c.id)}">` : fmt.n(at(r.product_id, c.id)) })),
        { l: 'Sisa untuk toko', cls: 'num', f: r => fmt.n(Number(r.qty) - Number(r.reserved) - Number(r.allocated)) },
      ], stock, { cards: false, empty: 'Tidak ada stok di lokasi ini' });
    $('#loc', el).onchange = (e) => go('allocation', { loc: e.target.value });
    on(el, '[data-p]', 'change', async (e, i) => {
      try { await rpc('allocation_set', { p_product: i.dataset.p, p_location: loc, p_channel: i.dataset.c, p_qty: Number(i.value || 0) }); toast('Alokasi disimpan.'); refresh(); }
      catch (err) { toast(errMsg(err), 'err'); }
    });
  },
});

// ---------------------------------------------------------------------
route('labels', {
  title: 'Label barcode & serial', perm: ['stock'],
  async render(el) {
    const lk = await lookups();
    el.innerHTML = pageHead('Label barcode & serial', 'Cetak label untuk ditempel di rak atau unit. Barcode memakai SKU sehingga langsung terbaca saat scan di kasir, packing, dan opname.') +
      `<section class="panel"><div class="pb stack">
        <div class="grid g3"><label class="f req"><span>Produk</span><input id="p" list="dl-lbl" placeholder="Ketik SKU / nama"><datalist id="dl-lbl">${lk.products.filter(p => p.active).map(p => `<option value="${esc(p.sku + ' · ' + p.name)}"></option>`).join('')}</datalist></label>
          <label class="f"><span>Jumlah label</span><input type="number" id="n" value="12" min="1" max="200"></label>
          <label class="f"><span>Isi barcode</span><select id="mode"><option value="sku">SKU produk</option><option value="serial">Nomor serial unit (untuk barang bernomor)</option></select></label></div>
        <div id="serialBox" class="hide"><label class="f"><span>Daftar serial (satu per baris)</span><textarea id="serials" rows="5" placeholder="PRM-0001&#10;PRM-0002"></textarea></label></div>
        <div class="actions"><button class="btn primary" id="print">${ICON.print} Cetak label</button></div>
        <p class="small muted">Tip: tempel label di rak, bukan hanya di barang. Saat opname, petugas memindai rak lalu menghitung isinya.</p>
      </div></section>`;
    $('#mode', el).onchange = (e) => $('#serialBox', el).classList.toggle('hide', e.target.value !== 'serial');
    $('#print', el).onclick = async () => {
      const p = findProduct(lk, $('#p', el).value);
      if (!p) return toast('Pilih produk dari daftar.', 'err');
      const mode = $('#mode', el).value;
      const codes = mode === 'serial'
        ? $('#serials', el).value.split('\n').map(s => s.trim()).filter(Boolean)
        : Array(Math.min(200, Number($('#n', el).value) || 1)).fill(p.barcode || p.sku);
      if (!codes.length) return toast('Isi daftar serial.', 'err');
      const svg = (code) => {
        // Code 39 sederhana: cukup untuk pemindai umum dan kamera HP
        const PAT = { '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101', '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011', '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011', 'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101', 'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101', 'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011', 'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001', 'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011', 'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101', '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101' };
        const txt = '*' + String(code).toUpperCase().replace(/[^0-9A-Z\-. ]/g, '-') + '*';
        let x = 0, bars = '';
        for (const ch of txt) {
          const pat = PAT[ch] || PAT['-'];
          for (let i = 0; i < pat.length; i++) { const w = pat[i] === '1' ? 2 : 1; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="40" fill="#000"/>`; x += w; }
          x += 1;
        }
        return `<svg viewBox="0 0 ${x} 40" width="150" height="34" preserveAspectRatio="none">${bars}</svg>`;
      };
      printHTML(`<div style="display:flex;flex-wrap:wrap;gap:4mm">${codes.map(c => `<div style="width:48mm;border:1px dashed #bbb;padding:2mm;text-align:center">
        <div style="font-size:9px;font-weight:bold">${esc(p.name.slice(0, 28))}</div>${svg(c)}<div style="font-size:10px;letter-spacing:1px">${esc(c)}</div>
        ${mode === 'sku' ? `<div style="font-size:8px;color:#555">${esc(p.uom)}</div>` : ''}</div>`).join('')}</div>`, { title: 'Label ' + p.sku });
    };
  },
});
