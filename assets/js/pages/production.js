// Produksi: papan kanban perintah kerja, desain, sisa bahan akrilik
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go, refresh,
  modal, formModal, upl, fileBtn, bindFiles, lineEditor, byLocBranch, needBranch, on, $, h, ICON, CATEGORY, changed, emptyBox, today } from '../core.js';

const COLS = [
  ['waiting_design', 'Menunggu desain'], ['waiting_approval', 'Menunggu ACC pelanggan'], ['ready', 'Siap dikerjakan'],
  ['in_progress', 'Dikerjakan'], ['qc', 'QC'], ['done', 'Selesai (7 hari)'],
];
const CAUSE = { salah_grafir: 'Salah grafir', plat_rusak: 'Plat rusak', akrilik_pecah: 'Akrilik pecah', potongan_meleset: 'Potongan meleset', salah_rakit: 'Salah rakit', bahan_cacat: 'Bahan cacat dari supplier', lainnya: 'Lainnya' };

async function producers(lk) {
  const ur = await q(sb.from('user_roles').select('user_id, role').in('role', ['operator', 'production_head', 'designer']));
  const ids = [...new Set(ur.map(x => x.user_id))];
  return ids.map(id => ({ value: id, label: `${uname(lk, id)} (${ur.filter(x => x.user_id === id).map(x => x.role === 'operator' ? 'operator' : x.role === 'designer' ? 'desainer' : 'kepala produksi').join(', ')})` }));
}

