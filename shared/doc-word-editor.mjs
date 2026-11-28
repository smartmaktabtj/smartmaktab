import {
  DEFAULT_PAGE_MARGINS_MM,
  TEMPLATE_AUTOFILL_TAGS,
  compressDocPayload,
  escapeHtml,
  htmlToPlainText,
  normalizePageMargins,
  sanitizeDocHtml,
} from './doc-template-engine.mjs';
import { smConfirm } from './sm-dialog.mjs';

const TAJIK_LETTERS = ['Ғ', 'ғ', 'Ӣ', 'ӣ', 'Қ', 'қ', 'Ӯ', 'ӯ', 'Ҳ', 'ҳ', 'Ҷ', 'ҷ'];
const THEME_STORAGE_KEY = 'smartmaktab.editor.theme';

const WORD_CSS = `
.sm-we-root{--we-bg:#eef2f7;--we-surface:#ffffff;--we-surface-2:#f8fafc;--we-border:#d1d9e6;--we-text:#1e293b;--we-muted:#64748b;--we-accent:#185abd;--we-accent-soft:#e8f0fe;--we-sheet-bg:#ffffff;--we-sheet-fg:#111827;--we-tbl-border:#334155;--we-th-bg:#f1f5f9;--we-ruler-bg:#f8fafc;--we-ruler-fg:#64748b;--we-status-bg:#185abd;--we-status-fg:#ffffff;display:flex;flex-direction:column;background:var(--we-bg);border:1px solid var(--we-border);border-radius:12px;overflow:hidden;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:var(--we-text)}
.sm-we-root.night,.sm-we-modal.night,.sm-we-modal.night .sm-we-root{--we-bg:#0d131d;--we-surface:#17202e;--we-surface-2:#1d2838;--we-border:#2d3b50;--we-text:#e2e8f0;--we-muted:#94a3b8;--we-accent:#3b82f6;--we-accent-soft:#1e3a5f;--we-sheet-bg:#1c2432;--we-sheet-fg:#e5e7eb;--we-tbl-border:#475569;--we-th-bg:#253144;--we-ruler-bg:#161f2c;--we-ruler-fg:#94a3b8;--we-status-bg:#111827;--we-status-fg:#e2e8f0}
.sm-we-modal{position:fixed;inset:0;z-index:12000;background:var(--we-bg,#eef2f7);display:flex;flex-direction:column;height:100dvh;width:100vw;color:var(--we-text,#1e293b);font-family:'Segoe UI',system-ui,-apple-system,sans-serif}
.sm-we-topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 14px;background:#185abd;color:#fff;flex-wrap:wrap;box-shadow:0 1px 4px rgba(15,23,42,.18);z-index:2}
.sm-we-modal.night .sm-we-topbar{background:#0f172a;border-bottom:1px solid #263347}
.sm-we-modal.pdf-mode .sm-we-topbar{background:#991b1b}
.sm-we-modal.pdf-mode{--we-status-bg:#991b1b;--we-status-fg:#ffffff}
.sm-we-modal.pdf-mode.night{--we-status-bg:#2d1215;--we-status-fg:#f8fafc}
.sm-we-modal.pdf-mode.night .sm-we-topbar{background:#2d1215;border-bottom:1px solid #4c1d24}
.sm-we-title-wrap{display:flex;align-items:center;gap:9px;min-width:0;flex:1}
.sm-we-app-icon{width:28px;height:28px;border-radius:6px;background:#ffffff;color:#185abd;font-weight:900;font-size:15px;display:inline-grid;place-items:center;flex:none;letter-spacing:-.02em;box-shadow:0 1px 3px rgba(0,0,0,.18)}
.sm-we-modal.pdf-mode .sm-we-app-icon{color:#991b1b;font-size:10.5px;width:32px}
.sm-we-doc-title{font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;color:#fff}
.sm-we-badge{font-size:11px;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font-weight:600;white-space:nowrap}
.sm-we-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sm-we-topbtn{border:1px solid rgba(255,255,255,.26);background:rgba(255,255,255,.12);color:#fff;border-radius:7px;padding:5px 11px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;display:inline-flex;align-items:center;gap:5px;transition:background .12s}
.sm-we-topbtn:hover{background:rgba(255,255,255,.24)}
.sm-we-topbtn.primary{background:#15803d;border-color:#16a34a}
.sm-we-topbtn.primary:hover{background:#166534}
.sm-we-topbtn.print{background:#f59e0b;border-color:#d97706;color:#111827}
.sm-we-topbtn.print:hover{background:#d97706;color:#fff}
.sm-we-topbtn.theme{background:rgba(15,23,42,.24);border-color:rgba(255,255,255,.32)}
.sm-we-topbtn:disabled{opacity:.55;cursor:not-allowed}

.sm-we-tabs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 12px;background:var(--we-surface);border-bottom:1px solid var(--we-border);font-size:12.5px}
.sm-we-tabs{display:flex;align-items:center;gap:2px}
.sm-we-tab{border:0;background:transparent;color:var(--we-muted);padding:7px 14px 6px;font-size:12.5px;font-weight:600;cursor:pointer;border-bottom:2.5px solid transparent;transition:color .12s,border-color .12s}
.sm-we-tab:hover{color:var(--we-text)}
.sm-we-tab.active{color:var(--we-accent);border-bottom-color:var(--we-accent);background:var(--we-surface-2)}
.sm-we-page-pill{font-size:11.5px;color:var(--we-muted);font-weight:600;padding:3px 8px;border-radius:6px;background:var(--we-surface-2);border:1px solid var(--we-border)}

.sm-we-ribbon{display:flex;flex-wrap:wrap;align-items:stretch;gap:4px;padding:6px 12px;background:var(--we-surface);border-bottom:1px solid var(--we-border);min-height:54px}
.sm-we-group{display:inline-flex;flex-direction:column;justify-content:space-between;gap:2px;padding:0 9px 0 3px;border-right:1px solid var(--we-border)}
.sm-we-group:last-child{border-right:0}
.sm-we-group[hidden]{display:none !important}
.sm-we-group-controls{display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.sm-we-group-label{font-size:10px;color:var(--we-muted);text-align:center;line-height:1.1;user-select:none}
.sm-we-btn{border:1px solid transparent;background:transparent;color:var(--we-text);border-radius:5px;min-width:28px;height:28px;padding:0 7px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px}
.sm-we-btn:hover{background:var(--we-accent-soft);border-color:var(--we-border)}
.sm-we-btn.active{background:var(--we-accent-soft);border-color:var(--we-accent);color:var(--we-accent)}
.sm-we-select{height:28px;border:1px solid var(--we-border);border-radius:5px;background:var(--we-surface-2);color:var(--we-text);font-size:12.5px;padding:0 6px;font-family:'Segoe UI',system-ui,-apple-system,sans-serif}
.sm-we-color{width:28px;height:28px;padding:2px;border:1px solid var(--we-border);border-radius:5px;background:var(--we-surface-2);cursor:pointer}

.sm-we-tajik-bar{display:flex;align-items:center;gap:4px;padding:4px 12px;background:var(--we-surface-2);border-bottom:1px solid var(--we-border);flex-wrap:wrap}
.sm-we-tajik-label{font-size:11.5px;color:var(--we-muted);font-weight:600;margin-right:4px}
.sm-we-tj-btn{border:1px solid var(--we-border);background:var(--we-surface);color:var(--we-text);border-radius:5px;min-width:27px;height:25px;font-size:13px;font-weight:700;cursor:pointer}
.sm-we-tj-btn:hover{background:var(--we-accent-soft);border-color:var(--we-accent)}
.sm-we-tags-bar{display:flex;align-items:center;gap:6px;padding:5px 12px;background:var(--we-accent-soft);border-bottom:1px solid var(--we-border);flex-wrap:wrap}

.sm-we-workspace{flex:1;overflow:auto;padding:18px 18px 30px;display:flex;flex-direction:column;align-items:center;position:relative;background:var(--we-bg)}
.sm-we-sheet-wrap{position:relative;transform-origin:top center;transition:transform .12s ease;display:flex;flex-direction:column;align-items:center}
.sm-we-ruler{height:20px;background:var(--we-ruler-bg);border:1px solid var(--we-border);border-bottom:0;border-radius:4px 4px 0 0;display:flex;align-items:flex-end;justify-content:space-between;padding:0 6px 2px;font-size:9.5px;color:var(--we-ruler-fg);font-family:monospace;user-select:none;box-sizing:border-box;overflow:hidden}
.sm-we-ruler-tick{position:relative;opacity:.85}
.sm-we-sheet{position:relative;background:var(--we-sheet-bg);box-shadow:0 8px 28px rgba(15,23,42,.22);box-sizing:border-box;outline:none;color:var(--we-sheet-fg);font-family:'Times New Roman',Georgia,serif;font-size:14pt;line-height:1.35;overflow-wrap:break-word;user-select:text;border:1px solid var(--we-border)}
.sm-we-sheet p{margin:0 0 6pt}
.sm-we-sheet h1{font-size:18pt;margin:0 0 8pt;font-weight:700}
.sm-we-sheet h2{font-size:15pt;margin:0 0 6pt;font-weight:700}
.sm-we-sheet h3{font-size:14pt;margin:0 0 5pt;font-weight:700}
.sm-we-sheet table{width:100%;border-collapse:collapse;margin:6pt 0}
.sm-we-sheet td,.sm-we-sheet th{border:1px solid var(--we-tbl-border);padding:4pt 6pt;vertical-align:top;min-width:24px}
.sm-we-sheet th{background:var(--we-th-bg);font-weight:700}
.sm-we-sheet hr.sm-page-break{border:0;border-top:2px dashed #94a3b8;margin:14pt 0;page-break-before:always;break-before:page}
.sm-we-sheet .sm-doc-field{background:rgba(37,99,235,.12);border-bottom:1.5px dashed #3b82f6;padding:0 3px;border-radius:3px;min-width:24px;display:inline-block}
.sm-we-sheet .sm-doc-field:focus{outline:2px solid #3b82f6;background:rgba(37,99,235,.22)}
.sm-we-sheet .sm-doc-autofilled{border-bottom:1px dotted rgba(59,130,246,.4)}
.sm-we-privacy-veil{position:fixed;inset:0;z-index:30;background:rgba(15,23,42,.94);color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:'Segoe UI',system-ui,sans-serif}
.sm-we-privacy-veil.active{display:flex}
.sm-we-statusbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 14px;background:var(--we-status-bg);color:var(--we-status-fg);font-size:12px;flex-wrap:wrap}
.sm-we-statusbar .sm-we-btn{color:#ffffff;border-color:rgba(255,255,255,.26)}
.sm-we-statusbar .sm-we-btn:hover{background:rgba(255,255,255,.16)}
.sm-we-toast{position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:13000;background:#0f172a;color:#fff;padding:8px 14px;border-radius:8px;font-family:'Segoe UI',system-ui,sans-serif;font-size:12.5px;box-shadow:0 8px 20px rgba(0,0,0,.28)}
.sm-we-table-pop{position:relative;display:inline-block}
.sm-we-popover{position:absolute;top:34px;left:0;z-index:50;background:var(--we-surface);color:var(--we-text);border:1px solid var(--we-border);border-radius:10px;padding:10px;box-shadow:0 10px 26px rgba(15,23,42,.24);min-width:220px;font-size:12.5px;display:flex;flex-direction:column;gap:8px}
.sm-we-popover label{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sm-we-popover input{width:64px;padding:4px 6px;border:1px solid var(--we-border);border-radius:6px;background:var(--we-surface-2);color:var(--we-text)}
.sm-we-strict-block{margin:auto;max-width:480px;background:var(--we-surface,#fff);color:var(--we-text,#0f172a);border:1px solid var(--we-border,#cbd5e1);border-radius:14px;padding:24px;text-align:center;box-shadow:0 12px 32px rgba(15,23,42,.18)}

/* Protected read-only & printable PDF viewer */
.sm-pdf-pages{display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;max-width:980px}
.sm-pdf-page-card{background:#fff;box-shadow:0 8px 26px rgba(15,23,42,.24);border-radius:4px;overflow:hidden;position:relative;user-select:none}
.sm-pdf-page-card canvas{display:block;max-width:100%;height:auto;pointer-events:none}
.sm-we-modal.night .sm-pdf-page-card canvas{filter:brightness(.88) contrast(.96)}
.sm-pdf-page-num{position:absolute;bottom:8px;right:10px;background:rgba(15,23,42,.68);color:#fff;font-size:11px;padding:2px 8px;border-radius:999px;pointer-events:none}
.sm-pdf-loading{margin:40px auto;text-align:center;color:var(--we-muted);font-size:14px}

/* Print frame: clean white A4, zero browser header/footer */
#smDocPrintHost{display:none}
@media print{
  @page{size:A4;margin:0mm !important}
  html,body{margin:0 !important;padding:0 !important;background:#fff !important}
  body>*:not(#smDocPrintHost){display:none !important}
  #smDocPrintHost{display:block !important;position:static !important;margin:0 !important;padding:0 !important;background:#fff !important;color:#111827 !important}
  #smDocPrintHost .sm-we-privacy-veil{display:none !important}
  table.sm-we-print-frame{width:100% !important;border-collapse:collapse !important;border:0 !important;margin:0 !important}
  table.sm-we-print-frame>thead>tr>td,table.sm-we-print-frame>tfoot>tr>td,table.sm-we-print-frame>tbody>tr>td{border:0 !important;margin:0 !important;vertical-align:top !important}
  #smDocPrintHost .sm-we-sheet{box-shadow:none !important;border:0 !important;width:100% !important;min-height:auto !important;margin:0 !important;padding:0 !important;background:#fff !important;color:#111827 !important}
  #smDocPrintHost .sm-we-sheet th{background:#f1f5f9 !important;color:#111827 !important}
  #smDocPrintHost .sm-we-sheet td,#smDocPrintHost .sm-we-sheet th{border-color:#334155 !important}
  #smDocPrintHost .sm-doc-field,#smDocPrintHost .sm-doc-autofilled{border:0 !important;background:transparent !important;padding:0 !important}
  #smDocPrintHost hr.sm-page-break{border:0 !important;height:0 !important;margin:0 !important;page-break-before:always !important;break-before:page !important}
  #smDocPrintHost img.sm-pdf-print-img{display:block !important;width:100% !important;height:auto !important;page-break-after:always !important;break-after:page !important}
  #smDocPrintHost img.sm-pdf-print-img:last-child{page-break-after:auto !important;break-after:auto !important}
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

function getStoredEditorTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'night' ? 'night' : 'day';
  } catch {
    return 'day';
  }
}

function setStoredEditorTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme === 'night' ? 'night' : 'day');
  } catch {
    // ignore storage restriction
  }
}

function resolveAppRootUrl() {
  const path = String(globalThis.location?.pathname || '/');
  const m = path.match(/^(.*\/)(?:cabinets|admin)\//);
  const basePath = m ? m[1] : '/';
  return new URL(basePath, globalThis.location?.href || 'http://127.0.0.1/');
}

function getEditorTexts() {
  return {
    tabHome: 'Главная',
    tabInsert: 'Вставка',
    tabLayout: 'Макет',
    grpHistory: 'Отмена',
    grpFont: 'Шрифт',
    grpParagraph: 'Абзац',
    grpStyles: 'Стили',
    grpTables: 'Таблица',
    grpPageBreak: 'Страница',
    grpPageSetup: 'Параметры листа',
    save: 'Сохранить в систему',
    saving: 'Сохранение…',
    saved: 'Сохранено в системе ✓',
    unsaved: 'Есть несохранённые изменения',
    reset: 'Сбросить шаблон',
    print: 'Печать',
    close: 'Закрыть',
    themeDay: '☀️ День',
    themeNight: '🌙 Ночь',
    tajikChars: 'Таджикские буквы:',
    insertTag: 'Вставить авто-тег…',
    insertTable: 'Вставить таблицу',
    addTable: 'Создать таблицу',
    rows: 'Строк',
    cols: 'Столбцов',
    withHeader: 'С шапкой',
    rowAdd: '+ Строка',
    rowDel: '− Строка',
    colAdd: '+ Столбец',
    colDel: '− Столбец',
    pageBreak: 'Разрыв страницы',
    portrait: 'Книжная А4',
    landscape: 'Альбомная А4',
    marginsNormal: 'Поля: Обычные',
    marginsNarrow: 'Поля: Узкие',
    marginsWide: 'Поля: Широкие',
    styleNormal: 'Обычный текст',
    styleH1: 'Заголовок 1',
    styleH2: 'Заголовок 2',
    styleH3: 'Заголовок 3',
    words: 'Слов',
    chars: 'Знаков',
    draftsQuota: 'Черновики',
    printBlocked: 'Скачивание и виртуальные PDF-принтеры запрещены политикой SmartMaktab.',
    copyBlocked: 'Копирование за пределы SmartMaktab запрещено.',
    privacyTitle: 'Документ скрыт для защиты от снимков экрана',
    privacySub: 'Вернитесь в окно SmartMaktab, чтобы продолжить работу.',
    strictNativeTitle: 'Требуется приложение SmartMaktab',
    strictNativeBody: 'Этот документ разрешено открывать только в защищённом приложении SmartMaktab для Windows или Android.',
    confirmCloseTitle: 'Закрыть документ?',
    confirmClose: 'Есть несохранённые изменения. Закрыть редактор без сохранения в систему?',
    confirmResetTitle: 'Сброс к шаблону',
    confirmReset: 'Вернуть документ к исходному шаблону? Все правки текущего черновика будут удалены.',
    confirmYes: 'Да, продолжить',
    confirmCancel: 'Отмена',
    pdfReadOnlyBadge: 'Только просмотр и печать',
    pdfLoading: 'Загрузка защищённого PDF-документа…',
    pdfPagesLabel: 'Страниц',
    pdfError: 'Не удалось загрузить PDF-документ.',
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

function runProtectedWebPrint({ orientation = 'portrait', marginsMm = DEFAULT_PAGE_MARGINS_MM, contentEl }) {
  let printHost = document.getElementById('smDocPrintHost');
  if (printHost) printHost.remove();
  printHost = document.createElement('div');
  printHost.id = 'smDocPrintHost';

  const pageRule = document.createElement('style');
  pageRule.id = 'smDocPrintPageRule';
  pageRule.textContent = `@page { size: A4 ${orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: 0mm !important; }`;
  printHost.appendChild(pageRule);

  if (marginsMm) {
    const frame = document.createElement('table');
    frame.className = 'sm-we-print-frame';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><td style="height:${marginsMm.top}mm;padding:0"></td></tr>`;
    const tfoot = document.createElement('tfoot');
    tfoot.innerHTML = `<tr><td style="height:${marginsMm.bottom}mm;padding:0"></td></tr>`;
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.style.padding = `0 ${marginsMm.right}mm 0 ${marginsMm.left}mm`;
    td.appendChild(contentEl);
    tr.appendChild(td);
    tbody.appendChild(tr);
    frame.append(thead, tbody, tfoot);
    printHost.appendChild(frame);
  } else {
    printHost.appendChild(contentEl);
  }

  document.body.appendChild(printHost);

  const prevTitle = document.title;
  document.title = ' ';
  let cleaned = false;
  const cleanupPrint = () => {
    if (cleaned) return;
    cleaned = true;
    document.title = prevTitle;
    printHost.remove();
    window.removeEventListener('afterprint', cleanupPrint);
  };
  window.addEventListener('afterprint', cleanupPrint, { once: true });
  window.print();
  setTimeout(cleanupPrint, 3000);
}

