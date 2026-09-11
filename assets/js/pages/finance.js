// Keuangan: verifikasi pembayaran, piutang, kas cabang, biaya, utang, rekonsiliasi bank, settlement, laporan keuangan
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go, refresh,
  modal, formModal, upl, fileBtn, bindFiles, needBranch, byBranch, tabs, on, $, $$, h, ICON, downloadCSV, parseCSV, changed, emptyBox,
  today, daysAgo, monthStart, sum, groupBy, METHOD, printHTML, setting, waLink } from '../core.js';

// ---------------------------------------------------------------------
route('payments', {
  title: 'Verifikasi pembayaran', perm: ['payments'],
  async render(el, params) {
    const lk = await lookups();
    const tab = params.t || 'pending';
    let b = sb.from('payments').select('*, sales_orders(no, customer_name, customer_phone, total, paid_verified)').order('created_at', { ascending: false }).limit(300);
    b = byBranch(b);
    if (tab !== 'all') b = b.eq('status', tab);
    const [rows, unmatched] = await Promise.all([q(b), can('payments', 'a') ? q(sb.from('bank_transactions').select('*').is('matched_payment_id', null).is('matched_note', null).gt('amount', 0).order('tx_date', { ascending: false }).limit(200)) : []]);
    el.innerHTML = pageHead('Verifikasi pembayaran', 'Pembayaran baru diakui setelah dicocokkan dengan mutasi rekening perusahaan. Orang yang menginput tidak boleh memverifikasi.') +
      tabs([{ k: 'pending', l: 'Menunggu verifikasi', n: rows.filter(r => r.status === 'pending').length || undefined }, { k: 'verified', l: 'Terverifikasi' }, { k: 'rejected', l: 'Ditolak' }, { k: 'all', l: 'Semua' }], tab) +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Pesanan', f: r => `<a href="#/sales?id=${r.so_id}">${esc(r.sales_orders?.no)}</a><br><span class="small muted">${esc(r.sales_orders?.customer_name)}</span>` },
        { l: 'Metode', f: r => METHOD[r.method] + (r.bank_account_id ? `<br><span class="small muted">${esc(lk.bank[r.bank_account_id]?.bank_name)} ${esc(lk.bank[r.bank_account_id]?.account_no)}</span>` : '') },
        { l: 'Nominal', cls: 'num', f: r => `<b>${fmt.rp(r.amount)}</b>` }, { l: 'Tanggal', f: r => fmt.date(r.pay_date) },
        { l: 'Diinput', f: r => `${esc(uname(lk, r.created_by))}<br><span class="small muted">${fmt.dt(r.created_at)}</span>` },
        { l: 'Status', f: r => chip(r.status) + (r.verify_note ? `<br><span class="small muted">${esc(r.verify_note)}</span>` : '') },
        { l: 'Bukti', f: r => fileBtn(r.proof_path) },
        { l: '', f: r => r.status === 'pending' && can('payments', 'a') ? '<div class="actions"><button class="btn sm primary" data-ok>Verifikasi</button><button class="btn sm danger" data-no>Tolak</button></div>' : '' },
      ], rows, { empty: 'Tidak ada pembayaran' });
    bindFiles(el);
    on(el, '[data-tab]', 'click', (e, b2) => go('payments', { t: b2.dataset.tab }));
    on(el, '[data-no]', 'click', async (e, b2) => {
      const p = rows[+b2.closest('tr').dataset.i];
      const n = await ask('Tolak pembayaran', `Tolak ${esc(p.no)} sebesar ${fmt.rp(p.amount)}? Gunakan ini jika bukti palsu, nominal beda, atau uang tidak masuk.`, { minLen: 5, label: 'Alasan penolakan', danger: true });
      if (!n) return;
      try { await rpc('payment_verify', { p_id: p.id, p_approve: false, p_note: n, p_bank_tx: null }); toast('Ditolak.'); changed(); refresh(); } catch (err) { toast(errMsg(err), 'err'); }
    });
    on(el, '[data-ok]', 'click', async (e, b2) => {
      const p = rows[+b2.closest('tr').dataset.i];
      const cands = unmatched.filter(t => Math.abs(Number(t.amount) - Number(p.amount)) < 0.5 && (!p.bank_account_id || t.bank_account_id === p.bank_account_id));
      const body = h(`<div class="stack">
        <p>Cocokkan ${plate(p.no)} sebesar <b>${fmt.rp(p.amount)}</b> dengan mutasi rekening.</p>
        ${p.proof_path ? `<div>${fileBtn(p.proof_path, 'Lihat bukti dari pelanggan')}</div>` : ''}
        ${p.method === 'cash' ? '<p class="note small">Pembayaran tunai masuk lewat sesi kas — cukup pastikan uangnya ada di laci.</p>' :
          (cands.length ? `<label class="f"><span>Mutasi bank yang cocok</span><select data-tx><option value="">— tanpa pencocokan otomatis —</option>${
            cands.map(t => `<option value="${t.id}">${fmt.date(t.tx_date)} · ${fmt.rp(t.amount)} · ${esc((t.description || '').slice(0, 60))}</option>`).join('')}</select></label>`
            : '<p class="note warn small">Tidak ada mutasi bank dengan nominal sama yang belum dicocokkan. Import mutasi dulu di menu Rekonsiliasi bank, atau verifikasi manual jika Anda sudah melihat uangnya masuk.</p>')}
        <label class="f"><span>Catatan verifikasi</span><input data-note placeholder="mis. cocok mutasi BCA 12/09 14:22"></label></div>`);
      bindFiles(body);
      modal({ title: 'Verifikasi pembayaran', body, actions: [{ label: 'Batal' }, { label: 'Verifikasi', kind: 'primary', onClick: async () => {
        await rpc('payment_verify', { p_id: p.id, p_approve: true, p_note: $('[data-note]', body).value, p_bank_tx: $('[data-tx]', body)?.value || null });
        toast('Pembayaran terverifikasi.'); changed(); refresh();
      } }] });
    });
  },
});