async function woDetail(id) {
  const lk = await lookups();
  const [w, cons, scraps, bom] = await Promise.all([
    q(sb.from('v_wo_board').select('*').eq('id', id).single()),
    q(sb.from('wo_consumptions').select('*').eq('wo_id', id).order('created_at')),
    q(sb.from('wo_scraps').select('*').eq('wo_id', id).order('created_at')),
    null,
  ]);
  const bomLines = await q(sb.from('bom_lines').select('*').eq('product_id', w.product_id));
  const designs = w.so_id ? await q(sb.from('design_approvals').select('*').eq('so_id', w.so_id).order('version', { ascending: false })) : [];
  void bom;
  const prod = lk.prod[w.product_id];
  const waste = 1 + Number(prod?.waste_pct || 0) / 100;
  const used = {}; cons.forEach(c => used[c.product_id] = (used[c.product_id] || 0) + Number(c.qty));
  const plan = bomLines.map(b => ({ ...b, need: Number(b.qty) * Number(w.qty) * waste, used: used[b.component_id] || 0 }));
  const dpOk = !w.so_id || Number(w.paid_verified) >= Number(w.dp_required);
  const late = w.need_date && w.need_date < today() && !['done', 'cancelled'].includes(w.status);

  const acts = [];
  if (can('production', 'e') && !['done', 'cancelled'].includes(w.status)) acts.push(['assign', 'Tugaskan operator', '']);
  if (w.status === 'ready' && can('production', 'e')) acts.push(['start', 'Mulai kerjakan', 'primary']);
  if (w.status === 'in_progress' && can('production', 'e')) acts.push(['bom', 'Ambil bahan sesuai BOM', 'primary'], ['cons', 'Catat bahan manual', ''], ['scrap', 'Catat scrap', 'danger'], ['offcut', 'Catat sisa akrilik', ''], ['finish', 'Selesai → QC', 'brass']);
  if (w.status === 'qc' && can('production', 'a')) acts.push(['pass', 'QC lulus', 'primary'], ['fail', 'QC gagal', 'danger']);

  const body = h(`<div class="stack">
    <div>${plate(w.no, 'lg')} ${chip(w.status)} ${late ? '<span class="chip danger">Terlambat</span>' : ''}</div>
    <dl class="kv"><dt>Produk</dt><dd><b>${esc(prod?.name)}</b> · ${fmt.n(w.qty)} ${esc(prod?.uom)}</dd>
      ${w.so_id ? `<dt>Pesanan</dt><dd><a href="#/sales?id=${w.so_id}">${esc(w.so_no)}</a> · ${esc(w.customer_name)}</dd><dt>Dibutuhkan</dt><dd>${fmt.date(w.need_date)}</dd>
      <dt>DP</dt><dd>${dpOk ? '<span class="chip ok">Terverifikasi</span>' : `<span class="chip danger">Belum: ${fmt.rp(w.paid_verified)} / ${fmt.rp(w.dp_required)}</span>`}</dd>` : ''}
      <dt>Operator</dt><dd>${esc(w.operator_name || '—')}${w.target_date ? ` · target ${fmt.date(w.target_date)}` : ''}</dd>
      <dt>Biaya</dt><dd>Bahan ${fmt.rp(w.material_cost)} · Tenaga ${fmt.rp(w.labor_cost)} · Scrap ${fmt.rp(w.scrap_cost)}</dd>
      ${w.qc_note ? `<dt>Catatan QC</dt><dd>${esc(w.qc_note)}</dd>` : ''}</dl>
    ${w.spec ? `<p class="note">${esc(w.spec)}</p>` : ''}
    ${designs.length ? `<div><h3>Mockup</h3><div class="actions" style="margin-top:6px">${designs.map(d => fileBtn(d.file_path, `v${d.version} ${d.status === 'approved' ? '✓ ACC' : d.status === 'rejected' ? '(revisi)' : '(menunggu)'}`)).join('')}</div></div>` : ''}
    <div><h3>Kebutuhan bahan (BOM + waste ${fmt.pct(prod?.waste_pct || 0)})</h3>${table([
      { l: 'Komponen', f: r => `${esc(lk.prod[r.component_id]?.sku)} ${esc(lk.prod[r.component_id]?.name)}` },
      { l: 'Rencana', cls: 'num', f: r => fmt.n(r.need.toFixed(3)) }, { l: 'Sudah diambil', cls: 'num', f: r => fmt.n(r.used) },
      { l: '', f: r => r.used > r.need * 1.0001 ? '<span class="chip danger">Lebih dari rencana</span>' : '' }], plan, { empty: 'Produk ini tidak punya BOM' })}</div>
    ${scraps.length ? `<div><h3>Scrap</h3>${table([
      { l: 'Bahan', f: r => esc(lk.prod[r.product_id]?.sku) }, { l: 'Qty', cls: 'num', f: r => fmt.n(r.qty) }, { l: 'Penyebab', f: r => CAUSE[r.cause] },
      { l: 'Operator', f: r => esc(uname(lk, r.operator_id)) }, { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.qty * r.unit_cost) }, { l: 'Foto', f: r => fileBtn(r.photo_path, 'Foto') }], scraps)}</div>` : ''}
    ${!dpOk && w.status === 'ready' ? '<p class="note danger">Produksi terkunci sampai DP diverifikasi keuangan.</p>' : ''}
  </div>`);
  bindFiles(body);
  const m = modal({ title: 'Perintah kerja', body, size: 'wide', actions: acts.map(([k, l, c]) => ({ label: l, kind: c, onClick: () => doAct(k) })) });
  async function doAct(k) {
    const after = (msg) => { toast(msg); changed(); refresh(); };
    if (k === 'assign') {
      const opts = await producers(lk);
      m.close();
      await formModal({ title: 'Tugaskan ' + w.no, fields: [{ name: 'u', label: 'Operator', type: 'select', required: true, options: opts, value: w.assigned_to }, { name: 't', label: 'Target selesai', type: 'date', value: w.target_date || w.need_date }],
        onSubmit: v => rpc('wo_assign', { p_id: w.id, p_user: v.u, p_target: v.t || null }) });
      return after('Operator ditugaskan.');
    }
    if (k === 'start') { await rpc('wo_start', { p_id: w.id }); return after('Mulai dikerjakan.'); }
    if (k === 'bom') { const v = await rpc('wo_consume', { p_id: w.id, p_lines: [] }); return after('Bahan diambil: ' + fmt.rp(v)); }
    if (k === 'finish') { await rpc('wo_finish', { p_id: w.id }); return after('Masuk antrean QC. Operator tidak boleh meng-QC hasilnya sendiri.'); }
    if (k === 'pass' || k === 'fail') {
      const n = await ask(k === 'pass' ? 'QC lulus' : 'QC gagal', k === 'pass' ? 'Cek teks grafir huruf per huruf dengan mockup ACC sebelum meluluskan.' : 'Barang kembali ke proses. Catat masalahnya; jika bahan rusak, catat juga sebagai scrap.', { minLen: k === 'pass' ? 0 : 5, label: 'Catatan QC', note: true });
      if (n === null) return false;
      await rpc('wo_qc', { p_id: w.id, p_pass: k === 'pass', p_note: n.trim() });
      return after(k === 'pass' ? 'Lulus QC. Barang jadi masuk stok dan dipesan untuk pelanggan.' : 'QC gagal, kembali ke produksi.');
    }
    m.close();
    if (k === 'cons') {
      const comps = plan.map(p => ({ product_id: p.component_id, qty: Math.max(0, +(p.need - p.used).toFixed(3)) })).filter(x => x.qty > 0);
      const le = lineEditor(lk, comps, { filter: p => ['komponen', 'bahan_baku', 'barang_jadi'].includes(p.category) });
      modal({ title: 'Ambil bahan untuk ' + w.no, body: le.el, size: 'wide', actions: [{ label: 'Batal' }, { label: 'Catat pengambilan', kind: 'primary', onClick: async () => {
        const v = await rpc('wo_consume', { p_id: w.id, p_lines: le.get() }); after('Bahan dicatat: ' + fmt.rp(v)); } }] });
      return;
    }
    if (k === 'scrap') {
      const opts = await producers(lk);
      const mats = [...new Set([...bomLines.map(b => b.component_id), w.product_id])].map(id => ({ value: id, label: `${lk.prod[id]?.sku} · ${lk.prod[id]?.name}` }));
      await formModal({ title: 'Catat scrap ' + w.no, intro: '<p class="note warn small">Scrap wajib ada foto, penyebab, dan operator. Barang rusak dipindah ke lokasi Scrap dan dibebankan sebagai kerugian produksi.</p>',
        fields: [{ name: 'product_id', label: 'Bahan/komponen yang rusak', type: 'select', required: true, options: mats },
          { name: 'qty', label: 'Jumlah', type: 'number', required: true, min: 0 },
          { name: 'cause', label: 'Penyebab', type: 'select', required: true, options: Object.entries(CAUSE).map(([value, label]) => ({ value, label })) },
          { name: 'operator_id', label: 'Operator penanggung jawab', type: 'select', required: true, options: opts, value: w.assigned_to },
          { name: 'photo', label: 'Foto barang rusak', type: 'photo', required: true }, { name: 'note', label: 'Keterangan', type: 'textarea' }],
        onSubmit: async v => rpc('wo_scrap', { p: { wo_id: w.id, product_id: v.product_id, qty: v.qty, cause: v.cause, operator_id: v.operator_id, note: v.note, photo_path: await upl(v.photo, 'scrap') } }) });
      return after('Scrap dicatat.');
    }
    if (k === 'offcut') {
      const mats = lk.products.filter(p => p.category === 'bahan_baku').map(p => ({ value: p.id, label: `${p.sku} · ${p.name}` }));
      await formModal({ title: 'Catat sisa potongan akrilik', intro: '<p class="small muted">Sisa potongan yang masih bisa dipakai dicatat supaya tidak dibuang atau dibawa pulang.</p>',
        fields: [{ name: 'material_id', label: 'Bahan', type: 'select', required: true, options: mats }, { name: 'width_mm', label: 'Lebar (mm)', type: 'number', required: true },
          { name: 'height_mm', label: 'Tinggi (mm)', type: 'number', required: true }, { name: 'note', label: 'Catatan (warna, tebal)', type: 'text' }],
        onSubmit: v => rpc('wo_offcut', { p: { ...v, wo_id: w.id } }) });
      return after('Sisa bahan dicatat.');
    }
  }
}

