const el = (tag, text = '') => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};

export function mountWindowsContent(article, views) {
  const api = globalThis.SmartMaktabWindows;
  if (!api?.contentStatus) return;

  const panel = el('section');
  panel.id = 'windowsContent';
  panel.className = 'section sm-screen no-print';
  article.append(panel);

  const heading = el('h2');
  const actions = el('div');
  const usb = el('button');
  const online = el('button');
  const check = el('button');
  const filterWrap = el('label');
  const filterLabel = el('span');
  const filterInput = el('input');
  const status = el('p');
  const items = el('div');

  actions.className = 'control';
  status.setAttribute('role', 'status');
  for (const b of [usb, check, online]) {
    b.type = 'button';
    b.className = 'button alt';
    actions.append(b);
  }
  filterWrap.className = 'field';
  filterWrap.hidden = true;
  filterInput.type = 'search';
  filterInput.maxLength = 80;
  filterWrap.append(filterLabel, filterInput);

  panel.append(heading, actions, status, filterWrap, items);
  views.shortcut(panel.id, 'Обновление материалов', 'Навсозии мавод', '↻');

  let state = {};
  let code = '';
  let busy = false;
  const icons = { folder: '▤', document: '▧', book: '▥', info: 'ⓘ' };

  function render() {
    const lang = document.documentElement.lang === 'tg' ? 'tg' : 'ru';
    const t = (tg, ru) => (lang === 'tg' ? tg : ru);

    heading.textContent = t('Навсозии мавод', 'Обновление материалов');
    usb.textContent = t('Интихоб аз телефон ё флешка', 'Выбрать с телефона или флешки');
    check.textContent = t('Навсозиҳоро тафтиш кунед', 'Проверить обновления');
    online.textContent = t('Навсозӣ аз GitHub', 'Обновить из GitHub');
    filterLabel.textContent = t('Ҷустуҷӯ дар мавод', 'Поиск по материалам');
    filterInput.placeholder = t('Ном ё калимаи калидӣ…', 'Название или ключевое слово…');

    usb.disabled = busy || state.status !== 'ready';
    check.disabled = usb.disabled;
    online.disabled = usb.disabled;
    online.hidden = !state.online;

    const texts = {
      'no-key': t('Калиди санҷиши баста дар ин насб танзим нашудааст.', 'В этой сборке не настроен ключ проверки пакетов.'),
      corrupt: t('Бастаи маҳаллӣ тасдиқ нашуд. Ба дастгирӣ муроҷиат кунед.', 'Локальный пакет не прошёл проверку. Обратитесь в поддержку.'),
      'not-newer': t('Нусхаи навтар нест.', 'Пакет не новее установленного.'),
      none: t(
        'Дар ҷузвдони «Боргириҳо» ва дискҳои USB бастаҳои .smupdate нестанд. Телефонро тавассути USB пайваст кунед, ҳолати «Интиқоли файл»-ро интихоб кунед ва файлро ба ҷузвдони «Боргириҳо» нусхабардорӣ кунед, ё тугмаи «Интихоб аз телефон ё флешка»-ро пахш кунед.',
        'В папке «Загрузки» и на USB-дисках нет пакетов .smupdate. Подключите телефон по USB, выберите режим «Передача файлов» и скопируйте файл в папку «Загрузки», или нажмите «Выбрать с телефона или флешки».'
      ),
      signature: t('Имзои баста нодуруст аст.', 'Недействительная подпись пакета.'),
      error: t('Баста ворид нашуд.', 'Не удалось импортировать пакет.'),
      network: t('Боргирӣ дастрас нест.', 'Не удалось скачать пакет.'),
      applied: t('Баста ворид шуд.', 'Пакет применён.'),
    };

    status.textContent = busy
      ? t('Интизор шавед…', 'Подождите…')
      : [
          texts[code] ?? (['schema', 'size', 'format', 'denied'].includes(code) ? texts.error : ''),
          state.payload
            ? t(`Нусхаи мавод: ${state.payload.sequence}`, `Версия материалов: ${state.payload.sequence}`)
            : state.status === 'ready'
              ? t('Ҳоло баста ворид нашудааст.', 'Пакет ещё не установлен.')
              : texts[state.status] ?? '',
        ]
          .filter(Boolean)
          .join(' · ');

    const cats = state.payload?.cabinets?.[article.dataset.cabinetId] ?? [];
    filterWrap.hidden = !cats.length;
    const needle = filterInput.value.trim().toLocaleLowerCase('ru');
    items.replaceChildren();

    let shownCount = 0;
    for (const cat of cats) {
      const catTitle = cat.title[lang] || '';
      const matchedSections = needle
        ? cat.sections.filter(
            sec =>
              catTitle.toLocaleLowerCase('ru').includes(needle) ||
              (sec.title[lang] || '').toLocaleLowerCase('ru').includes(needle) ||
              (sec.text[lang] || '').toLocaleLowerCase('ru').includes(needle)
          )
        : cat.sections;
      if (needle && !matchedSections.length) continue;

      shownCount++;
      const d = el('details');
      if (needle) d.open = true;
      const s = el('summary', `${icons[cat.icon] || '▤'} ${catTitle} (${matchedSections.length})`);
      d.append(s);

      for (const page of matchedSections) {
        const sub = el('section');
        const h = el('h4', page.title[lang]);
        const p = el('p', page.text[lang]);
        p.style.whiteSpace = 'pre-wrap';

        const copyBtn = el('button', t('Нусхаи матн', 'Копировать текст'));
        copyBtn.type = 'button';
        copyBtn.className = 'button alt';
        copyBtn.style.marginTop = '6px';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard?.writeText(`${page.title[lang]}\n\n${page.text[lang]}`).then(() => {
            copyBtn.textContent = t('Нусха шуд ✓', 'Скопировано ✓');
            setTimeout(() => { copyBtn.textContent = t('Нусхаи матн', 'Копировать текст'); }, 1800);
          }).catch(() => {});
        });
        sub.append(h, p, copyBtn);
        d.append(sub);
      }
      items.append(d);
    }

    if (state.payload && !cats.length) {
      items.append(el('p', t('Дар баста барои ин вазифа мавод нест.', 'В пакете нет материалов для этой должности.')));
    } else if (state.payload && needle && !shownCount) {
      items.append(el('p', t('Аз рӯи ин дархост чизе ёфт нашуд.', 'По вашему запросу ничего не найдено.')));
    }
  }

  async function apply(handler) {
    if (busy) return;
    busy = true;
    render();
    try {
      const r = await handler();
      code = r.status === 'cancel' ? '' : r.status;
      if (r.status === 'corrupt') state = { status: 'corrupt' };
      else if (r.payload) state = { ...state, payload: r.payload };
    } catch {
      code = 'error';
    } finally {
      busy = false;
      render();
    }
  }

  filterInput.addEventListener('input', render);
  usb.addEventListener('click', () => void apply(api.importContent));
  check.addEventListener('click', () => void apply(api.checkContent));
  online.addEventListener('click', () => void apply(api.fetchContent));
  document.addEventListener('cabinet:language', render);
  render();
  void api.contentStatus().then(
    s => { state = s; render(); },
    () => { code = 'error'; render(); }
  );
}
