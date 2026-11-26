import { persistentStore } from './cabinet-runtime.mjs';
import { DEFAULT_ALIYA_GATEWAY, extractAliyaTopic, gatewayEnabled, generateGatewayPdf, isLocalGateway, runGateway } from './reader-gateway.mjs';
import { readerStore } from './reader-memory.mjs';
import { examplesForTerms, summarizeReaderText, termsFromText } from './reader-text.mjs';
import { createAliyaDocxBytes, downloadBytes, safeSlug } from './reader-doc-export.mjs';

const copy = {
  title: ['Алия · Ёвари китобхон', 'Алия · Помощник читателя'],
  explain: [
    'Ёвар бо матни ҳамин китоб кор мекунад. Барои сканҳо дар ҳолати онлайн OCR-и Алия фаъол аст.',
    'Помощник работает с текстом этой книги. Для сканов в онлайн-режиме доступно распознавание OCR.',
  ],
  from: ['Аз саҳифа', 'Со страницы'],
  to: ['То саҳифа', 'По страницу'],
  summary: ['Хулосаи мавзӯъ', 'Краткая выжимка'],
  words: ['Калимаҳо ва истилоҳот', 'Слова и термины'],
  test: ['Санҷиш ва тест', 'Вопросы для проверки'],
  lesson: ['Нақшаи дарс', 'План урока'],
  translate: ['Тарҷума', 'Перевод'],
  notes: ['Ёддоштҳо', 'Заметки'],
  save: ['Сабти ёддошт', 'Сохранить заметку'],
  remove: ['Хориҷ кардан', 'Удалить'],
  close: ['Бозгашт ба китоб', 'Вернуться к книге'],
  working: ['Ба хондани китоб шурӯъ кардам…', 'Начинаю читать страницы книги…'],
  ocrWorking: ['Саҳифаи сканро мехонам (OCR)…', 'Распознаю текст со скана страницы (OCR)…'],
  aiThinking: ['Алия матнро таҳлил карда, омода менамояд…', 'Алия анализирует текст и готовит ответ…'],
  noText: ['Матни ҷустуҷӯшаванда ёфт нашуд. Барои скан ҳолати «Алия AI»-ро фаъол созед.', 'Текстовый слой не найден. Для скана включите режим «Алия ИИ».'],
  range: ['Аз 1 то 12 саҳифа дар як амал интихоб кунед.', 'Выберите от 1 до 12 страниц за одно действие.'],
  failed: ['Ин амал анҷом наёфт.', 'Не удалось выполнить действие.'],
  translationUnavailable: [
    'Тарҷумаи маҳаллӣ дар ин браузер дастрас нест. Барои тарҷумаи пурра «Алия AI»-ро фаъол кунед.',
    'Локальный перевод в этом браузере недоступен. Для полного перевода включите режим «Алия ИИ».',
  ],
  toLang: ['Забони тарҷума', 'Язык перевода'],
  fromLang: ['Забони матн', 'Язык текста'],
  noteHint: ['Ёддошт дар ҳамин дастгоҳ сабт мешавад.', 'Заметка сохраняется на этом устройстве.'],
  noWords: ['Истилоҳҳои мувофиқ ёфт нашуданд.', 'Подходящие термины не найдены.'],
  notesTask: ['Сабт дар ёддошт', 'В заметки'],
  currentPage: ['Саҳифаи ҷорӣ', 'Текущая страница'],
  cancel: ['Бекор кардан', 'Отменить'],
  mode: ['Навъи супориш', 'Вид задания'],
  notSaved: ['Браузер нигоҳдории ёддоштҳоро иҷозат надод.', 'Браузер не разрешил сохранить заметки.'],
  qCount: ['Шумораи саволҳо', 'Количество вопросов'],
  qStyle: ['Тарзи ҷавобҳо', 'Формат ответов'],
  copyBtn: ['Нусха', 'Копировать'],
  copied: ['Нусхабардорӣ шуд ✓', 'Скопировано ✓'],
  docxBtn: ['Word (.docx)', 'Word (.docx)'],
  pdfBtn: ['PDF', 'PDF'],
  askPlaceholder: ['Саволе аз рӯи ин саҳифа пурсед…', 'Задайте вопрос по этой странице…'],
  askSend: ['Пурсидан', 'Спросить'],
};

const languages = {
  tg: 'Тоҷикӣ',
  ru: 'Русский',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  uz: 'Oʻzbekcha',
  tr: 'Türkçe',
  ar: 'العربية',
  fa: 'فارسی',
  zh: '中文',
};

const el = (tag, cls) => {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  return x;
};

function appendInlineFormatted(target, text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      target.append(strong);
    } else if (part.startsWith('[[') && part.endsWith(']]')) {
      const span = document.createElement('span');
      span.className = 'aliya-nm';
      span.textContent = part.slice(2, -2);
      target.append(span);
    } else {
      target.append(document.createTextNode(part));
    }
  }
}