route('production', {
  title: 'Papan produksi', perm: ['production'],
  async render(el, params) {
    const lk = await lookups();
    const since = new Date(Date.now() - 7 * 86400e3).toISOString();
    let b = sb.from('v_wo_board').select('*').or(`status.neq.done,finished_at.gte.${since}`).neq('status', 'cancelled').order('created_at');
    b = byLocBranch(b, lk);
    if (params.me) b = b.eq('assigned_to', S.me.id);
    const rows = await q(b);
    el.innerHTML = pageHead('Papan produksi', 'Produksi hanya bisa dimulai setelah desain di-ACC pelanggan (dengan bukti) dan DP terverifikasi keuangan.',
      `<a class="btn ${params.me ? 'primary' : ''}" href="#/production${params.me ? '' : '?me=1'}">${params.me ? 'Semua pekerjaan' : 'Pekerjaan saya'}</a>`) +
      `<div class="board">${COLS.map(([k, l]) => {
        const items = rows.filter(r => r.status === k);
        return `<div class="col"><h3><span>${esc(l)}</span><span class="badge">${items.length}</span></h3>${items.map(r => {
          const late = r.need_date && r.need_date < today() && k !== 'done';
          return `<div class="wo-card ${late ? 'late' : ''}" data-id="${r.id}" tabindex="0" role="button"><div class="top">${plate(r.no)}<span class="small muted">${r.need_date ? fmt.date(r.need_date) : ''}</span></div>
            <b>${esc(r.product_name)}</b> × ${fmt.n(r.qty)}<div class="small muted">${esc(r.customer_name || 'Stok')} · ${esc(r.operator_name || 'belum ditugaskan')}</div>
            ${r.so_id && Number(r.paid_verified) < Number(r.dp_required) ? '<span class="chip danger">DP belum</span>' : ''}</div>`;
        }).join('') || '<p class="small muted" style="padding:6px">Kosong</p>'}</div>`;
      }).join('')}</div>`;
    on(el, '[data-id]', 'click', (e, c) => woDetail(c.dataset.id).catch(err => toast(errMsg(err), 'err')));
    on(el, '[data-id]', 'keydown', (e, c) => { if (e.key === 'Enter') woDetail(c.dataset.id); });
    if (params.id) woDetail(params.id).catch(err => toast(errMsg(err), 'err'));
  },
});

