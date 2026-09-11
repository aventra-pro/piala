// Pembelian: purchase order, penerimaan barang, faktur supplier, retur pembelian
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go, refresh,
  modal, formModal, upl, fileBtn, bindFiles, lineEditor, myLocations, tabs, on, $, $$, h, ICON, printHTML, changed, emptyBox, today, sum, setting } from '../core.js';

const locOpts = (lk) => myLocations(lk, ['main']).map(l => ({ value: l.id, label: `${lk.br[l.branch_id]?.name} · ${l.name}` }));

// ---------------------------------------------------------------------
route('po', {
  title: 'Purchase order', perm: ['purchasing'],
  async render(el, params) {
    const lk = await lookups();
    if (params.id) return poDetail(el, params.id, lk);
    const tab = params.t || 'open';
    let b = sb.from('purchase_orders').select('*, po_lines(*)').order('created_at', { ascending: false }).limit(300);
    if (tab === 'open') b = b.in('status', ['draft', 'pending_approval', 'approved', 'partial']);
    else if (tab !== 'all') b = b.eq('status', tab);
    const rows = await q(b);
    el.innerHTML = pageHead('Purchase order', `Semua pembelian lewat PO. Barang tidak boleh diterima tanpa PO, dan pembuat PO tidak boleh jadi penerima barang. PO di atas ${fmt.rp(setting('po_approval_threshold'))} wajib disetujui.`,
      can('purchasing', 'c') ? `<button class="btn primary" id="new">${ICON.plus} PO baru</button>` : '') +
      tabs([{ k: 'open', l: 'Berjalan' }, { k: 'pending_approval', l: 'Menunggu approval' }, { k: 'received', l: 'Selesai' }, { k: 'closed', l: 'Ditutup' }, { k: 'all', l: 'Semua' }], tab) +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Supplier', f: r => esc(lk.sup[r.supplier_id]?.name) },
        { l: 'Lokasi tujuan', f: r => esc(lk.loc[r.location_id]?.name) },
        { l: 'Tanggal', f: r => `${fmt.date(r.order_date)}${r.expected_date ? `<br><span class="small muted">datang ${fmt.date(r.expected_date)}</span>` : ''}` },
        { l: 'Item', cls: 'num', f: r => r.po_lines.length },
        { l: 'Diterima', f: r => { const t = sum(r.po_lines, 'qty'), d = sum(r.po_lines, 'qty_received'); return `<div class="hbar"><i style="width:${t ? d / t * 100 : 0}%"></i></div><span class="small">${fmt.n(d)} / ${fmt.n(t)}</span>`; } },
        { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.total) },
        { l: 'Status', f: r => chip(r.status) }, { l: 'Dibuat', f: r => esc(uname(lk, r.created_by)) },
      ], rows, { click: true, empty: 'Tidak ada PO' });
    on(el, '[data-tab]', 'click', (e, b2) => go('po', { t: b2.dataset.tab }));
    bindRows(el, rows, r => go('po', { id: r.id }));
    $('#new', el)?.addEventListener('click', () => poForm(null, lk));
  },
});