function renderRichMarkdown(container, rawText) {
  container.replaceChildren();
  const { topic, body } = extractAliyaTopic(rawText);
  if (topic) {
    const badge = el('div', 'aliya-topic-badge');
    badge.textContent = `✦ ${topic}`;
    container.append(badge);
  }
  const lines = body.replace(/\r/g, '').split('\n');
  let listEl = null;
  let tableRows = [];

  const flushList = () => {
    if (listEl) {
      container.append(listEl);
      listEl = null;
    }
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const wrap = el('div', 'aliya-tbl-wrap');
    const tbl = el('table', 'aliya-tbl');
    tableRows.forEach((cells, idx) => {
      const tr = document.createElement('tr');
      cells.forEach(c => {
        const cell = document.createElement(idx === 0 ? 'th' : 'td');
        appendInlineFormatted(cell, c);
        tr.append(cell);
      });
      tbl.append(tr);
    });
    wrap.append(tbl);
    container.append(wrap);
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushTable();
      continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      flushList();
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
      tableRows.push(cells);
      continue;
    }
    flushTable();

    if (/^###\s+/.test(line)) {
      flushList();
      const h = document.createElement('h5');
      appendInlineFormatted(h, line.replace(/^###\s+/, ''));
      container.append(h);
    } else if (/^#{1,2}\s+/.test(line)) {
      flushList();
      const h = document.createElement('h4');
      appendInlineFormatted(h, line.replace(/^#+\s+/, ''));
      container.append(h);
    } else if (/^(?:Савол|Вопрос|Question)\s+\d+/i.test(line)) {
      flushList();
      const q = el('div', 'aliya-q');
      appendInlineFormatted(q, line);
      container.append(q);
    } else if (/^[АБВГA-D][).]\s+/.test(line)) {
      flushList();
      const isRight = line.includes('✔') || line.includes('✓');
      const opt = el('div', isRight ? 'aliya-opt aliya-opt-ok' : 'aliya-opt');
      appendInlineFormatted(opt, line);
      container.append(opt);
    } else if (/^(?:🔑|Калид|Ключ)/i.test(line)) {
      flushList();
      const k = el('div', 'aliya-key');
      appendInlineFormatted(k, line);
      container.append(k);
    } else if (/^[-•*]\s+/.test(line)) {
      if (!listEl || listEl.tagName !== 'UL') {
        flushList();
        listEl = document.createElement('ul');
      }
      const li = document.createElement('li');
      appendInlineFormatted(li, line.replace(/^[-•*]\s+/, ''));
      listEl.append(li);
    } else if (/^\d+[.)]\s+/.test(line)) {
      if (!listEl || listEl.tagName !== 'OL') {
        flushList();
        listEl = document.createElement('ol');
      }
      const li = document.createElement('li');
      appendInlineFormatted(li, line.replace(/^\d+[.)]\s+/, ''));
      listEl.append(li);
    } else {
      flushList();
      const p = document.createElement('p');
      appendInlineFormatted(p, line);
      container.append(p);
    }
  }
  flushList();
  flushTable();
}

