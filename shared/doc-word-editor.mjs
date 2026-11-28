import {
  DEFAULT_PAGE_MARGINS_MM,
  TEMPLATE_AUTOFILL_TAGS,
  compressDocPayload,
  escapeHtml,
  htmlToPlainText,
  normalizePageMargins,
  sanitizeDocHtml,
} from './doc-template-engine.mjs';

const TAJIK_LETTERS = ['Ғ', 'ғ', 'Ӣ', 'ӣ', 'Қ', 'қ', 'Ӯ', 'ӯ', 'Ҳ', 'ҳ', 'Ҷ', 'ҷ'];

const WORD_CSS = `
.sm-we-root{display:flex;flex-direction:column;background:#e8ecf2;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;font-family:'Times New Roman',Georgia,serif;color:#0f172a}
.sm-we-modal{position:fixed;inset:0;z-index:12000;background:#dbe2ec;display:flex;flex-direction:column;height:100dvh;width:100vw}
.sm-we-topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;background:#1e3a8a;color:#fff;font-family:system-ui,-apple-system,sans-serif;flex-wrap:wrap}
.sm-we-title-wrap{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.sm-we-doc-title{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;color:#fff}
.sm-we-badge{font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font-weight:600;white-space:nowrap}
.sm-we-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sm-we-topbtn{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.12);color:#fff;border-radius:8px;padding:6px 11px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:system-ui,-apple-system,sans-serif}
.sm-we-topbtn:hover{background:rgba(255,255,255,.22)}
.sm-we-topbtn.primary{background:#16a34a;border-color:#15803d}
.sm-we-topbtn.primary:hover{background:#15803d}
.sm-we-topbtn.print{background:#f59e0b;border-color:#d97706;color:#111827}
.sm-we-topbtn.print:hover{background:#d97706;color:#fff}
.sm-we-topbtn:disabled{opacity:.55;cursor:not-allowed}
.sm-we-ribbon{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 12px;background:#f8fafc;border-bottom:1px solid #cbd5e1;font-family:system-ui,-apple-system,sans-serif}
.sm-we-group{display:inline-flex;align-items:center;gap:3px;padding-right:7px;border-right:1px solid #cbd5e1}
.sm-we-group:last-child{border-right:0}
.sm-we-btn{border:1px solid transparent;background:transparent;color:#1e293b;border-radius:6px;min-width:28px;height:28px;padding:0 6px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.sm-we-btn:hover{background:#e2e8f0;border-color:#cbd5e1}
.sm-we-btn.active{background:#dbeafe;border-color:#60a5fa;color:#1d4ed8}
.sm-we-select{height:28px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#0f172a;font-size:12.5px;padding:0 6px;font-family:system-ui,-apple-system,sans-serif}
.sm-we-color{width:28px;height:28px;padding:2px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer}
.sm-we-tajik-bar{display:flex;align-items:center;gap:4px;padding:4px 12px;background:#f1f5f9;border-bottom:1px solid #cbd5e1;font-family:system-ui,-apple-system,sans-serif;flex-wrap:wrap}
.sm-we-tajik-label{font-size:11.5px;color:#475569;font-weight:600;margin-right:4px}
.sm-we-tj-btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:5px;min-width:26px;height:25px;font-size:13px;font-weight:700;cursor:pointer}
.sm-we-tj-btn:hover{background:#dbeafe;border-color:#3b82f6}
.sm-we-tags-bar{display:flex;align-items:center;gap:6px;padding:5px 12px;background:#eef2ff;border-bottom:1px solid #c7d2fe;font-family:system-ui,-apple-system,sans-serif;flex-wrap:wrap}
.sm-we-workspace{flex:1;overflow:auto;padding:24px 16px;display:flex;justify-content:center;align-items:flex-start;position:relative}
.sm-we-sheet-wrap{position:relative;transform-origin:top center;transition:transform .12s ease}
.sm-we-sheet{position:relative;background:#fff;box-shadow:0 8px 28px rgba(15,23,42,.18);box-sizing:border-box;outline:none;color:#111827;font-family:'Times New Roman',Georgia,serif;font-size:14pt;line-height:1.35;overflow-wrap:break-word;user-select:text}
.sm-we-sheet p{margin:0 0 6pt}
.sm-we-sheet h1{font-size:18pt;margin:0 0 8pt;font-weight:700}
.sm-we-sheet h2{font-size:15pt;margin:0 0 6pt;font-weight:700}
.sm-we-sheet h3{font-size:14pt;margin:0 0 5pt;font-weight:700}
.sm-we-sheet table{width:100%;border-collapse:collapse;margin:6pt 0}
.sm-we-sheet td,.sm-we-sheet th{border:1px solid #334155;padding:4pt 6pt;vertical-align:top;min-width:24px}
.sm-we-sheet th{background:#f1f5f9;font-weight:700}
.sm-we-sheet hr.sm-page-break{border:0;border-top:2px dashed #94a3b8;margin:14pt 0;page-break-before:always;break-before:page}
.sm-we-sheet .sm-doc-field{background:#eff6ff;border-bottom:1.5px dashed #2563eb;padding:0 3px;border-radius:3px;min-width:24px;display:inline-block}
.sm-we-sheet .sm-doc-field:focus{outline:2px solid #2563eb;background:#dbeafe}
.sm-we-sheet .sm-doc-autofilled{border-bottom:1px dotted rgba(37,99,235,.35)}
.sm-we-watermark{position:absolute;inset:0;pointer-events:none;user-select:none;overflow:hidden;z-index:5;display:flex;flex-wrap:wrap;align-content:space-around;justify-content:space-around;opacity:.085}
.sm-we-watermark span{transform:rotate(-28deg);font-family:system-ui,sans-serif;font-size:15px;font-weight:700;color:#1e293b;white-space:nowrap;padding:18px}
.sm-we-privacy-veil{position:absolute;inset:0;z-index:30;background:rgba(15,23,42,.92);color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:system-ui,sans-serif}
.sm-we-privacy-veil.active{display:flex}
.sm-we-statusbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 14px;background:#f1f5f9;border-top:1px solid #cbd5e1;font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#334155;flex-wrap:wrap}
.sm-we-toast{position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:13000;background:#0f172a;color:#fff;padding:8px 14px;border-radius:8px;font-family:system-ui,sans-serif;font-size:12.5px;box-shadow:0 8px 20px rgba(0,0,0,.25)}
.sm-we-table-pop{position:relative;display:inline-block}
.sm-we-popover{position:absolute;top:34px;left:0;z-index:50;background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:10px;box-shadow:0 10px 26px rgba(15,23,42,.18);min-width:220px;font-family:system-ui,sans-serif;font-size:12.5px;display:flex;flex-direction:column;gap:8px}
.sm-we-popover label{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sm-we-popover input{width:64px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px}
.sm-we-strict-block{margin:auto;max-width:480px;background:#fff;border-radius:14px;padding:24px;text-align:center;box-shadow:0 12px 32px rgba(15,23,42,.18);font-family:system-ui,sans-serif}
@media print{
  body>*:not(#smDocPrintHost){display:none !important}
  #smDocPrintHost{display:block !important;position:static !important;margin:0 !important;padding:0 !important;background:#fff !important}
  #smDocPrintHost .sm-we-watermark,#smDocPrintHost .sm-we-privacy-veil{display:none !important}
  #smDocPrintHost .sm-we-sheet{box-shadow:none !important;width:100% !important;min-height:auto !important;margin:0 !important}
  #smDocPrintHost .sm-doc-field,#smDocPrintHost .sm-doc-autofilled{border:0 !important;background:transparent !important;padding:0 !important}
  #smDocPrintHost hr.sm-page-break{border:0 !important;height:0 !important;margin:0 !important;page-break-before:always !important;break-before:page !important}
}
`;