async function poForm(existing, lk) {
  const le = lineEditor(lk, existing?.po_lines || [], { price: true, priceOf: p => p.std_cost || '', info: p => `HPP ${fmt.rp(p.avg_cost)}` });
  const body = h(`<div class="stack"><div class="grid g3">
    <label class="f req"><span>Supplier</span><select data-sup>${lk.suppliers.filter(s => s.active).map(s => `<option value="${s.id}" ${s.id === existing?.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="f req"><span>Dikirim ke lokasi</span><select data-loc>${locOpts(lk).map(o => `<option value="${o.value}" ${o.value === existing?.location_id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
    <label class="f"><span>Perkiraan datang</span><input type="date" data-exp value="${esc(existing?.expected_date || '')}"></label></div>
    <label class="f"><span>Catatan untuk supplier</span><input data-note value="${esc(existing?.note || '')}"></label></div>`);
  body.appendChild(le.el);
  return new Promise(resolve => modal({ title: existing ? 'Ubah ' + existing.no : 'Purchase order baru', body, size: 'wide',
    actions: [{ label: 'Batal' }, { label: 'Simpan draft', kind: 'primary', onClick: async () => {
      const id = await rpc('po_save', { p: { id: existing?.id || null, supplier_id: $('[data-sup]', body).value, location_id: $('[data-loc]', body).value,
        expected_date: $('[data-exp]', body).value || null, note: $('[data-note]', body).value, lines: le.get() } });
      toast('Tersimpan.'); resolve(id); go('po', { id });
    } }], onClose: () => resolve(null) }));
}

async function poDetail(el, id, lk) {
  const po = await q(sb.from('purchase_orders').select('*, po_lines(*), goods_receipts(*, gr_lines(*)), supplier_invoices(*)').eq('id', id).single());
  const sup = lk.sup[po.supplier_id];
  const acts = [];
  if (po.status === 'draft' && can('purchasing', 'e')) acts.push(['edit', 'Ubah', ''], ['submit', 'Kirim ke supplier', 'primary']);
  if (['approved', 'partial'].includes(po.status) && can('grn', 'c')) acts.push(['grn', 'Terima barang', 'primary']);
  if (['approved', 'partial', 'received'].includes(po.status) && can('sup_invoice', 'c')) acts.push(['inv', 'Catat faktur supplier', 'brass']);
  if (!['closed', 'cancelled', 'received'].includes(po.status) && can('purchasing', 'e')) acts.push(['close', 'Tutup PO', 'danger']);
  acts.push(['print', 'Cetak PO', '']);
  const lines = po.po_lines.map(l => ({ ...l, p: lk.prod[l.product_id] }));
  el.innerHTML = `<p><a href="#/po">← Semua PO</a></p>` +
    pageHead(sup?.name || 'PO', `${plate(po.no, 'lg')} ${chip(po.status)} · ${esc(lk.loc[po.location_id]?.name)}`,
      acts.map(([k, l, c]) => `<button class="btn ${c}" data-a="${k}">${esc(l)}</button>`).join('')) +
    `<div class="cols"><div class="stack">
      <section class="panel"><div class="ph"><h2>Barang dipesan</h2></div><div class="pb">${table([
        { l: 'Barang', f: r => `<b>${esc(r.p?.sku)}</b><br><span class="small muted">${esc(r.p?.name)}</span>` },
        { l: 'Dipesan', cls: 'num', f: r => fmt.n(r.qty) }, { l: 'Diterima', cls: 'num', f: r => fmt.n(r.qty_received) },
        { l: 'Sisa', cls: 'num', f: r => fmt.n(Number(r.qty) - Number(r.qty_received)) },
        { l: 'Harga', cls: 'num', f: r => fmt.rp(r.price) }, { l: 'Jumlah', cls: 'num', f: r => fmt.rp(r.qty * r.price), foot: rs => fmt.rp(sum(rs, r => r.qty * r.price)) }], lines, { cards: true })}</div></section>
      ${po.goods_receipts.length ? `<section class="panel"><div class="ph"><h2>Penerimaan barang</h2></div><div class="pb">${table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Tanggal', f: r => fmt.dt(r.received_at) }, { l: 'Penerima', f: r => esc(uname(lk, r.received_by)) },
        { l: 'Barang', f: r => r.gr_lines.map(g => `${esc(lk.prod[g.product_id]?.sku)} ${fmt.n(g.qty)}`).join('<br>') },
        { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.total) }, { l: '', f: r => r.has_diff ? '<span class="chip warn">tidak sesuai PO</span>' : '' }], po.goods_receipts)}</div></section>` : ''}
      ${po.supplier_invoices.length ? `<section class="panel"><div class="ph"><h2>Faktur supplier</h2></div><div class="pb">${table([
        { l: 'No', f: r => plate(r.no) + '<br>' + esc(r.invoice_no) }, { l: 'Tanggal', f: r => fmt.date(r.invoice_date) },
        { l: 'Nilai faktur', cls: 'num', f: r => fmt.rp(r.amount) }, { l: 'Nilai barang diterima', cls: 'num', f: r => fmt.rp(r.received_value) },
        { l: 'Status', f: r => chip(r.status) + (r.match_note ? `<br><span class="small muted">${esc(r.match_note)}</span>` : '') }, { l: 'Bukti', f: r => fileBtn(r.proof_path) }], po.supplier_invoices)}</div></section>` : ''}
    </div><div class="stack">
      <section class="panel"><div class="ph"><h2>Detail</h2></div><div class="pb"><dl class="kv">
        <dt>Supplier</dt><dd>${esc(sup?.name)}<br><span class="small muted">${esc(sup?.phone || '')}</span></dd>
        <dt>Tanggal PO</dt><dd>${fmt.date(po.order_date)}</dd><dt>Perkiraan datang</dt><dd>${fmt.date(po.expected_date)}</dd>
        <dt>Nilai</dt><dd>${fmt.rp(po.total)}</dd><dt>Dibuat</dt><dd>${esc(uname(lk, po.created_by))}</dd>
        ${po.approved_by ? `<dt>Disetujui</dt><dd>${esc(uname(lk, po.approved_by))}<br><span class="small muted">${esc(po.approve_note || '')}</span></dd>` : ''}
        ${po.closed_reason ? `<dt>Alasan tutup</dt><dd>${esc(po.closed_reason)}</dd>` : ''}</dl>
        ${po.note ? `<p class="note small" style="margin-top:10px">${esc(po.note)}</p>` : ''}</div></section>
    </div></div>`;
  bindFiles(el);
  on(el, '[data-a]', 'click', async (e, b) => {
    try {
      const a = b.dataset.a;
      if (a === 'edit') { await poForm(po, lk); return refresh(); }
      if (a === 'submit') { const st = await rpc('po_submit', { p_id: po.id }); toast(st === 'approved' ? 'PO dikirim.' : 'PO menunggu approval karena nilainya besar.'); changed(); return refresh(); }
      if (a === 'close') { const n = await ask('Tutup PO', 'Sisa barang dianggap batal dipesan.', { minLen: 5, label: 'Alasan', danger: true }); if (!n) return; await rpc('po_close', { p_id: po.id, p_reason: n }); toast('PO ditutup.'); return refresh(); }
      if (a === 'print') return printHTML(`<table><tr><td><h1>PURCHASE ORDER</h1>${esc(po.no)}<br>${fmt.date(po.order_date)}</td><td class="r">${esc(setting('company_name') || 'Kertajaya Piala')}</td></tr></table>
        <div class="box">Kepada: <b>${esc(sup?.name)}</b><br>${esc(sup?.address || '')}<br>${esc(sup?.phone || '')}</div>
        <table style="margin-top:10px"><thead><tr><th>#</th><th>Barang</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Jumlah</th></tr></thead><tbody>${
          lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.p?.name)} (${esc(l.p?.sku)})</td><td class="r">${fmt.n(l.qty)}</td><td class="r">${fmt.rp(l.price)}</td><td class="r">${fmt.rp(l.qty * l.price)}</td></tr>`).join('')}
          <tr><td colspan="4" class="r"><b>Total</b></td><td class="r"><b>${fmt.rp(po.total)}</b></td></tr></tbody></table>
        ${po.expected_date ? `<p>Mohon dikirim paling lambat ${fmt.date(po.expected_date)} ke ${esc(lk.loc[po.location_id]?.name)}.</p>` : ''}
        ${po.note ? `<p>${esc(po.note)}</p>` : ''}<p>Faktur wajib mencantumkan nomor PO ini.</p>`, { title: po.no });
      if (a === 'grn') return grnModal(po, lk);
      if (a === 'inv') {
        await formModal({ title: 'Catat faktur supplier', intro: '<p class="note small">Sistem mencocokkan faktur dengan PO dan barang yang benar-benar diterima (3-way match). Kalau tidak cocok, faktur diblokir sampai disetujui keuangan.</p>',
          fields: [{ name: 'invoice_no', label: 'No. faktur supplier', required: true }, { name: 'invoice_date', label: 'Tanggal faktur', type: 'date', required: true, value: today() },
            { name: 'due_date', label: 'Jatuh tempo', type: 'date', value: sup?.terms_days ? new Date(Date.now() + sup.terms_days * 86400e3).toISOString().slice(0, 10) : '' },
            { name: 'amount', label: 'Nilai faktur (Rp)', type: 'number', required: true }, { name: 'proof', label: 'Foto/scan faktur', type: 'file', required: true }],
          onSubmit: async v => rpc('sup_invoice_create', { p: { po_id: po.id, invoice_no: v.invoice_no, invoice_date: v.invoice_date, due_date: v.due_date || null, amount: v.amount, proof_path: await upl(v.proof, 'faktur-supplier') } }) });
        changed(); return refresh();
      }
    } catch (err) { toast(errMsg(err), 'err'); }
  });
}

async function grnModal(po, lk) {
  const open = po.po_lines.filter(l => Number(l.qty) > Number(l.qty_received));
  if (!open.length) return toast('Semua barang di PO ini sudah diterima.', 'err');
  const body = h(`<div class="stack">
    <p class="note warn small">Hitung dan periksa barang dulu. Isi jumlah yang <b>benar-benar diterima</b> — jangan menyalin angka PO. Selisih otomatis tercatat dan menahan pembayaran faktur.</p>
    <table class="lines"><thead><tr><th>Barang</th><th style="width:100px">Sisa PO</th><th style="width:110px">Diterima</th></tr></thead><tbody>${
      open.map(l => `<tr data-id="${l.id}"><td data-l="Barang">${esc(lk.prod[l.product_id]?.sku)} ${esc(lk.prod[l.product_id]?.name)}${lk.prod[l.product_id]?.track_serial ? '<div class="small muted">Serial dibuat otomatis</div>' : ''}</td>
        <td data-l="Sisa PO" class="num">${fmt.n(Number(l.qty) - Number(l.qty_received))}</td>
        <td data-l="Diterima"><input type="number" step="any" min="0" data-q value="${Number(l.qty) - Number(l.qty_received)}"></td></tr>`).join('')}</tbody></table>
    <label class="f"><span>Catatan penerimaan (kondisi barang, no. surat jalan supplier)</span><textarea data-note></textarea></label></div>`);
  modal({ title: 'Terima barang ' + po.no, body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Catat penerimaan', kind: 'primary', onClick: async () => {
    const lines = $$('tbody tr', body).map(tr => ({ po_line_id: tr.dataset.id, qty: Number($('[data-q]', tr).value || 0) })).filter(l => l.qty > 0);
    if (!lines.length) throw new Error('Isi jumlah barang yang diterima.');
    await rpc('grn_post', { p_po: po.id, p_lines: lines, p_note: $('[data-note]', body).value });
    toast('Barang diterima dan masuk stok.'); changed(); refresh();
  } }] });
}

// ---------------------------------------------------------------------
route('grn', {
  title: 'Penerimaan barang', perm: ['grn'],
  async render(el) {
    const lk = await lookups();
    const [waiting, recent] = await Promise.all([
      q(sb.from('purchase_orders').select('*, po_lines(*)').in('status', ['approved', 'partial']).order('expected_date', { nullsFirst: false })),
      q(sb.from('goods_receipts').select('*, gr_lines(*), purchase_orders(no, supplier_id)').order('received_at', { ascending: false }).limit(100)),
    ]);
    el.innerHTML = pageHead('Penerimaan barang', 'Barang masuk hanya dengan acuan PO. Yang menerima tidak boleh orang yang membuat PO-nya.') +
      `<section class="panel"><div class="ph"><h2>Menunggu kedatangan</h2><span class="badge">${waiting.length}</span></div><div class="pb" data-w></div></section>
       <section class="panel"><div class="ph"><h2>Penerimaan terakhir</h2></div><div class="pb">${table([
        { l: 'No', f: r => plate(r.no) }, { l: 'PO', f: r => esc(r.purchase_orders?.no) }, { l: 'Supplier', f: r => esc(lk.sup[r.purchase_orders?.supplier_id]?.name) },
        { l: 'Waktu', f: r => fmt.dt(r.received_at) }, { l: 'Penerima', f: r => esc(uname(lk, r.received_by)) },
        { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.total) }, { l: '', f: r => r.has_diff ? '<span class="chip warn">beda dari PO</span>' : '' }], recent, { empty: 'Belum ada penerimaan' })}</div></section>`;
    const w = $('[data-w]', el);
    w.innerHTML = table([
      { l: 'PO', f: r => plate(r.no) }, { l: 'Supplier', f: r => esc(lk.sup[r.supplier_id]?.name) }, { l: 'Tujuan', f: r => esc(lk.loc[r.location_id]?.name) },
      { l: 'Perkiraan datang', f: r => `${fmt.date(r.expected_date)}${r.expected_date && r.expected_date < today() ? ' <span class="chip danger">telat</span>' : ''}` },
      { l: 'Sisa item', cls: 'num', f: r => r.po_lines.filter(l => Number(l.qty) > Number(l.qty_received)).length },
      { l: '', f: () => can('grn', 'c') ? '<button class="btn sm primary" data-recv>Terima</button>' : '' }], waiting, { empty: 'Tidak ada PO yang menunggu barang' });
    on(w, '[data-recv]', 'click', (e, b) => grnModal(waiting[+b.closest('tr').dataset.i], lk));
    bindRows(el, recent, r => go('po', { id: r.po_id }));
  },
});

// ---------------------------------------------------------------------
route('sup-invoices', {
  title: 'Faktur supplier', perm: ['sup_invoice', 'payables'],
  async render(el, params) {
    const lk = await lookups();
    const tab = params.t || 'open';
    let b = sb.from('supplier_invoices').select('*, purchase_orders(no)').order('invoice_date', { ascending: false }).limit(300);
    if (tab === 'open') b = b.in('status', ['matched', 'blocked', 'approved']);
    else if (tab !== 'all') b = b.eq('status', tab);
    const rows = await q(b);
    el.innerHTML = pageHead('Faktur supplier', 'Tiga arah harus cocok: PO, barang diterima, dan faktur. Yang tidak cocok otomatis diblokir dan tidak bisa dibayar sebelum ada keputusan.') +
      tabs([{ k: 'open', l: 'Belum dibayar' }, { k: 'blocked', l: 'Diblokir' }, { k: 'paid', l: 'Sudah dibayar' }, { k: 'all', l: 'Semua' }], tab) +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Faktur supplier', f: r => `${esc(r.invoice_no)}<br><span class="small muted">${fmt.date(r.invoice_date)}</span>` },
        { l: 'Supplier', f: r => esc(lk.sup[r.supplier_id]?.name) }, { l: 'PO', f: r => esc(r.purchase_orders?.no) },
        { l: 'Nilai faktur', cls: 'num', f: r => fmt.rp(r.amount) }, { l: 'Barang diterima', cls: 'num', f: r => fmt.rp(r.received_value) },
        { l: 'Selisih', cls: 'num', f: r => { const d = Number(r.amount) - Number(r.received_value); return d ? `<b style="color:var(--danger)">${fmt.rp(d)}</b>` : '—'; } },
        { l: 'Jatuh tempo', f: r => `${fmt.date(r.due_date)}${r.due_date && r.due_date < today() && r.status !== 'paid' ? ' <span class="chip danger">lewat</span>' : ''}` },
        { l: 'Status', f: r => chip(r.status) + (r.match_note ? `<br><span class="small muted">${esc(r.match_note)}</span>` : '') },
        { l: '', f: r => `<div class="actions">${fileBtn(r.proof_path, 'Faktur')}${['matched', 'approved'].includes(r.status) && can('payables', 'e') ? '<button class="btn sm primary" data-pay>Bayar</button>' : ''}</div>` },
      ], rows, { empty: 'Tidak ada faktur' });
    bindFiles(el);
    on(el, '[data-tab]', 'click', (e, b2) => go('sup-invoices', { t: b2.dataset.tab }));
    on(el, '[data-pay]', 'click', async (e, b2) => {
      const inv = rows[+b2.closest('tr').dataset.i];
      await formModal({ title: `Bayar ${inv.invoice_no} — ${fmt.rp(inv.amount)}`,
        fields: [{ name: 'bank', label: 'Rekening perusahaan', type: 'select', required: true, options: lk.banks.filter(x => x.active && x.kind !== 'marketplace').map(x => ({ value: x.id, label: `${x.bank_name} ${x.account_no}` })) },
          { name: 'proof', label: 'Bukti transfer', type: 'file', required: true }],
        onSubmit: async v => rpc('sup_invoice_pay', { p_id: inv.id, p_bank: v.bank, p_proof: await upl(v.proof, 'bayar-supplier') }) });
      toast('Pembayaran dicatat.'); changed(); refresh();
    });
  },
});

// ---------------------------------------------------------------------
route('purchase-returns', {
  title: 'Retur pembelian', perm: ['purchasing'],
  async render(el) {
    const lk = await lookups();
    const rows = await q(sb.from('purchase_returns').select('*, purchase_return_lines(*)').order('created_at', { ascending: false }).limit(200));
    el.innerHTML = pageHead('Retur pembelian', 'Barang cacat dari supplier dikembalikan, bukan dianggap rugi sendiri. Stok langsung berkurang saat retur dicatat.',
      can('purchasing', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Retur ke supplier</button>` : '') +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Supplier', f: r => esc(lk.sup[r.supplier_id]?.name) }, { l: 'Lokasi', f: r => esc(lk.loc[r.location_id]?.name) },
        { l: 'Barang', f: r => r.purchase_return_lines.map(l => `${esc(lk.prod[l.product_id]?.sku)} ${fmt.n(l.qty)}`).join('<br>') },
        { l: 'Alasan', f: r => esc(r.reason) }, { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.total) },
        { l: 'Dicatat', f: r => `${esc(uname(lk, r.created_by))}<br><span class="small muted">${fmt.date(r.created_at)}</span>` },
      ], rows, { empty: 'Belum ada retur pembelian' });
    $('#new', el)?.addEventListener('click', async () => {
      const le = lineEditor(lk, [], { cost: true, costOf: p => p.avg_cost, filter: p => p.category !== 'jasa' });
      const body = h(`<div class="stack"><div class="grid g2">
        <label class="f req"><span>Supplier</span><select data-sup>${lk.suppliers.filter(s => s.active).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
        <label class="f req"><span>Diambil dari lokasi</span><select data-loc>${locOpts(lk).map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></label></div>
        <label class="f req"><span>Alasan retur</span><input data-reason placeholder="Cacat, salah kirim, tidak sesuai spesifikasi"></label></div>`);
      body.appendChild(le.el);
      modal({ title: 'Retur ke supplier', body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Catat retur', kind: 'primary', onClick: async () => {
        const reason = $('[data-reason]', body).value.trim();
        if (reason.length < 5) throw new Error('Alasan retur wajib diisi.');
        await rpc('purchase_return_post', { p: { supplier_id: $('[data-sup]', body).value, location_id: $('[data-loc]', body).value, reason, lines: le.get() } });
        toast('Retur pembelian dicatat.'); changed(); refresh();
      } }] });
    });
  },
});
