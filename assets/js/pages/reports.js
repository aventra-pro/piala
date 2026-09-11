// Laporan manajemen — sepuluh laporan wajib
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, lookups, uname, plate, chip, go, toast, errMsg,
  fileBtn, bindFiles, tabs, on, $, ICON, downloadCSV, today, daysAgo, monthStart, sum, groupBy, emptyBox, CATEGORY } from '../core.js';

const REPORTS = [
  { k: 'penjualan', l: 'Penjualan & margin per channel' },
  { k: 'produk', l: 'Produk terlaris & paling untung' },
  { k: 'mati', l: 'Stok mati & lambat' },
  { k: 'shrinkage', l: 'Shrinkage per cabang' },
  { k: 'retur', l: 'Retur & rekonsiliasi' },
  { k: 'scrap', l: 'Scrap produksi per operator' },
  { k: 'kasir', l: 'Audit kasir: void & diskon' },
  { k: 'opname', l: 'Riwayat selisih opname' },
  { k: 'harga', l: 'Riwayat harga beli supplier' },
  { k: 'produktivitas', l: 'Produktivitas produksi' },
];

route('reports', {
  title: 'Laporan manajemen', perm: ['reports', 'dashboard'],
  async render(el, params) {
    const lk = await lookups();
    const k = params.r || 'penjualan';
    const from = params.from || daysAgo(29), to = params.to || today();
    el.innerHTML = pageHead('Laporan manajemen', 'Sepuluh laporan yang dipakai untuk memutuskan, bukan sekadar melihat angka.') +
      `<form class="filters" id="flt"><select name="r">${REPORTS.map(r => `<option value="${r.k}" ${r.k === k ? 'selected' : ''}>${esc(r.l)}</option>`).join('')}</select>
        <input type="date" name="from" value="${from}"><input type="date" name="to" value="${to}"><button class="btn">Tampilkan</button>
        <button type="button" class="btn" id="csv">${ICON.dl} CSV</button></form>
      <section class="panel"><div class="ph"><h2>${esc(REPORTS.find(r => r.k === k)?.l)}</h2></div><div class="pb" id="out">Memuat…</div></section>`;
    $('#flt', el).onsubmit = (e) => { e.preventDefault(); go('reports', Object.fromEntries(new FormData(e.target))); };
    const out = $('#out', el);
    let csvRows = [], csvCols = [];
    try {
      const r = await RENDER[k](lk, from, to);
      out.innerHTML = (r.intro ? `<p class="small muted" style="margin-bottom:10px">${r.intro}</p>` : '') + table(r.cols, r.rows, { cards: false, empty: 'Tidak ada data pada periode ini', click: !!r.click });
      csvRows = r.rows; csvCols = r.cols.filter(c => c.k || c.csv);
      if (r.click) on(out, 'tbody tr[data-i]', 'click', (e, tr) => r.click(r.rows[+tr.dataset.i]));
      bindFiles(out);
    } catch (e) { out.innerHTML = `<p class="note danger">${esc(errMsg(e))}</p>`; }
    $('#csv', el).onclick = () => csvRows.length ? downloadCSV(`${k}-${from}-${to}`, csvRows, csvCols) : toast('Tidak ada data.', 'err');
  },
});