route('designs', {
  title: 'Desain & mockup', perm: ['design'],
  async render(el) {
    const lk = await lookups();
    const rows = await q(byLocBranch(sb.from('v_wo_board').select('*').in('status', ['waiting_design', 'waiting_approval']).order('need_date', { nullsFirst: false }), lk));
    el.innerHTML = pageHead('Desain & mockup', 'Pesanan custom yang menunggu mockup atau ACC pelanggan. Buka pesanan untuk mengunggah mockup dan mencatat bukti ACC.') +
      table([{ l: 'WO', f: r => plate(r.no) }, { l: 'Pesanan', f: r => esc(r.so_no) }, { l: 'Pelanggan', k: 'customer_name' }, { l: 'Produk', f: r => `${esc(r.product_name)} × ${fmt.n(r.qty)}` },
        { l: 'Dibutuhkan', f: r => `${fmt.date(r.need_date)}${r.need_date && r.need_date < today() ? ' <span class="chip danger">lewat</span>' : ''}` }, { l: 'Status', f: r => chip(r.status) },
        { l: 'Spesifikasi', f: r => `<span class="small">${esc((r.spec || '').slice(0, 120))}</span>` }], rows, { click: true, empty: 'Tidak ada desain yang menunggu' });
    bindRows(el, rows, r => go('sales', { id: r.so_id }));
  },
});

