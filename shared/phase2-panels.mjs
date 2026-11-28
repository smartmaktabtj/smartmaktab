import {
  CATEGORY_LABELS,
  TAJIK_HOLIDAY_PRESETS,
  loadStudents,
  upsertStudents,
  deleteStudent,
  loadWorkloads,
  upsertWorkload,
  deleteWorkload,
  loadPayrollConfig,
  savePayrollConfig,
  computeMonthlyPayroll,
  loadQuarterGrades,
  saveQuarterGrades,
  computeGradeMetrics,
  loadVerifications,
  submitVerification,
  directorReviewVerification,
  maorifReviewVerification,
  loadAnalyticsSummary,
  resolvePhase2Context,
} from './phase2-store.mjs';
import { persistentStore } from './cabinet-runtime.mjs';
import { createCloudClient } from './cloud-client.mjs';
import { getCloudConfig } from './cloud-config.mjs';
import { canPositionManageUsers, canPositionVerifySchoolStaff, formatPositionTitle } from './position-catalog.mjs';
import {
  parseStudentImportFile,
  buildStudentsCsv,
  buildSimpleDocxBytes,
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
  article.append(sec);
  return sec;
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
  const canVerify = true;
  const canUsers = canPositionManageUsers(cabinetId);

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
      ? txt(
        'Дархости тасдиқи шумо рад ва нест карда шуд. Дастрасӣ ба пойгоҳи додаҳо маҳдуд аст — ба директор ё маориф муроҷиат намоед.',
        'Ваша заявка отклонена и удалена. Доступ к базе данных закрыт — обратитесь к директору или в Маориф.',
      )
      : txt(
        'Ҳисоби шумо ҳанӯз верификатсия нашудааст. То тасдиқ танҳо реҷаи маҳаллӣ/файлӣ кор мекунад, пойгоҳи додаҳо баста аст.',
        'Аккаунт не верифицирован. До подтверждения работает только локальный режим с файлами, база данных закрыта.',
      );
    return `
      <div class="notice sm-db-verif-lock" role="status" style="border:1px solid #fecaca;background:#fef2f2;color:#991b1b;padding:10px 14px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:500;">⚠️ ${esc(msg)}</span>
        <button type="button" class="button" data-open-account-verif="1" style="background:#dc2626;border-color:#dc2626;color:#fff;padding:6px 14px;font-size:13px;flex-shrink:0;">${esc(txt('Верификатсия', 'Верификация'))}</button>
      </div>
    `;
  }

  article.addEventListener('click', ev => {
    if (ev.target?.closest?.('[data-open-account-verif]')) {
      document.dispatchEvent(new CustomEvent('sm:open-account-verification'));
    }
  });

  // Mount core module cards directly on the main home grid (#smMainModules)
  const navEntries = [];

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
    tile.append(spIcon, body);
    tile.addEventListener('click', () => {
      views.open(panelId, tile);
      refreshPanelById(panelId);
    });
    docs.append(tile);
    navEntries.push({ panelId, icon, labelTg, labelRu, descTg, descRu, st, sm });
  }

  // ============================================================================
  // PANEL 1: STUDENTS REGISTRY + WORD/EXCEL IMPORT
  // ============================================================================
  let renderStudents = () => {};
  if (canStudents) {
    const panel = createPanel(article, 'smStudentsPanel');
    registerModule(
      'smStudentsPanel',
      '👥',
      'Феҳристи хонандагон (Word / Excel)',
      'Реестр учеников (Word / Excel)',
      'Воридоти рӯйхат аз .docx, .xlsx, .csv ва идоракунии синфҳо',
      'Импорт списков из .docx, .xlsx, .csv и управление классами',
    );

    let state = { rows: [], classFilter: '', statusMsg: '', defaultClass: '5А' };

    renderStudents = async ({ refresh = true } = {}) => {
      if (refresh) state.rows = await loadStudents(ctx());
      const l = getLang();
      const filtered = state.classFilter
        ? state.rows.filter(r => String(r.class_code || '').toUpperCase() === state.classFilter)
        : state.rows;
      const boys = filtered.filter(r => r.gender === 'male').length;
      const girls = filtered.filter(r => r.gender === 'female').length;
      const classes = [...new Set(state.rows.map(r => String(r.class_code || '').toUpperCase()).filter(Boolean))].sort();

      panel.innerHTML = `
        <h2 tabindex="-1">${esc(txt('Феҳристи хонандагон ва воридот (Word / Excel)', 'Реестр учеников и импорт (Word / Excel)'))}</h2>
        ${dbLockBannerHtml()}
        <p class="small">${esc(txt('Файлҳои .docx, .xlsx, .csv ё .tsv-ро ворид кунед ё хонандаро дастӣ илова намоед.', 'Загрузите файл .docx, .xlsx, .csv или .tsv, либо добавьте ученика вручную.'))}</p>
        <div class="sm-p2-kpis">
          <div class="sm-p2-kpi"><span>${esc(txt('Ҳамагӣ хонандагон', 'Всего учеников'))}</span><b>${filtered.length}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Писарон', 'Мальчики'))}</span><b>${boys}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Духтарон', 'Девочки'))}</span><b>${girls}</b></div>
          <div class="sm-p2-kpi"><span>${esc(txt('Синфҳо', 'Классов'))}</span><b>${classes.length}</b></div>
        </div>
        <div class="sm-p2-grid">
          <label class="field"><span>${esc(txt('Филтри синф', 'Фильтр класса'))}</span>
            <select id="smStuClassFilter">
              <option value="">${esc(txt('Ҳамаи синфҳо', 'Все классы'))}</option>
              ${classes.map(c => `<option value="${esc(c)}" ${state.classFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>${esc(txt('Синфи пешфарз барои воридот', 'Класс по умолчанию для импорта'))}</span>
            <input id="smStuImportClass" type="text" maxlength="12" value="${esc(state.defaultClass)}" placeholder="5А">
          </label>
          <label class="field"><span>${esc(txt('Воридот аз Word (.docx) / Excel (.xlsx, .csv)', 'Импорт из Word (.docx) / Excel (.xlsx, .csv)'))}</span>
            <input id="smStuFile" type="file" accept=".docx,.xlsx,.csv,.tsv,.txt">
          </label>
          <label class="field" style="justify-content:end">
            <span style="display:flex;align-items:center;gap:6px"><input id="smStuReplace" type="checkbox" style="width:auto"> ${esc(txt('Иваз кардани синфи интихобшуда', 'Заменить выбранный класс'))}</span>
          </label>
        </div>
        <form id="smStuAddForm" class="sm-p2-grid" autocomplete="off">
          <label class="field"><span>${esc(txt('Ному насаби хонанда', 'ФИО ученика'))}</span><input id="smStuName" type="text" required maxlength="180" placeholder="${esc(txt('Алиев Беҳрӯз Рустамович', 'Алиев Бехруз Рустамович'))}"></label>
          <label class="field"><span>${esc(txt('Синф', 'Класс'))}</span><input id="smStuCls" type="text" required maxlength="12" value="${esc(state.classFilter || state.defaultClass)}" placeholder="5А"></label>
          <label class="field"><span>${esc(txt('Соли таваллуд', 'Год рождения'))}</span><input id="smStuBirth" type="number" min="1995" max="2026" placeholder="2014"></label>
          <label class="field"><span>${esc(txt('Ҷинс', 'Пол'))}</span>
            <select id="smStuGender">
              <option value="">—</option>
              <option value="male">${esc(txt('Писар', 'Мужской'))}</option>
              <option value="female">${esc(txt('Духтар', 'Женский'))}</option>
            </select>
          </label>
          <div class="control" style="align-self:end;margin:0">
            <button type="submit" class="button" id="smStuAddBtn">${esc(txt('+ Илова кардан', '+ Добавить'))}</button>
          </div>
        </form>
        <div class="sm-p2-actions">
          <button type="button" class="button alt" id="smStuExportCsv">${esc(txt('Боргирии Excel (.csv)', 'Скачать Excel (.csv)'))}</button>
          <button type="button" class="button alt" id="smStuExportDocx">${esc(txt('Боргирии Word (.docx)', 'Скачать Word (.docx)'))}</button>
          <button type="button" class="button" id="smStuSubmitVerif">${esc(txt('Фиристодан барои тасдиқ', 'Отправить на проверку'))}</button>
          <span id="smStuStatus" class="small" role="status">${esc(state.statusMsg)}</span>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>№</th><th>${esc(txt('Ному насаб', 'ФИО'))}</th><th>${esc(txt('Синф', 'Класс'))}</th><th>${esc(txt('Соли тав.', 'Год рожд.'))}</th><th>${esc(txt('Ҷинс', 'Пол'))}</th><th></th></tr></thead>
            <tbody>
              ${filtered.length ? filtered.map((r, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${esc(r.full_name)}</strong>${r.guardian_phone ? `<div class="small">${esc(r.guardian_phone)}</div>` : ''}</td>
                  <td><span class="tag">${esc(r.class_code)}</span></td>
                  <td>${r.birth_year || '—'}</td>
                  <td>${r.gender === 'male' ? txt('Писар', 'М') : (r.gender === 'female' ? txt('Духтар', 'Ж') : '—')}</td>
                  <td><button type="button" class="button alt" data-del-student="${esc(r.id)}">✕</button></td>
                </tr>
              `).join('') : `<tr><td colspan="6" class="small">${esc(txt('Рӯйхат холӣ аст. Аз Word/Excel ворид кунед ё дастӣ илова намоед.', 'Список пуст. Импортируйте из Word/Excel или добавьте вручную.'))}</td></tr>`}
            </tbody>
          </table>
        </div>
      `;

      panel.querySelector('#smStuClassFilter')?.addEventListener('change', ev => {
        state.classFilter = ev.target.value;
        if (state.classFilter) state.defaultClass = state.classFilter;
        renderStudents({ refresh: false });
      });
      panel.querySelector('#smStuImportClass')?.addEventListener('input', ev => {
        state.defaultClass = ev.target.value.trim().toUpperCase() || '5А';
      });
      panel.querySelector('#smStuFile')?.addEventListener('change', async ev => {
        const file = ev.target.files?.[0];
        if (!file) return;
        try {
          const buf = await file.arrayBuffer();
          const parsed = parseStudentImportFile(buf, file.name, state.defaultClass);
          if (!parsed.rows.length) {
            state.statusMsg = txt('Дар файл сатрҳои хонанда ёфт нашуд.', 'В файле не найдено строк учеников.');
            renderStudents({ refresh: false });
            return;
          }
          const replaceCls = panel.querySelector('#smStuReplace')?.checked ? state.defaultClass : '';
          state.rows = await upsertStudents(ctx(), parsed.rows, { replaceClass: replaceCls });
          state.statusMsg = l === 'ru'
            ? `Импортировано из ${parsed.format.toUpperCase()}: ${parsed.rows.length} уч.`
            : `Аз ${parsed.format.toUpperCase()} ворид шуд: ${parsed.rows.length} хонанда.`;
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
        const birth = panel.querySelector('#smStuBirth')?.value.trim();
        const gender = panel.querySelector('#smStuGender')?.value || '';
        if (!fullName) return;
        state.rows = await upsertStudents(ctx(), [{
          full_name: fullName,
          class_code: cls,
          birth_year: birth ? Number(birth) : null,
          gender,
        }]);
        state.defaultClass = cls;
        state.statusMsg = txt(`Хонанда илова шуд (${cls}).`, `Ученик добавлен (${cls}).`);
        await renderStudents({ refresh: false });
        if (canGrades) await renderGrades({ refresh: true });
        if (canAnalytics) await renderAnalytics();
      });
      panel.querySelectorAll('[data-del-student]').forEach(btn => {
        btn.addEventListener('click', async () => {
          state.rows = await deleteStudent(ctx(), btn.dataset.delStudent);
          state.statusMsg = txt('Хонанда хориҷ шуд.', 'Ученик удалён.');
          await renderStudents({ refresh: false });
        });
      });
      panel.querySelector('#smStuExportCsv')?.addEventListener('click', () => {
        downloadBlob(buildStudentsCsv(filtered), 'text/csv;charset=utf-8', 'students.csv');
      });
      panel.querySelector('#smStuExportDocx')?.addEventListener('click', () => {
        const bytes = buildSimpleDocxBytes(
          txt('Феҳристи хонандагон', 'Список учеников'),
          ['№', txt('Ному насаб', 'ФИО'), txt('Синф', 'Класс'), txt('Соли тав.', 'Год рожд.')],
          filtered.map((r, i) => [String(i + 1), r.full_name, r.class_code, String(r.birth_year || '')]),
        );
        downloadBlob(bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'students.docx');
      });
      panel.querySelector('#smStuSubmitVerif')?.addEventListener('click', async () => {
        await submitVerification(ctx(), {
          category: 'student_registry',
          title: `${txt('Феҳристи хонандагон', 'Реестр учеников')} (${state.classFilter || txt('Ҳама', 'Все')}: ${filtered.length})`,
          periodLabel: '2026-2027',
          payload: { count: filtered.length, class_filter: state.classFilter || 'all' },
        });
        state.statusMsg = txt('Барои тасдиқи директор фиристода шуд.', 'Отправлено на проверку директору.');
        await renderVerification();
        renderStudents({ refresh: false });
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
    renderWorkload = async ({ refresh = true } = {}) => {
      if (refresh) state.rows = await loadWorkloads(ctx());
      const totalHrs = state.rows.reduce((s, r) => s + (Number(r.weekly_hours) || 0), 0);
      const l = getLang();
      const myName = ctx().actorName || '';

      panel.innerHTML = `
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
      `;

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

    renderPayroll = async ({ refresh = true } = {}) => {
      if (refresh || !state.cfg) {
        const [cfg, wks] = await Promise.all([loadPayrollConfig(ctx()), loadWorkloads(ctx())]);
        state.cfg = cfg;
        state.workloads = wks;
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

      panel.innerHTML = `
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
          <button type="button" class="button" id="smPaySubmitVerif">${esc(txt('Фиристодан барои тасдиқи директор', 'Отправить ведомость директору'))}</button>
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
      `;

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
      panel.querySelector('#smPaySubmitVerif')?.addEventListener('click', async () => {
        await submitVerification(ctx(), {
          category: 'payroll',
          title: `${txt('Ведомости маош', 'Зарплатная ведомость')} (${state.yearMonth}) — ${calc.totals.net.toFixed(2)} TJS`,
          periodLabel: state.yearMonth,
          payload: { month: state.yearMonth, working_days: calc.calendar.effectiveWorkingDays, total_net_tjs: calc.totals.net, staff_count: calc.rows.length },
        });
        state.statusMsg = txt('Ведомост барои тасдиқи директор фиристода шуд.', 'Ведомость отправлена директору на проверку.');
        await renderVerification();
        renderPayroll({ refresh: false });
      });
    };
  }

  // ============================================================================
  // PANEL 4: CLASS TEACHER QUARTER GRADES & LIVE ANIMATED CHARTS
  // ============================================================================
  let renderGrades = () => {};
  if (canGrades) {
    const panel = createPanel(article, 'smGradesPanel');
    registerModule(
      'smGradesPanel',
      '📊',
      'Баҳоҳои чорякӣ ва сифат',
      'Четвертные оценки и качество',
      'Воридоти баҳоҳои хонандагон (10-хола), таҳлили сифат ва нақшаҳои зинда',
      'Ввод четвертных оценок (10-балльная), качество знаний и живые графики',
    );

    let state = {
      yearStart: 2026,
      period: 'q1',
      classCode: '5А',
      subject: 'Математика',
      rows: [],
      allYearRows: [],
      statusMsg: '',
    };

    renderGrades = async ({ refresh = true } = {}) => {
      if (refresh) {
        const [slice, fullYear, roster] = await Promise.all([
          loadQuarterGrades(ctx(), { yearStart: state.yearStart, period: state.period, classCode: state.classCode, subject: state.subject }),
          loadQuarterGrades(ctx(), { yearStart: state.yearStart }),
          loadStudents(ctx(), state.classCode),
        ]);
        state.allYearRows = fullYear;
        const byName = new Map(slice.map(r => [r.student_name.toLowerCase(), r]));
        for (const st of roster) {
          const k = st.full_name.toLowerCase();
          if (!byName.has(k)) {
            byName.set(k, {
              student_id: st.id,
              student_name: st.full_name,
              class_code: st.class_code,
              grade: '',
              absent_hours: 0,
            });
          }
        }
        state.rows = [...byName.values()];
      }

      const metrics = computeGradeMetrics(state.rows);
      const periodOrder = ['q1', 'q2', 'h1', 'q3', 'q4', 'h2', 'year'];
      const periodSeries = ['q1', 'q2', 'q3', 'q4'].map(p => {
        const sl = state.allYearRows.filter(r => r.period === p && String(r.class_code).toUpperCase() === state.classCode);
        const pm = computeGradeMetrics(sl);
        return { period: p, quality_pct: pm.qualityPct, pass_pct: pm.passPct, assessed: pm.assessed };
      });

      panel.innerHTML = `
        <h2 tabindex="-1">${esc(txt('Баҳоҳои чорякии роҳбари синф ва сифат', 'Четвертные оценки классного руководителя'))}</h2>
        ${dbLockBannerHtml()}
        <p class="small">${esc(txt('Меъёри 10-холаи Тоҷикистон: сифат = баҳои 8–10, азхудкунӣ = баҳои 4–10.', '10-балльная шкала РТ: качество = 8–10 баллов, успеваемость = 4–10 баллов.'))}</p>
        <div class="sm-p2-grid">
          <label class="field"><span>${esc(txt('Давра / Чоряк', 'Период / Четверть'))}</span>
            <select id="smGrPeriod">
              ${periodOrder.map(p => `<option value="${p}" ${state.period === p ? 'selected' : ''}>${p.toUpperCase()}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>${esc(txt('Синф', 'Класс'))}</span>
            <input id="smGrClass" type="text" maxlength="12" value="${esc(state.classCode)}">
          </label>
          <label class="field"><span>${esc(txt('Фан', 'Предмет'))}</span>
            <input id="smGrSubject" type="text" maxlength="120" value="${esc(state.subject)}">
          </label>
          <div class="control" style="align-self:end;margin:0">
            <button type="button" class="button alt" id="smGrAddStudent">${esc(txt('+ Сатри хонанда', '+ Добавить строку'))}</button>
          </div>
        </div>
        <div class="sm-chart-grid">
          ${renderQualityRingSvg({ qualityPct: metrics.qualityPct, passPct: metrics.passPct, avgGrade: metrics.avgGrade, lang: getLang() })}
          ${renderQuarterBarsSvg(periodSeries, getLang())}
        </div>
        <div class="sm-p2-actions">
          <button type="button" class="button" id="smGrSaveBtn">${esc(txt('Сабти баҳоҳо', 'Сохранить оценки'))}</button>
          <button type="button" class="button alt" id="smGrSubmitVerif">${esc(txt('Фиристодан барои тасдиқ ба Директор', 'Отправить директору на проверку'))}</button>
          <span id="smGrStatus" class="small" role="status">${esc(state.statusMsg)}</span>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>№</th><th>${esc(txt('Хонанда', 'Ученик'))}</th><th>${esc(txt('Баҳо (0–10)', 'Оценка (0–10)'))}</th><th>${esc(txt('Соати ғоиб', 'Пропуски (ч)'))}</th></tr></thead>
            <tbody>
              ${state.rows.length ? state.rows.map((r, i) => `
                <tr data-grade-row="${i}">
                  <td>${i + 1}</td>
                  <td><input class="sm-inline-input" style="width:100%;min-width:160px" data-gr-name="${i}" type="text" value="${esc(r.student_name)}"></td>
                  <td><input class="sm-inline-input" data-gr-val="${i}" type="number" min="0" max="10" step="1" value="${r.grade ?? ''}"></td>
                  <td><input class="sm-inline-input" data-gr-abs="${i}" type="number" min="0" max="1000" value="${r.absent_hours ?? 0}"></td>
                </tr>
              `).join('') : `<tr><td colspan="4" class="small">${esc(txt('Дар ин синф хонанда нест — ба феҳрист илова кунед ё «+ Сатри хонанда»-ро пахш намоед.', 'В этом классе пока нет учеников — добавьте в реестр или нажмите «+ Добавить строку».'))}</td></tr>`}
            </tbody>
          </table>
        </div>
      `;

      const syncScopeInputs = () => {
        state.period = panel.querySelector('#smGrPeriod')?.value || 'q1';
        state.classCode = (panel.querySelector('#smGrClass')?.value || '5А').trim().toUpperCase();
        state.subject = (panel.querySelector('#smGrSubject')?.value || 'Математика').trim();
      };
      const readRowsFromDom = () => state.rows.map((r, i) => ({
        ...r,
        student_name: panel.querySelector(`[data-gr-name="${i}"]`)?.value.trim() || r.student_name,
        grade: (() => {
          const v = panel.querySelector(`[data-gr-val="${i}"]`)?.value;
          return v === '' || v === undefined ? null : Number(v);
        })(),
        absent_hours: Number(panel.querySelector(`[data-gr-abs="${i}"]`)?.value || 0),
      }));

      panel.querySelector('#smGrPeriod')?.addEventListener('change', () => { syncScopeInputs(); renderGrades({ refresh: true }); });
      panel.querySelector('#smGrClass')?.addEventListener('change', () => { syncScopeInputs(); renderGrades({ refresh: true }); });
      panel.querySelector('#smGrSubject')?.addEventListener('change', () => { syncScopeInputs(); renderGrades({ refresh: true }); });
      panel.querySelector('#smGrAddStudent')?.addEventListener('click', () => {
        state.rows = readRowsFromDom();
        state.rows.push({ student_name: '', class_code: state.classCode, grade: 8, absent_hours: 0 });
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
          entries: edited,
        });
        state.statusMsg = txt('Баҳоҳо сабт шуданд ва таҳлил навсозӣ гардид.', 'Оценки сохранены, аналитика обновлена.');
        await renderGrades({ refresh: true });
        if (canAnalytics) renderAnalytics();
      });
      panel.querySelector('#smGrSubmitVerif')?.addEventListener('click', async () => {
        syncScopeInputs();
        const edited = readRowsFromDom().filter(r => r.student_name);
        const m = computeGradeMetrics(edited);
        await submitVerification(ctx(), {
          category: 'grades',
          title: `${txt('Ҷамъбасти чорякӣ', 'Четвертная сводка')}: ${state.classCode} · ${state.subject} (${state.period.toUpperCase()})`,
          periodLabel: `${state.yearStart}-${state.period}`,
          payload: { class_code: state.classCode, subject: state.subject, quality_pct: m.qualityPct, pass_pct: m.passPct, assessed: m.assessed },
        });
        state.statusMsg = txt('Барои тасдиқи директор фиристода шуд.', 'Отправлено на проверку директору.');
        await renderVerification();
        renderGrades({ refresh: false });
      });
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
          <div class="sm-p2-kpi"><span>${esc(txt('Тасдиқи Маориф', 'Утверждено Маориф'))}</span><b>${summary.verifications?.maorif_approved || 0} / ${summary.verifications?.total || 0}</b></div>
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
  // PANEL 6: HIERARCHICAL VERIFICATION (Maorif -> Director -> School staff)
  // ============================================================================
  let renderVerification = () => {};
  if (canVerify) {
    const panel = createPanel(article, 'smVerificationPanel');
    registerModule(
      'smVerificationPanel',
      '✓',
      'Санҷиш ва тасдиқ (Маориф → Директор → Корманд)',
      'Проверка и утверждение (Маориф → Директор → Сотрудник)',
      'Зиндаи тасдиқи ҳуҷҷатҳо аз корманди мактаб то директор ва шуъбаи маориф',
      'Иерархическая проверка документов от сотрудника к директору и в маориф',
    );

    let state = { items: [], accountQueue: [], canReviewAccounts: false, statusMsg: '' };
    const statusBadge = st => {
      const map = {
        pending: txt('Интизор', 'Ожидает'),
        approved: txt('Тасдиқ шуд', 'Утверждено'),
        changes: txt('Барои ислоҳ', 'На доработку'),
        rejected: txt('Рад шуд', 'Отклонено'),
        not_sent: txt('Фиристода нашудааст', 'Не отправлено'),
      };
      return `<span class="sm-badge sm-badge-${esc(st || 'not_sent')}">${esc(map[st] || st)}</span>`;
    };

    renderVerification = async () => {
      const c = ctx();
      state.items = await loadVerifications(c);
      state.accountQueue = [];
      state.canReviewAccounts = false;

      const cl = getAuthedCloudClient();
      let prof = {};
      try { prof = JSON.parse(persistentStore.getItem('smartmaktab.profile.v1') || '{}') || {}; } catch {}
      const canReview = Boolean(
        cl && c.verified && (isAuthority || prof.canReviewVerifications || canPositionVerifySchoolStaff(prof.primaryPosition || cabinetId)),
      );
      if (canReview) {
        state.canReviewAccounts = true;
        try {
          const rows = await cl.getPendingAccountVerifications(isAuthority ? null : (c.orgId && /^[0-9a-f-]{36}$/i.test(c.orgId) ? c.orgId : null));
          if (Array.isArray(rows)) state.accountQueue = rows;
        } catch {}
      }

      const accountSectionHtml = c.hasCloudSession ? `
        <section class="section" style="margin-bottom:14px">
          <h3>${esc(txt('Верификатсияи ҳисобҳо (Корманд → Директор → Маориф)', 'Верификация аккаунтов (Сотрудник → Директор → Маориф)'))}</h3>
          ${!c.verified ? dbLockBannerHtml() : ''}
          ${state.canReviewAccounts ? `
            <p class="small">${esc(txt('Дархостҳои воридшуда бо ФИО, санаи таваллуд, телефон ва рақами шиноснома:', 'Входящие заявки с ФИО, датой рождения, телефоном и номером паспорта:'))}</p>
            <div class="table-scroll">
              <table>
                <thead><tr><th>${esc(txt('Корманд ва вазифа', 'Пользователь и должность'))}</th><th>${esc(txt('Мактаб / Ҷамоат', 'Школа / Джамоат'))}</th><th>${esc(txt('Санаи таваллуд', 'Дата рождения'))}</th><th>${esc(txt('Телефон / Шиноснома', 'Телефон / Паспорт'))}</th><th>${esc(txt('Қарор', 'Решение'))}</th></tr></thead>
                <tbody>
                  ${state.accountQueue.length ? state.accountQueue.map(req => `
                    <tr>
                      <td><strong>${esc(req.full_name)}</strong><div class="small">${esc(formatPositionTitle(req.primary_position, getLang()))}</div></td>
                      <td>${esc(req.organization_name || '')}<div class="small">${esc([req.district_name, req.jamoat_name, req.village_name].filter(Boolean).join(' · '))}</div></td>
                      <td>${esc(req.birth_date || '')}</td>
                      <td>${esc(req.phone || '')}<div class="small">${esc(req.passport_number || '')}</div></td>
                      <td>
                        <div class="sm-p2-actions" style="margin:0">
                          <button type="button" class="button" data-acc-act="verified" data-acc-id="${esc(req.membership_id || req.id || '')}">${esc(txt('Тасдиқ', 'Подтвердить'))}</button>
                          <button type="button" class="button alt" data-acc-act="rejected" data-acc-id="${esc(req.membership_id || req.id || '')}">${esc(txt('Рад ва нест кардан', 'Отклонить и удалить'))}</button>
                        </div>
                      </td>
                    </tr>
                  `).join('') : `<tr><td colspan="5" class="small">${esc(txt('Дархости нави верификатсияи аккаунт нест.', 'Новых заявок на верификацию аккаунтов нет.'))}</td></tr>`}
                </tbody>
              </table>
            </div>
          ` : ''}
        </section>
      ` : '';

      panel.innerHTML = `
        <h2 tabindex="-1">${esc(txt('Иерархияи санҷиш ва тасдиқ: Корманд → Директор → Маориф', 'Иерархия проверки: Сотрудник → Директор → Маориф'))}</h2>
        ${accountSectionHtml}
        <p class="small">${esc(txt('Ҳар як ҳуҷҷат, нақша ё баҳогузорӣ аввал аз тасдиқи директор гузашта, сипас ба шуъбаи маориф фиристода мешавад.', 'Документы и отчёты сначала проверяет директор школы, затем утверждает отдел образования (Маориф).'))}</p>
        ${!isAuthority ? `
          <form id="smVerifForm" class="sm-p2-grid" autocomplete="off">
            <label class="field"><span>${esc(txt('Намуди ҳуҷҷат', 'Категория'))}</span>
              <select id="smVfCat">
                <option value="lesson_plan">${esc(txt('Нақшаи дарс', 'План урока'))}</option>
                <option value="quality_report">${esc(txt('Ҳисоботи сифати таҳсилот', 'Отчёт по качеству'))}</option>
                <option value="grades">${esc(txt('Баҳоҳои чорякӣ', 'Четвертные оценки'))}</option>
                <option value="payroll">${esc(txt('Ведомости маош', 'Зарплатная ведомость'))}</option>
                <option value="director_plan">${esc(txt('Нақшаи корӣ', 'План работы'))}</option>
                <option value="document">${esc(txt('Ҳуҷҷати дигар', 'Другой документ'))}</option>
              </select>
            </label>
            <label class="field"><span>${esc(txt('Номи ҳуҷҷат ё ҳисобот', 'Название документа'))}</span>
              <input id="smVfTitle" type="text" required maxlength="240" placeholder="${esc(txt('Ҳисоботи чоряки 1 · Синфи 5А', 'Отчёт за 1 четверть · 5А класс'))}">
            </label>
            <label class="field"><span>${esc(txt('Давра', 'Период'))}</span>
              <input id="smVfPeriod" type="text" maxlength="80" value="2026-Q1">
            </label>
            <div class="control" style="align-self:end;margin:0;gap:10px">
              ${isDirector ? `<label style="display:flex;align-items:center;gap:6px"><input id="smVfDirectMaorif" type="checkbox" checked> ${esc(txt('Мустақим ба Маориф', 'Сразу в Маориф'))}</label>` : ''}
              <button type="submit" class="button" id="smVfSubmitBtn">${esc(txt('Фиристодан барои тасдиқ', 'Отправить на проверку'))}</button>
            </div>
          </form>
        ` : ''}
        <p id="smVfStatus" class="small" role="status">${esc(state.statusMsg)}</p>
        <div class="table-scroll">
          <table>
            <thead><tr><th>${esc(txt('Ҳуҷҷат', 'Документ'))}</th><th>${esc(txt('Фиристода', 'Отправитель'))}</th><th>${esc(txt('Директор', 'Директор'))}</th><th>${esc(txt('Маориф', 'Маориф'))}</th><th>${esc(txt('Амал', 'Действие'))}</th></tr></thead>
            <tbody>
              ${state.items.length ? state.items.map(it => `
                <tr>
                  <td><strong>${esc(it.title)}</strong><div class="small">${esc(it.category)} · ${esc(it.period_label || '')}</div></td>
                  <td>${esc(it.submitted_by_name || it.source_cabinet || '')}<div class="small">${esc(it.organization_name || '')}</div></td>
                  <td>${statusBadge(it.director_status)}${it.director_note ? `<div class="small">${esc(it.director_note)}</div>` : ''}</td>
                  <td>${statusBadge(it.maorif_status)}${it.maorif_note ? `<div class="small">${esc(it.maorif_note)}</div>` : ''}</td>
                  <td>
                    <div class="sm-p2-actions" style="margin:0">
                      ${isDirector && !isAuthority ? `
                        <button type="button" class="button" data-dir-act="approve-forward" data-id="${esc(it.id)}">${esc(txt('Тасдиқ → Маориф', 'Утвердить → Маориф'))}</button>
                        <button type="button" class="button alt" data-dir-act="approve" data-id="${esc(it.id)}">${esc(txt('Тасдиқ', 'Утвердить'))}</button>
                        <button type="button" class="button alt" data-dir-act="changes" data-id="${esc(it.id)}">${esc(txt('Барои ислоҳ', 'На доработку'))}</button>
                      ` : ''}
                      ${isAuthority && it.maorif_status !== 'not_sent' ? `
                        <button type="button" class="button" data-mao-act="approved" data-id="${esc(it.id)}" data-org="${esc(it.organization_id || '')}">${esc(txt('Тасдиқи Маориф', 'Утвердить (Маориф)'))}</button>
                        <button type="button" class="button alt" data-mao-act="changes" data-id="${esc(it.id)}" data-org="${esc(it.organization_id || '')}">${esc(txt('Баргардондан', 'Вернуть'))}</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="5" class="small">${esc(txt('Ҳанӯз дархости тасдиқ вуҷуд надорад.', 'Заявок на проверку пока нет.'))}</td></tr>`}
            </tbody>
          </table>
        </div>
      `;

      panel.querySelector('#smVerifForm')?.addEventListener('submit', async ev => {
        ev.preventDefault();
        const title = panel.querySelector('#smVfTitle')?.value.trim();
        if (!title) return;
        await submitVerification(ctx(), {
          category: panel.querySelector('#smVfCat')?.value || 'document',
          title,
          periodLabel: panel.querySelector('#smVfPeriod')?.value.trim() || '',
          directToMaorif: Boolean(panel.querySelector('#smVfDirectMaorif')?.checked),
        });
        state.statusMsg = txt('Ҳуҷҷат ба навбати тасдиқ ворид шуд.', 'Документ добавлен в очередь проверки.');
        await renderVerification();
      });

      panel.querySelectorAll('[data-dir-act]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const act = btn.dataset.dirAct;
          const id = btn.dataset.id;
          const forward = act === 'approve-forward';
          const decision = act === 'changes' ? 'changes' : 'approved';
          const note = decision === 'changes' ? txt('Ислоҳ зарур аст', 'Требуется доработка') : '';
          await directorReviewVerification(ctx(), id, decision, note, forward);
          state.statusMsg = forward
            ? txt('Директор тасдиқ кард ва ба Маориф фиристод.', 'Директор утвердил и отправил в Маориф.')
            : txt('Қарори директор сабт шуд.', 'Решение директора сохранено.');
          await renderVerification();
          if (canAnalytics) renderAnalytics();
        });
      });

      panel.querySelectorAll('[data-acc-act]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const cl2 = getAuthedCloudClient();
          if (!cl2) return;
          const rawDecision = btn.dataset.accAct;
          const decision = rawDecision === 'approved' ? 'verified' : rawDecision;
          const membershipId = btn.dataset.accId;
          btn.disabled = true;
          try {
            await cl2.reviewAccountVerification({
              p_membership_id: membershipId,
              p_decision: decision,
              p_note: '',
            });
            state.statusMsg = decision === 'verified'
              ? txt('Ҳисоб тасдиқ карда шуд.', 'Аккаунт подтверждён.')
              : txt('Дархост рад ва нест карда шуд.', 'Заявка отклонена и удалена.');
            await renderVerification();
          } catch (err) {
            state.statusMsg = err?.message || 'Error';
            await renderVerification();
          }
        });
      });

      panel.querySelectorAll('[data-mao-act]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const decision = btn.dataset.maoAct;
          const id = btn.dataset.id;
          const orgId = btn.dataset.org;
          const note = decision === 'changes' ? txt('Маориф барои ислоҳ баргардонд', 'Маориф вернул на доработку') : txt('Маориф тасдиқ кард', 'Утверждено Маорифом');
          await maorifReviewVerification(ctx(), id, orgId, decision, note);
          state.statusMsg = note;
          await renderVerification();
          if (canAnalytics) renderAnalytics();
        });
      });
    };
  }

  // ============================================================================
  // 7. КОРБАРОН (Идоракунии кормандон, дастгоҳҳо ва рамзҳо)
  // ============================================================================
  let renderUsers = async () => {};
  if (canUsers) {
    registerModule(
      'smUsersPanel',
      '👤',
      'Корбарон',
      'Пользователи',
      'Идоракунии кормандон, дастгоҳҳо ва рамзҳо',
      'Управление пользователями, устройствами и паролями',
    );
    const panel = createPanel(article, 'smUsersPanel');
    const state = {
      items: [],
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
      if (!cl) {
        panel.innerHTML = `
          <h2 tabindex="-1">${esc(txt('Корбарон ва дастгоҳҳо', 'Пользователи и устройства'))}</h2>
          <div class="notice">
            <p class="small">${esc(txt('Барои дидан ва идоракунии корбарон, дастгоҳҳо ва бозсозии рамз аввал бо ҳисоби абрии худ ворид шавед.', 'Для управления сотрудниками, отвязки устройств и сброса паролей сначала войдите в облачный аккаунт.'))}</p>
            <button type="button" class="button" id="smUsrOpenCloudBtn">${esc(txt('Ворид шудан ба абр', 'Войти в облако'))}</button>
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
      const pendingCount = state.items.filter(u => u.verification_status === 'pending').length;
      const verifiedCount = state.items.filter(u => u.verification_status === 'verified').length;
      const disabledCount = state.items.filter(u => u.account_active === false).length;

      const hierarchyNote = cabinetId.startsWith('raesat-')
        ? txt('Шумо метавонед шуъбаҳои маориф ва мактабҳои вилоятро тасдиқ, бозсозии рамз, қатъи дастгоҳ ё идора кунед.', 'Вы управляете отделами Маориф и школами области.')
        : cabinetId.startsWith('office-')
          ? txt('Шумо метавонед роҳбарон ва кормандони мактабҳои шаҳр / ноҳияро идора кунед.', 'Вы управляете директорами и сотрудниками школ вашего района / города.')
          : cabinetId === 'school-director'
            ? txt('Директор ҳамаи кормандони мактабро идора мекунад: тасдиқ, қатъи дастгоҳ, рамзи нав ва хориҷкунӣ.', 'Директор управляет всеми сотрудниками школы: подтверждение, сброс устройств, пароль и удаление.')
            : txt('Шумо метавонед кормандони мактабро (ғайр аз директор) тасдиқ, қатъи дастгоҳ ё бозсозии рамз кунед.', 'Вы управляете сотрудниками школы (кроме директора): подтверждение, сброс устройств и пароля.');

      panel.innerHTML = `
        <h2 tabindex="-1">${esc(txt('Корбарон ва дастгоҳҳо', 'Пользователи и устройства'))}</h2>
        <p class="small">${esc(hierarchyNote)}</p>
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
      `;

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
          if (!globalThis.confirm(msg)) return;
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
      if (refresh && cl && c.verified) {
        state.loading = true;
        renderUsersUi();
        try {
          const rows = await cl.getManagedUsers(null);
          state.items = Array.isArray(rows) ? rows : [];
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
    else if (id === 'smVerificationPanel' && canVerify) renderVerification();
    else if (id === 'smUsersPanel' && canUsers) renderUsers({ refresh: true });
    else if (id === 'smRoleWorkspacePanel' && roleCfg) renderRoleWorkspace();
  }

  function refreshAll(refreshData = true) {
    if (canStudents) renderStudents({ refresh: refreshData });
    if (canWorkload) renderWorkload({ refresh: refreshData });
    if (canPayroll) renderPayroll({ refresh: refreshData });
    if (canGrades) renderGrades({ refresh: refreshData });
    if (canAnalytics) renderAnalytics();
    if (canVerify) renderVerification();
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