export function makeReaderAliya(host, readContext, onClose) {
  const local = (tg, ru) => (document.documentElement.lang === 'ru' ? ru : tg);
  const t = k => copy[k][document.documentElement.lang === 'ru' ? 1 : 0];
  const mobile = () => matchMedia('(max-width: 800px)').matches;

  const pane = el('section', 'aliya-reading-pane');
  const title = el('h3');
  const context = el('p', 'aliya-context');
  const fields = el('div', 'aliya-fields');
  const actions = el('div', 'aliya-actions');
  const result = el('section', 'aliya-result');
  const empty = el('div', 'aliya-result-card aliya-empty');
  const notebox = el('details');
  const summary = el('summary');
  const noteForm = el('div', 'aliya-notes-form');
  const note = el('textarea');
  const list = el('ul');
  const save = el('button', 'reader-button');
  const close = el('button', 'reader-button');
  const message = el('p');
  const toolbar = el('div', 'aliya-tools');
  const useCurrent = el('button', 'reader-button');
  const cancel = el('button', 'reader-button');
  const mode = el('select');
  const modeLabel = el('label');
  const modeTitle = el('span');
  const qCount = el('select');
  const qCountLabel = el('label');
  const qCountTitle = el('span');
  const qStyle = el('select');
  const qStyleLabel = el('label');
  const qStyleTitle = el('span');

  const cloudBar = el('label', 'aliya-cloud aliya-cloud-bar');
  const cloudBarToggle = el('input');
  cloudBarToggle.type = 'checkbox';
  const cloudBarText = el('span');
  cloudBar.hidden = !gatewayEnabled;
  cloudBar.append(cloudBarToggle, cloudBarText);

  const cloudChoice = el('label', 'aliya-cloud');
  const cloud = el('input');
  cloud.type = 'checkbox';
  const cloudText = el('span');
  cloudChoice.hidden = !gatewayEnabled;
  cloudChoice.append(cloud, cloudText);

  const askForm = el('form', 'aliya-ask-form');
  const askInput = el('input');
  askInput.type = 'search';
  askInput.maxLength = 500;
  const askButton = el('button', 'reader-button aliya-ask-send');
  askButton.type = 'submit';
  askForm.append(askInput, askButton);

  const rangeChips = el('div', 'aliya-range-chips');
  for (const span of [1, 3, 5]) {
    const chip = el('button', 'reader-button');
    chip.type = 'button';
    chip.dataset.pageSpan = String(span);
    chip.addEventListener('click', () => {
      const { doc, page } = readContext();
      if (!doc) return;
      from.value = String(page);
      to.value = String(Math.min(doc.numPages, page + span - 1));
      chosen = true;
    });
    rangeChips.append(chip);
  }

  const header = el('header', 'aliya-phone-head');
  const headingText = el('div', 'aliya-heading');
  const subline = el('small');
  const notesJump = el('button', 'reader-button aliya-notes-jump');
  const scroll = el('div', 'aliya-phone-scroll');
  const inner = el('div', 'aliya-phone-inner');
  const card = el('section', 'aliya-book-context');
  const label = el('div', 'aliya-eyebrow');
  const name = el('h1');
  const position = el('p');
  const progress = el('progress');
  const tasksTitle = el('h2', 'aliya-task-heading');
  const backdrop = el('div', 'aliya-sheet-backdrop');
  const sheet = el('section', 'aliya-sheet');
  const sheetTitle = el('h3');
  const go = el('button', 'reader-button aliya-go');
  const leave = el('button', 'reader-button');
  const error = el('p', 'aliya-config-error');
  const grab = el('div', 'aliya-grab');
  const sheetActions = el('div', 'aliya-sheet-actions');
  sheetActions.append(go, leave);

  const mark = () => {
    const i = el('span', 'aliya-mark');
    i.setAttribute('aria-hidden', 'true');
    i.innerHTML =
      '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 4.2c1.1 5.9 3.9 8.7 9.8 9.8-5.9 1.1-8.7 3.9-9.8 9.8-1.1-5.9-3.9-8.7-9.8-9.8 5.9-1.1 8.7-3.9 9.8-9.8Z"/><circle cx="25.7" cy="7.3" r="1.55"/><circle cx="7" cy="24.7" r="1.15"/><path d="M24.3 21.8c.45 2.05 1.45 3.05 3.5 3.5-2.05.45-3.05 1.45-3.5 3.5-.45-2.05-1.45-3.05-3.5-3.5 2.05-.45 3.05-1.45 3.5-3.5Z"/></svg>';
    return i;
  };
  const taskIcons = { summary: '📝', words: '📖', translate: '🌐', test: '✅', lesson: '🎓', notesTask: '📌', ask: '💬' };

  const notesClose = el('button', 'reader-button aliya-notes-close');
  notesClose.type = 'button';
  notesClose.addEventListener('click', hideNotes);
  function hideNotes() {
    notebox.hidden = mobile();
    notebox.open = false;
    pane.classList.remove('aliya-notes-open');
    header.inert = false;
    notesJump.focus({ preventScroll: true });
  }

  close.type = go.type = leave.type = notesJump.type = 'button';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheetTitle.id = 'aliya-config-heading';
  sheet.setAttribute('aria-labelledby', sheetTitle.id);
  sheet.inert = true;
  backdrop.hidden = sheet.hidden = true;

  headingText.append(title, subline);
  header.append(close, headingText, notesJump);
  card.append(label, name, position, progress);
  scroll.append(inner);
  title.tabIndex = -1;
  result.setAttribute('aria-live', 'polite');
  message.setAttribute('role', 'status');
  note.maxLength = 1200;
  note.rows = 3;
  noteForm.append(note, save);
  notebox.append(summary, notesClose, noteForm, message, list);
  toolbar.append(cancel);
  inner.append(card, cloudBar, tasksTitle, actions, askForm, toolbar, context, result, notebox);
  sheet.append(grab, sheetTitle, rangeChips, fields, useCurrent, cloudChoice, error, sheetActions);
  pane.append(header, scroll, backdrop, sheet);
  pane.setAttribute('role', 'dialog');
  pane.setAttribute('aria-label', 'Алия');
  pane.hidden = true;
  host.append(pane);

  const bounds = new Map();
  const langs = new Map();
  const buttons = new Map();
  let seq = 0, busy = false, kind = '', bookKey = '', translating = null, chosen = false, lastPage = 0, request = null, selectedButton = null, answerBody = null;
  const chatHistory = [];

  const hasAliyaAddonAccess = () => {
    try {
      const profRaw = persistentStore.getItem('smartmaktab.profile.v1');
      const sessRaw = persistentStore.getItem('smartmaktab.cloud.session.v1');
      const orgId = persistentStore.getItem('smartmaktab.cloud.last_org.v1') || '';
      const licRaw = orgId ? persistentStore.getItem(`smartmaktab.license.v1.${orgId}`) : '';
      if (licRaw) {
        const lic = JSON.parse(licRaw);
        if (lic?.is_super_admin) return true;
        if (typeof lic?.aliya_enabled === 'boolean') return lic.aliya_enabled;
      }
      if (profRaw) {
        const prof = JSON.parse(profRaw);
        if (typeof prof?.includeAliya === 'boolean' && sessRaw) return prof.includeAliya;
      }
    } catch {}
    return true;
  };

  const syncCloudState = val => {
    const allowed = hasAliyaAddonAccess();
    const flag = !!val && gatewayEnabled && allowed;
    cloud.checked = flag;
    cloudBarToggle.checked = flag;
    try {
      if (flag) readerStore.set('prefs', 'aliya_cloud', '1');
      else readerStore.set('prefs', 'aliya_cloud', '0');
    } catch {}
  };
  cloud.addEventListener('change', () => syncCloudState(cloud.checked));
  cloudBarToggle.addEventListener('change', () => syncCloudState(cloudBarToggle.checked));

  function hideSheet(returnFocus = true) {
    sheet.hidden = backdrop.hidden = true;
    sheet.inert = true;
    header.inert = scroll.inert = false;
    if (returnFocus) selectedButton?.focus({ preventScroll: true });
  }
  function showSheet(key, button) {
    kind = key;
    selectedButton = button;
    error.textContent = '';
    sheet.hidden = backdrop.hidden = false;
    sheet.inert = false;
    header.inert = scroll.inert = true;
    update();
    sheetTitle.tabIndex = -1;
    sheetTitle.focus({ preventScroll: true });
  }
  leave.addEventListener('click', () => hideSheet());
  backdrop.addEventListener('click', () => hideSheet());
  go.addEventListener('click', () => {
    const { doc } = readContext();
    const a = Number(from.value);
    const b = Number(to.value);
    if (!doc || !Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || b > doc.numPages || b - a >= 12) {
      error.textContent = t('range');
      return;
    }
    const task = kind;
    hideSheet();
    void run(task);
  });
  notesJump.addEventListener('click', () => showNotes());
  function showNotes() {
    notebox.open = true;
    notebox.hidden = false;
    if (mobile()) {
      pane.classList.add('aliya-notes-open');
      header.inert = true;
    }
    notebox.scrollIntoView({ block: 'nearest' });
    note.focus({ preventScroll: true });
  }
  function handleBack() {
    if (!sheet.hidden) { hideSheet(); return true; }
    if (!notebox.hidden && mobile()) { hideNotes(); return true; }
    return false;
  }

  function inputField(k, type, options) {
    const lbl = el('label');
    const txt = el('span');
    const n = el(options ? 'select' : 'input');
    if (!options) { n.type = type; n.min = '1'; }
    else for (const [v, langName] of Object.entries(languages)) n.add(new Option(langName, v));
    lbl.append(txt, n);
    fields.append(lbl);
    (options ? langs : bounds).set(k, { txt, n });
    return n;
  }
  const from = inputField('from', 'number');
  const to = inputField('to', 'number');
  const source = inputField('fromLang', '', true);
  const target = inputField('toLang', '', true);
  source.value = 'tg';
  target.value = 'ru';

  for (const key of ['summary', 'words', 'translate', 'test', 'lesson', 'notesTask']) {
    const btn = el('button', 'reader-button');
    btn.type = 'button';
    btn.dataset.aliyaTask = key;
    actions.append(btn);
    buttons.set(key, btn);
    btn.addEventListener('click', () => {
      if (key === 'words') {
        resetRange();
        void run(key);
        return;
      }
      if (!mobile() && !cloud.checked && !['translate', 'test'].includes(key)) {
        void run(key);
        return;
      }
      showSheet(key, btn);
    });
  }

  askForm.addEventListener('submit', e => {
    e.preventDefault();
    const q = askInput.value.trim();
    if (!q || busy) return;
    void run('ask', q);
    askInput.value = '';
  });

  const resetRange = () => {
    const page = readContext().page;
    from.value = to.value = String(page);
    lastPage = page;
    chosen = false;
  };
  from.addEventListener('input', () => { chosen = true; });
  to.addEventListener('input', () => { chosen = true; });

  modeLabel.append(modeTitle, mode);
  for (const value of ['test', 'essay', 'argument', 'short']) mode.add(new Option('', value));
  qCountLabel.append(qCountTitle, qCount);
  for (const n of ['3', '5', '10', '15', '20']) qCount.add(new Option(n, n));
  qCount.value = '5';
  qStyleLabel.append(qStyleTitle, qStyle);
  qStyle.add(new Option('', 'with_answer'));
  qStyle.add(new Option('', 'key_only'));
  fields.append(modeLabel, qCountLabel, qStyleLabel);

  useCurrent.type = cancel.type = close.type = save.type = 'button';
  useCurrent.addEventListener('click', resetRange);
  cancel.addEventListener('click', () => {
    seq++;
    busy = false;
    request?.abort();
    request = null;
    try { translating?.destroy(); } catch {}
    translating = null;
    setResult(local('Амал бекор шуд.', 'Действие отменено.'));
    update();
  });
  close.addEventListener('click', onClose);
  save.addEventListener('click', () => storeNote(note.value));

  function readNotes() {
    if (!bookKey) return [];
    try {
      const x = JSON.parse(readerStore.get('notes', bookKey));
      return Array.isArray(x) ? x.filter(item => typeof item?.text === 'string' && Number.isInteger(item?.page)).slice(0, 25) : [];
    } catch { return []; }
  }
  function putNotes(data) {
    try {
      readerStore.set('notes', bookKey, JSON.stringify(data));
      message.textContent = '';
      return true;
    } catch {
      message.textContent = t('notSaved');
      return false;
    }
  }
  function storeNote(value, page = Number(from.value) || readContext().page) {
    const cleaned = String(value).trim().slice(0, 1200);
    if (!cleaned || !bookKey) return;
    if (putNotes([{ page, text: cleaned }, ...readNotes()].slice(0, 12))) {
      notebox.hidden = false;
      notebox.open = true;
      note.value = '';
      renderNotes();
      update();
    }
  }
  function renderNotes() {
    list.replaceChildren(
      ...readNotes().map((item, i) => {
        const li = el('li');
        const p = el('p');
        const r = el('button', 'reader-button');
        p.textContent = `${local('Саҳ.', 'Стр.')} ${item.page} · ${item.text}`;
        r.textContent = t('remove');
        r.type = 'button';
        r.addEventListener('click', () => {
          if (putNotes(readNotes().filter((_, j) => j !== i))) {
            renderNotes();
            update();
          }
        });
        li.append(p, r);
        return li;
      })
    );
  }

  function update() {
    const { book, doc, page } = readContext();
    if (!chosen && page !== lastPage && !busy) resetRange();
    title.replaceChildren(mark(), document.createTextNode('Алия'));
    close.textContent = '‹';
    close.setAttribute('aria-label', t('close'));
    notesJump.setAttribute('aria-label', t('notes'));
    notesJump.textContent = `🔖 ${readNotes().length}`;
    notesClose.textContent = local('Пӯшидан', 'Закрыть');
    subline.textContent = book ? local(`«${book.title}» · саҳ. ${page}${doc ? ` аз ${doc.numPages}` : ''}`, `«${book.title}» · стр. ${page}${doc ? ` из ${doc.numPages}` : ''}`) : '';
    label.textContent = local('КИТОБИ КУШОДА', 'ОТКРЫТАЯ КНИГА');
    name.textContent = book?.title ?? '';
    const grade = book?.rows?.[0]?.classCode?.match(/^\d{1,2}/)?.[0] ?? book?.title.match(/(?:—|синфи)\s*(\d{1,2})/i)?.[1];
    position.textContent = local(`${grade ? `Синфи ${grade} · ` : ''}Саҳифаи ${page}${doc ? ` аз ${doc.numPages}` : ''}`, `${grade ? `${grade}-й класс · ` : ''}Страница ${page}${doc ? ` из ${doc.numPages}` : ''}`);
    progress.max = doc?.numPages ?? 1;
    progress.value = page;
    progress.setAttribute('aria-label', local('Пешрафти хондан', 'Прогресс чтения'));
    tasksTitle.textContent = local('Бо матни китоб кор кунед', 'Работайте с текстом книги');
    sheetTitle.textContent = kind ? `${taskIcons[kind] || '✦'} ${kind === 'ask' ? t('askSend') : t(kind)}` : '';
    go.textContent = local('Оғоз', 'Начать');
    leave.textContent = local('Бекор', 'Отмена');
    summary.textContent = `${t('notes')} (${readNotes().length})`;
    note.placeholder = t('noteHint');
    note.setAttribute('aria-label', t('notes'));
    save.textContent = t('save');
    useCurrent.textContent = t('currentPage');
    useCurrent.disabled = !doc || busy;
    cancel.textContent = t('cancel');
    cancel.hidden = !busy;
    modeTitle.textContent = t('mode');
    qCountTitle.textContent = t('qCount');
    qStyleTitle.textContent = t('qStyle');
    askInput.placeholder = t('askPlaceholder');
    askInput.disabled = !doc || busy;
    askButton.textContent = t('askSend');
    askButton.disabled = !doc || busy;

    for (const [idx, option] of [...mode.options].entries())
      option.textContent = [local('Тест', 'Тест'), local('Иншо', 'Сочинение'), local('Эссе', 'Эссе'), local('Иншои хурд', 'Мини-сочинение')][idx];
    for (const [idx, option] of [...qStyle.options].entries())
      option.textContent = [local('Бо ҷавоб ва шарҳ', 'С ответом и пояснением'), local('Танҳо калид дар охир', 'Только ключи в конце')][idx];

    const aliyaAllowed = hasAliyaAddonAccess();
    const gwLabel = isLocalGateway() ? 'localhost' : DEFAULT_ALIYA_GATEWAY.replace(/^https:\/\//, '');
    cloudText.textContent = aliyaAllowed
      ? local(
          `Алия AI (${gwLabel}): матн ё акси саҳифаро ба сервери ИИ барои таҳлили пурра, OCR, тест ва тарҷума мефиристад.`,
          `Алия ИИ (${gwLabel}): отправляет текст или снимок страницы в ИИ-шлюз Kitobkhona для полного анализа, OCR, тестов и перевода.`
        )
      : local(
          `Функсияи «Алия AI» (+30 сомонӣ / моҳ) ба нақшаи шумо дохил нест. Онро дар «Профил → Обуна ва пардохт» фаъол кунед.`,
          `Функция «Алия ИИ» (+30 сомони / мес) не включена в ваш тариф. Подключите её в разделе «Профиль → Подписка и оплата».`
        );
    cloudBarText.textContent = aliyaAllowed
      ? local(
          `✦ Алия AI (Kitobkhona) — ИИ-таҳлил, OCR скан ва содироти Word/PDF`,
          `✦ Алия ИИ (Kitobkhona) — полный ИИ-разбор, OCR сканов и экспорт Word/PDF`
        )
      : local(
          `🔒 Алия AI (+30 сомонӣ / моҳ) — дар «Профил → Обуна» фаъол нест`,
          `🔒 Алия ИИ (+30 сомони / мес) — не включена в тарифе (см. Профиль → Подписка)`
        );
    if (!aliyaAllowed) cloud.checked = cloudBarToggle.checked = false;
    cloud.disabled = cloudBarToggle.disabled = busy || !aliyaAllowed;
    context.textContent = '';
    context.hidden = true;

    for (const chip of rangeChips.children) {
      const s = Number(chip.dataset.pageSpan);
      chip.textContent = s === 1 ? local('1 саҳ.', '1 стр.') : local(`+${s} саҳ.`, `+${s} стр.`);
      chip.disabled = !doc || busy;
    }

    for (const [k, { txt, n }] of [...bounds, ...langs]) {
      txt.textContent = t(k);
      if (bounds.has(k)) n.max = doc?.numPages ?? 1;
      else n.closest('label').hidden = kind !== 'translate';
    }
    const isTest = kind === 'test';
    modeLabel.hidden = !isTest;
    qCountLabel.hidden = !isTest || mode.value !== 'test';
    qStyleLabel.hidden = !isTest || mode.value !== 'test';

    for (const [k, b] of buttons) {
      if (!b.firstChild) {
        b.append(el('span', 'aliya-task-icon'), el('span', 'aliya-task-label'));
        b.firstChild.setAttribute('aria-hidden', 'true');
        b.firstChild.textContent = taskIcons[k];
      }
      b.lastChild.textContent = t(k);
      b.disabled = !doc || busy;
      b.setAttribute('aria-pressed', String(k === kind));
    }
  }
  mode.addEventListener('change', update);

  function setResult(text) {
    if (answerBody) answerBody.textContent = text;
    else empty.lastChild.textContent = text;
  }

  function open() {
    const { book } = readContext();
    if (!book) return;
    pane.hidden = false;
    scroll.scrollTop = 0;
    hideSheet(false);
    notebox.hidden = mobile();
    notebox.open = false;
    pane.classList.remove('aliya-notes-open');
    bookKey = book.url;
    resetRange();
    note.value = '';
    kind = '';
    let savedCloud = false;
    try { savedCloud = readerStore.get('prefs', 'aliya_cloud') === '1'; } catch {}
    cloud.checked = cloudBarToggle.checked = gatewayEnabled && savedCloud && hasAliyaAddonAccess();
    message.textContent = '';
    answerBody = null;
    empty.replaceChildren(mark(), el('span'));
    setResult(local('Амалро интихоб кунед ё савол диҳед. Алия бо матни ҳамин китоб кор мекунад.', 'Выберите действие или задайте вопрос. Алия работает с текстом открытой книги.'));
    result.replaceChildren(empty);
    renderNotes();
    update();
    title.focus({ preventScroll: true });
  }

  function dismiss() {
    seq++;
    busy = false;
    request?.abort();
    request = null;
    kind = '';
    hideSheet(false);
    pane.hidden = true;
    try { translating?.destroy(); } catch {}
    translating = null;
    answerBody = null;
    result.replaceChildren();
  }

  function addText(text) {
    const p = el('p');
    p.textContent = text;
    answerBody.append(p);
  }

  function appendResultActions(rawAnswer, page, taskTitle, bookTitle) {
    const row = el('div', 'aliya-tools-row');
    const saveBtn = el('button', 'reader-button');
    saveBtn.type = 'button';
    saveBtn.textContent = t('save');
    saveBtn.addEventListener('click', () => storeNote(rawAnswer, page));

    const copyBtn = el('button', 'reader-button');
    copyBtn.type = 'button';
    copyBtn.textContent = t('copyBtn');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard?.writeText(rawAnswer);
        copyBtn.textContent = t('copied');
        setTimeout(() => { copyBtn.textContent = t('copyBtn'); }, 1800);
      } catch {}
    });

    const docxBtn = el('button', 'reader-button');
    docxBtn.type = 'button';
    docxBtn.textContent = t('docxBtn');
    docxBtn.addEventListener('click', () => {
      const bytes = createAliyaDocxBytes({
        title: taskTitle,
        bookName: bookTitle,
        pageLabel: local(`Саҳифаи ${page}`, `Страница ${page}`),
        markdown: rawAnswer,
      });
      downloadBytes(bytes, `${safeSlug(bookTitle || 'aliya')}-p${page}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    const pdfBtn = el('button', 'reader-button');
    pdfBtn.type = 'button';
    pdfBtn.textContent = t('pdfBtn');
    pdfBtn.addEventListener('click', async () => {
      pdfBtn.disabled = true;
      try {
        const pdfBytes = gatewayEnabled && cloud.checked ? await generateGatewayPdf({ title: taskTitle, bookName: bookTitle, markdown: rawAnswer }) : null;
        if (pdfBytes) {
          downloadBytes(pdfBytes, `${safeSlug(bookTitle || 'aliya')}-p${page}.pdf`, 'application/pdf');
          return;
        }
      } catch {} finally {
        pdfBtn.disabled = false;
      }
      // Printable clean PDF export fallback
      const w = window.open('', '_blank', 'width=860,height=900');
      if (w) {
        const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(taskTitle)}</title><style>body{font-family:Georgia,serif;max-width:740px;margin:28px auto;padding:0 18px;color:#111;line-height:1.6}h1{font-size:20px;border-bottom:2px solid #c9a84c;padding-bottom:8px}pre{white-space:pre-wrap;font-family:inherit;font-size:15px}</style></head><body><h1>${esc(taskTitle)} — ${esc(bookTitle)}</h1><pre>${esc(rawAnswer)}</pre><script>setTimeout(()=>window.print(),150)<\/script></body></html>`);
        w.document.close();
      }
    });

    row.append(saveBtn, copyBtn, docxBtn, pdfBtn);
    answerBody.append(row);
  }

  function showParts(items) {
    const ul = el('ol');
    for (const v of items) {
      const li = el('li');
      li.textContent = v;
      ul.append(li);
    }
    answerBody.append(ul);
  }

  function newResult(key, a, b) {
    const box = el('article', 'aliya-result-card');
    const hdr = el('header');
    const lbl = el('strong');
    const metaEl = el('small');
    lbl.textContent = `${taskIcons[key] || '✦'} ${key === 'ask' ? t('askSend') : t(key)}`;
    metaEl.textContent = local(`саҳ. ${a === b ? a : `${a}–${b}`}`, `стр. ${a === b ? a : `${a}–${b}`}`);
    hdr.append(lbl, metaEl);
    answerBody = el('div');
    box.append(hdr, answerBody);
    empty.remove();
    if (result.children.length >= 10) result.firstElementChild.remove();
    result.append(box);
    return box;
  }

  async function run(key, customQuestion = '') {
    const info = readContext();
    const a = Number(from.value);
    const b = Number(to.value);
    if (!info.doc || !Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || b > info.doc.numPages || b - a >= 12) {
      setResult(t('range'));
      return;
    }
    const current = ++seq;
    busy = true;
    kind = key;
    update();
    const box = newResult(key, a, b);
    setResult(t('working'));
    box.scrollIntoView({ block: 'nearest' });

    try {
      const useCloud = gatewayEnabled && cloud.checked && hasAliyaAddonAccess();
      const controller = useCloud ? new AbortController() : null;
      request = controller;
      const chunks = [];
      for (let i = a; i <= b; i++) {
        if (current !== seq) return;
        let txt = await info.textFor(i);
        if (useCloud && txt.trim().length < 12) {
          if (i - a >= 3) break; // OCR up to 3 scan pages per call
          setResult(t('ocrWorking'));
          const image = await info.pageImage(i);
          if (current !== seq) return;
          txt = await runGateway({ task: 'ocr', image }, controller.signal);
          if (current !== seq) return;
        }
        chunks.push(txt);
      }
      if (current !== seq) return;
      const passage = chunks.join('\n').trim();
      if (passage.length < 12) {
        setResult(t('noText'));
        return;
      }

      if (useCloud) {
        setResult(t('aiThinking'));
        const answer = await runGateway(
          {
            task: key,
            text: passage.slice(0, 26000),
            bookName: info.book?.title || '',
            pageLabel: a === b ? String(a) : `${a}–${b}`,
            language: document.documentElement.lang || 'tg',
            targetLang: key === 'translate' ? target.value : document.documentElement.lang || 'tg',
            mode: mode.value,
            questionCount: qCount.value,
            answerStyle: qStyle.value,
            question: customQuestion,
            history: key === 'ask' ? chatHistory : [],
          },
          controller.signal
        );
        if (current !== seq) return;
        if (key === 'ask' && customQuestion) {
          chatHistory.push({ role: 'user', content: customQuestion }, { role: 'assistant', content: answer.slice(0, 1200) });
        }
        renderRichMarkdown(answerBody, answer);
        const plain = extractAliyaTopic(answer).body;
        if (key === 'notesTask') storeNote(plain, a);
        else appendResultActions(plain, a, key === 'ask' ? customQuestion : t(key), info.book?.title || '');
        return;
      }

      // Local offline extractive fallback (0 network requests)
      const terms = termsFromText(passage, 8);
      const short = summarizeReaderText(passage);
      const examples = examplesForTerms(passage, terms);
      answerBody.replaceChildren();
      if (key === 'summary') addText(short);
      if (key === 'ask') {
        const ql = customQuestion.toLocaleLowerCase('ru');
        const matched = passage.split(/(?<=[.!?])\s+/).filter(s => ql.split(/\s+/).some(w => w.length > 2 && s.toLocaleLowerCase('ru').includes(w))).slice(0, 4);
        addText(matched.length ? matched.join(' ') : short);
      }
      if (key === 'words') {
        if (!terms.length) addText(t('noWords'));
        else showParts(examples.map(x => (x.quote ? `${x.word} — «${x.quote}»` : x.word)));
      }
      if (key === 'test') {
        const facts = examples.filter(x => x.quote).slice(0, 5);
        if (mode.value === 'test' && facts.length) {
          showParts(
            facts.map((x, i) => {
              const at = x.quote.toLocaleLowerCase('ru').indexOf(x.word);
              return at < 0 ? `${i + 1}. ${x.quote}` : x.quote.slice(0, at) + '___' + x.quote.slice(at + x.word.length);
            })
          );
          const answers = el('details');
          const caption = el('summary');
          caption.textContent = local('Ҷавобҳо', 'Ответы');
          answers.append(caption, document.createTextNode(facts.map((x, i) => `${i + 1}. ${x.word}`).join(' · ')));
          answerBody.append(answers);
        } else {
          showParts([
            local('Фикри асосии матнро бо суханони худ баён кунед.', 'Сформулируйте главную мысль своими словами.'),
            local('Аз ин саҳифа ду далел ё мисол биёред.', 'Приведите два аргумента или примера с выбранной страницы.'),
            local('Хулосаро бо матни китоб муқоиса кунед.', 'Сверьте вывод с текстом книги.'),
          ]);
        }
      }
      if (key === 'notesTask') {
        addText(short);
        storeNote(short, a);
        addText(local('Хулоса ба ёддоштҳои китоб илова шуд.', 'Выжимка добавлена в заметки книги.'));
        return;
      }
      if (key === 'lesson') {
        showParts([
          local('Оғоз: истилоҳҳои асосиро баррасӣ кунед.', 'Начало: обсудите ключевые термины.') + ` ${terms.slice(0, 4).map(x => x.word).join(', ')}`,
          local('Шарҳ: порчаи зеринро хонед ва ғояи асосиро пайдо кунед.', 'Объяснение: прочитайте фрагмент и выделите главную мысль.') + ' ' + short,
          local('Машқ: аз хонандагон мисол ва хулосаи кӯтоҳ пурсед.', 'Практика: попросите привести пример и сформулировать вывод.'),
        ]);
      }
      if (key === 'translate') {
        if (source.value === target.value) {
          addText(passage.slice(0, 5500));
          return;
        }
        const params = { sourceLanguage: source.value, targetLanguage: target.value };
        if (!globalThis.Translator || (await globalThis.Translator.availability(params)) !== 'available') {
          if (current === seq) setResult(t('translationUnavailable'));
          return;
        }
        if (current !== seq) return;
        const translator = await globalThis.Translator.create(params);
        if (current !== seq) { translator.destroy(); return; }
        translating = translator;
        try {
          const translated = await translator.translate(passage.slice(0, 5500));
          if (current === seq) addText(translated);
        } finally {
          if (translating === translator) { translator.destroy(); translating = null; }
        }
      }
      const answer = answerBody.textContent.trim();
      if (answer) appendResultActions(answer, a, key === 'ask' ? customQuestion : t(key), info.book?.title || '');
    } catch {
      if (current === seq) {
        setResult(
          request
            ? local('Сервери Алия посух надод. Пайвастро санҷед ё тугмаи «Алия AI»-ро барои ҳолати маҳаллӣ хомӯш кунед.', 'Сервер Алия не ответил. Проверьте сеть или отключите «Алия ИИ» для локального режима.')
            : t('failed')
        );
      }
    } finally {
      if (current === seq) {
        busy = false;
        request = null;
        update();
      }
    }
  }

  return { open, dismiss, update, showNotes, handleBack, node: pane, notesCount: () => readNotes().length };
}
