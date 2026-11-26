import { canNativeSave, nativeSave } from './native-shell.mjs';
import { cachedPdf, rememberPdf, readerStore } from './reader-memory.mjs';
import { extractReaderText } from './reader-text.mjs';
import { hasPortablePdf, portablePdf, PortableFonts } from './portable-pdf.mjs';
import { appRoot, offlineViewer, publishReaderMode } from './cabinet-runtime.mjs';
import { fetchBookFile, readableSize, bookFilename } from './book-transfer.mjs';
import { saveBookOffline, getCachedBook, deleteCachedBook } from './book-cache.mjs';
import { makeReaderAliya } from './reader-aliya.mjs';
import { attachReaderGestures } from './reader-curl.mjs';

export const READER_PAPER_COLORS = [
  { id: 'default', tg: 'Муқаррарӣ', ru: 'Обычный', swatch: '#ffffff', tint: '', stage: '', night: false },
  { id: 'ivory', tg: 'Устухонӣ', ru: 'Слоновая кость', swatch: '#faf6eb', tint: 'rgba(250, 240, 210, 0.35)', stage: '#f4efe2', night: false },
  { id: 'sepia', tg: 'Сепия', ru: 'Сепия', swatch: '#f3e4c8', tint: 'rgba(225, 186, 128, 0.38)', stage: '#eadbc0', night: false },
  { id: 'parchment', tg: 'Коғази қадим', ru: 'Пергамент', swatch: '#ead7b4', tint: 'rgba(205, 168, 108, 0.42)', stage: '#dfcbab', night: false },
  { id: 'sand', tg: 'Регзор', ru: 'Песочный', swatch: '#f5ead6', tint: 'rgba(232, 200, 148, 0.32)', stage: '#ede0c9', night: false },
  { id: 'mint', tg: 'Наънои нарм', ru: 'Мятный', swatch: '#e6f3ea', tint: 'rgba(170, 220, 185, 0.28)', stage: '#dcece2', night: false },
  { id: 'sky', tg: 'Осмонӣ', ru: 'Небесный', swatch: '#e8f1fb', tint: 'rgba(172, 204, 242, 0.28)', stage: '#dde7f4', night: false },
  { id: 'lavender', tg: 'Бунафши нарм', ru: 'Лаванда', swatch: '#efeafd', tint: 'rgba(202, 186, 242, 0.26)', stage: '#e4def4', night: false },
  { id: 'rose', tg: 'Гулобии нарм', ru: 'Розовый', swatch: '#fae9ee', tint: 'rgba(238, 185, 202, 0.26)', stage: '#f2dfe6', night: false },
  { id: 'slate', tg: 'Хокистарӣ', ru: 'Грифельный', swatch: '#2b323c', tint: 'rgba(43, 50, 60, 0.16)', stage: '#20262e', night: true },
  { id: 'forest', tg: 'Сабзи шаб', ru: 'Ночной лес', swatch: '#1c2b24', tint: 'rgba(28, 43, 36, 0.18)', stage: '#15201b', night: true },
  { id: 'charcoal', tg: 'Ангиштӣ', ru: 'Антрацит', swatch: '#14171c', tint: 'rgba(20, 23, 28, 0.22)', stage: '#0d1015', night: true },
];

const words = {
  fit: ['Андозаи муқаррарӣ', 'Исходный масштаб'],
  findPrevious: ['Натиҷаи пешина', 'Предыдущее совпадение'],
  findNext: ['Натиҷаи баъдӣ', 'Следующее совпадение'],
  searchStop: ['Қатъи ҷустуҷӯ', 'Остановить поиск'],
  searchStopped: ['Ҷустуҷӯ қатъ шуд.', 'Поиск остановлен.'],
  read: ['Хондан', 'Читать'],
  loading: ['Китоб бор мешавад…', 'Загрузка книги…'],
  failure: ['Китоб кушода нашуд. Пайвастро санҷед ва дубора кӯшиш кунед.', 'Не удалось открыть книгу. Попробуйте исходную ссылку.'],
  prev: ['Саҳифаи пешина', 'Предыдущая страница'],
  next: ['Саҳифаи баъдӣ', 'Следующая страница'],
  larger: ['Калон кардан', 'Увеличить'],
  smaller: ['Хурд кардан', 'Уменьшить'],
  close: ['Пӯшидани китоб', 'Закрыть книгу'],
  download: ['Зеркашӣ', 'Скачать'],
  saveOffline: ['Барои офлайн', 'Сохранить офлайн'],
  removeOffline: ['Аз офлайн тоза', 'Удалить из кэша'],
  offlineSaved: ['Барои хониши офлайн сабт шуд.', 'Сохранено для офлайн-чтения.'],
  cancel: ['Қатъ кардан', 'Отменить'],
  done: ['Зеркашӣ анҷом ёфт', 'Загрузка завершена'],
  downloadError: ['Зеркашӣ нашуд. Пайвастро санҷед ва дубора кӯшиш кунед.', 'Не удалось скачать. Попробуйте исходную ссылку.'],
  tooLarge: ['Файл аз ҳадди боргирии дохилӣ калонтар аст. Пайванди аслиро истифода баред.', 'Файл превышает лимит встроенной загрузки. Используйте исходную ссылку.'],
  downloading: ['Зеркашӣ мешавад', 'Скачивание'],
  page: ['Саҳифа', 'Страница'],
  size: ['Ҳаҷми файл', 'Размер файла'],
  light: ['Рӯз', 'День'],
  dark: ['Шаб', 'Ночь'],
  brightness: ['Дурахшонӣ', 'Яркость'],
  paperColor: ['Ранги саҳифа', 'Цвет бумаги'],
  settings: ['Танзимот', 'Настройки'],
  search: ['Ҷустуҷӯ', 'Поиск'],
  searchLimit: ['Аз саҳифаи ҷорӣ то ҳамаи саҳифаҳо санҷида мешавад.', 'Проверяется по всей книге, начиная с текущей страницы.'],
  searching: ['Ҷустуҷӯ идома дорад…', 'Идёт поиск…'],
  notFound: ['Натиҷа ёфт нашуд. Агар китоб скан бошад, матни он ҷустуҷӯшаванда нест.', 'Ничего не найдено. Если это скан, в нём может не быть текстового слоя.'],
  screen: ['Экрани пурра', 'Полный экран'],
  notes: ['Ёддоштҳо', 'Заметки'],
  saveFile: ['Сабти файл', 'Сохранить файл'],
  last: ['Ҷойи хониш сабт мешавад', 'Позиция чтения сохраняется на этом устройстве'],
};