export function ensureWordEditorStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('sm-word-editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'sm-word-editor-styles';
  style.textContent = WORD_CSS;
  (document.head || document.documentElement).appendChild(style);
}

export function isRunningInsideProtectedNativeApp() {
  if (typeof window === 'undefined') return false;
  if (window.smartmaktabDesktop?.isDesktopApp) return true;
  const nativeBridge = window.SmartMaktabNative;
  if (nativeBridge && (typeof nativeBridge.isAndroidApp === 'function' ? nativeBridge.isAndroidApp() : Boolean(nativeBridge.isAndroidApp))) return true;
  if (typeof navigator !== 'undefined' && /SmartMaktab/i.test(navigator.userAgent || '')) return true;
  return false;
}

export function getNativePlatformName() {
  if (typeof window !== 'undefined') {
    if (window.smartmaktabDesktop?.isDesktopApp) return 'windows';
    const nativeBridge = window.SmartMaktabNative;
    if (nativeBridge && (typeof nativeBridge.isAndroidApp === 'function' ? nativeBridge.isAndroidApp() : Boolean(nativeBridge.isAndroidApp))) return 'android';
  }
  return 'web';
}

function getEditorTexts(lang = 'tg') {
  if (lang === 'ru') {
    return {
      save: 'Сохранить в облако',
      saving: 'Сохранение…',
      saved: 'Сохранено в облаке ✓',
      unsaved: 'Есть несохранённые правки',
      reset: 'Сбросить к шаблону',
      print: 'Печать',
      close: 'Закрыть',
      tajikChars: 'Таджикские буквы:',
      insertTag: 'Вставить авто-тег…',
      insertTable: 'Таблица',
      addTable: 'Вставить таблицу',
      rows: 'Строк',
      cols: 'Столбцов',
      withHeader: 'С шапкой',
      rowAdd: '+Строка',
      rowDel: '-Строка',
      colAdd: '+Столбец',
      colDel: '-Столбец',
      pageBreak: 'Разрыв стр.',
      portrait: 'Книжная A4',
      landscape: 'Альбомная A4',
      marginsNormal: 'Поля: Обычные',
      marginsNarrow: 'Поля: Узкие',
      marginsWide: 'Поля: Широкие',
      words: 'Слов',
      chars: 'Символов',
      draftsQuota: 'Черновики',
      printBlocked: 'Сохранение на устройство и виртуальные PDF-принтеры запрещены политикой SmartMaktab.',
      copyBlocked: 'Копирование за пределы SmartMaktab запрещено.',
      privacyTitle: 'Документ скрыт для защиты от снимков экрана',
      privacySub: 'Вернитесь в окно SmartMaktab, чтобы продолжить работу.',
      strictNativeTitle: 'Требуется приложение SmartMaktab',
      strictNativeBody: 'Этот документ разрешено открывать только в защищённом приложении SmartMaktab для Windows или Android.',
      confirmClose: 'Есть несохранённые изменения. Закрыть редактор без сохранения?',
      confirmReset: 'Вернуть документ к исходному шаблону? Все правки черновика будут удалены.',
    };
  }
  return {
    save: 'Захира дар абр',
    saving: 'Захира шуда истодааст…',
    saved: 'Дар абр захира шуд ✓',
    unsaved: 'Тағйироти захиранашуда ҳаст',
    reset: 'Ба асли қолаб баргардондан',
    print: 'Чоп (Печать)',
    close: 'Пӯшидан',
    tajikChars: 'Ҳарфҳои тоҷикӣ:',
    insertTag: 'Иловаи теги худкор…',
    insertTable: 'Ҷадвал',
    addTable: 'Гузоштани ҷадвал',
    rows: 'Сатрҳо',
    cols: 'Сутунҳо',
    withHeader: 'Бо сарлавҳа',
    rowAdd: '+Сатр',
    rowDel: '-Сатр',
    colAdd: '+Сутун',
    colDel: '-Сутун',
    pageBreak: 'Саҳифаи нав',
    portrait: 'Амудӣ A4',
    landscape: 'Уфуқӣ A4',
    marginsNormal: 'Ҳошия: Муқаррарӣ',
    marginsNarrow: 'Ҳошия: Танг',
    marginsWide: 'Ҳошия: Васеъ',
    words: 'Калима',
    chars: 'Аломат',
    draftsQuota: 'Лоиҳаҳо',
    printBlocked: 'Боргирӣ ба дастгоҳ ва чоп ба PDF дар SmartMaktab манъ аст.',
    copyBlocked: 'Нусхабардорӣ ба хориҷи SmartMaktab манъ аст.',
    privacyTitle: 'Ҳуҷҷат барои муҳофизат аз аксгирӣ пинҳон шуд',
    privacySub: 'Ба равзанаи SmartMaktab баргардед, то корро идома диҳед.',
    strictNativeTitle: 'Барномаи SmartMaktab лозим аст',
    strictNativeBody: 'Ин ҳуҷҷат танҳо дар барномаи муҳофизатшудаи SmartMaktab барои Windows ё Android кушода мешавад.',
    confirmClose: 'Тағйироти захиранашуда ҳаст. Бе захира мепӯшед?',
    confirmReset: 'Ба асли қолаб бармегардонед? Ҳамаи тағйироти ин лоиҳа пок мешаванд.',
  };
}

