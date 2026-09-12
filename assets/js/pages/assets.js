// Aset & mesin: daftar, perawatan, penyusutan, pemindahan, pelepasan
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go, refresh,
  modal, formModal, upl, fileBtn, bindFiles, byBranch, tabs, on, $, $$, h, ICON, downloadCSV, changed, emptyBox,
  today, monthStart, sum, setting } from '../core.js';

const STATUS = {
  active: ['ok', 'Dipakai'], maintenance: ['warn', 'Sedang diservis'], broken: ['danger', 'Rusak'],
  disposed: ['', 'Dilepas'], sold: ['', 'Dijual'],
};
const MKIND = { rutin: 'Perawatan rutin', perbaikan: 'Perbaikan', kalibrasi: 'Kalibrasi', penggantian_part: 'Ganti sparepart' };

async function cats() { return q(sb.from('asset_categories').select('*').order('sort')); }

route('assets', {
  title: 'Aset & mesin', perm: ['assets'],
  async render(el, params) {
    const lk = await lookups();
    if (params.id) return assetDetail(el, params.id, lk);
    const tab = params.t || 'active';
    const [cat, rows, sum_] = await Promise.all([
      cats(),
      (async () => {
        let b = sb.from('v_assets').select('*').order('name').limit(500);
        b = byBranch(b);
        if (tab === 'active') b = b.in('status', ['active', 'maintenance', 'broken']);
        else if (tab === 'due') b = b.in('status', ['active', 'maintenance']).not('next_maintenance_date', 'is', null)
          .lte('next_maintenance_date', new Date(Date.now() + (Number(setting('maintenance_alert_days')) || 7) * 86400e3).toISOString().slice(0, 10));
        else if (tab === 'broken') b = b.eq('status', 'broken');
        else if (tab === 'gone') b = b.in('status', ['disposed', 'sold']);
        if (params.cat) b = b.eq('category', params.cat);
        return q(b);
      })(),
      rpc('rpt_assets', { p_branch: S.branch || null }),
    ]);
    const pend = rows.filter(r => r.disposal_status === 'pending').length;
    el.innerHTML = pageHead('Aset & mesin',
      'Mesin, kendaraan, dan perangkat: siapa penanggung jawabnya, kapan diservis, berapa nilai bukunya, dan berapa biaya yang sudah ditelan tiap unit.',
      (can('assets', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Aset baru</button>` : '') +
      (can('assets', 'a') ? `<button class="btn" id="dep">Hitung penyusutan bulanan</button>` : '') +
      `<button class="btn" id="csv">${ICON.dl} CSV</button>`) +
      `<div class="metrics" style="margin-bottom:14px">
        <div class="metric"><div class="l">Aset aktif</div><div class="v">${sum_.count}</div></div>
        <div class="metric"><div class="l">Nilai perolehan</div><div class="v">${fmt.rp(sum_.cost)}</div></div>
        <div class="metric"><div class="l">Nilai buku sekarang</div><div class="v">${fmt.rp(sum_.book_value)}</div></div>
        <div class="metric"><div class="l">Biaya perawatan 12 bulan</div><div class="v">${fmt.rp(sum_.maintenance_12m)}</div></div>
        <a class="metric link" href="#/assets?t=due" style="text-decoration:none;color:inherit"><div class="l">Servis segera jatuh tempo</div><div class="v">${sum_.due_soon}</div></a>
        <a class="metric link" href="#/assets?t=broken" style="text-decoration:none;color:inherit"><div class="l">Sedang rusak</div><div class="v">${sum_.broken}</div></a>
      </div>` +
      tabs([{ k: 'active', l: 'Dipakai' }, { k: 'due', l: 'Perlu servis', n: sum_.due_soon || undefined },
        { k: 'broken', l: 'Rusak', n: sum_.broken || undefined }, { k: 'gone', l: 'Sudah dilepas' }, { k: 'all', l: 'Semua' }], tab) +
      (pend ? `<p class="note warn">${pend} aset menunggu keputusan pelepasan. Buka asetnya untuk menyetujui atau menolak.</p>` : '') +
      `<div class="filters"><select id="cat"><option value="">Semua kategori</option>${
        cat.map(c => `<option value="${c.code}" ${params.cat === c.code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` +
      table([
        { l: 'Kode', f: r => plate(r.no) },
        { l: 'Aset', f: r => `<b>${esc(r.name)}</b><br><span class="small muted">${esc([r.brand, r.model].filter(Boolean).join(' '))}${r.serial_no ? ' · SN ' + esc(r.serial_no) : ''}</span>` },
        { l: 'Kategori', f: r => esc(r.category_name) },
        { l: 'Lokasi', f: r => `${esc(r.branch_name || '—')}<br><span class="small muted">${esc(r.place || '')}</span>` },
        { l: 'Penanggung jawab', f: r => esc(r.holder_name || '—') },
        { l: 'Perolehan', cls: 'num', f: r => `${fmt.rp(r.purchase_cost)}<br><span class="small muted">${fmt.date(r.purchase_date)}</span>` },
        { l: 'Nilai buku', cls: 'num', f: r => fmt.rp(r.book_value), foot: rs => fmt.rp(sum(rs, 'book_value')) },
        { l: 'Biaya perawatan', cls: 'num', f: r => r.maintenance_total > 0 ? fmt.rp(r.maintenance_total) : '—' },
        { l: 'Servis berikut', f: r => r.next_maintenance_date
          ? `${fmt.date(r.next_maintenance_date)}<br>${r.days_to_service < 0 ? `<span class="chip danger">lewat ${-r.days_to_service} hari</span>` : r.days_to_service <= 7 ? `<span class="chip warn">${r.days_to_service} hari lagi</span>` : `<span class="small muted">${r.days_to_service} hari lagi</span>`}`
          : '<span class="muted small">tanpa jadwal</span>' },
        { l: 'Status', f: r => chip(STATUS[r.status][0], STATUS[r.status][1]) + (r.disposal_status === 'pending' ? '<br>' + chip('warn', 'Pelepasan diajukan') : '') },
      ], rows, { click: true, empty: 'Belum ada aset tercatat', emptyHint: 'Catat mesin, kendaraan, dan perangkat supaya biaya perawatannya bisa ditelusuri.',
        rowCls: r => r.status === 'broken' || r.days_to_service < 0 ? 'bad' : r.days_to_service <= 7 && r.days_to_service >= 0 ? 'warn' : '' });
    on(el, '[data-tab]', 'click', (e, b) => go('assets', { t: b.dataset.tab, ...(params.cat ? { cat: params.cat } : {}) }));
    $('#cat', el).onchange = (e) => go('assets', { t: tab, ...(e.target.value ? { cat: e.target.value } : {}) });
    bindRows(el, rows, r => go('assets', { id: r.id }));
    $('#csv', el).onclick = () => downloadCSV('aset-' + today(), rows, [{ l: 'Kode', k: 'no' }, { l: 'Nama', k: 'name' },
      { l: 'Kategori', k: 'category_name' }, { l: 'Cabang', k: 'branch_name' }, { l: 'Penanggung jawab', k: 'holder_name' },
      { l: 'Tanggal beli', k: 'purchase_date' }, { l: 'Perolehan', k: 'purchase_cost' }, { l: 'Nilai buku', k: 'book_value' },
      { l: 'Biaya perawatan', k: 'maintenance_total' }, { l: 'Status', k: 'status' }]);
    $('#new', el)?.addEventListener('click', () => assetForm(null, lk, cat));
    $('#dep', el)?.addEventListener('click', async () => {
      const last = new Date(); last.setDate(0);
      await formModal({ title: 'Hitung penyusutan bulanan',
        intro: '<p class="small muted">Menghitung penyusutan garis lurus untuk semua aset aktif pada bulan tersebut, lalu membukukannya per cabang. Aman dijalankan ulang — bulan yang sudah dihitung dilewati.</p>',
        fields: [{ name: 'month', label: 'Bulan', required: true, value: last.toISOString().slice(0, 7), hint: 'Format YYYY-MM. Hanya bulan yang sudah berakhir.' }],
        onSubmit: async v => { const r = await rpc('asset_depreciate', { p_month: v.month + '-01' });
          toast(r.assets ? `${r.assets} aset disusutkan, total ${fmt.rp(r.amount)}.` : 'Tidak ada aset yang perlu disusutkan pada bulan itu.'); } });
      refresh();
    });
  },
});

async function assetForm(a, lk, cat) {
  const isNew = !a;
  await formModal({
    title: isNew ? 'Aset baru' : `${a.no} · ${a.name}`, size: 'full', submitLabel: 'Simpan',
    intro: isNew ? `<p class="small muted">Pembelian di atas ${fmt.rp(setting('asset_capitalize_min'))} sebaiknya dicatat di sini sebagai aset, bukan sebagai biaya — supaya nilainya menyusut bertahap, bukan membebani laba satu bulan saja.</p>` : '',
    fields: [
      { name: 'name', label: 'Nama aset', required: true, value: a?.name, span: 2 },
      { name: 'category', label: 'Kategori', type: 'select', required: true, value: a?.category, options: cat.map(c => ({ value: c.code, label: `${c.name} (umur ${c.default_life_months} bulan)` })) },
      { name: 'branch_id', label: 'Cabang', type: 'select', value: a?.branch_id, options: lk.branches.map(b => ({ value: b.id, label: b.name })) },
      { name: 'place', label: 'Letak fisik', value: a?.place, hint: 'Mis. ruang produksi belakang, meja kasir.' },
      { name: 'holder_id', label: 'Penanggung jawab', type: 'select', value: a?.holder_id, options: lk.profiles.filter(p => p.active).map(p => ({ value: p.id, label: p.full_name || p.email })), hint: 'Orang yang memegang dan bertanggung jawab atas kondisinya.' },
      { name: 'brand', label: 'Merek', value: a?.brand }, { name: 'model', label: 'Tipe / model', value: a?.model },
      { name: 'serial_no', label: 'Nomor seri / rangka', value: a?.serial_no },
      { name: 'supplier_id', label: 'Dibeli dari', type: 'select', value: a?.supplier_id, options: lk.suppliers.map(s => ({ value: s.id, label: s.name })) },
      ...(isNew ? [
        { name: 'purchase_date', label: 'Tanggal pembelian', type: 'date', required: true, value: today() },
        { name: 'purchase_cost', label: 'Harga perolehan (Rp)', type: 'number', required: true, hint: 'Termasuk ongkos kirim dan pemasangan.' },
        { name: 'pay_method', label: 'Dibayar dari', type: 'select', options: [{ value: 'bank', label: 'Transfer bank' }, { value: 'cash', label: 'Kas' }], hint: 'Kosongkan jika aset lama yang baru didata sekarang.' },
      ] : []),
      { name: 'salvage_value', label: 'Perkiraan nilai sisa (Rp)', type: 'number', value: a?.salvage_value ?? 0, hint: 'Nilai jual saat umur ekonomisnya habis.' },
      { name: 'life_months', label: 'Umur ekonomis (bulan)', type: 'number', value: a?.life_months },
      { name: 'warranty_until', label: 'Garansi sampai', type: 'date', value: a?.warranty_until },
      { name: 'maintenance_interval_days', label: 'Servis rutin tiap (hari)', type: 'number', value: a?.maintenance_interval_days ?? 0, hint: '0 = tanpa jadwal rutin.' },
      ...(isNew ? [] : [{ name: 'status', label: 'Kondisi', type: 'select', value: a?.status, options: [['active', 'Dipakai'], ['maintenance', 'Sedang diservis'], ['broken', 'Rusak']].map(([value, label]) => ({ value, label })) }]),
      { name: 'photo', label: 'Foto aset', type: 'photo' },
      { name: 'note', label: 'Catatan', type: 'textarea', value: a?.note },
    ],
    onSubmit: async (v) => {
      const p = { ...v, id: a?.id || null };
      delete p.photo;
      if (v.photo) p.photo_path = await upl(v.photo, 'aset');
      await rpc('asset_save', { p });
    },
  });
  toast('Aset tersimpan.'); refresh();
}

async function assetDetail(el, id, lk) {
  const [a, maint, events, cat] = await Promise.all([
    q(sb.from('v_assets').select('*').eq('id', id).single()),
    q(sb.from('asset_maintenances').select('*').eq('asset_id', id).order('service_date', { ascending: false })),
    q(sb.from('asset_events').select('*').eq('asset_id', id).order('at', { ascending: false }).limit(50)),
    cats(),
  ]);
  const gone = ['disposed', 'sold'].includes(a.status);
  const acts = [];
  if (!gone && can('assets', 'e')) acts.push(['edit', 'Ubah data', ''], ['move', 'Pindahkan', '']);
  if (!gone && can('assets', 'c')) acts.push(['service', 'Catat perawatan', 'primary']);
  if (!gone && a.disposal_status !== 'pending' && can('assets', 'e')) acts.push(['dispose', 'Ajukan pelepasan', 'danger']);
  if (a.disposal_status === 'pending' && can('assets', 'a')) acts.push(['ok', 'Setujui pelepasan', 'primary'], ['no', 'Tolak pelepasan', 'danger']);

  const ageMonths = Math.max(0, Math.round((Date.now() - new Date(a.purchase_date)) / 2629800000));
  const costPerMonth = ageMonths > 0 ? (Number(a.maintenance_total) + Number(a.depreciated_total)) / ageMonths : 0;

  el.innerHTML = `<p><a href="#/assets">← Semua aset</a></p>` +
    pageHead(a.name, `${plate(a.no, 'lg')} ${chip(STATUS[a.status][0], STATUS[a.status][1])} · ${esc(a.category_name)} · ${esc(a.branch_name || 'Tanpa cabang')}`,
      acts.map(([k, l, c]) => `<button class="btn ${c}" data-a="${k}">${esc(l)}</button>`).join('')) +
    (a.disposal_status === 'pending' ? `<p class="note warn">Pelepasan diajukan oleh ${esc(uname(lk, a.disposal_by))}: ${esc(a.disposal_reason)}${a.disposal_value > 0 ? ` — perkiraan hasil penjualan ${fmt.rp(a.disposal_value)}` : ''}</p>` : '') +
    (a.status === 'broken' ? '<p class="note danger">Aset ini sedang rusak. Catat perawatan setelah diperbaiki supaya statusnya kembali normal.</p>' : '') +
    (a.days_to_service !== null && a.days_to_service < 0 ? `<p class="note warn">Jadwal servis sudah lewat ${-a.days_to_service} hari.</p>` : '') +
    `<div class="cols"><div class="stack">
      <section class="panel"><div class="ph"><h2>Riwayat perawatan</h2><span class="small muted">${maint.length} catatan · total ${fmt.rp(a.maintenance_total)}</span></div><div class="pb">${
        table([
          { l: 'No', f: r => plate(r.no) }, { l: 'Tanggal', f: r => fmt.date(r.service_date) },
          { l: 'Jenis', f: r => MKIND[r.kind] }, { l: 'Pekerjaan', f: r => `${esc(r.description)}${r.vendor ? `<br><span class="small muted">${esc(r.vendor)}</span>` : ''}` },
          { l: 'Berhenti', cls: 'num', f: r => r.downtime_hours ? fmt.n(r.downtime_hours) + ' jam' : '—' },
          { l: 'Biaya', cls: 'num', f: r => fmt.rp(r.cost), foot: rs => fmt.rp(sum(rs, 'cost')) },
          { l: 'Nota', f: r => fileBtn(r.proof_path, 'Nota') },
        ], maint, { empty: 'Belum ada perawatan tercatat' })}</div></section>
      <section class="panel"><div class="ph"><h2>Riwayat kejadian</h2></div><div class="pb">${
        table([{ l: 'Waktu', f: r => fmt.dt(r.at) }, { l: 'Kejadian', f: r => esc(r.kind) },
          { l: 'Keterangan', f: r => esc(r.detail || '') }, { l: 'Oleh', f: r => esc(uname(lk, r.user_id)) }], events, { empty: '—' })}</div></section>
    </div><div class="stack">
      <section class="panel"><div class="ph"><h2>Rincian</h2></div><div class="pb">
        ${a.photo_path ? `<p>${fileBtn(a.photo_path, 'Lihat foto aset')}</p>` : ''}
        <dl class="kv">
          <dt>Merek / tipe</dt><dd>${esc([a.brand, a.model].filter(Boolean).join(' ') || '—')}</dd>
          <dt>Nomor seri</dt><dd>${esc(a.serial_no || '—')}</dd>
          <dt>Letak</dt><dd>${esc(a.place || '—')}</dd>
          <dt>Penanggung jawab</dt><dd>${esc(a.holder_name || '—')}</dd>
          <dt>Dibeli dari</dt><dd>${esc(a.supplier_name || '—')}</dd>
          <dt>Tanggal beli</dt><dd>${fmt.date(a.purchase_date)} <span class="small muted">(${ageMonths} bulan lalu)</span></dd>
          <dt>Garansi</dt><dd>${a.warranty_until ? fmt.date(a.warranty_until) + (a.warranty_until < today() ? ' <span class="chip">habis</span>' : ' <span class="chip ok">masih berlaku</span>') : '—'}</dd>
          <dt>Servis rutin</dt><dd>${a.maintenance_interval_days > 0 ? `tiap ${a.maintenance_interval_days} hari` : 'tanpa jadwal'}</dd>
          <dt>Servis terakhir</dt><dd>${a.last_service ? fmt.date(a.last_service) : '—'}</dd>
          <dt>Total berhenti kerja</dt><dd>${fmt.n(a.downtime_total)} jam</dd>
        </dl></div></section>
      <section class="panel"><div class="ph"><h2>Nilai & biaya</h2></div><div class="pb"><dl class="kv">
        <dt>Harga perolehan</dt><dd class="num">${fmt.rp(a.purchase_cost)}</dd>
        <dt>Umur ekonomis</dt><dd class="num">${a.life_months} bulan</dd>
        <dt>Penyusutan per bulan</dt><dd class="num">${fmt.rp(a.monthly_depreciation)}</dd>
        <dt>Sudah disusutkan</dt><dd class="num">${fmt.rp(a.depreciated_total)}${a.depreciated_until ? `<br><span class="small muted">s/d ${fmt.date(a.depreciated_until)}</span>` : ''}</dd>
        <dt><b>Nilai buku</b></dt><dd class="num"><b>${fmt.rp(a.book_value)}</b></dd>
        <dt>Nilai sisa</dt><dd class="num">${fmt.rp(a.salvage_value)}</dd>
        <dt>Biaya perawatan</dt><dd class="num">${fmt.rp(a.maintenance_total)}</dd>
        <dt>Beban rata-rata</dt><dd class="num">${fmt.rp(costPerMonth)}/bulan</dd>
      </dl><p class="small muted" style="margin-top:10px">Beban rata-rata menggabungkan penyusutan dan perawatan. Kalau angkanya terus naik, biasanya lebih murah mengganti mesin daripada terus memperbaikinya.</p></div></section>
    </div></div>`;
  bindFiles(el);

  on(el, '[data-a]', 'click', async (e, b) => {
    const k = b.dataset.a;
    try {
      if (k === 'edit') return assetForm(a, lk, cat);
      if (k === 'move') {
        await formModal({ title: 'Pindahkan aset',
          fields: [{ name: 'branch', label: 'Cabang tujuan', type: 'select', value: a.branch_id, options: lk.branches.map(x => ({ value: x.id, label: x.name })) },
            { name: 'holder', label: 'Penanggung jawab baru', type: 'select', value: a.holder_id, options: lk.profiles.filter(p => p.active).map(p => ({ value: p.id, label: p.full_name || p.email })) },
            { name: 'place', label: 'Letak fisik', value: a.place },
            { name: 'note', label: 'Alasan pemindahan', type: 'textarea', required: true }],
          onSubmit: v => rpc('asset_move', { p_id: a.id, p_branch: v.branch || null, p_holder: v.holder || null, p_place: v.place, p_note: v.note }) });
        toast('Aset dipindahkan.'); return refresh();
      }
      if (k === 'service') {
        await formModal({ title: 'Catat perawatan ' + a.no, size: 'wide',
          intro: '<p class="small muted">Semua biaya servis wajib ada notanya. Riwayat ini yang nanti menjawab pertanyaan "mesin ini masih layak dipertahankan atau tidak".</p>',
          fields: [
            { name: 'kind', label: 'Jenis', type: 'select', required: true, options: Object.entries(MKIND).map(([value, label]) => ({ value, label })) },
            { name: 'service_date', label: 'Tanggal', type: 'date', required: true, value: today() },
            { name: 'vendor', label: 'Bengkel / teknisi', value: '' },
            { name: 'description', label: 'Pekerjaan yang dilakukan', type: 'textarea', required: true },
            { name: 'cost', label: 'Biaya (Rp)', type: 'number', value: 0 },
            { name: 'downtime_hours', label: 'Mesin berhenti (jam)', type: 'number', value: 0 },
            { name: 'pay_method', label: 'Dibayar dari', type: 'select', options: [{ value: 'bank', label: 'Transfer bank' }, { value: 'cash', label: 'Kas cabang' }] },
            { name: 'bank_account_id', label: 'Rekening', type: 'select', options: lk.banks.filter(x => x.active && x.kind !== 'marketplace').map(x => ({ value: x.id, label: `${x.bank_name} ${x.account_no}` })) },
            { name: 'proof', label: 'Nota servis', type: 'file' },
            { name: 'next_due_date', label: 'Servis berikutnya', type: 'date', hint: a.maintenance_interval_days > 0 ? `Kosongkan untuk otomatis ${a.maintenance_interval_days} hari lagi.` : '' },
          ],
          onSubmit: async v => rpc('asset_maintain', { p: { ...v, asset_id: a.id, proof_path: v.proof ? await upl(v.proof, 'servis-aset') : null } }) });
        toast('Perawatan dicatat.'); changed(); return refresh();
      }
      if (k === 'dispose') {
        await formModal({ title: 'Ajukan pelepasan aset',
          intro: `<p class="note small">Nilai buku saat ini ${fmt.rp(a.book_value)}. Pelepasan harus disetujui orang lain dan akan dibukukan — termasuk rugi atau laba dari selisih nilai buku.</p>`,
          fields: [{ name: 'reason', label: 'Alasan pelepasan', type: 'textarea', required: true, hint: 'Mis. rusak berat dan biaya perbaikan melebihi harga mesin baru.' },
            { name: 'value', label: 'Perkiraan hasil penjualan (Rp)', type: 'number', value: 0, hint: 'Isi 0 kalau dibuang tanpa nilai.' }],
          onSubmit: v => rpc('asset_dispose_request', { p_id: a.id, p_reason: v.reason, p_value: v.value || 0 }) });
        toast('Pengajuan dikirim.'); changed(); return refresh();
      }
      if (k === 'ok' || k === 'no') {
        const n = await ask(k === 'ok' ? 'Setujui pelepasan' : 'Tolak pelepasan',
          k === 'ok' ? `Nilai buku ${fmt.rp(a.book_value)} akan dihapus dari pembukuan${a.disposal_value > 0 ? ` dan hasil penjualan ${fmt.rp(a.disposal_value)} dicatat` : ''}.` : 'Aset tetap dipakai.',
          { okLabel: k === 'ok' ? 'Setujui' : 'Tolak', danger: k === 'no', minLen: 5 });
        if (!n) return;
        await rpc('asset_dispose_decide', { p_id: a.id, p_approve: k === 'ok', p_note: n });
        toast('Tersimpan.'); changed(); return refresh();
      }
    } catch (err) { toast(errMsg(err), 'err'); }
  });
}
