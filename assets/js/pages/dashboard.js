// Beranda (dashboard eksekutif), kotak approval, peringatan
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go,
  fileBtn, bindFiles, today, daysAgo, monthStart, on, $, formModal, changed, emptyBox, spinner, refresh, METHOD } from '../core.js';

// ---------------------------------------------------------------------
//  Definisi item approval. Semua keputusan lewat RPC yang memeriksa
//  pemisahan tugas di database.
// ---------------------------------------------------------------------
const APPROVALS = [
  { key: 'po', perm: ['purchasing', 'a'], title: 'Purchase order di atas batas nilai', table: 'purchase_orders',
    sel: '*', filter: b => b.eq('status', 'pending_approval'),
    cols: (lk) => [{ l: 'PO', f: r => plate(r.no) }, { l: 'Supplier', f: r => esc(lk.sup[r.supplier_id]?.name) }, { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.total) }, { l: 'Dibuat', f: r => esc(uname(lk, r.created_by)) }],
    open: r => go('po', { id: r.id }),
    decide: (r, ok, note) => rpc('po_decide', { p_id: r.id, p_approve: ok, p_note: note }) },
  { key: 'sinv', perm: ['sup_invoice', 'a'], title: 'Faktur supplier tidak cocok (3-way match)', table: 'supplier_invoices',
    sel: '*', filter: b => b.eq('status', 'blocked'),
    cols: (lk) => [{ l: 'Faktur', f: r => plate(r.no) + ' ' + esc(r.invoice_no) }, { l: 'Supplier', f: r => esc(lk.sup[r.supplier_id]?.name) }, { l: 'Nilai faktur', cls: 'num', f: r => fmt.rp(r.amount) }, { l: 'Temuan', f: r => `<span class="small">${esc(r.match_note)}</span>` }, { l: 'Bukti', f: r => fileBtn(r.proof_path) }],
    decide: (r, ok, note) => rpc('sup_invoice_decide', { p_id: r.id, p_approve: ok, p_note: note }) },
  { key: 'adj', perm: ['adjustment', 'a'], title: 'Penyesuaian stok', table: 'stock_adjustments',
    sel: '*, adjustment_lines(product_id, qty, unit_cost)', filter: b => b.eq('status', 'pending'),
    cols: (lk) => [{ l: 'Dokumen', f: r => plate(r.no) }, { l: 'Lokasi', f: r => esc(lk.loc[r.location_id]?.name) },
      { l: 'Alasan', f: r => `<b>${esc(lk.adjReasons.find(x => x.code === r.reason_code)?.name)}</b><br><span class="small">${esc(r.note)}</span>` },
      { l: 'Barang', f: r => r.adjustment_lines.map(l => `${esc(lk.prod[l.product_id]?.sku)} ${l.qty > 0 ? '+' : ''}${fmt.n(l.qty)}`).join('<br>') },
      { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.total_value) }, { l: 'Pengaju', f: r => esc(uname(lk, r.requested_by)) }, { l: 'Foto', f: r => fileBtn(r.photo_path, 'Foto') }],
    decide: (r, ok, note) => rpc('adjustment_decide', { p_id: r.id, p_approve: ok, p_note: note }) },
  { key: 'opn', perm: ['opname', 'a'], title: 'Selisih stock opname', table: 'stock_opnames',
    sel: '*, opname_lines(product_id, system_qty, counted_qty, unit_cost)', filter: b => b.eq('status', 'submitted'),
    cols: (lk) => [{ l: 'Opname', f: r => plate(r.no) + ' ' + chip(r.kind === 'cycle' ? 'info' : '', r.kind === 'cycle' ? 'Cycle count' : 'Penuh') },
      { l: 'Lokasi', f: r => esc(lk.loc[r.location_id]?.name) },
      { l: 'Selisih', f: r => r.opname_lines.filter(l => Number(l.counted_qty) !== Number(l.system_qty)).slice(0, 6).map(l => `${esc(lk.prod[l.product_id]?.sku)}: ${fmt.n(l.system_qty)} → ${fmt.n(l.counted_qty)}`).join('<br>') || '<span class="muted">Tidak ada selisih</span>' },
      { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.diff_value) }, { l: 'Penghitung', f: r => esc(uname(lk, r.counted_by)) }],
    decide: (r, ok, note) => rpc('opname_decide', { p_id: r.id, p_approve: ok, p_note: note }) },
  { key: 'trf', perm: ['transfer', 'a'], title: 'Berita acara selisih transfer', table: 'stock_transfers',
    sel: '*, transfer_lines(product_id, qty_sent, qty_received)', filter: b => b.eq('status', 'received_diff'),
    cols: (lk) => [{ l: 'Transfer', f: r => plate(r.no) }, { l: 'Rute', f: r => `${esc(lk.loc[r.from_location_id]?.name)} → ${esc(lk.loc[r.to_location_id]?.name)}` },
      { l: 'Selisih', f: r => r.transfer_lines.filter(l => Number(l.qty_received) !== Number(l.qty_sent)).map(l => `${esc(lk.prod[l.product_id]?.sku)}: kirim ${fmt.n(l.qty_sent)}, terima ${fmt.n(l.qty_received)}`).join('<br>') },
      { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.diff_value) }, { l: 'Pengirim / penerima', f: r => `${esc(uname(lk, r.sent_by))} / ${esc(uname(lk, r.received_by))}` }],
    custom: async (r) => {
      const v = await formModal({ title: 'Selesaikan selisih ' + r.no, submitLabel: 'Tetapkan penanggung jawab',
        fields: [{ name: 'who', label: 'Penanggung jawab selisih', required: true, span: 2, hint: 'Nama orang/pihak, bukan sekadar "hilang".' }, { name: 'note', label: 'Tindak lanjut', type: 'textarea' }],
        onSubmit: v => rpc('transfer_resolve', { p_id: r.id, p_responsible: v.who, p_note: v.note }) });
      return v;
    } },
  { key: 'disc', perm: ['sales', 'a'], title: 'Diskon di atas batas jabatan', table: 'sales_orders',
    sel: '*', filter: b => b.eq('discount_status', 'pending'),
    cols: (lk) => [{ l: 'Transaksi', f: r => plate(r.no) }, { l: 'Pelanggan', f: r => esc(r.customer_name) }, { l: 'Harga daftar', cls: 'num', f: r => fmt.rp(r.gross_list) },
      { l: 'Setelah diskon', cls: 'num', f: r => fmt.rp(r.subtotal - r.discount_amount) }, { l: 'Diskon', cls: 'num', f: r => `<b>${fmt.pct(r.discount_pct)}</b>` }, { l: 'Kasir/admin', f: r => esc(uname(lk, r.created_by)) }],
    decide: (r, ok, note) => rpc('so_approve', { p_id: r.id, p_kind: 'discount', p_approve: ok, p_note: note }) },
  { key: 'credit', perm: ['sales', 'a'], title: 'Pesanan melewati limit kredit / ada tagihan macet', table: 'sales_orders',
    sel: '*', filter: b => b.eq('credit_status', 'pending'),
    cols: (lk) => [{ l: 'Pesanan', f: r => plate(r.no) }, { l: 'Pelanggan', f: r => esc(r.customer_name) }, { l: 'Total', cls: 'num', f: r => fmt.rp(r.total) }, { l: 'Admin', f: r => esc(uname(lk, r.created_by)) }],
    open: r => go('sales', { id: r.id }),
    decide: (r, ok, note) => rpc('so_approve', { p_id: r.id, p_kind: 'credit', p_approve: ok, p_note: note }) },
  { key: 'void', perm: ['sales', 'a'], title: 'Permintaan void / batal transaksi', table: 'sales_orders',
    sel: '*', filter: b => b.eq('void_status', 'pending'),
    cols: (lk) => [{ l: 'Transaksi', f: r => plate(r.no) + ' ' + chip(r.status) }, { l: 'Total', cls: 'num', f: r => fmt.rp(r.total) },
      { l: 'Alasan', f: r => esc(r.void_reason) }, { l: 'Diminta', f: r => esc(uname(lk, r.void_requested_by)) }],
    open: r => go('sales', { id: r.id }),
    decide: (r, ok, note) => rpc('so_void_decide', { p_id: r.id, p_approve: ok, p_note: note }) },
  { key: 'cash', perm: ['cash', 'a'], title: 'Selisih kas cabang', table: 'cash_sessions',
    sel: '*', filter: b => b.in('status', ['closed', 'rejected']),
    cols: (lk) => [{ l: 'Sesi', f: r => plate(r.no) }, { l: 'Cabang', f: r => esc(lk.br[r.branch_id]?.name) }, { l: 'Seharusnya', cls: 'num', f: r => fmt.rp(r.expected_cash) },
      { l: 'Dihitung', cls: 'num', f: r => fmt.rp(r.counted_cash) }, { l: 'Selisih', cls: 'num', f: r => `<b>${fmt.rp(r.diff)}</b>` }, { l: 'Penjelasan', f: r => esc(r.diff_reason) }, { l: 'Kasir', f: r => esc(uname(lk, r.opened_by)) }],
    decide: (r, ok, note) => rpc('cash_decide', { p_id: r.id, p_approve: ok, p_note: note }) },
  { key: 'dep', perm: ['payments', 'a'], title: 'Setoran kas ke bank', table: 'cash_sessions',
    sel: '*', filter: b => b.eq('deposit_status', 'pending'),
    cols: (lk) => [{ l: 'Sesi', f: r => plate(r.no) }, { l: 'Cabang', f: r => esc(lk.br[r.branch_id]?.name) }, { l: 'Setoran', cls: 'num', f: r => fmt.rp(r.deposit_amount) },
      { l: 'Rekening', f: r => esc(lk.bank[r.deposit_bank_id]?.bank_name + ' ' + (lk.bank[r.deposit_bank_id]?.account_no || '')) }, { l: 'Bukti', f: r => fileBtn(r.deposit_proof_path) }],
    decide: (r, ok, note) => rpc('cash_deposit_verify', { p_id: r.id, p_approve: ok, p_note: note }), hint: 'Cocokkan dengan mutasi rekening sebelum menyetujui.' },
  { key: 'exp', perm: ['expenses', 'a'], title: 'Biaya operasional', table: 'expenses',
    sel: '*', filter: b => b.eq('status', 'pending'),
    cols: (lk) => [{ l: 'Biaya', f: r => plate(r.no) }, { l: 'Cabang', f: r => esc(lk.br[r.branch_id]?.name) }, { l: 'Kategori', f: r => esc(lk.expCats.find(c => c.code === r.category)?.name) },
      { l: 'Keterangan', f: r => esc(r.description) }, { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.amount) }, { l: 'Bukti', f: r => fileBtn(r.proof_path) }],
    decide: (r, ok, note) => rpc('expense_decide', { p_id: r.id, p_approve: ok, p_note: note }) },
  { key: 'pay', perm: ['payments', 'a'], title: 'Bukti pembayaran menunggu verifikasi', table: 'payments',
    sel: '*', filter: b => b.eq('status', 'pending'),
    cols: (lk) => [{ l: 'Pembayaran', f: r => plate(r.no) }, { l: 'Metode', f: r => METHOD[r.method] }, { l: 'Nominal', cls: 'num', f: r => fmt.rp(r.amount) }, { l: 'Diinput', f: r => esc(uname(lk, r.created_by)) }],
    open: () => go('payments'), linkOnly: 'Verifikasi di halaman pembayaran' },
  { key: 'qc', perm: ['production', 'a'], title: 'Hasil produksi menunggu QC', table: 'work_orders',
    sel: '*', filter: b => b.eq('status', 'qc'),
    cols: (lk) => [{ l: 'WO', f: r => plate(r.no) }, { l: 'Produk', f: r => esc(lk.prod[r.product_id]?.name) }, { l: 'Jumlah', cls: 'num', f: r => fmt.n(r.qty) }, { l: 'Operator', f: r => esc(uname(lk, r.assigned_to)) }],
    open: r => go('production', { id: r.id }), linkOnly: 'Periksa di papan produksi' },
  { key: 'ret', perm: ['returns', 'a'], title: 'Barang retur di karantina menunggu disposisi', table: 'sales_returns',
    sel: '*', filter: b => b.eq('status', 'received'),
    cols: (lk) => [{ l: 'Retur', f: r => plate(r.no) }, { l: 'Penyebab', f: r => esc(lk.retReasons.find(x => x.code === r.reason_code)?.name) }, { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.cost_value) }],
    open: r => go('returns', { id: r.id }), linkOnly: 'Tentukan disposisi di halaman retur' },
];

