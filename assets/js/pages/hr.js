// SDM: karyawan, absensi, skema gaji, kasbon, pembebanan, penggajian, slip gaji
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, ask, toast, errMsg, go, refresh,
  modal, formModal, upl, fileBtn, bindFiles, byBranch, tabs, on, $, $$, h, ICON, printHTML, downloadCSV, changed, emptyBox,
  today, monthStart, sum, groupBy, setting } from '../core.js';

const EMP_TYPE = { tetap: 'Karyawan tetap', kontrak: 'Kontrak', harian: 'Harian', borongan: 'Borongan', magang: 'Magang' };
const ATT = { hadir: ['ok', 'Hadir'], izin: ['info', 'Izin'], sakit: ['info', 'Sakit'], cuti: ['info', 'Cuti'], alpa: ['danger', 'Alpa'], libur: ['', 'Libur'] };
const monthLabel = (d) => new Date(d + (d.length === 7 ? '-01' : '')).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

async function components() { return q(sb.from('salary_components').select('*').order('sort')); }

// ---------------------------------------------------------------------
route('employees', {
  title: 'Karyawan', perm: ['employees'],
  async render(el, params) {
    const lk = await lookups();
    let b = sb.from('employees').select('*').order('full_name').limit(500);
    if (!params.all) b = b.eq('status', 'active');
    const [rows, schemes] = await Promise.all([q(b), q(sb.from('salary_schemes').select('*').order('name'))]);
    el.innerHTML = pageHead('Karyawan', 'Data kepegawaian dan skema gaji. Akun login dibuat terpisah di menu Pengguna & akses — di sini yang dicatat adalah hubungan kerjanya.',
      can('employees', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Karyawan baru</button>
        <a class="btn" href="#/schemes">Skema gaji</a><button class="btn" id="csv">${ICON.dl} CSV</button>` : '') +
      `<div class="filters"><label class="chk"><input type="checkbox" id="all" ${params.all ? 'checked' : ''}> Tampilkan yang sudah keluar</label></div>` +
      table([
        { l: 'NIK', f: r => plate(r.no) },
        { l: 'Nama', f: r => `<b>${esc(r.full_name)}</b><br><span class="small muted">${esc(r.position || '—')}</span>` },
        { l: 'Cabang', f: r => esc(lk.br[r.branch_id]?.name || '—') },
        { l: 'Status kerja', f: r => EMP_TYPE[r.employment_type] },
        { l: 'Mulai kerja', f: r => `${fmt.date(r.join_date)}<br><span class="small muted">${Math.floor((Date.now() - new Date(r.join_date)) / 31536000000)} tahun</span>` },
        { l: 'Skema gaji', f: r => esc(schemes.find(s => s.id === r.scheme_id)?.name || '—') },
        { l: 'Akun login', f: r => r.profile_id ? esc(uname(lk, r.profile_id)) : '<span class="muted small">tanpa akun</span>' },
        { l: 'Status', f: r => chip(r.status === 'active' ? 'ok' : 'danger', { active: 'Aktif', resigned: 'Resign', terminated: 'Diberhentikan' }[r.status]) },
      ], rows, { click: true, empty: 'Belum ada karyawan' });
    $('#all', el).onchange = (e) => go('employees', e.target.checked ? { all: '1' } : {});
    $('#csv', el)?.addEventListener('click', () => downloadCSV('karyawan-' + today(), rows, [{ l: 'NIK', k: 'no' }, { l: 'Nama', k: 'full_name' },
      { l: 'Jabatan', k: 'position' }, { l: 'Jenis', k: 'employment_type' }, { l: 'Mulai', k: 'join_date' }, { l: 'Status', k: 'status' }]));
    bindRows(el, rows, r => empForm(r, lk, schemes));
    $('#new', el)?.addEventListener('click', () => empForm(null, lk, schemes));
  },
});

async function empForm(e, lk, schemes) {
  const comps = await components();
  const own = e ? await q(sb.from('employee_salary').select('*').eq('employee_id', e.id)) : [];
  const val = (c) => own.find(x => x.component_code === c)?.value ?? '';
  const canPayroll = can('payroll', 'view');
  const free = lk.profiles.filter(p => p.active);
  const body = h(`<div class="stack">
    <div class="grid g3">
      <label class="f req"><span>Nama lengkap</span><input data-f="full_name" value="${esc(e?.full_name || '')}"></label>
      <label class="f"><span>Jabatan / posisi</span><input data-f="position" value="${esc(e?.position || '')}"></label>
      <label class="f"><span>Akun login (opsional)</span><select data-f="profile_id"><option value="">— tanpa akun —</option>${
        free.map(p => `<option value="${p.id}" ${e?.profile_id === p.id ? 'selected' : ''}>${esc(p.full_name || p.email)}</option>`).join('')}</select></label>
      <label class="f"><span>Cabang</span><select data-f="branch_id"><option value="">—</option>${
        lk.branches.map(b => `<option value="${b.id}" ${e?.branch_id === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      <label class="f"><span>Status hubungan kerja</span><select data-f="employment_type">${
        Object.entries(EMP_TYPE).map(([k, v]) => `<option value="${k}" ${e?.employment_type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f"><span>Tanggal masuk</span><input type="date" data-f="join_date" value="${esc(e?.join_date || today())}"></label>
      <label class="f"><span>No. HP</span><input data-f="phone" value="${esc(e?.phone || '')}"></label>
      <label class="f"><span>NIK KTP</span><input data-f="nik_ktp" value="${esc(e?.nik_ktp || '')}"></label>
      <label class="f"><span>NPWP</span><input data-f="npwp" value="${esc(e?.npwp || '')}"></label>
      <label class="f"><span>Bank</span><input data-f="bank_name" value="${esc(e?.bank_name || '')}"></label>
      <label class="f"><span>No. rekening</span><input data-f="bank_account_no" value="${esc(e?.bank_account_no || '')}"></label>
      <label class="f"><span>Atas nama</span><input data-f="bank_account_name" value="${esc(e?.bank_account_name || '')}"></label>
      <label class="f span2"><span>Kontak darurat</span><input data-f="emergency_contact" value="${esc(e?.emergency_contact || '')}"></label>
      ${e ? `<label class="f"><span>Status</span><select data-f="status">${[['active', 'Aktif'], ['resigned', 'Resign'], ['terminated', 'Diberhentikan']].map(([k, l]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f"><span>Tanggal berhenti</span><input type="date" data-f="end_date" value="${esc(e?.end_date || '')}"></label>` : ''}
    </div>
    ${canPayroll ? `<div><h3>Gaji</h3>
      <label class="f"><span>Skema gaji</span><select data-f="scheme_id"><option value="">— tanpa skema —</option>${
        schemes.map(s => `<option value="${s.id}" ${e?.scheme_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <small>Nilai dari skema dipakai kalau kolom di bawah dikosongkan.</small></label>
      <p class="small muted" style="margin-top:8px">Isi hanya yang berbeda dari skema. Komponen otomatis (kasbon, potongan tanggung jawab, potongan absen) tidak perlu diisi.</p>
      <div class="grid g3" style="margin-top:6px">${comps.filter(c => !['auto'].includes(c.calc)).map(c => `
        <label class="f"><span>${esc(c.name)}</span><input type="number" step="any" data-s="${c.code}" value="${val(c.code)}" placeholder="ikut skema">
        <small>${esc(({ fixed: 'Rp per bulan', per_day_present: 'Rp per hari hadir', per_hour_overtime: 'Rp per jam lembur', per_unit_produced: 'Rp per unit lulus QC', pct_of_base: '% dari gaji pokok', pct_of_profit: '% dari laba pesanannya', pct_of_sales: '% dari omzetnya', manual: 'Rp, diisi saat penggajian' })[c.calc] || '')}</small></label>`).join('')}</div></div>` : ''}
    <label class="f"><span>Catatan</span><textarea data-f="note">${esc(e?.note || '')}</textarea></label>
  </div>`);
  modal({
    title: e ? e.full_name : 'Karyawan baru', body, size: 'full',
    actions: [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', onClick: async () => {
      const p = { id: e?.id || null };
      $$('[data-f]', body).forEach(i => p[i.dataset.f] = i.value);
      if (!p.full_name?.trim()) throw new Error('Nama wajib diisi.');
      if (canPayroll) {
        p.salary = {};
        $$('[data-s]', body).forEach(i => { if (i.value !== '') p.salary[i.dataset.s] = Number(i.value); });
      }
      await rpc('employee_save', { p });
      toast('Data karyawan tersimpan.'); refresh();
    } }],
  });
}

// ---------------------------------------------------------------------
route('schemes', {
  title: 'Skema gaji', perm: () => can('payroll', 'edit'),
  async render(el) {
    const [schemes, comps] = await Promise.all([q(sb.from('salary_schemes').select('*').order('name')), components()]);
    const lines = await q(sb.from('salary_scheme_lines').select('*'));
    el.innerHTML = pageHead('Skema gaji', 'Paket gaji yang bisa dipakai berulang untuk banyak karyawan. Nilai per orang tetap bisa ditimpa di data karyawan masing-masing.',
      `<button class="btn primary" id="new">${ICON.plus} Skema baru</button>`) +
      schemes.map(s => {
        const ls = lines.filter(l => l.scheme_id === s.id);
        return `<section class="panel" style="margin-bottom:12px"><div class="ph"><h2>${esc(s.name)}</h2>
          ${chip('info', { bulanan: 'Bulanan', harian: 'Harian', borongan: 'Borongan', bulanan_komisi: 'Bulanan + komisi' }[s.kind])}
          <span style="flex:1"></span><button class="btn sm" data-edit="${s.id}">Ubah</button></div>
          <div class="pb">${s.note ? `<p class="small muted">${esc(s.note)}</p>` : ''}
          ${table([{ l: 'Komponen', f: r => esc(comps.find(c => c.code === r.component_code)?.name) },
            { l: 'Jenis', f: r => comps.find(c => c.code === r.component_code)?.kind === 'earning' ? 'Penambah' : 'Potongan' },
            { l: 'Nilai', cls: 'num', f: r => { const c = comps.find(x => x.code === r.component_code); return ['pct_of_base', 'pct_of_profit', 'pct_of_sales'].includes(c?.calc) ? fmt.pct(r.value) : fmt.rp(r.value); } },
            { l: 'Dasar', f: r => esc(({ fixed: 'per bulan', per_day_present: 'per hari hadir', per_hour_overtime: 'per jam lembur', per_unit_produced: 'per unit lulus QC', pct_of_base: 'dari gaji pokok', pct_of_profit: 'dari laba pesanan', pct_of_sales: 'dari omzet', manual: 'diisi manual' })[comps.find(c => c.code === r.component_code)?.calc] || '') },
          ], ls, { cards: false, empty: 'Belum ada komponen' })}</div></section>`;
      }).join('') || emptyBox('Belum ada skema gaji');
    const form = async (s) => {
      const ls = s ? lines.filter(l => l.scheme_id === s.id) : [];
      const body = h(`<div class="stack">
        <div class="grid g2"><label class="f req"><span>Nama skema</span><input data-name value="${esc(s?.name || '')}"></label>
        <label class="f"><span>Jenis</span><select data-kind>${[['bulanan', 'Bulanan'], ['harian', 'Harian'], ['borongan', 'Borongan'], ['bulanan_komisi', 'Bulanan + komisi']].map(([k, l]) => `<option value="${k}" ${s?.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <label class="f"><span>Catatan</span><textarea data-note">${esc(s?.note || '')}</textarea></label>
        <div><h3>Komponen</h3><div class="grid g3" style="margin-top:6px">${comps.filter(c => c.calc !== 'auto').map(c => `
          <label class="f"><span>${esc(c.name)}</span><input type="number" step="any" data-c="${c.code}" value="${ls.find(l => l.component_code === c.code)?.value ?? ''}">
          <small>${esc(c.note || '')}</small></label>`).join('')}</div></div></div>`);
      modal({ title: s ? 'Ubah skema' : 'Skema gaji baru', body, size: 'full', actions: [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', onClick: async () => {
        const l = {}; $$('[data-c]', body).forEach(i => { if (i.value !== '') l[i.dataset.c] = Number(i.value); });
        await rpc('scheme_save', { p: { id: s?.id || null, name: $('[data-name]', body).value, kind: $('[data-kind]', body).value, note: $('[data-note]', body).value, lines: l } });
        toast('Skema tersimpan.'); refresh();
      } }] });
    };
    $('#new', el).onclick = () => form(null);
    on(el, '[data-edit]', 'click', (e, b) => form(schemes.find(s => s.id === b.dataset.edit)));
  },
});

// ---------------------------------------------------------------------
route('attendance', {
  title: 'Absensi', perm: ['attendance'],
  async render(el, params) {
    const lk = await lookups();
    const d = params.d || today();
    let b = sb.from('employees').select('*').eq('status', 'active').order('full_name');
    if (S.branch) b = b.eq('branch_id', S.branch);
    const emps = await q(b);
    const att = await q(sb.from('attendance').select('*').eq('att_date', d));
    const cur = (id) => att.find(a => a.employee_id === id);
    const editable = can('attendance', 'create') && d <= today();
    el.innerHTML = pageHead('Absensi harian', 'Dasar perhitungan tunjangan kehadiran, uang makan, lembur, dan potongan ketidakhadiran. Setelah gajinya diproses, absensi periode itu terkunci.',
      editable ? `<button class="btn" id="allhadir">Tandai semua hadir</button><button class="btn primary" id="save">Simpan absensi</button>` : '') +
      `<div class="filters"><input type="date" id="d" value="${d}" max="${today()}">
        <span class="chip dark">${new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>` +
      table([
        { l: 'Karyawan', f: r => `<b>${esc(r.full_name)}</b><br><span class="small muted">${esc(r.position || '')} · ${esc(lk.br[r.branch_id]?.name || '')}</span>` },
        { l: 'Kehadiran', f: r => editable ? `<select data-e="${r.id}" data-k="status">${Object.entries(ATT).map(([k, v]) => `<option value="${k}" ${(cur(r.id)?.status || 'hadir') === k ? 'selected' : ''}>${v[1]}</option>`).join('')}</select>`
          : chip(ATT[cur(r.id)?.status]?.[0] ?? '', ATT[cur(r.id)?.status]?.[1] ?? 'belum diisi') },
        { l: 'Masuk', f: r => editable ? `<input type="time" data-e="${r.id}" data-k="check_in" value="${esc(cur(r.id)?.check_in?.slice(0, 5) || '08:00')}">` : esc(cur(r.id)?.check_in?.slice(0, 5) || '—') },
        { l: 'Pulang', f: r => editable ? `<input type="time" data-e="${r.id}" data-k="check_out" value="${esc(cur(r.id)?.check_out?.slice(0, 5) || '17:00')}">` : esc(cur(r.id)?.check_out?.slice(0, 5) || '—') },
        { l: 'Lembur (jam)', cls: 'num', f: r => editable ? `<input type="number" step="0.5" min="0" style="max-width:90px" data-e="${r.id}" data-k="overtime_hours" value="${cur(r.id)?.overtime_hours ?? 0}">` : fmt.n(cur(r.id)?.overtime_hours ?? 0) },
        { l: 'Catatan', f: r => editable ? `<input data-e="${r.id}" data-k="note" value="${esc(cur(r.id)?.note || '')}">` : esc(cur(r.id)?.note || '') },
      ], emps, { cards: false, empty: 'Belum ada karyawan aktif' });
    $('#d', el).onchange = (e) => go('attendance', { d: e.target.value });
    $('#allhadir', el)?.addEventListener('click', () => $$('[data-k="status"]', el).forEach(s => s.value = 'hadir'));
    $('#save', el)?.addEventListener('click', async () => {
      const rows = emps.map(e2 => {
        const g = (k) => $(`[data-e="${e2.id}"][data-k="${k}"]`, el)?.value || null;
        return { employee_id: e2.id, status: g('status'), check_in: g('check_in'), check_out: g('check_out'),
          overtime_hours: Number(g('overtime_hours') || 0), note: g('note') };
      });
      try { const n = await rpc('attendance_save', { p_date: d, p_rows: rows }); toast(`Absensi ${n} karyawan disimpan.`); refresh(); }
      catch (err) { toast(errMsg(err), 'err'); }
    });
  },
});

// ---------------------------------------------------------------------
route('advances', {
  title: 'Kasbon karyawan', perm: ['advances'],
  async render(el) {
    const lk = await lookups();
    const [rows, emps] = await Promise.all([
      q(sb.from('employee_advances').select('*, employees(full_name, no, branch_id)').order('requested_at', { ascending: false }).limit(200)),
      q(sb.from('employees').select('id, full_name, no').eq('status', 'active').order('full_name')),
    ]);
    const open = rows.filter(r => ['approved', 'paid'].includes(r.status));
    el.innerHTML = pageHead('Kasbon karyawan', 'Pinjaman yang dipotong otomatis dari gaji sesuai jumlah cicilan. Yang menyetujui bukan yang mencairkan.',
      can('advances', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Ajukan kasbon</button>` : '') +
      `<div class="metrics" style="margin-bottom:14px"><div class="metric"><div class="l">Kasbon beredar</div><div class="v">${fmt.rp(sum(open, 'remaining'))}</div></div>
        <div class="metric"><div class="l">Menunggu keputusan</div><div class="v">${rows.filter(r => r.status === 'pending').length}</div></div></div>` +
      table([
        { l: 'No', f: r => plate(r.no) },
        { l: 'Karyawan', f: r => `${esc(r.employees?.full_name)}<br><span class="small muted">${esc(r.employees?.no)}</span>` },
        { l: 'Nominal', cls: 'num', f: r => fmt.rp(r.amount) },
        { l: 'Cicilan', cls: 'num', f: r => `${r.installments}×<br><span class="small muted">${fmt.rp(r.amount / r.installments)}/bln</span>` },
        { l: 'Sisa', cls: 'num', f: r => fmt.rp(r.remaining) },
        { l: 'Alasan', f: r => `<span class="small">${esc(r.reason)}</span>` },
        { l: 'Status', f: r => chip(r.status === 'settled' ? 'ok' : r.status, { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak', paid: 'Sudah cair', settled: 'Lunas' }[r.status]) +
          (r.decide_note ? `<br><span class="small muted">${esc(r.decide_note)}</span>` : '') },
        { l: 'Bukti', f: r => fileBtn(r.proof_path, 'Bukti cair') },
        { l: '', f: r => `<div class="actions">${r.status === 'pending' && can('advances', 'a') ? '<button class="btn sm primary" data-ok>Setujui</button><button class="btn sm danger" data-no>Tolak</button>' : ''}${
          r.status === 'approved' && can('payables', 'e') ? '<button class="btn sm brass" data-pay>Cairkan</button>' : ''}</div>` },
      ], rows, { empty: 'Belum ada kasbon' });
    bindFiles(el);
    $('#new', el)?.addEventListener('click', async () => {
      await formModal({ title: 'Ajukan kasbon', intro: '<p class="small muted">Kasbon dipotong otomatis dari gaji. Satu karyawan hanya boleh punya satu kasbon berjalan.</p>',
        fields: [{ name: 'employee_id', label: 'Karyawan', type: 'select', required: true, options: emps.map(e => ({ value: e.id, label: `${e.full_name} (${e.no})` })) },
          { name: 'amount', label: 'Nominal (Rp)', type: 'number', required: true },
          { name: 'installments', label: 'Dipotong berapa kali', type: 'number', value: 1, min: 1, hint: 'Maksimal 24 kali.' },
          { name: 'reason', label: 'Alasan', type: 'textarea', required: true }],
        onSubmit: v => rpc('advance_create', { p: v }) });
      toast('Kasbon diajukan.'); changed(); refresh();
    });
    on(el, '[data-ok],[data-no]', 'click', async (e, b) => {
      const r = rows[+b.closest('tr').dataset.i];
      const ok = b.hasAttribute('data-ok');
      const n = await ask(ok ? 'Setujui kasbon' : 'Tolak kasbon', `${esc(r.employees?.full_name)} — ${fmt.rp(r.amount)}, ${r.installments}× potong.`,
        { okLabel: ok ? 'Setujui' : 'Tolak', danger: !ok, minLen: 5 });
      if (!n) return;
      try { await rpc('advance_decide', { p_id: r.id, p_approve: ok, p_note: n }); toast('Tersimpan.'); changed(); refresh(); }
      catch (err) { toast(errMsg(err), 'err'); }
    });
    on(el, '[data-pay]', 'click', async (e, b) => {
      const r = rows[+b.closest('tr').dataset.i];
      await formModal({ title: `Cairkan kasbon ${fmt.rp(r.amount)}`,
        fields: [{ name: 'method', label: 'Cara pencairan', type: 'select', required: true, options: [{ value: 'bank', label: 'Transfer bank' }, { value: 'cash', label: 'Tunai dari kas cabang' }] },
          { name: 'bank', label: 'Rekening perusahaan', type: 'select', options: lk.banks.filter(x => x.active && x.kind !== 'marketplace').map(x => ({ value: x.id, label: `${x.bank_name} ${x.account_no}` })) },
          { name: 'proof', label: 'Bukti pencairan', type: 'file', required: true }],
        onSubmit: async v => rpc('advance_pay', { p_id: r.id, p_method: v.method, p_bank: v.bank || null, p_proof: await upl(v.proof, 'kasbon') }) });
      toast('Kasbon dicairkan.'); refresh();
    });
  },
});

// ---------------------------------------------------------------------
route('charges', {
  title: 'Pembebanan kerugian', perm: () => can('employees', 'edit') || can('payroll'),
  async render(el) {
    const lk = await lookups();
    const [rows, cands, emps] = await Promise.all([
      q(sb.from('employee_charges').select('*, employees(full_name, no)').order('created_at', { ascending: false }).limit(200)),
      rpc('charge_candidates', { p_branch: S.branch || null }).catch(() => []),
      q(sb.from('employees').select('id, full_name, no, profile_id').eq('status', 'active').order('full_name')),
    ]);
    el.innerHTML = pageHead('Pembebanan kerugian ke karyawan',
      'Selisih kas, scrap, dan retur yang sudah ditetapkan penanggung jawabnya muncul di sini sebagai usulan. Setiap pembebanan harus disetujui dan dipotong bertahap — potongan gaji dibatasi ' + (setting('max_deduction_pct') || 50) + '% dari gaji bruto.') +
      (cands.length ? `<section class="panel" style="margin-bottom:14px"><div class="ph"><h2>Usulan dari dokumen yang sudah ada</h2><span class="badge">${cands.length}</span></div><div class="pb" data-cand></div></section>` : '') +
      table([
        { l: 'No', f: r => plate(r.no) },
        { l: 'Karyawan', f: r => `${esc(r.employees?.full_name)}<br><span class="small muted">${esc(r.employees?.no)}</span>` },
        { l: 'Sumber', f: r => `${({ cash_diff: 'Selisih kas', scrap: 'Scrap produksi', return: 'Retur', transfer_diff: 'Selisih transfer', stock_loss: 'Kehilangan stok', lainnya: 'Lainnya' })[r.source_type]}${r.source_no ? `<br><span class="small muted">${esc(r.source_no)}</span>` : ''}` },
        { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.amount) },
        { l: 'Cicilan', cls: 'num', f: r => `${r.installments}×` },
        { l: 'Sisa', cls: 'num', f: r => fmt.rp(r.remaining) },
        { l: 'Alasan', f: r => `<span class="small">${esc(r.reason)}</span>` },
        { l: 'Status', f: r => chip(r.status === 'settled' ? 'ok' : r.status, { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak', settled: 'Lunas' }[r.status]) +
          (r.decide_note ? `<br><span class="small muted">${esc(r.decide_note)}</span>` : '') },
        { l: '', f: r => r.status === 'pending' && can('payroll', 'a') ? '<div class="actions"><button class="btn sm primary" data-ok>Setujui</button><button class="btn sm danger" data-no>Tolak</button></div>' : '' },
      ], rows, { empty: 'Belum ada pembebanan' });
    const cd = $('[data-cand]', el);
    if (cd) {
      cd.innerHTML = table([
        { l: 'Dokumen', f: r => plate(r.source_no) }, { l: 'Waktu', f: r => fmt.date(r.at) },
        { l: 'Kejadian', f: r => `<span class="small">${esc(r.reason)}</span>` },
        { l: 'Orang', f: r => esc(r.profile_id ? uname(lk, r.profile_id) : (r.party || '—')) },
        { l: 'Nilai', cls: 'num', f: r => fmt.rp(r.amount) },
        { l: '', f: () => can('employees', 'e') ? '<button class="btn sm" data-use>Jadikan pembebanan</button>' : '' },
      ], cands, { empty: 'Tidak ada usulan' });
      on(cd, '[data-use]', 'click', async (e, b) => {
        const c = cands[+b.closest('tr').dataset.i];
        const guess = emps.find(x => x.profile_id && x.profile_id === c.profile_id)
          || emps.find(x => c.party && x.full_name.toLowerCase().includes(String(c.party).toLowerCase().split(' ')[0]));
        await formModal({ title: 'Bebankan ke karyawan', size: 'wide',
          intro: `<p class="note small">${esc(c.reason)}</p><p class="small muted">Pastikan sudah dibicarakan dengan yang bersangkutan. Karyawan bisa melihat potongan ini di slip gajinya beserta alasannya.</p>`,
          fields: [{ name: 'employee_id', label: 'Karyawan', type: 'select', required: true, value: guess?.id, options: emps.map(x => ({ value: x.id, label: `${x.full_name} (${x.no})` })) },
            { name: 'amount', label: 'Nilai dibebankan (Rp)', type: 'number', required: true, value: Math.round(Number(c.amount)), hint: 'Boleh lebih kecil dari nilai kerugian, misalnya dibagi bersama.' },
            { name: 'installments', label: 'Dipotong berapa kali', type: 'number', value: 1, min: 1 },
            { name: 'reason', label: 'Alasan', type: 'textarea', required: true, value: c.reason }],
          onSubmit: v => rpc('charge_create', { p: { ...v, source_type: c.source_type, source_id: c.source_id, source_no: c.source_no } }) });
        toast('Pembebanan diajukan.'); changed(); refresh();
      });
    }
    on(el, '[data-ok],[data-no]', 'click', async (e, b) => {
      const r = rows[+b.closest('tr').dataset.i];
      const ok = b.hasAttribute('data-ok');
      const n = await ask(ok ? 'Setujui pembebanan' : 'Tolak pembebanan',
        `${esc(r.employees?.full_name)} — ${fmt.rp(r.amount)}. ${ok ? 'Akan dipotong dari gaji sesuai cicilan.' : ''}`,
        { okLabel: ok ? 'Setujui' : 'Tolak', danger: !ok, minLen: 5, label: 'Dasar keputusan' });
      if (!n) return;
      try { await rpc('charge_decide', { p_id: r.id, p_approve: ok, p_note: n }); toast('Tersimpan.'); changed(); refresh(); }
      catch (err) { toast(errMsg(err), 'err'); }
    });
  },
});

// ---------------------------------------------------------------------
route('payroll', {
  title: 'Penggajian', perm: ['payroll'],
  async render(el, params) {
    const lk = await lookups();
    if (params.id) return payrollDetail(el, params.id, lk);
    const rows = await q(sb.from('payroll_periods').select('*').order('period_month', { ascending: false }).limit(60));
    el.innerHTML = pageHead('Penggajian', 'Gaji dihitung dari data yang sudah ada: absensi, jam lembur, unit yang lulus QC, dan laba pesanan. Penyusun daftar gaji tidak boleh menyetujui atau mencairkan sendiri.',
      can('payroll', 'c') ? `<button class="btn primary" id="new">${ICON.plus} Buat periode gaji</button><a class="btn" href="#/charges">Pembebanan kerugian</a>` : '') +
      table([
        { l: 'No', f: r => plate(r.no) },
        { l: 'Periode', f: r => monthLabel(String(r.period_month).slice(0, 7)) },
        { l: 'Cabang', f: r => r.branch_id ? esc(lk.br[r.branch_id]?.name) : 'Semua cabang' },
        { l: 'Orang', cls: 'num', k: 'employees_count' },
        { l: 'Bruto', cls: 'num', f: r => fmt.rp(r.gross_total) },
        { l: 'Potongan', cls: 'num', f: r => fmt.rp(r.deduction_total) },
        { l: 'Dibayar', cls: 'num', f: r => `<b>${fmt.rp(r.net_total)}</b>` },
        { l: 'Status', f: r => chip(r.status === 'paid' ? 'ok' : r.status === 'approved' ? 'info' : r.status === 'submitted' ? 'warn' : '',
          { draft: 'Draft', submitted: 'Menunggu approval', approved: 'Disetujui', paid: 'Sudah dibayar', cancelled: 'Batal' }[r.status]) },
      ], rows, { click: true, empty: 'Belum ada periode gaji' });
    bindRows(el, rows, r => go('payroll', { id: r.id }));
    $('#new', el)?.addEventListener('click', async () => {
      const last = new Date(); last.setDate(0);
      await formModal({ title: 'Buat periode penggajian',
        intro: '<p class="small muted">Sistem menarik absensi, lembur, unit produksi, komisi, kasbon, dan pembebanan yang sudah disetujui pada periode tersebut.</p>',
        fields: [{ name: 'month', label: 'Bulan gaji', type: 'text', required: true, value: last.toISOString().slice(0, 7), hint: 'Format: YYYY-MM' },
          { name: 'branch', label: 'Cabang', type: 'select', options: lk.branches.map(b => ({ value: b.id, label: b.name })), hint: 'Kosongkan untuk menggaji semua cabang sekaligus.' }],
        onSubmit: async v => { const id = await rpc('payroll_create', { p_month: v.month + '-01', p_branch: v.branch || null }); go('payroll', { id }); } });
    });
  },
});

async function payrollDetail(el, id, lk) {
  const [pp, lines, comps] = await Promise.all([
    q(sb.from('payroll_periods').select('*').eq('id', id).single()),
    q(sb.from('v_payslip').select('*').eq('period_id', id).order('full_name')),
    components(),
  ]);
  const items = await q(sb.from('payroll_items').select('*').in('line_id', lines.map(l => l.line_id).length ? lines.map(l => l.line_id) : ['00000000-0000-0000-0000-000000000000']));
  const draft = ['draft', 'submitted'].includes(pp.status);
  const acts = [];
  if (pp.status === 'draft' && can('payroll', 'e')) acts.push(['recalc', 'Hitung ulang', ''], ['submit', 'Ajukan approval', 'primary']);
  if (pp.status === 'submitted' && can('payroll', 'a')) acts.push(['ok', 'Setujui', 'primary'], ['no', 'Kembalikan ke draft', 'danger']);
  if (pp.status === 'approved' && can('payables', 'e')) acts.push(['pay', 'Catat pembayaran gaji', 'brass']);
  acts.push(['slips', 'Cetak semua slip', ''], ['csv', 'Unduh CSV bank', '']);
  el.innerHTML = `<p><a href="#/payroll">← Semua periode</a></p>` +
    pageHead(monthLabel(String(pp.period_month).slice(0, 7)),
      `${plate(pp.no, 'lg')} ${chip(pp.status === 'paid' ? 'ok' : pp.status === 'approved' ? 'info' : pp.status === 'submitted' ? 'warn' : '', { draft: 'Draft', submitted: 'Menunggu approval', approved: 'Disetujui', paid: 'Sudah dibayar' }[pp.status])} · ${pp.branch_id ? esc(lk.br[pp.branch_id]?.name) : 'Semua cabang'}`,
      acts.map(([k, l, c]) => `<button class="btn ${c}" data-a="${k}">${esc(l)}</button>`).join('')) +
    `<div class="metrics" style="margin-bottom:14px">
      <div class="metric"><div class="l">Karyawan</div><div class="v">${pp.employees_count}</div></div>
      <div class="metric"><div class="l">Gaji bruto</div><div class="v">${fmt.rp(pp.gross_total)}</div></div>
      <div class="metric"><div class="l">Total potongan</div><div class="v">${fmt.rp(pp.deduction_total)}</div></div>
      <div class="metric"><div class="l">Dibayarkan</div><div class="v">${fmt.rp(pp.net_total)}</div></div></div>` +
    (pp.approve_note ? `<p class="note small">Catatan approval: ${esc(pp.approve_note)}</p>` : '') +
    table([
      { l: 'Karyawan', f: r => `<b>${esc(r.full_name)}</b><br><span class="small muted">${esc(r.employee_no)} · ${esc(r.position || '')}</span>` },
      { l: 'Hadir', cls: 'num', f: r => `${r.days_present}${r.days_absent ? `<br><span class="small" style="color:var(--danger)">alpa ${r.days_absent}</span>` : ''}` },
      { l: 'Lembur', cls: 'num', f: r => r.overtime_hours ? fmt.n(r.overtime_hours) + ' jam' : '—' },
      { l: 'Unit produksi', cls: 'num', f: r => r.units_produced ? fmt.n(r.units_produced) : '—' },
      { l: 'Laba penjualannya', cls: 'num', f: r => r.sales_profit ? fmt.rp(r.sales_profit) : '—' },
      { l: 'Bruto', cls: 'num', f: r => fmt.rp(r.gross), foot: rs => fmt.rp(sum(rs, 'gross')) },
      { l: 'Potongan', cls: 'num', f: r => fmt.rp(r.deductions), foot: rs => fmt.rp(sum(rs, 'deductions')) },
      { l: 'Diterima', cls: 'num', f: r => `<b>${fmt.rp(r.net)}</b>`, foot: rs => fmt.rp(sum(rs, 'net')) },
      { l: '', f: () => '<button class="btn sm" data-slip>Rincian</button>' },
    ], lines, { cards: false, empty: 'Tidak ada karyawan pada periode ini', rowCls: r => r.note ? 'warn' : '' });

  const slip = (r) => {
    const its = items.filter(i => i.line_id === r.line_id);
    const nm = (c) => comps.find(x => x.code === c)?.name || c;
    return `<div class="grid g2"><dl class="kv"><dt>Karyawan</dt><dd>${esc(r.full_name)} (${esc(r.employee_no)})</dd>
      <dt>Periode</dt><dd>${monthLabel(String(pp.period_month).slice(0, 7))}</dd>
      <dt>Hari hadir</dt><dd>${r.days_present} hari${r.days_absent ? `, alpa ${r.days_absent} hari` : ''}</dd>
      <dt>Lembur</dt><dd>${fmt.n(r.overtime_hours)} jam</dd>
      ${r.units_produced ? `<dt>Unit lulus QC</dt><dd>${fmt.n(r.units_produced)}</dd>` : ''}
      ${r.sales_profit ? `<dt>Laba pesanannya</dt><dd>${fmt.rp(r.sales_profit)}</dd>` : ''}
      <dt>Rekening</dt><dd>${esc(r.bank_name || '—')} ${esc(r.bank_account_no || '')}</dd></dl></div>
      <h3 style="margin-top:12px">Penambah</h3>
      ${table([{ l: 'Komponen', f: i => nm(i.component_code) }, { l: 'Dasar', f: i => i.qty !== null ? `${fmt.n(i.qty)} × ${fmt.rp(i.rate)}` : '—' },
        { l: 'Jumlah', cls: 'num', f: i => fmt.rp(i.amount), foot: is => fmt.rp(sum(is, 'amount')) }], its.filter(i => i.kind === 'earning'), { cards: false, empty: '—' })}
      <h3 style="margin-top:12px">Potongan</h3>
      ${table([{ l: 'Komponen', f: i => nm(i.component_code) }, { l: 'Keterangan', f: i => esc(i.note || '') },
        { l: 'Jumlah', cls: 'num', f: i => fmt.rp(i.amount), foot: is => fmt.rp(sum(is, 'amount')) }], its.filter(i => i.kind === 'deduction'), { cards: false, empty: 'Tidak ada potongan' })}
      <p style="margin-top:12px;font-size:1.2rem"><b>Diterima: ${fmt.rp(r.net)}</b></p>
      ${r.note ? `<p class="note warn small">${esc(r.note)}</p>` : ''}`;
  };
  on(el, '[data-slip]', 'click', (e, b) => {
    const r = lines[+b.closest('tr').dataset.i];
    const extra = draft && can('payroll', 'e') ? [{ label: 'Tambah komponen manual', onClick: async () => {
      await formModal({ title: 'Komponen manual — ' + r.full_name,
        fields: [{ name: 'code', label: 'Komponen', type: 'select', required: true, options: comps.filter(c => c.calc === 'manual').map(c => ({ value: c.code, label: `${c.name} (${c.kind === 'earning' ? 'penambah' : 'potongan'})` })) },
          { name: 'amount', label: 'Nominal (Rp)', type: 'number', required: true }, { name: 'note', label: 'Keterangan' }],
        onSubmit: v => rpc('payroll_item_set', { p_line: r.line_id, p_code: v.code, p_amount: v.amount, p_note: v.note }) });
      toast('Tersimpan.'); refresh(); return false;
    } }] : [];
    modal({ title: 'Rincian gaji', size: 'wide', body: slip(r), actions: [...extra, { label: 'Cetak', onClick: () => { printSlip(r, slip(r), pp); return false; } }, { label: 'Tutup' }] });
  });

  on(el, '[data-a]', 'click', async (e, b) => {
    const a = b.dataset.a;
    try {
      if (a === 'recalc') { await rpc('payroll_recalc', { p_id: id }); toast('Dihitung ulang.'); return refresh(); }
      if (a === 'submit') { await rpc('payroll_submit', { p_id: id }); toast('Diajukan ke atasan.'); changed(); return refresh(); }
      if (a === 'ok' || a === 'no') {
        const n = await ask(a === 'ok' ? 'Setujui daftar gaji' : 'Kembalikan ke draft',
          a === 'ok' ? `Total dibayarkan ${fmt.rp(pp.net_total)} untuk ${pp.employees_count} orang. Jurnal beban gaji akan dibukukan.` : 'Daftar gaji dikembalikan ke penyusun untuk diperbaiki.',
          { okLabel: a === 'ok' ? 'Setujui' : 'Kembalikan', danger: a === 'no', minLen: 5 });
        if (!n) return;
        await rpc('payroll_decide', { p_id: id, p_approve: a === 'ok', p_note: n });
        toast('Tersimpan.'); changed(); return refresh();
      }
      if (a === 'pay') {
        await formModal({ title: 'Catat pembayaran gaji ' + fmt.rp(pp.net_total),
          fields: [{ name: 'method', label: 'Cara pembayaran', type: 'select', required: true, options: [{ value: 'bank', label: 'Transfer bank' }, { value: 'cash', label: 'Tunai' }] },
            { name: 'bank', label: 'Rekening perusahaan', type: 'select', options: lk.banks.filter(x => x.active && x.kind !== 'marketplace').map(x => ({ value: x.id, label: `${x.bank_name} ${x.account_no}` })) },
            { name: 'proof', label: 'Bukti transfer / daftar terima', type: 'file', required: true }],
          onSubmit: async v => rpc('payroll_pay', { p_id: id, p_method: v.method, p_bank: v.bank || null, p_proof: await upl(v.proof, 'gaji') }) });
        toast('Pembayaran gaji dicatat.'); changed(); return refresh();
      }
      if (a === 'csv') return downloadCSV('transfer-gaji-' + String(pp.period_month).slice(0, 7), lines,
        [{ l: 'Nama', k: 'full_name' }, { l: 'Bank', k: 'bank_name' }, { l: 'No rekening', k: 'bank_account_no' }, { l: 'Nominal', k: 'net' }]);
      if (a === 'slips') {
        printHTML(lines.map(r => `<div style="page-break-after:always">
          <h1>SLIP GAJI</h1><p>${esc(setting('company_name') || 'Kertajaya Piala')} — ${monthLabel(String(pp.period_month).slice(0, 7))}</p>
          <div class="box"><b>${esc(r.full_name)}</b> (${esc(r.employee_no)})<br>${esc(r.position || '')}</div>
          ${slipPrintTable(items.filter(i => i.line_id === r.line_id), comps, r)}</div>`).join(''), { title: 'Slip gaji' });
        return;
      }
    } catch (err) { toast(errMsg(err), 'err'); }
  });
}

function slipPrintTable(its, comps, r) {
  const nm = (c) => comps.find(x => x.code === c)?.name || c;
  const rowsE = its.filter(i => i.kind === 'earning').map(i => `<tr><td>${esc(nm(i.component_code))}</td><td class="r">${fmt.rp(i.amount)}</td></tr>`).join('');
  const rowsD = its.filter(i => i.kind === 'deduction').map(i => `<tr><td>${esc(nm(i.component_code))}${i.note ? ` <span class="muted">(${esc(i.note)})</span>` : ''}</td><td class="r">${fmt.rp(i.amount)}</td></tr>`).join('');
  return `<table style="margin-top:8px"><tr><th colspan="2">Penambah</th></tr>${rowsE}
    <tr><th colspan="2">Potongan</th></tr>${rowsD || '<tr><td colspan="2">Tidak ada</td></tr>'}
    <tr><td><b>Diterima</b></td><td class="r"><b>${fmt.rp(r.net)}</b></td></tr></table>
    <p class="muted">Hari hadir ${r.days_present}${r.days_absent ? `, alpa ${r.days_absent}` : ''}, lembur ${fmt.n(r.overtime_hours)} jam.
    Pertanyaan mengenai potongan bisa disampaikan ke bagian SDM.</p>`;
}
function printSlip(r, html, pp) {
  printHTML(`<h1>SLIP GAJI</h1><p>${esc(setting('company_name') || 'Kertajaya Piala')} — ${monthLabel(String(pp.period_month).slice(0, 7))}</p>` +
    html.replace(/<button[^>]*>.*?<\/button>/g, ''), { title: 'Slip gaji ' + r.full_name });
}

// ---------------------------------------------------------------------
route('my-payslip', {
  title: 'Slip gaji saya',
  async render(el) {
    const emp = await q(sb.from('employees').select('*').eq('profile_id', S.me.id).maybeSingle());
    if (!emp) { el.innerHTML = pageHead('Slip gaji saya') + emptyBox('Data kepegawaian Anda belum terdaftar', 'Hubungi bagian SDM.'); return; }
    const [lines, comps, adv, chg] = await Promise.all([
      q(sb.from('v_payslip').select('*').eq('employee_id', emp.id).order('period_month', { ascending: false })),
      components(),
      q(sb.from('employee_advances').select('*').eq('employee_id', emp.id).in('status', ['approved', 'paid'])),
      q(sb.from('employee_charges').select('*').eq('employee_id', emp.id).eq('status', 'approved')),
    ]);
    const paid = lines.filter(l => ['approved', 'paid'].includes(l.status));
    const items = paid.length ? await q(sb.from('payroll_items').select('*').in('line_id', paid.map(l => l.line_id))) : [];
    const nm = (c) => comps.find(x => x.code === c)?.name || c;
    el.innerHTML = pageHead('Slip gaji saya', `${esc(emp.full_name)} · ${esc(emp.position || '')} · NIK ${esc(emp.no)}`) +
      ((adv.length || chg.length) ? `<div class="metrics" style="margin-bottom:14px">
        ${adv.length ? `<div class="metric"><div class="l">Sisa kasbon</div><div class="v">${fmt.rp(sum(adv, 'remaining'))}</div></div>` : ''}
        ${chg.length ? `<div class="metric"><div class="l">Sisa pembebanan</div><div class="v">${fmt.rp(sum(chg, 'remaining'))}</div></div>` : ''}</div>` : '') +
      (paid.length ? paid.map(r => {
        const its = items.filter(i => i.line_id === r.line_id);
        return `<section class="panel" style="margin-bottom:12px"><div class="ph"><h2>${monthLabel(String(r.period_month).slice(0, 7))}</h2>
          ${chip(r.status === 'paid' ? 'ok' : 'info', r.status === 'paid' ? 'Sudah dibayar' : 'Disetujui')}<span style="flex:1"></span>
          <b>${fmt.rp(r.net)}</b></div><div class="pb">
          <p class="small muted">Hadir ${r.days_present} hari${r.days_absent ? `, alpa ${r.days_absent} hari` : ''}, lembur ${fmt.n(r.overtime_hours)} jam${r.units_produced ? `, ${fmt.n(r.units_produced)} unit lulus QC` : ''}.</p>
          ${table([{ l: 'Komponen', f: i => nm(i.component_code) + (i.note ? ` <span class="small muted">(${esc(i.note)})</span>` : '') },
            { l: 'Jenis', f: i => i.kind === 'earning' ? 'Penambah' : 'Potongan' },
            { l: 'Jumlah', cls: 'num', f: i => (i.kind === 'deduction' ? '−' : '') + fmt.rp(i.amount) }], its, { cards: false })}
          ${r.note ? `<p class="note warn small" style="margin-top:8px">${esc(r.note)}</p>` : ''}
          <p class="small muted" style="margin-top:8px">Ada potongan yang tidak Anda mengerti? Setiap potongan wajib punya alasan tertulis — tanyakan ke bagian SDM.</p></div></section>`;
      }).join('') : emptyBox('Belum ada slip gaji', 'Slip muncul setelah penggajian disetujui.'));
  },
});

// ---------------------------------------------------------------------
route('hr-report', {
  title: 'Laporan SDM', perm: ['payroll'],
  async render(el, params) {
    const lk = await lookups();
    const from = params.from || new Date(Date.now() - 180 * 86400e3).toISOString().slice(0, 8) + '01';
    const to = params.to || today();
    const d = await rpc('rpt_hr', { p_branch: S.branch || null, p_from: from, p_to: to });
    const att = d.absensi_30hr || [];
    const tot = sum(att, 'n') || 1;
    el.innerHTML = pageHead('Laporan SDM', 'Biaya orang dan disiplin kehadiran, berdampingan dengan hasil kerjanya.') +
      `<form class="filters" id="flt"><input type="date" name="from" value="${from}"><input type="date" name="to" value="${to}"><button class="btn">Terapkan</button></form>
      <div class="metrics" style="margin-bottom:14px">
        <div class="metric"><div class="l">Karyawan aktif</div><div class="v">${d.headcount}</div></div>
        <div class="metric"><div class="l">Biaya gaji periode ini</div><div class="v">${fmt.rp(d.biaya_gaji)}</div></div>
        <div class="metric"><div class="l">Kasbon beredar</div><div class="v">${fmt.rp(d.kasbon_beredar)}</div></div>
        <div class="metric"><div class="l">Pembebanan belum lunas</div><div class="v">${fmt.rp(d.tanggung_jawab_beredar)}</div></div></div>
      <div class="cols"><section class="panel"><div class="ph"><h2>Per cabang</h2></div><div class="pb">${table([
        { l: 'Cabang', k: 'name' }, { l: 'Orang', cls: 'num', k: 'orang' },
        { l: 'Bruto', cls: 'num', f: r => fmt.rp(r.bruto) }, { l: 'Potongan', cls: 'num', f: r => fmt.rp(r.potongan) },
        { l: 'Dibayar', cls: 'num', f: r => fmt.rp(r.gaji), foot: rs => fmt.rp(sum(rs, 'gaji')) }], d.by_branch, { cards: false })}</div></section>
      <section class="panel"><div class="ph"><h2>Kehadiran 30 hari</h2></div><div class="pb">${
        att.length ? att.map(a => `<div class="wf-row"><span>${esc(ATT[a.status]?.[1] || a.status)}</span>
          <div class="bar-track"><div class="bar" style="width:${a.n / tot * 100}%"></div></div><span class="num">${a.n}</span></div>`).join('')
        : '<p class="muted">Belum ada data absensi.</p>'}</div></section></div>`;
    $('#flt', el).onsubmit = (e) => { e.preventDefault(); go('hr-report', Object.fromEntries(new FormData(e.target))); };
  },
});
