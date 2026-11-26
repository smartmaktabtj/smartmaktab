const api = globalThis.SmartMaktabAdmin;
const $ = id => document.getElementById(id);

const GROUP_LABELS = {
  school: 'Мактаб / Школа',
  maorif: 'Маориф / Район',
  raesat: 'Раёсат / Область',
  ministry: 'Вазорат / Министерство',
  republic: 'Ҷумҳурӣ / Республика',
};

const ICON_OPTIONS = [
  ['folder', '📁 Папка (folder)'],
  ['document', '📄 Документ (document)'],
  ['book', '📚 Книга (book)'],
  ['info', 'ℹ️ Справка (info)'],
  ['calendar', '📅 Календарь (calendar)'],
  ['chart', '📊 Отчёты и графики (chart)'],
  ['settings', '⚙️ Настройки (settings)'],
  ['users', '👥 Кадры / Люди (users)'],
  ['money', '💰 Финансы (money)'],
  ['school', '🏫 Школа (school)'],
];

const ICON_GLYPHS = {
  folder: '📁',
  document: '📄',
  book: '📚',
  info: 'ℹ️',
  calendar: '📅',
  chart: '📊',
  settings: '⚙️',
  users: '👥',
  money: '💰',
  school: '🏫',
};

const state = {
  baseRoles: [],
  customRoles: [],
  roleOverrides: {},
  hiddenRoleIds: [],
  cloud: null,
  settings: null,
  limitBytes: 262144,
  activeRoleId: '',
  pack: { schema: 1, sequence: 1, cabinets: {} },
  lastPublishedPack: null,
  sbToken: '',
  sbUser: null,
  expectedCloudSeq: null,
  lastSavedRevisionId: null,
  revisions: [],
  validTimer: null,
  saveTimer: null,
  editingRoleId: null,
  pvCatId: null,
  pvSecId: null,
};

function allActiveRoles() {
  const hidden = new Set(state.hiddenRoleIds || []);
  const combined = [];
  for (const r of state.baseRoles) {
    if (hidden.has(r.id)) continue;
    const ov = state.roleOverrides?.[r.id];
    combined.push({
      ...r,
      title: ov?.titleRu || r.title,
      titleTg: ov?.titleTg || r.title,
      description: ov?.titleTg ? `${ov.titleTg} / ${ov.titleRu || r.title}` : r.description,
      group: ov?.group || r.group,
      isCustom: false,
    });
  }
  for (const cr of state.customRoles || []) {
    if (hidden.has(cr.id)) continue;
    combined.push({
      id: cr.id,
      number: '★',
      title: cr.title?.ru || cr.title?.tg || cr.id,
      titleTg: cr.title?.tg || cr.title?.ru || cr.id,
      description: cr.title?.tg || '',
      group: cr.group || 'school',
      isCustom: true,
    });
  }
  return combined;
}

function cleanPackForWire(pack) {
  const cabinets = {};
  for (const [role, list] of Object.entries(pack.cabinets || {})) {
    if (!Array.isArray(list) || list.length === 0) continue;
    cabinets[role] = list.map(cat => ({
      id: cat.id,
      title: { tg: cat.title?.tg || '', ru: cat.title?.ru || '' },
      icon: cat.icon || 'folder',
      sections: (cat.sections || []).map(s => {
        const cleanSec = {
          id: s.id,
          title: { tg: s.title?.tg || '', ru: s.title?.ru || '' },
          text: { tg: s.text?.tg || '', ru: s.text?.ru || '' },
        };
        if (s.docxName && s.docxBase64) {
          cleanSec.docxName = s.docxName;
          cleanSec.docxBase64 = s.docxBase64;
        }
        return cleanSec;
      }),
    }));
  }
  const out = {
    schema: 1,
    sequence: Math.max(1, Math.floor(Number(pack.sequence) || 1)),
    cabinets,
  };
  if (Array.isArray(state.customRoles) && state.customRoles.length > 0) {
    out.customRoles = state.customRoles.map(r => ({
      id: r.id,
      title: { tg: r.title?.tg || '', ru: r.title?.ru || '' },
      group: r.group || 'school',
    }));
  }
  return out;
}

function persistedSnapshot() {
  return {
    pack: cleanPackForWire(state.pack),
    customRoles: state.customRoles,
    roleOverrides: state.roleOverrides,
    hiddenRoleIds: state.hiddenRoleIds,
    lastPublishedPack: state.lastPublishedPack,
  };
}

function scheduleSaveAndValidate() {
  const badge = $('saveStateBadge');
  badge.textContent = 'Сохранение…';
  clearTimeout(state.validTimer);
  state.validTimer = setTimeout(() => void runValidate(), 120);
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      await api.saveData(persistedSnapshot());
      badge.textContent = 'Автосохранено ✓';
    } catch {
      badge.textContent = 'Ошибка сохранения';
    }
  }, 350);
}

async function runValidate() {
  const wire = cleanPackForWire(state.pack);
  const res = await api.validatePack(wire);
  const pct = Math.min(100, Math.round((res.estSmupdateBytes / state.limitBytes) * 100));
  const fill = $('meterFill');
  fill.style.width = `${pct}%`;
  fill.className = `meter-fill ${res.estSmupdateBytes > state.limitBytes ? 'over' : pct > 80 ? 'warn' : ''}`;
  $('sizeLabel').textContent = `${res.estSmupdateBytes.toLocaleString('ru-RU')} / ${state.limitBytes.toLocaleString('ru-RU')} Б (${pct}%)`;
  const pill = $('validStatus');
  if (res.ok) {
    pill.textContent = 'Схема валидна ✓';
    pill.className = 'status-pill ok';
  } else {
    pill.textContent = res.error || res.code;
    pill.className = 'status-pill err';
  }
  return res;
}