export async function countApprovals() {
  const defs = APPROVALS.filter(d => can(d.perm[0], d.perm[1]));
  const counts = await Promise.all(defs.map(d => d.filter(sb.from(d.table).select('id', { count: 'exact', head: true })).then(r => r.count || 0)));
  return counts.reduce((a, b) => a + b, 0);
}

route('approvals', {
  title: 'Approval', perm: () => APPROVALS.some(d => can(d.perm[0], d.perm[1])),
  async render(el) {
    const lk = await lookups();
    const defs = APPROVALS.filter(d => can(d.perm[0], d.perm[1]));
    const data = await Promise.all(defs.map(d => q(d.filter(sb.from(d.table).select(d.sel)).order('id').limit(200))));
    const total = data.reduce((a, r) => a + r.length, 0);
    el.innerHTML = pageHead('Approval', 'Semua yang menunggu keputusan Anda. Anda tidak bisa menyetujui transaksi yang Anda buat sendiri — sistem akan menolaknya.') +
      (total ? '' : emptyBox('Tidak ada yang menunggu approval', 'Bagus — semua sudah diputuskan.'));
    defs.forEach((d, i) => {
      const rows = data[i]; if (!rows.length) return;
      const cols = d.cols(lk);
      if (!d.linkOnly) cols.push({ l: '', f: () => `<div class="actions"><button class="btn sm primary" data-ok>Setujui</button><button class="btn sm danger" data-no>Tolak</button></div>` });
      else cols.push({ l: '', f: () => `<button class="btn sm" data-open>${esc(d.linkOnly)}</button>` });
      const p = document.createElement('section');
      p.className = 'panel';
      p.innerHTML = `<div class="ph"><h2>${esc(d.title)}</h2><span class="badge">${rows.length}</span></div><div class="pb">${d.hint ? `<p class="note warn small">${esc(d.hint)}</p>` : ''}${table(cols, rows, { click: !!d.open })}</div>`;
      el.appendChild(p);
      bindFiles(p);
      if (d.open) bindRows(p, rows, d.open);
      on(p, '[data-open]', 'click', (e, b) => d.open(rows[+b.closest('tr').dataset.i]));
      on(p, '[data-ok],[data-no]', 'click', async (e, b) => {
        const r = rows[+b.closest('tr').dataset.i];
        const ok = b.hasAttribute('data-ok');
        try {
          if (d.custom && ok) { if (!await d.custom(r)) return; }
          else {
            const note = await ask(ok ? 'Setujui' : 'Tolak', `${ok ? 'Setujui' : 'Tolak'} <b>${esc(r.no)}</b>? Keputusan dan catatan Anda tercatat di audit log.`,
              { okLabel: ok ? 'Setujui' : 'Tolak', danger: !ok, minLen: ok ? 3 : 5 });
            if (!note) return;
            await d.decide(r, ok, note.trim());
          }
          toast(ok ? 'Disetujui.' : 'Ditolak.'); changed(); refresh();
        } catch (err) { toast(errMsg(err), 'err'); }
      });
    });
  },
});