const label = key => words[key][document.documentElement.lang === 'ru' ? 1 : 0];
const el = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};

export function makePdfReader(host) {
  const portable = hasPortablePdf();
  if (offlineViewer && !portable) return null;

  const view = el('dialog', 'pdf-reader no-print');
  const shell = el('div', 'reader-layout');
  const top = el('header', 'reader-top');
  const head = el('div', 'reader-head');
  const title = el('h4');
  const meta = el('small');
  const mark = el('span', 'reader-brand');
  const tools = el('div', 'reader-tools');
  const body = el('div', 'reader-body');
  const stage = el('main', 'pdf-stage');
  const stageWrap = el('div', 'pdf-stage-wrap');
  const canvas = el('canvas');
  const paperTintLayer = el('div', 'reader-paper-tint');
  const bottom = el('footer', 'reader-bottom');
  const marking = el('div', 'reader-location');
  const indicator = el('output');
  const quick = el('input');
  const status = el('p', 'reader-status');
  const settings = el('section', 'reader-settings');
  const search = el('section', 'reader-search');
  const searchForm = el('form');
  const query = el('input');
  const searchInfo = el('p');
  const hits = el('ol');
  const searchNav = el('div', 'reader-tools');
  const transfer = el('div', 'reader-transfer');
  const downloadStatus = el('p');
  const bar = el('progress');
  const transferButtons = el('div', 'reader-tools');

  title.id = 'teacherReaderTitle';
  title.tabIndex = -1;
  view.setAttribute('aria-labelledby', title.id);
  status.setAttribute('role', 'status');
  downloadStatus.setAttribute('role', 'status');
  mark.textContent = 'SMARTMAKTAB  /  KITOBKHONA';
  head.append(mark, title, meta);
  top.append(head, tools);
  stageWrap.append(canvas, paperTintLayer);
  stage.append(stageWrap);
  body.append(stage);
  shell.append(top, transfer, status, body, bottom);
  view.append(shell);
  document.body.append(view);

  transfer.append(downloadStatus, bar, transferButtons);
  marking.append(indicator, quick);
  quick.type = 'number';
  quick.min = '1';
  quick.inputMode = 'numeric';
  bottom.append(marking);
  settings.hidden = search.hidden = true;
  searchForm.append(query);
  query.type = 'search';
  query.maxLength = 100;
  search.append(searchForm, searchNav, searchInfo, hits);
  body.append(search, settings);

  let generation = 0;
  let drawGeneration = 0;
  let seekGeneration = 0;
  let load = null;
  let rendering = null;
  let doc = null;
  let book = null;
  let page = 1;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let message = '';
  let modulePromise;
  let reading = false;
  let night = false;
  let brightness = 100;
  let paperId = 'default';
  let transferContext = null;
  let downloadFile = null;
  let objectURL = '';
  let launch = null;
  let hitIndex = -1;
  let offlineStored = false;
  let curlBusy = false;
  let barsHidden = false;
  let idleTimer = null;
  const pageTexts = new Map();
  const previewCache = new Map();
  const transferStates = () => transferContext?.state ?? '';
  const buttons = new Map();

  const reducedMotion = () => {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  };

  function button(k, parent, callback, symbol = '') {
    const b = el('button', 'reader-button');
    b.type = 'button';
    b.addEventListener('click', callback);
    b.dataset.readerAction = k;
    buttons.set(k, { b, symbol });
    parent.append(b);
    return b;
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (!view.open || !doc || !search.hidden || !settings.hidden || !aliya.node.hidden) return;
    idleTimer = setTimeout(() => {
      if (view.open && doc && search.hidden && settings.hidden && aliya.node.hidden) {
        barsHidden = true;
        view.classList.add('reader-bars-hidden');
      }
    }, 15000);
  }
  function wakeBars() {
    barsHidden = false;
    view.classList.remove('reader-bars-hidden');
    resetIdleTimer();
  }
  function toggleBars() {
    if (!doc || !search.hidden || !settings.hidden || !aliya.node.hidden) return;
    barsHidden = !barsHidden;
    view.classList.toggle('reader-bars-hidden', barsHidden);
    if (!barsHidden) resetIdleTimer();
    else clearTimeout(idleTimer);
  }

  const go = async (n, { animate = true } = {}) => {
    if (!doc || !Number.isInteger(n)) return;
    const target = Math.max(1, Math.min(doc.numPages, n));
    if (target === page) return;
    const dir = target > page ? 1 : -1;
    const prevCanvas = animate && !reducedMotion() && zoom <= 1.01 && canvas.width > 0 ? cloneCanvas(canvas) : null;
    page = target;
    panX = 0;
    panY = 0;
    await draw();
    if (prevCanvas && canvas.width > 0) flipTo(prevCanvas, dir);
    wakeBars();
  };

  function cloneCanvas(src) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.style.width = src.style.width;
    c.style.height = src.style.height;
    c.getContext('2d')?.drawImage(src, 0, 0);
    return c;
  }

  function flipTo(oldCv, dir) {
    for (const old of stageWrap.querySelectorAll('.flip-flap, .flip-shade')) old.remove();
    const w = parseFloat(canvas.style.width) || canvas.clientWidth;
    const h = parseFloat(canvas.style.height) || canvas.clientHeight;
    if (!w || !h) return;

    const shade = el('div', 'flip-shade');
    shade.style.width = `${w}px`;
    shade.style.height = `${h}px`;

    const flap = el('div', 'flip-flap');
    flap.style.width = `${w}px`;
    flap.style.height = `${h}px`;
    flap.style.transformOrigin = dir > 0 ? '0% 50%' : '100% 50%';
    oldCv.style.width = '100%';
    oldCv.style.height = '100%';
    flap.append(oldCv);
    stageWrap.append(shade, flap);

    requestAnimationFrame(() => {
      flap.style.transition = 'transform .34s cubic-bezier(.24,.8,.32,1), opacity .34s ease';
      shade.style.transition = 'opacity .34s ease';
      flap.style.transform = `perspective(1400px) rotateY(${dir > 0 ? -82 : 82}deg)`;
      flap.style.opacity = '0.08';
      shade.style.opacity = '0';
    });
    setTimeout(() => {
      flap.remove();
      shade.remove();
    }, 360);
  }

  const back = button('close', tools, () => close(true), '←');
  button('search', tools, () => showPanel('search'), '⌕');
  button('notes', tools, () => showPanel('notes'), '▤');
  button('screen', tools, toggleScreen, '⛶');

  const aliyaButton = el('button', 'reader-button reader-aliya');
  aliyaButton.type = 'button';
  aliyaButton.textContent = '✦ Алия';
  aliyaButton.addEventListener('click', () => showPanel('aliya'));
  tools.append(aliyaButton);

  button('prev', bottom, () => void go(page - 1), '‹');
  button('next', bottom, () => void go(page + 1), '›');
  button('smaller', bottom, () => changeZoom(-0.2), '−');
  button('fit', bottom, () => {
    zoom = 1;
    panX = 0;
    panY = 0;
    void draw();
  });
  button('larger', bottom, () => changeZoom(0.2), '+');

  // Brightness quick dial & paper swatch dot on bottom bar
  const brightnessDial = el('button', 'reader-button reader-dial');
  brightnessDial.type = 'button';
  brightnessDial.title = '☀️ / Яркость';
  brightnessDial.addEventListener('wheel', e => {
    e.preventDefault();
    setBrightness(brightness + (e.deltaY < 0 ? 5 : -5));
  }, { passive: false });
  brightnessDial.addEventListener('click', () => {
    const steps = [100, 85, 70, 55, 115];
    const idx = steps.indexOf(Math.round(brightness / 5) * 5);
    setBrightness(steps[(idx + 1) % steps.length]);
  });

  const paperDot = el('button', 'reader-button paper-color-dot');
  paperDot.type = 'button';
  paperDot.addEventListener('click', () => {
    const idx = READER_PAPER_COLORS.findIndex(p => p.id === paperId);
    const next = READER_PAPER_COLORS[(idx + 1) % READER_PAPER_COLORS.length];
    selectPaper(next.id);
  });

  button('settings', bottom, () => showPanel('settings'), '◐');
  bottom.append(brightnessDial, paperDot);
  button('download', bottom, startDownload, '⇩');
  button('saveOffline', bottom, toggleOfflineSave, '★');
  button('read', bottom, loadReader, '▤');
  button('cancel', transferButtons, cancelDownload);
  button('saveFile', transferButtons, saveDownload);

  // Settings Panel: theme + brightness (45-120%) + 12 paper color swatches
  const inputLight = el('input');
  const lightLabel = el('label');
  const lightCaption = el('span');
  inputLight.type = 'range';
  inputLight.min = '45';
  inputLight.max = '120';
  inputLight.value = '100';
  inputLight.addEventListener('input', () => setBrightness(Number(inputLight.value)));
  lightLabel.append(lightCaption, inputLight);

  const toggleTheme = el('button', 'reader-button');
  const settingsTitle = el('h3');
  toggleTheme.type = 'button';
  toggleTheme.addEventListener('click', () => {
    night = !night;
    refresh();
  });

  const paperTitle = el('span', 'reader-paper-title');
  const paperGrid = el('div', 'reader-paper-grid');
  const paperButtons = new Map();
  for (const p of READER_PAPER_COLORS) {
    const sw = el('button', 'reader-paper-swatch');
    sw.type = 'button';
    sw.dataset.paperId = p.id;
    sw.style.background = p.swatch;
    sw.addEventListener('click', () => selectPaper(p.id));
    paperGrid.append(sw);
    paperButtons.set(p.id, sw);
  }
  settings.append(settingsTitle, toggleTheme, lightLabel, paperTitle, paperGrid);

  function setBrightness(val) {
    brightness = Math.max(45, Math.min(120, Math.round(val)));
    inputLight.value = String(brightness);
    try { readerStore.set('prefs', 'brightness', String(brightness)); } catch {}
    refresh();
  }

  function selectPaper(id) {
    const found = READER_PAPER_COLORS.find(p => p.id === id) || READER_PAPER_COLORS[0];
    paperId = found.id;
    night = found.night;
    try { readerStore.set('prefs', 'paper_color', paperId); } catch {}
    refresh();
  }

  button('findPrevious', searchNav, () => moveHit(-1), '↑');
  button('findNext', searchNav, () => moveHit(1), '↓');
  button('searchStop', searchNav, stopSearch);
  const searchButton = el('button', 'reader-button');
  searchButton.type = 'submit';
  searchForm.append(searchButton);
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    runSearch();
  });

  const aliya = makeReaderAliya(
    view,
    () => ({ book, doc, page, textFor, pageImage }),
    () => {
      aliya.dismiss();
      aliyaButton.focus();
      resetIdleTimer();
    }
  );

  function showPanel(name) {
    wakeBars();
    if (name === 'search') {
      aliya.dismiss();
      settings.hidden = true;
      search.hidden = !search.hidden;
      if (!search.hidden) query.focus();
      return;
    }
    if (name === 'settings') {
      aliya.dismiss();
      search.hidden = true;
      settings.hidden = !settings.hidden;
      if (!settings.hidden) toggleTheme.focus();
      return;
    }
    search.hidden = settings.hidden = true;
    if (!aliya.node.hidden && name === 'aliya') {
      aliya.dismiss();
      return;
    }
    aliya.open();
    if (name === 'notes') aliya.showNotes();
  }

  function toggleScreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (view.requestFullscreen) view.requestFullscreen().catch(() => {});
  }

  function changeZoom(by) {
    if (!doc) return;
    zoom = Math.max(0.5, Math.min(4, Number((zoom + by).toFixed(2))));
    if (zoom <= 1.01) { panX = 0; panY = 0; }
    void draw();
    wakeBars();
  }

  function applyPanTransform() {
    if (zoom <= 1.01) {
      stageWrap.style.transform = '';
      stage.classList.remove('zoomed');
      return;
    }
    stage.classList.add('zoomed');
    stageWrap.style.transform = panX || panY ? `translate(${panX}px, ${panY}px)` : '';
  }

  function refresh() {
    title.textContent = book?.title ?? '';
    meta.textContent = `${label('size')}: ${readableSize(book?.size)} · ${label('last')}`;
    status.textContent = message ? label(message) : '';
    status.hidden = !message;
    indicator.textContent = doc ? `${page} / ${doc.numPages}` : '';
    view.dataset.theme = night ? 'dark' : 'light';
    view.style.setProperty('--read-light', String(brightness / 100));

    const paper = READER_PAPER_COLORS.find(p => p.id === paperId) || READER_PAPER_COLORS[0];
    if (paper.stage) stage.style.background = paper.stage;
    else stage.style.background = '';
    paperTintLayer.style.background = paper.tint || 'transparent';
    paperTintLayer.hidden = !paper.tint;
    paperDot.style.background = paper.swatch;
    paperDot.setAttribute('aria-label', `${label('paperColor')}: ${document.documentElement.lang === 'ru' ? paper.ru : paper.tg}`);
    paperDot.title = paperDot.getAttribute('aria-label');
    brightnessDial.textContent = `☀ ${brightness}%`;

    for (const [id, sw] of paperButtons) {
      const item = READER_PAPER_COLORS.find(x => x.id === id);
      const txt = document.documentElement.lang === 'ru' ? item.ru : item.tg;
      sw.title = txt;
      sw.setAttribute('aria-label', txt);
      sw.setAttribute('aria-pressed', String(id === paperId));
    }

    for (const [key, { b, symbol }] of buttons) {
      b.textContent = symbol ? `${symbol} ${label(key)}` : label(key);
      b.setAttribute('aria-label', label(key));
    }
    const access = (key, disabled) => {
      buttons.get(key).b.disabled = disabled;
    };
    access('prev', !doc || page <= 1);
    access('next', !doc || page >= doc.numPages);
    access('smaller', !doc || zoom <= 0.5);
    access('larger', !doc || zoom >= 4);
    access('search', !doc);
    access('read', reading || !!doc);
    access('fit', !doc);
    access('findPrevious', !hits.children.length);
    access('findNext', !hits.children.length);
    buttons.get('searchStop').b.hidden = !searchInfo.dataset.running;
    access('download', transferStates() === 'downloading' && transferContext?.wantsSave);
    buttons.get('saveOffline').b.hidden = !book;
    buttons.get('saveOffline').b.textContent = `${offlineStored ? '✓ ' : '★ '}${label(offlineStored ? 'removeOffline' : 'saveOffline')}`;
    buttons.get('saveOffline').b.setAttribute('aria-label', label(offlineStored ? 'removeOffline' : 'saveOffline'));
    buttons.get('fit').b.textContent = `${Math.round(zoom * 100)}%`;
    buttons.get('read').b.hidden = !!doc || reading;
    aliyaButton.disabled = !book;
    stage.hidden = !doc;
    quick.disabled = !doc;
    quick.max = doc?.numPages ?? '';
    if (document.activeElement !== quick) quick.value = doc ? String(page) : '';
    quick.setAttribute('aria-label', label('page'));
    searchButton.textContent = label('search');
    query.placeholder = label('search');
    query.setAttribute('aria-label', label('search'));
    if (!searchInfo.textContent) searchInfo.textContent = label('searchLimit');
    settingsTitle.textContent = label('settings');
    toggleTheme.textContent = label(night ? 'light' : 'dark');
    lightCaption.textContent = `${label('brightness')}: ${brightness}%`;
    paperTitle.textContent = label('paperColor');
    applyPanTransform();
    repaintTransfer();
    aliya.update();
  }

  function repaintTransfer() {
    const data = transferContext;
    const mode = data?.state ?? '';
    transfer.hidden = !data;
    bar.hidden = mode !== 'downloading';
    buttons.get('cancel').b.hidden = mode !== 'downloading';
    buttons.get('saveFile').b.hidden = mode !== 'done';
    if (!data) {
      downloadStatus.textContent = '';
      return;
    }
    if (mode === 'downloading') {
      const { loaded, total } = data;
      const pct = total && loaded != null ? Math.min(99, Math.floor((100 * loaded) / total)) : null;
      if (pct === null) bar.removeAttribute('value');
      else { bar.max = 100; bar.value = pct; }
      bar.setAttribute('aria-label', label('downloading'));
      downloadStatus.textContent = `${label('downloading')} · ${loaded ? readableSize(loaded) : '0 МБ'}${total ? ` / ${readableSize(total)} · ${pct}%` : ''}`;
    } else {
      downloadStatus.textContent =
        mode === 'done'
          ? `${label('done')} · 100% · ${readableSize(downloadFile?.size)}`
          : mode === 'cancel'
            ? label('cancel')
            : data.error === 'too_large'
              ? label('tooLarge')
              : label('downloadError');
    }
  }

  async function bytesForBook({ wantsSave = false } = {}) {
    const file = downloadFile ?? cachedPdf(book.url);
    if (file) { downloadFile = file; return file; }
    try {
      const cachedBytes = await getCachedBook(book.url);
      if (cachedBytes?.byteLength) {
        const cachedBlob = new Blob([cachedBytes], { type: 'application/pdf' });
        downloadFile = cachedBlob;
        offlineStored = true;
        rememberPdf(book.url, cachedBlob);
        return cachedBlob;
      }
    } catch {}
    if (transferContext?.state === 'downloading') {
      if (wantsSave) transferContext.wantsSave = true;
      return transferContext.promise;
    }
    const v = generation;
    const url = book.url;
    const controller = new AbortController();
    const op = { state: 'downloading', loaded: 0, total: book.size, controller, wantsSave };
    transferContext = op;
    op.promise = fetchBookFile(book, {
      signal: controller.signal,
      onProgress: progress => {
        if (transferContext !== op) return;
        Object.assign(op, progress);
        repaintTransfer();
      },
    })
      .then(file => {
        if (v !== generation || transferContext !== op || controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        downloadFile = file;
        rememberPdf(url, file);
        op.state = 'done';
        if (!op.wantsSave) transferContext = null;
        refresh();
        return file;
      })
      .catch(error => {
        if (v === generation && transferContext === op) {
          op.state = controller.signal.aborted ? 'cancel' : 'error';
          op.error = error.message;
          refresh();
        }
        throw error;
      });
    refresh();
    return op.promise;
  }

  async function toggleOfflineSave() {
    if (!book) return;
    const target = book;
    if (offlineStored) {
      await deleteCachedBook(target.url).catch(() => {});
      if (book === target) { offlineStored = false; message = ''; refresh(); }
      return;
    }
    try {
      const file = await bytesForBook();
      if (book !== target || !file) return;
      await saveBookOffline({ id: target.url, title: target.title }, new Uint8Array(await file.arrayBuffer()));
      if (book === target) { offlineStored = true; message = 'offlineSaved'; refresh(); }
    } catch {}
  }

  async function startDownload() {
    if (!book || (transferContext?.wantsSave && transferStates() === 'downloading')) return;
    const v = generation;
    try {
      const file = await bytesForBook({ wantsSave: true });
      if (v !== generation || !file) return;
      if (!transferContext) transferContext = { state: 'done', loaded: file.size, total: file.size, wantsSave: true };
      refresh();
      saveDownload();
    } catch {}
  }

  function cancelDownload() {
    const op = transferContext;
    if (op?.state === 'downloading') {
      op.controller.abort();
      op.state = 'cancel';
      refresh();
    }
  }

  function saveDownload() {
    if (!downloadFile) return;
    if (canNativeSave()) {
      const current = generation;
      void nativeSave(downloadFile, bookFilename(book.title)).catch(() => {
        if (current === generation && transferContext) { transferContext.state = 'error'; refresh(); }
      });
      return;
    }
    if (!objectURL) objectURL = URL.createObjectURL(downloadFile);
    const a = el('a');
    a.download = bookFilename(book.title);
    a.href = objectURL;
    view.append(a);
    a.click();
    a.remove();
  }

  function serverModule() {
    if (portable) return portablePdf();
    if (!modulePromise) {
      modulePromise = import(new URL('vendor/pdf/pdf.min.mjs', appRoot).href)
        .then(engine => {
          engine.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf/pdf.worker.min.mjs', appRoot).href;
          return engine;
        })
        .catch(err => {
          modulePromise = null;
          throw err;
        });
    }
    return modulePromise;
  }

  async function open(item, { download = false, trigger } = {}) {
    close(false);
    book = item;
    launch = trigger ?? document.activeElement;
    page = 1;
    zoom = 1;
    panX = 0;
    panY = 0;
    night = false;
    paperId = 'default';
    brightness = 100;
    try {
      const savedLight = Number(readerStore.get('prefs', 'brightness'));
      if (savedLight >= 45 && savedLight <= 120) brightness = savedLight;
    } catch {}
    inputLight.value = String(brightness);
    offlineStored = false;
    barsHidden = false;
    view.classList.remove('reader-bars-hidden');
    try { view.showModal(); } catch { return; }
    document.body.classList.add('reader-modal-open');
    publishReaderMode(true);
    refresh();
    title.focus();
    getCachedBook(item.url)
      .then(bytes => {
        if (book === item && bytes?.byteLength) { offlineStored = true; refresh(); }
      })
      .catch(() => {});
    if (download) startDownload();
    else loadReader();
  }

  async function loadReader() {
    if (!book || reading || doc) return;
    const active = generation;
    reading = true;
    message = 'loading';
    refresh();
    try {
      const [engine, file] = await Promise.all([serverModule(), bytesForBook()]);
      if (active !== generation) return;
      const opts = { data: new Uint8Array(await file.arrayBuffer()) };
      if (active !== generation) return;
      load = engine.getDocument({
        ...opts,
        isEvalSupported: false,
        enableXfa: false,
        useWasm: false,
        maxImageSize: 16000000,
        ...(portable
          ? { StandardFontDataFactory: PortableFonts, useWorkerFetch: false }
          : { standardFontDataUrl: new URL('vendor/pdf/standard_fonts/', appRoot).href }),
        rangeChunkSize: 65536,
      });
      const result = await load.promise;
      if (active !== generation) return;
      doc = result;
      let saved = 1;
      try { saved = Number(readerStore.get('position', book.url)) || 1; } catch {}
      page = Math.min(doc.numPages, Math.max(1, Math.floor(saved)));
      message = '';
      await draw();
      wakeBars();
    } catch {
      if (active === generation) {
        doc = null;
        message = transferStates() === 'cancel' ? '' : 'failure';
      }
    } finally {
      if (active === generation) { reading = false; refresh(); }
    }
  }

  function computeViewport(pObj, targetZoom = zoom) {
    const size = pObj.getViewport({ scale: 1 });
    const available = Math.max(80, stage.clientWidth - 28);
    const height = Math.max(80, stage.clientHeight - 28);
    const fit = Math.min(available / size.width, height / size.height);
    const scale = Math.min(targetZoom * fit, 3000 / Math.max(size.width, size.height));
    return pObj.getViewport({ scale });
  }

  async function renderOffscreenPreview(n) {
    if (!doc || n < 1 || n > doc.numPages) return null;
    if (previewCache.has(n)) return previewCache.get(n);
    const pObj = await doc.getPage(n);
    if (!doc) return null;
    const vp = computeViewport(pObj, 1);
    const ratio = Math.max(1, Math.min(devicePixelRatio || 1, 2, 3200 / Math.max(vp.width, vp.height)));
    const cv = document.createElement('canvas');
    cv.style.width = `${Math.floor(vp.width)}px`;
    cv.style.height = `${Math.floor(vp.height)}px`;
    cv.width = Math.max(1, Math.floor(vp.width * ratio));
    cv.height = Math.max(1, Math.floor(vp.height * ratio));
    await pObj.render({ canvas: cv, viewport: vp, transform: ratio > 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
    if (previewCache.size >= 4) {
      const oldest = previewCache.keys().next().value;
      const oldCv = previewCache.get(oldest);
      if (oldCv) oldCv.width = oldCv.height = 0;
      previewCache.delete(oldest);
    }
    previewCache.set(n, cv);
    return cv;
  }

  async function draw() {
    const v = generation;
    const seq = ++drawGeneration;
    const previous = rendering;
    previous?.cancel();
    rendering = null;
    refresh();
    try {
      if (previous) try { await previous.promise; } catch {}
      if (!doc || v !== generation || seq !== drawGeneration) return;
      const current = page;
      const n = await doc.getPage(current);
      if (v !== generation || seq !== drawGeneration) return;
      const viewport = computeViewport(n, zoom);
      const ratio = Math.max(1, Math.min(devicePixelRatio || 1, 2, 4000 / Math.max(viewport.width, viewport.height)));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      const task = n.render({ canvas, viewport, transform: ratio > 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      rendering = task;
      await task.promise;
      if (rendering === task && v === generation && seq === drawGeneration) {
        rendering = null;
        try { readerStore.set('position', book.url, String(current)); } catch {}
        stage.scrollTo(0, 0);
        // Pre-warm adjacent page for instant curl/flip
        if (current + 1 <= doc.numPages) void renderOffscreenPreview(current + 1).catch(() => {});
      }
    } catch {
      if (v === generation && seq === drawGeneration) { message = 'failure'; refresh(); }
    }
  }

  async function textFor(n) {
    if (!doc) return '';
    if (pageTexts.has(n)) return pageTexts.get(n);
    const source = doc;
    const bTitle = book.title;
    const p = await source.getPage(n);
    const text = extractReaderText((await p.getTextContent()).items, bTitle);
    if (source === doc) {
      if (pageTexts.size >= 48) pageTexts.delete(pageTexts.keys().next().value);
      pageTexts.set(n, text);
    }
    return text;
  }

  async function pageImage(n) {
    const p = await doc.getPage(n);
    const base = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({ scale: Math.min(2, 1500 / Math.max(base.width, base.height)) });
    const image = el('canvas');
    image.width = Math.ceil(viewport.width);
    image.height = Math.ceil(viewport.height);
    try {
      await p.render({ canvas: image, viewport, background: 'white' }).promise;
      return image.toDataURL('image/jpeg', 0.8).split(',')[1];
    } finally {
      image.width = image.height = 0;
    }
  }

  function stopSearch() {
    seekGeneration++;
    searchInfo.dataset.running = '';
    searchInfo.textContent = label('searchStopped');
    refresh();
  }

  function moveHit(step) {
    const count = hits.children.length;
    if (!count) return;
    hitIndex = hitIndex < 0 ? (step > 0 ? 0 : count - 1) : (hitIndex + step + count) % count;
    const item = hits.children[hitIndex];
    const b = item.querySelector('button');
    void go(Number(b.dataset.page), { animate: false });
    for (const node of hits.children) node.classList.toggle('current-hit', node === item);
    item.scrollIntoView({ block: 'nearest' });
  }

  async function runSearch() {
    const q = query.value.trim().toLocaleLowerCase('ru').normalize('NFC');
    if (!q || !doc) return;
    const seq = ++seekGeneration;
    hits.replaceChildren();
    hitIndex = -1;
    searchInfo.dataset.running = 'yes';
    searchInfo.textContent = label('searching');
    const count = doc.numPages;
    refresh();
    for (let n = 1; n <= count; n++) {
      if (seq !== seekGeneration) return;
      let raw = '';
      try { raw = await textFor(n); } catch {}
      if (seq !== seekGeneration) return;
      if (n % 9 === 0) searchInfo.textContent = `${label('searching')} ${n} / ${count}`;
      const found = raw.toLocaleLowerCase('ru').indexOf(q);
      if (found < 0) continue;
      const li = el('li');
      const b = el('button', 'reader-button');
      b.type = 'button';
      b.dataset.page = String(n);
      b.textContent = `${label('page')} ${n} · ${raw.slice(Math.max(0, found - 28), found + q.length + 48)}`;
      b.addEventListener('click', () => {
        hitIndex = [...hits.children].indexOf(li);
        moveHit(0);
      });
      li.append(b);
      hits.append(li);
      refresh();
    }
    if (seq === seekGeneration) {
      searchInfo.dataset.running = '';
      searchInfo.textContent = hits.children.length ? `${hits.children.length} · ${count}` : label('notFound');
      refresh();
    }
  }

  function close(focus = false) {
    generation++;
    drawGeneration++;
    seekGeneration++;
    clearTimeout(idleTimer);
    barsHidden = false;
    view.classList.remove('reader-bars-hidden');
    rendering?.cancel();
    rendering = null;
    if (load) load.destroy().catch(() => {});
    load = null;
    doc = null;
    book = null;
    message = '';
    reading = false;
    canvas.width = canvas.height = 0;
    for (const c of previewCache.values()) c.width = c.height = 0;
    previewCache.clear();
    transferContext?.controller?.abort();
    transferContext = null;
    downloadFile = null;
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = '';
    aliya.dismiss();
    search.hidden = settings.hidden = true;
    hits.replaceChildren();
    pageTexts.clear();
    searchInfo.dataset.running = '';
    searchInfo.textContent = '';
    query.value = '';
    if (view.open) view.close();
    document.body.classList.remove('reader-modal-open');
    publishReaderMode(false);
    if (document.fullscreenElement === view) document.exitFullscreen().catch(() => {});
    if (focus) (launch?.isConnected ? launch : host.querySelector('[data-reader-launch]'))?.focus();
  }

  function handleBack() {
    if (!aliya.node.hidden) {
      if (!aliya.handleBack()) { aliya.dismiss(); aliyaButton.focus(); }
    } else if (!search.hidden || !settings.hidden) {
      search.hidden = settings.hidden = true;
      back.focus();
    } else {
      close(true);
    }
  }

  view.addEventListener('cancel', event => { event.preventDefault(); handleBack(); });
  document.addEventListener('sm:native-back', event => {
    if (view.open && !event.defaultPrevented) { event.preventDefault(); handleBack(); }
  });
  quick.addEventListener('change', () => void go(Number(quick.value)));
  quick.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); void go(Number(quick.value)); quick.blur(); }
  });
  view.addEventListener('keydown', event => {
    if (!doc || event.target.matches('input,textarea,select') || !aliya.node.hidden) return;
    wakeBars();
    if (['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(event.key)) {
      event.preventDefault();
      void go(page + (['ArrowLeft', 'PageUp'].includes(event.key) ? -1 : 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      void go(1);
    } else if (event.key === 'End') {
      event.preventDefault();
      void go(doc.numPages);
    } else if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
      event.preventDefault();
      changeZoom(0.2);
    } else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
      event.preventDefault();
      changeZoom(-0.2);
    }
  });

  // WebGL Page-Curl + swipe gestures when zoom <= 1.01
  const gestures = attachReaderGestures({
    stage,
    container: stageWrap,
    state: () => ({ ready: !!doc && !curlBusy, page, pages: doc?.numPages ?? 0, zoom }),
    current: () => (canvas.width > 0 ? canvas : null),
    preview: n => renderOffscreenPreview(n),
    busy: flag => { curlBusy = flag; },
    commit: async n => { await go(n, { animate: false }); },
    activity: wakeBars,
  });

  // Desktop Ctrl+Wheel zoom, Pan when zoomed, Double-tap zoom, & Tap zones (<15% / center / >85%)
  stage.addEventListener('wheel', e => {
    if (!doc) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      changeZoom(e.deltaY < 0 ? 0.15 : -0.15);
    }
  }, { passive: false });

  let panDrag = null;
  let lastTapAt = 0;
  stage.addEventListener('pointerdown', e => {
    if (!doc || zoom <= 1.01 || e.button !== 0) return;
    panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: panX, py: panY, moved: false };
    try { stage.setPointerCapture(e.pointerId); } catch {}
  });
  stage.addEventListener('pointermove', e => {
    if (!panDrag || e.pointerId !== panDrag.id) return;
    const dx = e.clientX - panDrag.x;
    const dy = e.clientY - panDrag.y;
    if (Math.hypot(dx, dy) > 6) panDrag.moved = true;
    panX = panDrag.px + dx;
    panY = panDrag.py + dy;
    applyPanTransform();
  });
  stage.addEventListener('pointerup', e => {
    if (panDrag && e.pointerId === panDrag.id) {
      if (panDrag.moved) lastTapAt = 0;
      panDrag = null;
    }
  });

  // Two-finger pinch-to-zoom
  let pinch = null;
  const gap = points => Math.hypot(points[1].clientX - points[0].clientX, points[1].clientY - points[0].clientY);
  stage.addEventListener('touchstart', event => {
    if (event.touches.length === 2 && doc) {
      const distance = gap(event.touches);
      if (distance > 8) pinch = { distance, zoom, latest: zoom };
    }
  }, { passive: true });
  stage.addEventListener('touchmove', event => {
    if (pinch && event.touches.length === 2) {
      if (event.cancelable) event.preventDefault();
      pinch.latest = Math.max(0.5, Math.min(4, pinch.zoom * gap(event.touches) / pinch.distance));
    }
  }, { passive: false });
  stage.addEventListener('touchcancel', () => { pinch = null; });
  stage.addEventListener('touchend', () => {
    if (pinch) {
      zoom = Number(pinch.latest.toFixed(2));
      pinch = null;
      if (zoom <= 1.01) { panX = 0; panY = 0; }
      void draw();
    }
  }, { passive: true });

  stage.addEventListener('click', e => {
    if (!doc || gestures.active()) return;
    const box = stage.getBoundingClientRect();
    const relX = (e.clientX - box.left) / Math.max(1, box.width);
    const now = performance.now();
    if (now - lastTapAt < 280) {
      lastTapAt = 0;
      zoom = zoom > 1.1 ? 1 : 1.8;
      if (zoom === 1) { panX = 0; panY = 0; }
      void draw();
      return;
    }
    lastTapAt = now;
    if (zoom <= 1.01) {
      if (relX < 0.15 && page > 1) { void go(page - 1); return; }
      if (relX > 0.85 && page < doc.numPages) { void go(page + 1); return; }
    }
    toggleBars();
  });

  let resizeTimer;
  const resize = () => {
    if (!view.open || !doc) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => void draw(), 85);
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);

  return {
    open,
    close,
    refresh,
    buttonText: () => label('read'),
    downloadText: () => label('download'),
    sizeText: bytes => `${label('size')}: ${readableSize(bytes)}`,
  };
}