// ---------------------------------------------------------------------
route('receivables', {
  title: 'Piutang', perm: ['receivables'],
  async render(el, params) {
    const lk = await lookups();
    let b = sb.from('v_ar').select('*').order('days_overdue', { ascending: false }).limit(500);
    b = byBranch(b);
    if (params.bucket) b = b.eq('bucket', params.bucket);
    const rows = await q(b);
    const buckets = ['0-30', '31-60', '61-90', '>90'];
    const byB = groupBy(rows, r => r.bucket);
    el.innerHTML = pageHead('Piutang pelanggan', 'Umur piutang dihitung dari tanggal barang diserahkan. Tagihan lewat 90 hari menahan pesanan baru pelanggan yang sama.',
      `<button class="btn" id="csv">${ICON.dl} Unduh CSV</button>`) +
      `<div class="metrics" style="margin-bottom:14px">${buckets.map(k => `<a class="metric link" href="#/receivables?bucket=${encodeURIComponent(k)}" style="text-decoration:none;color:inherit">
        <div class="l">${k} hari</div><div class="v">${fmt.rp(sum(byB.get(k) || [], 'outstanding'))}</div><div class="small muted">${(byB.get(k) || []).length} faktur</div></a>`).join('')}
        <div class="metric"><div class="l">Total piutang</div><div class="v">${fmt.rp(sum(rows, 'outstanding'))}</div></div></div>` +
      (params.bucket ? `<p><a href="#/receivables">← Semua umur piutang</a></p>` : '') +
      table([
        { l: 'Faktur', f: r => plate(r.no) }, { l: 'Pelanggan', f: r => `${esc(r.customer_name)}<br><span class="small muted">${esc(r.customer_phone || '')}</span>` },
        { l: 'Channel', f: r => esc(r.channel_name) }, { l: 'Tanggal', f: r => fmt.date(r.invoice_date) },
        { l: 'Jatuh tempo', f: r => `${fmt.date(r.due_date)}${r.days_overdue > 0 ? `<br><span class="chip danger">telat ${r.days_overdue} hari</span>` : ''}` },
        { l: 'Total', cls: 'num', f: r => fmt.rp(r.total) }, { l: 'Dibayar', cls: 'num', f: r => fmt.rp(r.paid_verified) },
        { l: 'Sisa', cls: 'num', f: r => `<b>${fmt.rp(r.outstanding)}</b>`, foot: rs => fmt.rp(sum(rs, 'outstanding')) },
        { l: 'Sales', f: r => esc(r.sales_name || '—') },
        { l: '', f: r => `<div class="actions"><button class="btn sm" data-wa>${ICON.wa}</button></div>` },
      ], rows, { click: true, empty: 'Tidak ada piutang', rowCls: r => r.days_overdue > 30 ? 'bad' : r.days_overdue > 0 ? 'warn' : '' });
    bindRows(el, rows, r => go('sales', { id: r.id }));
    $('#csv', el).onclick = () => downloadCSV('piutang-' + today(), rows, [{ l: 'Faktur', k: 'no' }, { l: 'Pelanggan', k: 'customer_name' }, { l: 'HP', k: 'customer_phone' },
      { l: 'Tanggal', k: 'invoice_date' }, { l: 'Jatuh tempo', k: 'due_date' }, { l: 'Telat (hari)', k: 'days_overdue' }, { l: 'Sisa', k: 'outstanding' }]);
    on(el, '[data-wa]', 'click', (e, b2) => {
      e.stopPropagation();
      const r = rows[+b2.closest('tr').dataset.i];
      const banks = lk.banks.filter(x => x.active && x.kind !== 'marketplace').map(x => `${x.bank_name} ${x.account_no} a.n. ${x.account_name}`).join('\n');
      window.open(waLink(r.customer_phone, `Halo ${r.customer_name}, kami ingin mengingatkan tagihan ${r.no} sebesar ${fmt.rp(r.outstanding)}${r.days_overdue > 0 ? ` yang jatuh tempo ${fmt.date(r.due_date)}` : ''}.\n\nPembayaran hanya ke rekening resmi:\n${banks}\n\nTerima kasih.`), '_blank');
    });
  },
});

