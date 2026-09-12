// Pengumuman internal + isi panel lonceng notifikasi
import { sb, S, q, rpc, can, esc, fmt, route, pageHead, table, bindRows, lookups, uname, plate, chip, toast, errMsg, go, refresh,
  modal, formModal, ask, on, $, $$, h, ICON, changed, emptyBox, today, tabs } from '../core.js';

const LEVEL = { info: ['info', 'Info'], penting: ['warn', 'Penting'], darurat: ['danger', 'Darurat'] };

export function announceCard(a, { compact = false } = {}) {
  const [cls, lbl] = LEVEL[a.level] || LEVEL.info;
  return `<article class="note ${cls === 'info' ? '' : cls}" data-ann="${a.id}" style="display:block">
    <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">
      <b>${esc(a.title)}</b>${a.pinned ? '<span class="chip dark">disematkan</span>' : ''}
      <span class="chip ${cls}">${lbl}</span>${a.read ? '' : '<span class="chip warn">baru</span>'}
      <span class="grow" style="flex:1"></span><span class="small muted">${fmt.date(a.created_at)}</span></div>
    <div class="small" style="white-space:pre-wrap;margin-top:6px">${esc(compact ? String(a.body).slice(0, 160) + (a.body.length > 160 ? '…' : '') : a.body)}</div>
    ${a.require_ack && !a.acknowledged ? '<div class="actions" style="margin-top:8px"><button class="btn sm primary" data-ack="' + a.id + '">Saya sudah membaca</button></div>' : ''}
    ${a.require_ack && a.acknowledged ? '<div class="small muted" style="margin-top:6px">✓ Sudah Anda konfirmasi</div>' : ''}
  </article>`;
}

export function bindAnnounce(root, after) {
  on(root, '[data-ack]', 'click', async (e, b) => {
    e.stopPropagation();
    try { await rpc('announcement_read', { p_id: b.dataset.ack, p_ack: true }); toast('Terima kasih, sudah dicatat.'); changed(); after?.(); }
    catch (err) { toast(errMsg(err), 'err'); }
  });
}