function showEditorToast(msg) {
  if (typeof document === 'undefined') return;
  const old = document.getElementById('smWeToast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'smWeToast';
  el.className = 'sm-we-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 2800);
}

export function mountWordEditor(container, options = {}) {
  ensureWordEditorStyles();
  const lang = options.lang === 'ru' ? 'ru' : 'tg';
  const t = getEditorTexts(lang);
  const mode = options.mode === 'admin' ? 'admin' : 'cabinet';
  const editMode = options.editMode === 'fields_only' ? 'fields_only' : 'full';
  let pageOrientation = options.pageOrientation === 'landscape' ? 'landscape' : 'portrait';
  let pageMarginsMm = normalizePageMargins(options.pageMarginsMm || DEFAULT_PAGE_MARGINS_MM);
  let zoom = 1;
  let isDirty = false;
  let internalClipboardHtml = '';
  let savedRange = null;

  const root = document.createElement('div');
  root.className = 'sm-we-root';
  if (options.minHeight) root.style.minHeight = options.minHeight;
  container.innerHTML = '';
  container.appendChild(root);

  // Build Ribbon
  const ribbon = document.createElement('div');
  ribbon.className = 'sm-we-ribbon';
  ribbon.innerHTML = `
    <div class="sm-we-group">
      <button type="button" class="sm-we-btn" data-cmd="undo" title="Ctrl+Z">↶</button>
      <button type="button" class="sm-we-btn" data-cmd="redo" title="Ctrl+Y">↷</button>
    </div>
    <div class="sm-we-group">
      <select class="sm-we-select" data-select="fontName">
        <option value="Times New Roman">Times New Roman</option>
        <option value="Arial">Arial</option>
        <option value="Calibri">Calibri</option>
        <option value="Georgia">Georgia</option>
      </select>
      <select class="sm-we-select" data-select="fontSizePt">
        <option value="10">10 pt</option>
        <option value="11">11 pt</option>
        <option value="12">12 pt</option>
        <option value="14" selected>14 pt</option>
        <option value="16">16 pt</option>
        <option value="18">18 pt</option>
        <option value="20">20 pt</option>
        <option value="24">24 pt</option>
      </select>
    </div>
    <div class="sm-we-group">
      <button type="button" class="sm-we-btn" data-cmd="bold" title="Ctrl+B"><b>Ж</b></button>
      <button type="button" class="sm-we-btn" data-cmd="italic" title="Ctrl+I"><i>К</i></button>
      <button type="button" class="sm-we-btn" data-cmd="underline" title="Ctrl+U"><u>Ч</u></button>
      <button type="button" class="sm-we-btn" data-cmd="strikeThrough"><s>S</s></button>
      <input type="color" class="sm-we-color" data-color="foreColor" value="#111827" title="Color">
      <input type="color" class="sm-we-color" data-color="hiliteColor" value="#fef08a" title="Highlight">
      <button type="button" class="sm-we-btn" data-cmd="removeFormat" title="Clear">🧹</button>
    </div>
    <div class="sm-we-group">
      <button type="button" class="sm-we-btn" data-cmd="justifyLeft" title="Left">⬅</button>
      <button type="button" class="sm-we-btn" data-cmd="justifyCenter" title="Center">⬌</button>
      <button type="button" class="sm-we-btn" data-cmd="justifyRight" title="Right">➡</button>
      <button type="button" class="sm-we-btn" data-cmd="justifyFull" title="Justify">☰</button>
    </div>
    <div class="sm-we-group">
      <button type="button" class="sm-we-btn" data-cmd="insertUnorderedList" title="Bullets">•≡</button>
      <button type="button" class="sm-we-btn" data-cmd="insertOrderedList" title="Numbers">1.</button>
      <button type="button" class="sm-we-btn" data-cmd="outdent" title="Outdent">⇤</button>
      <button type="button" class="sm-we-btn" data-cmd="indent" title="Indent">⇥</button>
      <select class="sm-we-select" data-select="lineHeight" title="Line height">
        <option value="1.15">1.15</option>
        <option value="1.35" selected>1.35</option>
        <option value="1.5">1.5</option>
        <option value="2">2.0</option>
      </select>
    </div>
    <div class="sm-we-group">
      <div class="sm-we-table-pop">
        <button type="button" class="sm-we-btn" data-action="toggleTablePop">▦ ${escapeHtml(t.insertTable)}</button>
        <div class="sm-we-popover" hidden>
          <label>${escapeHtml(t.rows)} <input type="number" data-tbl-rows value="3" min="1" max="30"></label>
          <label>${escapeHtml(t.cols)} <input type="number" data-tbl-cols value="4" min="1" max="15"></label>
          <label>${escapeHtml(t.withHeader)} <input type="checkbox" data-tbl-head checked style="width:auto"></label>
          <button type="button" class="sm-we-btn active" data-action="createTable" style="width:100%">${escapeHtml(t.addTable)}</button>
        </div>
      </div>
      <button type="button" class="sm-we-btn" data-action="rowAdd">${escapeHtml(t.rowAdd)}</button>
      <button type="button" class="sm-we-btn" data-action="rowDel">${escapeHtml(t.rowDel)}</button>
      <button type="button" class="sm-we-btn" data-action="colAdd">${escapeHtml(t.colAdd)}</button>
      <button type="button" class="sm-we-btn" data-action="colDel">${escapeHtml(t.colDel)}</button>
      <button type="button" class="sm-we-btn" data-action="pageBreak">✂ ${escapeHtml(t.pageBreak)}</button>
    </div>
    <div class="sm-we-group">
      <select class="sm-we-select" data-select="orientation">
        <option value="portrait">${escapeHtml(t.portrait)}</option>
        <option value="landscape">${escapeHtml(t.landscape)}</option>
      </select>
      <select class="sm-we-select" data-select="marginsPreset">
        <option value="normal">${escapeHtml(t.marginsNormal)}</option>
        <option value="narrow">${escapeHtml(t.marginsNarrow)}</option>
        <option value="wide">${escapeHtml(t.marginsWide)}</option>
      </select>
    </div>
  `;
  root.appendChild(ribbon);

  // Tajik quick letters bar
  const tjBar = document.createElement('div');
  tjBar.className = 'sm-we-tajik-bar';
  const tjLbl = document.createElement('span');
  tjLbl.className = 'sm-we-tajik-label';
  tjLbl.textContent = t.tajikChars;
  tjBar.appendChild(tjLbl);
  for (const ch of TAJIK_LETTERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sm-we-tj-btn';
    b.textContent = ch;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => insertTextAtCursor(ch));
    tjBar.appendChild(b);
  }
  root.appendChild(tjBar);

  // Admin tags bar (insert {{...}} placeholders)
  if (mode === 'admin') {
    const tagsBar = document.createElement('div');
    tagsBar.className = 'sm-we-tags-bar';
    const sel = document.createElement('select');
    sel.className = 'sm-we-select';
    sel.innerHTML = `<option value="">${escapeHtml(t.insertTag)}</option>` +
      TEMPLATE_AUTOFILL_TAGS.map((tag) => (
        `<option value="{{${tag.key}}}">{{${tag.key}}} — ${escapeHtml(lang === 'ru' ? tag.labelRu : tag.labelTg)}</option>`
      )).join('');
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      insertTextAtCursor(sel.value);
      sel.value = '';
    });
    tagsBar.appendChild(sel);

    for (const quick of ['school.name', 'director.full_name', 'user.full_name', 'date.today', 'stats.students_total', 'table.students']) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sm-we-tj-btn';
      chip.style.padding = '0 7px';
      chip.style.fontSize = '11.5px';
      chip.textContent = `{{${quick}}}`;
      chip.addEventListener('mousedown', (e) => e.preventDefault());
      chip.addEventListener('click', () => insertTextAtCursor(`{{${quick}}}`));
      tagsBar.appendChild(chip);
    }
    root.appendChild(tagsBar);
  }

  // Workspace + White A4 Sheet
  const workspace = document.createElement('div');
  workspace.className = 'sm-we-workspace';
  const sheetWrap = document.createElement('div');
  sheetWrap.className = 'sm-we-sheet-wrap';
  const sheet = document.createElement('div');
  sheet.className = 'sm-we-sheet';
  sheet.setAttribute('spellcheck', 'true');
  sheet.contentEditable = editMode === 'fields_only' ? 'false' : 'true';
  sheet.innerHTML = sanitizeDocHtml(options.initialHtml || '<p><br></p>');
  sheetWrap.appendChild(sheet);

  if (mode === 'cabinet' && options.watermarkText) {
    const wm = document.createElement('div');
    wm.className = 'sm-we-watermark';
    wm.setAttribute('aria-hidden', 'true');
    const txt = escapeHtml(options.watermarkText);
    wm.innerHTML = Array.from({ length: 12 }, () => `<span>${txt}</span>`).join('');
    sheetWrap.appendChild(wm);
  }

  const privacyVeil = document.createElement('div');
  privacyVeil.className = 'sm-we-privacy-veil';
  privacyVeil.innerHTML = `<strong>🔒 ${escapeHtml(t.privacyTitle)}</strong><p style="opacity:.85;margin-top:8px">${escapeHtml(t.privacySub)}</p>`;
  if (mode === 'cabinet') {
    workspace.appendChild(privacyVeil);
  }

  workspace.appendChild(sheetWrap);
  root.appendChild(workspace);

  // Status bar
  const statusBar = document.createElement('div');
  statusBar.className = 'sm-we-statusbar';
  const leftStatus = document.createElement('span');
  const rightStatus = document.createElement('div');
  rightStatus.style.display = 'flex';
  rightStatus.style.alignItems = 'center';
  rightStatus.style.gap = '6px';
  rightStatus.innerHTML = `
    <span data-save-state></span>
    <button type="button" class="sm-we-btn" data-zoom="out">−</button>
    <span data-zoom-label>100%</span>
    <button type="button" class="sm-we-btn" data-zoom="in">+</button>
  `;
  statusBar.appendChild(leftStatus);
  statusBar.appendChild(rightStatus);
  root.appendChild(statusBar);

  function applyPageGeometry() {
    const wMm = pageOrientation === 'landscape' ? 297 : 210;
    const hMm = pageOrientation === 'landscape' ? 210 : 297;
    sheet.style.width = `${wMm}mm`;
    sheet.style.minHeight = `${hMm}mm`;
    sheet.style.padding = `${pageMarginsMm.top}mm ${pageMarginsMm.right}mm ${pageMarginsMm.bottom}mm ${pageMarginsMm.left}mm`;
    sheetWrap.style.transform = `scale(${zoom})`;
    sheetWrap.style.marginBottom = zoom > 1 ? `${Math.round((zoom - 1) * 180)}px` : '0px';
    const orientSel = ribbon.querySelector('[data-select="orientation"]');
    if (orientSel) orientSel.value = pageOrientation;
    const zLbl = statusBar.querySelector('[data-zoom-label]');
    if (zLbl) zLbl.textContent = `${Math.round(zoom * 100)}%`;
  }

  function updateCounters() {
    const plain = htmlToPlainText(sheet.innerHTML);
    const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
    leftStatus.textContent = `${t.words}: ${words} · ${t.chars}: ${plain.length}`;
    const saveEl = statusBar.querySelector('[data-save-state]');
    if (saveEl && isDirty) {
      saveEl.textContent = t.unsaved;
      saveEl.style.color = '#b45309';
    }
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && sheet.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (!savedRange) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  function insertTextAtCursor(txt) {
    if (editMode === 'fields_only' && !document.activeElement?.closest?.('[data-sm-field]')) {
      const firstField = sheet.querySelector('[data-sm-field="1"]');
      if (firstField) firstField.focus();
    } else if (editMode !== 'fields_only') {
      sheet.focus();
    }
    restoreSelection();
    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, txt);
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        r.deleteContents();
        r.insertNode(document.createTextNode(txt));
        r.collapse(false);
      } else {
        sheet.appendChild(document.createTextNode(txt));
      }
    }
    isDirty = true;
    updateCounters();
    options.onChange?.();
  }

  function insertHtmlAtCursor(rawHtml) {
    if (editMode === 'fields_only') return;
    sheet.focus();
    restoreSelection();
    if (document.queryCommandSupported && document.queryCommandSupported('insertHTML')) {
      document.execCommand('insertHTML', false, sanitizeDocHtml(rawHtml));
    } else {
      sheet.insertAdjacentHTML('beforeend', sanitizeDocHtml(rawHtml));
    }
    isDirty = true;
    updateCounters();
    options.onChange?.();
  }

  function findActiveCell() {
    const sel = window.getSelection();
    const node = sel?.anchorNode || savedRange?.startContainer;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return el?.closest?.('td,th') || null;
  }

  // Prevent toolbar button click from stealing editor selection
  ribbon.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) {
      saveSelection();
      e.preventDefault();
    }
  });

  ribbon.addEventListener('click', (e) => {
    const cmdBtn = e.target.closest('[data-cmd]');
    if (cmdBtn) {
      if (editMode === 'fields_only') return;
      sheet.focus();
      restoreSelection();
      document.execCommand(cmdBtn.dataset.cmd, false, null);
      isDirty = true;
      updateCounters();
      options.onChange?.();
      return;
    }

    const actBtn = e.target.closest('[data-action]');
    if (!actBtn) return;
    const act = actBtn.dataset.action;
    const pop = ribbon.querySelector('.sm-we-popover');
    if (act === 'toggleTablePop') {
      saveSelection();
      pop.hidden = !pop.hidden;
      return;
    }
    if (act === 'createTable') {
      const rows = Math.max(1, Math.min(30, Number(pop.querySelector('[data-tbl-rows]')?.value || 3)));
      const cols = Math.max(1, Math.min(15, Number(pop.querySelector('[data-tbl-cols]')?.value || 4)));
      const head = Boolean(pop.querySelector('[data-tbl-head]')?.checked);
      let html = '<table>';
      for (let r = 0; r < rows; r += 1) {
        html += '<tr>';
        for (let c = 0; c < cols; c += 1) {
          html += r === 0 && head ? '<th><br></th>' : '<td><br></td>';
        }
        html += '</tr>';
      }
      html += '</table><p><br></p>';
      pop.hidden = true;
      insertHtmlAtCursor(html);
      return;
    }
    if (act === 'pageBreak') {
      insertHtmlAtCursor('<hr class="sm-page-break"><p><br></p>');
      return;
    }

    const cell = findActiveCell();
    if (!cell) return;
    const tr = cell.closest('tr');
    const table = cell.closest('table');
    if (!tr || !table) return;
    const colIdx = cell.cellIndex;

    if (act === 'rowAdd') {
      const newTr = tr.cloneNode(true);
      for (const c of newTr.cells) c.innerHTML = '<br>';
      tr.after(newTr);
    } else if (act === 'rowDel') {
      if (table.rows.length > 1) tr.remove();
    } else if (act === 'colAdd') {
      for (const row of table.rows) {
        const tag = row.cells[0]?.tagName === 'TH' ? 'th' : 'td';
        const nc = document.createElement(tag);
        nc.innerHTML = '<br>';
        row.insertBefore(nc, row.cells[colIdx + 1] || null);
      }
    } else if (act === 'colDel') {
      if (tr.cells.length > 1) {
        for (const row of table.rows) {
          if (row.cells[colIdx]) row.deleteCell(colIdx);
        }
      }
    }
    isDirty = true;
    updateCounters();
    options.onChange?.();
  });

  ribbon.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-select]');
    if (sel) {
      const key = sel.dataset.select;
      if (key === 'orientation') {
        pageOrientation = sel.value === 'landscape' ? 'landscape' : 'portrait';
        applyPageGeometry();
        isDirty = true;
        options.onChange?.();
        return;
      }
      if (key === 'marginsPreset') {
        if (sel.value === 'narrow') pageMarginsMm = { top: 12, right: 12, bottom: 12, left: 12 };
        else if (sel.value === 'wide') pageMarginsMm = { top: 25, right: 25, bottom: 25, left: 25 };
        else pageMarginsMm = { ...DEFAULT_PAGE_MARGINS_MM };
        applyPageGeometry();
        isDirty = true;
        options.onChange?.();
        return;
      }
      if (key === 'lineHeight') {
        sheet.style.lineHeight = sel.value;
        isDirty = true;
        return;
      }
      if (editMode === 'fields_only') return;
      sheet.focus();
      restoreSelection();
      if (key === 'fontName') {
        document.execCommand('fontName', false, sel.value);
      } else if (key === 'fontSizePt') {
        document.execCommand('fontSize', false, '4');
        const fonts = sheet.querySelectorAll('font[size="4"]');
        for (const f of fonts) {
          const sp = document.createElement('span');
          sp.style.fontSize = `${sel.value}pt`;
          sp.innerHTML = f.innerHTML;
          f.replaceWith(sp);
        }
      }
      isDirty = true;
      updateCounters();
      return;
    }

    const col = e.target.closest('[data-color]');
    if (col && editMode !== 'fields_only') {
      sheet.focus();
      restoreSelection();
      document.execCommand(col.dataset.color, false, col.value);
      isDirty = true;
    }
  });

  statusBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-zoom]');
    if (!btn) return;
    zoom = btn.dataset.zoom === 'in' ? Math.min(1.5, zoom + 0.15) : Math.max(0.65, zoom - 0.15);
    applyPageGeometry();
  });

  sheet.addEventListener('keyup', saveSelection);
  sheet.addEventListener('mouseup', saveSelection);
  sheet.addEventListener('input', () => {
    isDirty = true;
    updateCounters();
    options.onChange?.();
  });

  // Tab navigation inside fields_only mode
  sheet.addEventListener('keydown', (e) => {
    if (editMode === 'fields_only' && e.key === 'Tab') {
      const fields = [...sheet.querySelectorAll('[data-sm-field="1"]')];
      const idx = fields.indexOf(document.activeElement);
      if (fields.length) {
        e.preventDefault();
        const next = e.shiftKey
          ? fields[(idx - 1 + fields.length) % fields.length]
          : fields[(idx + 1) % fields.length];
        next?.focus();
      }
    }
  });

  // Strict cabinet anti-export protections (allow internal copy/paste only)
  if (mode === 'cabinet') {
    sheet.addEventListener('contextmenu', (e) => e.preventDefault());
    sheet.addEventListener('dragstart', (e) => e.preventDefault());
    sheet.addEventListener('copy', (e) => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const frag = sel.getRangeAt(0).cloneContents();
        const tmp = document.createElement('div');
        tmp.appendChild(frag);
        internalClipboardHtml = sanitizeDocHtml(tmp.innerHTML);
      }
      if (e.clipboardData) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', t.copyBlocked);
        e.clipboardData.setData('text/html', '');
      }
      showEditorToast(t.copyBlocked);
    });
    sheet.addEventListener('cut', (e) => {
      if (e.clipboardData) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', '');
      }
    });
    sheet.addEventListener('paste', (e) => {
      if (internalClipboardHtml && (!e.clipboardData?.getData('text/plain') || e.clipboardData.getData('text/plain') === t.copyBlocked)) {
        e.preventDefault();
        insertHtmlAtCursor(internalClipboardHtml);
      }
    });
  }

  applyPageGeometry();
  updateCounters();

  return {
    getHtml: () => sanitizeDocHtml(sheet.innerHTML),
    setHtml: (html) => {
      sheet.innerHTML = sanitizeDocHtml(html || '<p><br></p>');
      isDirty = false;
      updateCounters();
    },
    getPageSetup: () => ({ pageOrientation, pageMarginsMm: { ...pageMarginsMm } }),
    setPageSetup: (orient, margins) => {
      pageOrientation = orient === 'landscape' ? 'landscape' : 'portrait';
      pageMarginsMm = normalizePageMargins(margins);
      applyPageGeometry();
    },
    isDirty: () => isDirty,
    markSaved: (customMsg) => {
      isDirty = false;
      const saveEl = statusBar.querySelector('[data-save-state]');
      if (saveEl) {
        saveEl.textContent = customMsg || t.saved;
        saveEl.style.color = '#15803d';
      }
    },
    setPrivacyShield: (active) => {
      privacyVeil.classList.toggle('active', Boolean(active));
    },
    destroy: () => {
      root.remove();
    },
  };
}

