import {
  CATEGORY_LABELS,
  TAJIK_HOLIDAY_PRESETS,
  TAHLIL_SUBJECTS_BY_CLASS,
  getSubjectsForClassCode,
  roundTajikGrade,
  parseTahlilNumbers,
  computeTahlilScore,
  computePeriodDatesStatus,
  loadStudents,
  upsertStudents,
  deleteStudent,
  loadStudentUpdateRequests,
  submitStudentUpdateRequest,
  reviewStudentUpdateRequest,
  loadColleaguesDirectory,
  loadWorkloads,
  upsertWorkload,
  deleteWorkload,
  loadPayrollConfig,
  savePayrollConfig,
  computeMonthlyPayroll,
  loadQuarterGrades,
  saveQuarterGrades,
  computeGradeMetrics,
  loadAnalyticsSummary,
  resolvePhase2Context,
} from './phase2-store.mjs';
import { persistentStore } from './cabinet-runtime.mjs';
import { createCloudClient } from './cloud-client.mjs';
import { getCloudConfig } from './cloud-config.mjs';
import { smConfirm } from './sm-dialog.mjs';
import {
  canPositionManageUsers,
  canPositionVerifySchoolStaff,
  canPositionApproveStudentUpdates,
  formatPositionTitle,
} from './position-catalog.mjs';
import {
  parseStudentImportFile,
  buildStudentsCsv,
  buildSimpleDocxBytes,
  formatBirthDateDisplay,
} from './spreadsheet-import.mjs';
import {
  renderQualityRingSvg,
  renderQuarterBarsSvg,
  renderTerritoryBarsSvg,
} from './analytics-charts.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[ch]));

function downloadBlob(bytesOrText, mime, filename) {
  try {
    const blob = new Blob([bytesOrText], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 400);
  } catch {}
}

function getLang() {
  return document.documentElement.lang === 'ru' ? 'ru' : 'tg';
}

function txt(tg, ru) {
  return getLang() === 'ru' ? ru : tg;
}

function createPanel(article, id) {
  const sec = document.createElement('section');
  sec.id = id;
  sec.className = 'section sm-screen no-print';
  sec._dirtyIds = new Set();
  const markDirty = ev => {
    const t = ev.target;
    if (t && t.id && t.type !== 'file') sec._dirtyIds.add(t.id);
  };
  sec.addEventListener('input', markDirty);
  sec.addEventListener('change', markDirty);
  sec.addEventListener('submit', () => {
    sec._dirtyIds.clear();
  }, true);
  article.append(sec);
  return sec;
}

function escapeIdSelector(id) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(id)
    : String(id).replace(/([^\w-])/g, '\\$1');
}

function setPanelHtml(panel, html) {
  const dirty = panel._dirtyIds;
  const activeEl = panel.contains(document.activeElement) ? document.activeElement : null;
  const activeId = activeEl?.id || '';
  const selStart = typeof activeEl?.selectionStart === 'number' ? activeEl.selectionStart : null;
  const selEnd = typeof activeEl?.selectionEnd === 'number' ? activeEl.selectionEnd : null;
  const saved = new Map();
  if (dirty?.size || activeId) {
    const ids = new Set(dirty || []);
    if (activeId) ids.add(activeId);
    for (const elId of ids) {
      const el = panel.querySelector(`#${escapeIdSelector(elId)}`);
      if (!el || el.type === 'file') continue;
      saved.set(elId, el.type === 'checkbox' || el.type === 'radio'
        ? { checked: el.checked }
        : { value: el.value });
    }
  }
  panel.innerHTML = html;
  for (const [elId, st] of saved.entries()) {
    const el = panel.querySelector(`#${escapeIdSelector(elId)}`);
    if (!el) continue;
    if ('checked' in st) el.checked = st.checked;
    else if ('value' in st) el.value = st.value;
  }
  if (activeId) {
    const nextEl = panel.querySelector(`#${escapeIdSelector(activeId)}`);
    if (nextEl && typeof nextEl.focus === 'function') {
      try { nextEl.focus({ preventScroll: true }); } catch { nextEl.focus(); }
      if (selStart !== null && selEnd !== null && typeof nextEl.setSelectionRange === 'function') {
        try { nextEl.setSelectionRange(selStart, selEnd); } catch {}
      }
    }
  }
}