// ---------------------------------------------------------------------
route('announcements', {
  title: 'Pengumuman',
  async render(el, params) {
    const lk = await lookups();
    const mine = await rpc('my_announcements', { p_all: true });
    const manage = can('announcements', 'c');
    const tab = params.t || 'mine';
    el.innerHTML = pageHead('Pengumuman', 'Kabar internal untuk seluruh tim. Pengumuman penting bisa meminta konfirmasi bahwa Anda sudah membacanya.',
      manage ? `<button class="btn primary" id="new">${ICON.plus} Pengumuman baru</button>` : '') +
      (manage ? tabs([{ k: 'mine', l: 'Untuk saya' }, { k: 'all', l: 'Kelola semua' }], tab) : '') +
      '<div id="body"></div>';
    const body = $('#body', el);
    on(el, '[data-tab]', 'click', (e, b) => go('announcements', { t: b.dataset.tab }));

    if (tab === 'all' && manage) {
      const rows = await q(sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(200));
      body.innerHTML = table([
        { l: 'No', f: r => plate(r.no) },
        { l: 'Judul', f: r => `<b>${esc(r.title)}</b>${r.pinned ? ' <span class="chip dark">sematan</span>' : ''}<br><span class="small muted">${esc(String(r.body).slice(0, 80))}…</span>` },
        { l: 'Tingkat', f: r => chip(LEVEL[r.level][0], LEVEL[r.level][1]) },
        { l: 'Sasaran', f: r => (r.audience_roles.length ? r.audience_roles.map(x => esc(lk.roles.find(z => z.code === x)?.name || x)).join(', ') : 'Semua jabatan') +
          (r.audience_branches.length ? '<br><span class="small muted">' + r.audience_branches.map(x => esc(lk.br[x]?.name)).join(', ') + '</span>' : '') },
        { l: 'Berlaku', f: r => `${fmt.date(r.starts_at)}${r.ends_at ? ' – ' + fmt.date(r.ends_at) : ''}` },
        { l: 'Status', f: r => chip(r.status === 'published' ? 'ok' : r.status === 'draft' ? '' : 'info', { published: 'Terbit', draft: 'Draft', archived: 'Diarsipkan' }[r.status]) },
        { l: 'Dibuat', f: r => `${esc(uname(lk, r.created_by))}<br><span class="small muted">${fmt.date(r.created_at)}</span>` },
        { l: '', f: () => '<div class="actions"><button class="btn sm" data-edit>Ubah</button><button class="btn sm ghost" data-stat>Siapa membaca</button></div>' },
      ], rows, { empty: 'Belum ada pengumuman' });
      on(body, '[data-edit]', 'click', (e, b) => annForm(rows[+b.closest('tr').dataset.i], lk));
      on(body, '[data-stat]', 'click', async (e, b) => {
        const r = rows[+b.closest('tr').dataset.i];
        const st = await rpc('announcement_stats', { p_id: r.id });
        modal({ title: 'Pembaca: ' + r.title, size: 'wide',
          body: `<p>Dibaca <b>${st.dibaca}</b> orang${r.require_ack ? `, dikonfirmasi <b>${st.konfirmasi}</b>` : ''}.</p>` +
            table([{ l: 'Nama', k: 'nama' }, { l: 'Waktu', f: x => fmt.dt(x.waktu) }, { l: 'Konfirmasi', f: x => x.ack ? '✓' : '—' }], st.daftar, { empty: 'Belum ada yang membaca' }) });
      });
    } else {
      body.innerHTML = mine.length ? `<div class="stack">${mine.map(a => announceCard(a)).join('')}</div>`
        : emptyBox('Belum ada pengumuman', 'Kabar dari manajemen akan muncul di sini.');
      bindAnnounce(body, () => refresh());
      // tandai terbaca
      for (const a of mine.filter(x => !x.read)) rpc('announcement_read', { p_id: a.id, p_ack: false }).catch(() => {});
      if (mine.some(x => !x.read)) changed();
    }
    $('#new', el)?.addEventListener('click', () => annForm(null, lk));
  },
});