route('offcuts', {
  title: 'Sisa bahan akrilik', perm: ['production'],
  async render(el, params) {
    const lk = await lookups();
    const st = params.st || 'available';
    const rows = await q(byLocBranch(sb.from('offcuts').select('*').eq('status', st).order('created_at', { ascending: false }).limit(500), lk));
    el.innerHTML = pageHead('Sisa bahan akrilik', 'Potongan sisa yang masih layak pakai. Pakai sisa bahan dulu sebelum memotong lembar baru.',
      can('production', 'e') ? `<button class="btn primary" id="new">${ICON.plus} Catat sisa bahan</button>` : '') +
      `<div class="tabs">${[['available', 'Tersedia'], ['used', 'Terpakai'], ['scrapped', 'Dibuang']].map(([k, l]) => `<button class="${k === st ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div>` +
      table([{ l: 'No', f: r => plate(r.no) }, { l: 'Bahan', f: r => esc(lk.prod[r.material_id]?.name) }, { l: 'Ukuran', f: r => `${fmt.n(r.width_mm)} × ${fmt.n(r.height_mm)} mm` },
        { l: 'Lokasi', f: r => esc(lk.loc[r.location_id]?.name) }, { l: 'Dicatat', f: r => fmt.date(r.created_at) }, { l: 'Catatan', f: r => `<span class="small">${esc(r.note || '')}</span>` },
        { l: '', f: () => st === 'available' ? `<div class="actions">${can('production', 'e') ? '<button class="btn sm" data-use>Pakai</button>' : ''}${can('production', 'a') ? '<button class="btn sm danger" data-drop>Buang</button>' : ''}</div>` : '' }], rows, { empty: 'Tidak ada data' });
    on(el, '[data-st]', 'click', (e, b) => go('offcuts', { st: b.dataset.st }));
    on(el, '[data-use],[data-drop]', 'click', async (e, b) => {
      const r = rows[+b.closest('tr').dataset.i];
      try {
        if (b.hasAttribute('data-use')) {
          const wos = await q(byLocBranch(sb.from('work_orders').select('id,no,product_id').eq('status', 'in_progress'), lk));
          await formModal({ title: 'Pakai ' + r.no, fields: [{ name: 'wo', label: 'Untuk perintah kerja', type: 'select', options: wos.map(w => ({ value: w.id, label: `${w.no} · ${lk.prod[w.product_id]?.name}` })) }, { name: 'note', label: 'Catatan' }],
            onSubmit: v => rpc('offcut_set_status', { p_id: r.id, p_status: 'used', p_wo: v.wo || null, p_note: v.note }) });
        } else {
          const n = await ask('Buang sisa bahan', `Buang ${esc(r.no)}?`, { minLen: 5, label: 'Alasan', danger: true }); if (!n) return;
          await rpc('offcut_set_status', { p_id: r.id, p_status: 'scrapped', p_wo: null, p_note: n });
        }
        toast('Tersimpan.'); refresh();
      } catch (err) { toast(errMsg(err), 'err'); }
    });
    $('#new', el)?.addEventListener('click', async () => {
      const br = await needBranch(); if (!br) return;
      const mats = lk.products.filter(p => p.category === 'bahan_baku').map(p => ({ value: p.id, label: `${p.sku} · ${p.name}` }));
      await formModal({ title: 'Catat sisa bahan', fields: [{ name: 'material_id', label: 'Bahan', type: 'select', required: true, options: mats },
        { name: 'width_mm', label: 'Lebar (mm)', type: 'number', required: true }, { name: 'height_mm', label: 'Tinggi (mm)', type: 'number', required: true }, { name: 'note', label: 'Catatan' }],
        onSubmit: v => rpc('wo_offcut', { p: { ...v, branch_id: br } }) });
      refresh();
    });
  },
});
