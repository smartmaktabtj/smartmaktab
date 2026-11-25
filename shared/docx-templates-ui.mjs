import { canNativeSave, nativeSave } from './native-shell.mjs';
import { openWorkspaceView, closeWorkspaceView } from './workspace-view.mjs';
import { mountClassPicker } from './class-picker.mjs';
import { cabinetFormAction, offlineViewer } from './cabinet-runtime.mjs';
import { templatesForRole, renderDocxTemplate } from './docx-templates.mjs';

const copy = {
  trigger: ['Бланкҳои DOCX (корӣ)', 'DOCX-бланки (рабочие)'],
  heading: ['Бланкҳои кории DOCX', 'Рабочие DOCX-бланки'],
  badge: ['Тасдиқ нашудааст · Шакли корӣ', 'Не утверждён · Рабочий шаблон'],
  disclaimer: ['Шаклҳои корӣ ҳанӯз тасдиқ нашудаанд. Танҳо маълумоти сохта ворид кунед.', 'Рабочие бланки ещё не утверждены официально. Вводите только вымышленные данные.'],
  selectTemplate: ['Намуди бланк', 'Выберите бланк'],
  schoolRequired: ['Аввал мактабро интихоб кунед.', 'Сначала выберите школу.'],
  build: ['Омода кардани DOCX', 'Подготовить DOCX'],
  download: ['Боргирии DOCX', 'Скачать DOCX'],
  close: ['Пӯшидан', 'Закрыть'],
  addRow: ['Иловаи сатр', 'Добавить строку'],
  removeRow: ['Хориҷ', 'Удалить'],
  rowCaption: ['Сатр', 'Строка'],
  offlineHint: ['Барои боргирии DOCX SmartMaktab-ро дар браузер ё Android кушоед.', 'Для скачивания DOCX откройте SmartMaktab в браузере или на Android.'],
  failed: ['Майдонро санҷед:', 'Проверьте поле:'],
  error: ['DOCX сохта нашуд.', 'Не удалось сформировать DOCX.'],
  ready: ['DOCX омода аст:', 'DOCX готов:'],
};