async function annForm(a, lk) {
  const body = h(`<div class="stack">
    <label class="f req"><span>Judul</span><input data-title value="${esc(a?.title || '')}"></label>
    <label class="f req"><span>Isi pengumuman</span><textarea data-body rows="8" placeholder="Tulis jelas: apa yang berubah, mulai kapan, dan siapa yang perlu melakukan apa.">${esc(a?.body || '')}</textarea></label>
    <div class="grid g3">
      <label class="f"><span>Tingkat</span><select data-level>${Object.entries(LEVEL).map(([k, v]) => `<option value="${k}" ${a?.level === k ? 'selected' : ''}>${v[1]}</option>`).join('')}</select></label>
      <label class="f"><span>Mulai tampil</span><input type="date" data-start value="${esc(a?.starts_at || today())}"></label>
      <label class="f"><span>Berhenti tampil</span><input type="date" data-end value="${esc(a?.ends_at || '')}"></label>
    </div>
    <div class="grid g2">
      <label class="chk"><input type="checkbox" data-pin ${a?.pinned ? 'checked' : ''}> Sematkan (selalu tampil walau sudah dibaca)</label>
      <label class="chk"><input type="checkbox" data-ack ${a?.require_ack ? 'checked' : ''}> Minta konfirmasi "sudah dibaca"</label>
    </div>
    <div><h3>Ditujukan untuk jabatan</h3><p class="small muted">Kosongkan semua = seluruh karyawan.</p>
      <div class="grid g3" style="margin-top:6px">${lk.roles.map(r => `<label class="chk"><input type="checkbox" data-role="${r.code}" ${a?.audience_roles?.includes(r.code) ? 'checked' : ''}> ${esc(r.name)}</label>`).join('')}</div></div>
    <div><h3>Dibatasi cabang</h3><div class="grid g3" style="margin-top:6px">${lk.branches.map(b => `<label class="chk"><input type="checkbox" data-br="${b.id}" ${a?.audience_branches?.includes(b.id) ? 'checked' : ''}> ${esc(b.name)}</label>`).join('')}</div></div>
    <label class="f"><span>Status</span><select data-status>${[['published', 'Terbitkan'], ['draft', 'Simpan sebagai draft'], ['archived', 'Arsipkan']].map(([k, l]) => `<option value="${k}" ${a?.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </div>`);
  modal({
    title: a ? 'Ubah pengumuman' : 'Pengumuman baru', body, size: 'wide',
    actions: [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', onClick: async () => {
      await rpc('announcement_save', { p: {
        id: a?.id || null, title: $('[data-title]', body).value, body: $('[data-body]', body).value,
        level: $('[data-level]', body).value, starts_at: $('[data-start]', body).value, ends_at: $('[data-end]', body).value || null,
        pinned: $('[data-pin]', body).checked, require_ack: $('[data-ack]', body).checked, status: $('[data-status]', body).value,
        audience_roles: $$('[data-role]:checked', body).map(x => x.dataset.role),
        audience_branches: $$('[data-br]:checked', body).map(x => x.dataset.br),
      } });
      toast('Pengumuman tersimpan.'); changed(); refresh();
    } }],
  });
}

// ---------------------------------------------------------------------
//  Panel lonceng
// ---------------------------------------------------------------------
export async function notifPanel(anchorBtn) {
  const existing = $('.notif-panel');
  if (existing) { existing.remove(); return; }
  const panel = h(`<div class="notif-panel" role="dialog" aria-label="Notifikasi">
    <div class="nh"><b>Notifikasi</b><span class="grow" style="flex:1"></span><button class="btn ghost sm" data-close aria-label="Tutup">${ICON.x}</button></div>
    <div class="nb"><div class="spinner"></div></div></div>`);
  document.body.appendChild(panel);
  const r = anchorBtn.getBoundingClientRect();
  panel.style.top = (r.bottom + 6) + 'px';
  panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  const close = () => { panel.remove(); document.removeEventListener('click', outside, true); };
  const outside = (e) => { if (!panel.contains(e.target) && !anchorBtn.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('click', outside, true));
  on(panel, '[data-close]', 'click', close);

  try {
    const n = await rpc('rpt_notifications', { p_branch: S.branch || null });
    const sect = (title, items, render) => items.length ? `<div class="ns"><h3>${title}</h3>${items.map(render).join('')}</div>` : '';
    $('.nb', panel).innerHTML =
      sect('Menunggu tindakan Anda', n.todos, t => `<a class="nitem ${t.level}" href="${esc(t.link)}">${esc(t.title)}</a>`) +
      sect('Pengumuman', n.announcements, a => `<a class="nitem ${a.level === 'info' ? '' : 'warn'}" href="#/announcements"><b>${esc(a.title)}</b><br><span class="small muted">${esc(String(a.body).slice(0, 90))}…</span></a>`) +
      sect('Peringatan sistem', n.alerts.slice(0, 8), a => `<a class="nitem ${a.level === 'danger' ? 'danger' : 'warn'}" href="${esc(a.link)}"><b>${esc(a.title)}</b><br><span class="small muted">${esc(a.detail)}</span></a>`) +
      (n.unread ? `<div class="ns"><a class="btn sm" href="#/alerts">Lihat semua peringatan</a></div>`
        : emptyBox('Tidak ada notifikasi', 'Tidak ada yang menunggu Anda saat ini.'));
    on(panel, 'a', 'click', close);
    rpc('mark_notifications_seen').then(() => changed()).catch(() => {});
  } catch (e) {
    $('.nb', panel).innerHTML = `<p class="note danger">${esc(errMsg(e))}</p>`;
  }
}