// ---------------------------------------------------------------------
route('cash', {
  title: 'Kas cabang', perm: ['cash'],
  async render(el, params) {
    const lk = await lookups();
    const tab = params.t || 'open';
    let b = sb.from('cash_sessions').select('*').order('opened_at', { ascending: false }).limit(200);
    b = byBranch(b);
    if (tab === 'open') b = b.eq('status', 'open');
    else if (tab === 'diff') b = b.in('status', ['closed', 'rejected']);
    else if (tab === 'deposit') b = b.in('deposit_status', ['none', 'pending', 'rejected']).neq('status', 'open');
    const rows = await q(b);
    const mine = rows.find(r => r.status === 'open' && r.opened_by === S.me.id);
    el.innerHTML = pageHead('Kas cabang', 'Uang di laci harus sama dengan catatan. Selisih apa pun wajib dijelaskan dan disetujui, lalu disetor ke bank dengan bukti.',
      mine ? `<button class="btn primary" id="close">Tutup kas saya</button>` : (can('cash', 'c') ? `<a class="btn" href="#/pos">Buka kas di kasir</a>` : '')) +
      tabs([{ k: 'open', l: 'Sedang buka' }, { k: 'diff', l: 'Ada selisih' }, { k: 'deposit', l: 'Setoran' }, { k: 'all', l: 'Semua' }], tab) +
      table([
        { l: 'Sesi', f: r => plate(r.no) }, { l: 'Cabang', f: r => esc(lk.br[r.branch_id]?.name) },
        { l: 'Kasir', f: r => `${esc(uname(lk, r.opened_by))}<br><span class="small muted">${fmt.dt(r.opened_at)}</span>` },
        { l: 'Modal awal', cls: 'num', f: r => fmt.rp(r.opening_cash) },
        { l: 'Seharusnya', cls: 'num', f: r => r.status === 'open' ? '—' : fmt.rp(r.expected_cash) },
        { l: 'Dihitung', cls: 'num', f: r => r.status === 'open' ? '—' : fmt.rp(r.counted_cash) },
        { l: 'Selisih', cls: 'num', f: r => r.status === 'open' ? '—' : (Number(r.diff) ? `<b style="color:var(--danger)">${fmt.rp(r.diff)}</b><br><span class="small muted">${esc(r.diff_reason || '')}</span>` : '—') },
        { l: 'Status', f: r => chip(r.status) },
        { l: 'Setoran', f: r => r.deposit_status === 'none' ? '<span class="muted">belum</span>' : `${chip(r.deposit_status)}<br><span class="small">${fmt.rp(r.deposit_amount)}</span>` },
        { l: '', f: r => `<div class="actions">${fileBtn(r.deposit_proof_path, 'Bukti setor')}${r.status !== 'open' && ['none', 'rejected'].includes(r.deposit_status) && can('cash', 'c') ? '<button class="btn sm primary" data-dep>Catat setoran</button>' : ''}</div>` },
      ], rows, { empty: 'Tidak ada sesi kas' });
    bindFiles(el);
    on(el, '[data-tab]', 'click', (e, b2) => go('cash', { t: b2.dataset.tab }));
    $('#close', el)?.addEventListener('click', async () => {
      const exp = await rpc('cash_expected', { p_id: mine.id });
      await formModal({ title: 'Tutup kas ' + mine.no,
        intro: `<p class="note warn small">Hitung fisik uang di laci <b>sebelum</b> melihat angka sistem. Isi apa adanya — selisih yang jujur jauh lebih baik daripada angka yang dicocokkan.</p>`,
        fields: [{ name: 'counted', label: 'Uang fisik di laci (Rp)', type: 'number', required: true },
          { name: 'reason', label: 'Penjelasan jika ada selisih', type: 'textarea', hint: 'Wajib diisi minimal 10 karakter kalau ada selisih.' }],
        onSubmit: async v => {
          const st = await rpc('cash_close', { p_id: mine.id, p_counted: v.counted, p_reason: v.reason });
          toast(st === 'approved' ? 'Kas ditutup, tidak ada selisih.' : `Selisih ${fmt.rp(v.counted - exp)} — menunggu approval atasan.`);
        } });
      changed(); refresh();
    });
    on(el, '[data-dep]', 'click', async (e, b2) => {
      const c = rows[+b2.closest('tr').dataset.i];
      await formModal({ title: 'Catat setoran kas ' + c.no, intro: '<p class="small muted">Setor uang tunai ke rekening perusahaan, lalu unggah bukti setor. Keuangan akan mencocokkan dengan mutasi bank.</p>',
        fields: [{ name: 'amount', label: 'Nominal disetor (Rp)', type: 'number', required: true, value: Math.round(Number(c.counted_cash || 0)) },
          { name: 'bank', label: 'Rekening tujuan', type: 'select', required: true, options: lk.banks.filter(x => x.active && x.kind !== 'marketplace').map(x => ({ value: x.id, label: `${x.bank_name} ${x.account_no}` })) },
          { name: 'proof', label: 'Bukti setor / struk ATM', type: 'photo', required: true }],
        onSubmit: async v => rpc('cash_deposit', { p_id: c.id, p_amount: v.amount, p_bank: v.bank, p_proof: await upl(v.proof, 'setoran') }) });
      toast('Setoran dicatat, menunggu verifikasi.'); changed(); refresh();
    });
  },
});

