// Master data: produk, BOM, cabang, channel, pelanggan, supplier, rekening, pengguna, pengaturan, audit
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go, refresh, modal, formModal, upl, fileBtn, bindFiles, lineEditor, tabs, on, $, $$, h, ICON, downloadCSV, changed, emptyBox, CATEGORY, LOCKIND, today, sum, setting } from '../core.js';

const save = async (tblName, row, id) => id ? q(sb.from(tblName).update(row).eq('id', id)) : q(sb.from(tblName).insert(row));

// ---------------------------------------------------------------------
route('products', {
  title: 'Produk & SKU', perm: ['products'],
  async render(el, params) {
    const lk = await lookups(true);
    let rows = lk.products;
    if (params.cat) rows = rows.filter(p => p.category === params.cat);
    if (params.s) { const k = params.s.toLowerCase(); rows = rows.filter(p => (p.sku + ' ' + p.name).toLowerCase().includes(k)); }
    if (!params.inactive) rows = rows.filter(p => p.active);
    el.innerHTML = pageHead('Produk & SKU', 'Setiap barang punya satu SKU. HPP dihitung otomatis dari pembelian dan produksi — tidak bisa diketik manual.',
      can('products', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Produk baru</button><button class="btn" id="csv">${ICON.dl} CSV</button>` : '') +
      `<form class="filters" id="flt"><input type="search" name="s" placeholder="Cari SKU / nama" value="${esc(params.s || '')}">
        <select name="cat"><option value="">Semua kategori</option>${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}" ${params.cat === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" name="inactive" value="1" ${params.inactive ? 'checked' : ''}> Tampilkan nonaktif</label><button class="btn">Terapkan</button></form>` +
      table([
        { l: 'SKU', f: r => `<b>${esc(r.sku)}</b>${r.barcode ? `<br><span class="small muted">${esc(r.barcode)}</span>` : ''}` },
        { l: 'Nama', f: r => `${esc(r.name)}${r.active ? '' : ' <span class="chip">nonaktif</span>'}` },
        { l: 'Kategori', f: r => CATEGORY[r.category] + (r.requires_design ? '<br><span class="chip warn">perlu desain</span>' : '') + (r.track_serial ? '<br><span class="chip info">bernomor seri</span>' : '') },
        { l: 'Satuan', k: 'uom' },
        { l: 'Harga retail', cls: 'num', f: r => fmt.rp(r.price_retail) },
        { l: 'HPP rata-rata', cls: 'num', f: r => fmt.rp(r.avg_cost) },
        { l: 'Margin', cls: 'num', f: r => r.price_retail > 0 ? fmt.pct(((r.price_retail - r.avg_cost) / r.price_retail * 100).toFixed(1)) : '—' },
        { l: 'Min stok', cls: 'num', f: r => r.min_stock > 0 ? fmt.n(r.min_stock) : '—' },
      ], rows, { click: true, empty: 'Belum ada produk' });
    $('#flt', el).onsubmit = (e) => { e.preventDefault(); go('products', Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v))); };
    $('#csv', el)?.addEventListener('click', () => downloadCSV('produk-' + today(), rows, [{ l: 'SKU', k: 'sku' }, { l: 'Nama', k: 'name' }, { l: 'Kategori', k: 'category' },
      { l: 'Satuan', k: 'uom' }, { l: 'Harga retail', k: 'price_retail' }, { l: 'Harga reseller', k: 'price_reseller' }, { l: 'HPP', k: 'avg_cost' }, { l: 'Min stok', k: 'min_stock' }]));
    bindRows(el, rows, r => productForm(r, lk));
    $('#new', el)?.addEventListener('click', () => productForm(null, lk));
  },
});

async function productForm(p, lk) {
  const isNew = !p;
  await formModal({
    title: isNew ? 'Produk baru' : `${p.sku} · ${p.name}`, size: 'wide', submitLabel: 'Simpan',
    intro: p ? `<p class="small muted">HPP rata-rata ${fmt.rp(p.avg_cost)} — dihitung sistem dari pembelian & produksi.</p>` : '',
    fields: [
      { name: 'sku', label: 'SKU', required: true, value: p?.sku, hint: 'Kode unik, dipakai juga sebagai barcode kalau kolom barcode kosong.' },
      { name: 'name', label: 'Nama produk', required: true, value: p?.name },
      { name: 'category', label: 'Kategori', type: 'select', required: true, value: p?.category, options: Object.entries(CATEGORY).map(([value, label]) => ({ value, label })) },
      { name: 'uom', label: 'Satuan', value: p?.uom || 'pcs' },
      { name: 'barcode', label: 'Barcode (opsional)', value: p?.barcode },
      { name: 'product_group', label: 'Kelompok (untuk laporan)', value: p?.product_group },
      { name: 'size', label: 'Ukuran', value: p?.size }, { name: 'color', label: 'Warna', value: p?.color },
      { name: 'price_retail', label: 'Harga retail', type: 'number', value: p?.price_retail ?? 0 },
      { name: 'price_reseller', label: 'Harga reseller', type: 'number', value: p?.price_reseller },
      { name: 'price_instansi', label: 'Harga instansi', type: 'number', value: p?.price_instansi },
      { name: 'std_cost', label: 'Perkiraan harga beli', type: 'number', value: p?.std_cost, hint: 'Hanya acuan saat membuat PO.' },
      { name: 'labor_cost', label: 'Ongkos tenaga kerja per unit', type: 'number', value: p?.labor_cost ?? 0, hint: 'Dipakai untuk produk rakitan/custom.' },
      { name: 'waste_pct', label: 'Perkiraan waste (%)', type: 'number', value: p?.waste_pct ?? 0, hint: 'Untuk akrilik: sisa potong yang wajar.' },
      { name: 'min_stock', label: 'Stok minimum', type: 'number', value: p?.min_stock ?? 0 },
      { name: 'sheet_w_mm', label: 'Lebar lembar (mm)', type: 'number', value: p?.sheet_w_mm },
      { name: 'sheet_h_mm', label: 'Tinggi lembar (mm)', type: 'number', value: p?.sheet_h_mm },
      { name: 'requires_design', label: 'Perlu desain & ACC pelanggan', type: 'checkbox', value: p?.requires_design },
      { name: 'track_serial', label: 'Setiap unit punya nomor seri', type: 'checkbox', value: p?.track_serial },
      { name: 'is_stock', label: 'Barang berstok (hilangkan centang untuk jasa)', type: 'checkbox', value: p ? p.is_stock : true },
      { name: 'active', label: 'Aktif', type: 'checkbox', value: p ? p.active : true },
    ],
    onSubmit: async (v) => {
      const row = { ...v, price_reseller: v.price_reseller || null, price_instansi: v.price_instansi || null, std_cost: v.std_cost || null,
        sheet_w_mm: v.sheet_w_mm || null, sheet_h_mm: v.sheet_h_mm || null, barcode: v.barcode || null, product_group: v.product_group || null, size: v.size || null, color: v.color || null };
      await save('products', row, p?.id);
    },
  });
  await lookups(true); toast('Tersimpan.'); refresh();
}

// ---------------------------------------------------------------------
route('bom', {
  title: 'BOM / resep', perm: ['bom'],
  async render(el, params) {
    const lk = await lookups(true);
    const assembled = lk.products.filter(p => ['piala_rakitan', 'akrilik_custom', 'barang_jadi'].includes(p.category) && p.active);
    const pid = params.p || assembled[0]?.id;
    if (!pid) { el.innerHTML = pageHead('BOM / resep') + emptyBox('Belum ada produk rakitan'); return; }
    const [lines, allBom] = await Promise.all([
      q(sb.from('bom_lines').select('*').eq('product_id', pid)),
      q(sb.from('bom_lines').select('product_id')),
    ]);
    const p = lk.prod[pid];
    const hasBom = new Set(allBom.map(b => b.product_id));
    const cost = sum(lines, l => Number(l.qty) * Number(lk.prod[l.component_id]?.avg_cost || 0));
    const total = cost * (1 + Number(p.waste_pct || 0) / 100) + Number(p.labor_cost || 0);
    el.innerHTML = pageHead('BOM / resep produk', 'Daftar komponen untuk satu unit produk jadi. Dipakai untuk menghitung HPP dan mengambil bahan saat produksi.',
      can('bom', 'e') ? `<button class="btn primary" id="edit">Ubah resep</button><button class="btn" id="recalc">Hitung ulang HPP semua</button>` : '') +
      `<div class="filters"><select id="p">${assembled.map(x => `<option value="${x.id}" ${x.id === pid ? 'selected' : ''}>${esc(x.sku)} · ${esc(x.name)}${hasBom.has(x.id) ? '' : ' (belum ada resep)'}</option>`).join('')}</select></div>
       <div class="cols"><section class="panel"><div class="pb">${table([
        { l: 'Komponen', f: r => `<b>${esc(lk.prod[r.component_id]?.sku)}</b><br><span class="small muted">${esc(lk.prod[r.component_id]?.name)}</span>` },
        { l: 'Jumlah', cls: 'num', f: r => `${fmt.n(r.qty)} ${esc(lk.prod[r.component_id]?.uom || '')}` },
        { l: 'Ukuran potong', f: r => r.cut_w_mm ? `${fmt.n(r.cut_w_mm)} × ${fmt.n(r.cut_h_mm)} mm` : '—' },
        { l: 'HPP komponen', cls: 'num', f: r => fmt.rp(lk.prod[r.component_id]?.avg_cost) },
        { l: 'Biaya', cls: 'num', f: r => fmt.rp(Number(r.qty) * Number(lk.prod[r.component_id]?.avg_cost || 0)), foot: () => fmt.rp(cost) },
      ], lines, { empty: 'Resep belum diisi', emptyHint: 'Tekan "Ubah resep" untuk menambahkan komponen.' })}</div></section>
      <section class="panel"><div class="ph"><h2>Perhitungan HPP</h2></div><div class="pb"><dl class="kv">
        <dt>Bahan</dt><dd class="num">${fmt.rp(cost)}</dd><dt>Waste ${fmt.pct(p.waste_pct || 0)}</dt><dd class="num">${fmt.rp(cost * Number(p.waste_pct || 0) / 100)}</dd>
        <dt>Tenaga kerja</dt><dd class="num">${fmt.rp(p.labor_cost)}</dd><dt><b>HPP standar</b></dt><dd class="num"><b>${fmt.rp(total)}</b></dd>
        <dt>HPP tercatat</dt><dd class="num">${fmt.rp(p.avg_cost)}</dd>
        <dt>Harga jual</dt><dd class="num">${fmt.rp(p.price_retail)}</dd>
        <dt>Margin</dt><dd class="num">${p.price_retail > 0 ? fmt.pct(((p.price_retail - total) / p.price_retail * 100).toFixed(1)) : '—'}</dd></dl>
        <p class="small muted" style="margin-top:10px">HPP standar dipakai untuk produk rakitan saat barang jadi masuk stok.</p></div></section></div>`;
    $('#p', el).onchange = (e) => go('bom', { p: e.target.value });
    $('#recalc', el)?.addEventListener('click', async () => { try { const n = await rpc('recalc_costs'); toast(`${n} produk diperbarui.`); await lookups(true); refresh(); } catch (e) { toast(errMsg(e), 'err'); } });
    $('#edit', el)?.addEventListener('click', () => {
      const le = lineEditor(lk, lines.map(l => ({ product_id: l.component_id, qty: l.qty })), { filter: x => x.id !== pid && x.category !== 'jasa', info: x => `HPP ${fmt.rp(x.avg_cost)}` });
      modal({ title: 'Resep ' + p.name, body: le.el, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Simpan resep', kind: 'primary', onClick: async () => {
        const ls = le.get();
        await q(sb.from('bom_lines').delete().eq('product_id', pid));
        await q(sb.from('bom_lines').insert(ls.map(l => ({ product_id: pid, component_id: l.product_id, qty: l.qty }))));
        await rpc('recalc_costs').catch(() => {});
        toast('Resep disimpan.'); await lookups(true); refresh();
      } }] });
    });
  },
});

// ---------------------------------------------------------------------
route('branches', {
  title: 'Cabang & lokasi', perm: ['branches'],
  async render(el) {
    const lk = await lookups(true);
    el.innerHTML = pageHead('Cabang & lokasi stok', 'Setiap cabang otomatis punya empat lokasi: utama, karantina retur, scrap, dan sisa bahan. Stok selalu melekat pada lokasi, bukan cabang saja.',
      can('branches', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Cabang baru</button>` : '') +
      lk.branches.map(b => `<section class="panel" style="margin-bottom:12px"><div class="ph"><h2>${esc(b.name)}</h2>${chip(b.kind === 'warehouse' ? 'dark' : 'info', b.kind === 'warehouse' ? 'Gudang' : 'Cabang')}${b.active ? '' : chip('', 'nonaktif')}
        <span class="grow" style="flex:1"></span>${can('branches', 'e') ? `<button class="btn sm" data-edit="${b.id}">Ubah</button>` : ''}</div>
        <div class="pb"><dl class="kv"><dt>Kode</dt><dd>${esc(b.code)}</dd><dt>Alamat</dt><dd>${esc(b.address || '—')}</dd><dt>Telepon</dt><dd>${esc(b.phone || '—')}</dd>
        <dt>Lokasi stok</dt><dd>${lk.locations.filter(l => l.branch_id === b.id).map(l => `${esc(l.name)} <span class="small muted">(${LOCKIND[l.kind]})</span>`).join('<br>') || '—'}</dd></dl></div></section>`).join('');
    const form = async (b) => {
      await formModal({ title: b ? 'Ubah ' + b.name : 'Cabang baru',
        intro: b ? '' : '<p class="note small">Saat disimpan, sistem langsung membuat lokasi Utama, Karantina, Scrap, dan Sisa bahan untuk cabang ini.</p>',
        fields: [{ name: 'code', label: 'Kode', required: true, value: b?.code, hint: 'Singkat, mis. KJ1, HQ.' }, { name: 'name', label: 'Nama cabang', required: true, value: b?.name },
          { name: 'kind', label: 'Jenis', type: 'select', required: true, value: b?.kind, options: [{ value: 'branch', label: 'Cabang penjualan' }, { value: 'warehouse', label: 'Gudang pusat' }] },
          { name: 'phone', label: 'Telepon', value: b?.phone }, { name: 'address', label: 'Alamat', type: 'textarea', value: b?.address },
          { name: 'active', label: 'Aktif', type: 'checkbox', value: b ? b.active : true }],
        onSubmit: v => save('branches', v, b?.id) });
      await lookups(true); toast('Tersimpan.'); refresh();
    };
    $('#new', el)?.addEventListener('click', () => form(null));
    on(el, '[data-edit]', 'click', (e, b) => form(lk.br[b.dataset.edit]));
  },
});

// ---------------------------------------------------------------------
route('channels', {
  title: 'Channel penjualan', perm: ['channels'],
  async render(el) {
    const lk = await lookups(true);
    el.innerHTML = pageHead('Channel penjualan', 'Biaya admin dipakai untuk menghitung laba bersih per channel dan memperkirakan uang yang akan cair dari marketplace.',
      can('channels', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Channel baru</button>` : '') +
      table([{ l: 'Kode', k: 'code' }, { l: 'Nama', f: r => esc(r.name) + (r.active ? '' : ' <span class="chip">nonaktif</span>') },
        { l: 'Jenis', f: r => ({ marketplace: 'Marketplace', offline: 'Toko fisik', chat: 'Chat / sosial media', website: 'Website', maps: 'Google Maps', b2b: 'B2B / instansi' })[r.kind] },
        { l: 'Biaya admin', cls: 'num', f: r => fmt.pct(r.admin_fee_pct) },
        { l: 'Pencairan', cls: 'num', f: r => r.settlement_days ? r.settlement_days + ' hari' : '—' }], lk.channels, { click: can('channels', 'e') });
    const form = async (c) => {
      await formModal({ title: c ? 'Ubah ' + c.name : 'Channel baru',
        fields: [{ name: 'code', label: 'Kode', required: true, value: c?.code }, { name: 'name', label: 'Nama', required: true, value: c?.name },
          { name: 'kind', label: 'Jenis', type: 'select', required: true, value: c?.kind, options: [['marketplace', 'Marketplace'], ['offline', 'Toko fisik'], ['chat', 'Chat / sosial media'], ['website', 'Website'], ['maps', 'Google Maps'], ['b2b', 'B2B / instansi']].map(([value, label]) => ({ value, label })) },
          { name: 'admin_fee_pct', label: 'Biaya admin (%)', type: 'number', value: c?.admin_fee_pct ?? 0 },
          { name: 'settlement_days', label: 'Lama pencairan (hari)', type: 'number', value: c?.settlement_days ?? 0 },
          { name: 'active', label: 'Aktif', type: 'checkbox', value: c ? c.active : true }],
        onSubmit: v => save('sales_channels', v, c?.id) });
      await lookups(true); toast('Tersimpan.'); refresh();
    };
    $('#new', el)?.addEventListener('click', () => form(null));
    bindRows(el, lk.channels, c => can('channels', 'e') && form(c));
  },
});

// ---------------------------------------------------------------------
route('customers', {
  title: 'Pelanggan', perm: ['customers'],
  async render(el, params) {
    const lk = await lookups();
    let b = sb.from('customers').select('*').order('name').limit(500);
    if (params.s) b = b.or(`name.ilike.%${params.s}%,phone.ilike.%${params.s}%,code.ilike.%${params.s}%`);
    const rows = await q(b);
    const ar = await q(sb.from('v_ar').select('customer_id, outstanding'));
    const open = new Map();
    ar.forEach(r => r.customer_id && open.set(r.customer_id, (open.get(r.customer_id) || 0) + Number(r.outstanding)));
    el.innerHTML = pageHead('Pelanggan', 'Limit kredit dan termin hanya bisa diubah keuangan. Pelanggan dengan tagihan macet otomatis tertahan saat pesan lagi.',
      can('customers', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Pelanggan baru</button>` : '') +
      `<form class="filters" id="flt"><input type="search" name="s" placeholder="Cari nama / HP / kode" value="${esc(params.s || '')}"><button class="btn">Cari</button></form>` +
      table([{ l: 'Nama', f: r => `<b>${esc(r.name)}</b>${r.blocked ? ' <span class="chip danger">diblokir</span>' : ''}<br><span class="small muted">${esc(r.code || '')}</span>` },
        { l: 'Jenis', f: r => ({ retail: 'Retail', reseller: 'Reseller', instansi: 'Instansi' })[r.kind] },
        { l: 'Kontak', f: r => `${esc(r.phone || '—')}<br><span class="small muted">${esc(r.email || '')}</span>` },
        { l: 'Limit kredit', cls: 'num', f: r => r.credit_limit > 0 ? fmt.rp(r.credit_limit) : '—' },
        { l: 'Termin', cls: 'num', f: r => r.terms_days ? r.terms_days + ' hari' : 'tunai' },
        { l: 'Piutang berjalan', cls: 'num', f: r => { const o = open.get(r.id) || 0; return o ? `<b style="color:${r.credit_limit > 0 && o > r.credit_limit ? 'var(--danger)' : 'inherit'}">${fmt.rp(o)}</b>` : '—'; } },
      ], rows, { click: true, empty: 'Belum ada pelanggan' });
    $('#flt', el).onsubmit = (e) => { e.preventDefault(); go('customers', Object.fromEntries(new FormData(e.target))); };
    const form = async (c) => {
      const fin = can('customers', 'a');
      await formModal({ title: c ? c.name : 'Pelanggan baru',
        fields: [{ name: 'name', label: 'Nama', required: true, value: c?.name }, { name: 'code', label: 'Kode (opsional)', value: c?.code },
          { name: 'kind', label: 'Jenis', type: 'select', required: true, value: c?.kind || 'retail', options: [['retail', 'Retail'], ['reseller', 'Reseller'], ['instansi', 'Instansi / sekolah']].map(([value, label]) => ({ value, label })) },
          { name: 'phone', label: 'No. HP / WA', value: c?.phone }, { name: 'email', label: 'Email', type: 'email', value: c?.email },
          { name: 'address', label: 'Alamat', type: 'textarea', value: c?.address },
          ...(fin ? [{ name: 'credit_limit', label: 'Limit kredit (Rp)', type: 'number', value: c?.credit_limit ?? 0, hint: 'Hanya keuangan yang boleh mengubah ini.' },
            { name: 'terms_days', label: 'Termin (hari)', type: 'number', value: c?.terms_days ?? 0 },
            { name: 'blocked', label: 'Blokir pelanggan ini', type: 'checkbox', value: c?.blocked }] : []),
          { name: 'active', label: 'Aktif', type: 'checkbox', value: c ? c.active : true }],
        onSubmit: v => save('customers', v, c?.id) });
      toast('Tersimpan.'); refresh();
    };
    $('#new', el)?.addEventListener('click', () => form(null));
    bindRows(el, rows, form);
  },
});

// ---------------------------------------------------------------------
route('suppliers', {
  title: 'Supplier', perm: ['suppliers'],
  async render(el) {
    const lk = await lookups(true);
    el.innerHTML = pageHead('Supplier', 'Lead time dipakai untuk memperkirakan kapan barang datang; termin untuk jatuh tempo faktur.',
      can('suppliers', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Supplier baru</button>` : '') +
      table([{ l: 'Nama', f: r => `<b>${esc(r.name)}</b><br><span class="small muted">${esc(r.code || '')}</span>` },
        { l: 'Kontak', f: r => `${esc(r.phone || '—')}<br><span class="small muted">${esc(r.email || '')}</span>` },
        { l: 'Lead time', cls: 'num', f: r => r.lead_time_days ? r.lead_time_days + ' hari' : '—' },
        { l: 'Termin', cls: 'num', f: r => r.terms_days ? r.terms_days + ' hari' : 'tunai' },
        { l: 'Status', f: r => r.active ? chip('ok', 'aktif') : chip('', 'nonaktif') }], lk.suppliers, { click: can('suppliers', 'e') });
    const form = async (s) => {
      await formModal({ title: s ? s.name : 'Supplier baru',
        fields: [{ name: 'name', label: 'Nama', required: true, value: s?.name }, { name: 'code', label: 'Kode', value: s?.code },
          { name: 'phone', label: 'Telepon', value: s?.phone }, { name: 'email', label: 'Email', type: 'email', value: s?.email },
          { name: 'address', label: 'Alamat', type: 'textarea', value: s?.address },
          { name: 'lead_time_days', label: 'Lead time (hari)', type: 'number', value: s?.lead_time_days ?? 0 },
          { name: 'terms_days', label: 'Termin pembayaran (hari)', type: 'number', value: s?.terms_days ?? 0 },
          { name: 'active', label: 'Aktif', type: 'checkbox', value: s ? s.active : true }],
        onSubmit: v => save('suppliers', v, s?.id) });
      await lookups(true); toast('Tersimpan.'); refresh();
    };
    $('#new', el)?.addEventListener('click', () => form(null));
    bindRows(el, lk.suppliers, s => can('suppliers', 'e') && form(s));
  },
});

// ---------------------------------------------------------------------
route('banks', {
  title: 'Rekening perusahaan', perm: ['banks'],
  async render(el) {
    const lk = await lookups(true);
    el.innerHTML = pageHead('Rekening perusahaan', 'Pembayaran pelanggan hanya boleh ke rekening yang terdaftar di sini. Ini yang mencegah uang masuk ke rekening pribadi karyawan.',
      can('banks', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Rekening baru</button>` : '') +
      table([{ l: 'Bank', f: r => `<b>${esc(r.bank_name)}</b><br><span class="small muted">${({ bank: 'Rekening bank', ewallet: 'E-wallet', qris: 'QRIS', marketplace: 'Saldo marketplace' })[r.kind]}</span>` },
        { l: 'No. rekening', k: 'account_no' }, { l: 'Atas nama', k: 'account_name' },
        { l: 'Cabang', f: r => r.branch_id ? esc(lk.br[r.branch_id]?.name) : 'Semua cabang' },
        { l: 'Status', f: r => r.active ? chip('ok', 'aktif') : chip('', 'nonaktif') }], lk.banks, { click: can('banks', 'e') });
    const form = async (b) => {
      await formModal({ title: b ? b.bank_name : 'Rekening baru',
        fields: [{ name: 'bank_name', label: 'Nama bank / penyedia', required: true, value: b?.bank_name },
          { name: 'account_no', label: 'No. rekening', required: true, value: b?.account_no },
          { name: 'account_name', label: 'Atas nama', required: true, value: b?.account_name, hint: 'Harus nama perusahaan, bukan pribadi.' },
          { name: 'kind', label: 'Jenis', type: 'select', required: true, value: b?.kind || 'bank', options: [['bank', 'Rekening bank'], ['ewallet', 'E-wallet'], ['qris', 'QRIS'], ['marketplace', 'Saldo marketplace']].map(([value, label]) => ({ value, label })) },
          { name: 'branch_id', label: 'Khusus cabang (opsional)', type: 'select', value: b?.branch_id, options: lk.branches.map(x => ({ value: x.id, label: x.name })) },
          { name: 'active', label: 'Aktif', type: 'checkbox', value: b ? b.active : true }],
        onSubmit: v => save('bank_accounts', { ...v, branch_id: v.branch_id || null }, b?.id) });
      await lookups(true); toast('Tersimpan.'); refresh();
    };
    $('#new', el)?.addEventListener('click', () => form(null));
    bindRows(el, lk.banks, b => can('banks', 'e') && form(b));
  },
});

// ---------------------------------------------------------------------
const MODULES = [
  ['dashboard', 'Dashboard'], ['reports', 'Laporan'], ['products', 'Produk'], ['bom', 'BOM'], ['branches', 'Cabang'], ['channels', 'Channel'],
  ['customers', 'Pelanggan'], ['suppliers', 'Supplier'], ['banks', 'Rekening'], ['users', 'Pengguna'], ['audit', 'Audit log'], ['settings', 'Pengaturan'],
  ['purchasing', 'Purchase order'], ['grn', 'Penerimaan barang'], ['sup_invoice', 'Faktur supplier'], ['payables', 'Utang supplier'],
  ['stock', 'Stok'], ['transfer', 'Transfer'], ['opname', 'Opname'], ['adjustment', 'Penyesuaian'], ['allocation', 'Alokasi channel'],
  ['production', 'Produksi'], ['design', 'Desain'], ['pos', 'Kasir'], ['sales', 'Pesanan'], ['logistics', 'Pengiriman'], ['claims', 'Klaim ekspedisi'],
  ['returns', 'Retur'], ['return_receive', 'Terima retur'], ['payments', 'Pembayaran'], ['receivables', 'Piutang'], ['cash', 'Kas'],
  ['expenses', 'Biaya'], ['bank_recon', 'Rekonsiliasi bank'], ['settlement', 'Settlement'], ['accounting', 'Akuntansi'],
];
const ACTS = [['can_view', 'L'], ['can_create', 'T'], ['can_edit', 'U'], ['can_approve', 'A']];

route('users', {
  title: 'Pengguna & akses', perm: ['users'],
  async render(el, params) {
    const lk = await lookups(true);
    const tab = params.t || 'users';
    if (tab === 'perms') return permMatrix(el, lk);
    const [profiles, urs, ubs] = await Promise.all([
      q(sb.from('profiles').select('*').order('full_name')),
      q(sb.from('user_roles').select('*')), q(sb.from('user_branches').select('*')),
    ]);
    el.innerHTML = pageHead('Pengguna & akses', 'Buat akun lewat Supabase → Authentication, lalu beri jabatan dan cabang di sini. Rangkap jabatan yang berbahaya otomatis ditolak sistem.') +
      tabs([{ k: 'users', l: 'Pengguna' }, { k: 'perms', l: 'Hak akses per jabatan' }], tab) +
      table([
        { l: 'Nama', f: r => `<b>${esc(r.full_name || '—')}</b><br><span class="small muted">${esc(r.email)}</span>` },
        { l: 'Jabatan', f: r => urs.filter(u => u.user_id === r.id).map(u => `<span class="chip dark">${esc(lk.roles.find(x => x.code === u.role)?.name || u.role)}</span>`).join(' ') || '<span class="chip warn">belum ada</span>' },
        { l: 'Cabang', f: r => { const g = urs.filter(u => u.user_id === r.id).some(u => lk.roles.find(x => x.code === u.role)?.is_global); return g ? 'Semua cabang' : (ubs.filter(u => u.user_id === r.id).map(u => esc(lk.br[u.branch_id]?.name)).join(', ') || '—'); } },
        { l: 'Status', f: r => r.active ? chip('ok', 'aktif') : chip('danger', 'nonaktif') },
      ], profiles, { click: true, empty: 'Belum ada pengguna' });
    on(el, '[data-tab]', 'click', (e, b) => go('users', { t: b.dataset.tab }));
    bindRows(el, profiles, async (p) => {
      const mine = urs.filter(u => u.user_id === p.id).map(u => u.role);
      const myBr = ubs.filter(u => u.user_id === p.id).map(u => u.branch_id);
      const body = h(`<div class="stack">
        <div class="grid g2"><label class="f"><span>Nama lengkap</span><input data-name value="${esc(p.full_name || '')}"></label>
        <label class="f"><span>No. HP</span><input data-phone value="${esc(p.phone || '')}"></label></div>
        <label class="chk"><input type="checkbox" data-active ${p.active ? 'checked' : ''}> Akun aktif</label>
        <div><h3>Jabatan</h3><p class="small muted">Sistem menolak rangkap jabatan yang membuka celah, misalnya pembelian merangkap penerima barang.</p>
          <div class="grid g2" style="margin-top:6px">${lk.roles.map(r => `<label class="chk"><input type="checkbox" data-role="${r.code}" ${mine.includes(r.code) ? 'checked' : ''}> ${esc(r.name)} <span class="small muted">(${esc(r.division)})</span></label>`).join('')}</div></div>
        <div><h3>Cabang</h3><div class="grid g2" style="margin-top:6px">${lk.branches.map(b => `<label class="chk"><input type="checkbox" data-br="${b.id}" ${myBr.includes(b.id) ? 'checked' : ''}> ${esc(b.name)}</label>`).join('')}</div></div></div>`);
      modal({ title: p.full_name || p.email, body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', onClick: async () => {
        await rpc('user_admin', { p: { user_id: p.id, full_name: $('[data-name]', body).value, phone: $('[data-phone]', body).value, active: $('[data-active]', body).checked,
          roles: $$('[data-role]:checked', body).map(x => x.dataset.role), branches: $$('[data-br]:checked', body).map(x => x.dataset.br) } });
        toast('Akses diperbarui.'); refresh();
      } }] });
    });
  },
});

