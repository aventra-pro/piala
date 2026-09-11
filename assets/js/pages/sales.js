// Penjualan: Kasir (POS), Sales Order, Penawaran, Import marketplace
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go, refresh,
  modal, formModal, fieldsHTML, readFields, bindPhotoPreviews, upl, fileBtn, bindFiles, lineEditor, scanCode, findProduct, needBranch,
  mainLoc, byBranch, tabs, on, $, $$, h, ICON, printHTML, waLink, METHOD, CATEGORY, changed, parseCSV, downloadCSV, emptyBox, setting, today, sum } from '../core.js';

const priceOf = (p, tier) => Number((tier === 'reseller' && p.price_reseller) || (tier === 'instansi' && p.price_instansi) || p.price_retail || 0);
const outstanding = (s) => Number(s.total) - Number(s.channel_fee) - Number(s.voucher_seller) - Number(s.refund_total) - Number(s.paid_verified);
const company = () => setting('company_name') || 'Kertajaya Piala';

function bankOptions(lk, branchId) {
  return lk.banks.filter(b => b.active && b.kind !== 'marketplace' && (!b.branch_id || b.branch_id === branchId))
    .map(b => ({ value: b.id, label: `${b.bank_name} ${b.account_no} a.n. ${b.account_name}` }));
}

// ---------- komponen pembayaran (dipakai kasir & pesanan) ----------
function paymentRows(lk, branchId, total, { allowCash = true } = {}) {
  const banks = bankOptions(lk, branchId);
  const el = h(`<div class="stack"><div data-rows></div><div class="actions"><button type="button" class="btn sm" data-add>${ICON.plus} Bayar campuran</button><span class="small" data-info></span></div></div>`);
  const rows = $('[data-rows]', el);
  const add = (amount) => {
    const r = h(`<div class="grid g2" style="padding:8px 0;border-bottom:1px solid var(--line-2)">
      <label class="f"><span>Metode</span><select data-m>${Object.entries(METHOD).filter(([k]) => k !== 'marketplace' && (allowCash || k !== 'cash')).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="f"><span>Nominal</span><input type="number" inputmode="decimal" data-a value="${amount ?? ''}"></label>
      <label class="f" data-cashin><span>Uang diterima</span><input type="number" inputmode="decimal" data-in></label>
      <div data-noncash class="span-all hide grid g2">
        <label class="f req"><span>Rekening perusahaan tujuan</span><select data-b>${banks.map(b => `<option value="${b.value}">${esc(b.label)}</option>`).join('')}</select><small>Hanya rekening terdaftar. Pembayaran ke rekening lain tidak diakui.</small></label>
        <label class="f req"><span>Bukti transfer / QRIS / struk EDC</span><div class="photo-in"><input type="file" accept="image/*,application/pdf" capture="environment" data-f><img hidden alt=""></div></label>
      </div></div>`);
    const upd = () => {
      const cash = $('[data-m]', r).value === 'cash';
      $('[data-noncash]', r).classList.toggle('hide', cash);
      $('[data-cashin]', r).classList.toggle('hide', !cash);
      info();
    };
    $('[data-m]', r).onchange = upd;
    if (!allowCash) setTimeout(upd);
    rows.appendChild(r);
    bindPhotoPreviews(r);
    upd();
  };
  const info = () => {
    const rs = $$('[data-rows] > div', el);
    const paid = sum(rs, r => $('[data-a]', r).value);
    const cashIn = sum(rs, r => $('[data-m]', r).value === 'cash' ? ($('[data-in]', r).value || $('[data-a]', r).value) : 0);
    const cashAmt = sum(rs, r => $('[data-m]', r).value === 'cash' ? $('[data-a]', r).value : 0);
    const change = cashIn - cashAmt;
    $('[data-info]', el).innerHTML = `Dibayar ${fmt.rp(paid)} dari ${fmt.rp(el._total)}${change > 0 ? ` · <b>Kembalian ${fmt.rp(change)}</b>` : ''}`;
  };
  el._total = total;
  on(el, '[data-add]', 'click', () => add(''));
  on(el, 'input', 'input', info);
  add(total);
  return {
    el,
    setTotal(t) { el._total = t; const rs = $$('[data-rows] > div', el); if (rs.length === 1) $('[data-a]', rs[0]).value = t; info(); },
    async get() {
      const out = [];
      for (const r of $$('[data-rows] > div', el)) {
        const m = $('[data-m]', r).value, a = Number($('[data-a]', r).value);
        if (!(a > 0)) continue;
        const p = { method: m, amount: a };
        if (m !== 'cash') {
          const f = $('[data-f]', r).files[0];
          if (!f) throw new Error(`Unggah bukti pembayaran ${METHOD[m]}.`);
          p.bank_account_id = $('[data-b]', r).value;
          if (!p.bank_account_id) throw new Error('Belum ada rekening perusahaan terdaftar. Tambahkan di Master > Rekening.');
          p.proof_path = await upl(f, 'bukti-bayar');
        }
        out.push(p);
      }
      if (!out.length) throw new Error('Isi nominal pembayaran.');
      return out;
    },
  };
}

// ---------- struk ----------
async function printReceipt(soId) {
  const lk = await lookups();
  const s = await q(sb.from('sales_orders').select('*, so_lines(*), payments(*)').eq('id', soId).single());
  const lines = s.so_lines.map(l => `<tr class="line"><td colspan="2">${esc(lk.prod[l.product_id]?.name)}${l.serials?.length ? '<br><span class="muted">SN ' + esc(l.serials.join(', ')) + '</span>' : ''}</td></tr>
    <tr><td>${fmt.n(l.qty)} × ${fmt.rp(l.price)}</td><td class="r">${fmt.rp(l.qty * l.price)}</td></tr>`).join('');
  const pays = s.payments.filter(p => p.status !== 'void').map(p => `<tr><td>${METHOD[p.method]}${p.status === 'pending' ? ' (verifikasi)' : ''}</td><td class="r">${fmt.rp(p.amount)}</td></tr>`).join('');
  printHTML(`<div class="c"><h1>${esc(company())}</h1><div class="muted">${esc(lk.br[s.branch_id]?.name || '')}<br>${esc(lk.br[s.branch_id]?.address || '')}</div></div>
    <p>${esc(s.no)}<br>${fmt.dt(s.created_at)}<br>Kasir: ${esc(uname(lk, s.created_by))}</p>
    <table>${lines}<tr><td>Diskon</td><td class="r">${fmt.rp(s.discount_amount)}</td></tr><tr><td><b>Total</b></td><td class="r"><b>${fmt.rp(s.total)}</b></td></tr>${pays}</table>
    <p class="c">Terima kasih.<br>Simpan struk ini sebagai bukti transaksi.</p>`, { width: '58mm', title: s.no });
}