const RENDER = {
  async penjualan(lk, from, to) {
    const d = await rpc('rpt_channel', { p_branch: S.branch || null, p_from: from, p_to: to });
    return {
      intro: 'Channel dengan omzet besar belum tentu paling untung. Bandingkan margin setelah biaya admin, ongkir, dan retur.',
      rows: d,
      cols: [{ l: 'Channel', k: 'channel' }, { l: 'Pesanan', cls: 'num', k: 'orders' }, { l: 'Omzet', cls: 'num', k: 'omzet', f: r => fmt.rp(r.omzet), foot: rs => fmt.rp(sum(rs, 'omzet')) },
        { l: 'Diskon', cls: 'num', k: 'diskon', f: r => fmt.rp(r.diskon) }, { l: 'Biaya channel & ongkir', cls: 'num', k: 'biaya', f: r => fmt.rp(r.biaya) },
        { l: 'Retur', cls: 'num', k: 'retur', f: r => `${fmt.rp(r.retur)}<br><span class="small muted">${r.jumlah_retur}×</span>` },
        { l: 'HPP', cls: 'num', k: 'hpp', f: r => fmt.rp(r.hpp) }, { l: 'Laba', cls: 'num', k: 'laba', f: r => `<b>${fmt.rp(r.laba)}</b>`, foot: rs => fmt.rp(sum(rs, 'laba')) },
        { l: 'Margin', cls: 'num', k: 'margin_pct', f: r => fmt.pct(r.margin_pct) }],
    };
  },
  async produk(lk, from, to) {
    const lines = await q(sb.from('so_lines').select('product_id, qty, price, unit_cost, sales_orders!inner(recognized_at, status, branch_id)')
      .not('sales_orders.recognized_at', 'is', null).neq('sales_orders.status', 'void')
      .gte('sales_orders.recognized_at', from).lte('sales_orders.recognized_at', to + 'T23:59:59+07:00').limit(10000));
    const g = groupBy(lines.filter(l => !S.branch || l.sales_orders.branch_id === S.branch), l => l.product_id);
    const rows = [...g.entries()].map(([pid, ls]) => {
      const p = lk.prod[pid];
      const omzet = sum(ls, l => l.qty * l.price), hpp = sum(ls, l => l.qty * l.unit_cost);
      return { sku: p?.sku, name: p?.name, category: CATEGORY[p?.category], qty: sum(ls, 'qty'), orders: ls.length, omzet, hpp, laba: omzet - hpp, margin: omzet ? (omzet - hpp) / omzet * 100 : 0 };
    }).sort((a, b) => b.laba - a.laba);
    return {
      intro: 'Urut dari yang paling menyumbang laba. Produk laris dengan margin tipis kadang kalah penting dibanding produk sepi bermargin tebal.',
      rows,
      cols: [{ l: 'SKU', k: 'sku' }, { l: 'Nama', k: 'name' }, { l: 'Kategori', k: 'category' }, { l: 'Terjual', cls: 'num', k: 'qty', f: r => fmt.n(r.qty) },
        { l: 'Transaksi', cls: 'num', k: 'orders' }, { l: 'Omzet', cls: 'num', k: 'omzet', f: r => fmt.rp(r.omzet), foot: rs => fmt.rp(sum(rs, 'omzet')) },
        { l: 'HPP', cls: 'num', k: 'hpp', f: r => fmt.rp(r.hpp) }, { l: 'Laba', cls: 'num', k: 'laba', f: r => `<b>${fmt.rp(r.laba)}</b>`, foot: rs => fmt.rp(sum(rs, 'laba')) },
        { l: 'Margin', cls: 'num', k: 'margin', f: r => fmt.pct(r.margin.toFixed(1)) }],
    };
  },
  async mati(lk) {
    const rows = (await q(sb.from('v_slow_moving').select('*').order('days_idle', { ascending: false }).limit(500)))
      .filter(r => !S.branch || r.branch_id === S.branch).filter(r => r.days_idle >= 30);
    return {
      intro: 'Barang yang tidak bergerak 30 hari atau lebih. Uang toko berhenti di rak — pertimbangkan diskon, bundling, atau pindah cabang.',
      rows,
      cols: [{ l: 'SKU', k: 'sku' }, { l: 'Nama', k: 'name' }, { l: 'Lokasi', k: 'location_name' }, { l: 'Stok', cls: 'num', k: 'qty', f: r => fmt.n(r.qty) },
        { l: 'Nilai', cls: 'num', k: 'value', f: r => fmt.rp(r.value), foot: rs => fmt.rp(sum(rs, 'value')) },
        { l: 'Terakhir keluar', k: 'last_out', f: r => r.last_out ? fmt.date(r.last_out) : 'belum pernah' },
        { l: 'Diam', cls: 'num', k: 'days_idle', f: r => `${r.days_idle >= 9999 ? '—' : r.days_idle + ' hari'}` }],
      click: r => go('ledger', { p: r.product_id, loc: r.location_id }),
    };
  },
  async shrinkage(lk, from, to) {
    const d = await rpc('rpt_dashboard', { p_branch: S.branch || null, p_from: from, p_to: to });
    const rows = d.by_branch.map(b => ({ ...b, pct: b.stock_value > 0 ? Number(b.shrinkage) / Number(b.stock_value) * 100 : 0 }));
    return {
      intro: 'Nilai barang yang hilang tanpa penjualan, 30 hari terakhir. Di atas 1% dari nilai stok biasanya bukan kesalahan hitung biasa.',
      rows,
      cols: [{ l: 'Cabang', k: 'name' }, { l: 'Nilai stok', cls: 'num', k: 'stock_value', f: r => fmt.rp(r.stock_value) },
        { l: 'Shrinkage 30 hari', cls: 'num', k: 'shrinkage', f: r => fmt.rp(r.shrinkage) },
        { l: '% dari stok', cls: 'num', k: 'pct', f: r => `<b style="color:${r.pct > 1 ? 'var(--danger)' : 'inherit'}">${fmt.pct(r.pct.toFixed(2))}</b>` },
        { l: 'Omzet periode', cls: 'num', k: 'omzet', f: r => fmt.rp(r.omzet) }],
    };
  },
  async retur(lk) {
    const rows = (await q(sb.from('v_return_recon').select('*'))).filter(r => !S.branch || r.branch_id === S.branch);
    return {
      intro: 'Barang yang dijanjikan kembali versus yang benar-benar sampai. Selisihnya adalah uang yang hilang di perjalanan retur.',
      rows,
      cols: [{ l: 'Channel', k: 'channel_name' }, { l: 'Cabang', k: 'branch_id', f: r => esc(lk.br[r.branch_id]?.name) },
        { l: 'Retur', cls: 'num', k: 'returns' }, { l: 'Menunggu barang', cls: 'num', k: 'waiting' },
        { l: 'Qty dijanjikan', cls: 'num', k: 'qty_expected', f: r => fmt.n(r.qty_expected) }, { l: 'Qty diterima', cls: 'num', k: 'qty_received', f: r => fmt.n(r.qty_received) },
        { l: 'Nilai tidak kembali', cls: 'num', k: 'missing_value', f: r => `<b style="color:var(--danger)">${fmt.rp(r.missing_value)}</b>`, foot: rs => fmt.rp(sum(rs, 'missing_value')) },
        { l: 'Refund diberikan', cls: 'num', k: 'refund_total', f: r => fmt.rp(r.refund_total) }],
    };
  },
  async scrap(lk, from, to) {
    const rows = await q(sb.from('v_scrap').select('*').gte('created_at', from).lte('created_at', to + 'T23:59:59+07:00').order('created_at', { ascending: false }).limit(500));
    const filtered = rows.filter(r => !S.branch || r.branch_id === S.branch);
    const byOp = [...groupBy(filtered, r => r.operator_name || '—').entries()].map(([name, rs]) => ({ name, n: rs.length, value: sum(rs, 'value') })).sort((a, b) => b.value - a.value);
    return {
      intro: `Total ${fmt.rp(sum(filtered, 'value'))} dari ${filtered.length} kejadian. Per operator: ${byOp.map(o => `${o.name} ${fmt.rp(o.value)}`).join(' · ') || '—'}`,
      rows: filtered,
      cols: [{ l: 'Tanggal', k: 'created_at', f: r => fmt.date(r.created_at) }, { l: 'WO', k: 'wo_no', f: r => plate(r.wo_no) },
        { l: 'Bahan', k: 'sku' }, { l: 'Qty', cls: 'num', k: 'qty', f: r => fmt.n(r.qty) },
        { l: 'Penyebab', k: 'cause' }, { l: 'Operator', k: 'operator_name' },
        { l: 'Nilai', cls: 'num', k: 'value', f: r => fmt.rp(r.value), foot: rs => fmt.rp(sum(rs, 'value')) },
        { l: 'Foto', f: r => fileBtn(r.photo_path, 'Foto') }],
      click: r => go('production', { id: r.wo_id }),
    };
  },
  async kasir(lk, from, to) {
    const rows = (await q(sb.from('v_cashier_audit').select('*').gte('day', from).lte('day', to).order('day', { ascending: false }).limit(500)))
      .filter(r => !S.branch || r.branch_id === S.branch);
    return {
      intro: 'Void dan diskon per kasir per hari. Pola yang berulang di orang yang sama lebih penting daripada satu kejadian besar.',
      rows,
      cols: [{ l: 'Tanggal', k: 'day', f: r => fmt.date(r.day) }, { l: 'Cabang', k: 'branch_name' }, { l: 'Kasir', k: 'user_name' },
        { l: 'Transaksi', cls: 'num', k: 'transactions' }, { l: 'Void', cls: 'num', k: 'voids', f: r => r.voids > 0 ? `<b style="color:var(--danger)">${r.voids}</b>` : '0' },
        { l: 'Nilai penjualan', cls: 'num', k: 'sales_value', f: r => fmt.rp(r.sales_value) },
        { l: 'Nilai diskon', cls: 'num', k: 'discount_value', f: r => fmt.rp(r.discount_value) },
        { l: 'Rata diskon', cls: 'num', k: 'avg_discount_pct', f: r => fmt.pct(r.avg_discount_pct ?? 0) },
        { l: 'Minta approval', cls: 'num', k: 'discount_approvals' }],
    };
  },
  async opname(lk, from, to) {
    const rows = (await q(sb.from('v_opname_diff').select('*').gte('month', from.slice(0, 8) + '01').order('opname_id', { ascending: false }).limit(800)))
      .filter(r => !S.branch || r.branch_id === S.branch);
    return {
      intro: 'Selisih hasil opname beserta siapa yang menghitung dan siapa yang menyetujui. Barang yang selalu selisih layak dicek lebih dalam.',
      rows,
      cols: [{ l: 'Opname', k: 'no', f: r => plate(r.no) }, { l: 'Jenis', k: 'kind', f: r => r.kind === 'cycle' ? 'Cycle' : 'Penuh' },
        { l: 'Lokasi', k: 'location_name' }, { l: 'SKU', k: 'sku' }, { l: 'Nama', k: 'product_name' },
        { l: 'Sistem', cls: 'num', k: 'system_qty', f: r => fmt.n(r.system_qty) }, { l: 'Fisik', cls: 'num', k: 'counted_qty', f: r => fmt.n(r.counted_qty) },
        { l: 'Selisih', cls: 'num', k: 'diff_qty', f: r => `<b style="color:${r.diff_qty < 0 ? 'var(--danger)' : 'var(--ok)'}">${fmt.n(r.diff_qty)}</b>` },
        { l: 'Nilai', cls: 'num', k: 'diff_value', f: r => fmt.rp(r.diff_value), foot: rs => fmt.rp(sum(rs, 'diff_value')) },
        { l: 'Penghitung', k: 'counted_name' }, { l: 'Penyetuju', k: 'approved_name' }],
    };
  },
  async harga(lk, from, to) {
    const rows = await q(sb.from('v_price_history').select('*').gte('received_at', from).lte('received_at', to + 'T23:59:59+07:00').order('received_at', { ascending: false }).limit(800));
    const last = new Map();
    const withDelta = rows.map(r => {
      const key = r.product_id + '|' + r.supplier_id;
      const prev = last.get(key);
      last.set(key, Number(r.unit_cost));
      return { ...r, delta: prev ? (Number(r.unit_cost) - prev) / prev * 100 : null };
    });
    return {
      intro: 'Riwayat harga beli per supplier. Kenaikan diam-diam paling mudah terlihat di sini.',
      rows: withDelta,
      cols: [{ l: 'Tanggal', k: 'received_at', f: r => fmt.date(r.received_at) }, { l: 'GRN', k: 'grn_no', f: r => plate(r.grn_no) },
        { l: 'Supplier', k: 'supplier_name' }, { l: 'SKU', k: 'sku' }, { l: 'Nama', k: 'product_name' },
        { l: 'Qty', cls: 'num', k: 'qty', f: r => fmt.n(r.qty) },
        { l: 'Harga satuan', cls: 'num', k: 'unit_cost', f: r => fmt.rp(r.unit_cost) },
        { l: 'Perubahan', cls: 'num', k: 'delta', f: r => r.delta === null ? '—' : `<span style="color:${r.delta > 0 ? 'var(--danger)' : 'var(--ok)'}">${r.delta > 0 ? '+' : ''}${fmt.pct(r.delta.toFixed(1))}</span>` }],
    };
  },
  async produktivitas(lk, from, to) {
    const wos = await q(sb.from('v_wo_board').select('*').eq('status', 'done').gte('finished_at', from).lte('finished_at', to + 'T23:59:59+07:00').limit(1000));
    const f = wos.filter(w => !S.branch || w.branch_id === S.branch);
    const rows = [...groupBy(f, w => w.operator_name || 'Belum ditugaskan').entries()].map(([name, ws]) => {
      const durs = ws.filter(w => w.started_at && w.finished_at).map(w => (new Date(w.finished_at) - new Date(w.started_at)) / 3600e3);
      const late = ws.filter(w => w.target_date && w.finished_at && w.finished_at.slice(0, 10) > w.target_date).length;
      return { name, wo: ws.length, qty: sum(ws, 'qty'), jam: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null,
        scrap: sum(ws, 'scrap_cost'), late, ontime: ws.length ? (ws.length - late) / ws.length * 100 : 0 };
    }).sort((a, b) => b.qty - a.qty);
    return {
      intro: 'Dihitung dari waktu mulai sampai selesai tiap perintah kerja. Bandingkan kecepatan dengan nilai scrap — cepat tapi banyak rusak bukan produktif.',
      rows,
      cols: [{ l: 'Operator', k: 'name' }, { l: 'Perintah kerja', cls: 'num', k: 'wo' }, { l: 'Unit dihasilkan', cls: 'num', k: 'qty', f: r => fmt.n(r.qty) },
        { l: 'Rata waktu/WO', cls: 'num', k: 'jam', f: r => r.jam === null ? '—' : fmt.n(r.jam.toFixed(1)) + ' jam' },
        { l: 'Nilai scrap', cls: 'num', k: 'scrap', f: r => fmt.rp(r.scrap), foot: rs => fmt.rp(sum(rs, 'scrap')) },
        { l: 'Telat', cls: 'num', k: 'late' }, { l: 'Tepat waktu', cls: 'num', k: 'ontime', f: r => fmt.pct(r.ontime.toFixed(0)) }],
    };
  },
};