export function setupDocxTemplates(article, group, school) {
  const cabinetId = article.dataset.cabinetId;
  // Keep school-director and school-records-clerk legacy [data-pilot-certificate] untouched while offering all 9 templates.
  const list = templatesForRole(cabinetId);
  if (!list.length) return;

  const tg = () => document.documentElement.lang !== 'ru';
  const t = k => copy[k][tg() ? 0 : 1];
  const make = (tag, cls) => { const x = document.createElement(tag); if (cls) x.className = cls; return x; };

  const trigger = make('button', 'button alt');
  trigger.type = 'button';
  trigger.dataset.docxTemplatesTrigger = '';
  const actions = make('div', 'control');
  actions.append(trigger);
  group.append(actions);

  const panel = make('section', 'section no-print');
  panel.id = 'docxTemplatesPanel';
  panel.hidden = true;
  document.getElementById('workspaceDocs').after(panel);

  const form = make('form');
  form.autocomplete = 'off';
  form.noValidate = true;

  const head = make('h2');
  head.tabIndex = -1;
  const badge = make('span', 'pill');
  const note = make('p', 'small');
  const schoolLine = make('p');

  const selectorWrap = make('label', 'field');
  const selectorLabel = make('span');
  const selector = make('select');
  selectorWrap.append(selectorLabel, selector);

  const fieldsHost = make('div', 'school-fields');
  const rowsHost = make('div');
  const addRowBtn = make('button', 'button alt');
  addRowBtn.type = 'button';

  const controls = make('div', 'control');
  const buildBtn = make('button', 'button');
  buildBtn.type = 'submit';
  const closeBtn = make('button', 'button alt');
  closeBtn.type = 'button';
  controls.append(buildBtn, closeBtn);

  const status = make('p', 'small');
  status.setAttribute('role', 'status');
  const summary = make('p', 'notice');
  const downloadBtn = make('button', 'button alt');
  downloadBtn.type = 'button';
  const offlineHint = make('p', 'small');

  form.append(head, badge, note, schoolLine, selectorWrap, fieldsHost, rowsHost, addRowBtn, controls, status, summary, downloadBtn, offlineHint);
  panel.append(form);

  let activeTemplate = list[0];
  let fieldControls = new Map();
  let journalRows = [];
  let prepared = null;
  let errorKey = '';

  function clearResult() { prepared = null; errorKey = ''; updateStateText(); }

  function createFieldControl(field, defaultSchoolName) {
    if (field.type === 'class_code') {
      const box = make('fieldset', 'class-form-field');
      const legend = make('legend');
      const host = make('div');
      box.append(legend, host);
      const picker = mountClassPicker(host, { onChange: clearResult });
      return {
        field,
        node: box,
        labelNode: legend,
        picker,
        read: () => picker.read()[0] || '',
        set: v => picker.set(v ? [v] : []),
        refresh: () => picker.refresh(),
      };
    }
    const wrap = make('label', 'field');
    const lbl = make('span');
    let input;
    if (field.type === 'multiline' || /body|flow|stages|summary|info|conclusion|agenda|decision|description/i.test(field.key)) {
      input = make('textarea');
      input.rows = 3;
      input.maxLength = 4000;
    } else {
      input = make('input');
      input.type = field.type === 'date' ? 'date' : (field.type === 'integer' || field.type === 'year') ? 'number' : 'text';
      if (field.type === 'date') input.value = new Date().toLocaleDateString('sv-SE');
      if (field.type === 'year') { input.min = '1950'; input.max = '2099'; input.value = String(new Date().getFullYear()); }
      if (field.type === 'integer') { input.min = '0'; input.max = '99999'; }
      if (input.type === 'text') input.maxLength = 300;
    }
    input.dataset.docxField = field.key;
    input.required = !!field.required;
    if (field.key === 'school_name' && defaultSchoolName) input.value = defaultSchoolName;
    wrap.append(lbl, input);
    return {
      field,
      node: wrap,
      labelNode: lbl,
      input,
      read: () => input.value,
      set: v => { input.value = v ?? ''; },
      refresh: () => {},
    };
  }

  function addJournalRow(tpl) {
    const rowIdx = journalRows.length;
    const fieldset = make('fieldset', 'school-fields quarter-fields');
    const legend = make('legend');
    const rowMap = new Map();
    const rowFields = tpl.fields.filter(f => f.key !== 'responsible_full_name');
    fieldset.append(legend);
    for (const f of rowFields) {
      const ctrl = createFieldControl(f, '');
      if (f.key === 'row_number') ctrl.set(String(rowIdx + 1));
      fieldset.append(ctrl.node);
      rowMap.set(f.key, ctrl);
    }
    const rm = make('button', 'button alt');
    rm.type = 'button';
    fieldset.append(rm);
    const entry = { fieldset, legend, rowMap, rm };
    journalRows.push(entry);
    rowsHost.append(fieldset);
    rm.addEventListener('click', () => {
      if (journalRows.length <= 1) return;
      journalRows = journalRows.filter(x => x !== entry);
      fieldset.remove();
      clearResult();
      renderLabels();
    });
  }

  function mountTemplate(tpl) {
    activeTemplate = tpl;
    fieldsHost.replaceChildren();
    rowsHost.replaceChildren();
    fieldControls.clear();
    journalRows = [];
    clearResult();

    const activeSchoolName = school()?.name ?? '';
    if (tpl.template_id === 'organization_admission_journal') {
      addRowBtn.hidden = false;
      const respField = tpl.fields.find(f => f.key === 'responsible_full_name');
      const respCtrl = createFieldControl(respField, activeSchoolName);
      fieldsHost.append(respCtrl.node);
      fieldControls.set(respField.key, respCtrl);
      addJournalRow(tpl);
    } else {
      addRowBtn.hidden = true;
      for (const f of tpl.fields) {
        if (f.key === 'school_name') continue;
        const ctrl = createFieldControl(f, activeSchoolName);
        fieldsHost.append(ctrl.node);
        fieldControls.set(f.key, ctrl);
      }
    }
    renderLabels();
  }

  function updateStateText() {
    const tpl = activeTemplate;
    let errText = '';
    if (errorKey) {
      if (errorKey in copy) errText = t(errorKey);
      else {
        const badField = tpl.fields.find(f => f.key === errorKey);
        errText = `${t('failed')} ${badField ? (tg() ? badField.label_tg : badField.label_ru) : errorKey}`;
      }
    }
    status.textContent = errText;
    summary.hidden = !prepared;
    summary.textContent = prepared ? `${t('ready')} ${prepared.template.template_file}` : '';
    downloadBtn.hidden = !prepared || offlineViewer;
    offlineHint.hidden = !prepared || !offlineViewer;
  }

  function renderLabels() {
    trigger.textContent = t('trigger');
    head.textContent = t('heading');
    badge.textContent = t('badge');
    note.textContent = t('disclaimer');
    selectorLabel.textContent = t('selectTemplate');
    schoolLine.textContent = school()?.name ?? t('schoolRequired');
    buildBtn.textContent = t('build');
    downloadBtn.textContent = t('download');
    closeBtn.textContent = t('close');
    addRowBtn.textContent = t('addRow');
    offlineHint.textContent = t('offlineHint');

    const prevVal = selector.value;
    selector.replaceChildren(...list.map(tpl => new Option(tg() ? tpl.title_tg : tpl.title_ru, tpl.template_id)));
    if (list.some(tpl => tpl.template_id === prevVal)) selector.value = prevVal;
    else selector.value = activeTemplate.template_id;

    for (const ctrl of fieldControls.values()) {
      const f = ctrl.field;
      ctrl.labelNode.textContent = (tg() ? f.label_tg : f.label_ru) + (f.required ? ' *' : '');
      ctrl.refresh();
    }
    journalRows.forEach((row, idx) => {
      row.legend.textContent = `${t('rowCaption')} ${idx + 1}`;
      row.rm.textContent = t('removeRow');
      row.rm.disabled = journalRows.length <= 1;
      for (const ctrl of row.rowMap.values()) {
        const f = ctrl.field;
        ctrl.labelNode.textContent = (tg() ? f.label_tg : f.label_ru) + (f.required ? ' *' : '');
        ctrl.refresh();
      }
    });
    updateStateText();
  }

  selector.addEventListener('change', () => {
    const found = list.find(x => x.template_id === selector.value);
    if (found) mountTemplate(found);
  });
  addRowBtn.addEventListener('click', () => {
    if (journalRows.length < 40) { addJournalRow(activeTemplate); clearResult(); renderLabels(); }
  });
  trigger.addEventListener('click', () => { panel.hidden = false; renderLabels(); openWorkspaceView(panel.id, trigger); });
  closeBtn.addEventListener('click', () => { closeWorkspaceView(panel.id); panel.hidden = true; clearResult(); });
  form.addEventListener('input', clearResult);

  cabinetFormAction(form, buildBtn, () => {
    if (!school()) { errorKey = 'schoolRequired'; updateStateText(); return; }
    const raw = { school_name: school().name };
    for (const [key, ctrl] of fieldControls) raw[key] = ctrl.read();
    const extra = activeTemplate.template_id === 'organization_admission_journal'
      ? journalRows.map(r => Object.fromEntries([...r.rowMap].map(([k, ctrl]) => [k, ctrl.read()])))
      : null;
    try {
      const res = renderDocxTemplate(activeTemplate, raw, extra);
      if (res.bytes) { prepared = res; errorKey = ''; }
      else { prepared = null; errorKey = res.error || 'error'; }
    } catch {
      prepared = null;
      errorKey = 'error';
    }
    updateStateText();
  });

  downloadBtn.addEventListener('click', () => {
    if (!prepared || offlineViewer) return;
    const blob = new Blob([prepared.bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const filename = `${prepared.template.template_id}.docx`;
    if (canNativeSave()) {
      void nativeSave(blob, filename).catch(() => { errorKey = 'error'; updateStateText(); });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = make('a');
    a.download = filename;
    a.href = url;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  document.addEventListener('cabinet:school', () => { panel.hidden = true; mountTemplate(activeTemplate); });
  document.addEventListener('cabinet:language', renderLabels);
  mountTemplate(activeTemplate);
}