// ---------- dokumen A4 (penawaran / invoice) ----------
async function printDoc(s, lk, kind) {
  const title = kind === 'quotation' ? 'PENAWARAN HARGA' : 'INVOICE';
  const rows = s.so_lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(lk.prod[l.product_id]?.name)}${l.engraving_text ? `<br><span class="muted">Grafir: ${esc(l.engraving_text)}</span>` : ''}</td><td class="r">${fmt.n(l.qty)}</td><td class="r">${fmt.rp(l.price)}</td><td class="r">${fmt.rp(l.qty * l.price)}</td></tr>`).join('');
  printHTML(`<table><tr><td><h1>${esc(company())}</h1><div class="muted">${esc(lk.br[s.branch_id]?.name || '')} · ${esc(lk.br[s.branch_id]?.phone || '')}</div></td><td class="r"><h1>${title}</h1>${esc(s.no)}<br>${fmt.date(s.created_at)}</td></tr></table>
    <div class="box">Kepada: <b>${esc(s.customer_name)}</b><br>${esc(s.customer_phone || '')}</div>
    <table style="margin-top:10px"><thead><tr><th>#</th><th>Barang / jasa</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Jumlah</th></tr></thead><tbody>${rows}</tbody></table>
    <table style="margin-top:8px;width:50%;margin-left:50%"><tr><td>Subtotal</td><td class="r">${fmt.rp(s.subtotal)}</td></tr><tr><td>Diskon</td><td class="r">${fmt.rp(s.discount_amount)}</td></tr>
    <tr><td>Ongkir</td><td class="r">${fmt.rp(s.shipping_charge)}</td></tr><tr><td><b>Total</b></td><td class="r"><b>${fmt.rp(s.total)}</b></td></tr>
    ${kind !== 'quotation' ? `<tr><td>Sudah dibayar (terverifikasi)</td><td class="r">${fmt.rp(s.paid_verified)}</td></tr><tr><td><b>Sisa tagihan</b></td><td class="r"><b>${fmt.rp(outstanding(s))}</b></td></tr>` : `<tr><td>DP minimum</td><td class="r">${fmt.rp(s.dp_required)}</td></tr>`}</table>
    <div class="box">Pembayaran hanya ke rekening resmi:<br>${lk.banks.filter(b => b.active && b.kind !== 'marketplace').map(b => `${esc(b.bank_name)} ${esc(b.account_no)} a.n. ${esc(b.account_name)}`).join('<br>')}</div>
    ${s.need_date ? `<p>Tanggal dibutuhkan: ${fmt.date(s.need_date)}</p>` : ''}${s.spec_note ? `<p>Spesifikasi: ${esc(s.spec_note)}</p>` : ''}`, { title: s.no });
}

// =====================================================================
//  KASIR (POS)
// =====================================================================
route('pos', {
  title: 'Kasir', perm: ['pos'],
  async render(el) {
    const lk = await lookups();
    const branchId = await needBranch();
    if (!branchId) { el.innerHTML = emptyBox('Pilih cabang dulu', 'Kasir selalu terikat pada satu cabang.'); return; }
    const loc = mainLoc(lk, branchId);
    const [sess, stock, held, todays] = await Promise.all([
      q(sb.from('cash_sessions').select('*').eq('branch_id', branchId).eq('opened_by', S.me.id).eq('status', 'open').maybeSingle()),
      q(sb.from('v_stock').select('product_id,qty,reserved,allocated').eq('location_id', loc.id)),
      q(sb.from('sales_orders').select('*').eq('kind', 'pos').eq('status', 'draft').eq('created_by', S.me.id).neq('void_status', 'approved').order('created_at', { ascending: false })),
      q(sb.from('sales_orders').select('*').eq('kind', 'pos').eq('branch_id', branchId).gte('created_at', today() + 'T00:00:00+07:00').neq('status', 'draft').order('created_at', { ascending: false })),
    ]);
    const avail = Object.fromEntries(stock.map(s => [s.product_id, Number(s.qty) - Number(s.reserved) - Number(s.allocated)]));
    el.innerHTML = pageHead('Kasir', `${esc(lk.br[branchId]?.name)} · Lokasi ${esc(loc.name)}`,
      sess ? `<span class="chip ok">Kas ${esc(sess.no)} terbuka</span><a class="btn" href="#/cash">Tutup kas</a>` : '');
    if (!sess) {
      if (!can('cash', 'c')) { el.innerHTML += '<p class="note warn">Anda belum punya izin membuka kas.</p>'; return; }
      const p = h(`<section class="panel" style="max-width:420px"><div class="ph"><h2>Buka kas dulu</h2></div><div class="pb">
        <p class="small muted">Hitung uang modal di laci, lalu catat. Selisih saat tutup kas wajib dijelaskan.</p>
        <label class="f req"><span>Modal awal di laci</span><input type="number" inputmode="decimal" id="open" value="0"></label>
        <button class="btn primary" style="margin-top:10px" id="openBtn">Buka kas</button></div></section>`);
      el.appendChild(p);
      $('#openBtn', p).onclick = async () => { try { await rpc('cash_open', { p_branch: branchId, p_opening: Number($('#open', p).value || 0) }); toast('Kas dibuka.'); refresh(); } catch (e) { toast(errMsg(e), 'err'); } };
      return;
    }

    const sellable = lk.products.filter(p => p.active && ['barang_jadi', 'komponen', 'jasa', 'bahan_baku'].includes(p.category));
    const cart = [];
    const ui = h(`<div class="pos">
      <section class="panel"><div class="pb">
        <div class="filters"><input type="search" id="find" placeholder="Cari nama/SKU, atau tembak barcode lalu Enter" autocomplete="off">
          <button class="btn" id="scan">${ICON.scan} Scan</button>
          <select id="tier" style="width:auto"><option value="retail">Harga retail</option><option value="reseller">Harga reseller</option><option value="instansi">Harga instansi</option></select></div>
        <div class="tiles" id="tiles"></div>
        <p class="small muted" style="margin-top:8px">Piala & akrilik custom tidak dijual lewat kasir — buat lewat Pesanan agar ada desain dan perintah kerja.</p>
      </div></section>
      <section class="panel"><div class="ph"><h2>Keranjang</h2><button class="btn sm ghost" id="clear">Kosongkan</button></div><div class="pb">
        <div id="cart"></div>
        <div class="grid g2" style="margin-top:10px">
          <label class="f"><span>Diskon nota (Rp)</span><input type="number" inputmode="decimal" id="disc" value="0"></label>
          <label class="f"><span>Batas diskon Anda</span><input readonly value="${S.me.discount_limit}% — di atasnya perlu approval"></label>
          <label class="f"><span>Nama pelanggan</span><input id="cname" placeholder="Pelanggan umum"></label>
          <label class="f"><span>No. HP</span><input id="cphone" inputmode="tel" placeholder="Opsional"></label>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 6px"><span>Total</span><span class="total-big" id="total">Rp 0</span></div>
        <div id="pay"></div>
        <button class="btn brass" style="width:100%;margin-top:12px;min-height:48px" id="checkout">Selesaikan pembayaran</button>
      </div></section></div>`);
    el.appendChild(ui);
    const tier = () => $('#tier', ui).value;
    const pay = paymentRows(lk, branchId, 0);
    $('#pay', ui).appendChild(pay.el);

    const drawTiles = () => {
      const k = $('#find', ui).value.trim().toLowerCase();
      const list = sellable.filter(p => !k || p.sku.toLowerCase().includes(k) || p.name.toLowerCase().includes(k) || (p.barcode || '').toLowerCase() === k).slice(0, 60);
      $('#tiles', ui).innerHTML = list.map(p => {
        const a = p.is_stock ? (avail[p.id] ?? 0) : null;
        return `<button class="tile" data-p="${p.id}" ${a !== null && a <= 0 ? 'disabled' : ''}><div class="n">${esc(p.name)}</div><div class="s">${esc(p.sku)}${a !== null ? ` · stok ${fmt.n(a)}` : ''}</div><div class="p">${fmt.rp(priceOf(p, tier()))}</div></button>`;
      }).join('') || emptyBox('Tidak ditemukan');
    };
    const total = () => Math.max(0, sum(cart, l => l.qty * l.price) - Number($('#disc', ui).value || 0));
    const drawCart = () => {
      $('#cart', ui).innerHTML = cart.length ? cart.map((l, i) => `<div class="cart-line" data-i="${i}">
        <div><b>${esc(l.p.name)}</b><div class="small muted">${esc(l.p.sku)} · harga daftar ${fmt.rp(priceOf(l.p, tier()))}</div>
          ${l.p.track_serial ? `<div class="small">Serial: ${l.serials.map(esc).join(', ') || '<span style="color:var(--danger)">belum discan</span>'} <button class="btn sm" data-sn>Scan serial</button></div>` : ''}</div>
        <div style="text-align:right"><div class="qty"><button data-d="-1" aria-label="Kurangi">−</button><input data-q value="${l.qty}" inputmode="decimal"><button data-d="1" aria-label="Tambah">+</button></div>
          <input type="number" data-price value="${l.price}" style="width:120px;margin-top:4px;min-height:32px;text-align:right" aria-label="Harga"></div></div>`).join('')
        : '<p class="muted">Pilih barang di sebelah kiri atau scan barcode.</p>';
      $('#total', ui).textContent = fmt.rp(total());
      pay.setTotal(total());
    };
    const addP = (p) => {
      if (!p) return toast('Barang tidak ditemukan.', 'err');
      if (['piala_rakitan', 'akrilik_custom'].includes(p.category)) return toast('Produk custom harus lewat Pesanan.', 'err');
      const ex = cart.find(l => l.p.id === p.id);
      if (ex) ex.qty += 1; else cart.push({ p, qty: 1, price: priceOf(p, tier()), serials: [] });
      drawCart();
    };
    on(ui, '[data-p]', 'click', (e, b) => addP(lk.prod[b.dataset.p]));
    $('#find', ui).addEventListener('input', drawTiles);
    $('#find', ui).addEventListener('keydown', (e) => { if (e.key === 'Enter') { const p = findProduct(lk, e.target.value); if (p) { addP(p); e.target.value = ''; drawTiles(); } } });
    $('#scan', ui).onclick = async () => { const c = await scanCode(); if (c) addP(findProduct(lk, c)); };
    $('#tier', ui).onchange = () => { cart.forEach(l => l.price = priceOf(l.p, tier())); drawTiles(); drawCart(); };
    $('#disc', ui).addEventListener('input', () => { $('#total', ui).textContent = fmt.rp(total()); pay.setTotal(total()); });
    $('#clear', ui).onclick = () => { cart.length = 0; drawCart(); };
    on(ui, '[data-d]', 'click', (e, b) => { const l = cart[+b.closest('[data-i]').dataset.i]; l.qty = Math.max(0, l.qty + Number(b.dataset.d)); if (!l.qty) cart.splice(cart.indexOf(l), 1); drawCart(); });
    on(ui, '[data-q]', 'change', (e, i) => { const l = cart[+i.closest('[data-i]').dataset.i]; l.qty = Math.max(0, Number(i.value) || 0); if (!l.qty) cart.splice(cart.indexOf(l), 1); drawCart(); });
    on(ui, '[data-price]', 'change', (e, i) => { cart[+i.closest('[data-i]').dataset.i].price = Math.max(0, Number(i.value) || 0); drawCart(); });
    on(ui, '[data-sn]', 'click', async (e, b) => {
      const l = cart[+b.closest('[data-i]').dataset.i];
      const c = await scanCode('Scan serial / QR unit'); if (!c) return;
      if (l.serials.includes(c)) return toast('Serial sudah discan.', 'err');
      l.serials.push(c); l.qty = Math.max(l.qty, l.serials.length); drawCart();
    });
    $('#checkout', ui).onclick = async (e) => {
      const btn = e.currentTarget;
      if (!cart.length) return toast('Keranjang kosong.', 'err');
      btn.disabled = true;
      try {
        const payments = total() > 0 ? await pay.get() : [];
        const r = await rpc('pos_checkout', { p: {
          branch_id: branchId, location_id: loc.id, price_tier: tier(), discount_amount: Number($('#disc', ui).value || 0),
          customer_name: $('#cname', ui).value, customer_phone: $('#cphone', ui).value,
          lines: cart.map(l => ({ product_id: l.p.id, qty: l.qty, price: l.price, serials: l.serials })), payments } });
        if (r.status === 'pending_discount') {
          toast('Diskon melewati batas Anda. Transaksi ditahan sampai disetujui atasan.'); changed();
        } else {
          toast('Transaksi ' + r.no + ' selesai.');
          modal({ title: 'Transaksi selesai', body: `<p>${plate(r.no, 'lg')}</p><p>Total ${fmt.rp(total())}</p>`,
            actions: [{ label: 'Tutup' }, { label: 'Cetak struk', kind: 'primary', onClick: () => printReceipt(r.so_id) }] });
        }
        refresh();
      } catch (err) { toast(errMsg(err), 'err'); }
      finally { btn.disabled = false; }
    };
    drawTiles(); drawCart();

    // transaksi tertahan & hari ini
    const lower = h(`<div class="stack" style="margin-top:14px"></div>`);
    el.appendChild(lower);
    if (held.length) {
      const p = h(`<section class="panel"><div class="ph"><h2>Transaksi tertahan</h2></div><div class="pb"></div></section>`);
      $('.pb', p).innerHTML = table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Total', cls: 'num', f: r => fmt.rp(r.total) }, { l: 'Diskon', cls: 'num', f: r => fmt.pct(r.discount_pct) },
        { l: 'Approval', f: r => chip(r.discount_status) },
        { l: '', f: r => `<div class="actions">${r.discount_status === 'approved' ? '<button class="btn sm primary" data-finish>Selesaikan</button>' : ''}<button class="btn sm danger" data-cancel>Batalkan</button></div>` }], held);
      lower.appendChild(p);
      on(p, '[data-finish]', 'click', async (e, b) => {
        const s = held[+b.closest('tr').dataset.i];
        const pr = paymentRows(lk, branchId, Number(s.total));
        modal({ title: 'Pembayaran ' + s.no, body: pr.el, actions: [{ label: 'Batal' }, { label: 'Selesaikan', kind: 'primary', onClick: async () => {
          const r = await rpc('pos_complete', { p_so: s.id, p_payments: await pr.get() }); toast('Transaksi ' + r.no + ' selesai.'); printReceipt(s.id); refresh();
        } }] });
      });
      on(p, '[data-cancel]', 'click', async (e, b) => {
        const s = held[+b.closest('tr').dataset.i];
        const note = await ask('Batalkan transaksi tertahan', `Batalkan ${esc(s.no)}? Tercatat sebagai pembatalan.`, { minLen: 10, label: 'Alasan' }); if (!note) return;
        try { await rpc('so_void_request', { p_id: s.id, p_reason: note }); toast('Dibatalkan.'); refresh(); } catch (err) { toast(errMsg(err), 'err'); }
      });
    }
    const p2 = h(`<section class="panel"><div class="ph"><h2>Transaksi hari ini</h2><span class="small muted">${todays.length} transaksi</span></div><div class="pb"></div></section>`);
    $('.pb', p2).innerHTML = table([
      { l: 'No', f: r => plate(r.no, r.status === 'void' ? 'void' : '') }, { l: 'Jam', f: r => fmt.dt(r.created_at) }, { l: 'Pelanggan', k: 'customer_name' },
      { l: 'Total', cls: 'num', f: r => fmt.rp(r.total) }, { l: 'Status', f: r => chip(r.status) + (r.void_status === 'pending' ? ' ' + chip('pending', 'Void diajukan') : '') },
      { l: '', f: r => `<div class="actions"><button class="btn sm" data-print>${ICON.print}</button>${r.status === 'completed' && r.void_status !== 'pending' ? '<button class="btn sm danger" data-void>Minta void</button>' : ''}</div>` }],
      todays, { empty: 'Belum ada transaksi hari ini' });
    lower.appendChild(p2);
    on(p2, '[data-print]', 'click', (e, b) => printReceipt(todays[+b.closest('tr').dataset.i].id));
    on(p2, '[data-void]', 'click', async (e, b) => {
      const s = todays[+b.closest('tr').dataset.i];
      const note = await ask('Minta void', `Void ${esc(s.no)} (${fmt.rp(s.total)}) harus disetujui atasan dan tercatat di laporan void harian.`, { minLen: 10, label: 'Alasan void', danger: true, okLabel: 'Ajukan void' });
      if (!note) return;
      try { await rpc('so_void_request', { p_id: s.id, p_reason: note }); toast('Permintaan void diajukan.'); changed(); refresh(); } catch (err) { toast(errMsg(err), 'err'); }
    });
  },
});

// =====================================================================
//  PESANAN (Sales Order) & PENAWARAN
// =====================================================================
async function soForm(existing = null, kind = 'order') {
  const lk = await lookups();
  const branchId = existing?.branch_id || await needBranch(); if (!branchId) return;
  const customers = await q(sb.from('customers').select('id,code,name,phone,kind,credit_limit,terms_days,blocked').eq('active', true).order('name').limit(2000));
  const chans = lk.channels.filter(c => c.active && c.code !== 'WALKIN' || c.id === existing?.channel_id);
  const s = existing || { kind, price_tier: 'retail', channel_id: chans.find(c => c.code === 'WA')?.id };
  const lines = existing ? existing.so_lines : [];
  const body = h(`<div><form onsubmit="return false" class="stack">
    <div class="grid g3">
      <label class="f req"><span>Channel</span><select name="channel_id">${chans.map(c => `<option value="${c.id}" ${c.id === s.channel_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="f"><span>Pelanggan terdaftar</span><input name="cust" list="dl-cust" placeholder="Cari nama / kode" value="${esc(customers.find(c => c.id === s.customer_id)?.name || '')}"><datalist id="dl-cust">${customers.map(c => `<option value="${esc(c.name)}">${esc(c.code || '')} ${esc(c.phone || '')}</option>`).join('')}</datalist></label>
      <label class="f"><span>Tingkat harga</span><select name="price_tier">${['retail', 'reseller', 'instansi'].map(t => `<option ${t === s.price_tier ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f req"><span>Nama pelanggan</span><input name="customer_name" value="${esc(s.customer_name || '')}"></label>
      <label class="f req"><span>No. HP / WA</span><input name="customer_phone" inputmode="tel" value="${esc(s.customer_phone || '')}"></label>
      <label class="f"><span>Tanggal dibutuhkan</span><input type="date" name="need_date" value="${esc(s.need_date || '')}"></label>
      <label class="f" data-mp><span>No. pesanan marketplace</span><input name="marketplace_order_no" value="${esc(s.marketplace_order_no || '')}"></label>
    </div>
    <label class="f"><span>Spesifikasi / catatan desain</span><textarea name="spec_note" placeholder="Ukuran, warna, logo, teks, acara…">${esc(s.spec_note || '')}</textarea></label>
    <div data-lines></div>
    <div class="grid g4">
      <label class="f"><span>Diskon nota (Rp)</span><input type="number" name="discount_amount" value="${s.discount_amount || 0}"></label>
      <label class="f"><span>Ongkir ditagih ke pelanggan</span><input type="number" name="shipping_charge" value="${s.shipping_charge || 0}"></label>
      <label class="f" data-mp><span>Biaya admin marketplace</span><input type="number" name="channel_fee" value="${existing ? s.channel_fee : ''}" placeholder="otomatis"></label>
      <label class="f" data-mp><span>Voucher ditanggung toko</span><input type="number" name="voucher_seller" value="${s.voucher_seller || 0}"></label>
      <label class="f"><span>DP wajib (Rp)</span><input type="number" name="dp_required" value="${existing ? s.dp_required : ''}" placeholder="otomatis ${setting('dp_min_pct')}% untuk custom"></label>
    </div>
    <label class="f"><span>Catatan internal</span><input name="note" value="${esc(s.note || '')}"></label>
  </form></div>`);
  const tierSel = $('[name=price_tier]', body);
  const le = lineEditor(lk, lines, { price: true, engraving: true, priceOf: (p) => priceOf(p, tierSel.value), info: p => fmt.rp(priceOf(p, tierSel.value)) });
  $('[data-lines]', body).appendChild(le.el);
  const custInp = $('[name=cust]', body);
  let customerId = s.customer_id || null;
  custInp.addEventListener('change', () => {
    const c = customers.find(x => x.name === custInp.value);
    customerId = c?.id || null;
    if (c) { $('[name=customer_name]', body).value = c.name; $('[name=customer_phone]', body).value = c.phone || ''; tierSel.value = c.kind; if (c.blocked) toast('Pelanggan ini diblokir keuangan.', 'err'); }
  });
  const toggleMp = () => { const mp = lk.ch[$('[name=channel_id]', body).value]?.kind === 'marketplace'; $$('[data-mp]', body).forEach(x => x.classList.toggle('hide', !mp)); };
  $('[name=channel_id]', body).onchange = toggleMp; toggleMp();
  return new Promise((resolve) => {
    modal({ title: existing ? 'Ubah ' + existing.no : (kind === 'quotation' ? 'Penawaran baru' : 'Pesanan baru'), size: 'full', body,
      actions: [{ label: 'Batal' }, { label: 'Simpan draft', kind: 'primary', onClick: async () => {
        const f = Object.fromEntries(new FormData($('form', body)));
        const id = await rpc('so_save', { p: { ...f, id: existing?.id || null, kind: existing?.kind || kind, branch_id: branchId, customer_id: customerId, lines: le.get() } });
        toast('Tersimpan.'); resolve(id); go('sales', { id });
      } }], onClose: () => resolve(null) });
  });
}

function soList(kindFilter) {
  return async (el, params) => {
    if (params.id) return soDetail(el, params.id);
    const lk = await lookups();
    const tab = params.t || (kindFilter === 'quotation' ? 'quotation' : 'open');
    const TABS = kindFilter === 'quotation' ? [{ k: 'quotation', l: 'Penawaran aktif' }, { k: 'cancelled', l: 'Batal' }] :
      [{ k: 'open', l: 'Berjalan' }, { k: 'draft', l: 'Draft' }, { k: 'in_production', l: 'Produksi' }, { k: 'ready', l: 'Siap kirim' }, { k: 'shipped', l: 'Dikirim' }, { k: 'completed', l: 'Selesai' }, { k: 'cancelled', l: 'Batal/void' }, { k: 'pos', l: 'Transaksi kasir' }];
    let b = sb.from('sales_orders').select('*').order('created_at', { ascending: false }).limit(300);
    b = byBranch(b);
    if (kindFilter === 'quotation') {
      b = b.eq('kind', 'quotation');
      b = tab === 'quotation' ? b.eq('status', 'quotation') : b.in('status', ['cancelled', 'void']);
    } else if (tab === 'pos') b = b.eq('kind', 'pos');
    else {
      b = b.eq('kind', 'order');
      if (tab === 'open') b = b.in('status', ['draft', 'in_production', 'ready', 'shipped']);
      else if (tab === 'cancelled') b = b.in('status', ['cancelled', 'void']);
      else b = b.eq('status', tab);
    }
    if (params.s) b = b.or(`no.ilike.%${params.s}%,customer_name.ilike.%${params.s}%,customer_phone.ilike.%${params.s}%,marketplace_order_no.ilike.%${params.s}%`);
    if (params.ch) b = b.eq('channel_id', params.ch);
    const rows = await q(b);
    const route_ = kindFilter === 'quotation' ? 'quotations' : 'sales';
    el.innerHTML = pageHead(kindFilter === 'quotation' ? 'Penawaran' : 'Pesanan',
      kindFilter === 'quotation' ? 'Penawaran untuk instansi, sekolah, dan tender. Konfirmasi untuk menjadikannya pesanan.' : 'Setiap pesanan dari channel mana pun wajib punya nomor, channel, dan kontak pelanggan.',
      can('sales', 'c') ? `<button class="btn primary" id="new">${ICON.plus} ${kindFilter === 'quotation' ? 'Penawaran baru' : 'Pesanan baru'}</button>` + (kindFilter !== 'quotation' ? '<a class="btn" href="#/mp-import">Import marketplace</a>' : '') : '') +
      tabs(TABS, tab) +
      `<form class="filters" id="flt"><input type="search" name="s" placeholder="Cari no, nama, HP, no. marketplace" value="${esc(params.s || '')}">
       <select name="ch"><option value="">Semua channel</option>${lk.channels.map(c => `<option value="${c.id}" ${params.ch === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button class="btn">Cari</button></form>` +
      table([
        { l: 'No', f: r => plate(r.no, ['void', 'cancelled'].includes(r.status) ? 'void' : '') },
        { l: 'Tanggal', f: r => fmt.date(r.created_at) }, { l: 'Channel', f: r => esc(lk.ch[r.channel_id]?.name) },
        { l: 'Pelanggan', f: r => `${esc(r.customer_name)}<br><span class="small muted">${esc(r.customer_phone || '')}</span>` },
        { l: 'Dibutuhkan', f: r => r.need_date ? fmt.date(r.need_date) : '—' },
        { l: 'Total', cls: 'num', f: r => fmt.rp(r.total) },
        { l: 'Bayar', cls: 'num', f: r => r.kind === 'quotation' ? '—' : (outstanding(r) <= 0.5 ? chip('paid') : `<span class="small">${fmt.rp(r.paid_verified)} / DP ${fmt.rp(r.dp_required)}</span>`) },
        { l: 'Status', f: r => chip(r.status) + (r.discount_status === 'pending' || r.credit_status === 'pending' || r.void_status === 'pending' ? ' ' + chip('pending', 'Approval') : '') },
      ], rows, { click: true, empty: 'Tidak ada data', emptyHint: 'Ubah tab atau filter.' });
    on(el, '[data-tab]', 'click', (e, b) => go(route_, { ...params, t: b.dataset.tab }));
    $('#flt', el).onsubmit = (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); go(route_, { t: tab, ...f }); };
    $('#new', el)?.addEventListener('click', () => soForm(null, kindFilter === 'quotation' ? 'quotation' : 'order'));
    bindRows(el, rows, r => go('sales', { id: r.id }));
  };
}

async function soDetail(el, id) {
  const lk = await lookups();
  const s = await q(sb.from('sales_orders').select('*, so_lines(*), payments(*), design_approvals(*), work_orders(*), delivery_orders(*), sales_returns(*)').eq('id', id).single());
  s.so_lines.sort((a, b) => a.id.localeCompare(b.id));
  const out = outstanding(s);
  const active = !['void', 'cancelled'].includes(s.status);
  const act = [];
  if (['draft', 'quotation'].includes(s.status) && can('sales', 'c')) act.push(['edit', 'Ubah', ''], ['confirm', s.status === 'quotation' ? 'Jadikan pesanan' : 'Konfirmasi pesanan', 'primary']);
  if (s.kind !== 'quotation' && active && out > 0.5 && can('payments', 'c') && s.status !== 'draft') act.push(['pay', 'Catat pembayaran', 'brass']);
  if (s.status === 'ready' && can('logistics', 'c') && !s.delivery_orders.length) act.push(['do', 'Buat surat jalan', 'primary']);
  if (['shipped', 'completed'].includes(s.status) && can('returns', 'c')) act.push(['ret', 'Buat retur', '']);
  if (active && s.void_status !== 'pending' && !['shipped'].includes(s.status) && !(s.status === 'completed' && s.kind !== 'pos') && (can('sales', 'c') || can('pos', 'c')))
    act.push(['void', ['draft', 'quotation'].includes(s.status) ? 'Batalkan' : 'Minta batal/void', 'danger']);
  act.push(['print', s.kind === 'quotation' ? 'Cetak penawaran' : 'Cetak invoice', ''], ['wa', 'Kirim WA', '']);
  const lineRows = s.so_lines.map(l => ({ ...l, p: lk.prod[l.product_id] }));
  const pend = [];
  if (s.discount_status === 'pending') pend.push(`Diskon ${fmt.pct(s.discount_pct)} menunggu approval atasan.`);
  if (s.discount_status === 'rejected') pend.push('Diskon ditolak. Ubah diskon lalu konfirmasi ulang.');
  if (s.credit_status === 'pending') pend.push('Pelanggan melewati limit kredit / ada tagihan macet — menunggu keputusan keuangan.');
  if (s.credit_status === 'rejected') pend.push('Pengecualian kredit ditolak. Minta pelanggan melunasi tagihan lama.');
  if (s.discount_status === 'approved' && s.status === 'draft') pend.push('Diskon sudah disetujui. Tekan "Konfirmasi pesanan" untuk melanjutkan.');
  if (s.void_status === 'pending') pend.push(`Permintaan batal/void menunggu approval: ${esc(s.void_reason)}`);
  if (s.kind !== 'quotation' && ['in_production'].includes(s.status) && s.paid_verified < s.dp_required) pend.push(`Produksi belum boleh dimulai: DP terverifikasi ${fmt.rp(s.paid_verified)} dari ${fmt.rp(s.dp_required)}.`);

  el.innerHTML = `<p><a href="#/${s.kind === 'quotation' ? 'quotations' : 'sales'}">← Kembali</a></p>` +
    pageHead(s.customer_name, `${plate(s.no, 'lg')} ${chip(s.status)} · ${esc(lk.ch[s.channel_id]?.name)} · ${esc(lk.br[s.branch_id]?.name)}`,
      act.map(([k, l, c]) => `<button class="btn ${c}" data-a="${k}">${esc(l)}</button>`).join('')) +
    pend.map(t => `<p class="note warn">${t}</p>`).join('') +
    `<div class="cols"><div class="stack">
      <section class="panel"><div class="ph"><h2>Barang & jasa</h2></div><div class="pb">${table([
        { l: 'Barang', f: r => `<b>${esc(r.p?.name)}</b><br><span class="small muted">${esc(r.p?.sku)} · ${CATEGORY[r.p?.category]}</span>${r.engraving_text ? `<br><span class="small">Grafir: ${esc(r.engraving_text)}</span>` : ''}${r.serials?.length ? `<br><span class="small">SN: ${esc(r.serials.join(', '))}</span>` : ''}` },
        { l: 'Qty', cls: 'num', f: r => fmt.n(r.qty) }, { l: 'Harga daftar', cls: 'num', f: r => fmt.rp(r.list_price) },
        { l: 'Harga', cls: 'num', f: r => fmt.rp(r.price) + (Number(r.price) < Number(r.list_price) ? ' <span class="chip warn">turun</span>' : '') },
        { l: 'Jumlah', cls: 'num', f: r => fmt.rp(r.qty * r.price) }], lineRows, { cards: true })}
        <dl class="kv" style="margin-top:12px;max-width:380px;margin-left:auto">
          <dt>Subtotal</dt><dd class="num">${fmt.rp(s.subtotal)}</dd><dt>Diskon nota</dt><dd class="num">${fmt.rp(s.discount_amount)}</dd>
          <dt>Ongkir</dt><dd class="num">${fmt.rp(s.shipping_charge)}</dd><dt><b>Total</b></dt><dd class="num"><b>${fmt.rp(s.total)}</b></dd>
          ${s.channel_fee > 0 ? `<dt>Biaya admin channel</dt><dd class="num">−${fmt.rp(s.channel_fee)}</dd>` : ''}${s.voucher_seller > 0 ? `<dt>Voucher toko</dt><dd class="num">−${fmt.rp(s.voucher_seller)}</dd>` : ''}
          ${s.refund_total > 0 ? `<dt>Refund retur</dt><dd class="num">−${fmt.rp(s.refund_total)}</dd>` : ''}
          <dt>Terbayar (terverifikasi)</dt><dd class="num">${fmt.rp(s.paid_verified)}</dd><dt><b>Sisa tagihan</b></dt><dd class="num"><b>${fmt.rp(Math.max(0, out))}</b></dd>
        </dl></div></section>
      ${s.kind !== 'quotation' ? `<section class="panel"><div class="ph"><h2>Pembayaran</h2></div><div class="pb" data-pays></div></section>` : ''}
      ${s.design_approvals.length || s.work_orders.length ? `<section class="panel"><div class="ph"><h2>Desain & produksi</h2>${can('design', 'c') && s.status === 'in_production' ? '<button class="btn sm" data-a="design">Unggah mockup</button>' : ''}</div><div class="pb" data-design></div></section>` : ''}
      ${s.delivery_orders.length ? `<section class="panel"><div class="ph"><h2>Pengiriman</h2></div><div class="pb">${table([
        { l: 'Surat jalan', f: r => plate(r.no) }, { l: 'Status', f: r => chip(r.status) }, { l: 'Kurir', f: r => esc(r.courier || '—') }, { l: 'Resi', f: r => esc(r.tracking_no || '—') }, { l: 'Foto packing', f: r => fileBtn(r.packing_photo_path, 'Foto') }], s.delivery_orders)}</div></section>` : ''}
      ${s.sales_returns.length ? `<section class="panel"><div class="ph"><h2>Retur</h2></div><div class="pb">${table([
        { l: 'Retur', f: r => plate(r.no) }, { l: 'Status', f: r => chip(r.status) }, { l: 'Penyebab', f: r => esc(lk.retReasons.find(x => x.code === r.reason_code)?.name) }, { l: 'Refund', cls: 'num', f: r => fmt.rp(r.refund_amount) }], s.sales_returns)}</div></section>` : ''}
    </div><div class="stack">
      <section class="panel"><div class="ph"><h2>Detail</h2></div><div class="pb"><dl class="kv">
        <dt>Pelanggan</dt><dd>${esc(s.customer_name)}</dd><dt>Kontak</dt><dd>${esc(s.customer_phone || '—')}</dd>
        <dt>Harga</dt><dd>${esc(s.price_tier)}</dd><dt>Dibutuhkan</dt><dd>${fmt.date(s.need_date)}</dd>
        ${s.marketplace_order_no ? `<dt>No. marketplace</dt><dd>${esc(s.marketplace_order_no)}</dd>` : ''}
        <dt>DP wajib</dt><dd>${fmt.rp(s.dp_required)}</dd><dt>Jatuh tempo</dt><dd>${fmt.date(s.due_date)}</dd>
        <dt>Dibuat</dt><dd>${esc(uname(lk, s.created_by))}<br><span class="small muted">${fmt.dt(s.created_at)}</span></dd>
        ${s.recognized_at ? `<dt>Pendapatan diakui</dt><dd>${fmt.dt(s.recognized_at)}</dd>` : ''}
        ${s.approval_by ? `<dt>Approval</dt><dd>${esc(uname(lk, s.approval_by))}: ${esc(s.approval_note)}</dd>` : ''}
        ${s.void_reason ? `<dt>Alasan batal</dt><dd>${esc(s.void_reason)}</dd>` : ''}
      </dl>${s.spec_note ? `<p class="note" style="margin-top:10px">${esc(s.spec_note)}</p>` : ''}${s.note ? `<p class="small muted" style="margin-top:8px">${esc(s.note)}</p>` : ''}</div></section>
    </div></div>`;

  const pays = $('[data-pays]', el);
  if (pays) pays.innerHTML = table([
    { l: 'No', f: r => plate(r.no) }, { l: 'Tanggal', f: r => fmt.date(r.pay_date) }, { l: 'Metode', f: r => METHOD[r.method] + (r.bank_account_id ? `<br><span class="small muted">${esc(lk.bank[r.bank_account_id]?.bank_name)} ${esc(lk.bank[r.bank_account_id]?.account_no)}</span>` : '') },
    { l: 'Nominal', cls: 'num', f: r => fmt.rp(r.amount) }, { l: 'Status', f: r => chip(r.status) + (r.verify_note ? `<br><span class="small muted">${esc(r.verify_note)}</span>` : '') },
    { l: 'Bukti', f: r => fileBtn(r.proof_path) }], s.payments, { empty: 'Belum ada pembayaran', emptyHint: s.dp_required > 0 ? `DP wajib ${fmt.rp(s.dp_required)}.` : '' });
  const des = $('[data-design]', el);
  if (des) {
    des.innerHTML = (s.design_approvals.length ? table([
      { l: 'Versi', f: r => 'v' + r.version }, { l: 'Mockup', f: r => fileBtn(r.file_path, 'Lihat mockup') }, { l: 'Status', f: r => chip(r.status) },
      { l: 'Bukti ACC pelanggan', f: r => fileBtn(r.customer_proof_path, 'Bukti ACC') },
      { l: '', f: r => r.status === 'pending' && can('design', 'e') ? '<div class="actions"><button class="btn sm primary" data-acc>Catat ACC</button><button class="btn sm danger" data-rej>Revisi</button></div>' : '' }],
    [...s.design_approvals].sort((a, b) => b.version - a.version)) : '<p class="muted">Belum ada mockup.</p>') +
      `<h3 style="margin:14px 0 6px">Perintah kerja</h3><div data-wos></div>`;
    $('[data-wos]', des).innerHTML = table([
      { l: 'WO', f: r => plate(r.no) }, { l: 'Produk', f: r => esc(lk.prod[r.product_id]?.name) }, { l: 'Qty', cls: 'num', f: r => fmt.n(r.qty) }, { l: 'Status', f: r => chip(r.status) }, { l: 'Operator', f: r => esc(uname(lk, r.assigned_to)) }], s.work_orders, { click: true });
    const designs = [...s.design_approvals].sort((a, b) => b.version - a.version);
    on(des, '[data-acc],[data-rej]', 'click', async (e, b) => {
      const d = designs[+b.closest('tr').dataset.i];
      if (b.hasAttribute('data-acc')) {
        await formModal({ title: 'Catat ACC pelanggan', submitLabel: 'Simpan ACC', intro: '<p class="note">Unggah bukti persetujuan pelanggan (tangkapan layar chat, email, atau tanda tangan). Ini pelindung utama dari kerugian salah nama.</p>',
          fields: [{ name: 'proof', label: 'Bukti ACC', type: 'photo', required: true }, { name: 'note', label: 'Catatan', type: 'textarea' }],
          onSubmit: async v => rpc('design_decide', { p_id: d.id, p_approve: true, p_proof: await upl(v.proof, 'acc-desain'), p_note: v.note }) });
      } else {
        const n = await ask('Minta revisi', 'Catat permintaan revisi dari pelanggan.', { minLen: 5, label: 'Revisi yang diminta' }); if (!n) return;
        await rpc('design_decide', { p_id: d.id, p_approve: false, p_proof: null, p_note: n }).catch(err => toast(errMsg(err), 'err'));
      }
      refresh();
    });
    bindRows($('[data-wos]', des), s.work_orders, r => go('production', { id: r.id }));
  }
  bindFiles(el);

  on(el, '[data-a]', 'click', async (e, b) => {
    const a = b.dataset.a;
    try {
      if (a === 'edit') return soForm(s);
      if (a === 'confirm') {
        const r = await rpc('so_confirm', { p_id: s.id });
        const msg = { pending_discount: 'Diskon melewati batas jabatan Anda. Menunggu approval atasan.', pending_credit: 'Pelanggan melewati limit kredit. Menunggu keputusan keuangan.', in_production: 'Pesanan dikonfirmasi. Perintah kerja dibuat.', ready: 'Pesanan dikonfirmasi. Stok dipesan, siap dikirim.' }[r];
        toast(msg || r); changed(); return refresh();
      }
      if (a === 'pay') return payForm(s, lk);
      if (a === 'do') { const id = await rpc('do_create', { p_so: s.id }); toast('Surat jalan dibuat.'); return go('delivery', { id }); }
      if (a === 'ret') return go('returns', { new: s.id });
      if (a === 'void') {
        const n = await ask(b.textContent, `Batal/void selalu tercatat dan (kecuali draft) harus disetujui atasan. Transaksi tidak dihapus.`, { minLen: 10, label: 'Alasan', danger: true });
        if (!n) return;
        const r = await rpc('so_void_request', { p_id: s.id, p_reason: n });
        toast(r === 'cancelled' ? 'Dibatalkan.' : 'Permintaan diajukan.'); changed(); return refresh();
      }
      if (a === 'print') return printDoc(s, lk, s.kind === 'quotation' ? 'quotation' : 'invoice');
      if (a === 'wa') {
        const lines = s.so_lines.map(l => `- ${lk.prod[l.product_id]?.name} x${fmt.n(l.qty)} = ${fmt.rp(l.qty * l.price)}${l.engraving_text ? ` (grafir: ${l.engraving_text})` : ''}`).join('\n');
        const banks = lk.banks.filter(x => x.active && x.kind !== 'marketplace').map(x => `${x.bank_name} ${x.account_no} a.n. ${x.account_name}`).join('\n');
        const txt = `Halo ${s.customer_name},\n${s.kind === 'quotation' ? 'Berikut penawaran' : 'Rincian pesanan'} ${s.no} dari ${company()}:\n${lines}\nTotal: ${fmt.rp(s.total)}\n` +
          (s.kind === 'quotation' ? `DP: ${fmt.rp(s.dp_required)}` : `Sudah dibayar: ${fmt.rp(s.paid_verified)}\nSisa: ${fmt.rp(Math.max(0, out))}`) + `\n\nPembayaran HANYA ke rekening resmi:\n${banks}`;
        return window.open(waLink(s.customer_phone, txt), '_blank');
      }
      if (a === 'design') {
        await formModal({ title: 'Unggah mockup', submitLabel: 'Unggah', fields: [{ name: 'file', label: 'File mockup (gambar/PDF)', type: 'file', required: true }, { name: 'note', label: 'Catatan', type: 'textarea' }],
          onSubmit: async v => rpc('design_upload', { p_so: s.id, p_file: await upl(v.file, 'mockup'), p_note: v.note }) });
        return refresh();
      }
    } catch (err) { toast(errMsg(err), 'err'); }
  });
}

export async function payForm(s, lk) {
  const pr = paymentRows(lk, s.branch_id, Math.max(0, Math.round(outstanding(s))));
  const body = h(`<div><p class="note small">Pembayaran baru sah setelah diverifikasi keuangan dengan mutasi rekening. Tunai hanya bisa lewat sesi kas yang terbuka.</p></div>`);
  body.appendChild(pr.el);
  modal({ title: 'Catat pembayaran ' + s.no, body, actions: [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', onClick: async () => {
    for (const p of await pr.get()) await rpc('payment_create', { p: { ...p, so_id: s.id } });
    toast('Pembayaran dicatat, menunggu verifikasi.'); changed(); refresh();
  } }] });
}