function updateTopBadges() {
  const s = state.settings;
  const keyBadge = $('keyBadge');
  if (s?.hasPrivateKey) {
    keyBadge.textContent = 'Ed25519 ключ: готов ✓';
    keyBadge.className = 'status-pill ok';
  } else {
    keyBadge.textContent = 'Ed25519 ключ: не настроен';
    keyBadge.className = 'status-pill err';
  }
  const cb = $('cloudBadge');
  if (state.sbToken && state.sbUser) {
    cb.textContent = `Supabase: ${state.sbUser.email} ✓`;
    cb.className = 'status-pill ok';
  } else {
    cb.textContent = 'Supabase: не подключён';
    cb.className = 'status-pill';
  }
  $('seqInput').value = String(state.pack.sequence);
}

function openRoleModal(roleToEdit = null) {
  state.editingRoleId = roleToEdit ? roleToEdit.id : null;
  $('dlgRoleTitle').textContent = roleToEdit ? `Редактировать роль: ${roleToEdit.title}` : 'Добавить новую роль';
  $('roleIdInput').value = roleToEdit ? roleToEdit.id : '';
  $('roleIdInput').disabled = Boolean(roleToEdit);
  $('roleGroupInput').value = roleToEdit?.group || 'school';
  $('roleTitleTg').value = roleToEdit?.titleTg || roleToEdit?.title || '';
  $('roleTitleRu').value = roleToEdit?.title || '';
  $('roleFormErr').textContent = '';
  $('dlgRole').showModal();
}