export function setupPhase2Panels(article, docs, school, views) {
  if (!article || !docs || !views) return;
  const cabinetId = article.dataset.cabinetId || '';
  const isAuthority = cabinetId.startsWith('office-') || cabinetId.startsWith('maorif-') || cabinetId.startsWith('raesat-');
  const isDirector = cabinetId === 'school-director';
  const isTeacher = cabinetId === 'school-teacher';
  const isAccountant = cabinetId === 'school-accountant';
  const isClassOrQuality = ['school-class-teacher', 'school-education-quality', 'school-academic-deputy', 'school-primary-deputy', 'school-director', 'school-teacher'].includes(cabinetId);
  const canStudents = !isAuthority && ['school-director', 'school-academic-deputy', 'school-primary-deputy', 'school-upbringing-deputy', 'school-records-clerk', 'school-class-teacher', 'school-education-quality', 'school-sozmon', 'school-girls-council-chair', 'school-psychologist', 'school-teacher'].includes(cabinetId);
  const canWorkload = !isAuthority && ['school-teacher', 'school-director', 'school-academic-deputy', 'school-primary-deputy', 'school-accountant'].includes(cabinetId);
  const canPayroll = isAccountant || isDirector;
  const canGrades = isClassOrQuality;
  const canAnalytics = isAuthority || ['school-director', 'school-education-quality', 'school-academic-deputy', 'school-primary-deputy', 'school-class-teacher'].includes(cabinetId);
  const canUsers = true;

  const ctx = () => {
    const s = typeof school === 'function' ? school() : null;
    return resolvePhase2Context({
      cabinetId,
      organizationId: s?.id || '',
      organizationName: s?.name || '',
    });
  };

  function getAuthedCloudClient() {
    try {
      const cl = createCloudClient({
        config: getCloudConfig(persistentStore),
        storage: persistentStore,
        storageKey: 'smartmaktab.cloud.session.v1',
      });
      return cl?.session?.access_token ? cl : null;
    } catch {
      return null;
    }
  }

  function dbLockBannerHtml() {
    const c = ctx();
    if (!c.hasCloudSession || c.verified) return '';
    const msg = c.verificationStatus === 'rejected'
      ? txt('Дархости тасдиқи шумо рад шуд', 'Ваша заявка отклонена')
      : txt('Ҳисоби шумо верификатсия нашудааст', 'Аккаунт не верифицирован');
    return `
      <button type="button" class="sm-verif-wave-btn" data-open-account-verif="1" style="margin-bottom:8px;">
        <span style="line-height:1.35;">⚠️ ${esc(msg)}</span>
        <span class="sm-verif-pill">${esc(txt('Верификатсия', 'Верификация'))} →</span>
      </button>
    `;
  }

  article.addEventListener('click', ev => {
    if (ev.target?.closest?.('[data-open-account-verif]')) {
      document.dispatchEvent(new CustomEvent('sm:open-account-verification'));
    }
  });

  // Mount core module cards directly on the main home grid (#smMainModules)
  const navEntries = [];
  const moduleBadges = new Map();

  function setModuleBadge(panelId, count) {
    const b = moduleBadges.get(panelId);
    if (!b) return;
    const n = Number(count) || 0;
    if (n > 0) {
      b.textContent = String(n);
      b.hidden = false;
    } else {
      b.textContent = '';
      b.hidden = true;
    }
  }

  function emitNotificationsSnapshot(extra = {}) {
    try {
      document.dispatchEvent(new CustomEvent('sm:notifications-updated', { detail: extra }));
    } catch {}
  }

  function registerModule(panelId, icon, labelTg, labelRu, descTg, descRu) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'sm-module-card';
    tile.dataset.openPhase2 = panelId;
    const spIcon = document.createElement('span');
    spIcon.className = 'sm-mod-icon';
    spIcon.setAttribute('aria-hidden', 'true');
    spIcon.textContent = icon;
    const body = document.createElement('span');
    body.className = 'sm-mod-body';
    const st = document.createElement('strong');
    const sm = document.createElement('small');
    body.append(st, sm);
    const badge = document.createElement('span');
    badge.className = 'sm-mod-badge';
    badge.hidden = true;
    moduleBadges.set(panelId, badge);
    tile.append(spIcon, body, badge);
    tile.addEventListener('click', () => {
      views.open(panelId, tile);
      refreshPanelById(panelId);
    });
    docs.append(tile);
    navEntries.push({ panelId, icon, labelTg, labelRu, descTg, descRu, st, sm });
  }

  // Allow bell popover or other UI triggers to open a panel & specific subtab
  document.addEventListener('sm:open-phase2-panel', ev => {
    const { panelId, subtab } = ev.detail || {};
    if (!panelId) return;
    const tile = docs.querySelector(`[data-open-phase2="${panelId}"]`);
    views.open(panelId, tile || undefined);
    if (panelId === 'smStudentsPanel' && subtab) {
      studentsTabMode = subtab;
    }
    refreshPanelById(panelId);
  });

  // ============================================================================
  // PANEL 1: STUDENTS REGISTRY + CLASS BUTTONS + SMART IMPORT + UPDATE REQUESTS
  // ============================================================================
  let studentsTabMode = 'list';
  let renderStudents = () => {};
  if (canStudents) {
    const panel = createPanel(article, 'smStudentsPanel');
    registerModule(
      'smStudentsPanel',
      '👥',
      'Феҳристи хонандагон',
      'Реестр учеников',
      'Интихоби синф, санаи таваллуд, воридоти рӯйхат ва тасдиқи дархостҳо',
      'Выбор класса, дата рождения, импорт списков и согласование заявок',
    );

    let state = { rows: [], requests: [], classFilter: '', statusMsg: '', defaultClass: '5А' };
    let stuSeq = 0;
    let stuInFlight = 0;

    renderStudents = async ({ refresh = true } = {}) => {
      if (!refresh && stuInFlight > 0) return;
      if (refresh) {
        const mySeq = ++stuSeq;
        stuInFlight += 1;
        try {
          const [loaded, reqs] = await Promise.all([loadStudents(ctx()), loadStudentUpdateRequests(ctx())]);
          if (mySeq !== stuSeq) return;
          state.rows = loaded;
          state.requests = Array.isArray(reqs) ? reqs : [];
        } finally {
          stuInFlight = Math.max(0, stuInFlight - 1);
        }
      }
      const c = ctx();
      const l = getLang();
      const canApprove = c.canApproveStudentUpdates;
      const pendingReqs = state.requests.filter(r => r.status === 'pending');
      setModuleBadge('smStudentsPanel', canApprove ? pendingReqs.length : 0);
      emitNotificationsSnapshot({ studentRequests: canApprove ? pendingReqs : [] });

      const classes = [...new Set(state.rows.map(r => String(r.class_code || '').toUpperCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const filtered = state.classFilter
        ? state.rows.filter(r => String(r.class_code || '').toUpperCase() === state.classFilter)
        : state.rows;
      const boys = filtered.filter(r => r.gender === 'male').length;
      const girls = filtered.filter(r => r.gender === 'female').length;

      const listHtml = `
        <div class="sm-p2-kpis">
          <div class="sm-p2-kpi"><span>${esc(txt('Ҳамагӣ хонандагон', 'Всего учеников'))}</span><b>${filtered.length}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Писарон', 'Мальчики'))}</span><b>${boys}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Духтарон', 'Девочки'))}</span><b>${girls}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Синфҳо', 'Классов'))}</span><b>${classes.length}</b></div>
        </div>
        <div>
          <strong class="small">${esc(txt('Интихоби синф:', 'Выбор класса:'))}</strong>
          <div class="sm-class-pills" id="smStuClassPills">
            <button type="button" class="sm-class-pill ${state.classFilter === '' ? 'is-active' : ''}" data-cls-pick="">${esc(txt('Ҳамаи синфҳо', 'Все классы'))} (${state.rows.length})</button>
            ${classes.map(cls => {
              const cnt = state.rows.filter(r => String(r.class_code || '').toUpperCase() === cls).length;
              return `<button type="button" class="sm-class-pill ${state.classFilter === cls ? 'is-active' : ''}" data-cls-pick="${esc(cls)}">${esc(cls)} (${cnt})</button>`;
            }).join('')}
          </div>
        </div>
        <div class="sm-p2-grid">
          <label class="field"><span>${esc(txt('Синфи интихобшуда барои воридот', 'Класс по умолчанию для импорта'))}</span>
            <input id="smStuImportClass" type="text" maxlength="12" value="${esc(state.defaultClass)}" placeholder="5А">
          </label>
          <label class="field"><span>${esc(txt('Воридот аз Word (.docx) / Excel (.xlsx, .csv, .txt)', 'Импорт из Word (.docx) / Excel (.xlsx, .csv, .txt)'))}</span>
            <input id="smStuFile" type="file" accept=".docx,.xlsx,.csv,.tsv,.txt">
          </label>
          <label class="field" style="justify-content:end">
            <span style="display:flex;align-items:center;gap:6px"><input id="smStuReplace" type="checkbox" style="width:auto"> ${esc(txt('Иваз кардани синфи интихобшуда', 'Заменить выбранный класс'))}</span>
          </label>
        </div>
        ${!canApprove ? `<div class="notice">${esc(txt('Шумо дар вазифаи худ метавонед тағйиротро ҳамчун дархости расмӣ бо ному вазифаатон фиристед — пас аз тасдиқи роҳбарият ё роҳбари синф ба феҳрист ворид мешавад.', 'Ваша должность отправляет изменения как именную заявку на утверждение руководству или классному руководителю.'))}</div>` : ''}
        <form id="smStuAddForm" class="sm-p2-grid" autocomplete="off">
          <label class="field"><span>${esc(txt('Ному насаби хонанда', 'ФИО ученика'))}</span><input id="smStuName" type="text" required maxlength="180" placeholder="${esc(txt('Алиев Беҳрӯз Рустамович', 'Алиев Бехруз Рустамович'))}"></label>
          <label class="field"><span>${esc(txt('Синф', 'Класс'))}</span><input id="smStuCls" type="text" required maxlength="12" value="${esc(state.classFilter || state.defaultClass)}" placeholder="5А"></label>
          <label class="field"><span>${esc(txt('Санаи таваллуд', 'Дата рождения'))}</span><input id="smStuBirthDate" type="date" min="1995-01-01" max="2026-12-31"></label>
          <label class="field"><span>${esc(txt('Ҷинс', 'Пол'))}</span>
            <select id="smStuGender">
              <option value="">—</option>
              <option value="male">${esc(txt('Писар', 'Мужской'))}</option>
              <option value="female">${esc(txt('Духтар', 'Женский'))}</option>
            </select>
          </label>
          <div class="control" style="align-self:end;margin:0">
            <button type="submit" class="button" id="smStuAddBtn">${esc(canApprove ? txt('+ Илова кардан', '+ Добавить') : txt('Фиристодани дархост', 'Отправить заявку'))}</button>
          </div>
        </form>
        <div class="sm-p2-actions">
          <button type="button" class="button alt" id="smStuExportCsv">${esc(txt('Боргирии Excel (.csv)', 'Скачать Excel (.csv)'))}</button>
          <button type="button" class="button alt" id="smStuExportDocx">${esc(txt('Боргирии Word (.docx)', 'Скачать Word (.docx)'))}</button>
          <span id="smStuStatus" class="small" role="status">${esc(state.statusMsg)}</span>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>№</th><th>${esc(txt('Ному насаб', 'ФИО'))}</th><th>${esc(txt('Синф', 'Класс'))}</th><th>${esc(txt('Санаи таваллуд', 'Дата рождения'))}</th><th>${esc(txt('Ҷинс', 'Пол'))}</th><th></th></tr></thead>
            <tbody>
              ${filtered.length ? filtered.map((r, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${esc(r.full_name)}</strong>${r.guardian_phone ? `<div class="small">${esc(r.guardian_phone)}</div>` : ''}</td>
                  <td><span class="tag">${esc(r.class_code)}</span></td>
                  <td>${esc(formatBirthDateDisplay(r.birth_date, r.birth_year) || '—')}</td>
                  <td>${r.gender === 'male' ? txt('Писар', 'М') : (r.gender === 'female' ? txt('Духтар', 'Ж') : '—')}</td>
                  <td><button type="button" class="button alt" data-del-student="${esc(r.id)}" data-del-name="${esc(r.full_name)}" data-del-cls="${esc(r.class_code)}">✕</button></td>
                </tr>
              `).join('') : `<tr><td colspan="6" class="small">${esc(txt('Рӯйхат холӣ аст. Синфро интихоб кунед, файл ворид кунед ё дастӣ илова намоед.', 'Список пуст. Выберите класс, импортируйте файл или добавьте ученика вручную.'))}</td></tr>`}
            </tbody>
          </table>
        </div>
      `;

      const actionLabel = act => ({
        import: txt('Воридоти рӯйхат', 'Импорт списка'),
        add: txt('Иловаи хонанда', 'Добавление ученика'),
        update: txt('Тағйири маълумот', 'Изменение данных'),
        delete: txt('Хориҷ кардани хонанда', 'Удаление ученика'),
      }[act] || act);

      const requestsHtml = `
        <p class="small">${esc(txt('Дар ин бахш дархостҳои воридшуда бо ному насаб ва вазифаи фиристонанда намоиш дода мешаванд.', 'Здесь показаны входящие заявки с ФИО и должностью отправителя.'))}</p>
        <p id="smStuReqStatus" class="small" role="status">${esc(state.statusMsg)}</p>
        ${state.requests.length ? state.requests.map(req => {
          const rowsArr = Array.isArray(req.rows_payload) ? req.rows_payload : [];
          const stCls = req.status === 'approved' ? 'approved' : (req.status === 'rejected' ? 'rejected' : 'pending');
          const stTxt = req.status === 'approved' ? txt('Тасдиқ шуд', 'Одобрено') : (req.status === 'rejected' ? txt('Рад шуд', 'Отклонено') : txt('Интизор', 'Ожидает'));
          const previewNames = rowsArr.slice(0, 5).map(x => `${x.full_name || ''}${x.birth_date ? ` (${formatBirthDateDisplay(x.birth_date, x.birth_year)})` : ''}`).filter(Boolean).join(', ');
          const dtStr = (req.created_at || '').replace('T', ' ').slice(0, 16);
          return `
            <div class="sm-req-card">
              <div class="sm-req-sender">
                <div>
                  <strong>👤 ${esc(req.requested_by_name || txt('Корманд', 'Сотрудник'))}</strong>
                  ${req.requested_by_position ? `<span class="tag">${esc(req.requested_by_position)}</span>` : ''}
                </div>
                <span class="sm-badge sm-badge-${stCls}">${esc(stTxt)}</span>
              </div>
              <div class="small">
                <strong>${esc(actionLabel(req.action_type))}</strong> · ${esc(txt('Синф:', 'Класс:'))} <b>${esc(req.class_code || '—')}</b> · ${esc(txt('Сабтҳо:', 'Записей:'))} ${rowsArr.length}${dtStr ? ` · ${esc(dtStr)}` : ''}
              </div>
              ${req.summary_text ? `<div class="small">${esc(req.summary_text)}</div>` : ''}
              ${previewNames ? `<div class="small">${esc(previewNames)}${rowsArr.length > 5 ? ` … (+${rowsArr.length - 5})` : ''}</div>` : ''}
              ${req.reviewed_by_name ? `<div class="small">${esc(txt('Баррасӣ кард:', 'Рассмотрел:'))} ${esc(req.reviewed_by_name)}</div>` : ''}
              ${req.status === 'pending' && canApprove ? `
                <div class="sm-p2-actions" style="margin:4px 0 0">
                  <button type="button" class="button" data-stu-req-act="approved" data-req-id="${esc(req.id)}">✓ ${esc(txt('Тасдиқ ва татбиқ', 'Одобрить и применить'))}</button>
                  <button type="button" class="button alt" data-stu-req-act="rejected" data-req-id="${esc(req.id)}">✕ ${esc(txt('Рад кардан', 'Отклонить'))}</button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('') : `<div class="notice">${esc(txt('Ҳанӯз дархости навсозии хонандагон вуҷуд надорад.', 'Заявок на обновление списка учеников пока нет.'))}</div>`}
      `;

      setPanelHtml(panel, `
        <h2 tabindex="-1">${esc(txt('Феҳристи хонандагон', 'Реестр учеников'))}</h2>
        ${dbLockBannerHtml()}
        <div class="sm-subtabs">
          <button type="button" class="sm-subtab ${studentsTabMode === 'list' ? 'is-active' : ''}" data-stu-tab="list">📋 ${esc(txt('Синфҳо ва хонандагон', 'Классы и ученики'))}</button>
          <button type="button" class="sm-subtab ${studentsTabMode === 'requests' ? 'is-active' : ''}" data-stu-tab="requests">🔔 ${esc(txt('Дархостҳо', 'Заявки'))}${pendingReqs.length ? ` <span class="sm-bell-count">${pendingReqs.length}</span>` : ''}</button>
        </div>
        ${studentsTabMode === 'requests' ? requestsHtml : listHtml}
      `);

      panel.querySelectorAll('[data-stu-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
          studentsTabMode = btn.dataset.stuTab || 'list';
          renderStudents({ refresh: false });
        });
      });
      panel.querySelectorAll('[data-cls-pick]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.classFilter = btn.dataset.clsPick || '';
          if (state.classFilter) state.defaultClass = state.classFilter;
          renderStudents({ refresh: false });
        });
      });
      panel.querySelector('#smStuImportClass')?.addEventListener('input', ev => {
        state.defaultClass = ev.target.value.trim().toUpperCase() || '5А';
      });
      panel.querySelector('#smStuFile')?.addEventListener('change', async ev => {
        const file = ev.target.files?.[0];
        if (!file) return;
        try {
          ++stuSeq;
          const buf = await file.arrayBuffer();
          const parsed = parseStudentImportFile(buf, file.name, state.defaultClass);
          if (!parsed.rows.length) {
            state.statusMsg = txt('Дар файл сатрҳои хонанда ёфт нашуд.', 'В файле не найдено строк учеников.');
            renderStudents({ refresh: false });
            return;
          }
          const replaceCls = panel.querySelector('#smStuReplace')?.checked ? state.defaultClass : '';
          if (canApprove) {
            state.rows = await upsertStudents(ctx(), parsed.rows, { replaceClass: replaceCls });
            state.statusMsg = l === 'ru'
              ? `Импортировано из ${parsed.format.toUpperCase()}: ${parsed.rows.length} уч.`
              : `Аз ${parsed.format.toUpperCase()} ворид шуд: ${parsed.rows.length} хонанда.`;
          } else {
            await submitStudentUpdateRequest(ctx(), {
              classCode: state.defaultClass,
              actionType: 'import',
              replaceClass: Boolean(replaceCls),
              rowsPayload: parsed.rows,
              summaryText: `${txt('Воридот аз файл', 'Импорт из файла')} (${parsed.format.toUpperCase()}): ${parsed.rows.length}`,
            });
            state.requests = await loadStudentUpdateRequests(ctx());
            state.statusMsg = txt('Дархости воридот бо ному вазифаи шумо барои тасдиқ фиристода шуд.', 'Заявка на импорт с вашим ФИО и должностью отправлена на согласование.');
          }
          await renderStudents({ refresh: false });
          if (canGrades) await renderGrades({ refresh: true });
          if (canAnalytics) await renderAnalytics();
        } catch (err) {
          state.statusMsg = `${txt('Хатои воридот:', 'Ошибка импорта:')} ${err.message || err}`;
          renderStudents({ refresh: false });
        }
      });
      panel.querySelector('#smStuAddForm')?.addEventListener('submit', async ev => {
        ev.preventDefault();
        const fullName = panel.querySelector('#smStuName')?.value.trim();
        const cls = panel.querySelector('#smStuCls')?.value.trim().toUpperCase() || state.defaultClass;
        const bDate = panel.querySelector('#smStuBirthDate')?.value.trim() || '';
        const birthYear = bDate ? Number(bDate.slice(0, 4)) : null;
        const gender = panel.querySelector('#smStuGender')?.value || '';
        if (!fullName) return;
        ++stuSeq;
        const payloadRow = {
          full_name: fullName,
          class_code: cls,
          birth_date: bDate || null,
          birth_year: birthYear,
          gender,
        };
        if (canApprove) {
          state.rows = await upsertStudents(ctx(), [payloadRow]);
          state.statusMsg = txt(`Хонанда илова шуд (${cls}).`, `Ученик добавлен (${cls}).`);
        } else {
          await submitStudentUpdateRequest(ctx(), {
            classCode: cls,
            actionType: 'add',
            replaceClass: false,
            rowsPayload: [payloadRow],
            summaryText: `${txt('Иловаи хонанда', 'Добавление ученика')}: ${fullName} (${cls})`,
          });
          state.requests = await loadStudentUpdateRequests(ctx());
          state.statusMsg = txt('Дархост барои тасдиқ фиристода шуд.', 'Заявка отправлена на подтверждение.');
        }
        state.defaultClass = cls;
        state.classFilter = cls;
        await renderStudents({ refresh: false });
        if (canGrades) await renderGrades({ refresh: true });
        if (canAnalytics) await renderAnalytics();
      });
      panel.querySelectorAll('[data-del-student]').forEach(btn => {
        btn.addEventListener('click', async () => {
          ++stuSeq;
          const sid = btn.dataset.delStudent;
          const sname = btn.dataset.delName || '';
          const scls = btn.dataset.delCls || state.defaultClass;
          if (canApprove) {
            state.rows = await deleteStudent(ctx(), sid);
            state.statusMsg = txt('Хонанда хориҷ шуд.', 'Ученик удалён.');
          } else {
            await submitStudentUpdateRequest(ctx(), {
              classCode: scls,
              actionType: 'delete',
              replaceClass: false,
              rowsPayload: [{ id: sid, full_name: sname, class_code: scls }],
              summaryText: `${txt('Дархости хориҷ кардан', 'Запрос на удаление')}: ${sname}`,
            });
            state.requests = await loadStudentUpdateRequests(ctx());
            state.statusMsg = txt('Дархости хориҷ кардан бо ному вазифаи шумо фиристода шуд.', 'Запрос на удаление с вашим ФИО и должностью отправлен.');
          }
          await renderStudents({ refresh: false });
        });
      });
      panel.querySelectorAll('[data-stu-req-act]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const dec = btn.dataset.stuReqAct;
          const reqId = btn.dataset.reqId;
          try {
            state.requests = await reviewStudentUpdateRequest(ctx(), reqId, dec, '');
            state.rows = await loadStudents(ctx());
            state.statusMsg = dec === 'approved'
              ? txt('Дархост тасдиқ ва ба феҳрист ворид шуд.', 'Заявка одобрена и применена к списку.')
              : txt('Дархост рад карда шуд.', 'Заявка отклонена.');
            await renderStudents({ refresh: false });
            if (canGrades) await renderGrades({ refresh: true });
            if (canAnalytics) await renderAnalytics();
          } catch (err) {
            state.statusMsg = err?.message || 'Error';
            renderStudents({ refresh: false });
          }
        });
      });
      panel.querySelector('#smStuExportCsv')?.addEventListener('click', () => {
        downloadBlob(buildStudentsCsv(filtered), 'text/csv;charset=utf-8', 'students.csv');
      });
      panel.querySelector('#smStuExportDocx')?.addEventListener('click', () => {
        const bytes = buildSimpleDocxBytes(
          txt('Феҳристи хонандагон', 'Список учеников'),
          ['№', txt('Ному насаб', 'ФИО'), txt('Синф', 'Класс'), txt('Санаи таваллуд', 'Дата рождения')],
          filtered.map((r, i) => [String(i + 1), r.full_name, r.class_code, formatBirthDateDisplay(r.birth_date, r.birth_year)]),
        );
        downloadBlob(bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'students.docx');
      });
    };
  }

  // ============================================================================
  // PANEL 2: TEACHER HOURS & CATEGORY MANAGEMENT
  // ============================================================================
  let renderWorkload = () => {};
  if (canWorkload) {
    const panel = createPanel(article, 'smTeacherWorkloadPanel');
    registerModule(
      'smTeacherWorkloadPanel',
      '⏱',
      'Соатҳои дарсӣ ва дараҷа',
      'Часы нагрузки и категория',
      'Идоракунии сарбории ҳафтаина (ставка) ва дараҷаи аттестатсионӣ',
      'Управление недельной нагрузкой (ставкой) и аттестационной категорией',
    );

    let state = { rows: [], statusMsg: '' };
    let wkSeq = 0;
    let wkInFlight = 0;
    renderWorkload = async ({ refresh = true } = {}) => {
      if (!refresh && wkInFlight > 0) return;
      if (refresh) {
        const mySeq = ++wkSeq;
        wkInFlight += 1;
        try {
          const loaded = await loadWorkloads(ctx());
          if (mySeq !== wkSeq) return;
          state.rows = loaded;
        } finally {
          wkInFlight = Math.max(0, wkInFlight - 1);
        }
      }
      const totalHrs = state.rows.reduce((s, r) => s + (Number(r.weekly_hours) || 0), 0);
      const l = getLang();
      const myName = ctx().actorName || '';

      setPanelHtml(panel, `
        <h2 tabindex="-1">${esc(txt('Соатҳои дарсӣ ва дараҷаи тахассусии омӯзгор', 'Учебные часы и квалификационная категория учителя'))}</h2>
        ${dbLockBannerHtml()}
        <p class="small">${esc(txt('Меъёри 1 ставка = 18 соат/ҳафта. Ин маълумот барои муҳосиб дар ҳисоббаробаркунии маош истифода мешавад.', 'Норма 1 ставки = 18 ч/нед. Данные используются бухгалтером для расчёта зарплаты.'))}</p>
        <div class="sm-p2-kpis">
          <div class="sm-p2-kpi"><span>${esc(txt('Омӯзгорон дар рӯйхат', 'Учителей в списке'))}</span><b>${state.rows.length}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Ҳамагӣ соат/ҳафта', 'Всего часов/нед'))}</span><b>${totalHrs.toFixed(1)}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Ҷамъи ставкаҳо', 'Всего ставок'))}</span><b>${(totalHrs / 18).toFixed(2)}</b></div>
        </div>
        <form id="smWkForm" class="sm-p2-grid" autocomplete="off">
          <label class="field"><span>${esc(txt('Ному насаби омӯзгор', 'ФИО учителя'))}</span>
            <input id="smWkName" type="text" required maxlength="160" value="${esc(isTeacher ? myName : '')}" placeholder="${esc(txt('Маҳмудова Нигина', 'Махмудова Нигина'))}">
          </label>
          <label class="field"><span>${esc(txt('Дараҷаи тахассусӣ', 'Категория'))}</span>
            <select id="smWkCat">
              <option value="higher">${esc(CATEGORY_LABELS.higher[l])}</option>
              <option value="first">${esc(CATEGORY_LABELS.first[l])}</option>
              <option value="second">${esc(CATEGORY_LABELS.second[l])}</option>
              <option value="none" selected>${esc(CATEGORY_LABELS.none[l])}</option>
            </select>
          </label>
          <label class="field"><span>${esc(txt('Соат дар як ҳафта', 'Часов в неделю'))}</span>
            <input id="smWkHours" type="number" step="0.5" min="0" max="60" value="18" required>
          </label>
          <label class="field"><span>${esc(txt('Соли аттестатсия', 'Год аттестации'))}</span>
            <input id="smWkYear" type="number" min="1980" max="2099" value="2026">
          </label>
          <label class="field"><span>${esc(txt('Фан', 'Предмет'))}</span>
            <input id="smWkSubj" type="text" maxlength="120" placeholder="${esc(txt('Математика', 'Математика'))}">
          </label>
          <label class="field"><span>${esc(txt('Синфҳо (бо вергул)', 'Классы (через запятую)'))}</span>
            <input id="smWkClasses" type="text" placeholder="5А, 6Б, 7А">
          </label>
          <label class="field"><span>${esc(txt('Иловапулиҳо', 'Доплаты'))}</span>
            <span style="display:flex;gap:12px;flex-wrap:wrap;font-weight:500">
              <label style="display:flex;gap:5px;align-items:center"><input id="smWkLead" type="checkbox" style="width:auto"> ${esc(txt('Роҳбари синф', 'Классн. рук.'))}</label>
              <label style="display:flex;gap:5px;align-items:center"><input id="smWkNote" type="checkbox" style="width:auto"> ${esc(txt('Тафтиши дафтар', 'Пров. тетрадей'))}</label>
            </span>
          </label>
          <div class="control" style="align-self:end;margin:0">
            <button type="submit" class="button" id="smWkSaveBtn">${esc(txt('Сабти сарборӣ', 'Сохранить нагрузку'))}</button>
          </div>
        </form>
        <p id="smWkStatus" class="small" role="status">${esc(state.statusMsg)}</p>
        <div class="table-scroll">
          <table>
            <thead><tr><th>${esc(txt('Омӯзгор', 'Учитель'))}</th><th>${esc(txt('Дараҷа', 'Категория'))}</th><th>${esc(txt('Фан ва синфҳо', 'Предмет и классы'))}</th><th>${esc(txt('Соат / Ставка', 'Часы / Ставка'))}</th><th>${esc(txt('Иловапулӣ', 'Доплаты'))}</th><th></th></tr></thead>
            <tbody>
              ${state.rows.length ? state.rows.map(r => `
                <tr>
                  <td><strong>${esc(r.teacher_name)}</strong>${r.attestation_year ? `<div class="small">${esc(txt('Аттестатсия:', 'Аттестация:'))} ${r.attestation_year}</div>` : ''}</td>
                  <td><span class="tag">${esc(CATEGORY_LABELS[r.category]?.[l] || r.category)}</span></td>
                  <td>${esc(r.subject || '—')}${Array.isArray(r.class_codes) && r.class_codes.length ? `<div class="small">${esc(r.class_codes.join(', '))}</div>` : ''}</td>
                  <td><strong>${Number(r.weekly_hours).toFixed(1)}</strong> (${(Number(r.weekly_hours) / 18).toFixed(2)})</td>
                  <td>${[r.class_leadership ? txt('Роҳ. синф', 'Кл.рук') : '', r.notebook_check ? txt('Дафтар', 'Тетради') : ''].filter(Boolean).join(', ') || '—'}</td>
                  <td><button type="button" class="button alt" data-del-wk="${esc(r.id)}">✕</button></td>
                </tr>
              `).join('') : `<tr><td colspan="6" class="small">${esc(txt('Ҳанӯз сабте нест.', 'Пока нет записей.'))}</td></tr>`}
            </tbody>
          </table>
        </div>
      `);

      panel.querySelector('#smWkForm')?.addEventListener('submit', async ev => {
        ev.preventDefault();
        const name = panel.querySelector('#smWkName')?.value.trim();
        if (!name) return;
        const cat = panel.querySelector('#smWkCat')?.value || 'none';
        const hrs = Number(panel.querySelector('#smWkHours')?.value || 18);
        const yr = panel.querySelector('#smWkYear')?.value ? Number(panel.querySelector('#smWkYear').value) : null;
        const subj = panel.querySelector('#smWkSubj')?.value.trim() || '';
        const classes = (panel.querySelector('#smWkClasses')?.value || '').split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
        const lead = Boolean(panel.querySelector('#smWkLead')?.checked);
        const note = Boolean(panel.querySelector('#smWkNote')?.checked);
        ++wkSeq;
        state.rows = await upsertWorkload(ctx(), {
          teacher_name: name, category: cat, weekly_hours: hrs, attestation_year: yr,
          subject: subj, class_codes: classes, class_leadership: lead, notebook_check: note,
        });
        state.statusMsg = txt('Сарборӣ ва дараҷа сабт шуд.', 'Нагрузка и категория сохранены.');
        await renderWorkload({ refresh: false });
        if (canPayroll) renderPayroll({ refresh: true });
      });
      panel.querySelectorAll('[data-del-wk]').forEach(btn => {
        btn.addEventListener('click', async () => {
          ++wkSeq;
          state.rows = await deleteWorkload(ctx(), btn.dataset.delWk);
          state.statusMsg = txt('Сабт хориҷ шуд.', 'Запись удалена.');
          await renderWorkload({ refresh: false });
          if (canPayroll) renderPayroll({ refresh: true });
        });
      });
    };
  }

  // ============================================================================
  // PANEL 3: ACCOUNTANT PAYROLL, TARIFFS & CALENDAR EXCLUSIONS
  // ============================================================================
  let renderPayroll = () => {};
  if (canPayroll) {
    const panel = createPanel(article, 'smPayrollPanel');
    registerModule(
      'smPayrollPanel',
      '💳',
      'Маош, тарифҳо ва тақвим',
      'Зарплата, тарифы и календарь',
      'Ҳисоби маоши моҳона, меъёрҳои дараҷа ва хориҷкунии рӯзҳои ид/истироҳат',
      'Расчёт месячной зарплаты, ставки категорий и исключение выходных/праздников',
    );

    const nowYm = new Date().toISOString().slice(0, 7);
    let state = { cfg: null, workloads: [], yearMonth: nowYm, statusMsg: '' };
    let paySeq = 0;
    let payInFlight = 0;

    renderPayroll = async ({ refresh = true } = {}) => {
      if (!refresh && payInFlight > 0) return;
      if (refresh || !state.cfg) {
        const mySeq = ++paySeq;
        payInFlight += 1;
        try {
          const [cfg, wks] = await Promise.all([loadPayrollConfig(ctx()), loadWorkloads(ctx())]);
          if (mySeq !== paySeq) return;
          state.cfg = cfg;
          state.workloads = wks;
        } finally {
          payInFlight = Math.max(0, payInFlight - 1);
        }
      }
      const calc = computeMonthlyPayroll(state.cfg, state.workloads, state.yearMonth);
      const dayNames = getLang() === 'ru'
        ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        : ['Дш', 'Сш', 'Чш', 'Пш', 'Ҷм', 'Шб', 'Як'];

      // Monday-first grid offset
      const firstWeekday = calc.calendar.days[0]?.weekday ?? 1;
      const offset = (firstWeekday + 6) % 7;
      const calCells = [];
      for (let i = 0; i < offset; i += 1) calCells.push('<div></div>');
      for (const d of calc.calendar.days) {
        const cls = d.isHoliday ? 'is-holiday' : (d.isExcludedWeekday ? 'is-weekend' : '');
        calCells.push(`<button type="button" class="sm-cal-day ${cls}" data-cal-date="${d.date}" title="${d.date}">${d.day}</button>`);
      }

      setPanelHtml(panel, `
        <h2 tabindex="-1">${esc(txt('Ҳисоббаробаркунии маош ва тақвими истироҳат', 'Расчёт заработной платы и календарь исключений'))}</h2>
        ${dbLockBannerHtml()}
        <p class="small">${esc(txt('Тарифҳо, андоз ва рӯзҳои истироҳат/идро танзим кунед. Зер кардани сана дар тақвим онро аз рӯзҳои корӣ хориҷ мекунад.', 'Настройте тарифы, налоги и выходные/праздничные дни. Нажатие на дату исключает её из рабочих дней.'))}</p>
        <div class="sm-p2-kpis">
          <div class="sm-p2-kpi"><span>${esc(txt('Рӯзҳои кории моҳ', 'Рабочих дней'))}</span><b>${calc.calendar.effectiveWorkingDays} / ${calc.calendar.possibleWorkingDays}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Хориҷшуда (ид)', 'Исключено (праздн.)'))}</span><b>${calc.calendar.excludedHolidayWorkingDays}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Ҳисобшуда (Gross)', 'Начислено (Gross)'))}</span><b>${calc.totals.gross.toFixed(2)} TJS</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Ба дасти корманд (Net)', 'К выдаче (Net)'))}</span><b>${calc.totals.net.toFixed(2)} TJS</b></div>
        </div>
        <div class="sm-p2-grid">
          <label class="field"><span>${esc(txt('Моҳи ҳисобӣ', 'Расчётный месяц'))}</span>
            <input id="smPayMonth" type="month" value="${esc(state.yearMonth)}">
          </label>
          <label class="field"><span>${esc(txt('Меъёри 1 ставка (18 соат), TJS', 'Базовая ставка (18 ч), TJS'))}</span>
            <input id="smPayBase" type="number" min="0" step="10" value="${state.cfg.base_rate_18h_tjs}">
          </label>
          <label class="field"><span>${esc(txt('Иловапулии роҳбари синф (TJS)', 'Доплата кл. руководства (TJS)'))}</span>
            <input id="smPayLead" type="number" min="0" step="10" value="${state.cfg.class_leadership_tjs}">
          </label>
          <label class="field"><span>${esc(txt('Тафтиши дафтарҳо (TJS)', 'Проверка тетрадей (TJS)'))}</span>
            <input id="smPayNote" type="number" min="0" step="10" value="${state.cfg.notebook_check_tjs}">
          </label>
          <label class="field"><span>${esc(txt('Андоз аз даромад (%)', 'Подоходный налог (%)'))}</span>
            <input id="smPayIncTax" type="number" min="0" max="60" step="0.5" value="${state.cfg.income_tax_pct}">
          </label>
          <label class="field"><span>${esc(txt('Ҳифзи иҷтимоӣ (%)', 'Соц. фонд (%)'))}</span>
            <input id="smPaySocTax" type="number" min="0" max="40" step="0.5" value="${state.cfg.social_tax_pct}">
          </label>
        </div>
        <div class="sm-p2-actions">
          <label style="display:inline-flex;align-items:center;gap:6px"><input id="smPayExSun" type="checkbox" ${(state.cfg.excluded_weekdays || [0]).includes(0) ? 'checked' : ''}> ${esc(txt('Хориҷи Якшанбе', 'Исключить Воскресенье'))}</label>
          <label style="display:inline-flex;align-items:center;gap:6px"><input id="smPayExSat" type="checkbox" ${(state.cfg.excluded_weekdays || []).includes(6) ? 'checked' : ''}> ${esc(txt('Хориҷи Шанбе', 'Исключить Субботу'))}</label>
          <label style="display:inline-flex;align-items:center;gap:6px"><input id="smPayProRate" type="checkbox" ${state.cfg.pro_rate_holidays !== false ? 'checked' : ''}> ${esc(txt('Таносуби рӯзҳои ид', 'Учитывать пропущенные праздничные дни'))}</label>
          <button type="button" class="button alt" id="smPayPresetHolidays">${esc(txt('Идҳои расмии РТ дар ин моҳ', 'Добавить праздники РТ'))}</button>
          <button type="button" class="button" id="smPaySaveCfg">${esc(txt('Сабти танзимоти маош', 'Сохранить тарифы и календарь'))}</button>
        </div>
        <div class="sm-cal-grid">
          ${dayNames.map(dn => `<div class="sm-cal-head">${dn}</div>`).join('')}
          ${calCells.join('')}
        </div>
        <div class="sm-p2-actions">
          <button type="button" class="button alt" id="smPayExportCsv">${esc(txt('Содироти ведомост (.csv)', 'Экспорт ведомости (.csv)'))}</button>
          <span id="smPayStatus" class="small" role="status">${esc(state.statusMsg)}</span>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>${esc(txt('Омӯзгор', 'Сотрудник'))}</th><th>${esc(txt('Соат / Ставка', 'Часы / Ставка'))}</th><th>${esc(txt('Маоши асосӣ', 'Оклад'))}</th><th>${esc(txt('Дараҷа + Илова', 'Категория + Доп.'))}</th><th>${esc(txt('Ҳисобшуда', 'Начислено'))}</th><th>${esc(txt('Андоз', 'Налоги'))}</th><th>${esc(txt('Ба даст (TJS)', 'К выдаче (TJS)'))}</th></tr></thead>
            <tbody>
              ${calc.rows.length ? calc.rows.map(r => `
                <tr>
                  <td><strong>${esc(r.teacher_name)}</strong><div class="small">${esc(CATEGORY_LABELS[r.category]?.[getLang()] || '')}</div></td>
                  <td>${r.weekly_hours} (${r.stavka.toFixed(2)})</td>
                  <td>${r.basePay.toFixed(2)}</td>
                  <td>${(r.categoryBonus + r.supplements).toFixed(2)}</td>
                  <td>${r.grossPay.toFixed(2)}</td>
                  <td>-${(r.incomeTax + r.socialTax).toFixed(2)}</td>
                  <td><strong>${r.netPay.toFixed(2)}</strong></td>
                </tr>
              `).join('') : `<tr><td colspan="7" class="small">${esc(txt('Аввал омӯзгорон ва соатҳоро дар бахши сарборӣ ворид кунед.', 'Сначала добавьте учителей и часы в разделе нагрузки.'))}</td></tr>`}
            </tbody>
          </table>
        </div>
      `);

      const collectCfgFromInputs = () => {
        const weekdays = [];
        if (panel.querySelector('#smPayExSun')?.checked) weekdays.push(0);
        if (panel.querySelector('#smPayExSat')?.checked) weekdays.push(6);
        return {
          ...state.cfg,
          base_rate_18h_tjs: Number(panel.querySelector('#smPayBase')?.value || 1800),
          class_leadership_tjs: Number(panel.querySelector('#smPayLead')?.value || 0),
          notebook_check_tjs: Number(panel.querySelector('#smPayNote')?.value || 0),
          income_tax_pct: Number(panel.querySelector('#smPayIncTax')?.value || 13),
          social_tax_pct: Number(panel.querySelector('#smPaySocTax')?.value || 1),
          excluded_weekdays: weekdays,
          pro_rate_holidays: Boolean(panel.querySelector('#smPayProRate')?.checked),
        };
      };

      panel.querySelector('#smPayMonth')?.addEventListener('change', ev => {
        state.yearMonth = ev.target.value || nowYm;
        renderPayroll({ refresh: false });
      });
      panel.querySelectorAll('[data-cal-date]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const dt = btn.dataset.calDate;
          const nextCfg = collectCfgFromInputs();
          const set = new Set(nextCfg.holiday_dates || []);
          if (set.has(dt)) set.delete(dt);
          else set.add(dt);
          nextCfg.holiday_dates = [...set].sort();
          state.cfg = await savePayrollConfig(ctx(), nextCfg);
          state.statusMsg = txt(`Санаи ${dt} навсозӣ шуд.`, `Дата ${dt} обновлена.`);
          renderPayroll({ refresh: false });
        });
      });
      panel.querySelector('#smPayPresetHolidays')?.addEventListener('click', async () => {
        const year = state.yearMonth.slice(0, 4);
        const nextCfg = collectCfgFromInputs();
        const set = new Set(nextCfg.holiday_dates || []);
        for (const p of TAJIK_HOLIDAY_PRESETS) set.add(`${year}-${p.md}`);
        nextCfg.holiday_dates = [...set].sort();
        state.cfg = await savePayrollConfig(ctx(), nextCfg);
        state.statusMsg = txt('Идҳои расмии Тоҷикистон ба тақвим илова шуданд.', 'Государственные праздники РТ добавлены.');
        renderPayroll({ refresh: false });
      });
      panel.querySelector('#smPaySaveCfg')?.addEventListener('click', async () => {
        state.cfg = await savePayrollConfig(ctx(), collectCfgFromInputs());
        state.statusMsg = txt('Тарифҳо ва тақвим сабт шуданд.', 'Тарифы и календарь сохранены.');
        renderPayroll({ refresh: false });
      });
      panel.querySelector('#smPayExportCsv')?.addEventListener('click', () => {
        const header = ['№', 'Омӯзгор', 'Соат', 'Маоши асосӣ', 'Иловапулӣ', 'Ҳисобшуда', 'Андоз', 'Ба даст'];
        const lines = ['\uFEFF' + header.join(',')];
        calc.rows.forEach((r, i) => lines.push([i + 1, `"${r.teacher_name}"`, r.weekly_hours, r.basePay, (r.categoryBonus + r.supplements).toFixed(2), r.grossPay, (r.incomeTax + r.socialTax).toFixed(2), r.netPay].join(',')));
        downloadBlob(lines.join('\r\n'), 'text/csv;charset=utf-8', `payroll-${state.yearMonth}.csv`);
      });
    };
  }

  // ============================================================================
  // PANEL 4: CLASS TEACHER QUARTER GRADES & TAHLIL ANALYTICS
  // ============================================================================
  let renderGrades = () => {};
  if (canGrades) {
    const panel = createPanel(article, 'smGradesPanel');
    registerModule(
      'smGradesPanel',
      '📊',
      'Баҳоҳои чорякӣ ва сифат',
      'Четвертные оценки и качество',
      'Таҳлил (10-хола), пешгӯии баҳо, журнали фан ва ҷамъбасти Роҳбари синф',
      'Тахлил (10-балльная), прогноз баллов, журнал предмета и сводка классного руководителя',
    );

    let state = {
      subtab: 'journal', // 'calc' | 'journal' | 'roh'
      yearStart: 2026,
      period: 'q1',
      classCode: '5А',
      subject: 'Математика',
      periodStart: '',
      periodEnd: '',
      rows: [],
      allYearRows: [],
      schoolClasses: [],
      rohSubjects: [],
      rohFocusIdx: 0,
      rohEditing: false,
      calcCur: '',
      calcCtrl: '',
      calcPeriods: [
        { label: 'Ч1', val: '' },
        { label: 'Ч2', val: '' },
        { label: 'Ч3', val: '' },
        { label: 'Ч4', val: '' },
      ],
      statusMsg: '',
    };

    let grSeq = 0;
    let grInFlight = 0;

    const gradeTierClass = g => (g >= 8 ? 'is-high' : (g >= 5 ? 'is-mid' : (g >= 1 ? 'is-low' : 'is-none')));
    const gradeHex = g => (g >= 8 ? '#27ae60' : (g >= 5 ? '#f39c12' : '#e74c3c'));

    const renderCalcResultMarkup = (curVal, ctrlVal) => {
      const score = computeTahlilScore(curVal, ctrlVal);
      if (!score) {
        return `<div class="notice">${esc(txt('Баҳоҳои ҷорӣ ё контролро ворид кунед (мас.: 8, 9, 10) — натиҷа фавран ҳисоб мешавад.', 'Введите текущие или контрольные оценки (напр.: 8, 9, 10) — итог посчитается сразу.'))}</div>`;
      }
      const cls = gradeTierClass(score.finalGrade);
      const em = score.finalGrade >= 9 ? '🎉' : (score.finalGrade >= 7 ? '😊' : (score.finalGrade >= 5 ? '😐' : '😟'));
      return `
        <div class="sm-tahlil-score-card ${cls}">
          <div class="small" style="color:rgba(255,255,255,.85)">${esc(txt('БАҲОИ НИҲОӢ (10-ХОЛА)', 'ИТОГОВАЯ ОЦЕНКА (10-БАЛЛЬНАЯ)'))}</div>
          <div class="sm-tahlil-score-num">${score.finalGrade} ${em}</div>
          <div style="font-size:.86rem;opacity:.92">${esc(txt('Ҷорӣ:', 'Текущие:'))} <b>${score.avgCurrent.toFixed(2)}</b> · ${esc(txt('Контролӣ:', 'Контрольные:'))} <b>${score.avgControl.toFixed(2)}</b> · ${esc(txt('Миёна:', 'Среднее:'))} <b>${score.exactAvg.toFixed(2)} → ${score.finalGrade}</b></div>
        </div>
        ${score.prognosis ? `
          <div class="notice" style="margin-top:8px">
            💡 ${esc(txt(
              `Барои гирифтани баҳои ${score.prognosis.targetGrade} боз 1 баҳои ${score.prognosis.neededScore} лозим аст.`,
              `Для получения оценки ${score.prognosis.targetGrade} нужен ещё 1 балл ${score.prognosis.neededScore}.`,
            ))}
          </div>
        ` : ''}
      `;
    };

    const renderPeriodSummaryMarkup = () => {
      const nums = state.calcPeriods.map(p => Number(p.val)).filter(n => Number.isFinite(n) && n >= 1 && n <= 10);
      if (!nums.length) return `<span class="small">${esc(txt('Баҳоҳои чорякҳоро ворид кунед.', 'Введите оценки четвертей.'))}</span>`;
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      const fin = roundTajikGrade(avg);
      return `<div class="sm-tahlil-score-card ${gradeTierClass(fin)}" style="padding:10px">
        <div>${esc(txt('Ҷамъбасти давраҳо', 'Итог по периодам'))}: <b>${avg.toFixed(2)} → <span style="font-size:1.5rem">${fin}</span></b></div>
      </div>`;
    };

    renderGrades = async ({ refresh = true } = {}) => {
      if (!refresh && grInFlight > 0) return;
      if (refresh) {
        const mySeq = ++grSeq;
        grInFlight += 1;
        let slice, fullYear, roster, allRoster;
        try {
          [slice, fullYear, roster, allRoster] = await Promise.all([
            loadQuarterGrades(ctx(), { yearStart: state.yearStart, period: state.period, classCode: state.classCode, subject: state.subject }),
            loadQuarterGrades(ctx(), { yearStart: state.yearStart }),
            loadStudents(ctx(), state.classCode),
            loadStudents(ctx()),
          ]);
        } finally {
          grInFlight = Math.max(0, grInFlight - 1);
        }
        if (mySeq !== grSeq) return;
        state.allYearRows = fullYear;
        state.schoolClasses = [...new Set([
          ...allRoster.map(r => String(r.class_code || '').toUpperCase()),
          ...fullYear.map(r => String(r.class_code || '').toUpperCase()),
        ].filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const byName = new Map(slice.map(r => [r.student_name.toLowerCase(), r]));
        for (const st of roster) {
          const k = st.full_name.toLowerCase();
          if (!byName.has(k)) {
            byName.set(k, {
              student_id: st.id,
              student_name: st.full_name,
              class_code: st.class_code,
              grade: '',
              current_grades: [],
              control_grades: [],
              absent_hours: 0,
            });
          }
        }
        state.rows = [...byName.values()];
        if (!state.periodStart && slice[0]?.period_start) state.periodStart = slice[0].period_start;
        if (!state.periodEnd && slice[0]?.period_end) state.periodEnd = slice[0].period_end;
      }

      const defaultSubjs = getSubjectsForClassCode(state.classCode);
      if (!state.rohSubjects.length) state.rohSubjects = [...defaultSubjs];
      const allSubjsForPicker = [...new Set([...defaultSubjs, ...state.rohSubjects, state.subject].filter(Boolean))];
      const periodOrder = [
        { code: 'q1', tg: 'Ч1 (Чораки 1)', ru: 'Ч1 (1-я четверть)' },
        { code: 'q2', tg: 'Ч2 (Чораки 2)', ru: 'Ч2 (2-я четверть)' },
        { code: 'h1', tg: 'Н1 (Нимсолаи 1)', ru: 'П1 (1-е полугодие)' },
        { code: 'q3', tg: 'Ч3 (Чораки 3)', ru: 'Ч3 (3-я четверть)' },
        { code: 'q4', tg: 'Ч4 (Чораки 4)', ru: 'Ч4 (4-я четверть)' },
        { code: 'h2', tg: 'Н2 (Нимсолаи 2)', ru: 'П2 (2-е полугодие)' },
        { code: 'year', tg: 'Сол (Ҷамъбасти сол)', ru: 'Год (Годовая)' },
      ];

      const metrics = computeGradeMetrics(state.rows);
      const periodSeries = ['q1', 'q2', 'q3', 'q4'].map(p => {
        const sl = state.allYearRows.filter(r => r.period === p && String(r.class_code).toUpperCase() === state.classCode);
        const pm = computeGradeMetrics(sl);
        return { period: p, quality_pct: pm.qualityPct, pass_pct: pm.passPct, assessed: pm.assessed };
      });
      const dateStatus = computePeriodDatesStatus(state.periodStart, state.periodEnd);

      const rankedSubject = state.rows
        .map(r => ({ name: r.student_name, grade: r.grade !== '' && r.grade !== null && Number.isFinite(Number(r.grade)) ? Number(r.grade) : null }))
        .filter(x => x.grade !== null)
        .sort((a, b) => b.grade - a.grade);
      const distCounts = {};
      for (let g = 1; g <= 10; g += 1) distCounts[g] = 0;
      rankedSubject.forEach(x => {
        const k = Math.round(x.grade);
        if (distCounts[k] !== undefined) distCounts[k] += 1;
      });
      const maxDist = Math.max(1, ...Object.values(distCounts));
      const lowRisk = rankedSubject.filter(x => x.grade < 5);

      const calcViewHtml = `
        <div class="sm-tahlil-grid">
          <div class="section" style="margin:0">
            <h3>🧮 ${esc(txt('Калкулятори фаврии 10-хола', 'Быстрый 10-балльный калькулятор'))}</h3>
            <p class="small">${esc(txt('Формула: round((Миёнаи ҷорӣ + Миёнаи контролӣ) ÷ 2)', 'Формула: round((Средний текущий + Средний контрольный) ÷ 2)'))}</p>
            <label class="field" style="margin-top:8px"><span>${esc(txt('Баҳоҳои ҷорӣ (бо вергул ё фосила)', 'Текущие оценки (через запятую или пробел)'))}</span>
              <input id="smTahCur" type="text" value="${esc(state.calcCur)}" placeholder="8, 9, 7, 10">
            </label>
            <label class="field" style="margin-top:8px"><span>${esc(txt('Баҳоҳои контролӣ', 'Оценки за контрольные'))}</span>
              <input id="smTahCtrl" type="text" value="${esc(state.calcCtrl)}" placeholder="8, 9">
            </label>
            <div id="smTahLiveOut" style="margin-top:10px">${renderCalcResultMarkup(state.calcCur, state.calcCtrl)}</div>
            ${state.rows.length ? `
              <div class="sm-p2-actions" style="margin-top:10px">
                <select id="smTahTargetStudent" style="flex:1;min-width:150px">
                  ${state.rows.map((r, idx) => `<option value="${idx}">${esc(r.student_name)} (${esc(state.classCode)})</option>`).join('')}
                </select>
                <button type="button" class="button" id="smTahApplyToStudent">${esc(txt('Сабт дар журнал', 'Записать в журнал'))}</button>
              </div>
            ` : ''}
          </div>
          <div class="section" style="margin:0">
            <h3>📅 ${esc(txt('Ҳисоби ҷамъбасти чоряк ва нимсола', 'Расчёт итогов четверти / полугодия'))}</h3>
            <div style="display:grid;gap:6px;margin:8px 0">
              ${state.calcPeriods.map((p, idx) => `
                <div style="display:flex;align-items:center;gap:8px">
                  <strong style="width:36px">${esc(p.label)}</strong>
                  <input class="sm-inline-input" style="flex:1" type="number" min="1" max="10" step="1" data-tah-pidx="${idx}" value="${esc(p.val)}" placeholder="1–10">
                </div>
              `).join('')}
            </div>
            <div id="smTahPeriodsOut">${renderPeriodSummaryMarkup()}</div>
          </div>
        </div>
      `;

      const journalViewHtml = `
        ${state.schoolClasses.length ? `
          <div class="sm-class-pills">
            ${state.schoolClasses.map(c => `<button type="button" class="sm-class-pill ${state.classCode === c ? 'is-active' : ''}" data-gr-cls-pick="${esc(c)}">${esc(c)}</button>`).join('')}
          </div>
        ` : ''}
        <div class="sm-p2-grid">
          <label class="field"><span>${esc(txt('Давра / Чоряк', 'Период / Четверть'))}</span>
            <select id="smGrPeriod">
              ${periodOrder.map(p => `<option value="${p.code}" ${state.period === p.code ? 'selected' : ''}>${esc(txt(p.tg, p.ru))}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>${esc(txt('Синф', 'Класс'))}</span>
            <input id="smGrClass" type="text" maxlength="12" value="${esc(state.classCode)}">
          </label>
          <label class="field"><span>${esc(txt('Фан', 'Предмет'))}</span>
            <input id="smGrSubject" type="text" list="smGrSubjList" maxlength="120" value="${esc(state.subject)}">
            <datalist id="smGrSubjList">${allSubjsForPicker.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
          </label>
          <label class="field"><span>${esc(txt('Оғози давра', 'Начало периода'))}</span>
            <input id="smGrStart" type="date" value="${esc(state.periodStart)}">
          </label>
          <label class="field"><span>${esc(txt('Анҷоми давра', 'Конец периода'))}</span>
            <input id="smGrEnd" type="date" value="${esc(state.periodEnd)}">
          </label>
        </div>
        ${dateStatus ? `<div class="notice">${esc(txt('Мӯҳлати чорак:', 'Статус периода:'))} <b>${esc(dateStatus.label)}</b></div>` : ''}
        <div class="sm-p2-actions">
          <button type="button" class="button" id="smGrSaveBtn">${esc(txt('Сабти баҳоҳо', 'Сохранить оценки'))}</button>
          <button type="button" class="button alt" id="smGrAddStudent">${esc(txt('+ Сатри хонанда', '+ Добавить строку'))}</button>
          <button type="button" class="button alt" id="smGrPrintBtn">🖨️ ${esc(txt('Чоп кардан', 'Печать'))}</button>
          <span id="smGrStatus" class="small" role="status">${esc(state.statusMsg)}</span>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>${esc(txt('Хонанда', 'Ученик'))}</th>
                <th>${esc(txt('Баҳоҳои ҷорӣ', 'Текущие (через ,)'))}</th>
                <th>${esc(txt('Контролӣ', 'Контрольные'))}</th>
                <th>${esc(txt('Баҳо (0–10)', 'Итог (0–10)'))}</th>
                <th>${esc(txt('Ғоиб (соат)', 'Пропуски (ч)'))}</th>
              </tr>
            </thead>
            <tbody>
              ${state.rows.length ? state.rows.map((r, i) => {
                const curStr = Array.isArray(r.current_grades) ? r.current_grades.join(', ') : '';
                const ctrlStr = Array.isArray(r.control_grades) ? r.control_grades.join(', ') : '';
                const numG = r.grade !== '' && r.grade !== null && Number.isFinite(Number(r.grade)) ? Number(r.grade) : null;
                return `
                  <tr data-grade-row="${i}">
                    <td>${i + 1}</td>
                    <td><input class="sm-inline-input" style="width:100%;min-width:155px" data-gr-name="${i}" type="text" value="${esc(r.student_name)}"></td>
                    <td><input class="sm-inline-input" style="width:115px" data-gr-cur="${i}" type="text" value="${esc(curStr)}" placeholder="8, 9, 10"></td>
                    <td><input class="sm-inline-input" style="width:95px" data-gr-ctrl="${i}" type="text" value="${esc(ctrlStr)}" placeholder="8, 9"></td>
                    <td>
                      <div style="display:flex;align-items:center;gap:6px">
                        <input class="sm-inline-input" data-gr-val="${i}" type="number" min="0" max="10" step="1" value="${r.grade ?? ''}">
                        <span class="sm-tahlil-chip ${gradeTierClass(numG || 0)}" data-gr-chip="${i}">${numG ?? '—'}</span>
                      </div>
                    </td>
                    <td><input class="sm-inline-input" data-gr-abs="${i}" type="number" min="0" max="1000" value="${r.absent_hours ?? 0}"></td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="6" class="small">${esc(txt('Дар ин синф хонанда нест — ба феҳрист илова кунед ё «+ Сатри хонанда»-ро пахш намоед.', 'В этом классе пока нет учеников — добавьте в реестр или нажмите «+ Добавить строку».'))}</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="sm-chart-grid">
          ${renderQualityRingSvg({ qualityPct: metrics.qualityPct, passPct: metrics.passPct, avgGrade: metrics.avgGrade, lang: getLang() })}
          ${renderQuarterBarsSvg(periodSeries, getLang())}
        </div>
        <div class="sm-tahlil-grid">
          <div class="section" style="margin:0">
            <h3>📊 ${esc(txt('Тақсимоти баҳоҳо (1–10)', 'Распределение оценок (1–10)'))}</h3>
            ${rankedSubject.length ? [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(g => {
              const cnt = distCounts[g] || 0;
              const pct = Math.round((cnt / maxDist) * 100);
              return `
                <div class="sm-tahlil-dist-row">
                  <strong style="width:22px;color:${gradeHex(g)}">${g}</strong>
                  <div class="sm-tahlil-dist-bar"><div class="sm-tahlil-dist-fill" style="width:${cnt ? Math.max(pct, 12) : 0}%;background:${gradeHex(g)}">${cnt || ''}</div></div>
                  <span style="width:24px;text-align:right">${cnt}</span>
                </div>
              `;
            }).join('') : `<p class="small">${esc(txt('Баҳоҳо ҳанӯз ворид нашудаанд.', 'Оценки ещё не введены.'))}</p>`}
          </div>
          <div class="section" style="margin:0">
            <h3>🏆 ${esc(txt('Беҳтарин хонандагон ва диққатталабон', 'Лучшие и требующие внимания'))}</h3>
            ${rankedSubject.length ? `
              <div style="display:grid;gap:6px;margin-bottom:10px">
                ${rankedSubject.slice(0, 5).map((s, idx) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border:1px solid var(--line);border-radius:8px">
                    <span>${idx < 3 ? ['🥇', '🥈', '🥉'][idx] : `${idx + 1}.`} <strong>${esc(s.name)}</strong></span>
                    <span class="sm-tahlil-chip ${gradeTierClass(s.grade)}">${s.grade}</span>
                  </div>
                `).join('')}
              </div>
              ${lowRisk.length ? `
                <strong class="small" style="color:#dc2626">⚠️ ${esc(txt('Диққат лозим (< 5 балл):', 'Требуют внимания (< 5 баллов):'))}</strong>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                  ${lowRisk.map(s => `<span class="sm-badge sm-badge-rejected">${esc(s.name)} (${s.grade})</span>`).join('')}
                </div>
              ` : `<p class="small" style="color:#16a34a">✓ ${esc(txt('Хонандагони баҳояшон паст нестанд.', 'Отстающих учеников нет.'))}</p>`}
            ` : `<p class="small">${esc(txt('Маълумот нест.', 'Нет данных.'))}</p>`}
          </div>
        </div>
      `;

      // Rohbari sinf multi-subject summary
      const clsGradesSlice = state.allYearRows.filter(
        r => r.period === state.period && String(r.class_code || '').toUpperCase() === state.classCode,
      );
      const rosterNames = [...new Set([
        ...state.rows.map(r => r.student_name),
        ...clsGradesSlice.map(r => r.student_name),
      ].filter(Boolean))];
      const gradeLookup = new Map(
        clsGradesSlice.map(r => [`${r.student_name.toLowerCase()}::${String(r.subject || '').toLowerCase()}`, r.grade]),
      );
      const rohSummaryRows = rosterNames.map(name => {
        const subMap = {};
        let sum = 0;
        let gradedCnt = 0;
        for (const sub of state.rohSubjects) {
          const val = gradeLookup.get(`${name.toLowerCase()}::${sub.toLowerCase()}`);
          const num = val !== undefined && val !== null && val !== '' ? Number(val) : null;
          subMap[sub] = num;
          if (num !== null && Number.isFinite(num) && num > 0) {
            sum += num;
            gradedCnt += 1;
          }
        }
        const finalAvg = gradedCnt > 0 ? roundTajikGrade(sum / state.rohSubjects.length) : null;
        return { name, subMap, sum, gradedCnt, finalAvg };
      });
      const focusStudent = rohSummaryRows[state.rohFocusIdx] || rohSummaryRows[0] || null;

      const rohViewHtml = `
        <div class="sm-p2-grid">
          <label class="field"><span>${esc(txt('Синф', 'Класс'))}</span>
            <input id="smRohClass" type="text" maxlength="12" value="${esc(state.classCode)}">
          </label>
          <label class="field"><span>${esc(txt('Давра / Чоряк', 'Период / Четверть'))}</span>
            <select id="smRohPeriod">
              ${periodOrder.map(p => `<option value="${p.code}" ${state.period === p.code ? 'selected' : ''}>${esc(txt(p.tg, p.ru))}</option>`).join('')}
            </select>
          </label>
          <div class="field"><span>${esc(txt('Илова кардани фан', 'Добавить предмет'))}</span>
            <div style="display:flex;gap:6px">
              <input id="smRohAddSubjInp" type="text" placeholder="${esc(txt('Номи фан', 'Название предмета'))}">
              <button type="button" class="button alt" id="smRohAddSubjBtn">+</button>
            </div>
          </div>
        </div>
        <div>
          <strong class="small">${esc(txt('Фанҳои синф (пахш кунед барои интихоб):', 'Предметы класса (нажмите для выбора):'))}</strong>
          <div class="sm-class-pills">
            ${allSubjsForPicker.map(sub => `
              <button type="button" class="sm-class-pill ${state.rohSubjects.includes(sub) ? 'is-active' : ''}" data-roh-subj="${esc(sub)}">${esc(sub)}</button>
            `).join('')}
          </div>
        </div>
        ${state.rohEditing && focusStudent ? `
          <div class="section" style="margin:10px 0">
            <div class="sm-req-sender">
              <h3>👤 ${esc(focusStudent.name)} (${state.rohFocusIdx + 1}/${rohSummaryRows.length})</h3>
              <button type="button" class="button alt" id="smRohBackTableBtn">← ${esc(txt('Ба ҷадвали умумӣ', 'К общей таблице'))}</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:10px 0">
              ${state.rohSubjects.map((sub, sIdx) => `
                <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border:1px solid var(--line);border-radius:9px">
                  <span style="font-size:.86rem;font-weight:600">${esc(sub)}</span>
                  <input class="sm-inline-input" type="number" min="1" max="10" step="1" data-roh-sidx="${sIdx}" value="${focusStudent.subMap[sub] ?? ''}" placeholder="—">
                </label>
              `).join('')}
            </div>
            <div class="sm-p2-actions">
              <button type="button" class="button" id="smRohSaveStudentBtn">${esc(txt('Сабт ва хонандаи навбатӣ →', 'Сохранить и следующий →'))}</button>
              <button type="button" class="button alt" id="smRohPrintStudentBtn">🖨️ ${esc(txt('Чопи табели хонанда', 'Печать табеля'))}</button>
            </div>
          </div>
        ` : `
          <div class="sm-p2-actions">
            <button type="button" class="button alt" id="smRohPrintBtn">🖨️ ${esc(txt('Чопи ҷадвали умумӣ', 'Печать сводной таблицы'))}</button>
            <span id="smGrStatus" class="small" role="status">${esc(state.statusMsg)}</span>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>${esc(txt('Хонанда', 'Ученик'))}</th>
                  ${state.rohSubjects.map(sub => `<th style="font-size:.75rem">${esc(sub.slice(0, 12))}</th>`).join('')}
                  <th>${esc(txt('Ҷамъбаст', 'Итог'))}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${rohSummaryRows.length ? rohSummaryRows.map((row, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${esc(row.name)}</strong></td>
                    ${state.rohSubjects.map(sub => {
                      const v = row.subMap[sub];
                      return `<td><span class="sm-tahlil-chip ${gradeTierClass(v || 0)}" style="min-width:24px;height:24px;font-size:.78rem">${v ?? '—'}</span></td>`;
                    }).join('')}
                    <td><span class="sm-tahlil-chip ${gradeTierClass(row.finalAvg || 0)}">${row.finalAvg ?? '—'}</span></td>
                    <td><button type="button" class="button alt" data-roh-edit-idx="${idx}">${esc(txt('Таҳрир', 'Ввод'))}</button></td>
                  </tr>
                `).join('') : `<tr><td colspan="${state.rohSubjects.length + 4}" class="small">${esc(txt('Хонандагони ин синф ҳанӯз дар феҳрист нестанд.', 'Ученики этого класса ещё не добавлены в реестр.'))}</td></tr>`}
              </tbody>
            </table>
          </div>
        `}
      `;

      setPanelHtml(panel, `
        <h2 tabindex="-1">${esc(txt('Баҳоҳои чорякӣ ва Таҳлил (10-хола)', 'Четвертные оценки и Аналитика (Тахлил)'))}</h2>
        ${dbLockBannerHtml()}
        <div class="sm-subtabs">
          <button type="button" class="sm-subtab ${state.subtab === 'calc' ? 'is-active' : ''}" data-gr-tab="calc">🧮 ${esc(txt('Калкулятор (Таҳлил)', 'Калькулятор (Тахлил)'))}</button>
          <button type="button" class="sm-subtab ${state.subtab === 'journal' ? 'is-active' : ''}" data-gr-tab="journal">📋 ${esc(txt('Журнал ва таҳлили фан', 'Журнал и аналитика'))}</button>
          <button type="button" class="sm-subtab ${state.subtab === 'roh' ? 'is-active' : ''}" data-gr-tab="roh">🏫 ${esc(txt('Роҳбари синф', 'Рохбари синф'))}</button>
        </div>
        ${state.subtab === 'calc' ? calcViewHtml : (state.subtab === 'roh' ? rohViewHtml : journalViewHtml)}
      `);

      // Subtab switcher
      panel.querySelectorAll('[data-gr-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.subtab = btn.dataset.grTab || 'journal';
          renderGrades({ refresh: false });
        });
      });

      // Calculator events (update live output directly without losing input focus)
      const updateLiveCalcDom = () => {
        const curEl = panel.querySelector('#smTahCur');
        const ctrlEl = panel.querySelector('#smTahCtrl');
        state.calcCur = curEl ? curEl.value : state.calcCur;
        state.calcCtrl = ctrlEl ? ctrlEl.value : state.calcCtrl;
        const out = panel.querySelector('#smTahLiveOut');
        if (out) out.innerHTML = renderCalcResultMarkup(state.calcCur, state.calcCtrl);
      };
      panel.querySelector('#smTahCur')?.addEventListener('input', updateLiveCalcDom);
      panel.querySelector('#smTahCtrl')?.addEventListener('input', updateLiveCalcDom);
      panel.querySelectorAll('[data-tah-pidx]').forEach(inp => {
        inp.addEventListener('input', () => {
          const idx = Number(inp.dataset.tahPidx);
          if (state.calcPeriods[idx]) state.calcPeriods[idx].val = inp.value;
          const out = panel.querySelector('#smTahPeriodsOut');
          if (out) out.innerHTML = renderPeriodSummaryMarkup();
        });
      });
      panel.querySelector('#smTahApplyToStudent')?.addEventListener('click', async () => {
        const score = computeTahlilScore(state.calcCur, state.calcCtrl);
        const sIdx = Number(panel.querySelector('#smTahTargetStudent')?.value || 0);
        const st = state.rows[sIdx];
        if (!score || !st) return;
        st.current_grades = score.currentGrades;
        st.control_grades = score.controlGrades;
        st.grade = score.finalGrade;
        await saveQuarterGrades(ctx(), {
          yearStart: state.yearStart,
          period: state.period,
          classCode: state.classCode,
          subject: state.subject,
          periodStart: state.periodStart,
          periodEnd: state.periodEnd,
          entries: [st],
        });
        state.statusMsg = txt(`Баҳои ${score.finalGrade} барои ${st.student_name} сабт шуд.`, `Оценка ${score.finalGrade} записана для ${st.student_name}.`);
        state.subtab = 'journal';
        await renderGrades({ refresh: true });
      });

      // Journal events
      const syncScopeInputs = () => {
        state.period = panel.querySelector('#smGrPeriod')?.value || state.period;
        state.classCode = (panel.querySelector('#smGrClass')?.value || state.classCode).trim().toUpperCase();
        state.subject = (panel.querySelector('#smGrSubject')?.value || state.subject).trim();
        state.periodStart = panel.querySelector('#smGrStart')?.value || '';
        state.periodEnd = panel.querySelector('#smGrEnd')?.value || '';
      };
      const readRowsFromDom = () => state.rows.map((r, i) => {
        const curArr = parseTahlilNumbers(panel.querySelector(`[data-gr-cur="${i}"]`)?.value ?? r.current_grades);
        const ctrlArr = parseTahlilNumbers(panel.querySelector(`[data-gr-ctrl="${i}"]`)?.value ?? r.control_grades);
        const rawVal = panel.querySelector(`[data-gr-val="${i}"]`)?.value;
        let g = rawVal === '' || rawVal === undefined ? null : Number(rawVal);
        if (g === null && (curArr.length || ctrlArr.length)) {
          g = computeTahlilScore(curArr, ctrlArr)?.finalGrade ?? null;
        }
        return {
          ...r,
          student_name: panel.querySelector(`[data-gr-name="${i}"]`)?.value.trim() || r.student_name,
          current_grades: curArr,
          control_grades: ctrlArr,
          grade: g,
          absent_hours: Number(panel.querySelector(`[data-gr-abs="${i}"]`)?.value || 0),
          period_start: state.periodStart || null,
          period_end: state.periodEnd || null,
        };
      });

      panel.querySelectorAll('[data-gr-cls-pick]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.classCode = btn.dataset.grClsPick || state.classCode;
          state.rohSubjects = [...getSubjectsForClassCode(state.classCode)];
          renderGrades({ refresh: true });
        });
      });
      panel.querySelector('#smGrPeriod')?.addEventListener('change', () => { syncScopeInputs(); renderGrades({ refresh: true }); });
      panel.querySelector('#smGrClass')?.addEventListener('change', () => {
        syncScopeInputs();
        state.rohSubjects = [...getSubjectsForClassCode(state.classCode)];
        renderGrades({ refresh: true });
      });
      panel.querySelector('#smGrSubject')?.addEventListener('change', () => { syncScopeInputs(); renderGrades({ refresh: true }); });
      panel.querySelector('#smGrStart')?.addEventListener('change', () => { syncScopeInputs(); renderGrades({ refresh: false }); });
      panel.querySelector('#smGrEnd')?.addEventListener('change', () => { syncScopeInputs(); renderGrades({ refresh: false }); });

      // Auto-recalculate row grade & badge live when typing current/control grades
      panel.querySelectorAll('[data-gr-cur],[data-gr-ctrl]').forEach(inp => {
        inp.addEventListener('input', () => {
          const i = Number(inp.dataset.grCur ?? inp.dataset.grCtrl);
          const curStr = panel.querySelector(`[data-gr-cur="${i}"]`)?.value || '';
          const ctrlStr = panel.querySelector(`[data-gr-ctrl="${i}"]`)?.value || '';
          const score = computeTahlilScore(curStr, ctrlStr);
          if (score) {
            const valEl = panel.querySelector(`[data-gr-val="${i}"]`);
            const chipEl = panel.querySelector(`[data-gr-chip="${i}"]`);
            if (valEl) valEl.value = String(score.finalGrade);
            if (chipEl) {
              chipEl.textContent = String(score.finalGrade);
              chipEl.className = `sm-tahlil-chip ${gradeTierClass(score.finalGrade)}`;
            }
          }
        });
      });

      panel.querySelector('#smGrAddStudent')?.addEventListener('click', () => {
        state.rows = readRowsFromDom();
        state.rows.push({ student_name: '', class_code: state.classCode, current_grades: [], control_grades: [], grade: 8, absent_hours: 0 });
        renderGrades({ refresh: false });
      });
      panel.querySelector('#smGrSaveBtn')?.addEventListener('click', async () => {
        syncScopeInputs();
        const edited = readRowsFromDom().filter(r => r.student_name);
        await saveQuarterGrades(ctx(), {
          yearStart: state.yearStart,
          period: state.period,
          classCode: state.classCode,
          subject: state.subject,
          periodStart: state.periodStart,
          periodEnd: state.periodEnd,
          entries: edited,
        });
        state.statusMsg = txt('Баҳоҳо сабт шуданд ва таҳлил навсозӣ гардид.', 'Оценки сохранены, аналитика обновлена.');
        await renderGrades({ refresh: true });
        if (canAnalytics) renderAnalytics();
      });
      panel.querySelector('#smGrPrintBtn')?.addEventListener('click', () => window.print());

      // Rohbari sinf events
      panel.querySelector('#smRohClass')?.addEventListener('change', ev => {
        state.classCode = (ev.target.value || state.classCode).trim().toUpperCase();
        state.rohSubjects = [...getSubjectsForClassCode(state.classCode)];
        state.rohEditing = false;
        renderGrades({ refresh: true });
      });
      panel.querySelector('#smRohPeriod')?.addEventListener('change', ev => {
        state.period = ev.target.value || state.period;
        renderGrades({ refresh: true });
      });
      panel.querySelectorAll('[data-roh-subj]').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = btn.dataset.rohSubj;
          if (!s) return;
          if (state.rohSubjects.includes(s)) state.rohSubjects = state.rohSubjects.filter(x => x !== s);
          else state.rohSubjects.push(s);
          renderGrades({ refresh: false });
        });
      });
      panel.querySelector('#smRohAddSubjBtn')?.addEventListener('click', () => {
        const v = panel.querySelector('#smRohAddSubjInp')?.value.trim();
        if (v && !state.rohSubjects.includes(v)) state.rohSubjects.push(v);
        renderGrades({ refresh: false });
      });
      panel.querySelectorAll('[data-roh-edit-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.rohFocusIdx = Number(btn.dataset.rohEditIdx || 0);
          state.rohEditing = true;
          renderGrades({ refresh: false });
        });
      });
      panel.querySelector('#smRohBackTableBtn')?.addEventListener('click', () => {
        state.rohEditing = false;
        renderGrades({ refresh: false });
      });
      panel.querySelector('#smRohSaveStudentBtn')?.addEventListener('click', async () => {
        const stRow = rohSummaryRows[state.rohFocusIdx];
        if (!stRow) return;
        for (let sIdx = 0; sIdx < state.rohSubjects.length; sIdx += 1) {
          const sub = state.rohSubjects[sIdx];
          const val = panel.querySelector(`[data-roh-sidx="${sIdx}"]`)?.value;
          const num = val === '' || val === undefined ? null : Number(val);
          if (num !== null && Number.isFinite(num)) {
            await saveQuarterGrades(ctx(), {
              yearStart: state.yearStart,
              period: state.period,
              classCode: state.classCode,
              subject: sub,
              entries: [{ student_name: stRow.name, grade: num, absent_hours: 0 }],
            });
          }
        }
        state.statusMsg = txt(`Баҳоҳои ${stRow.name} сабт шуданд.`, `Оценки ${stRow.name} сохранены.`);
        if (state.rohFocusIdx < rohSummaryRows.length - 1) {
          state.rohFocusIdx += 1;
        } else {
          state.rohEditing = false;
        }
        await renderGrades({ refresh: true });
        if (canAnalytics) renderAnalytics();
      });
      panel.querySelector('#smRohPrintBtn')?.addEventListener('click', () => window.print());
      panel.querySelector('#smRohPrintStudentBtn')?.addEventListener('click', () => window.print());
    };
  }

  // ============================================================================
  // PANEL 5: SCHOOL / SIFAT / MAORIF ANIMATED ANALYTICS
  // ============================================================================
  let renderAnalytics = () => {};
  if (canAnalytics) {
    const panel = createPanel(article, 'smAnalyticsPanel');
    registerModule(
      'smAnalyticsPanel',
      '📈',
      isAuthority ? 'Мониторинги мактабҳо ва сифат' : 'Диаграммаҳои сифат ва маълумот',
      isAuthority ? 'Мониторинг школ и качества' : 'Диаграммы качества и статистика',
      'Нақшаҳои аниматсионӣ барои мактаб, бахши сифат ва маориф/раёсат',
      'Анимированные графики по школе, качеству обучения и маориф/раёсат',
    );

    renderAnalytics = async () => {
      const summary = await loadAnalyticsSummary(ctx(), 2026);
      const l = getLang();
      const qPct = summary.grades?.quality_pct ?? (summary.grades?.assessed ? Number(((summary.grades.quality_count / summary.grades.assessed) * 100).toFixed(1)) : 0);
      const pPct = summary.grades?.pass_pct ?? (summary.grades?.assessed ? Number(((summary.grades.passed_count / summary.grades.assessed) * 100).toFixed(1)) : 0);

      panel.innerHTML = `
        <h2 tabindex="-1">${esc(txt('Таҳлили зиндаи сифат ва омори муассиса', 'Живая аналитика качества и сводка'))}</h2>
        ${dbLockBannerHtml()}
        <p class="small">${esc(summary.organization_name || '')}</p>
        <div class="sm-p2-kpis">
          <div class="sm-p2-kpi"><span>${esc(txt('Хонандагон', 'Учеников'))}</span><b>${summary.student_count || 0}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Сифати таҳсилот', 'Качество знаний'))}</span><b>${qPct}%</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Азхудкунӣ', 'Успеваемость'))}</span><b>${pPct}%</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Баҳои миёна', 'Средний балл'))}</span><b>${summary.grades?.avg_grade ?? 0}</b></div>
        </div>
        <div class="sm-chart-grid">
          ${renderQualityRingSvg({ qualityPct: qPct, passPct: pPct, avgGrade: summary.grades?.avg_grade || 0, lang: l })}
          ${renderQuarterBarsSvg(summary.periods || [], l)}
        </div>
        ${renderTerritoryBarsSvg(summary.schools || [], l)}
      `;
    };
  }

  // ============================================================================
  // PANEL 7: КОРБАРОН (Доступно барои ҳамаи 24 вазифа + тасдиқи аккаунтҳо)
  // ============================================================================
  let renderUsers = async () => {};
  if (canUsers) {
    registerModule(
      'smUsersPanel',
      '👤',
      'Корбарон',
      'Пользователи',
      'Кормандон, дастгоҳҳои ман ва тасдиқи бақайдгирии нав',
      'Коллеги, мои устройства и верификация новых аккаунтов',
    );
    const panel = createPanel(article, 'smUsersPanel');
    const state = {
      items: [],
      colleagues: [],
      myDevices: [],
      search: '',
      statusFilter: 'all',
      orgFilter: 'all',
      statusMsg: '',
      issuedPass: null,
      loading: false,
      loadedOnce: false,
    };

    const verifBadge = st => {
      const map = {
        verified: txt('Тасдиқшуда', 'Верифицирован'),
        pending: txt('Интизор', 'Ожидает'),
        rejected: txt('Радшуда', 'Отклонён'),
        unverified: txt('Бе тасдиқ', 'Не вериф.'),
      };
      const cls = st === 'verified' ? 'verified' : st === 'pending' ? 'pending' : st === 'rejected' ? 'rejected' : 'unverified';
      return `<span class="sm-badge sm-badge-${cls}">${esc(map[st || 'unverified'] || st)}</span>`;
    };

    const renderUsersUi = () => {
      const c = ctx();
      const cl = getAuthedCloudClient();
      const isManager = canPositionManageUsers(cabinetId) || canPositionManageUsers(c.primaryPosition);
      const canVerifyAccounts = isAuthority || canPositionVerifySchoolStaff(cabinetId) || canPositionVerifySchoolStaff(c.primaryPosition);
      const pendingUsers = state.items.filter(u => u.verification_status === 'pending');
      setModuleBadge('smUsersPanel', isManager || canVerifyAccounts ? pendingUsers.length : 0);
      emitNotificationsSnapshot({ accountVerifications: (isManager || canVerifyAccounts) ? pendingUsers : [] });

      if (!cl) {
        panel.innerHTML = `
          <h2 tabindex="-1">${esc(txt('Корбарон ва дастгоҳҳо', 'Пользователи и устройства'))}</h2>
          <div class="notice">
            <p class="small">${esc(txt('Барои дидани корбарони муассиса, дастгоҳҳои худ ва тасдиқи дархостҳои бақайдгирӣ аввал бо ҳисоби системавии худ ворид шавед.', 'Для просмотра коллег, своих устройств и подтверждения новых заявок войдите в аккаунт системы.'))}</p>
            <button type="button" class="button" id="smUsrOpenCloudBtn">${esc(txt('Ворид шудан ба система', 'Войти в систему'))}</button>
          </div>
        `;
        panel.querySelector('#smUsrOpenCloudBtn')?.addEventListener('click', () => {
          const btn = document.querySelector('[data-cloud-panel-trigger]');
          btn?.click?.();
        });
        return;
      }

      if (!c.verified) {
        panel.innerHTML = `
          <h2 tabindex="-1">${esc(txt('Корбарон ва дастгоҳҳо', 'Пользователи и устройства'))}</h2>
          ${dbLockBannerHtml()}
        `;
        return;
      }

      const myDevicesSectionHtml = `
        <section class="section" style="margin-bottom:14px">
          <h3>📱 ${esc(txt('Дастгоҳҳои ман', 'Мои устройства'))}</h3>
          ${state.myDevices.length ? `
            <ul class="sm-device-list">
              ${state.myDevices.map(d => {
                const icon = d.device_kind === 'mobile' ? '📱' : '🖥';
                const seen = (d.last_seen_at || '').replace('T', ' ').slice(0, 16);
                return `
                  <li class="sm-device-row">
                    <span>${icon} <strong>${esc(d.device_label || 'Web')}</strong>${seen ? ` · <span class="small">${esc(seen)}</span>` : ''}</span>
                    <button type="button" class="button alt" data-my-dev-revoke="${esc(d.device_id)}" data-org="${esc(d.organization_id || c.orgId)}">${esc(txt('Қатъ кардан', 'Отвязать'))}</button>
                  </li>
                `;
              }).join('')}
            </ul>
          ` : `<p class="small">${esc(txt('Ҳанӯз дастгоҳи фаъол сабт нашудааст.', 'Активных привязанных устройств нет.'))}</p>`}
        </section>
      `;

      // Regular non-manager role view: Colleagues directory + own devices
      if (!isManager) {
        const q = state.search.trim().toLowerCase();
        const cols = state.colleagues.filter(u => {
          if (!q) return true;
          const hay = `${u.full_name || ''} ${u.primary_position || ''} ${u.organization_name || ''}`.toLowerCase();
          return hay.includes(q);
        });
        setPanelHtml(panel, `
          <h2 tabindex="-1">${esc(txt('Корбарон ва дастгоҳҳои ман', 'Коллеги и мои устройства'))}</h2>
          ${myDevicesSectionHtml}
          <section class="section">
            <h3>👥 ${esc(txt('Ҳамкорони муассиса', 'Сотрудники учреждения'))} (${state.colleagues.length})</h3>
            <div class="sm-p2-grid">
              <label class="field"><span>${esc(txt('Ҷустуҷӯ (ном, вазифа)', 'Поиск (ФИО, должность)'))}</span>
                <input id="smUsrSearch" type="search" value="${esc(state.search)}" placeholder="${esc(txt('Ном ё вазифаро нависед', 'Введите имя или должность'))}">
              </label>
              <div class="control" style="align-self:end;margin:0">
                <button type="button" class="button alt" id="smUsrReloadBtn" ${state.loading ? 'disabled' : ''}>${esc(txt('Навсозӣ', 'Обновить'))}</button>
              </div>
            </div>
            <p class="small" role="status" id="smUsrStatusMsg">${esc(state.statusMsg)}</p>
            <div class="table-scroll">
              <table>
                <thead><tr><th>№</th><th>${esc(txt('Корманд', 'Сотрудник'))}</th><th>${esc(txt('Вазифа', 'Должность'))}</th><th>${esc(txt('Ҳолат', 'Статус'))}</th></tr></thead>
                <tbody>
                  ${cols.length ? cols.map((u, idx) => `
                    <tr>
                      <td>${idx + 1}</td>
                      <td><strong>${esc(u.full_name || '—')}</strong></td>
                      <td>${esc(formatPositionTitle(u.primary_position, getLang()))}</td>
                      <td>${verifBadge(u.verification_status)}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="4" class="small">${esc(txt('Ҳамкорон ёфт нашуданд.', 'Коллеги не найдены.'))}</td></tr>`}
                </tbody>
              </table>
            </div>
          </section>
        `);
        panel.querySelector('#smUsrSearch')?.addEventListener('input', ev => {
          state.search = ev.target.value;
          renderUsersUi();
          const inp = panel.querySelector('#smUsrSearch');
          if (inp) {
            inp.focus();
            try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch {}
          }
        });
        panel.querySelector('#smUsrReloadBtn')?.addEventListener('click', () => renderUsers({ refresh: true }));
        panel.querySelectorAll('[data-my-dev-revoke]').forEach(btn => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              await cl.revokeMyDeviceSession({ p_org_id: btn.dataset.org, p_device_id: btn.dataset.myDevRevoke });
              state.statusMsg = txt('Дастгоҳ ҷудо карда шуд.', 'Устройство отвязано.');
              await renderUsers({ refresh: true });
            } catch (err) {
              state.statusMsg = err?.message || 'Error';
              renderUsersUi();
            }
          });
        });
        return;
      }

      const orgMap = new Map();
      for (const u of state.items) {
        if (u.organization_id && !orgMap.has(u.organization_id)) orgMap.set(u.organization_id, u.organization_name || u.organization_id);
      }

      const q = state.search.trim().toLowerCase();
      const filtered = state.items.filter(u => {
        if (state.statusFilter === 'pending' && u.verification_status !== 'pending') return false;
        if (state.statusFilter === 'verified' && u.verification_status !== 'verified') return false;
        if (state.statusFilter === 'disabled' && u.account_active !== false) return false;
        if (state.orgFilter !== 'all' && u.organization_id !== state.orgFilter) return false;
        if (q) {
          const hay = `${u.full_name || ''} ${u.login_name || ''} ${u.phone || ''} ${u.organization_name || ''} ${u.primary_position || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const totalCount = state.items.length;
      const pendingCount = pendingUsers.length;
      const verifiedCount = state.items.filter(u => u.verification_status === 'verified').length;
      const disabledCount = state.items.filter(u => u.account_active === false).length;

      const hierarchyNote = cabinetId.startsWith('raesat-')
        ? txt('Шумо метавонед шуъбаҳои маориф ва мактабҳои вилоятро тасдиқ, бозсозии рамз, қатъи дастгоҳ ё идора кунед.', 'Вы управляете отделами Маориф и школами области.')
        : cabinetId.startsWith('office-')
          ? txt('Шумо метавонед роҳбарон ва кормандони мактабҳои шаҳр / ноҳияро идора кунед.', 'Вы управляете директорами и сотрудниками школ вашего района / города.')
          : cabinetId === 'school-director'
            ? txt('Директор ҳамаи кормандони мактабро идора мекунад: тасдиқ, қатъи дастгоҳ, рамзи нав ва хориҷкунӣ.', 'Директор управляет всеми сотрудниками школы: подтверждение, сброс устройств, пароль и удаление.')
            : txt('Шумо метавонед кормандони мактабро (ғайр аз директор) тасдиқ, қатъи дастгоҳ ё бозсозии рамз кунед.', 'Вы управляете сотрудниками школы (кроме директора): подтверждение, сброс устройств и пароля.');

      setPanelHtml(panel, `
        <h2 tabindex="-1">${esc(txt('Корбарон, верификатсияи бақайдгирӣ ва дастгоҳҳо', 'Пользователи, верификация аккаунтов и устройства'))}</h2>
        <p class="small">${esc(hierarchyNote)}</p>
        ${pendingCount > 0 ? `
          <div class="notice" style="border-left:4px solid #dc2626">
            <strong>🔔 ${esc(txt(`Дархостҳои нави бақайдгирӣ (${pendingCount})`, `Новые заявки на регистрацию (${pendingCount})`))}</strong>
            <p class="small">${esc(txt('Барои он ки шахсони бегона ба мактаб ворид нашаванд, бақайдгириҳои навро тафтиш ва тасдиқ ё рад кунед.', 'Проверьте новые заявки, чтобы посторонние не попали в школу — подтвердите или отклоните каждую.'))}</p>
          </div>
        ` : ''}
        <div class="sm-p2-kpis">
          <div class="sm-p2-kpi"><span>${esc(txt('Ҳамаи корбарон', 'Всего пользователей'))}</span><b>${totalCount}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Интизори тасдиқ', 'Ожидают подтверждения'))}</span><b>${pendingCount}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Тасдиқшуда', 'Верифицированы'))}</span><b>${verifiedCount}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Ғайрифаъол', 'Отключённые'))}</span><b>${disabledCount}</b></div>
        </div>
        ${state.issuedPass ? `
          <div class="sm-issued-box" role="status">
            <strong>${esc(txt('Рамзи муваққатии нав омода шуд:', 'Новый временный пароль создан:'))}</strong>
            <div>${esc(state.issuedPass.full_name || state.issuedPass.email || '')} · <code>${esc(state.issuedPass.temporary_password)}</code></div>
            <div class="control" style="margin:0">
              <button type="button" class="button" id="smUsrCopyPassBtn">${esc(txt('Нусхабардорӣ', 'Копировать'))}</button>
              <button type="button" class="button alt" id="smUsrHidePassBtn">${esc(txt('Пӯшидан', 'Скрыть'))}</button>
            </div>
          </div>
        ` : ''}
        <div class="sm-p2-grid">
          <label class="field"><span>${esc(txt('Ҷустуҷӯ (ном, логин, телефон)', 'Поиск (ФИО, логин, телефон)'))}</span>
            <input id="smUsrSearch" type="search" value="${esc(state.search)}" placeholder="${esc(txt('Ном ё рақамро нависед', 'Введите имя или номер'))}">
          </label>
          <label class="field"><span>${esc(txt('Ҳолат', 'Статус'))}</span>
            <select id="smUsrStatus">
              <option value="all"${state.statusFilter === 'all' ? ' selected' : ''}>${esc(txt('Ҳама', 'Все'))}</option>
              <option value="pending"${state.statusFilter === 'pending' ? ' selected' : ''}>${esc(txt('Интизори тасдиқ', 'Ожидают подтверждения'))}</option>
              <option value="verified"${state.statusFilter === 'verified' ? ' selected' : ''}>${esc(txt('Тасдиқшуда', 'Верифицированные'))}</option>
              <option value="disabled"${state.statusFilter === 'disabled' ? ' selected' : ''}>${esc(txt('Ғайрифаъол', 'Отключённые'))}</option>
            </select>
          </label>
          ${orgMap.size > 1 ? `
            <label class="field"><span>${esc(txt('Муассиса / Мактаб', 'Организация / Школа'))}</span>
              <select id="smUsrOrg">
                <option value="all"${state.orgFilter === 'all' ? ' selected' : ''}>${esc(txt('Ҳамаи муассисаҳо', 'Все организации'))}</option>
                ${[...orgMap.entries()].map(([id, name]) => `<option value="${esc(id)}"${state.orgFilter === id ? ' selected' : ''}>${esc(name)}</option>`).join('')}
              </select>
            </label>
          ` : ''}
          <div class="control" style="align-self:end;margin:0">
            <button type="button" class="button alt" id="smUsrReloadBtn" ${state.loading ? 'disabled' : ''}>${esc(txt('Навсозӣ', 'Обновить'))}</button>
          </div>
        </div>
        <p class="small" role="status" id="smUsrStatusMsg">${esc(state.statusMsg)}</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>${esc(txt('Корбар ва логин', 'Пользователь и логин'))}</th>
                <th>${esc(txt('Муассиса ва вазифа', 'Организация и должность'))}</th>
                <th>${esc(txt('Ҳолат ва дастгоҳҳо', 'Статус и устройства'))}</th>
                <th>${esc(txt('Амалҳо', 'Действия'))}</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length ? filtered.map(u => {
                const posTitle = formatPositionTitle(u.primary_position, getLang());
                const extras = Array.isArray(u.extra_positions) && u.extra_positions.length
                  ? ` (+ ${u.extra_positions.map(p => formatPositionTitle(p, getLang())).join(', ')})`
                  : '';
                const devs = Array.isArray(u.devices) ? u.devices : [];
                const activeBadge = u.account_active === false
                  ? `<span class="sm-badge sm-badge-disabled">${esc(txt('Ғайрифаъол', 'Отключён'))}</span>`
                  : `<span class="sm-badge sm-badge-active">${esc(txt('Фаъол', 'Активен'))}</span>`;
                const metaParts = [u.phone, u.birth_date ? `${txt('Тав.', 'Рожд.')}: ${u.birth_date}` : '', u.passport_number ? `${txt('Шиноснома', 'Паспорт')}: ${u.passport_number}` : ''].filter(Boolean).join(' · ');
                return `
                  <tr>
                    <td>
                      <strong>${esc(u.full_name || u.login_name || '—')}</strong>
                      <div class="small">${esc(u.login_name || '')}</div>
                      ${metaParts ? `<div class="small">${esc(metaParts)}</div>` : ''}
                    </td>
                    <td>
                      <strong>${esc(u.organization_name || '—')}</strong>
                      <div class="small">${esc(posTitle)}${esc(extras)}${u.custom_method_name ? ` · ${esc(u.custom_method_name)}` : ''}</div>
                    </td>
                    <td>
                      <div class="pill-row">${verifBadge(u.verification_status)} ${activeBadge}</div>
                      <div class="small">${esc(txt('Дастгоҳҳо', 'Устройства'))}: ${devs.length}/${esc(String(u.max_devices ?? 2))}</div>
                      ${devs.length ? `
                        <div class="sm-user-dev-list">
                          ${devs.map(d => `
                            <span class="sm-user-dev-chip">
                              ${d.device_kind === 'mobile' ? '📱' : '🖥'} ${esc(d.device_label || 'Web')}
                              <button type="button" title="${esc(txt('Ҷудо кардани дастгоҳ', 'Отвязать устройство'))}" data-usr-unlink="${esc(d.device_id)}" data-mem="${esc(u.membership_id)}">✕</button>
                            </span>
                          `).join('')}
                        </div>
                      ` : ''}
                    </td>
                    <td>
                      <div class="sm-p2-actions" style="margin:0">
                        ${u.verification_status !== 'verified' ? `<button type="button" class="button" data-usr-verify="verified" data-mem="${esc(u.membership_id)}">${esc(txt('Тасдиқ кардан', 'Подтвердить'))}</button>` : ''}
                        ${u.verification_status === 'pending' ? `<button type="button" class="button alt" data-usr-verify="rejected" data-mem="${esc(u.membership_id)}">${esc(txt('Рад кардан', 'Отклонить'))}</button>` : ''}
                        ${devs.length ? `<button type="button" class="button alt" data-usr-reset-dev="${esc(u.membership_id)}">${esc(txt('Қатъи дастгоҳҳо', 'Сброс устройств'))}</button>` : ''}
                        <button type="button" class="button alt" data-usr-reset-pass="${esc(u.user_id)}" data-org="${esc(u.organization_id)}">${esc(txt('Рамзи нав', 'Новый пароль'))}</button>
                        <button type="button" class="button alt" data-usr-toggle="${u.account_active === false ? '1' : '0'}" data-mem="${esc(u.membership_id)}">${esc(u.account_active === false ? txt('Фаъол кардан', 'Включить') : txt('Ғайрифаъол кардан', 'Отключить'))}</button>
                        <button type="button" class="button alt" data-usr-delete="${esc(u.user_id)}" data-org="${esc(u.organization_id)}" data-name="${esc(u.full_name || u.login_name || '')}">${esc(txt('Ҳазф', 'Удалить'))}</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="4" class="small">${esc(txt('Ягон корбар ёфт нашуд.', 'Пользователи не найдены.'))}</td></tr>`}
            </tbody>
          </table>
        </div>
        ${myDevicesSectionHtml}
      `);

      panel.querySelector('#smUsrSearch')?.addEventListener('input', ev => {
        state.search = ev.target.value;
        renderUsersUi();
        const inp = panel.querySelector('#smUsrSearch');
        if (inp) {
          inp.focus();
          try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch {}
        }
      });
      panel.querySelector('#smUsrStatus')?.addEventListener('change', ev => {
        state.statusFilter = ev.target.value;
        renderUsersUi();
      });
      panel.querySelector('#smUsrOrg')?.addEventListener('change', ev => {
        state.orgFilter = ev.target.value;
        renderUsersUi();
      });
      panel.querySelector('#smUsrReloadBtn')?.addEventListener('click', () => renderUsers({ refresh: true }));
      panel.querySelector('#smUsrCopyPassBtn')?.addEventListener('click', async () => {
        if (!state.issuedPass?.temporary_password) return;
        try { await navigator.clipboard?.writeText(state.issuedPass.temporary_password); } catch {}
        state.statusMsg = txt('Рамз нусхабардорӣ шуд.', 'Пароль скопирован.');
        renderUsersUi();
      });
      panel.querySelector('#smUsrHidePassBtn')?.addEventListener('click', () => {
        state.issuedPass = null;
        renderUsersUi();
      });
      panel.querySelectorAll('[data-my-dev-revoke]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await cl.revokeMyDeviceSession({ p_org_id: btn.dataset.org, p_device_id: btn.dataset.myDevRevoke });
            state.statusMsg = txt('Дастгоҳ ҷудо карда шуд.', 'Устройство отвязано.');
            await renderUsers({ refresh: true });
          } catch (err) {
            state.statusMsg = err?.message || 'Error';
            renderUsersUi();
          }
        });
      });

      panel.querySelectorAll('[data-usr-unlink]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await cl.manageResetUserDevices({ p_membership_id: btn.dataset.mem, p_device_id: btn.dataset.usrUnlink });
            state.statusMsg = txt('Дастгоҳ ҷудо карда шуд.', 'Устройство отвязано.');
            await renderUsers({ refresh: true });
          } catch (err) {
            state.statusMsg = err?.message || 'Error';
            renderUsersUi();
          }
        });
      });

      panel.querySelectorAll('[data-usr-reset-dev]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await cl.manageResetUserDevices({ p_membership_id: btn.dataset.usrResetDev, p_device_id: null });
            state.statusMsg = txt('Ҳамаи дастгоҳҳои корбар қатъ шуданд.', 'Все устройства пользователя сброшены.');
            await renderUsers({ refresh: true });
          } catch (err) {
            state.statusMsg = err?.message || 'Error';
            renderUsersUi();
          }
        });
      });

      panel.querySelectorAll('[data-usr-verify]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const decision = btn.dataset.usrVerify;
          try {
            await cl.reviewAccountVerification({ p_membership_id: btn.dataset.mem, p_decision: decision, p_note: '' });
            state.statusMsg = decision === 'verified'
              ? txt('Ҳисоб тасдиқ карда шуд.', 'Аккаунт подтверждён.')
              : txt('Дархост рад ва нест карда шуд.', 'Заявка отклонена и удалена.');
            await renderUsers({ refresh: true });
          } catch (err) {
            state.statusMsg = err?.message || 'Error';
            renderUsersUi();
          }
        });
      });

      panel.querySelectorAll('[data-usr-reset-pass]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const res = await cl.managerResetPassword({ user_id: btn.dataset.usrResetPass, org_id: btn.dataset.org });
            state.issuedPass = res;
            state.statusMsg = txt('Рамзи муваққатии нав сохта шуд.', 'Создан новый временный пароль.');
            renderUsersUi();
          } catch (err) {
            state.statusMsg = err?.message || 'Error';
            renderUsersUi();
          }
        });
      });

      panel.querySelectorAll('[data-usr-toggle]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const nextActive = btn.dataset.usrToggle === '1';
          try {
            await cl.manageSetUserActive({ p_membership_id: btn.dataset.mem, p_active: nextActive });
            state.statusMsg = nextActive
              ? txt('Ҳисоб фаъол карда шуд.', 'Аккаунт включён.')
              : txt('Ҳисоб ғайрифаъол карда шуд.', 'Аккаунт отключён.');
            await renderUsers({ refresh: true });
          } catch (err) {
            state.statusMsg = err?.message || 'Error';
            renderUsersUi();
          }
        });
      });

      panel.querySelectorAll('[data-usr-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const targetName = btn.dataset.name || '';
          const msg = txt(
            `Корбар «${targetName}»-ро аз муассиса комилан ҳазф мекунед?`,
            `Удалить пользователя «${targetName}» из организации?`,
          );
          const ok = await smConfirm({
            title: txt('Тасдиқи ҳазф', 'Подтверждение удаления'),
            message: msg,
            confirmLabel: txt('Ҳазф', 'Удалить'),
            cancelLabel: txt('Бекор', 'Отмена'),
            danger: true,
          });
          if (!ok) return;
          btn.disabled = true;
          try {
            await cl.managerDeleteUser({ user_id: btn.dataset.usrDelete, org_id: btn.dataset.org });
            if (state.issuedPass?.user_id === btn.dataset.usrDelete) state.issuedPass = null;
            state.statusMsg = txt('Корбар ҳазф карда шуд.', 'Пользователь удалён.');
            await renderUsers({ refresh: true });
          } catch (err) {
            state.statusMsg = err?.message || 'Error';
            renderUsersUi();
          }
        });
      });
    };

    renderUsers = async ({ refresh = true } = {}) => {
      const cl = getAuthedCloudClient();
      const c = ctx();
      const isManager = canPositionManageUsers(cabinetId) || canPositionManageUsers(c.primaryPosition);
      if (refresh && cl && c.verified) {
        state.loading = true;
        renderUsersUi();
        try {
          const [devs, listRows] = await Promise.all([
            cl.getMyDeviceSessions(c.orgId && /^[0-9a-f-]{36}$/i.test(c.orgId) ? c.orgId : null).catch(() => []),
            isManager
              ? cl.getManagedUsers(null).catch(() => [])
              : loadColleaguesDirectory(c).catch(() => []),
          ]);
          state.myDevices = Array.isArray(devs) ? devs : [];
          if (isManager) {
            state.items = Array.isArray(listRows) ? listRows : [];
          } else {
            state.colleagues = Array.isArray(listRows) ? listRows : [];
          }
          state.loadedOnce = true;
        } catch (err) {
          state.statusMsg = err?.message || 'Error';
        } finally {
          state.loading = false;
        }
      }
      renderUsersUi();
    };
  }

  // ============================================================================
  // PANEL 8: ROLE-SPECIFIC WORKSPACE (COVERING ALL 24 CABINETS)
  // ============================================================================
  const ROLE_WORKSPACE_CONFIGS = {
    'school-academic-deputy': {
      icon: '📋',
      tg: 'Назорати дохилимактабӣ ва иштирок дар дарсҳо',
      ru: 'Внутришкольный контроль и посещение уроков',
      descTg: 'Сабти санҷишҳо, дарсҳои кушод ва тавсияҳо',
      descRu: 'Учёт проверок, открытых уроков и рекомендаций',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Синф / Омӯзгор', ru: 'Класс / Учитель', type: 'text' },
        { key: 'topic', tg: 'Фан ва мавзӯъ', ru: 'Предмет и тема', type: 'text' },
        { key: 'note', tg: 'Хулоса / Тавсия', ru: 'Вывод / Рекомендация', type: 'text' },
      ],
    },
    'school-primary-deputy': {
      icon: '🎒',
      tg: 'Назорати синфҳои ибтидоӣ (1–4)',
      ru: 'Контроль начальных классов (1–4)',
      descTg: 'Ташхиси хониш, хат ва иштирок дар дарсҳо',
      descRu: 'Техника чтения, письма и посещение уроков',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Синф / Омӯзгор', ru: 'Класс / Учитель', type: 'text' },
        { key: 'topic', tg: 'Мавзӯи санҷиш', ru: 'Тема проверки', type: 'text' },
        { key: 'note', tg: 'Натиҷа', ru: 'Результат', type: 'text' },
      ],
    },
    'school-education-quality': {
      icon: '🎯',
      tg: 'Мониторинги сифати таҳсилот',
      ru: 'Мониторинг качества образования',
      descTg: 'Таҳлили тестҳо, корҳои хаттӣ ва олимпиадаҳо',
      descRu: 'Анализ срезов, контрольных работ и олимпиад',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Синф / Фан', ru: 'Класс / Предмет', type: 'text' },
        { key: 'topic', tg: 'Навъи санҷиш', ru: 'Вид среза', type: 'text' },
        { key: 'note', tg: 'Сифат (%) / Эзоҳ', ru: 'Качество (%) / Прим.', type: 'text' },
      ],
    },
    'school-upbringing-deputy': {
      icon: '🌱',
      tg: 'Дафтари корҳои тарбиявӣ',
      ru: 'Журнал воспитательной работы',
      descTg: 'Чорабиниҳо, вохӯриҳо ва пешгирии қонуншиканӣ',
      descRu: 'Мероприятия, встречи и профилактика',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Синфҳо / Фарогирӣ', ru: 'Классы / Охват', type: 'text' },
        { key: 'topic', tg: 'Номи чорабинӣ', ru: 'Название мероприятия', type: 'text' },
        { key: 'note', tg: 'Масъул / Натиҷа', ru: 'Ответственный / Итог', type: 'text' },
      ],
    },
    'school-sozmon': {
      icon: '🚩',
      tg: 'Фаъолияти Созмони талабагон',
      ru: 'Работа ученической организации (Созмон)',
      descTg: 'Ҷаласаҳо, ташаббусҳо ва чорабиниҳои талабагон',
      descRu: 'Собрания, инициативы и мероприятия учащихся',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Зина / Синфҳо', ru: 'Ступень / Классы', type: 'text' },
        { key: 'topic', tg: 'Чорабинӣ / Ташаббус', ru: 'Мероприятие / Инициатива', type: 'text' },
        { key: 'note', tg: 'Иштирокчиён', ru: 'Участники', type: 'text' },
      ],
    },
    'school-military-preparation-deputy': {
      icon: '🛡️',
      tg: 'Омодагии дифои ҳарбӣ (ОДҲ)',
      ru: 'Начальная военная подготовка (НВП)',
      descTg: 'Тамринҳо, мусобиқаҳо ва қайди даъватшавандагон',
      descRu: 'Строевая подготовка, сборы и учёт допризывников',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Синф / Гурӯҳ', ru: 'Класс / Группа', type: 'text' },
        { key: 'topic', tg: 'Машғулият / Мусобиқа', ru: 'Занятие / Соревнование', type: 'text' },
        { key: 'note', tg: 'Натиҷа / Эзоҳ', ru: 'Результат / Прим.', type: 'text' },
      ],
    },
    'school-girls-council-chair': {
      icon: '🌸',
      tg: 'Шӯрои духтарон ва кор бо хонандагон',
      ru: 'Совет девушек и профилактическая работа',
      descTg: 'Вохӯриҳо, маҳфилҳо ва корҳои фаҳмондадиҳӣ',
      descRu: 'Встречи, кружки и разъяснительная работа',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Синфҳо / Шумора', ru: 'Классы / Кол-во', type: 'text' },
        { key: 'topic', tg: 'Мавзӯи вохӯрӣ', ru: 'Тема встречи', type: 'text' },
        { key: 'note', tg: 'Натиҷа', ru: 'Результат', type: 'text' },
      ],
    },
    'school-psychologist': {
      icon: '🧠',
      tg: 'Дафтари машваратҳои психологӣ',
      ru: 'Журнал психологических консультаций',
      descTg: 'Муроҷиатҳо, ташхис ва тавсияҳои инфиродӣ',
      descRu: 'Обращения, диагностика и индивидуальные рекомендации',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Синф / Муроҷиаткунанда', ru: 'Класс / Обратившийся', type: 'text' },
        { key: 'topic', tg: 'Мавзӯъ / Сабаб', ru: 'Тема / Запрос', type: 'text' },
        { key: 'note', tg: 'Тавсия', ru: 'Рекомендации', type: 'text' },
      ],
    },
    'school-facilities-head': {
      icon: '🔧',
      tg: 'Баҳисобгирии амвол ва дархостҳои таъмир',
      ru: 'Инвентарный учёт и заявки на ремонт',
      descTg: 'Назорати синфхонаҳо, таҷҳизот ва таъмири ҷорӣ',
      descRu: 'Контроль помещений, инвентаря и текущего ремонта',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Утоқ / Объект', ru: 'Кабинет / Объект', type: 'text' },
        { key: 'topic', tg: 'Амвол / Мушкилот', ru: 'Инвентарь / Проблема', type: 'text' },
        { key: 'note', tg: 'Миқдор / Ҳолат', ru: 'Кол-во / Состояние', type: 'text' },
      ],
    },
    'school-canteen-head': {
      icon: '🍽️',
      tg: 'Таомномаи рӯзона ва назорати ошхона',
      ru: 'Ежедневное меню и контроль столовой',
      descTg: 'Бақайдгирии ғизои гарм, фарогирӣ ва санитария',
      descRu: 'Учёт горячего питания, охвата и санитарии',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Баст / Синфҳо', ru: 'Смена / Классы', type: 'text' },
        { key: 'topic', tg: 'Таомнома', ru: 'Меню / Блюда', type: 'text' },
        { key: 'note', tg: 'Шумораи хӯрокхӯрон', ru: 'Охват учащихся', type: 'text' },
      ],
    },
    'school-records-clerk': {
      icon: '🗂️',
      tg: 'Дафтари мукотибот ва фармонҳо',
      ru: 'Журнал корреспонденции и приказов',
      descTg: 'Қайди ҳуҷҷатҳои воридотӣ, содиротӣ ва фармонҳо',
      descRu: 'Регистрация входящих, исходящих и приказов',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Рақам / Навъ', ru: '№ / Тип (Вх/Исх/Приказ)', type: 'text' },
        { key: 'topic', tg: 'Мазмуни мухтасар', ru: 'Краткое содержание', type: 'text' },
        { key: 'note', tg: 'Иҷрокунанда', ru: 'Исполнитель', type: 'text' },
      ],
    },
    'school-upper-class-method-group': {
      icon: '📐',
      tg: 'Кори иттиҳодияи методии синфҳои болоӣ',
      ru: 'Работа МО старших классов',
      descTg: 'Ҷаласаҳо, дарсҳои кушод ва табодули таҷриба',
      descRu: 'Заседания, открытые уроки и обмен опытом',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Иштирокчиён', ru: 'Участники', type: 'text' },
        { key: 'topic', tg: 'Мавзӯи ҷаласа / дарс', ru: 'Тема заседания / урока', type: 'text' },
        { key: 'note', tg: 'Қарор', ru: 'Решение', type: 'text' },
      ],
    },
    'school-lower-class-method-group': {
      icon: '✏️',
      tg: 'Кори иттиҳодияи методии синфҳои ибтидоӣ',
      ru: 'Работа МО начальных классов',
      descTg: 'Методикаи таълим, дарсҳои кушод ва нақшаҳо',
      descRu: 'Методика обучения, открытые уроки и планы',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Иштирокчиён', ru: 'Участники', type: 'text' },
        { key: 'topic', tg: 'Мавзӯи ҷаласа / дарс', ru: 'Тема заседания / урока', type: 'text' },
        { key: 'note', tg: 'Қарор', ru: 'Решение', type: 'text' },
      ],
    },
    'school-five-method-groups': {
      icon: '🔬',
      tg: 'Кори иттиҳодияи методии фаннӣ',
      ru: 'Работа предметного методического объединения',
      descTg: 'Нақшаи фаннӣ, олимпиадаҳо ва маҳорати омӯзгорон',
      descRu: 'Предметный план, олимпиады и мастерство педагогов',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Фан / Омӯзгорон', ru: 'Предмет / Педагоги', type: 'text' },
        { key: 'topic', tg: 'Мавзӯъ', ru: 'Тема', type: 'text' },
        { key: 'note', tg: 'Қарор / Натиҷа', ru: 'Решение / Итог', type: 'text' },
      ],
    },
    'school-subject-room-head': {
      icon: '🖥️',
      tg: 'Шиноснома ва таҷҳизоти кабинети фаннӣ',
      ru: 'Паспорт и оснащение предметного кабинета',
      descTg: 'Таҷҳизот, воситаҳои аёнӣ ва бехатарӣ',
      descRu: 'Оборудование, наглядные пособия и безопасность',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Таҷҳизот / Восита', ru: 'Оборудование / Пособие', type: 'text' },
        { key: 'topic', tg: 'Миқдор / Вазъият', ru: 'Количество / Состояние', type: 'text' },
        { key: 'note', tg: 'Эзоҳ', ru: 'Примечание', type: 'text' },
      ],
    },
    'school-class-teacher': {
      icon: '📓',
      tg: 'Дафтари роҳбари синф',
      ru: 'Журнал классного руководителя',
      descTg: 'Соатҳои тарбиявӣ, кор бо волидайн ва давомот',
      descRu: 'Классные часы, работа с родителями и посещаемость',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Синф / Волидайн', ru: 'Класс / Родители', type: 'text' },
        { key: 'topic', tg: 'Мавзӯъ / Ҳодиса', ru: 'Тема / Событие', type: 'text' },
        { key: 'note', tg: 'Натиҷа', ru: 'Результат', type: 'text' },
      ],
    },
    'office-head': {
      icon: '🏛️',
      tg: 'Назорати супоришҳо ва муассисаҳо (Маориф)',
      ru: 'Контроль поручений и учреждений (Маориф)',
      descTg: 'Иҷрои супоришҳо, санҷиши мактабҳо ва маҷлисҳо',
      descRu: 'Исполнение поручений, проверки школ и совещания',
      fields: [
        { key: 'date', tg: 'Муҳлат', ru: 'Срок', type: 'date' },
        { key: 'target', tg: 'Муассиса / Масъул', ru: 'Учреждение / Ответственный', type: 'text' },
        { key: 'topic', tg: 'Супориш / Санҷиш', ru: 'Поручение / Проверка', type: 'text' },
        { key: 'note', tg: 'Натиҷа', ru: 'Результат', type: 'text' },
      ],
    },
    'office-clerk': {
      icon: '📑',
      tg: 'Коргузории шуъбаи маориф',
      ru: 'Делопроизводство отдела образования',
      descTg: 'Қайди мактубҳо, фармонҳо ва назорати иҷро',
      descRu: 'Регистрация писем, приказов и контроль исполнения',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Рақам / Мактаб', ru: '№ / Школа', type: 'text' },
        { key: 'topic', tg: 'Мазмуни ҳуҷҷат', ru: 'Содержание документа', type: 'text' },
        { key: 'note', tg: 'Иҷрокунанда', ru: 'Исполнитель', type: 'text' },
      ],
    },
    'raesat-head': {
      icon: '🏢',
      tg: 'Идоракунии минтақавӣ ва назорати Раёсат',
      ru: 'Региональное управление и контроль Раёсата',
      descTg: 'Супоришҳо ба шуъбаҳои маориф ва мониторинги вилоят',
      descRu: 'Поручения отделам образования и мониторинг региона',
      fields: [
        { key: 'date', tg: 'Муҳлат', ru: 'Срок', type: 'date' },
        { key: 'target', tg: 'Ноҳия / Шуъба', ru: 'Район / Отдел', type: 'text' },
        { key: 'topic', tg: 'Супориш / Масъала', ru: 'Поручение / Вопрос', type: 'text' },
        { key: 'note', tg: 'Иҷро', ru: 'Исполнение', type: 'text' },
      ],
    },
    'raesat-clerk': {
      icon: '🗃️',
      tg: 'Коргузорӣ ва бойгонии Раёсат',
      ru: 'Делопроизводство и архив Раёсата',
      descTg: 'Мукотибот бо шаҳру ноҳияҳо ва назорати муҳлатҳо',
      descRu: 'Корреспонденция с районами и контроль сроков',
      fields: [
        { key: 'date', tg: 'Сана', ru: 'Дата', type: 'date' },
        { key: 'target', tg: 'Рақам / Ноҳия', ru: '№ / Район', type: 'text' },
        { key: 'topic', tg: 'Мазмун', ru: 'Содержание', type: 'text' },
        { key: 'note', tg: 'Масъул', ru: 'Ответственный', type: 'text' },
      ],
    },
  };

  const roleCfg = ROLE_WORKSPACE_CONFIGS[cabinetId] || null;
  let renderRoleWorkspace = () => {};
  if (roleCfg) {
    registerModule('smRoleWorkspacePanel', roleCfg.icon, roleCfg.tg, roleCfg.ru, roleCfg.descTg, roleCfg.descRu);
    const rwPanel = createPanel(article, 'smRoleWorkspacePanel');
    const rwStorageKey = () => `smartmaktab.rw.v1.${cabinetId}.${ctx().organizationId || 'local'}`;
    const readRwRows = () => {
      try {
        const raw = persistentStore.getItem(rwStorageKey());
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };
    const writeRwRows = (rows) => {
      try { persistentStore.setItem(rwStorageKey(), JSON.stringify(rows)); } catch {}
    };

    renderRoleWorkspace = () => {
      const rows = readRwRows();
      const today = new Date().toISOString().slice(0, 10);
      rwPanel.innerHTML = `
        <div class="sm-card-head">
          <h3>${esc(roleCfg.icon)} ${esc(txt(roleCfg.tg, roleCfg.ru))}</h3>
          <p class="small">${esc(txt(roleCfg.descTg, roleCfg.descRu))}</p>
        </div>
        <form class="sm-grid-form" id="smRwForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px;">
          ${roleCfg.fields.map((f) => `
            <label class="sm-field">
              <span>${esc(txt(f.tg, f.ru))}</span>
              <input type="${f.type === 'date' ? 'date' : 'text'}" name="${esc(f.key)}" value="${f.type === 'date' ? today : ''}" required />
            </label>
          `).join('')}
          <label class="sm-field">
            <span>${esc(txt('Ҳолат', 'Статус'))}</span>
            <select name="status">
              <option value="planned">${esc(txt('Дар нақша', 'Запланировано'))}</option>
              <option value="done">${esc(txt('Иҷро шуд', 'Выполнено'))}</option>
            </select>
          </label>
          <div style="display:flex;align-items:end;gap:8px;">
            <button type="submit" class="button">${esc(txt('Илова кардан', 'Добавить'))}</button>
            <button type="button" class="button alt" id="smRwExportCsv">${esc(txt('CSV', 'CSV'))}</button>
          </div>
        </form>
        <div class="sm-table-wrap" style="overflow-x:auto;">
          <table class="sm-table" style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                ${roleCfg.fields.map((f) => `<th>${esc(txt(f.tg, f.ru))}</th>`).join('')}
                <th>${esc(txt('Ҳолат', 'Статус'))}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map((r, idx) => `
                <tr>
                  ${roleCfg.fields.map((f) => `<td>${esc(r[f.key] || '')}</td>`).join('')}
                  <td>
                    <button type="button" class="button alt sm-rw-toggle" data-idx="${idx}" style="padding:3px 8px;font-size:12px;">
                      ${esc(r.status === 'done' ? txt('Иҷро шуд', 'Выполнено') : txt('Дар нақша', 'Запланировано'))}
                    </button>
                  </td>
                  <td>
                    <button type="button" class="button alt sm-rw-del" data-idx="${idx}" style="padding:3px 8px;font-size:12px;">✕</button>
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="${roleCfg.fields.length + 2}" class="small">${esc(txt('Ҳанӯз сабт нест.', 'Записей пока нет.'))}</td></tr>`}
            </tbody>
          </table>
        </div>
      `;

      rwPanel.querySelector('#smRwForm')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        const entry = { status: String(fd.get('status') || 'planned') };
        for (const f of roleCfg.fields) entry[f.key] = String(fd.get(f.key) || '').trim();
        const next = [entry, ...readRwRows()];
        writeRwRows(next);
        renderRoleWorkspace();
      });

      rwPanel.querySelectorAll('.sm-rw-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = Number(btn.dataset.idx);
          const list = readRwRows();
          if (list[i]) {
            list[i].status = list[i].status === 'done' ? 'planned' : 'done';
            writeRwRows(list);
            renderRoleWorkspace();
          }
        });
      });

      rwPanel.querySelectorAll('.sm-rw-del').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = Number(btn.dataset.idx);
          const list = readRwRows().filter((_, idx) => idx !== i);
          writeRwRows(list);
          renderRoleWorkspace();
        });
      });

      rwPanel.querySelector('#smRwExportCsv')?.addEventListener('click', () => {
        const list = readRwRows();
        const headers = [...roleCfg.fields.map((f) => txt(f.tg, f.ru)), txt('Ҳолат', 'Статус')];
        const csvLines = [
          headers.join(';'),
          ...list.map((r) => [
            ...roleCfg.fields.map((f) => `"${String(r[f.key] || '').replace(/"/g, '""')}"`),
            `"${r.status === 'done' ? txt('Иҷро шуд', 'Выполнено') : txt('Дар нақша', 'Запланировано')}"`,
          ].join(';')),
        ];
        const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${cabinetId}-journal.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
    };
  }

  function refreshPanelById(id) {
    if (id === 'smStudentsPanel' && canStudents) renderStudents({ refresh: true });
    else if (id === 'smTeacherWorkloadPanel' && canWorkload) renderWorkload({ refresh: true });
    else if (id === 'smPayrollPanel' && canPayroll) renderPayroll({ refresh: true });
    else if (id === 'smGradesPanel' && canGrades) renderGrades({ refresh: true });
    else if (id === 'smAnalyticsPanel' && canAnalytics) renderAnalytics();
    else if (id === 'smUsersPanel' && canUsers) renderUsers({ refresh: true });
    else if (id === 'smRoleWorkspacePanel' && roleCfg) renderRoleWorkspace();
  }

  function refreshAll(refreshData = true) {
    if (canStudents) renderStudents({ refresh: refreshData });
    if (canWorkload) renderWorkload({ refresh: refreshData });
    if (canPayroll) renderPayroll({ refresh: refreshData });
    if (canGrades) renderGrades({ refresh: refreshData });
    if (canAnalytics) renderAnalytics();
    if (canUsers) renderUsers({ refresh: refreshData });
    if (roleCfg) renderRoleWorkspace();
  }

  function syncLabels() {
    for (const item of navEntries) {
      const label = txt(item.labelTg, item.labelRu);
      item.st.textContent = label;
      item.sm.textContent = txt(item.descTg, item.descRu);
    }
    refreshAll(false);
  }

  document.addEventListener('cabinet:language', syncLabels);
  document.addEventListener('cabinet:school', () => refreshAll(true));
  document.addEventListener('sm:cloud-context-changed', () => refreshAll(true));

  for (const item of navEntries) {
    const label = txt(item.labelTg, item.labelRu);
    item.st.textContent = label;
    item.sm.textContent = txt(item.descTg, item.descRu);
  }
  refreshAll(true);
}