// ---------------------------------------------------------------------
route('alerts', {
  title: 'Peringatan',
  async render(el) {
    const a = await rpc('rpt_alerts', { p_branch: S.branch || null });
    el.innerHTML = pageHead('Peringatan', 'Dihitung ulang setiap kali halaman dibuka. Setiap selisih harus punya penanggung jawab.') +
      (a.length ? `<div class="stack">${a.map(x => `<a class="note ${x.level === 'danger' ? 'danger' : 'warn'}" style="display:block;text-decoration:none;color:inherit" href="${esc(x.link)}"><b>${esc(x.title)}</b><br><span class="small">${esc(x.detail)}</span></a>`).join('')}</div>`
        : emptyBox('Tidak ada peringatan', 'Stok, retur, kas, dan piutang dalam batas aman.'));
  },
});

// ---------------------------------------------------------------------
function periodOf(p) {
  switch (p) {
    case 'today': return [today(), today()];
    case '7': return [daysAgo(6), today()];
    case 'month': return [monthStart(), today()];
    default: return [daysAgo(29), today()];
  }
}

route('home', {
  title: 'Beranda',
  async render(el, params) {
    const lk = await lookups();
    const shortcuts = [['pos', 'Kasir', 'pos', 'c'], ['sales', 'Pesanan baru', 'sales', 'c'], ['production', 'Papan produksi', 'production', 'v'], ['designs', 'Desain & mockup', 'design', 'v'],
      ['delivery', 'Pengiriman', 'logistics', 'v'], ['returns', 'Retur', 'returns', 'v'], ['grn', 'Terima barang', 'grn', 'c'], ['transfers', 'Transfer stok', 'transfer', 'v'],
      ['opname', 'Stock opname', 'opname', 'v'], ['payments', 'Verifikasi bayar', 'payments', 'a'], ['cash', 'Kas cabang', 'cash', 'v'], ['stock', 'Cek stok', 'stock', 'v']]
      .filter(s => can(s[2], s[3]));
    const head = pageHead(`Halo, ${S.me.full_name || S.me.email}`, `${S.branch ? esc(lk.br[S.branch]?.name) : (S.me.is_global ? 'Semua cabang' : '')}`);
    const quick = shortcuts.length ? `<div class="metrics" style="margin-bottom:14px">${shortcuts.map(s => `<a class="metric link" href="#/${s[0]}" style="text-decoration:none;color:inherit"><div class="v" style="font-size:1rem">${esc(s[1])}</div></a>`).join('')}</div>` : '';
    if (!can('dashboard')) {
      const alerts = await rpc('rpt_alerts', { p_branch: S.branch || null });
      el.innerHTML = head + quick + `<section class="panel"><div class="ph"><h2>Peringatan</h2></div><div class="pb">${alerts.length ? alerts.slice(0, 8).map(a => `<p class="small"><b>${esc(a.title)}</b> — ${esc(a.detail)}</p>`).join('') : '<p class="muted">Tidak ada peringatan.</p>'}</div></section>`;
      return;
    }
    const per = params.p || '30';
    const [from, to] = periodOf(per);
    const [d, alerts] = await Promise.all([rpc('rpt_dashboard', { p_branch: S.branch || null, p_from: from, p_to: to }), rpc('rpt_alerts', { p_branch: S.branch || null })]);
    const w = d.waterfall;
    const max = Math.max(1, Math.abs(w.omzet_kotor));
    const wfRow = (label, v, kind, offset = 0) => {
      const width = Math.min(100, Math.abs(v) / max * 100);
      const left = kind === 'minus' ? Math.max(0, Math.min(100 - width, offset / max * 100 - width)) : 0;
      return `<div class="wf-row ${kind}"><span>${label}</span><div class="bar-track"><div class="bar" style="left:${left}%;width:${width}%"></div></div><span class="num">${kind === 'minus' ? '−' : ''}${fmt.rp(Math.abs(v))}</span></div>`;
    };
    let run = w.omzet_kotor;
    const minus = (label, v) => { const r = wfRow(label, v, 'minus', run); run -= v; return r; };
    const wf = [
      wfRow('Omzet kotor', w.omzet_kotor, 'total'), minus('Retur', w.retur), minus('Diskon', w.diskon), minus('Biaya channel', w.biaya_channel),
      wfRow('Omzet bersih', w.omzet_bersih, 'total'), minus('HPP', w.hpp), minus('Kerugian stok', w.kerugian_stok),
      wfRow('Laba kotor', w.laba_kotor, 'total'), minus('Biaya operasional', w.biaya_operasional), wfRow('Laba bersih', w.laba_bersih, 'total'),
    ].join('');
    const maxDay = Math.max(1, ...d.daily.map(x => Number(x.omzet)));
    const bars = d.daily.length ? `<svg viewBox="0 0 ${d.daily.length * 14} 80" preserveAspectRatio="none" style="width:100%;height:110px" role="img" aria-label="Omzet harian">${
      d.daily.map((x, i) => { const hgt = Number(x.omzet) / maxDay * 76; return `<rect x="${i * 14 + 2}" y="${80 - hgt}" width="10" height="${hgt}" fill="#b08a3e"><title>${fmt.date(x.d)}: ${fmt.rp(x.omzet)}</title></rect>`; }).join('')}</svg>` : '<p class="muted">Belum ada penjualan pada periode ini.</p>';
    const maxCh = Math.max(1, ...d.by_channel.map(x => Number(x.omzet)));
    el.innerHTML = head + `
      <div class="filters">${['today:Hari ini', '7:7 hari', '30:30 hari', 'month:Bulan ini'].map(x => { const [k, l] = x.split(':'); return `<a class="btn sm ${per === k ? 'primary' : ''}" href="#/home?p=${k}">${l}</a>`; }).join('')}</div>
      ${quick}
      <div class="metrics">
        <div class="metric"><div class="l">Omzet kotor</div><div class="v">${fmt.rp(w.omzet_kotor)}</div></div>
        <div class="metric"><div class="l">Laba bersih</div><div class="v">${fmt.rp(w.laba_bersih)}</div></div>
        <div class="metric"><div class="l">Nilai persediaan</div><div class="v">${fmt.rp(d.inventory_value)}</div></div>
        <div class="metric"><div class="l">Perputaran stok (30 hari)</div><div class="v">${fmt.n(d.turnover_30d)}×</div></div>
        <a class="metric link" href="#/receivables" style="text-decoration:none;color:inherit"><div class="l">Piutang berjalan</div><div class="v">${fmt.rp(d.counts.ar_outstanding)}</div></a>
        <a class="metric link" href="#/production" style="text-decoration:none;color:inherit"><div class="l">Pesanan di produksi</div><div class="v">${d.counts.in_production}</div></a>
        <a class="metric link" href="#/delivery" style="text-decoration:none;color:inherit"><div class="l">Siap dikirim</div><div class="v">${d.counts.ready_to_ship}</div></a>
        <a class="metric link" href="#/returns" style="text-decoration:none;color:inherit"><div class="l">Retur belum diterima</div><div class="v">${d.counts.returns_waiting}</div></a>
      </div>
      <div class="cols" style="margin-top:14px">
        <div class="stack">
          <section class="panel"><div class="ph"><h2>Dari omzet ke laba bersih</h2><span class="small muted">${fmt.date(from)} – ${fmt.date(to)}</span></div><div class="pb"><div class="wf">${wf}</div>
            <p class="small muted" style="margin-top:10px">Pendapatan diakui saat barang diserahkan. DP dan pesanan yang belum jadi belum dihitung sebagai omzet.</p></div></section>
          <section class="panel"><div class="ph"><h2>Omzet harian</h2></div><div class="pb">${bars}</div></section>
          <section class="panel"><div class="ph"><h2>Per channel</h2></div><div class="pb">${table([
            { l: 'Channel', k: 'name' }, { l: 'Pesanan', cls: 'num', k: 'orders' },
            { l: 'Omzet', cls: 'num', f: r => fmt.rp(r.omzet) }, { l: '', f: r => `<div class="hbar"><i style="width:${r.omzet / maxCh * 100}%"></i></div>` },
            { l: 'Bersih setelah biaya channel', cls: 'num', f: r => fmt.rp(r.bersih) }], d.by_channel, { empty: 'Belum ada penjualan' })}</div></section>
        </div>
        <div class="stack">
          <section class="panel"><div class="ph"><h2>Peringatan</h2><a class="btn sm" href="#/alerts">Semua (${alerts.length})</a></div><div class="pb">${
            alerts.length ? alerts.slice(0, 6).map(a => `<a class="note ${a.level === 'danger' ? 'danger' : 'warn'}" style="display:block;margin-bottom:6px;text-decoration:none;color:inherit" href="${esc(a.link)}"><b class="small">${esc(a.title)}</b><br><span class="small">${esc(a.detail)}</span></a>`).join('') : '<p class="muted">Tidak ada peringatan.</p>'}</div></section>
          <section class="panel"><div class="ph"><h2>Per cabang</h2></div><div class="pb">${table([
            { l: 'Cabang', k: 'name' }, { l: 'Omzet', cls: 'num', f: r => fmt.rp(r.omzet) },
            { l: 'Nilai stok', cls: 'num', f: r => fmt.rp(r.stock_value) },
            { l: 'Shrinkage 30 hr', cls: 'num', f: r => `${fmt.rp(r.shrinkage)}<br><span class="small muted">${r.stock_value > 0 ? fmt.pct((r.shrinkage / r.stock_value * 100).toFixed(2)) : '—'}</span>` }], d.by_branch)}</div></section>
        </div>
      </div>`;
  },
});