route('sales', { title: 'Pesanan', perm: ['sales', 'pos', 'logistics', 'payments', 'receivables', 'production', 'design'], render: soList('order') });
route('quotations', { title: 'Penawaran', perm: ['sales'], render: soList('quotation') });

// =====================================================================
//  IMPORT MARKETPLACE (CSV)
// =====================================================================
const MP_FIELDS = [
  ['order_no', 'No. pesanan', true, ['no. pesanan', 'order id', 'order_sn', 'nomor invoice', 'order no']],
  ['sku', 'SKU', true, ['sku', 'nomor referensi sku', 'seller sku', 'sku induk']],
  ['qty', 'Jumlah', true, ['jumlah', 'quantity', 'qty']],
  ['price', 'Harga satuan', false, ['harga', 'harga setelah diskon', 'unit price', 'price']],
  ['customer_name', 'Nama pembeli', false, ['nama penerima', 'username (pembeli)', 'buyer', 'recipient']],
  ['customer_phone', 'No. HP pembeli', false, ['no. telepon', 'phone', 'telepon']],
  ['admin_fee', 'Biaya admin', false, ['biaya administrasi', 'admin fee', 'biaya layanan']],
  ['voucher', 'Voucher ditanggung penjual', false, ['voucher ditanggung penjual', 'seller voucher']],
  ['shipping_charge', 'Ongkir dibayar pembeli', false, ['ongkos kirim dibayar oleh pembeli', 'shipping fee']],
];
route('mp-import', {
  title: 'Import marketplace', perm: () => can('sales', 'c'),
  async render(el) {
    const lk = await lookups();
    const mps = lk.channels.filter(c => c.kind === 'marketplace' && c.active);
    el.innerHTML = pageHead('Import pesanan marketplace', 'Unggah file CSV ekspor pesanan. Pesanan yang nomornya sudah ada akan dilewati. Stok barang langsung dipesan (reserved) agar tidak terjual dobel di kasir.',
      '<button class="btn" id="tpl">' + ICON.dl + ' Template CSV</button>') +
      `<section class="panel"><div class="pb stack">
        <div class="grid g3"><label class="f req"><span>Marketplace</span><select id="ch">${mps.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="f req"><span>Cabang pengirim</span><select id="br">${S.me.branches.map(b => `<option value="${b.id}" ${b.id === S.branch ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
        <label class="f req"><span>File CSV</span><input type="file" id="file" accept=".csv,text/csv"></label></div>
        <div id="map"></div><div id="res"></div></div></section>`;
    $('#tpl', el).onclick = () => downloadCSV('template-import-marketplace', [{ order_no: '240901ABC', sku: 'MDL-01', qty: 2, price: 25000, customer_name: 'Budi', customer_phone: '0812xxxx', admin_fee: 4000, voucher: 0, shipping_charge: 0 }],
      MP_FIELDS.map(f => ({ k: f[0], l: f[0] })));
    let parsed = null;
    $('#file', el).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      parsed = parseCSV(await f.text());
      const guess = (aliases, key) => parsed.head.find(h => h.toLowerCase() === key) || parsed.head.find(h => aliases.some(a => h.toLowerCase().includes(a))) || '';
      $('#map', el).innerHTML = `<h3>Cocokkan kolom</h3><p class="small muted">${parsed.rows.length} baris terbaca.</p><div class="grid g3">${MP_FIELDS.map(([k, l, req, al]) =>
        `<label class="f ${req ? 'req' : ''}"><span>${l}</span><select data-k="${k}"><option value="">—</option>${parsed.head.map(h => `<option ${h === guess(al, k) ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div>
        <button class="btn primary" id="run" style="margin-top:12px">Import ${parsed.rows.length} baris</button>`;
      $('#run', el).onclick = async (ev) => {
        const map = Object.fromEntries($$('[data-k]', el).map(s => [s.dataset.k, s.value]));
        for (const [k, l, req] of MP_FIELDS) if (req && !map[k]) return toast(`Kolom "${l}" wajib dicocokkan.`, 'err');
        const num = (v) => Number(String(v || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;
        const rows = parsed.rows.map(r => Object.fromEntries(MP_FIELDS.map(([k]) => [k, map[k] ? (['qty', 'price', 'admin_fee', 'voucher', 'shipping_charge'].includes(k) ? num(r[map[k]]) : r[map[k]]) : null])))
          .filter(r => r.order_no && r.sku);
        ev.target.disabled = true;
        try {
          const res = await rpc('mp_import', { p_channel: $('#ch', el).value, p_branch: $('#br', el).value, p_rows: rows });
          $('#res', el).innerHTML = `<p class="note ok">${res.imported} pesanan diimport, ${res.skipped} dilewati (sudah ada).</p>` +
            (res.errors.length ? `<p class="note danger">${res.errors.length} pesanan gagal:</p>` + table([{ l: 'No. pesanan', k: 'order_no' }, { l: 'Masalah', k: 'error' }], res.errors) : '');
          changed();
        } catch (err) { toast(errMsg(err), 'err'); } finally { ev.target.disabled = false; }
      };
    };
  },
});