// ---------------------------------------------------------------------
route('expenses', {
  title: 'Biaya operasional', perm: ['expenses'],
  async render(el, params) {
    const lk = await lookups();
    const tab = params.t || 'all';
    let b = sb.from('expenses').select('*').order('exp_date', { ascending: false }).limit(300);
    b = byBranch(b);
    if (tab !== 'all') b = b.eq('status', tab);
    const rows = await q(b);
    const month = rows.filter(r => r.status === 'approved' && r.exp_date >= monthStart());
    el.innerHTML = pageHead('Biaya operasional', 'Setiap pengeluaran butuh nota dan approval. Biaya tunai otomatis mengurangi kas laci sehingga ketahuan saat tutup kas.',
      can('expenses', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Catat biaya</button>` : '') +
      `<div class="metrics" style="margin-bottom:14px"><div class="metric"><div class="l">Disetujui bulan ini</div><div class="v">${fmt.rp(sum(month, 'amount'))}</div></div>
        <div class="metric"><div class="l">Menunggu approval</div><div class="v">${fmt.rp(sum(rows.filter(r => r.status === 'pending'), 'amount'))}</div></div></div>` +
      tabs([{ k: 'all', l: 'Semua' }, { k: 'pending', l: 'Menunggu' }, { k: 'approved', l: 'Disetujui' }, { k: 'rejected', l: 'Ditolak' }], tab) +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Tanggal', f: r => fmt.date(r.exp_date) }, { l: 'Cabang', f: r => esc(lk.br[r.branch_id]?.name) },
        { l: 'Kategori', f: r => esc(lk.expCats.find(c => c.code === r.category)?.name) }, { l: 'Keterangan', f: r => esc(r.description) },
        { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.amount), foot: rs => fmt.rp(sum(rs, 'amount')) },
        { l: 'Sumber dana', f: r => r.pay_method === 'cash' ? 'Kas laci' : esc(lk.bank[r.bank_account_id]?.bank_name || 'Bank') },
        { l: 'Status', f: r => chip(r.status) + (r.decide_note ? `<br><span class="small muted">${esc(r.decide_note)}</span>` : '') },
        { l: 'Nota', f: r => fileBtn(r.proof_path, 'Nota') },
      ], rows, { empty: 'Belum ada biaya' });
    bindFiles(el);
    on(el, '[data-tab]', 'click', (e, b2) => go('expenses', { t: b2.dataset.tab }));
    $('#new', el)?.addEventListener('click', async () => {
      const br = await needBranch(); if (!br) return;
      await formModal({ title: 'Catat biaya operasional',
        fields: [{ name: 'exp_date', label: 'Tanggal', type: 'date', required: true, value: today() },
          { name: 'category', label: 'Kategori', type: 'select', required: true, options: lk.expCats.map(c => ({ value: c.code, label: c.name })) },
          { name: 'amount', label: 'Nominal (Rp)', type: 'number', required: true },
          { name: 'pay_method', label: 'Sumber dana', type: 'select', required: true, options: [{ value: 'cash', label: 'Kas laci (sesi kas terbuka)' }, { value: 'bank', label: 'Transfer bank' }] },
          { name: 'bank_account_id', label: 'Rekening (jika transfer)', type: 'select', options: lk.banks.filter(x => x.active && x.kind !== 'marketplace').map(x => ({ value: x.id, label: `${x.bank_name} ${x.account_no}` })) },
          { name: 'description', label: 'Keterangan', type: 'textarea', required: true, hint: 'Jelaskan untuk apa. Kategori "lainnya" wajib keterangan minimal 10 karakter.' },
          { name: 'proof', label: 'Foto nota', type: 'photo', required: true }],
        onSubmit: async v => rpc('expense_create', { p: { ...v, branch_id: br, proof_path: await upl(v.proof, 'nota-biaya') } }) });
      toast('Biaya diajukan.'); changed(); refresh();
    });
  },
});

// ---------------------------------------------------------------------
route('payables', {
  title: 'Utang supplier', perm: ['payables'],
  async render(el) {
    const lk = await lookups();
    const rows = await q(sb.from('supplier_invoices').select('*, purchase_orders(no)').in('status', ['matched', 'approved', 'blocked']).order('due_date', { nullsFirst: false }).limit(300));
    const overdue = rows.filter(r => r.due_date && r.due_date < today());
    el.innerHTML = pageHead('Utang supplier', 'Faktur yang belum dibayar, diurutkan dari yang paling dekat jatuh tempo.') +
      `<div class="metrics" style="margin-bottom:14px"><div class="metric"><div class="l">Total utang</div><div class="v">${fmt.rp(sum(rows, 'amount'))}</div></div>
        <div class="metric"><div class="l">Lewat jatuh tempo</div><div class="v">${fmt.rp(sum(overdue, 'amount'))}</div><div class="small muted">${overdue.length} faktur</div></div>
        <div class="metric"><div class="l">Diblokir (tidak cocok)</div><div class="v">${fmt.rp(sum(rows.filter(r => r.status === 'blocked'), 'amount'))}</div></div></div>` +
      table([
        { l: 'Faktur', f: r => `${plate(r.no)}<br><span class="small">${esc(r.invoice_no)}</span>` }, { l: 'Supplier', f: r => esc(lk.sup[r.supplier_id]?.name) },
        { l: 'PO', f: r => esc(r.purchase_orders?.no) }, { l: 'Tanggal', f: r => fmt.date(r.invoice_date) },
        { l: 'Jatuh tempo', f: r => `${fmt.date(r.due_date)}${r.due_date && r.due_date < today() ? ' <span class="chip danger">lewat</span>' : ''}` },
        { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.amount), foot: rs => fmt.rp(sum(rs, 'amount')) }, { l: 'Status', f: r => chip(r.status) },
      ], rows, { click: true, empty: 'Tidak ada utang berjalan' });
    bindRows(el, rows, r => go('sup-invoices', { t: 'open' }));
  },
});

// ---------------------------------------------------------------------
route('bank', {
  title: 'Rekonsiliasi bank', perm: ['bank_recon'],
  async render(el, params) {
    const lk = await lookups();
    const tab = params.t || 'unmatched';
    let b = sb.from('bank_transactions').select('*, payments(no, so_id, amount)').order('tx_date', { ascending: false }).limit(400);
    if (params.acc) b = b.eq('bank_account_id', params.acc);
    if (tab === 'unmatched') b = b.is('matched_payment_id', null).is('matched_note', null);
    const rows = await q(b);
    el.innerHTML = pageHead('Rekonsiliasi bank', 'Import mutasi rekening, lalu cocokkan dengan pembayaran. Mutasi yang tidak punya pasangan adalah tempat kebocoran biasanya terlihat.',
      can('bank_recon', 'c') ? `<button class="btn primary" id="imp">Import mutasi CSV</button>` : '') +
      `<div class="filters"><select id="acc"><option value="">Semua rekening</option>${lk.banks.map(x => `<option value="${x.id}" ${params.acc === x.id ? 'selected' : ''}>${esc(x.bank_name)} ${esc(x.account_no)}</option>`).join('')}</select></div>` +
      tabs([{ k: 'unmatched', l: 'Belum cocok', n: rows.filter(r => !r.matched_payment_id && !r.matched_note).length || undefined }, { k: 'all', l: 'Semua mutasi' }], tab) +
      table([
        { l: 'Tanggal', f: r => fmt.date(r.tx_date) }, { l: 'Rekening', f: r => esc(lk.bank[r.bank_account_id]?.bank_name) },
        { l: 'Keterangan', f: r => `<span class="small">${esc(r.description)}</span>` }, { l: 'Ref', f: r => esc(r.ref || '') },
        { l: 'Masuk', cls: 'num', f: r => Number(r.amount) > 0 ? fmt.rp(r.amount) : '' }, { l: 'Keluar', cls: 'num', f: r => Number(r.amount) < 0 ? fmt.rp(-r.amount) : '' },
        { l: 'Dicocokkan dengan', f: r => r.matched_payment_id ? `${esc(r.payments?.no)}<br><span class="small muted">${esc(uname(lk, r.matched_by))}</span>` : (r.matched_note ? `<span class="small">${esc(r.matched_note)}</span>` : '<span class="chip warn">belum</span>') },
        { l: '', f: r => !r.matched_payment_id && !r.matched_note && can('bank_recon', 'e') ? '<button class="btn sm" data-m>Cocokkan</button>' : '' },
      ], rows, { empty: 'Tidak ada mutasi' });
    $('#acc', el).onchange = (e) => go('bank', { t: tab, ...(e.target.value ? { acc: e.target.value } : {}) });
    on(el, '[data-tab]', 'click', (e, b2) => go('bank', { t: b2.dataset.tab, ...(params.acc ? { acc: params.acc } : {}) }));
    $('#imp', el)?.addEventListener('click', () => {
      const body = h(`<div class="stack"><div class="grid g2">
        <label class="f req"><span>Rekening</span><select data-acc>${lk.banks.map(x => `<option value="${x.id}">${esc(x.bank_name)} ${esc(x.account_no)}</option>`).join('')}</select></label>
        <label class="f req"><span>File CSV mutasi</span><input type="file" accept=".csv" data-f></label></div>
        <div data-map></div><p class="small muted">Unduh mutasi dari internet banking dalam format CSV. Pastikan ada kolom tanggal, keterangan, dan nominal (kredit positif, debit negatif).</p></div>`);
      let parsed = null;
      $('[data-f]', body).onchange = async (e) => {
        parsed = parseCSV(await e.target.files[0].text());
        const g = (...k) => parsed.head.find(h2 => k.some(x => h2.toLowerCase().includes(x))) || '';
        $('[data-map]', body).innerHTML = `<p class="small">${parsed.rows.length} baris terbaca.</p><div class="grid g4">${
          [['date', 'Tanggal', g('tanggal', 'date')], ['description', 'Keterangan', g('keterangan', 'description', 'uraian')], ['amount', 'Nominal', g('nominal', 'amount', 'jumlah', 'kredit')], ['ref', 'Referensi', g('ref')]]
            .map(([k, l, sel]) => `<label class="f"><span>${l}</span><select data-k="${k}"><option value="">—</option>${parsed.head.map(h2 => `<option ${h2 === sel ? 'selected' : ''}>${esc(h2)}</option>`).join('')}</select></label>`).join('')}</div>`;
      };
      modal({ title: 'Import mutasi bank', body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Import', kind: 'primary', onClick: async () => {
        if (!parsed) throw new Error('Pilih file CSV dulu.');
        const map = Object.fromEntries($$('[data-k]', body).map(s => [s.dataset.k, s.value]));
        if (!map.date || !map.amount) throw new Error('Kolom tanggal dan nominal wajib dicocokkan.');
        const num = (v) => Number(String(v || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;
        const dt = (v) => { const s = String(v).trim(); const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/); return m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s.slice(0, 10); };
        const rws = parsed.rows.map(r => ({ date: dt(r[map.date]), description: map.description ? r[map.description] : '', amount: num(r[map.amount]), ref: map.ref ? r[map.ref] : null })).filter(r => r.amount && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
        const res = await rpc('bank_import', { p_bank: $('[data-acc]', body).value, p_rows: rws });
        toast(`${res.inserted} mutasi diimport dari ${res.total} baris.`); refresh();
      } }] });
    });
    on(el, '[data-m]', 'click', async (e, b2) => {
      const t = rows[+b2.closest('tr').dataset.i];
      const cands = await q(sb.from('payments').select('*, sales_orders(no, customer_name)').eq('status', 'verified').is('bank_tx_id', null).eq('amount', Math.abs(t.amount)).limit(20));
      await formModal({ title: 'Cocokkan mutasi', intro: `<p>${fmt.date(t.tx_date)} · <b>${fmt.rp(t.amount)}</b><br><span class="small muted">${esc(t.description)}</span></p>`,
        fields: [{ name: 'pay', label: 'Pembayaran terkait', type: 'select', options: cands.map(c => ({ value: c.id, label: `${c.no} · ${c.sales_orders?.no} · ${c.sales_orders?.customer_name}` })), hint: cands.length ? '' : 'Tidak ada pembayaran dengan nominal sama.' },
          { name: 'note', label: 'Atau jelaskan mutasi ini', type: 'textarea', hint: 'Contoh: setoran kas cabang, pencairan Shopee, bayar supplier, biaya admin bank.' }],
        onSubmit: v => rpc('bank_match', { p_tx: t.id, p_payment: v.pay || null, p_note: v.note }) });
      toast('Mutasi dicocokkan.'); refresh();
    });
  },
});

// ---------------------------------------------------------------------
route('settlement', {
  title: 'Settlement marketplace', perm: ['settlement'],
  async render(el) {
    const lk = await lookups();
    const mps = lk.channels.filter(c => c.kind === 'marketplace' && c.active);
    const rows = await q(sb.from('channel_settlements').select('*').order('created_at', { ascending: false }).limit(100));
    el.innerHTML = pageHead('Settlement marketplace', 'Cocokkan uang yang benar-benar cair dari marketplace dengan pesanan yang sudah dikirim. Selisih wajib dijelaskan — di sinilah potongan tersembunyi ketahuan.',
      can('settlement', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Catat pencairan</button>` : '') +
      table([
        { l: 'No', f: r => plate(r.no) }, { l: 'Channel', f: r => esc(lk.ch[r.channel_id]?.name) },
        { l: 'Periode', f: r => `${fmt.date(r.period_from)} – ${fmt.date(r.period_to)}` }, { l: 'Pesanan', cls: 'num', k: 'orders_count' },
        { l: 'Omzet kotor', cls: 'num', f: r => fmt.rp(r.gross) }, { l: 'Biaya & voucher', cls: 'num', f: r => fmt.rp(Number(r.fees) + Number(r.vouchers)) },
        { l: 'Seharusnya cair', cls: 'num', f: r => fmt.rp(r.expected_net) }, { l: 'Diterima', cls: 'num', f: r => fmt.rp(r.received_amount) },
        { l: 'Selisih', cls: 'num', f: r => Number(r.diff) ? `<b style="color:var(--danger)">${fmt.rp(r.diff)}</b><br><span class="small muted">${esc(r.note || '')}</span>` : '—' },
        { l: 'Bukti', f: r => fileBtn(r.proof_path) },
      ], rows, { empty: 'Belum ada pencairan dicatat' });
    bindFiles(el);
    $('#new', el)?.addEventListener('click', () => {
      const body = h(`<div class="stack"><div class="grid g3">
        <label class="f req"><span>Marketplace</span><select data-ch>${mps.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="f req"><span>Periode dari</span><input type="date" data-from value="${daysAgo(14)}"></label>
        <label class="f req"><span>Sampai</span><input type="date" data-to value="${today()}"></label></div>
        <button type="button" class="btn" data-prev>Hitung yang seharusnya cair</button>
        <div data-res></div>
        <div class="grid g2"><label class="f req"><span>Uang yang benar-benar diterima (Rp)</span><input type="number" data-amt></label>
        <label class="f req"><span>Rekening penerima</span><select data-bank>${lk.banks.filter(x => x.active && x.kind !== 'marketplace').map(x => `<option value="${x.id}">${esc(x.bank_name)} ${esc(x.account_no)}</option>`).join('')}</select></label></div>
        <label class="f"><span>Bukti pencairan</span><div class="photo-in"><input type="file" accept="image/*,application/pdf" data-proof></div></label>
        <label class="f"><span>Catatan (wajib jika ada selisih)</span><textarea data-note></textarea></label></div>`);
      on(body, '[data-prev]', 'click', async () => {
        try {
          const p = await rpc('settlement_preview', { p_channel: $('[data-ch]', body).value, p_from: $('[data-from]', body).value, p_to: $('[data-to]', body).value });
          $('[data-res]', body).innerHTML = `<div class="note"><b>${p.orders}</b> pesanan · omzet ${fmt.rp(p.gross)} · biaya ${fmt.rp(p.fees)} · voucher ${fmt.rp(p.vouchers)} · retur ${fmt.rp(p.refunds)}<br><b>Seharusnya cair ${fmt.rp(p.expected_net)}</b></div>`;
          if (!$('[data-amt]', body).value) $('[data-amt]', body).value = Math.round(Number(p.expected_net));
        } catch (err) { toast(errMsg(err), 'err'); }
      });
      modal({ title: 'Catat pencairan marketplace', body, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', onClick: async () => {
        const f = $('[data-proof]', body).files[0];
        await rpc('settlement_record', { p: { channel_id: $('[data-ch]', body).value, date_from: $('[data-from]', body).value, date_to: $('[data-to]', body).value,
          received_amount: Number($('[data-amt]', body).value), bank_account_id: $('[data-bank]', body).value, proof_path: f ? await upl(f, 'settlement') : null, note: $('[data-note]', body).value } });
        toast('Pencairan dicatat dan pesanan terkait dilunasi.'); changed(); refresh();
      } }] });
    });
  },
});