export function openDocumentEditorModal(options = {}) {
  ensureWordEditorStyles();
  const lang = options.lang === 'ru' ? 'ru' : 'tg';
  const t = getEditorTexts(lang);

  const modal = document.createElement('div');
  modal.className = 'sm-we-modal';
  modal.id = 'smWordEditorModal';

  const topbar = document.createElement('div');
  topbar.className = 'sm-we-topbar';
  const titleText = String(options.title || 'SmartMaktab');
  const quotaText = options.quota
    ? `${t.draftsQuota}: ${options.quota.drafts_used ?? 0}/${options.quota.drafts_limit ?? 50}`
    : '';

  topbar.innerHTML = `
    <div class="sm-we-title-wrap">
      <h2 class="sm-we-doc-title">📄 ${escapeHtml(titleText)}</h2>
      ${quotaText ? `<span class="sm-we-badge" id="smWeQuotaBadge">${escapeHtml(quotaText)}</span>` : ''}
    </div>
    <div class="sm-we-actions">
      ${options.onSave ? `<button type="button" class="sm-we-topbtn primary" data-we-save>💾 ${escapeHtml(t.save)}</button>` : ''}
      ${options.hasDraft && options.onReset ? `<button type="button" class="sm-we-topbtn" data-we-reset>↺ ${escapeHtml(t.reset)}</button>` : ''}
      <button type="button" class="sm-we-topbtn print" data-we-print>🖨️ ${escapeHtml(t.print)}</button>
      <button type="button" class="sm-we-topbtn" data-we-close>✕ ${escapeHtml(t.close)}</button>
    </div>
  `;
  modal.appendChild(topbar);

  // Strict Windows/Android native-only guard
  if (options.strictNativeOnly && !isRunningInsideProtectedNativeApp()) {
    const block = document.createElement('div');
    block.className = 'sm-we-strict-block';
    block.innerHTML = `
      <div style="font-size:38px;margin-bottom:8px">🛡️</div>
      <h3 style="margin:0 0 8px">${escapeHtml(t.strictNativeTitle)}</h3>
      <p style="margin:0 0 16px;color:#475569;line-height:1.45">${escapeHtml(t.strictNativeBody)}</p>
      <button type="button" class="sm-we-topbtn" style="background:#1e3a8a;border-color:#1e3a8a" data-we-close>${escapeHtml(t.close)}</button>
    `;
    modal.appendChild(block);
    document.body.appendChild(modal);
    const closeFn = () => modal.remove();
    modal.querySelectorAll('[data-we-close]').forEach((b) => b.addEventListener('click', closeFn));
    return { close: closeFn };
  }

  const host = document.createElement('div');
  host.style.flex = '1';
  host.style.minHeight = '0';
  host.style.display = 'flex';
  modal.appendChild(host);
  document.body.appendChild(modal);

  const editor = mountWordEditor(host, {
    lang,
    mode: 'cabinet',
    editMode: options.editMode || 'full',
    initialHtml: options.initialHtml || '<p><br></p>',
    pageOrientation: options.pageOrientation || 'portrait',
    pageMarginsMm: options.pageMarginsMm || DEFAULT_PAGE_MARGINS_MM,
    watermarkText: options.watermarkText || '',
    minHeight: '100%',
  });
  host.querySelector('.sm-we-root').style.flex = '1';
  host.querySelector('.sm-we-root').style.borderRadius = '0';
  host.querySelector('.sm-we-root').style.border = '0';

  const onSaveClick = async () => {
    if (!options.onSave) return;
    const btn = topbar.querySelector('[data-we-save]');
    if (btn) { btn.disabled = true; btn.textContent = t.saving; }
    try {
      const setup = editor.getPageSetup();
      const payload = compressDocPayload({
        title: titleText,
        html: editor.getHtml(),
        pageOrientation: setup.pageOrientation,
        pageMarginsMm: setup.pageMarginsMm,
      });
      const res = await options.onSave({
        ...payload,
        html: editor.getHtml(),
        ...setup,
      });
      editor.markSaved(t.saved);
      if (res?.quota) {
        const qb = topbar.querySelector('#smWeQuotaBadge');
        if (qb) qb.textContent = `${t.draftsQuota}: ${res.quota.drafts_used ?? 0}/${res.quota.drafts_limit ?? 50}`;
      }
      showEditorToast(t.saved);
    } catch (err) {
      showEditorToast(err?.message || 'Save failed');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = `💾 ${t.save}`; }
    }
  };

  const onResetClick = async () => {
    if (!options.onReset) return;
    if (!window.confirm(t.confirmReset)) return;
    const freshHtml = await options.onReset();
    if (typeof freshHtml === 'string') {
      editor.setHtml(freshHtml);
    }
  };

  const onPrintClick = async () => {
    const setup = editor.getPageSetup();
    const html = editor.getHtml();
    try {
      await options.onPrint?.({ platform: getNativePlatformName(), title: titleText });
    } catch {
      // Audit failures never block printing
    }

    if (window.smartmaktabDesktop?.printProtected) {
      const res = await window.smartmaktabDesktop.printProtected({
        title: titleText,
        html,
        pageOrientation: setup.pageOrientation,
        pageMarginsMm: setup.pageMarginsMm,
      });
      if (!res?.ok) showEditorToast(res?.error || t.printBlocked);
      return;
    }

    if (window.SmartMaktabNative?.printProtected) {
      window.SmartMaktabNative.printProtected(JSON.stringify({
        title: titleText,
        html,
        pageOrientation: setup.pageOrientation,
        pageMarginsMm: setup.pageMarginsMm,
      }));
      return;
    }

    // Protected web print host (prints ONLY clean A4 paper without SmartMaktab UI)
    let printHost = document.getElementById('smDocPrintHost');
    if (printHost) printHost.remove();
    printHost = document.createElement('div');
    printHost.id = 'smDocPrintHost';
    printHost.style.display = 'none';
    const pageRule = document.createElement('style');
    pageRule.id = 'smDocPrintPageRule';
    pageRule.textContent = `@page { size: A4 ${setup.pageOrientation}; margin: ${setup.pageMarginsMm.top}mm ${setup.pageMarginsMm.right}mm ${setup.pageMarginsMm.bottom}mm ${setup.pageMarginsMm.left}mm; }`;
    printHost.appendChild(pageRule);
    const sheetCopy = document.createElement('div');
    sheetCopy.className = 'sm-we-sheet';
    sheetCopy.innerHTML = sanitizeDocHtml(html);
    printHost.appendChild(sheetCopy);
    document.body.appendChild(printHost);

    const cleanupPrint = () => {
      printHost.remove();
      window.removeEventListener('afterprint', cleanupPrint);
    };
    window.addEventListener('afterprint', cleanupPrint);
    window.print();
    setTimeout(cleanupPrint, 3000);
  };

  const cleanupFns = [];
  const closeFn = () => {
    if (editor.isDirty() && !window.confirm(t.confirmClose)) return;
    for (const fn of cleanupFns) fn();
    editor.destroy();
    modal.remove();
    options.onClose?.();
  };

  topbar.querySelector('[data-we-save]')?.addEventListener('click', onSaveClick);
  topbar.querySelector('[data-we-reset]')?.addEventListener('click', onResetClick);
  topbar.querySelector('[data-we-print]')?.addEventListener('click', onPrintClick);
  topbar.querySelectorAll('[data-we-close]').forEach((b) => b.addEventListener('click', closeFn));

  // Global keyboard & focus-loss screenshot defenses while modal is open
  const onKeyDown = (e) => {
    const key = String(e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 's') {
      e.preventDefault();
      onSaveClick();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'p') {
      e.preventDefault();
      onPrintClick();
      return;
    }
    if (
      key === 'printscreen' ||
      e.key === 'F12' ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 's')) ||
      ((e.ctrlKey || e.metaKey) && key === 'u')
    ) {
      e.preventDefault();
      if (key === 'printscreen') {
        editor.setPrivacyShield(true);
        navigator.clipboard?.writeText?.(t.printBlocked).catch(() => {});
        setTimeout(() => editor.setPrivacyShield(false), 1800);
      }
      showEditorToast(t.printBlocked);
    }
  };
  const onBlur = () => editor.setPrivacyShield(true);
  const onFocus = () => editor.setPrivacyShield(false);
  const onVisibility = () => editor.setPrivacyShield(document.hidden);

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  cleanupFns.push(() => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return { close: closeFn, editor };
}
