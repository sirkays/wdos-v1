import { el, esc, clear, debounce , personLabel, skeleton, renderMarkup }
  from '../core/dom.js';
import { t, fmtDate, fmtDateTime, fmtNumber } from '../core/i18n.js';
import {
  listTasks, createTask, setTaskStatus, listOrgUnits,
  listTaskComments, addTaskComment, searchMentionables,
  listChecklist, addChecklistItem, toggleChecklistItem,
  listTaskFiles, addTaskFile, taskFileUrl,
  listTaskTemplates, saveTaskTemplate, deleteTaskTemplate,
  searchAppointableMembers, getSession,
  resolveBulkRecipients, assignTaskBulk, taskBatchSummary, myTaskBatches, taskFollowupTracker,
  sendStaffMessage } from '../core/db.js';
import { renderShell } from '../components/layout.js';
import { toast, toastError } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';

const PAGE_SIZE = 25;
const BOARD_COLS = ['not_started', 'in_progress', 'awaiting_review',
  'completed'];
const STATUSES = ['not_started', 'in_progress', 'awaiting_review',
  'completed', 'cancelled'];
const FAMILY = {
  not_started: 'neutral', in_progress: 'pipeline',
  awaiting_review: 'paused', completed: 'active', cancelled: 'exited',
};
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export async function render(root, _params, ctx) {
  // Phase 89: activation evidence — the system saw this visit.
  import('../core/db.js').then(({ logJourneyEvent }) =>
    logJourneyEvent('tasks_checked'));

  const shell = renderShell(root, {
    profile: ctx.profile, modules: ctx.modules, titleKey: 'nav.tasks',
  });
  const out = shell.outlet;
  const session = await getSession();
  const myId = session.user.id;

  const state = { scope: 'mine', view: 'list', calBase: new Date(), status: '',
    page: 0, priority: '', overdueOnly: false, search: '', sort: 'due' };

  /* ---- scope tabs + filters ---- */
  const tabs = el('div', { class: 'row' });
  for (const scope of ['mine', 'assigned', 'followup', 'area']) {
    tabs.append(el('button', {
      class: 'btn btn--quiet', 'data-scope': scope,
      text: t(`tasks.scope_${scope}`),
      onclick: () => { state.scope = scope; state.page = 0; paint(); load(); },
    }));
  }
  const statusSel = el('select', {
    class: 'select', 'aria-label': t('members.anyStatus'),
    onchange: (e) => { state.status = e.target.value; state.page = 0; load(); },
  }, [
    el('option', { value: '', text: t('tasks.anyStatus') }),
    ...STATUSES.map((s) => el('option', { value: s, text: t(`taskstatus.${s}`) })),
  ]);
  const prioSel = el('select', { class: 'select',
    'aria-label': t('tasks.priority'),
    onchange: (e) => { state.priority = e.target.value; state.page = 0; load(); },
  }, [
    el('option', { value: '', text: t('tasks.anyPriority') }),
    ...['urgent', 'high', 'medium', 'low'].map((pv) =>
      el('option', { value: pv, text: t(`taskprio.${pv}`) })),
  ]);
  const sortSel = el('select', { class: 'select',
    'aria-label': t('tasks.sort'),
    onchange: (e) => { state.sort = e.target.value; state.page = 0; load(); },
  }, ['due', 'priority', 'newest'].map((sv) =>
    el('option', { value: sv, text: t(`tasks.sort_${sv}`) })));
  const overdueBox = el('label', { class: 'row',
    style: 'gap:6px;align-items:center;font-size:13px;cursor:pointer;' }, [
    el('input', { type: 'checkbox', onchange: (e) => {
      state.overdueOnly = e.target.checked; state.page = 0; load(); } }),
    el('span', { text: t('tasks.overdueOnly') }),
  ]);
  const searchIn = el('input', { class: 'input', type: 'search',
    placeholder: t('tasks.search'), style: 'max-width:200px;' });
  searchIn.addEventListener('input', debounce(() => {
    state.search = searchIn.value.trim(); state.page = 0; load(); }, 350));
  const newBtn = el('button', {
    class: 'btn btn--primary', text: t('tasks.new'),
    onclick: () => { formCard.hidden = !formCard.hidden; },
  });

  /* ---- create form ---- */
  const formCard = await buildForm();
  formCard.hidden = true;

  const views = el('div', { class: 'row' },
    ['list', 'board', 'cal'].map((v) => el('button', {
      class: 'btn btn--quiet', 'data-view': v,
      text: t(`tasks.view_${v}`),
      onclick: () => { state.view = v; paint(); load(); },
    })));

  const listArea = el('div');
  out.append(
    el('div', { class: 'toolbar' }, [tabs, views,
      el('span', { class: 'grow' }),
      searchIn, statusSel, prioSel, sortSel, overdueBox, newBtn]),
    formCard, listArea
  );
  paint();
  await load();
  return shell.teardown;

  function paint() {
    tabs.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('btn--secondary', b.dataset.scope === state.scope);
      b.classList.toggle('btn--quiet', b.dataset.scope !== state.scope);
    });
    views.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('btn--secondary', b.dataset.view === state.view);
      b.classList.toggle('btn--quiet', b.dataset.view !== state.view);
    });
  }

  async function load() {
    clear(listArea);
    if (state.scope === 'followup') { await loadFollowup(); return; }
    listArea.append(skeleton(6));
    try {
      const big = state.view !== 'list';
      const extra = {};
      if (state.view === 'cal') {
        const y = state.calBase.getFullYear();
        const mo = state.calBase.getMonth();
        extra.dueFrom = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
        extra.dueTo = new Date(Date.UTC(y, mo + 1, 0)).toISOString().slice(0, 10);
        extra.pageSize = 400;
      }
      const { rows, total } = await listTasks({ ...state,
        page: big ? 0 : state.page, pageSize: big ? 100 : PAGE_SIZE, ...extra });
      clear(listArea);
      if (state.scope === 'assigned') { try { listArea.append(await batchesCard()); } catch { /* batches are a bonus, not required */ } }
      if (state.view === 'board' && total > rows.length) {
        listArea.append(el('p', { class: 'muted',
          text: t('tasks.showingCap', { n: rows.length, total }) }));
      }
      if (rows.length === 0 && state.view !== 'cal') {
        listArea.append(el('div', { class: 'card state' }, [
          el('h3', { text: t('tasks.emptyTitle') }),
          el('p', { text: t('tasks.emptyHint') }),
        ]));
        return;
      }
      if (state.view === 'board') { listArea.append(board(rows)); return; }
      if (state.view === 'cal') { listArea.append(calendar(rows)); return; }
      const wrap = el('div', { class: 'card' });
      for (const task of rows) wrap.append(row(task));
      listArea.append(wrap, pager(total));
    } catch {
      clear(listArea);
      listArea.append(el('div', { class: 'card state' }, [
        el('h3', { text: t('errors.loadTitle') }),
        el('p', { text: t('errors.loadHint') }),
        el('button', { class: 'btn btn--quiet', text: t('app.retry'), onclick: load }),
      ]));
    }
  }

  /* ---- Bulk-assignment batches: one definition, individual accountability ---- */
  async function batchesCard() {
    const batches = await myTaskBatches();
    if (!batches.length) return el('div', {});
    const card = el('div', { class: 'card', style: 'margin-bottom:12px;' }, [
      el('h3', { text: t('tasks.myBatches') }),
    ]);
    for (const b of batches) {
      const line = el('div', { class: 'ca-attn', onclick: () => openBatch(b.id), style: 'cursor:pointer;' }, [
        el('div', { class: 'grow' }, [el('b', { text: b.title }), el('div', { class: 'muted', text: t('tasks.batchLine', { total: b.total, done: b.completed }) })]),
        b.overdue ? el('span', { class: 'vs-badge vs-badge--red', text: t('tasks.batchOverdue', { n: b.overdue }) }) : el('span', { class: 'vs-badge vs-badge--green', text: t('tasks.batchOnTrack') }),
      ]);
      card.append(line);
    }
    return card;
  }
  async function openBatch(id) {
    let s; try { s = await taskBatchSummary(id); } catch { toastError(t('errors.load')); return; }
    const c = s.counts || {};
    const body = el('div', {}, [
      el('div', { class: 'vs-mini' }, [
        miniStat(t('tasks.batchTotal'), c.total), miniStat(t('taskstatus.not_started'), c.not_started),
        miniStat(t('taskstatus.in_progress'), c.in_progress, 'amber'), miniStat(t('taskstatus.awaiting_review'), c.awaiting_review, 'amber'),
        miniStat(t('taskstatus.completed'), c.completed, 'green'), miniStat(t('tasks.overdueLabel'), c.overdue, c.overdue ? 'red' : ''),
      ]),
      el('div', { class: 'table-wrap', style: 'margin-top:10px;' }, [el('table', { class: 'vs-table' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: t('tasks.recipient') }), el('th', { text: t('v.country') }), el('th', { text: t('v.thStatus') }), el('th', { text: t('tasks.dueOn') })])]),
        el('tbody', {}, (s.assignments || []).map((a) => el('tr', {}, [el('td', { text: a.name }), el('td', { text: a.country || '' }),
          el('td', {}, [el('span', { class: `badge badge--${FAMILY[a.status]}`, text: t(`taskstatus.${a.status}`) })]),
          el('td', { text: a.due_on ? fmtDate(a.due_on) : '\u2014', style: a.overdue ? 'color:var(--danger);font-weight:700;' : '' })]))),
      ])]),
    ]);
    openModal(s.title || t('tasks.myBatches'), body);
  }
  function miniStat(l, v, tone) { return el('div', { class: `vs-mini__t ${tone ? 'vs-mini__t--' + tone : ''}` }, [el('b', { text: String(v ?? 0) }), el('small', { text: l })]); }

  /* ---- Follow-Up Tracker: generated from task data, nothing typed by hand ---- */
  async function loadFollowup() {
    listArea.append(skeleton(6));
    let f; try { f = await taskFollowupTracker(); } catch { clear(listArea); listArea.append(el('div', { class: 'card state' }, [el('h3', { text: t('errors.loadTitle') }), el('button', { class: 'btn btn--quiet', text: t('app.retry'), onclick: load })])); return; }
    clear(listArea);
    const sections = [
      ['needs_attention', 'tasks.ft_needsAttention', 'red'], ['due_soon', 'tasks.ft_dueSoon', 'amber'], ['overdue', 'tasks.ft_overdue', 'red'],
      ['returned', 'tasks.ft_returned', 'amber'], ['awaiting_my_approval', 'tasks.ft_awaitingApproval', 'amber'], ['no_activity', 'tasks.ft_noActivity', 'grey'],
    ];
    const grid = el('div', { class: 'vs-grid' });
    for (const [key, labelKey, tone] of sections) {
      const items = f[key] || [];
      const card = el('div', { class: 'card' }, [el('h3', { text: `${t(labelKey)} (${items.length})` })]);
      if (!items.length) card.append(el('p', { class: 'muted', text: t('tasks.ft_none') }));
      for (const it of items.slice(0, 15)) {
        card.append(el('a', { href: `#/tasks?open=${it.id}`, class: 'ca-attn' }, [
          el('span', { class: `vs-badge vs-badge--${tone}`, text: it.days_overdue ? t('tasks.overdueDays', { n: it.days_overdue }) : (it.due_on ? fmtDate(it.due_on) : '') }),
          el('div', { class: 'grow' }, [el('b', { text: it.title }), el('div', { class: 'muted', text: it.who })]),
        ]));
      }
      grid.append(card);
    }
    listArea.append(grid);
  }

  function row(task) {
    const overdue = task.due_on
      && ['not_started', 'in_progress', 'awaiting_review'].includes(task.status)
      && new Date(task.due_on + 'T23:59:59') < new Date();
    const line = el('div', {
      class: 'row',
      style: 'padding:12px 0;border-bottom:1px solid var(--line);align-items:flex-start;',
    });
    line.classList.add(`task--p-${task.priority}`);
    const info = el('div', { class: 'grow' });
    info.innerHTML = `
      <strong>${esc(task.title)}</strong>
      ${task.requires_approval
        ? ` <span class="badge badge--paused">${esc(t('tasks.needsApproval'))}</span>` : ''}
      <span class="badge badge--${FAMILY[task.status]}">
        ${esc(t(`taskstatus.${task.status}`))}</span><br>
      <span class="muted">
        ${esc(t(`taskprio.${task.priority}`))}
        ${(task.tags || []).map((tg) =>
          `<span class="tagchip">${esc(tg)}</span>`).join('')}
        · ${esc(t('tasks.for', { name:
            personLabel(task.assignee) }))}
        · ${esc(t('tasks.by', { name:
            personLabel(task.assigner) }))}
        ${task.due_on ? ' · ' + (overdue
          ? `<strong style="color:var(--danger)">${esc(t('tasks.overdue',
              { d: fmtDate(task.due_on) }))}</strong>`
          : esc(t('tasks.due', { d: fmtDate(task.due_on) }))) : ''}
      </span>
      ${task.details ? `<p class="muted" style="margin:6px 0 0;">${esc(task.details)}</p>` : ''}`;
    const right = el('div');
    right.append(actions(task), commentsToggle(task));
    line.append(info, right);
    return line;
  }

  function actions(task) {
    const box = el('div', { class: 'row' });
    const isAssignee = task.assigned_to === myId;
    const isAssigner = task.assigned_by === myId;
    const add = (label, status, kind = 'btn--quiet') =>
      box.append(el('button', {
        class: `btn ${kind}`, text: label,
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            await setTaskStatus(task.id, status);
            toast(t('tasks.updated'));
            load();
          } catch (err) { toastError(mapError(err)); e.target.disabled = false; }
        },
      }));

    switch (task.status) {
      case 'not_started':
        if (isAssignee) add(t('tasks.start'), 'in_progress', 'btn--primary');
        if (isAssigner || !isAssignee) add(t('tasks.cancel'), 'cancelled', 'btn--danger');
        break;
      case 'in_progress':
        if (isAssignee && task.requires_approval)
          add(t('tasks.submit'), 'awaiting_review', 'btn--primary');
        if (!task.requires_approval || !isAssignee || isAssigner)
          add(t('tasks.complete'), 'completed', 'btn--secondary');
        if (isAssigner || !isAssignee) add(t('tasks.cancel'), 'cancelled', 'btn--danger');
        break;
      case 'awaiting_review':
        add(t('tasks.approveDone'), 'completed', 'btn--secondary');
        add(t('tasks.sendBack'), 'in_progress');
        break;
      case 'completed':
        add(t('tasks.reopen'), 'in_progress');
        break;
      case 'cancelled':
        add(t('tasks.reopen'), 'not_started');
        break;
    }
    return box;
  }

  function pager(total) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return el('div', { class: 'row mt-4' }, [
      el('span', { class: 'muted grow',
        text: t('tasks.count', { n: fmtNumber(total) }) }),
      el('button', { class: 'btn btn--quiet', text: t('app.prev'),
        disabled: state.page === 0 || null,
        onclick: () => { state.page -= 1; load(); } }),
      el('span', { class: 'muted', text: `${state.page + 1} / ${pages}` }),
      el('button', { class: 'btn btn--quiet', text: t('app.next'),
        disabled: state.page >= pages - 1 || null,
        onclick: () => { state.page += 1; load(); } }),
    ]);
  }

  /* ---- create form ---- */
  async function buildForm() {
    let units = [];
    let templates = [];
    try { units = await listOrgUnits(); } catch { /* handled on submit */ }
    try { templates = await listTaskTemplates(); } catch { /* optional */ }

    const title = el('input', { class: 'input', placeholder: t('tasks.titlePH'), maxlength: '160' });
    const details = el('textarea', { class: 'input', placeholder: t('tasks.detailsPH'), rows: '3', maxlength: '4000' });
    const search = el('input', { class: 'input', type: 'search',
      placeholder: t('org.searchMember') });
    const who = el('select', { class: 'select', size: '3' }, [
      el('option', { value: myId, selected: true, text: t('tasks.myself') }),
    ]);
    async function loadWho(q) {
      const rows = await searchAppointableMembers(q);
      clear(who);
      who.append(el('option', { value: myId, selected: true,
        text: t('tasks.myself') }));
      for (const r of rows) {
        who.append(el('option', { value: r.id,
          text: `${r.first_name} ${r.last_name} — ${r.email}` }));
      }
      if (!rows.length && q) {
        who.append(el('option', { disabled: true,
          text: t('tasks.nooneFound') }));
      }
    }
    let preloaded = false;
    search.addEventListener('focus', () => {
      if (preloaded) return;
      preloaded = true;
      loadWho('').catch(() => { preloaded = false; });
    });
    search.addEventListener('input', debounce(async () => {
      try { await loadWho(search.value.trim()); }
      catch { toastError(t('errors.load')); }
    }));
    const unitSel = el('select', { class: 'select' },
      units.map((u) => el('option', { value: u.id,
        text: `${t(`org.${u.level}`)} — ${u.name}` })));
    const prio = el('select', { class: 'select' },
      PRIORITIES.map((p) => el('option', { value: p,
        selected: p === 'medium' || null, text: t(`taskprio.${p}`) })));
    const due = el('input', { class: 'input', type: 'date' });
    const tagsIn = el('input', { class: 'input', type: 'text',
      placeholder: t('tasks.tagsPh') });
    const approval = el('input', { type: 'checkbox', id: 'req-approval' });

    // Phase 174: completion requirements — what has to exist before a task
    // can be marked done. None checked = a plain "mark as done" task.
    const reqResponse = el('input', { type: 'checkbox' });
    const reqEvidence = el('input', { type: 'checkbox' });
    const reqDocument = el('input', { type: 'checkbox' });
    const completionField = el('div', { class: 'field' }, [
      el('label', { class: 'field__label', text: t('tasks.completionLabel') }),
      el('div', { class: 'row', style: 'gap:14px;flex-wrap:wrap;' }, [
        el('label', { class: 'row', style: 'gap:6px;align-items:center;' }, [reqResponse, el('span', { text: t('tasks.completionResponse') })]),
        el('label', { class: 'row', style: 'gap:6px;align-items:center;' }, [reqEvidence, el('span', { text: t('tasks.completionEvidence') })]),
        el('label', { class: 'row', style: 'gap:6px;align-items:center;' }, [reqDocument, el('span', { text: t('tasks.completionDocument') })]),
      ]),
      el('p', { class: 'muted', style: 'font-size:11px;margin:4px 0 0;', text: t('tasks.completionHint') }),
    ]);

    // Phase 174: "Assign to many" — a level and network resolve into a list
    // of people; every one gets her own tracked task under one batch.
    const bulkToggle = el('input', { type: 'checkbox' });
    const ROLES = ['country_rep', 'deputy_country_rep', 'state_coordinator', 'assistant_state_coordinator', 'district_coordinator', 'assistant_district_coordinator', 'cluster_coordinator', 'assistant_cluster_coordinator', 'chapter_lead', 'assistant_chapter_lead'];
    const bulkRole = el('select', { class: 'select' }, [el('option', { value: '', text: t('tasks.bulkAnyRole') }), ...ROLES.map((r) => el('option', { value: r, text: t('role.' + r) }))]);
    const bulkNet = el('select', { class: 'select' }, [el('option', { value: 'all', text: t('ca.allNetworks') }), el('option', { value: 'WGMN', text: 'WGMN' }), el('option', { value: 'WNNN', text: 'WNNN' })]);
    const bulkCountry = el('input', { class: 'input', placeholder: t('v.country') });
    const bulkPreviewBtn = el('button', { class: 'btn btn--secondary', type: 'button', text: t('tasks.bulkPreview') });
    const bulkResult = el('div', { class: 'muted', style: 'margin-top:6px;font-size:12px;' });
    let bulkRecipients = [];
    bulkPreviewBtn.addEventListener('click', async () => {
      bulkResult.textContent = t('tasks.bulkChecking');
      try {
        bulkRecipients = await resolveBulkRecipients(bulkRole.value || null, bulkNet.value, bulkCountry.value.trim() || null, unitSel.value || null);
        bulkResult.textContent = bulkRecipients.length ? t('tasks.bulkFound', { n: bulkRecipients.length, list: bulkRecipients.slice(0, 6).map((r) => r.name).join(', ') + (bulkRecipients.length > 6 ? '…' : '') }) : t('tasks.bulkNoneFound');
      } catch { bulkResult.textContent = t('errors.load'); }
    });
    const bulkPanel = el('div', { class: 'field', hidden: true }, [
      el('label', { class: 'field__label', text: t('tasks.bulkWho') }),
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' }, [bulkRole, bulkNet, bulkCountry, bulkPreviewBtn]),
      bulkResult,
      el('p', { class: 'muted', style: 'font-size:11px;margin:4px 0 0;', text: t('tasks.bulkHint') }),
    ]);
    const bulkField = el('div', { class: 'field' }, [
      el('label', { class: 'row', style: 'gap:6px;align-items:center;cursor:pointer;' }, [bulkToggle, el('span', { text: t('tasks.bulkToggle') })]),
    ]);
    bulkToggle.addEventListener('change', () => {
      bulkPanel.hidden = !bulkToggle.checked;
      singleWho.hidden = bulkToggle.checked;
      bulkRecipients = [];
    });
    const singleWho = fieldWrap(t('org.searchMember'), search, who);

    /* --- templates: pick to prefill; save current shape for reuse --- */
    const tplOption = (x) => el('option', { value: x.id,
      text: x.name + (x.is_shared ? ' \u2014 ' + t('tpl.shared') : '') });
    const tplSel = el('select', { class: 'select' }, [
      el('option', { value: '', text: t('tpl.pick') }),
      ...templates.map(tplOption),
    ]);
    tplSel.addEventListener('change', () => {
      const x = templates.find((v) => v.id === tplSel.value);
      if (!x) return;
      title.value = x.title;
      details.value = x.details ?? '';
      prio.value = x.priority;
      tagsIn.value = (x.tags || []).join(', ');
      approval.checked = x.requires_approval;
      toast(t('tpl.applied', { name: x.name }));
    });
    const tplDel = el('button', { class: 'btn btn--quiet', type: 'button',
      text: t('tpl.delete'),
      onclick: async () => {
        const x = templates.find((v) => v.id === tplSel.value);
        if (!x) { toastError(t('tpl.errPick')); return; }
        try {
          await deleteTaskTemplate(x.id);
          templates = templates.filter((v) => v.id !== x.id);
          tplSel.querySelector('option[value="' + x.id + '"]')?.remove();
          tplSel.value = '';
          toast(t('tpl.deleted'));
        } catch { toastError(t('tpl.errDelete')); }
      } });
    const tplName = el('input', { class: 'input', maxlength: '80',
      placeholder: t('tpl.nameHint') });
    const tplSave = el('button', { class: 'btn btn--quiet', type: 'button',
      text: t('tpl.save'),
      onclick: async () => {
        if (tplName.value.trim().length < 2) {
          toastError(t('tpl.errName')); return;
        }
        if (title.value.trim().length < 3) {
          toastError(t('tasks.errTitle')); return;
        }
        try {
          await saveTaskTemplate({
            name: tplName.value.trim(),
            title: title.value.trim(),
            details: details.value.trim(),
            priority: prio.value,
            requires_approval: approval.checked,
            tags: tagsIn.value.split(',').map((x) => x.trim().toLowerCase())
              .filter(Boolean).slice(0, 6),
          });
          templates = await listTaskTemplates();
          clear(tplSel);
          tplSel.append(
            el('option', { value: '', text: t('tpl.pick') }),
            ...templates.map(tplOption));
          tplName.value = '';
          toast(t('tpl.saved'));
        } catch (e2) {
          toastError(String(e2?.message ?? '').includes('is_shared')
            ? t('tpl.errShared') : t('errors.save'));
        }
      } });

    const err = el('p', { class: 'field__error', role: 'alert', hidden: true });
    const submit = el('button', { class: 'btn btn--primary', type: 'submit',
      text: t('tasks.create') });

    const form = el('form', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      const prevLabel = submit.textContent;
      submit.textContent = t('tasks.creating');
      if (title.value.trim().length < 3) {
        err.textContent = t('tasks.errTitle'); err.hidden = false; return;
      }
      if (!unitSel.value) {
        err.textContent = t('errors.load'); err.hidden = false; return;
      }
      err.hidden = true;
      submit.disabled = true;
      try {
        const completionReqs = [reqResponse.checked && 'submit_response', reqEvidence.checked && 'upload_evidence', reqDocument.checked && 'upload_document'].filter(Boolean);
        if (bulkToggle.checked) {
          if (!bulkRecipients.length) { err.textContent = t('tasks.bulkErrNone'); err.hidden = false; return; }
          const res = await assignTaskBulk({
            title: title.value.trim(), details: details.value.trim(), priority: prio.value,
            requiresApproval: approval.checked, dueOn: due.value || null, completionRequirements: completionReqs,
            recipients: bulkRecipients.map((r) => ({ id: r.id })),
          });
          toast(t('tasks.bulkCreated', { n: res.assigned }));
        } else {
          await createTask({
            title: title.value.trim(),
            details: details.value.trim(),
            org_unit_id: unitSel.value,
            assigned_to: who.value || myId,
            priority: prio.value,
            requires_approval: approval.checked,
            due_on: due.value,
            completion_requirements: completionReqs,
            tags: tagsIn.value.split(',').map((x) => x.trim().toLowerCase())
              .filter(Boolean).slice(0, 6),
          });
          toast(t('tasks.created'));
        }
        form.reset();
        formCard.hidden = true;
        bulkPanel.hidden = true; singleWho.hidden = false; bulkRecipients = [];
        load();
      } catch (e2) {
        submit.disabled = false;
        submit.textContent = prevLabel;
        err.textContent = mapError(e2);
        err.hidden = false;
      } finally { submit.disabled = false; }
    } }, [
      el('div', { class: 'row mb-4' }, [tplSel, tplDel,
        el('span', { class: 'grow' }), tplName, tplSave]),
      el('div', { class: 'form-grid' }, [
        fieldWrap(t('tasks.title'), title),
        fieldWrap(t('tasks.priority'), prio),
        fieldWrap(t('tasks.tags'), tagsIn),
        singleWho,
        fieldWrap(t('members.orgUnit'), unitSel),
        fieldWrap(t('tasks.dueOn'), due),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'req-approval',
            text: t('tasks.requiresApproval') }),
          el('div', { class: 'row' }, [approval,
            el('span', { class: 'muted', text: t('tasks.requiresApprovalHint') })]),
        ]),
        completionField,
      ]),
      bulkField, bulkPanel,
      fieldWrap(t('tasks.details'), details),
      err,
      el('div', { class: 'row' }, [el('span', { class: 'grow' }), submit]),
    ]);
    return el('div', { class: 'card mb-4' }, [
      el('div', { class: 'card__head' }, [el('h2', { text: t('tasks.new') })]),
      form,
    ]);
  }


  /* ================= board view ================= */
  function board(rows) {
    const grid = el('div', { class: 'kanban' });
    for (const col of BOARD_COLS) {
      const colEl = el('div', { class: 'kanban__col' }, [
        el('div', { class: 'kanban__head',
          text: `${t(`taskstatus.${col}`)} (${rows.filter((x) =>
            x.status === col).length})` }),
      ]);
      colEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        colEl.classList.add('kanban__col--over');
      });
      colEl.addEventListener('dragleave', () =>
        colEl.classList.remove('kanban__col--over'));
      colEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        colEl.classList.remove('kanban__col--over');
        const id = e.dataTransfer.getData('text/task');
        const from = e.dataTransfer.getData('text/status');
        if (!id || from === col) return;
        try {
          await setTaskStatus(id, col);
          toast(t('tasks.updated'));
        } catch (err) { toastError(mapError(err)); }
        load();
      });
      for (const task of rows.filter((x) => x.status === col)) {
        // priority colour bar on kanban cards too
        const card = el('div', { class: 'kcard', draggable: 'true' });
        card.classList.add(`task--p-${task.priority}`);
        card.innerHTML = `<strong>${esc(task.title)}</strong><br>
          <span class="muted">${esc(t(`taskprio.${task.priority}`))}
          · ${esc(personLabel(task.assignee))}
          ${task.due_on ? ' · ' + esc(fmtDate(task.due_on)) : ''}</span>`;
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/task', task.id);
          e.dataTransfer.setData('text/status', task.status);
        });
        card.append(commentsToggle(task));
        colEl.append(card);
      }
      grid.append(colEl);
    }
    return grid;
  }

  /* ================= calendar view ================= */
  function calendar(rows) {
    const base = state.calBase;
    const y = base.getFullYear(); const mo = base.getMonth();
    const first = new Date(y, mo, 1);
    const pad = (first.getDay() + 6) % 7;           // Monday-first
    const days = new Date(y, mo + 1, 0).getDate();
    const wrap = el('div', { class: 'card' });
    wrap.append(el('div', { class: 'row mb-4' }, [
      el('button', { class: 'btn btn--quiet', text: '\u2190',
        'aria-label': t('tasks.calPrev'),
        onclick: () => { state.calBase = new Date(y, mo - 1, 1); load(); } }),
      el('strong', { class: 'grow', style: 'text-align:center;',
        text: base.toLocaleDateString(undefined,
          { month: 'long', year: 'numeric' }) }),
      el('button', { class: 'btn btn--quiet', text: '\u2192',
        'aria-label': t('tasks.calNext'),
        onclick: () => { state.calBase = new Date(y, mo + 1, 1); load(); } }),
    ]));
    const grid = el('div', { class: 'cal' });
    for (let i = 0; i < pad; i += 1) {
      grid.append(el('div', { class: 'cal__day cal__day--pad' }));
    }
    for (let d = 1; d <= days; d += 1) {
      const iso = `${y}-${String(mo + 1).padStart(2, '0')}-` +
        String(d).padStart(2, '0');
      const cell = el('div', { class: 'cal__day' }, [
        el('span', { class: 'cal__date', text: String(d) })]);
      for (const task of rows.filter((x) => x.due_on === iso)) {
        cell.append(el('span', { class: 'cal__item', title: task.title,
          text: task.title }));
      }
      grid.append(cell);
    }
    wrap.append(grid);
    const undated = rows.filter((x) => !x.due_on).length;
    if (undated > 0) {
      wrap.append(el('p', { class: 'muted mt-4',
        text: t('tasks.calUndated', { n: fmtNumber(undated) }) }));
    }
    return wrap;
  }

  /* ================= comments ================= */
  function commentsToggle(task) {
    const holder = el('div');
    const btn = el('button', { class: 'btn btn--quiet',
      style: 'min-height:28px;padding:2px 10px;margin-top:6px;',
      text: '\u22EF ' + t('tasks.details'),
      onclick: () => {
        if (holder.childElementCount > 1) {
          holder.lastElementChild.remove();
        } else {
          holder.append(commentsDrawer(task));
        }
      } });
    holder.append(btn);
    return holder;
  }

  function commentsDrawer(task) {
    const box = el('div', { class: 'task-drawer' });
    box.append(el('div', { class: 'spinner' }));
    (async () => {
      let comments;
      try { comments = await listTaskComments(task.id); }
      catch {
        box.replaceChildren(el('p', { class: 'field__error',
          text: t('errors.load') }));
        return;
      }
      box.replaceChildren();

      /* ---- private message to the assignee (staff messaging) ---- */
      if (task.assigned_to && task.assigned_to !== myId) {
        const msgWrap = el('div', { class: 'card', style: 'padding:10px;margin-bottom:10px;' });
        const ta = el('textarea', { class: 'input', rows: '2',
          placeholder: t('tasks.msgPlaceholder'), hidden: true,
          style: 'margin-top:8px;width:100%;' });
        const send = el('button', { class: 'btn btn--primary', hidden: true,
          style: 'margin-top:6px;', text: t('tasks.msgSend') });
        const toggle = el('button', { class: 'btn btn--quiet',
          text: t('tasks.msgAssignee'),
          onclick: () => { ta.hidden = !ta.hidden; send.hidden = ta.hidden;
            if (!ta.hidden) ta.focus(); } });
        send.addEventListener('click', async () => {
          const v = ta.value.trim();
          if (v.length < 2) return;
          send.disabled = true;
          try {
            await sendStaffMessage(task.assigned_to,
              `[${t('tasks.task')}: ${task.title}]\n${v}`);
            ta.value = ''; ta.hidden = true; send.hidden = true;
            toast(t('tasks.msgSent'));
          } catch { toastError(t('tasks.msgFailed')); }
          finally { send.disabled = false; }
        });
        msgWrap.append(toggle, ta, send);
        box.append(msgWrap);
      }

      /* ---- checklist ---- */
      let items = [];
      try { items = await listChecklist(task.id); } catch { /* optional */ }
      const doneCount = items.filter((x) => x.done).length;
      box.append(el('strong', { text: t('tasks.checklist', {
        done: fmtNumber(doneCount), total: fmtNumber(items.length) }) }));
      for (const it of items) {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = it.done;
        cb.addEventListener('change', async () => {
          cb.disabled = true;
          try { await toggleChecklistItem(it.id, cb.checked); }
          catch { cb.checked = !cb.checked; toastError(t('errors.save')); }
          cb.disabled = false;
        });
        box.append(el('p', { style: 'margin:3px 0;' }, [cb, ' ', it.label]));
      }
      const newItem = el('input', { class: 'input', maxlength: '200',
        placeholder: t('tasks.checklistHint'), style: 'max-width:340px;' });
      box.append(el('div', { class: 'row mb-4' }, [newItem,
        el('button', { class: 'btn btn--quiet', text: t('tasks.addItem'),
          onclick: async (e) => {
            if (!newItem.value.trim()) return;
            e.target.disabled = true;
            try {
              await addChecklistItem(task.id, newItem.value.trim());
              box.replaceWith(commentsDrawer(task));
            } catch { toastError(t('errors.save'));
              e.target.disabled = false; }
          } })]));

      /* ---- files ---- */
      let files = [];
      try { files = await listTaskFiles(task.id); } catch { /* optional */ }
      box.append(el('strong', { text: t('tasks.files', {
        n: fmtNumber(files.length) }) }));
      for (const f of files) {
        let url = '';
        try { url = await taskFileUrl(f.path); } catch { continue; }
        if (/\.(png|jpe?g|gif|webp)$/i.test(f.name)) {
          box.append(el('a', { href: url, target: '_blank', rel: 'noopener',
            style: 'display:inline-block;margin:4px 6px 0 0;' }, [
            el('img', { src: url, alt: f.name,
              style: 'max-width:120px;border-radius:8px;' +
                'border:1px solid var(--line);' })]));
        } else {
          box.append(el('a', { href: url, target: '_blank', rel: 'noopener',
            style: 'display:block;margin-top:4px;',
            text: '\u{1F4CE} ' + f.name }));
        }
      }
      const fileIn = el('input', { type: 'file', hidden: true });
      fileIn.addEventListener('change', async () => {
        const f = fileIn.files[0];
        if (!f) return;
        try {
          await addTaskFile(task.id, f);
          toast(t('tasks.fileAdded'));
          box.replaceWith(commentsDrawer(task));
        } catch { toastError(t('errors.save')); }
      });
      box.append(el('div', { class: 'row mb-4' }, [
        el('button', { class: 'btn btn--quiet', text: t('tasks.attach'),
          onclick: () => fileIn.click() }), fileIn]));

      /* ---- comments ---- */
      box.append(el('strong', { text: t('tasks.comments') }));
      if (comments.length === 0) {
        box.append(el('p', { class: 'muted', text: t('tasks.noComments') }));
      }
      for (const c of comments) {
        const bubble = el('div', { class: 'cmt' });
        bubble.append(
          el('div', { class: 'cmt__meta' }, [
            el('strong', { text: personLabel(c.author) }),
            el('span', { class: 'muted', text: fmtDateTime(c.created_at) }),
          ]));
        const bodyEl = el('div', { class: 'cmt__body' });
        bodyEl.innerHTML = renderMarkup(c.body);
        bubble.append(bodyEl);
        box.append(bubble);
      }
      const input = el('textarea', { class: 'input', rows: '2',
        maxlength: '2000', placeholder: t('tasks.commentHint') });
      const wrapSel = (mark) => {
        const a = input.selectionStart, b = input.selectionEnd;
        const selTxt = input.value.slice(a, b) || t('hq.msgFmtSample');
        input.value = input.value.slice(0, a) + mark + selTxt + mark +
          input.value.slice(b);
        input.focus();
      };
      const cFile = el('input', { type: 'file', hidden: true });
      const cTag = el('span', { class: 'muted' });
      cFile.addEventListener('change', () => {
        cTag.textContent = cFile.files[0]
          ? '\u{1F4CE} ' + cFile.files[0].name : '';
      });
      const cToolbar = el('div', { class: 'row' }, [
        el('button', { class: 'btn btn--quiet', type: 'button', text: 'B',
          style: 'font-weight:800;min-height:30px;padding:2px 12px;',
          onclick: () => wrapSel('**') }),
        el('button', { class: 'btn btn--quiet', type: 'button', text: 'I',
          style: 'font-style:italic;min-height:30px;padding:2px 12px;',
          onclick: () => wrapSel('*') }),
        el('button', { class: 'btn btn--quiet', type: 'button',
          text: '\u{1F4CE}', style: 'min-height:30px;padding:2px 12px;',
          'aria-label': t('hq.msgAttach'),
          onclick: () => cFile.click() }),
        cTag, cFile,
      ]);
      const mentionSearch = el('input', { class: 'input', type: 'search',
        placeholder: t('tasks.mentionHint') });
      const mentionSel = el('select', { class: 'select', multiple: true,
        size: '3' });
      mentionSearch.addEventListener('input', debounce(async () => {
        try {
          const people = await searchMentionables(mentionSearch.value.trim());
          clear(mentionSel);
          for (const p of people) {
            mentionSel.append(el('option', { value: p.id,
              text: `${p.first_name} ${p.last_name}` }));
          }
        } catch { /* mention search is a garnish */ }
      }));
      box.append(input, cToolbar,
        el('div', { class: 'row mt-4' }, [mentionSearch, mentionSel]),
        el('div', { class: 'row mt-4' }, [
          el('span', { class: 'grow' }),
          el('button', { class: 'btn btn--secondary',
            text: t('tasks.addComment'),
            onclick: async (e) => {
              const file = cFile.files[0] ?? null;
              const text = input.value.trim()
                || (file ? '\u{1F4CE} ' + file.name : '');
              if (!text) return;
              e.target.disabled = true;
              const mentions = [...mentionSel.selectedOptions]
                .map((o) => o.value);
              try {
                if (file) await addTaskFile(task.id, file);
                await addTaskComment(task.id, text, mentions);
                toast(t('tasks.commentSent'));
                box.replaceWith(commentsDrawer(task));
              } catch {
                toastError(t('errors.save'));
                e.target.disabled = false;
              }
            } }),
        ]));
    })();
    return box;
  }

function fieldWrap(label, ...controls) {
  return el('div', { class: 'field' }, [
    el('label', { class: 'field__label', text: label }), ...controls,
  ]);
}

function mapError(err) {
  const m = String(err?.message ?? '');
  if (m.includes('requires approval')) return t('tasks.errApprovalGate');
  if (m.includes('cancel a task')) return t('tasks.errCancelAuth');
  if (m.includes('reopen a task')) return t('tasks.errReopenAuth');
  if (m.includes('edit task details')) return t('tasks.errEditAuth');
  if (m.includes('Invalid task transition')) return t('tasks.errTransition');
  if (m.includes('row-level security')) return t('tasks.errAssignScope');
  return t('errors.save');
}
}
