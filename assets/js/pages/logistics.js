// Pengiriman, klaim ekspedisi, dan retur penjualan
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go, refresh,
  modal, formModal, upl, fileBtn, bindFiles, scanCode, findProduct, byLocBranch, byBranch, tabs, on, $, $$, h, ICON, printHTML,
  changed, emptyBox, today, sum, setting } from '../core.js';

const COURIERS = ['JNE', 'J&T', 'SiCepat', 'Anteraja', 'Ninja', 'POS Indonesia', 'Lion Parcel', 'ID Express', 'Gosend', 'GrabExpress', 'Kurir toko', 'Diambil pelanggan'];

// ---------- surat jalan ----------
async function printDO(d, lk) {
  const s = await q(sb.from('sales_orders').select('*, so_lines(*)').eq('id', d.so_id).single());
  printHTML(`<table><tr><td><h1>SURAT JALAN</h1>${esc(d.no)}<br>${fmt.date(d.created_at)}</td>
    <td class="r">${esc(setting('company_name') || 'Kertajaya Piala')}<br><span class="muted">${esc(lk.loc[d.location_id]?.name || '')}</span></td></tr></table>
    <div class="box">Kirim ke: <b>${esc(s.customer_name)}</b><br>${esc(s.customer_phone || '')}<br>Pesanan: ${esc(s.no)}${d.tracking_no ? `<br>Kurir: ${esc(d.courier)} — resi ${esc(d.tracking_no)}` : ''}</div>
    <table style="margin-top:10px"><thead><tr><th>#</th><th>Barang</th><th class="r">Qty</th></tr></thead><tbody>${
      s.so_lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(lk.prod[l.product_id]?.name)}${l.engraving_text ? `<br><span class="muted">Grafir: ${esc(l.engraving_text)}</span>` : ''}${l.serials?.length ? `<br><span class="muted">SN: ${esc(l.serials.join(', '))}</span>` : ''}</td><td class="r">${fmt.n(l.qty)}</td></tr>`).join('')}</tbody></table>
    <table style="margin-top:30px"><tr><td class="c">Penyerah<br><br><br>(______________)</td><td class="c">Kurir<br><br><br>(______________)</td><td class="c">Penerima<br><br><br>(______________)</td></tr></table>
    <p class="muted">Barang diperiksa saat serah terima. Keluhan setelah tanda tangan menjadi tanggung jawab penerima.</p>`, { title: d.no });
}

/** packing: scan setiap barang, wajib foto isi paket sebelum ditutup */
async function packModal(d, lk) {
  const s = await q(sb.from('sales_orders').select('*, so_lines(*)').eq('id', d.so_id).single());
  const need = s.so_lines.map(l => ({ product_id: l.product_id, qty: Number(l.qty), serials: l.serials || [] }));
  const scanned = need.map(n => ({ product_id: n.product_id, qty: 0, serials: [] }));
  const body = h(`<div class="stack">
    <p class="note warn small">Scan setiap barang sampai cocok dengan pesanan, lalu foto isi paket sebelum ditutup. Foto ini jadi bukti kalau pelanggan mengaku barang kurang.</p>
    <div class="actions"><button class="btn primary" data-scan>${ICON.scan} Scan barang</button><button class="btn" data-manual>Tandai manual</button></div>
    <div data-list></div>
    <label class="f req"><span>Foto isi paket sebelum ditutup</span><div class="photo-in"><input type="file" accept="image/*" capture="environment" data-photo><img hidden alt=""></div></label>
  </div>`);
  const draw = () => {
    $('[data-list]', body).innerHTML = table([
      { l: 'Barang', f: r => `${esc(lk.prod[r.product_id]?.sku)} ${esc(lk.prod[r.product_id]?.name)}` },
      { l: 'Pesanan', cls: 'num', f: r => fmt.n(r.qty) },
      { l: 'Discan', cls: 'num', f: r => fmt.n(scanned.find(x => x.product_id === r.product_id).qty) },
      { l: '', f: r => { const sc = scanned.find(x => x.product_id === r.product_id); return sc.qty === r.qty ? '<span class="chip ok">cocok</span>' : sc.qty > r.qty ? '<span class="chip danger">kelebihan</span>' : '<span class="chip warn">kurang</span>'; } },
    ], need, { cards: false });
  };
  const add = (p, serial) => {
    const n = need.find(x => x.product_id === p.id);
    if (!n) return toast(`${p.sku} tidak ada dalam pesanan ini.`, 'err');
    const sc = scanned.find(x => x.product_id === p.id);
    if (serial) { if (sc.serials.includes(serial)) return toast('Serial sudah discan.', 'err'); sc.serials.push(serial); }
    sc.qty += 1; navigator.vibrate?.(40); draw();
  };
  on(body, '[data-scan]', 'click', async () => {
    const c = await scanCode('Scan barang / serial'); if (!c) return;
    const p = findProduct(lk, c);
    if (p) return add(p, null);
    const su = await q(sb.from('serial_units').select('*').eq('serial', c).maybeSingle());
    if (su) return add(lk.prod[su.product_id], c);
    toast('Kode tidak dikenal: ' + c, 'err');
  });
  on(body, '[data-manual]', 'click', () => { scanned.forEach((sc, i) => { sc.qty = need[i].qty; sc.serials = need[i].serials; }); draw(); toast('Ditandai manual — pastikan barang benar-benar diperiksa.'); });
  $('[data-photo]', body).addEventListener('change', (e) => { const f = e.target.files[0]; const img = $('img', body); if (f) { img.src = URL.createObjectURL(f); img.hidden = false; } });
  draw();
  modal({ title: 'Packing ' + d.no, body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Selesai packing', kind: 'primary', onClick: async () => {
    const f = $('[data-photo]', body).files[0];
    if (!f) throw new Error('Foto isi paket wajib diunggah.');
    await rpc('do_pack', { p_id: d.id, p_photo: await upl(f, 'packing'), p_scan: scanned });
    toast('Paket siap dikirim.'); changed(); refresh();
  } }] });
}

route('delivery', {
  title: 'Pengiriman', perm: ['logistics'],
  async render(el, params) {
    const lk = await lookups();
    const tab = params.t || 'packing';
    let b = sb.from('delivery_orders').select('*, sales_orders(no, customer_name, customer_phone, channel_id, need_date)').order('created_at', { ascending: false }).limit(300);
    b = byLocBranch(b, lk);
    b = tab === 'all' ? b : b.eq('status', tab);
    const rows = await q(b);
    const ready = tab === 'packing' ? await q(byBranch(sb.from('sales_orders').select('*').eq('status', 'ready').is('recognized_at', null)).order('need_date', { nullsFirst: false })) : [];
    const readyNoDO = ready.filter(s => !rows.some(d => d.so_id === s.id));
    el.innerHTML = pageHead('Pengiriman', 'Tidak ada barang keluar tanpa surat jalan. Foto isi paket wajib sebelum paket ditutup.') +
      tabs([{ k: 'packing', l: 'Packing' }, { k: 'packed', l: 'Siap kirim' }, { k: 'shipped', l: 'Dalam pengiriman' }, { k: 'delivered', l: 'Terkirim' }, { k: 'all', l: 'Semua' }], tab) +
      (readyNoDO.length ? `<section class="panel" style="margin-bottom:14px"><div class="ph"><h2>Pesanan siap kirim, belum ada surat jalan</h2><span class="badge">${readyNoDO.length}</span></div><div class="pb" data-ready></div></section>` : '') +
      table([
        { l: 'Surat jalan', f: r => plate(r.no) }, { l: 'Pesanan', f: r => `${esc(r.sales_orders?.no)}<br><span class="small muted">${esc(r.sales_orders?.customer_name)}</span>` },
        { l: 'Dibutuhkan', f: r => fmt.date(r.sales_orders?.need_date) }, { l: 'Status', f: r => chip(r.status) },
        { l: 'Kurir / resi', f: r => r.tracking_no ? `${esc(r.courier)}<br><span class="small">${esc(r.tracking_no)}</span>` : esc(r.courier || '—') },
        { l: 'Bukti', f: r => fileBtn(r.packing_photo_path, 'Foto packing') + ' ' + (r.proof_path ? fileBtn(r.proof_path, 'Bukti terima') : '') },
        { l: '', f: r => `<div class="actions">${
          r.status === 'packing' && can('logistics', 'e') ? '<button class="btn sm primary" data-pack>Packing</button>' : ''}${
          r.status === 'packed' && can('logistics', 'e') ? '<button class="btn sm primary" data-ship>Kirim</button>' : ''}${
          r.status === 'shipped' && can('logistics', 'e') ? '<button class="btn sm" data-deliver>Tandai diterima</button>' : ''}${
          r.status === 'shipped' && can('claims', 'c') ? '<button class="btn sm danger" data-claim>Klaim</button>' : ''}
          <button class="btn sm" data-print>${ICON.print}</button></div>` },
      ], rows, { empty: 'Tidak ada surat jalan pada tab ini' });
    const rd = $('[data-ready]', el);
    if (rd) {
      rd.innerHTML = table([{ l: 'Pesanan', f: r => plate(r.no) }, { l: 'Pelanggan', k: 'customer_name' }, { l: 'Dibutuhkan', f: r => fmt.date(r.need_date) },
        { l: 'Total', cls: 'num', f: r => fmt.rp(r.total) }, { l: '', f: () => can('logistics', 'c') ? '<button class="btn sm primary" data-new>Buat surat jalan</button>' : '' }], readyNoDO);
      on(rd, '[data-new]', 'click', async (e, b2) => {
        try { const id = await rpc('do_create', { p_so: readyNoDO[+b2.closest('tr').dataset.i].id }); toast('Surat jalan dibuat.'); go('delivery', { id }); refresh(); }
        catch (err) { toast(errMsg(err), 'err'); }
      });
    }
    bindFiles(el);
    on(el, '[data-pack]', 'click', (e, b2) => packModal(rows[+b2.closest('tr').dataset.i], lk));
    on(el, '[data-print]', 'click', (e, b2) => printDO(rows[+b2.closest('tr').dataset.i], lk));
    on(el, '[data-ship]', 'click', async (e, b2) => {
      const d = rows[+b2.closest('tr').dataset.i];
      await formModal({ title: 'Kirim ' + d.no, submitLabel: 'Kirim',
        fields: [{ name: 'courier', label: 'Kurir / ekspedisi', type: 'select', required: true, options: COURIERS.map(c => ({ value: c, label: c })) },
          { name: 'tracking', label: 'No. resi', hint: 'Wajib untuk ekspedisi. Kosongkan hanya untuk kurir toko / diambil pelanggan.' },
          { name: 'cost', label: 'Ongkir dibayar toko (Rp)', type: 'number', value: 0 }],
        onSubmit: v => rpc('do_ship', { p_id: d.id, p_courier: v.courier, p_tracking: v.tracking, p_cost: v.cost || 0 }) });
      changed(); refresh();
    });
    on(el, '[data-deliver]', 'click', async (e, b2) => {
      const d = rows[+b2.closest('tr').dataset.i];
      await formModal({ title: 'Tandai diterima', intro: '<p class="small muted">Untuk pengiriman toko/COD, unggah foto serah terima atau tanda tangan penerima.</p>',
        fields: [{ name: 'proof', label: 'Bukti terima (opsional)', type: 'photo' }],
        onSubmit: async v => rpc('do_deliver', { p_id: d.id, p_proof: v.proof ? await upl(v.proof, 'bukti-terima') : null }) });
      changed(); refresh();
    });
    on(el, '[data-claim]', 'click', async (e, b2) => {
      const d = rows[+b2.closest('tr').dataset.i];
      await formModal({ title: 'Klaim ke ekspedisi', fields: [
        { name: 'reason', label: 'Masalah', type: 'select', required: true, options: [['hilang', 'Paket hilang'], ['rusak', 'Paket rusak'], ['telat', 'Terlambat jauh'], ['kurang', 'Isi kurang']].map(([value, label]) => ({ value, label })) },
        { name: 'claim_amount', label: 'Nilai klaim (Rp)', type: 'number', required: true }, { name: 'note', label: 'Kronologi', type: 'textarea', required: true }],
        onSubmit: v => rpc('claim_create', { p: { ...v, do_id: d.id } }) });
      toast('Klaim diajukan.'); refresh();
    });
    if (params.id) { const d = rows.find(r => r.id === params.id); if (d && d.status === 'packing') packModal(d, lk); }
  },
});

route('claims', {
  title: 'Klaim ekspedisi', perm: ['claims'],
  async render(el) {
    const lk = await lookups();
    const rows = await q(sb.from('courier_claims').select('*, delivery_orders(no, tracking_no, so_id, sales_orders(no, customer_name))').order('created_at', { ascending: false }).limit(300));
    const open = rows.filter(r => ['submitted', 'approved'].includes(r.status));
    el.innerHTML = pageHead('Klaim ekspedisi', 'Paket hilang/rusak dikejar ke ekspedisi, bukan dianggap kerugian toko begitu saja.') +
      `<div class="metrics" style="margin-bottom:14px"><div class="metric"><div class="l">Klaim berjalan</div><div class="v">${open.length}</div></div>
       <div class="metric"><div class="l">Nilai diklaim</div><div class="v">${fmt.rp(sum(open, 'claim_amount'))}</div></div>
       <div class="metric"><div class="l">Diterima tahun ini</div><div class="v">${fmt.rp(sum(rows.filter(r => r.status === 'paid'), 'received_amount'))}</div></div></div>` +
      table([{ l: 'No', f: r => plate(r.no) }, { l: 'Kiriman', f: r => `${esc(r.delivery_orders?.no)}<br><span class="small muted">${esc(r.courier)} ${esc(r.delivery_orders?.tracking_no || '')}</span>` },
        { l: 'Pelanggan', f: r => esc(r.delivery_orders?.sales_orders?.customer_name || '—') }, { l: 'Masalah', f: r => esc(r.reason) },
        { l: 'Diklaim', cls: 'num', f: r => fmt.rp(r.claim_amount) }, { l: 'Diterima', cls: 'num', f: r => r.received_amount ? fmt.rp(r.received_amount) : '—' },
        { l: 'Status', f: r => chip(r.status) }, { l: 'Diajukan', f: r => `${esc(uname(lk, r.created_by))}<br><span class="small muted">${fmt.date(r.created_at)}</span>` },
        { l: '', f: r => ['paid', 'rejected'].includes(r.status) || !can('claims', 'e') ? '' : '<button class="btn sm" data-upd>Perbarui</button>' }], rows, { empty: 'Belum ada klaim' });
    on(el, '[data-upd]', 'click', async (e, b) => {
      const c = rows[+b.closest('tr').dataset.i];
      await formModal({ title: 'Perbarui klaim ' + c.no, fields: [
        { name: 'status', label: 'Status', type: 'select', required: true, value: c.status, options: [['submitted', 'Diajukan'], ['approved', 'Disetujui ekspedisi'], ['paid', 'Diganti (uang diterima)'], ['rejected', 'Ditolak ekspedisi']].map(([value, label]) => ({ value, label })) },
        { name: 'received', label: 'Nominal diterima (Rp)', type: 'number', hint: 'Wajib jika status "Diganti".' }, { name: 'note', label: 'Catatan', type: 'textarea' }],
        onSubmit: v => rpc('claim_update', { p_id: c.id, p_status: v.status, p_received: v.received, p_note: v.note }) });
      toast('Klaim diperbarui.'); refresh();
    });
  },
});

// =====================================================================
//  RETUR PENJUALAN
// =====================================================================
route('returns', {
  title: 'Retur penjualan', perm: ['returns', 'return_receive'],
  async render(el, params) {
    const lk = await lookups();
    if (params.new) return returnForm(params.new, lk);
    const tab = params.t || 'expected';
    let b = sb.from('sales_returns').select('*, sales_orders(no, customer_name), return_lines(*)').order('created_at', { ascending: false }).limit(300);
    b = byBranch(b);
    b = tab === 'all' ? b : b.eq('status', tab);
    const rows = await q(b);
    const aging = Number(setting('return_aging_days') || 14);
    el.innerHTML = pageHead('Retur penjualan', 'Refund hanya setelah barang fisik diterima dan diperiksa. Barang retur masuk karantina sampai ada keputusan.') +
      tabs([{ k: 'expected', l: 'Menunggu barang' }, { k: 'received', l: 'Di karantina' }, { k: 'dispositioned', l: 'Selesai' }, { k: 'cancelled', l: 'Batal' }, { k: 'all', l: 'Semua' }], tab) +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Pesanan', f: r => `${esc(r.sales_orders?.no)}<br><span class="small muted">${esc(r.sales_orders?.customer_name)}</span>` },
        { l: 'Channel', f: r => esc(lk.ch[r.channel_id]?.name) }, { l: 'Penyebab', f: r => esc(lk.retReasons.find(x => x.code === r.reason_code)?.name) },
        { l: 'Barang', f: r => r.return_lines.map(l => `${esc(lk.prod[l.product_id]?.sku)} ${fmt.n(l.qty_expected)}${l.qty_received !== null ? ` → ${fmt.n(l.qty_received)}` : ''}`).join('<br>') },
        { l: 'Resi retur', f: r => esc(r.return_tracking_no || '—') },
        { l: 'Menunggu', f: r => r.status === 'expected' ? `<span class="${Math.floor((Date.now() - new Date(r.created_at)) / 86400e3) > aging ? 'chip danger' : ''}">${fmt.ago(r.created_at)}</span>` : '—' },
        { l: 'Refund', cls: 'num', f: r => fmt.rp(r.refund_amount) }, { l: 'Status', f: r => chip(r.status) + (r.disposition ? '<br>' + chip('info', { rework: 'Diperbaiki', markdown: 'Dijual diskon', writeoff: 'Dihapus buku' }[r.disposition]) : '') },
        { l: '', f: r => `<div class="actions">${r.status === 'expected' && can('return_receive', 'c') ? '<button class="btn sm primary" data-recv>Terima barang</button>' : ''}${
          r.status === 'expected' && can('returns', 'c') ? '<button class="btn sm danger" data-cancel>Batal</button>' : ''}${
          r.status === 'received' && can('returns', 'a') ? '<button class="btn sm primary" data-disp>Disposisi</button>' : ''}
          ${r.unboxing_photo_path ? fileBtn(r.unboxing_photo_path, 'Foto unboxing') : ''}</div>` },
      ], rows, { empty: 'Tidak ada retur', rowCls: r => r.status === 'expected' && Math.floor((Date.now() - new Date(r.created_at)) / 86400e3) > aging ? 'bad' : '' });
    bindFiles(el);
    on(el, '[data-tab]', 'click', (e, b2) => go('returns', { t: b2.dataset.tab }));
    on(el, '[data-cancel]', 'click', async (e, b2) => {
      const r = rows[+b2.closest('tr').dataset.i];
      const n = await ask('Batalkan retur', `Batalkan ${esc(r.no)}? Gunakan ini jika pelanggan urung mengembalikan barang.`, { minLen: 5, label: 'Alasan', danger: true }); if (!n) return;
      try { await rpc('return_cancel', { p_id: r.id, p_reason: n }); toast('Retur dibatalkan.'); changed(); refresh(); } catch (err) { toast(errMsg(err), 'err'); }
    });
    on(el, '[data-recv]', 'click', (e, b2) => receiveModal(rows[+b2.closest('tr').dataset.i], lk));
    on(el, '[data-disp]', 'click', (e, b2) => disposeModal(rows[+b2.closest('tr').dataset.i], lk));
    if (params.id) { const r = rows.find(x => x.id === params.id); if (r?.status === 'received') disposeModal(r, lk); }
  },
});

async function returnForm(soId, lk) {
  const s = await q(sb.from('sales_orders').select('*, so_lines(*)').eq('id', soId).single());
  const body = h(`<div class="stack">
    <p class="note small">Catat retur <b>saat pelanggan mengajukan</b>, bukan saat barang datang. Nilai barang langsung masuk pantauan "Retur Dalam Perjalanan" agar tidak ada yang hilang di jalan.</p>
    <div class="grid g2">
      <label class="f req"><span>Penyebab retur</span><select name="reason_code">${lk.retReasons.map(r => `<option value="${r.code}">${esc(r.name)}</option>`).join('')}</select></label>
      <label class="f"><span>Kurir retur</span><input name="courier" list="dl-cour"><datalist id="dl-cour">${COURIERS.map(c => `<option>${c}</option>`).join('')}</datalist></label>
      <label class="f"><span>No. resi retur</span><input name="tracking_no" placeholder="Minta ke pelanggan"></label>
      <label class="f"><span>Refund ke pelanggan (Rp)</span><input type="number" name="refund_amount" value="0"></label>
    </div>
    <label class="f"><span>Keterangan pelanggan</span><textarea name="reason_note"></textarea></label>
    <div><h3>Barang yang diretur</h3><table class="lines"><thead><tr><th>Barang</th><th style="width:110px">Qty diretur</th></tr></thead><tbody>${
      s.so_lines.map(l => `<tr data-p="${l.product_id}"><td data-l="Barang">${esc(lk.prod[l.product_id]?.name)}<div class="small muted">dibeli ${fmt.n(l.qty)}</div></td>
        <td data-l="Qty diretur"><input type="number" step="any" min="0" max="${l.qty}" data-q value="0"></td></tr>`).join('')}</tbody></table></div>
  </div>`);
  modal({ title: 'Retur untuk ' + s.no, body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Simpan retur', kind: 'primary', onClick: async () => {
    const get = (n) => body.querySelector(`[name="${n}"]`).value;
    const lines = $$('tbody tr', body).map(tr => ({ product_id: tr.dataset.p, qty: Number($('[data-q]', tr).value) })).filter(l => l.qty > 0);
    if (!lines.length) throw new Error('Isi jumlah barang yang diretur.');
    await rpc('return_create', { p: { so_id: s.id, reason_code: get('reason_code'), reason_note: get('reason_note'), courier: get('courier'), tracking_no: get('tracking_no'), refund_amount: Number(get('refund_amount') || 0), lines } });
    toast('Retur dicatat. Tunggu barang fisik datang.'); changed(); go('returns');
  } }], onClose: () => { if (location.hash.includes('new=')) go('returns'); } });
}

async function receiveModal(r, lk) {
  const body = h(`<div class="stack">
    <p class="note warn small">Rekam/foto proses buka paket <b>sebelum</b> dibuka sepenuhnya. Penerima tidak boleh orang yang memproses refund. Barang masuk karantina, belum jadi stok jual.</p>
    <table class="lines"><thead><tr><th>Barang</th><th style="width:100px">Diharapkan</th><th style="width:100px">Diterima</th><th>Kondisi</th></tr></thead><tbody>${
      r.return_lines.map(l => `<tr data-id="${l.id}"><td data-l="Barang">${esc(lk.prod[l.product_id]?.name)}</td><td data-l="Diharapkan" class="num">${fmt.n(l.qty_expected)}</td>
        <td data-l="Diterima"><input type="number" step="any" min="0" data-q value="${l.qty_expected}"></td>
        <td data-l="Kondisi"><input data-c placeholder="mis. lecet, pecah, segel rusak"></td></tr>`).join('')}</tbody></table>
    <label class="f req"><span>Foto/video unboxing</span><div class="photo-in"><input type="file" accept="image/*" capture="environment" data-photo><img hidden alt=""></div></label>
    <label class="f"><span>Catatan penerimaan</span><textarea data-note></textarea></label></div>`);
  $('[data-photo]', body).addEventListener('change', e => { const f = e.target.files[0]; const i = $('img', body); if (f) { i.src = URL.createObjectURL(f); i.hidden = false; } });
  modal({ title: 'Terima barang retur ' + r.no, body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Terima', kind: 'primary', onClick: async () => {
    const f = $('[data-photo]', body).files[0];
    if (!f) throw new Error('Foto unboxing wajib diunggah.');
    const lines = $$('tbody tr', body).map(tr => ({ line_id: tr.dataset.id, qty_received: Number($('[data-q]', tr).value || 0), condition: $('[data-c]', tr).value }));
    await rpc('return_receive', { p_id: r.id, p_lines: lines, p_photo: await upl(f, 'unboxing'), p_note: $('[data-note]', body).value });
    toast('Barang retur diterima & masuk karantina.'); changed(); refresh();
  } }] });
}

async function disposeModal(r, lk) {
  const val = r.return_lines?.reduce((a, l) => a + Number(l.qty_received || 0) * Number(l.unit_cost), 0) || 0;
  await formModal({ title: 'Disposisi retur ' + r.no, size: 'wide',
    intro: `<p class="note small">Nilai barang di karantina ${fmt.rp(val)}. Tentukan tindakan dan siapa yang menanggung biayanya — biar penyebab retur bisa ditelusuri.</p>`,
    fields: [
      { name: 'disp', label: 'Tindakan', type: 'select', required: true, options: [['rework', 'Perbaiki / rework (kembali jadi stok)'], ['markdown', 'Jual sebagai barang diskon'], ['writeoff', 'Hapus buku (tidak bisa dijual)']].map(([value, label]) => ({ value, label })) },
      { name: 'charge_to', label: 'Biaya dibebankan ke', type: 'select', required: true, value: lk.retReasons.find(x => x.code === r.reason_code)?.default_party,
        options: [['branch', 'Cabang'], ['operator', 'Operator produksi'], ['warehouse', 'Gudang'], ['courier', 'Ekspedisi'], ['customer', 'Pelanggan'], ['company', 'Perusahaan']].map(([value, label]) => ({ value, label })) },
      { name: 'party', label: 'Nama pihak / orang', required: true, hint: 'Sebutkan nama, bukan hanya bagian. Ini yang membuat orang berhati-hati.' },
      { name: 'note', label: 'Catatan', type: 'textarea' }],
    onSubmit: v => rpc('return_dispose', { p_id: r.id, p_disp: v.disp, p_charge_to: v.charge_to, p_party: v.party, p_note: v.note }) });
  toast('Disposisi dicatat.'); changed(); refresh();
}