async function permMatrix(el, lk) {
  const perms = await q(sb.from('role_permissions').select('*'));
  const map = new Map(perms.map(p => [p.role + '|' + p.module, p]));
  const owner = S.me.is_owner;
  el.innerHTML = pageHead('Hak akses per jabatan', 'L = lihat, T = tambah, U = ubah, A = setujui. Perubahan berlaku saat pengguna memuat ulang aplikasi. Owner selalu punya akses penuh.') +
    tabs([{ k: 'users', l: 'Pengguna' }, { k: 'perms', l: 'Hak akses per jabatan' }], 'perms') +
    (owner ? '' : '<p class="note warn">Hanya Owner yang bisa mengubah matriks ini.</p>') +
    `<div class="tbl-wrap"><table class="tbl perm-matrix"><thead><tr><th>Modul</th>${lk.roles.filter(r => r.code !== 'owner').map(r => `<th title="${esc(r.name)}">${esc(r.name.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>${
      MODULES.map(([m, l]) => `<tr><td>${esc(l)}</td>${lk.roles.filter(r => r.code !== 'owner').map(r => {
        const p = map.get(r.code + '|' + m);
        return `<td>${ACTS.map(([a, lbl]) => `<button data-r="${r.code}" data-m="${m}" data-a="${a}" class="${p?.[a] ? 'on' : ''}" ${owner ? '' : 'disabled'} title="${esc(r.name)} — ${esc(l)}">${lbl}</button>`).join('')}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
  on(el, '[data-tab]', 'click', (e, b) => go('users', { t: b.dataset.tab }));
  if (!owner) return;
  on(el, '[data-a]', 'click', async (e, b) => {
    const { r, m, a } = b.dataset;
    const cur = map.get(r + '|' + m) || { role: r, module: m, can_view: false, can_create: false, can_edit: false, can_approve: false };
    const next = { ...cur, [a]: !cur[a] };
    if (a !== 'can_view' && next[a]) next.can_view = true;
    try {
      await q(sb.from('role_permissions').upsert(next, { onConflict: 'role,module' }));
      map.set(r + '|' + m, next);
      b.classList.toggle('on', next[a]);
      if (next.can_view) $(`[data-r="${r}"][data-m="${m}"][data-a="can_view"]`, el).classList.add('on');
    } catch (err) { toast(errMsg(err), 'err'); }
  });
}

// ---------------------------------------------------------------------
route('settings', {
  title: 'Pengaturan', perm: ['settings'],
  async render(el) {
    const rows = await q(sb.from('app_settings').select('*').order('key'));
    el.innerHTML = pageHead('Pengaturan sistem', 'Ambang batas yang mengatur kapan sistem meminta approval dan kapan memunculkan peringatan. Ubah sesuai kebiasaan bisnis Anda.') +
      `<section class="panel"><div class="pb"><form id="f" class="grid g2">${rows.map(r => `<label class="f"><span>${esc(r.label)}</span>
        <input name="${esc(r.key)}" value="${esc(r.value)}" ${/pct|days|hours|count|threshold|amount|limit/.test(r.key) ? 'inputmode="decimal"' : ''}>
        <small>${esc(r.key)}</small></label>`).join('')}
        <div class="span-all"><button class="btn primary">Simpan pengaturan</button></div></form></div></section>`;
    const demoOn = String(setting('demo_data')) === 'on';
    el.innerHTML += `<section class="panel" style="margin-top:14px"><div class="ph"><h2>Data contoh</h2>${
      demoOn ? '<span class="chip warn">terpasang</span>' : '<span class="chip">tidak terpasang</span>'}</div><div class="pb">
      ${demoOn ? `<p class="small">Sistem sedang berisi data contoh: 3 cabang, akun untuk semua jabatan, produk, dan transaksi lengkap sampai penggajian. Pakai untuk belajar dan melatih tim.</p>
        <p class="note danger small">Menghapus data contoh akan mengosongkan <b>seluruh</b> transaksi, produk, pelanggan, cabang, dan akun demo. Lakukan sebelum mulai memakai sistem untuk data sungguhan.</p>
        <button class="btn danger solid" id="purge">Hapus semua data contoh</button>`
      : `<p class="small">Isi sistem dengan data contoh untuk mencoba semua menu tanpa takut merusak apa pun. Hanya bisa dijalankan saat belum ada transaksi sungguhan.</p>
        <button class="btn primary" id="seed">Pasang data contoh</button>`}
      </div></section>`;
    $('#seed', el)?.addEventListener('click', async () => {
      const ok = await ask('Pasang data contoh', 'Sistem akan diisi 3 cabang, 21 akun karyawan, produk, dan transaksi contoh selama 45 hari terakhir. Proses ini butuh beberapa detik.', { note: false, okLabel: 'Pasang sekarang' });
      if (ok === null) return;
      toast('Menyiapkan data contoh…');
      try {
        const r = await rpc('seed_demo', {});
        modal({ title: 'Data contoh siap', size: 'wide',
          body: `<p>Semua akun di bawah memakai kata sandi <b>${esc(r.password)}</b>. Coba masuk sebagai jabatan berbeda untuk melihat bedanya tampilan dan wewenang.</p>` +
            table([{ l: 'Email', f: x => `<code>${esc(x.email)}</code>` }, { l: 'Nama', k: 'nama' }, { l: 'Jabatan', k: 'jabatan' }], r.akun || [], { cards: false }),
          actions: [{ label: 'Muat ulang aplikasi', kind: 'primary', onClick: () => location.reload() }] });
      } catch (err) { toast(errMsg(err), 'err'); }
    });
    $('#purge', el)?.addEventListener('click', () => {
      const FRASA = 'HAPUS DATA CONTOH';
      const body = h(`<div class="stack">
        <p>Seluruh transaksi, produk, pelanggan, cabang, karyawan, aset, dan akun demo akan dihapus permanen.
        Master jabatan, channel penjualan, dan bagan akun tetap ada.</p>
        <p class="note danger small">Tindakan ini tidak bisa dibatalkan. Lakukan sebelum mulai memakai sistem untuk data sungguhan.</p>
        <label class="f req"><span>Ketik <code>${FRASA}</code> untuk melanjutkan</span>
          <input data-confirm autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${FRASA}">
          <small data-hint class="muted">Huruf besar/kecil tidak masalah.</small></label></div>`);
      const m = modal({ title: 'Hapus semua data contoh', body, actions: [
        { label: 'Batal' },
        { label: 'Hapus permanen', kind: 'danger solid', onClick: async () => {
          const v = $('[data-confirm]', body).value;
          if (v.trim().toUpperCase().replace(/\s+/g, ' ') !== FRASA) throw new Error(`Ketik persis: ${FRASA}`);
          const r = await rpc('purge_demo', { p_confirm: v.trim() });
          toast(`Data contoh dihapus (${r.akun_dihapus} akun).`);
          setTimeout(() => location.reload(), 1200);
        } },
      ] });
      const inp = $('[data-confirm]', m.body), btn = m.el.querySelectorAll('.mf .btn')[1];
      const check = () => {
        const ok = inp.value.trim().toUpperCase().replace(/\s+/g, ' ') === FRASA;
        btn.disabled = !ok;
        $('[data-hint]', m.body).textContent = ok ? '✓ Cocok — tombol hapus sudah aktif.' : 'Huruf besar/kecil tidak masalah.';
      };
      inp.addEventListener('input', check);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !btn.disabled) btn.click(); });
      check();
    });

    $('#f', el).onsubmit = async (e) => {
      e.preventDefault();
      try {
        const fd = Object.fromEntries(new FormData(e.target));
        for (const r of rows) if (String(fd[r.key]) !== String(r.value)) await q(sb.from('app_settings').update({ value: fd[r.key] }).eq('key', r.key));
        toast('Pengaturan disimpan. Muat ulang aplikasi agar berlaku di semua halaman.');
      } catch (err) { toast(errMsg(err), 'err'); }
    };
  },
});

// ---------------------------------------------------------------------
route('audit', {
  title: 'Audit log', perm: ['audit'],
  async render(el, params) {
    const lk = await lookups();
    let b = sb.from('audit_log').select('*').order('at', { ascending: false }).limit(300);
    if (params.tbl) b = b.eq('table_name', params.tbl);
    if (params.u) b = b.eq('user_id', params.u);
    if (params.rec) b = b.eq('record_id', params.rec);
    const rows = await q(b);
    const tables = [...new Set(rows.map(r => r.table_name))].sort();
    el.innerHTML = pageHead('Audit log', 'Catatan siapa mengubah apa dan kapan. Tidak bisa dihapus atau diubah oleh siapa pun, termasuk Owner.') +
      `<form class="filters" id="flt"><select name="tbl"><option value="">Semua tabel</option>${tables.map(t => `<option value="${t}" ${params.tbl === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select name="u"><option value="">Semua pengguna</option>${lk.profiles.map(p => `<option value="${p.id}" ${params.u === p.id ? 'selected' : ''}>${esc(p.full_name || p.email)}</option>`).join('')}</select>
        <button class="btn">Terapkan</button></form>` +
      table([{ l: 'Waktu', f: r => fmt.dt(r.at) }, { l: 'Pengguna', f: r => esc(uname(lk, r.user_id)) },
        { l: 'Aksi', f: r => chip(r.action === 'INSERT' ? 'ok' : r.action === 'DELETE' ? 'danger' : 'info', { INSERT: 'Tambah', UPDATE: 'Ubah', DELETE: 'Hapus' }[r.action] || r.action) },
        { l: 'Tabel', k: 'table_name' }, { l: 'Perubahan', f: r => `<span class="small muted">${esc(summarize(r))}</span>` }], rows, { click: true, empty: 'Belum ada catatan' });
    $('#flt', el).onsubmit = (e) => { e.preventDefault(); go('audit', Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v))); };
    bindRows(el, rows, r => modal({ title: `${r.table_name} · ${fmt.dt(r.at)}`, size: 'wide',
      body: `<dl class="kv"><dt>Pengguna</dt><dd>${esc(uname(lk, r.user_id))}</dd><dt>Aksi</dt><dd>${esc(r.action)}</dd><dt>ID baris</dt><dd><span class="small">${esc(r.record_id)}</span></dd></dl>
        <h3 style="margin-top:12px">Sebelum</h3><pre class="small" style="overflow:auto;background:var(--line-2);padding:8px;border-radius:6px">${esc(JSON.stringify(r.old_data, null, 1) || '—')}</pre>
        <h3 style="margin-top:12px">Sesudah</h3><pre class="small" style="overflow:auto;background:var(--line-2);padding:8px;border-radius:6px">${esc(JSON.stringify(r.new_data, null, 1) || '—')}</pre>` }));
  },
});

function summarize(r) {
  if (r.action === 'INSERT') return r.new_data?.no ? 'Dokumen ' + r.new_data.no : Object.keys(r.new_data || {}).slice(0, 4).join(', ');
  if (r.action === 'DELETE') return 'Baris dihapus';
  const o = r.old_data || {}, n = r.new_data || {};
  const keys = Object.keys(n).filter(k => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && k !== 'updated_at');
  return keys.slice(0, 5).map(k => `${k}: ${JSON.stringify(o[k])} → ${JSON.stringify(n[k])}`).join(' · ') || 'tidak ada perubahan berarti';
}