export function mountWordEditor(container, options = {}) {
  ensureWordEditorStyles();
  const t = getEditorTexts();
  const mode = options.mode === 'admin' ? 'admin' : 'cabinet';
  const editMode = options.editMode === 'fields_only' ? 'fields_only' : 'full';
  let pageOrientation = options.pageOrientation === 'landscape' ? 'landscape' : 'portrait';
  let pageMarginsMm = normalizePageMargins(options.pageMarginsMm || DEFAULT_PAGE_MARGINS_MM);
  let zoom = 1;
  let isDirty = false;
  let internalClipboardHtml = '';
  let savedRange = null;
  let theme = options.theme === 'night' || options.theme === 'day' ? options.theme : getStoredEditorTheme();
  let activeTab = 'home';

  const root = document.createElement('div');
  root.className = `sm-we-root${theme === 'night' ? ' night' : ''}`;
  if (options.minHeight) root.style.minHeight = options.minHeight;
  container.innerHTML = '';
  container.appendChild(root);

  // Word-style ribbon tab strip
  const tabsRow = document.createElement('div');
  tabsRow.className = 'sm-we-tabs-row';
  tabsRow.innerHTML = `
    <div class="sm-we-tabs">
      <button type="button" class="sm-we-tab active" data-we-tab="home">${escapeHtml(t.tabHome)}</button>
      <button type="button" class="sm-we-tab" data-we-tab="insert">${escapeHtml(t.tabInsert)}</button>
      <button type="button" class="sm-we-tab" data-we-tab="layout">${escapeHtml(t.tabLayout)}</button>
    </div>
    <span class="sm-we-page-pill" data-page-pill></span>
  `;
  root.appendChild(tabsRow);

  // Build MS Word Ribbon
  const ribbon = document.createElement('div');
  ribbon.className = 'sm-we-ribbon';
  ribbon.innerHTML = `
    <div class="sm-we-group" data-tab-grp="home">
      <div class="sm-we-group-controls">
        <button type="button" class="sm-we-btn" data-cmd="undo" title="Отменить (Ctrl+Z)">↶</button>
        <button type="button" class="sm-we-btn" data-cmd="redo" title="Повторить (Ctrl+Y)">↷</button>
      </div>
      <span class="sm-we-group-label">${escapeHtml(t.grpHistory)}</span>
    </div>
    <div class="sm-we-group" data-tab-grp="home">
      <div class="sm-we-group-controls">
        <select class="sm-we-select" data-select="fontName" title="Шрифт">
          <option value="Times New Roman">Times New Roman</option>
          <option value="Arial">Arial</option>
          <option value="Calibri">Calibri</option>
          <option value="Georgia">Georgia</option>
        </select>
        <select class="sm-we-select" data-select="fontSizePt" title="Размер шрифта">
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
          <option value="14" selected>14</option>
          <option value="16">16</option>
          <option value="18">18</option>
          <option value="20">20</option>
          <option value="24">24</option>
        </select>
        <button type="button" class="sm-we-btn" data-cmd="bold" title="Полужирный (Ctrl+B)"><b>Ж</b></button>
        <button type="button" class="sm-we-btn" data-cmd="italic" title="Курсив (Ctrl+I)"><i>К</i></button>
        <button type="button" class="sm-we-btn" data-cmd="underline" title="Подчёркнутый (Ctrl+U)"><u>Ч</u></button>
        <button type="button" class="sm-we-btn" data-cmd="strikeThrough" title="Зачёркнутый"><s>S</s></button>
        <input type="color" class="sm-we-color" data-color="foreColor" value="#111827" title="Цвет текста">
        <input type="color" class="sm-we-color" data-color="hiliteColor" value="#fef08a" title="Выделение цветом">
        <button type="button" class="sm-we-btn" data-cmd="removeFormat" title="Очистить формат">🧹</button>
      </div>
      <span class="sm-we-group-label">${escapeHtml(t.grpFont)}</span>
    </div>
    <div class="sm-we-group" data-tab-grp="home">
      <div class="sm-we-group-controls">
        <button type="button" class="sm-we-btn" data-cmd="justifyLeft" title="По левому краю">⬅</button>
        <button type="button" class="sm-we-btn" data-cmd="justifyCenter" title="По центру">⬌</button>
        <button type="button" class="sm-we-btn" data-cmd="justifyRight" title="По правому краю">➡</button>
        <button type="button" class="sm-we-btn" data-cmd="justifyFull" title="По ширине">☰</button>
        <button type="button" class="sm-we-btn" data-cmd="insertUnorderedList" title="Маркированный список">•≡</button>
        <button type="button" class="sm-we-btn" data-cmd="insertOrderedList" title="Нумерованный список">1.</button>
        <button type="button" class="sm-we-btn" data-cmd="outdent" title="Уменьшить отступ">⇤</button>
        <button type="button" class="sm-we-btn" data-cmd="indent" title="Увеличить отступ">⇥</button>
        <select class="sm-we-select" data-select="lineHeight" title="Межстрочный интервал">
          <option value="1.15">1.15</option>
          <option value="1.35" selected>1.35</option>
          <option value="1.5">1.5</option>
          <option value="2">2.0</option>
        </select>
      </div>
      <span class="sm-we-group-label">${escapeHtml(t.grpParagraph)}</span>
    </div>
    <div class="sm-we-group" data-tab-grp="home">
      <div class="sm-we-group-controls">
        <select class="sm-we-select" data-select="blockStyle" title="Стиль абзаца">
          <option value="p">${escapeHtml(t.styleNormal)}</option>
          <option value="h1">${escapeHtml(t.styleH1)}</option>
          <option value="h2">${escapeHtml(t.styleH2)}</option>
          <option value="h3">${escapeHtml(t.styleH3)}</option>
        </select>
      </div>
      <span class="sm-we-group-label">${escapeHtml(t.grpStyles)}</span>
    </div>
    <div class="sm-we-group" data-tab-grp="insert" hidden>
      <div class="sm-we-group-controls">
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
      </div>
      <span class="sm-we-group-label">${escapeHtml(t.grpTables)}</span>
    </div>
    <div class="sm-we-group" data-tab-grp="insert" hidden>
      <div class="sm-we-group-controls">
        <button type="button" class="sm-we-btn" data-action="pageBreak">✂ ${escapeHtml(t.pageBreak)}</button>
      </div>
      <span class="sm-we-group-label">${escapeHtml(t.grpPageBreak)}</span>
    </div>
    <div class="sm-we-group" data-tab-grp="layout" hidden>
      <div class="sm-we-group-controls">
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
      <span class="sm-we-group-label">${escapeHtml(t.grpPageSetup)}</span>
    </div>
  `;
  root.appendChild(ribbon);

  function switchTab(nextTab) {
    activeTab = nextTab;
    tabsRow.querySelectorAll('.sm-we-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.weTab === nextTab);
    });
    ribbon.querySelectorAll('[data-tab-grp]').forEach((grp) => {
      grp.hidden = grp.dataset.tabGrp !== nextTab;
    });
  }
  tabsRow.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-we-tab]');
    if (!btn) return;
    switchTab(btn.dataset.weTab);
  });

  // Tajik quick letters bar (always visible for rapid typing)
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
        `<option value="{{${tag.key}}}">{{${tag.key}}} — ${escapeHtml(tag.labelRu || tag.labelTg)}</option>`
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

  // Workspace + Ruler + Clean A4 Sheet (no background watermark)
  const workspace = document.createElement('div');
  workspace.className = 'sm-we-workspace';
  const sheetWrap = document.createElement('div');
  sheetWrap.className = 'sm-we-sheet-wrap';

  const ruler = document.createElement('div');
  ruler.className = 'sm-we-ruler';
  ruler.setAttribute('aria-hidden', 'true');
  sheetWrap.appendChild(ruler);

  const sheet = document.createElement('div');
  sheet.className = 'sm-we-sheet';
  sheet.setAttribute('spellcheck', 'true');
  sheet.contentEditable = editMode === 'fields_only' ? 'false' : 'true';
  sheet.innerHTML = sanitizeDocHtml(options.initialHtml || '<p><br></p>');
  sheetWrap.appendChild(sheet);

  const privacyVeil = document.createElement('div');
  privacyVeil.className = 'sm-we-privacy-veil';
  privacyVeil.innerHTML = `<strong>🔒 ${escapeHtml(t.privacyTitle)}</strong><p style="opacity:.85;margin-top:8px">${escapeHtml(t.privacySub)}</p>`;
  if (mode === 'cabinet') {
    workspace.appendChild(privacyVeil);
  }

  workspace.appendChild(sheetWrap);
  root.appendChild(workspace);

  // MS Word blue status bar
  const statusBar = document.createElement('div');
  statusBar.className = 'sm-we-statusbar';
  const leftStatus = document.createElement('span');
  const rightStatus = document.createElement('div');
  rightStatus.style.display = 'flex';
  rightStatus.style.alignItems = 'center';
  rightStatus.style.gap = '6px';
  rightStatus.innerHTML = `
    <span data-save-state style="font-weight:600"></span>
    <button type="button" class="sm-we-btn" data-zoom="out" title="Уменьшить">−</button>
    <span data-zoom-label style="min-width:42px;text-align:center">100%</span>
    <button type="button" class="sm-we-btn" data-zoom="in" title="Увеличить">+</button>
  `;
  statusBar.appendChild(leftStatus);
  statusBar.appendChild(rightStatus);
  root.appendChild(statusBar);

  function renderRuler(wMm) {
    const cmCount = Math.floor(wMm / 10);
    const ticks = [];
    for (let cm = 1; cm < cmCount; cm += 1) {
      ticks.push(`<span class="sm-we-ruler-tick">${cm}</span>`);
    }
    ruler.style.width = `${wMm}mm`;
    ruler.innerHTML = ticks.join('');
  }

  function applyPageGeometry() {
    const wMm = pageOrientation === 'landscape' ? 297 : 210;
    const hMm = pageOrientation === 'landscape' ? 210 : 297;
    renderRuler(wMm);
    sheet.style.width = `${wMm}mm`;
    sheet.style.minHeight = `${hMm}mm`;
    sheet.style.padding = `${pageMarginsMm.top}mm ${pageMarginsMm.right}mm ${pageMarginsMm.bottom}mm ${pageMarginsMm.left}mm`;
    sheetWrap.style.transform = `scale(${zoom})`;
    sheetWrap.style.marginBottom = zoom > 1 ? `${Math.round((zoom - 1) * 180)}px` : '0px';
    const orientSel = ribbon.querySelector('[data-select="orientation"]');
    if (orientSel) orientSel.value = pageOrientation;
    const pagePill = tabsRow.querySelector('[data-page-pill]');
    if (pagePill) {
      pagePill.textContent = pageOrientation === 'landscape' ? 'A4 · Альбомная' : 'A4 · Книжная';
    }
    const zLbl = statusBar.querySelector('[data-zoom-label]');
    if (zLbl) zLbl.textContent = `${Math.round(zoom * 100)}%`;
  }

  function updateCounters() {
    const plain = htmlToPlainText(sheet.innerHTML);
    const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
    leftStatus.textContent = `Страница A4 · ${t.words}: ${words} · ${t.chars}: ${plain.length}`;
    const saveEl = statusBar.querySelector('[data-save-state]');
    if (saveEl && isDirty) {
      saveEl.textContent = `• ${t.unsaved}`;
      saveEl.style.color = '#fde68a';
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
      if (key === 'blockStyle') {
        document.execCommand('formatBlock', false, `<${sel.value}>`);
      } else if (key === 'fontName') {
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
    setTheme: (nextTheme) => {
      theme = nextTheme === 'night' ? 'night' : 'day';
      root.classList.toggle('night', theme === 'night');
      setStoredEditorTheme(theme);
    },
    getTheme: () => theme,
    isDirty: () => isDirty,
    markSaved: (customMsg) => {
      isDirty = false;
      const saveEl = statusBar.querySelector('[data-save-state]');
      if (saveEl) {
        saveEl.textContent = customMsg || t.saved;
        saveEl.style.color = '#bbf7d0';
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
  const t = getEditorTexts();
  let currentTheme = getStoredEditorTheme();

  const modal = document.createElement('div');
  modal.className = `sm-we-modal${currentTheme === 'night' ? ' night' : ''}`;
  modal.id = 'smWordEditorModal';

  const topbar = document.createElement('div');
  topbar.className = 'sm-we-topbar';
  const titleText = String(options.title || 'Документ SmartMaktab');
  const quotaText = options.quota
    ? `${t.draftsQuota}: ${options.quota.drafts_used ?? 0}/${options.quota.drafts_limit ?? 50}`
    : '';

  topbar.innerHTML = `
    <div class="sm-we-title-wrap">
      <span class="sm-we-app-icon" aria-hidden="true">W</span>
      <h2 class="sm-we-doc-title">${escapeHtml(titleText)}</h2>
      ${quotaText ? `<span class="sm-we-badge" id="smWeQuotaBadge">${escapeHtml(quotaText)}</span>` : ''}
    </div>
    <div class="sm-we-actions">
      <button type="button" class="sm-we-topbtn theme" data-we-theme aria-label="День / Ночь">${currentTheme === 'night' ? t.themeDay : t.themeNight}</button>
      ${options.onSave ? `<button type="button" class="sm-we-topbtn primary" data-we-save>💾 ${escapeHtml(t.save)}</button>` : ''}
      ${options.hasDraft && options.onReset ? `<button type="button" class="sm-we-topbtn" data-we-reset>↺ ${escapeHtml(t.reset)}</button>` : ''}
      <button type="button" class="sm-we-topbtn print" data-we-print>🖨️ ${escapeHtml(t.print)}</button>
      <button type="button" class="sm-we-topbtn" data-we-close>✕ ${escapeHtml(t.close)}</button>
    </div>
  `;
  modal.appendChild(topbar);

  if (options.strictNativeOnly && !isRunningInsideProtectedNativeApp()) {
    const block = document.createElement('div');
    block.className = 'sm-we-strict-block';
    block.innerHTML = `
      <div style="font-size:38px;margin-bottom:8px">🛡️</div>
      <h3 style="margin:0 0 8px">${escapeHtml(t.strictNativeTitle)}</h3>
      <p style="margin:0 0 16px;opacity:.82;line-height:1.45">${escapeHtml(t.strictNativeBody)}</p>
      <button type="button" class="sm-we-topbtn" style="background:#185abd;border-color:#185abd" data-we-close>${escapeHtml(t.close)}</button>
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
    mode: 'cabinet',
    theme: currentTheme,
    editMode: options.editMode || 'full',
    initialHtml: options.initialHtml || '<p><br></p>',
    pageOrientation: options.pageOrientation || 'portrait',
    pageMarginsMm: options.pageMarginsMm || DEFAULT_PAGE_MARGINS_MM,
    minHeight: '100%',
  });
  host.querySelector('.sm-we-root').style.flex = '1';
  host.querySelector('.sm-we-root').style.borderRadius = '0';
  host.querySelector('.sm-we-root').style.border = '0';

  const themeBtn = topbar.querySelector('[data-we-theme]');
  themeBtn?.addEventListener('click', () => {
    currentTheme = currentTheme === 'night' ? 'day' : 'night';
    modal.classList.toggle('night', currentTheme === 'night');
    editor.setTheme(currentTheme);
    themeBtn.textContent = currentTheme === 'night' ? t.themeDay : t.themeNight;
  });

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
      showEditorToast(err?.message || 'Ошибка сохранения');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = `💾 ${t.save}`; }
    }
  };

  const onResetClick = async () => {
    if (!options.onReset) return;
    const ok = await smConfirm({
      title: t.confirmResetTitle,
      message: t.confirmReset,
      confirmLabel: t.confirmYes,
      cancelLabel: t.confirmCancel,
      danger: true,
      night: currentTheme === 'night',
    });
    if (!ok) return;
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
      if (!res?.ok && !res?.cancelled) showEditorToast(res?.error || t.printBlocked);
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

    const sheetCopy = document.createElement('div');
    sheetCopy.className = 'sm-we-sheet';
    sheetCopy.innerHTML = sanitizeDocHtml(html);
    runProtectedWebPrint({
      orientation: setup.pageOrientation,
      marginsMm: setup.pageMarginsMm,
      contentEl: sheetCopy,
    });
  };

  const cleanupFns = [];
  let closing = false;
  const closeFn = async () => {
    if (closing) return;
    if (editor.isDirty()) {
      closing = true;
      const ok = await smConfirm({
        title: t.confirmCloseTitle,
        message: t.confirmClose,
        confirmLabel: t.confirmYes,
        cancelLabel: t.confirmCancel,
        danger: true,
        night: currentTheme === 'night',
      });
      closing = false;
      if (!ok) return;
    }
    for (const fn of cleanupFns) fn();
    editor.destroy();
    modal.remove();
    options.onClose?.();
  };

  topbar.querySelector('[data-we-save]')?.addEventListener('click', onSaveClick);
  topbar.querySelector('[data-we-reset]')?.addEventListener('click', onResetClick);
  topbar.querySelector('[data-we-print]')?.addEventListener('click', onPrintClick);
  topbar.querySelectorAll('[data-we-close]').forEach((b) => b.addEventListener('click', closeFn));

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

export async function openPdfDocumentModal(options = {}) {
  ensureWordEditorStyles();
  const t = getEditorTexts();
  let currentTheme = getStoredEditorTheme();
  let zoom = 1;
  let pdfDoc = null;
  let destroyed = false;

  const modal = document.createElement('div');
  modal.className = `sm-we-modal pdf-mode${currentTheme === 'night' ? ' night' : ''}`;
  modal.id = 'smPdfViewerModal';

  const topbar = document.createElement('div');
  topbar.className = 'sm-we-topbar';
  const titleText = String(options.title || 'PDF-документ');
  topbar.innerHTML = `
    <div class="sm-we-title-wrap">
      <span class="sm-we-app-icon" aria-hidden="true">PDF</span>
      <h2 class="sm-we-doc-title">${escapeHtml(titleText)}</h2>
      <span class="sm-we-badge">🔒 ${escapeHtml(t.pdfReadOnlyBadge)}</span>
    </div>
    <div class="sm-we-actions">
      <button type="button" class="sm-we-topbtn theme" data-we-theme>${currentTheme === 'night' ? t.themeDay : t.themeNight}</button>
      <button type="button" class="sm-we-topbtn print" data-we-print disabled>🖨️ ${escapeHtml(t.print)}</button>
      <button type="button" class="sm-we-topbtn" data-we-close>✕ ${escapeHtml(t.close)}</button>
    </div>
  `;
  modal.appendChild(topbar);

  if (options.strictNativeOnly && !isRunningInsideProtectedNativeApp()) {
    const block = document.createElement('div');
    block.className = 'sm-we-strict-block';
    block.innerHTML = `
      <div style="font-size:38px;margin-bottom:8px">🛡️</div>
      <h3 style="margin:0 0 8px">${escapeHtml(t.strictNativeTitle)}</h3>
      <p style="margin:0 0 16px;opacity:.82;line-height:1.45">${escapeHtml(t.strictNativeBody)}</p>
      <button type="button" class="sm-we-topbtn" style="background:#991b1b;border-color:#991b1b" data-we-close>${escapeHtml(t.close)}</button>
    `;
    modal.appendChild(block);
    document.body.appendChild(modal);
    const closeFn = () => modal.remove();
    modal.querySelectorAll('[data-we-close]').forEach((b) => b.addEventListener('click', closeFn));
    return { close: closeFn };
  }

  const workspace = document.createElement('div');
  workspace.className = 'sm-we-workspace';
  const pagesEl = document.createElement('div');
  pagesEl.className = 'sm-pdf-pages';
  pagesEl.innerHTML = `<div class="sm-pdf-loading">${escapeHtml(t.pdfLoading)}</div>`;

  const privacyVeil = document.createElement('div');
  privacyVeil.className = 'sm-we-privacy-veil';
  privacyVeil.innerHTML = `<strong>🔒 ${escapeHtml(t.privacyTitle)}</strong><p style="opacity:.85;margin-top:8px">${escapeHtml(t.privacySub)}</p>`;

  workspace.append(privacyVeil, pagesEl);
  modal.appendChild(workspace);

  const statusBar = document.createElement('div');
  statusBar.className = 'sm-we-statusbar';
  const leftStatus = document.createElement('span');
  leftStatus.textContent = t.pdfReadOnlyBadge;
  const rightStatus = document.createElement('div');
  rightStatus.style.display = 'flex';
  rightStatus.style.alignItems = 'center';
  rightStatus.style.gap = '6px';
  rightStatus.innerHTML = `
    <button type="button" class="sm-we-btn" data-zoom="out">−</button>
    <span data-zoom-label style="min-width:42px;text-align:center">100%</span>
    <button type="button" class="sm-we-btn" data-zoom="in">+</button>
  `;
  statusBar.append(leftStatus, rightStatus);
  modal.appendChild(statusBar);

  document.body.appendChild(modal);

  // Anti-export / anti-contextmenu / anti-drag guards
  workspace.addEventListener('contextmenu', (e) => e.preventDefault());
  workspace.addEventListener('dragstart', (e) => e.preventDefault());

  const themeBtn = topbar.querySelector('[data-we-theme]');
  themeBtn?.addEventListener('click', () => {
    currentTheme = currentTheme === 'night' ? 'day' : 'night';
    modal.classList.toggle('night', currentTheme === 'night');
    setStoredEditorTheme(currentTheme);
    themeBtn.textContent = currentTheme === 'night' ? t.themeDay : t.themeNight;
  });

  async function renderAllPages() {
    if (!pdfDoc || destroyed) return;
    const zLbl = statusBar.querySelector('[data-zoom-label]');
    if (zLbl) zLbl.textContent = `${Math.round(zoom * 100)}%`;
    pagesEl.innerHTML = '';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxWidth = Math.max(320, Math.min(820, workspace.clientWidth - 48)) * zoom;

    for (let p = 1; p <= pdfDoc.numPages; p += 1) {
      if (destroyed) return;
      const page = await pdfDoc.getPage(p);
      const baseVp = page.getViewport({ scale: 1 });
      const fitScale = maxWidth / baseVp.width;
      const cssVp = page.getViewport({ scale: fitScale });
      const renderVp = page.getViewport({ scale: fitScale * dpr });

      const card = document.createElement('div');
      card.className = 'sm-pdf-page-card';
      card.style.width = `${Math.round(cssVp.width)}px`;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(renderVp.width);
      canvas.height = Math.round(renderVp.height);
      canvas.style.width = `${Math.round(cssVp.width)}px`;
      canvas.style.height = `${Math.round(cssVp.height)}px`;

      const badge = document.createElement('span');
      badge.className = 'sm-pdf-page-num';
      badge.textContent = `${p} / ${pdfDoc.numPages}`;

      card.append(canvas, badge);
      pagesEl.appendChild(card);

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: renderVp }).promise;
    }
    leftStatus.textContent = `${t.pdfPagesLabel}: ${pdfDoc.numPages} · ${t.pdfReadOnlyBadge}`;
  }

  statusBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-zoom]');
    if (!btn || !pdfDoc) return;
    zoom = btn.dataset.zoom === 'in' ? Math.min(1.6, zoom + 0.15) : Math.max(0.6, zoom - 0.15);
    renderAllPages();
  });

  const onPrintClick = async () => {
    if (!pdfDoc) return;
    const printBtn = topbar.querySelector('[data-we-print]');
    if (printBtn) printBtn.disabled = true;
    try {
      await options.onPrint?.({ platform: getNativePlatformName(), title: titleText });
    } catch {
      // Audit failure must not block print
    }

    try {
      const container = document.createElement('div');
      const imgTags = [];
      let firstLandscape = false;
      for (let p = 1; p <= pdfDoc.numPages; p += 1) {
        const page = await pdfDoc.getPage(p);
        const vp = page.getViewport({ scale: 2.0 });
        if (p === 1 && vp.width > vp.height) firstLandscape = true;
        const off = document.createElement('canvas');
        off.width = Math.round(vp.width);
        off.height = Math.round(vp.height);
        await page.render({ canvasContext: off.getContext('2d'), viewport: vp }).promise;
        const dataUrl = off.toDataURL('image/jpeg', 0.92);
        const img = document.createElement('img');
        img.className = 'sm-pdf-print-img sm-pdf-page-img';
        img.src = dataUrl;
        img.alt = '';
        container.appendChild(img);
        imgTags.push(`<img class="sm-pdf-page-img" src="${dataUrl}" alt="">`);
      }

      const orient = firstLandscape ? 'landscape' : 'portrait';
      if (window.smartmaktabDesktop?.printProtected) {
        const res = await window.smartmaktabDesktop.printProtected({
          title: titleText,
          html: imgTags.join(''),
          pageOrientation: orient,
          pageMarginsMm: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        if (!res?.ok && !res?.cancelled) showEditorToast(res?.error || t.printBlocked);
        return;
      }

      if (window.SmartMaktabNative?.printProtected) {
        window.SmartMaktabNative.printProtected(JSON.stringify({
          title: titleText,
          html: imgTags.join(''),
          pageOrientation: orient,
          pageMarginsMm: { top: 0, right: 0, bottom: 0, left: 0 },
        }));
        return;
      }

      runProtectedWebPrint({
        orientation: orient,
        marginsMm: null,
        contentEl: container,
      });
    } finally {
      if (printBtn && !destroyed) printBtn.disabled = false;
    }
  };

  const cleanupFns = [];
  const closeFn = () => {
    if (destroyed) return;
    destroyed = true;
    for (const fn of cleanupFns) fn();
    try { pdfDoc?.destroy?.(); } catch {}
    modal.remove();
    options.onClose?.();
  };

  topbar.querySelector('[data-we-print]')?.addEventListener('click', onPrintClick);
  topbar.querySelectorAll('[data-we-close]').forEach((b) => b.addEventListener('click', closeFn));

  const onKeyDown = (e) => {
    const key = String(e.key || '').toLowerCase();
    if (key === 'escape') {
      e.preventDefault();
      closeFn();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'p') {
      e.preventDefault();
      onPrintClick();
      return;
    }
    if (
      ((e.ctrlKey || e.metaKey) && (key === 's' || key === 'u' || key === 'c')) ||
      key === 'printscreen' ||
      e.key === 'F12' ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 's'))
    ) {
      e.preventDefault();
      if (key === 'printscreen') {
        privacyVeil.classList.add('active');
        navigator.clipboard?.writeText?.(t.printBlocked).catch(() => {});
        setTimeout(() => privacyVeil.classList.remove('active'), 1800);
      }
      showEditorToast(t.printBlocked);
    }
  };
  const onBlur = () => privacyVeil.classList.add('active');
  const onFocus = () => privacyVeil.classList.remove('active');
  const onVisibility = () => privacyVeil.classList.toggle('active', document.hidden);

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

  try {
    const rawBytes = options.pdfBytes instanceof Uint8Array
      ? options.pdfBytes
      : await options.loadPdfBytes?.();
    if (destroyed) return { close: closeFn };
    if (!rawBytes || !rawBytes.byteLength) throw new Error(t.pdfError);

    const rootUrl = resolveAppRootUrl();
    const engine = await import(new URL('vendor/pdf/pdf.min.mjs', rootUrl).href);
    engine.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf/pdf.worker.min.mjs', rootUrl).href;
    const task = engine.getDocument({
      data: rawBytes,
      isEvalSupported: false,
      enableXfa: false,
      useWasm: false,
      maxImageSize: 16000000,
      standardFontDataUrl: new URL('vendor/pdf/standard_fonts/', rootUrl).href,
    });
    pdfDoc = await task.promise;
    if (destroyed) return { close: closeFn };
    const printBtn = topbar.querySelector('[data-we-print]');
    if (printBtn) printBtn.disabled = false;
    await renderAllPages();
  } catch (err) {
    if (!destroyed) {
      pagesEl.innerHTML = `<div class="sm-pdf-loading" style="color:#dc2626">${escapeHtml(err?.message || t.pdfError)}</div>`;
    }
  }

  return { close: closeFn };
}