// ---------------------------------------------------------------------
route('accounting', {
  title: 'Laporan keuangan', perm: ['accounting'],
  async render(el, params) {
    const from = params.from || monthStart(), to = params.to || today();
    const tab = params.t || 'pl';
    const [pl, bal, cf] = await Promise.all([
      rpc('rpt_pl', { p_branch: S.branch || null, p_from: from, p_to: to }),
      rpc('rpt_balance', { p_branch: S.branch || null, p_asof: to }),
      rpc('rpt_cashflow', { p_branch: S.branch || null, p_from: from, p_to: to }),
    ]);
    const g = (kinds) => pl.filter(r => kinds.includes(r.kind) && Number(r.amount) !== 0);
    const rev = sum(g(['revenue']), 'amount') - sum(g(['contra_revenue']), 'amount');
    const cogs = sum(g(['cogs']), 'amount'), opex = sum(g(['expense']), 'amount');
    el.innerHTML = pageHead('Laporan keuangan', 'Dihasilkan otomatis dari jurnal yang dibuat setiap transaksi. Tidak ada entri manual, sehingga angka tidak bisa dikarang.') +
      `<form class="filters" id="flt"><input type="date" name="from" value="${from}"><input type="date" name="to" value="${to}"><input type="hidden" name="t" value="${tab}"><button class="btn">Terapkan</button></form>` +
      tabs([{ k: 'pl', l: 'Laba rugi' }, { k: 'bs', l: 'Neraca' }, { k: 'cf', l: 'Arus kas' }], tab) +
      (tab === 'pl' ? `<section class="panel"><div class="pb">${table([{ l: 'Akun', f: r => `${esc(r.code)} ${esc(r.name)}` }, { l: 'Jumlah', cls: 'num', f: r => fmt.rp(r.amount) }],
        [...g(['revenue']), ...g(['contra_revenue']).map(r => ({ ...r, amount: -r.amount })), { code: '', name: '— Pendapatan bersih —', amount: rev },
         ...g(['cogs']).map(r => ({ ...r, amount: -r.amount })), { code: '', name: '— Laba kotor —', amount: rev - cogs },
         ...g(['expense']).map(r => ({ ...r, amount: -r.amount })), { code: '', name: '— Laba bersih —', amount: rev - cogs - opex }], { cards: false })}</div></section>`
      : tab === 'bs' ? `<div class="cols"><section class="panel"><div class="ph"><h2>Aset</h2></div><div class="pb">${table([{ l: 'Akun', f: r => `${esc(r.code)} ${esc(r.name)}` }, { l: 'Saldo', cls: 'num', f: r => fmt.rp(r.balance), foot: rs => fmt.rp(sum(rs, 'balance')) }], bal.filter(r => r.kind === 'asset' && Number(r.balance) !== 0), { cards: false })}</div></section>
        <section class="panel"><div class="ph"><h2>Kewajiban & modal</h2></div><div class="pb">${table([{ l: 'Akun', f: r => `${esc(r.code)} ${esc(r.name)}` }, { l: 'Saldo', cls: 'num', f: r => fmt.rp(r.balance), foot: rs => fmt.rp(sum(rs, 'balance')) }], bal.filter(r => r.kind !== 'asset' && Number(r.balance) !== 0), { cards: false })}</div></section></div>`
      : `<section class="panel"><div class="pb">${table([{ l: 'Sumber', k: 'source' }, { l: 'Uang masuk', cls: 'num', f: r => fmt.rp(r.cash_in), foot: rs => fmt.rp(sum(rs, 'cash_in')) },
          { l: 'Uang keluar', cls: 'num', f: r => fmt.rp(r.cash_out), foot: rs => fmt.rp(sum(rs, 'cash_out')) },
          { l: 'Bersih', cls: 'num', f: r => fmt.rp(Number(r.cash_in) - Number(r.cash_out)) }], cf, { cards: false, empty: 'Belum ada arus kas' })}</div></section>`);
    $('#flt', el).onsubmit = (e) => { e.preventDefault(); go('accounting', Object.fromEntries(new FormData(e.target))); };
    on(el, '[data-tab]', 'click', (e, b2) => go('accounting', { from, to, t: b2.dataset.tab }));
  },
});