function renderRoleList() {
  const search = $('roleSearch').value.trim().toLocaleLowerCase('ru');
  const group = $('groupFilter').value;
  const container = $('roleList');
  container.replaceChildren();
  const roles = allActiveRoles();

  for (const r of roles) {
    if (group !== 'all' && r.group !== group) continue;
    const hay = `${r.title} ${r.titleTg || ''} ${r.description || ''} ${r.id}`.toLocaleLowerCase('ru');
    if (search && !hay.includes(search)) continue;

    const cats = state.pack.cabinets[r.id] || [];
    const row = document.createElement('div');
    row.className = `role-row${r.id === state.activeRoleId ? ' active' : ''}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'role-item';

    const left = document.createElement('div');
    left.style.minWidth = '0';
    const t = document.createElement('span');
    t.className = 'r-title';
    t.textContent = `${r.number}. ${r.title}`;
    const sub = document.createElement('span');
    sub.className = 'r-sub';
    sub.textContent = `${GROUP_LABELS[r.group] || r.group} · ${r.id}`;
    left.append(t, sub);

    const badge = document.createElement('span');
    badge.className = `role-badge${cats.length ? ' has' : ''}`;
    badge.textContent = String(cats.length);
    btn.append(left, badge);
    btn.addEventListener('click', () => {
      state.activeRoleId = r.id;
      renderRoleList();
      renderEditor();
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-sm';
    editBtn.title = 'Редактировать роль';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      openRoleModal(r);
    });

    row.append(btn, editBtn);
    if (r.isCustom) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.title = 'Удалить роль';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        if (!confirm(`Удалить роль «${r.title}» (${r.id}) и её категории из пакета?`)) return;
        state.customRoles = state.customRoles.filter(x => x.id !== r.id);
        delete state.pack.cabinets[r.id];
        if (state.activeRoleId === r.id) {
          state.activeRoleId = allActiveRoles()[0]?.id || '';
        }
        renderRoleList();
        renderEditor();
        scheduleSaveAndValidate();
      });
      row.append(delBtn);
    }

    container.append(row);
  }
}

function ensureRoleCats(roleId) {
  if (!Array.isArray(state.pack.cabinets[roleId])) state.pack.cabinets[roleId] = [];
  return state.pack.cabinets[roleId];
}

function renderEditor() {
  const pane = $('editorPane');
  pane.replaceChildren();
  const role = allActiveRoles().find(r => r.id === state.activeRoleId);
  if (!role) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Выберите роль в левом списке или добавьте новую через «+ Роль».';
    pane.append(empty);
    return;
  }

  const cats = ensureRoleCats(role.id);

  const head = document.createElement('div');
  head.className = 'editor-head';
  const titleBox = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.textContent = `${role.title} (${role.titleTg || role.description})`;
  const sm = document.createElement('small');
  sm.textContent = `Cabinet ID: ${role.id} · ${cats.length} / 20 категорий`;
  titleBox.append(h2, sm);

  const headBtns = document.createElement('div');
  headBtns.style.display = 'flex';
  headBtns.style.gap = '8px';

  const pvBtn = document.createElement('button');
  pvBtn.type = 'button';
  pvBtn.className = 'btn';
  pvBtn.textContent = '👁 Предпросмотр этой роли';
  pvBtn.addEventListener('click', () => openPreviewModal(role.id));

  const addCatBtn = document.createElement('button');
  addCatBtn.type = 'button';
  addCatBtn.className = 'btn btn-primary';
  addCatBtn.textContent = '+ Добавить категорию';
  addCatBtn.disabled = cats.length >= 20;
  addCatBtn.addEventListener('click', () => {
    const n = cats.length + 1;
    cats.push({
      id: `category-${n}`,
      title: { tg: `Маводи нав ${n}`, ru: `Новая категория ${n}` },
      icon: 'folder',
      sections: [
        {
          id: `item-${n}-1`,
          title: { tg: 'Дастур ва намуна', ru: 'Инструкция и образец' },
          text: { tg: 'Матни пурра ба забони тоҷикӣ…', ru: 'Подробный текст на русском языке…' },
        },
      ],
    });
    renderRoleList();
    renderEditor();
    scheduleSaveAndValidate();
  });

  headBtns.append(pvBtn, addCatBtn);
  head.append(titleBox, headBtns);
  pane.append(head);

  if (!cats.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = 'Для этого кабинета пока нет категорий.<br><br>Нажмите <strong>«+ Добавить категорию»</strong>, чтобы создать папки, подкатегории и шаблоны DOCX.';
    pane.append(empty);
    return;
  }

  cats.forEach((cat, cIdx) => {
    const card = document.createElement('section');
    card.className = 'cat-card';

    const hdr = document.createElement('div');
    hdr.className = 'cat-header';
    const lbl = document.createElement('strong');
    lbl.textContent = `${ICON_GLYPHS[cat.icon] || '📁'} Категория #${cIdx + 1}: ${cat.title?.ru || cat.id}`;
    const cBtns = document.createElement('div');
    cBtns.style.display = 'flex';
    cBtns.style.gap = '6px';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'btn btn-sm';
    upBtn.textContent = '▲';
    upBtn.disabled = cIdx === 0;
    upBtn.addEventListener('click', () => {
      [cats[cIdx - 1], cats[cIdx]] = [cats[cIdx], cats[cIdx - 1]];
      renderEditor();
      scheduleSaveAndValidate();
    });

    const dnBtn = document.createElement('button');
    dnBtn.type = 'button';
    dnBtn.className = 'btn btn-sm';
    dnBtn.textContent = '▼';
    dnBtn.disabled = cIdx === cats.length - 1;
    dnBtn.addEventListener('click', () => {
      [cats[cIdx], cats[cIdx + 1]] = [cats[cIdx + 1], cats[cIdx]];
      renderEditor();
      scheduleSaveAndValidate();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.textContent = 'Удалить категорию';
    delBtn.addEventListener('click', () => {
      cats.splice(cIdx, 1);
      renderRoleList();
      renderEditor();
      scheduleSaveAndValidate();
    });

    cBtns.append(upBtn, dnBtn, delBtn);
    hdr.append(lbl, cBtns);
    card.append(hdr);

    const row1 = document.createElement('div');
    row1.className = 'grid-3';

    const fId = document.createElement('div');
    fId.className = 'field';
    fId.innerHTML = '<label>ID категории (a-z, 0-9, -)</label>';
    const inId = document.createElement('input');
    inId.value = cat.id || '';
    inId.maxLength = 64;
    inId.addEventListener('input', () => {
      cat.id = inId.value.trim();
      scheduleSaveAndValidate();
    });
    fId.append(inId);

    const fIcon = document.createElement('div');
    fIcon.className = 'field';
    fIcon.innerHTML = '<label>Иконка категории (10 вариантов)</label>';
    const selIcon = document.createElement('select');
    for (const [val, txt] of ICON_OPTIONS) {
      selIcon.add(new Option(txt, val));
    }
    selIcon.value = cat.icon || 'folder';
    selIcon.addEventListener('change', () => {
      cat.icon = selIcon.value;
      lbl.textContent = `${ICON_GLYPHS[cat.icon] || '📁'} Категория #${cIdx + 1}: ${cat.title?.ru || cat.id}`;
      scheduleSaveAndValidate();
    });
    fIcon.append(selIcon);

    const fAutoId = document.createElement('div');
    fAutoId.className = 'field';
    fAutoId.innerHTML = '<label>Сформировать ID из названия</label>';
    const btnAutoId = document.createElement('button');
    btnAutoId.type = 'button';
    btnAutoId.className = 'btn btn-sm';
    btnAutoId.textContent = 'Авто-ID (транслит)';
    btnAutoId.addEventListener('click', async () => {
      const slug = await api.slugId(cat.title?.ru || cat.title?.tg, `cat-${cIdx + 1}`);
      cat.id = slug;
      inId.value = slug;
      scheduleSaveAndValidate();
    });
    fAutoId.append(btnAutoId);
    row1.append(fId, fIcon, fAutoId);

    const row2 = document.createElement('div');
    row2.className = 'grid-2';
    const fTg = document.createElement('div');
    fTg.className = 'field';
    fTg.innerHTML = '<label>Номгӯ (Тоҷикӣ, ≤ 80)</label>';
    const inTg = document.createElement('input');
    inTg.value = cat.title?.tg || '';
    inTg.maxLength = 80;
    inTg.addEventListener('input', () => { cat.title.tg = inTg.value; scheduleSaveAndValidate(); });
    fTg.append(inTg);

    const fRu = document.createElement('div');
    fRu.className = 'field';
    fRu.innerHTML = '<label>Название (Русский, ≤ 80)</label>';
    const inRu = document.createElement('input');
    inRu.value = cat.title?.ru || '';
    inRu.maxLength = 80;
    inRu.addEventListener('input', () => {
      cat.title.ru = inRu.value;
      lbl.textContent = `${ICON_GLYPHS[cat.icon] || '📁'} Категория #${cIdx + 1}: ${cat.title.ru || cat.id}`;
      scheduleSaveAndValidate();
    });
    fRu.append(inRu);
    row2.append(fTg, fRu);

    card.append(row1, row2);

    if (!Array.isArray(cat.sections)) cat.sections = [];
    cat.sections.forEach((sec, sIdx) => {
      const box = document.createElement('div');
      box.className = 'section-box';

      const sBar = document.createElement('div');
      sBar.className = 'section-bar';
      const sLbl = document.createElement('strong');
      sLbl.textContent = `Подкатегория #${sIdx + 1}: ${sec.title?.ru || sec.id}`;
      const sBtns = document.createElement('div');
      sBtns.style.display = 'flex';
      sBtns.style.gap = '5px';

      const sUp = document.createElement('button');
      sUp.type = 'button';
      sUp.className = 'btn btn-sm';
      sUp.textContent = '▲';
      sUp.disabled = sIdx === 0;
      sUp.addEventListener('click', () => {
        [cat.sections[sIdx - 1], cat.sections[sIdx]] = [cat.sections[sIdx], cat.sections[sIdx - 1]];
        renderEditor();
        scheduleSaveAndValidate();
      });

      const sDn = document.createElement('button');
      sDn.type = 'button';
      sDn.className = 'btn btn-sm';
      sDn.textContent = '▼';
      sDn.disabled = sIdx === cat.sections.length - 1;
      sDn.addEventListener('click', () => {
        [cat.sections[sIdx], cat.sections[sIdx + 1]] = [cat.sections[sIdx + 1], cat.sections[sIdx]];
        renderEditor();
        scheduleSaveAndValidate();
      });

      const sDel = document.createElement('button');
      sDel.type = 'button';
      sDel.className = 'btn btn-sm btn-danger';
      sDel.textContent = 'Удалить';
      sDel.addEventListener('click', () => {
        cat.sections.splice(sIdx, 1);
        renderEditor();
        scheduleSaveAndValidate();
      });
      sBtns.append(sUp, sDn, sDel);
      sBar.append(sLbl, sBtns);

      const sr1 = document.createElement('div');
      sr1.className = 'grid-3';

      const fsId = document.createElement('div');
      fsId.className = 'field';
      fsId.innerHTML = '<label>ID подкатегории</label>';
      const insId = document.createElement('input');
      insId.value = sec.id || '';
      insId.maxLength = 64;
      insId.addEventListener('input', () => { sec.id = insId.value.trim(); scheduleSaveAndValidate(); });
      fsId.append(insId);

      const fsTg = document.createElement('div');
      fsTg.className = 'field';
      fsTg.innerHTML = '<label>Сарлавҳа (TJ, ≤100)</label>';
      const insTg = document.createElement('input');
      insTg.value = sec.title?.tg || '';
      insTg.maxLength = 100;
      insTg.addEventListener('input', () => { sec.title.tg = insTg.value; scheduleSaveAndValidate(); });
      fsTg.append(insTg);

      const fsRu = document.createElement('div');
      fsRu.className = 'field';
      fsRu.innerHTML = '<label>Заголовок (RU, ≤100)</label>';
      const insRu = document.createElement('input');
      insRu.value = sec.title?.ru || '';
      insRu.maxLength = 100;
      insRu.addEventListener('input', () => {
        sec.title.ru = insRu.value;
        sLbl.textContent = `Подкатегория #${sIdx + 1}: ${sec.title.ru || sec.id}`;
        scheduleSaveAndValidate();
      });
      fsRu.append(insRu);
      sr1.append(fsId, fsTg, fsRu);

      const sr2 = document.createElement('div');
      sr2.className = 'grid-2';

      const ftTg = document.createElement('div');
      ftTg.className = 'field';
      const cntTg = document.createElement('span');
      cntTg.className = 'char-count';
      cntTg.textContent = `${(sec.text?.tg || '').length} / 4000`;
      const lblTg = document.createElement('label');
      lblTg.textContent = 'Матн (Тоҷикӣ)';
      lblTg.append(cntTg);
      const taTg = document.createElement('textarea');
      taTg.value = sec.text?.tg || '';
      taTg.maxLength = 4000;
      taTg.addEventListener('input', () => {
        sec.text.tg = taTg.value;
        cntTg.textContent = `${taTg.value.length} / 4000`;
        scheduleSaveAndValidate();
      });
      ftTg.append(lblTg, taTg);

      const ftRu = document.createElement('div');
      ftRu.className = 'field';
      const cntRu = document.createElement('span');
      cntRu.className = 'char-count';
      cntRu.textContent = `${(sec.text?.ru || '').length} / 4000`;
      const lblRu = document.createElement('label');
      lblRu.textContent = 'Текст (Русский)';
      lblRu.append(cntRu);
      const taRu = document.createElement('textarea');
      taRu.value = sec.text?.ru || '';
      taRu.maxLength = 4000;
      taRu.addEventListener('input', () => {
        sec.text.ru = taRu.value;
        cntRu.textContent = `${taRu.value.length} / 4000`;
        scheduleSaveAndValidate();
      });
      ftRu.append(lblRu, taRu);

      sr2.append(ftTg, ftRu);

      // DOCX optional attachment row
      const docxRow = document.createElement('div');
      docxRow.className = 'docx-row';
      const pickDocxBtn = document.createElement('button');
      pickDocxBtn.type = 'button';
      pickDocxBtn.className = 'btn btn-sm';
      pickDocxBtn.textContent = sec.docxName ? '📄 Заменить .docx' : '📎 Прикрепить .docx шаблон';
      pickDocxBtn.addEventListener('click', async () => {
        try {
          const picked = await api.pickDocx();
          if (picked.canceled) return;
          sec.docxName = picked.docxName;
          sec.docxBase64 = picked.docxBase64;
          renderEditor();
          scheduleSaveAndValidate();
        } catch (err) {
          alert(err.message || 'Не удалось прикрепить .docx');
        }
      });
      docxRow.append(pickDocxBtn);

      if (sec.docxName && sec.docxBase64) {
        const pill = document.createElement('span');
        pill.className = 'docx-pill';
        const approxKb = Math.max(1, Math.round((sec.docxBase64.length * 0.75) / 1024));
        pill.textContent = `${sec.docxName} (~${approxKb} КБ)`;
        const clearDocx = document.createElement('button');
        clearDocx.type = 'button';
        clearDocx.className = 'btn btn-sm btn-danger';
        clearDocx.textContent = 'Убрать .docx';
        clearDocx.addEventListener('click', () => {
          delete sec.docxName;
          delete sec.docxBase64;
          renderEditor();
          scheduleSaveAndValidate();
        });
        docxRow.append(pill, clearDocx);
      }

      box.append(sBar, sr1, sr2, docxRow);
      card.append(box);
    });

    const addSecBtn = document.createElement('button');
    addSecBtn.type = 'button';
    addSecBtn.className = 'btn btn-sm';
    addSecBtn.style.marginTop = '10px';
    addSecBtn.textContent = '+ Добавить подкатегорию';
    addSecBtn.disabled = cat.sections.length >= 20;
    addSecBtn.addEventListener('click', () => {
      const k = cat.sections.length + 1;
      cat.sections.push({
        id: `section-${k}`,
        title: { tg: `Қисми ${k}`, ru: `Подкатегория ${k}` },
        text: { tg: 'Матн…', ru: 'Текст…' },
      });
      renderEditor();
      scheduleSaveAndValidate();
    });
    card.append(addSecBtn);

    pane.append(card);
  });
}

// Live Client Preview Modal
function openPreviewModal(initialRoleId) {
  const roles = allActiveRoles();
  const sel = $('pvRoleSelect');
  sel.replaceChildren();
  for (const r of roles) {
    const count = (state.pack.cabinets[r.id] || []).length;
    sel.add(new Option(`${r.title}${count ? ` (${count})` : ''}`, r.id));
  }
  sel.value = initialRoleId && roles.some(r => r.id === initialRoleId) ? initialRoleId : (state.activeRoleId || roles[0]?.id || '');
  state.pvCatId = null;
  state.pvSecId = null;
  renderPreview();
  $('dlgPreview').showModal();
}

function renderPreview() {
  const roleId = $('pvRoleSelect').value;
  const lang = $('pvLangSelect').value === 'ru' ? 'ru' : 'tg';
  const theme = $('pvThemeSelect').value === 'dark' ? 'dark' : 'light';
  const canvas = $('pvCanvas');
  canvas.className = `pv-canvas${theme === 'dark' ? ' dark' : ''}`;

  const cats = state.pack.cabinets[roleId] || [];
  const sidebar = $('pvSidebar');
  const content = $('pvContent');
  sidebar.replaceChildren();
  content.replaceChildren();

  if (!cats.length) {
    sidebar.innerHTML = `<small style="opacity:.7">${lang === 'tg' ? 'Бахшҳо нестанд' : 'Категории ещё не добавлены'}</small>`;
    content.innerHTML = `<h4>${lang === 'tg' ? 'Пешнамоиш холӣ аст' : 'Предпросмотр пуст'}</h4><p>${lang === 'tg' ? 'Барои ин вазифа дар таҳриргар категория илова кунед.' : 'Добавьте категорию для этой должности в редакторе.'}</p>`;
    return;
  }

  let activeCat = cats.find(c => c.id === state.pvCatId) || cats[0];
  state.pvCatId = activeCat.id;
  let activeSec = (activeCat.sections || []).find(s => s.id === state.pvSecId) || activeCat.sections?.[0] || null;
  state.pvSecId = activeSec?.id || null;

  for (const cat of cats) {
    const cBtn = document.createElement('button');
    cBtn.type = 'button';
    cBtn.className = 'pv-cat-btn';
    cBtn.textContent = `${ICON_GLYPHS[cat.icon] || '📁'} ${cat.title?.[lang] || cat.id}`;
    cBtn.addEventListener('click', () => {
      state.pvCatId = cat.id;
      state.pvSecId = cat.sections?.[0]?.id || null;
      renderPreview();
    });
    sidebar.append(cBtn);

    if (cat.id === activeCat.id && Array.isArray(cat.sections) && cat.sections.length) {
      const sList = document.createElement('div');
      sList.className = 'pv-sec-list';
      for (const sec of cat.sections) {
        const sBtn = document.createElement('button');
        sBtn.type = 'button';
        sBtn.className = `pv-sec-btn${sec.id === activeSec?.id ? ' active' : ''}`;
        sBtn.textContent = sec.title?.[lang] || sec.id;
        sBtn.addEventListener('click', () => {
          state.pvSecId = sec.id;
          renderPreview();
        });
        sList.append(sBtn);
      }
      sidebar.append(sList);
    }
  }

  if (activeSec) {
    const h4 = document.createElement('h4');
    h4.textContent = `${ICON_GLYPHS[activeCat.icon] || '📁'} ${activeCat.title?.[lang] || ''} — ${activeSec.title?.[lang] || activeSec.id}`;
    const pre = document.createElement('pre');
    pre.textContent = activeSec.text?.[lang] || '';
    content.append(h4, pre);
    if (activeSec.docxName) {
      const badge = document.createElement('div');
      badge.className = 'docx-pill';
      badge.style.display = 'inline-block';
      badge.style.marginTop = '14px';
      badge.textContent = `📥 ${lang === 'tg' ? 'Боргирии намуна:' : 'Скачать шаблон:'} ${activeSec.docxName}`;
      content.append(badge);
    }
  }
}

// Supabase REST helpers
async function sbFetch(path, { method = 'GET', body, token } = {}) {
  const headers = {
    apikey: state.cloud.publishableKey,
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${state.cloud.url}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.msg || json.message || json.error_description || json.error || `HTTP ${res.status}`);
  return json;
}

async function loadCloudRevisions() {
  if (!state.sbToken) return;
  const rows = await sbFetch('/rest/v1/rpc/admin_list_content_revisions', {
    method: 'POST',
    body: {},
    token: state.sbToken,
  });
  state.revisions = Array.isArray(rows) ? rows : [];
  const box = $('revList');
  box.replaceChildren();
  if (!state.revisions.length) {
    box.innerHTML = '<p style="color:var(--muted)">Ревизий в Supabase пока нет. Нажмите «Сохранить текущую версию в Supabase», чтобы создать первую.</p>';
    return;
  }
  for (const r of state.revisions) {
    const item = document.createElement('div');
    item.className = 'rev-item';
    const info = document.createElement('div');
    const dt = new Date(r.created_at).toLocaleString('ru-RU');
    info.innerHTML = `<strong>Версия #${r.sequence}</strong> ${r.published_tag ? `<span class="status-pill ok">${r.published_tag}</span>` : ''}<br><small style="color:var(--muted)">${dt} · ${r.created_by_email || ''} ${r.comment ? `· «${r.comment}»` : ''}</small>`;
    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.gap = '6px';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'btn btn-sm btn-primary';
    loadBtn.textContent = 'Загрузить в редактор';
    loadBtn.addEventListener('click', () => {
      state.pack = structuredClone(r.payload);
      if (Array.isArray(r.payload?.customRoles)) state.customRoles = structuredClone(r.payload.customRoles);
      state.expectedCloudSeq = r.sequence;
      state.lastSavedRevisionId = r.id;
      updateTopBadges();
      renderRoleList();
      renderEditor();
      scheduleSaveAndValidate();
      $('dlgCloud').close();
    });

    const rbBtn = document.createElement('button');
    rbBtn.type = 'button';
    rbBtn.className = 'btn btn-sm btn-gold';
    rbBtn.textContent = 'Откатить к этой';
    rbBtn.addEventListener('click', async () => {
      try {
        rbBtn.disabled = true;
        const nextRow = await sbFetch('/rest/v1/rpc/admin_rollback_content_revision', {
          method: 'POST',
          body: { p_revision_id: r.id, p_comment: `Откат к версии #${r.sequence}` },
          token: state.sbToken,
        });
        state.pack = structuredClone(nextRow.payload);
        state.expectedCloudSeq = nextRow.sequence;
        state.lastSavedRevisionId = nextRow.id;
        updateTopBadges();
        renderRoleList();
        renderEditor();
        scheduleSaveAndValidate();
        await loadCloudRevisions();
      } catch (err) {
        alert(`Ошибка отката: ${err.message}`);
      } finally {
        rbBtn.disabled = false;
      }
    });

    btns.append(loadBtn, rbBtn);
    item.append(info, btns);
    box.append(item);
  }
}

function populateSettingsDialog() {
  const s = state.settings;
  $('pubKeyBox').textContent = s.publicKeyBase64 || 'Не настроен';
  $('keyStatusText').textContent = s.hasPrivateKey ? 'Приватный ключ загружен и защищён в локальном хранилище.' : 'Приватный ключ отсутствует — выберите или сгенерируйте его.';
  $('cfgRepo').value = s.ownerRepo || 'smartmaktabtj/smartmaktab';
  $('cfgBranch').value = s.branch || 'main';
  $('cfgFeedPath').value = s.branchFeedPath ?? 'updates/latest.smupdate';
  $('cfgToken').value = '';
  $('cfgToken').placeholder = s.hasGithubToken ? '•••••• (уже сохранён; введите новый только для замены)' : 'ghp_…';
}

async function bootstrap() {
  const data = await api.init();
  state.baseRoles = data.roles;
  state.cloud = data.cloud;
  state.settings = data.settings;
  state.limitBytes = data.limitBytes;

  if (data.savedData) {
    state.pack = data.savedData.pack || { schema: 1, sequence: 1, cabinets: {} };
    state.customRoles = data.savedData.customRoles || [];
    state.roleOverrides = data.savedData.roleOverrides || {};
    state.hiddenRoleIds = data.savedData.hiddenRoleIds || [];
    state.lastPublishedPack = data.savedData.lastPublishedPack || null;
  }

  state.activeRoleId = allActiveRoles()[0]?.id || '';
  $('sbEmail').value = data.settings.supabaseEmail || '';

  updateTopBadges();
  renderRoleList();
  renderEditor();
  await runValidate();

  document.querySelectorAll('[data-close-dlg]').forEach(b => {
    b.addEventListener('click', () => $(b.dataset.closeDlg).close());
  });
  $('roleSearch').addEventListener('input', renderRoleList);
  $('groupFilter').addEventListener('change', renderRoleList);
  $('seqInput').addEventListener('input', () => {
    state.pack.sequence = Math.max(1, Math.floor(Number($('seqInput').value) || 1));
    scheduleSaveAndValidate();
  });
  $('btnSeqBump').addEventListener('click', () => {
    state.pack.sequence = (Number(state.pack.sequence) || 1) + 1;
    $('seqInput').value = String(state.pack.sequence);
    scheduleSaveAndValidate();
  });

  // Role CRUD modal handlers
  $('btnAddRole').addEventListener('click', () => openRoleModal(null));
  $('btnRoleAutoId').addEventListener('click', async () => {
    if ($('roleIdInput').disabled) return;
    const raw = $('roleTitleRu').value || $('roleTitleTg').value;
    $('roleIdInput').value = await api.slugId(raw, 'custom-role');
  });
  $('btnSaveRole').addEventListener('click', () => {
    const id = $('roleIdInput').value.trim();
    const group = $('roleGroupInput').value;
    const titleTg = $('roleTitleTg').value.trim();
    const titleRu = $('roleTitleRu').value.trim();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
      $('roleFormErr').textContent = 'ID должен содержать только латинские буквы, цифры и дефис.';
      return;
    }
    if (!titleTg || !titleRu) {
      $('roleFormErr').textContent = 'Заполните названия на таджикском и русском.';
      return;
    }
    if (state.editingRoleId) {
      const customIdx = state.customRoles.findIndex(r => r.id === state.editingRoleId);
      if (customIdx >= 0) {
        state.customRoles[customIdx] = { id, title: { tg: titleTg, ru: titleRu }, group };
      } else {
        state.roleOverrides[id] = { titleTg, titleRu, group };
      }
    } else {
      if (allActiveRoles().some(r => r.id === id)) {
        $('roleFormErr').textContent = `Роль с ID "${id}" уже существует.`;
        return;
      }
      state.customRoles.push({ id, title: { tg: titleTg, ru: titleRu }, group });
      state.activeRoleId = id;
    }
    $('dlgRole').close();
    renderRoleList();
    renderEditor();
    scheduleSaveAndValidate();
  });

  // Preview handlers
  $('btnPreview').addEventListener('click', () => openPreviewModal(state.activeRoleId));
  $('pvRoleSelect').addEventListener('change', () => { state.pvCatId = null; state.pvSecId = null; renderPreview(); });
  $('pvLangSelect').addEventListener('change', renderPreview);
  $('pvThemeSelect').addEventListener('change', renderPreview);

  // JSON export / import
  $('btnExportJson').addEventListener('click', async () => {
    try {
      const res = await api.exportJson(persistedSnapshot());
      if (!res.canceled) alert(`Проект сохранён: ${res.filePath}`);
    } catch (err) {
      alert(`Ошибка экспорта JSON: ${err.message}`);
    }
  });
  $('btnImportJson').addEventListener('click', async () => {
    try {
      const res = await api.importJson();
      if (res.canceled) return;
      state.pack = res.data.pack || { schema: 1, sequence: 1, cabinets: {} };
      state.customRoles = res.data.customRoles || [];
      state.roleOverrides = res.data.roleOverrides || {};
      state.hiddenRoleIds = res.data.hiddenRoleIds || [];
      state.lastPublishedPack = res.data.lastPublishedPack || state.lastPublishedPack;
      updateTopBadges();
      renderRoleList();
      renderEditor();
      scheduleSaveAndValidate();
    } catch (err) {
      alert(`Ошибка импорта JSON: ${err.message}`);
    }
  });

  // Settings & Ed25519
  $('btnSettings').addEventListener('click', () => { populateSettingsDialog(); $('dlgSettings').showModal(); });
  $('btnPickKey').addEventListener('click', async () => {
    const res = await api.pickKeyFile();
    if (!res.canceled) { state.settings = res.settings; populateSettingsDialog(); updateTopBadges(); }
  });
  $('btnGenKey').addEventListener('click', async () => {
    const res = await api.generateKeys();
    if (!res.canceled) {
      state.settings = res.settings;
      populateSettingsDialog();
      updateTopBadges();
      alert(`Ключи сохранены!\n\nФайл: ${res.filePath}\n\nСкопируйте SM_CONTENT_PUBLIC_KEY из поля ниже в GitHub Variables.`);
    }
  });
  $('btnSaveSettings').addEventListener('click', async () => {
    const patch = {
      ownerRepo: $('cfgRepo').value.trim(),
      branch: $('cfgBranch').value.trim(),
      branchFeedPath: $('cfgFeedPath').value.trim(),
    };
    const tok = $('cfgToken').value.trim();
    if (tok) patch.githubToken = tok;
    state.settings = await api.saveSettings(patch);
    updateTopBadges();
    $('dlgSettings').close();
  });

  // Cloud Sync
  $('btnCloud').addEventListener('click', () => $('dlgCloud').showModal());
  $('btnSbLogin').addEventListener('click', async () => {
    const email = $('sbEmail').value.trim();
    const password = $('sbPass').value;
    if (!email || !password) return;
    $('sbAuthMsg').textContent = 'Вход…';
    try {
      const auth = await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
      const ctx = await sbFetch('/rest/v1/rpc/get_my_workspace_context', { method: 'POST', body: {}, token: auth.access_token });
      if (!ctx?.is_super_admin) throw new Error('Требуется роль super_admin');
      state.sbToken = auth.access_token;
      state.sbUser = auth.user;
      state.settings = await api.saveSettings({ supabaseEmail: email });
      $('sbPass').value = '';
      $('cloudAuthBox').hidden = true;
      $('cloudSyncBox').hidden = false;
      $('sbAuthMsg').textContent = '';
      updateTopBadges();
      await loadCloudRevisions();
    } catch (err) {
      $('sbAuthMsg').textContent = `Ошибка: ${err.message}`;
    }
  });
  $('btnSbPull').addEventListener('click', () => void loadCloudRevisions());
  $('btnSbPush').addEventListener('click', async () => {
    const check = await runValidate();
    if (!check.ok) { alert(`Исправьте схему перед сохранением:\n${check.error}`); return; }
    try {
      const row = await sbFetch('/rest/v1/rpc/admin_save_content_revision', {
        method: 'POST',
        body: {
          p_payload: cleanPackForWire(state.pack),
          p_comment: $('sbNote').value.trim(),
          p_expected_seq: state.expectedCloudSeq,
          p_published_tag: null,
          p_published_url: null,
        },
        token: state.sbToken,
      });
      state.pack = structuredClone(row.payload);
      state.expectedCloudSeq = row.sequence;
      state.lastSavedRevisionId = row.id;
      updateTopBadges();
      scheduleSaveAndValidate();
      await loadCloudRevisions();
    } catch (err) {
      alert(`Конфликт или ошибка сохранения: ${err.message}`);
    }
  });

  // Open .smupdate
  $('btnOpen').addEventListener('click', async () => {
    try {
      const res = await api.openSmupdate();
      if (res.canceled) return;
      state.pack = res.payload;
      if (Array.isArray(res.payload?.customRoles)) state.customRoles = structuredClone(res.payload.customRoles);
      updateTopBadges();
      renderRoleList();
      renderEditor();
      scheduleSaveAndValidate();
    } catch (err) {
      alert(`Не удалось открыть .smupdate: ${err.message}`);
    }
  });

  // Sign & Save local .smupdate
  $('btnSaveFile').addEventListener('click', async () => {
    const check = await runValidate();
    if (!check.ok) { alert(`Исправьте схему:\n${check.error}`); return; }
    try {
      const wire = cleanPackForWire(state.pack);
      const res = await api.saveSmupdate(wire);
      if (!res.canceled) {
        state.lastPublishedPack = structuredClone(wire);
        scheduleSaveAndValidate();
        alert(`Подписано и сохранено!\n\nФайл: ${res.filePath}\nРазмер: ${res.bytes} байт\nSHA-256: ${res.sha256}`);
      }
    } catch (err) {
      alert(`Ошибка подписи: ${err.message}`);
    }
  });

  // Publish modal with live diff summary
  $('btnPublish').addEventListener('click', async () => {
    const check = await runValidate();
    if (!check.ok) { alert(`Исправьте схему:\n${check.error}`); return; }
    const wire = cleanPackForWire(state.pack);
    const roleTitles = Object.fromEntries(allActiveRoles().map(r => [r.id, r.title]));
    const diffs = await api.diffPack({
      prevPack: state.lastPublishedPack || { schema: 1, sequence: 0, cabinets: {} },
      nextPack: wire,
      roleTitles,
    });
    const diffList = $('pubDiffList');
    diffList.replaceChildren();
    if (!diffs.length) {
      const li = document.createElement('li');
      li.textContent = 'Нет отличий от последней опубликованной версии (или обновлена только нумерация).';
      diffList.append(li);
    } else {
      for (const d of diffs) {
        const li = document.createElement('li');
        li.className = `diff-${d.kind}`;
        li.textContent = d.text;
        diffList.append(li);
      }
    }
    $('pubTag').value = `content-v${wire.sequence}`;
    $('pubName').value = `SmartMaktab Content v${wire.sequence}`;
    $('pubNotes').value = diffs.map(d => d.text).join('\n');
    $('pubStatus').textContent = '';
    $('dlgPublish').showModal();
  });

  $('btnConfirmPublish').addEventListener('click', async () => {
    const tag = $('pubTag').value.trim();
    const releaseName = $('pubName').value.trim();
    const notes = $('pubNotes').value.trim();
    $('btnConfirmPublish').disabled = true;
    $('pubStatus').textContent = 'Подпись Ed25519 и публикация в GitHub…';
    try {
      const wire = cleanPackForWire(state.pack);
      const out = await api.publishGithub({ payload: wire, tag, releaseName, notes });
      state.lastPublishedPack = structuredClone(wire);
      scheduleSaveAndValidate();
      if (state.sbToken) {
        if (state.lastSavedRevisionId && state.expectedCloudSeq === wire.sequence) {
          await sbFetch('/rest/v1/rpc/admin_mark_content_published', {
            method: 'POST',
            body: { p_revision_id: state.lastSavedRevisionId, p_published_tag: out.tag, p_published_url: out.rawFeedUrl || out.assetUrl },
            token: state.sbToken,
          });
        } else {
          const saved = await sbFetch('/rest/v1/rpc/admin_save_content_revision', {
            method: 'POST',
            body: {
              p_payload: wire,
              p_comment: notes || `Published ${out.tag}`,
              p_expected_seq: state.expectedCloudSeq,
              p_published_tag: out.tag,
              p_published_url: out.rawFeedUrl || out.assetUrl,
            },
            token: state.sbToken,
          });
          state.expectedCloudSeq = saved.sequence;
          state.lastSavedRevisionId = saved.id;
        }
      }
      $('pubStatus').textContent = `Готово! Релиз: ${out.releaseUrl}`;
    } catch (err) {
      $('pubStatus').textContent = `Ошибка: ${err.message}`;
    } finally {
      $('btnConfirmPublish').disabled = false;
    }
  });
}

void bootstrap();
