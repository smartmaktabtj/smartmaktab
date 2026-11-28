import {
  POSITION_CATALOG,
  formatPositionTitle,
} from '../shared/position-catalog.mjs';
import {
  DEFAULT_PAGE_MARGINS_MM,
  compressDocPayload,
  decompressDocPayload,
  escapeHtml,
  parseDocxBytesToDocModel,
  parsePlainTextToDocModel,
} from '../shared/doc-template-engine.mjs';
import { mountWordEditor } from '../shared/doc-word-editor.mjs';

export function setupAdminDocumentsPanel({ client, getLang, setStatus }) {
  const $ = (id) => document.getElementById(id);
  let catalog = { categories: [], subcategories: [], templates: [] };
  let editingCatId = null;
  let editingSubId = null;
  let editingTplId = null;
  let wordEditor = null;

  function ensureWordEditor() {
    const host = $('docTplEditorHost');
    if (!host) return null;
    if (!wordEditor) {
      wordEditor = mountWordEditor(host, {
        lang: getLang(),
        mode: 'admin',
        editMode: 'full',
        initialHtml: '<p style="text-align:center"><strong>{{school.name}}</strong></p><p><br></p><p>Сана: {{date.today}}</p>',
        minHeight: '500px',
      });
    }
    return wordEditor;
  }

  function renderPositionChecks(containerId, prefix, defaultCheckedCodes = []) {
    const box = $(containerId);
    if (!box) return;
    const lang = getLang();
    const checkedSet = new Set(defaultCheckedCodes);
    box.replaceChildren(...POSITION_CATALOG.map((pos) => {
      const lbl = document.createElement('label');
      lbl.className = 'adm-pos-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = pos.id;
      cb.dataset.posGroup = pos.group;
      cb.checked = checkedSet.has(pos.id);
      const span = document.createElement('span');
      span.textContent = formatPositionTitle(pos.id, lang);
      lbl.append(cb, span);
      return lbl;
    }));
  }

  function getSelectedPositions(containerId) {
    const box = $(containerId);
    if (!box) return [];
    return [...box.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
  }

  function setSelectedPositions(containerId, codes = []) {
    const box = $(containerId);
    if (!box) return;
    const set = new Set(codes || []);
    for (const cb of box.querySelectorAll('input[type="checkbox"]')) {
      cb.checked = set.has(cb.value);
    }
  }

  function renderCatalogFilterSelects() {
    const lang = getLang();
    const posFilter = $('docCatalogPosFilter');
    if (posFilter) {
      const prev = posFilter.value;
      posFilter.replaceChildren(
        new Option(lang === 'ru' ? 'Все 24 должности' : 'Ҳамаи 24 вазифа', ''),
        ...POSITION_CATALOG.map((p) => new Option(formatPositionTitle(p.id, lang), p.id)),
      );
      posFilter.value = prev;
    }

    const cats = catalog.categories || [];
    const catOpts = cats.map((c) => new Option(
      `${c.icon || '📁'} ${lang === 'ru' && c.title_ru ? c.title_ru : c.title_tg}`,
      c.id,
    ));

    const subCatSel = $('docSubCatSelect');
    if (subCatSel) {
      const prev = subCatSel.value;
      subCatSel.replaceChildren(...catOpts.map((o) => o.cloneNode(true)));
      if (cats.some((c) => c.id === prev)) subCatSel.value = prev;
    }

    const tplCatSel = $('docTplCatSelect');
    if (tplCatSel) {
      const prev = tplCatSel.value;
      tplCatSel.replaceChildren(...catOpts.map((o) => o.cloneNode(true)));
      if (cats.some((c) => c.id === prev)) tplCatSel.value = prev;
      syncTplSubcategorySelect();
    }
  }

  function syncTplSubcategorySelect() {
    const lang = getLang();
    const catId = $('docTplCatSelect')?.value || '';
    const subSel = $('docTplSubSelect');
    if (!subSel) return;
    const prev = subSel.value;
    const matching = (catalog.subcategories || []).filter((s) => s.category_id === catId);
    subSel.replaceChildren(...matching.map((s) => new Option(
      lang === 'ru' && s.title_ru ? s.title_ru : s.title_tg,
      s.id,
    )));
    if (matching.some((s) => s.id === prev)) subSel.value = prev;
  }

  function resetCategoryForm() {
    editingCatId = null;
    $('docCatForm')?.reset();
    $('docCatIcon').value = '📁';
    $('docCatSort').value = '100';
    $('docCatActive').checked = true;
    setSelectedPositions('docCatPositionsBox', []);
    $('docCatCancelBtn').hidden = true;
  }

  function resetSubcategoryForm() {
    editingSubId = null;
    $('docSubTitleTg').value = '';
    $('docSubTitleRu').value = '';
    $('docSubSort').value = '100';
    $('docSubActive').checked = true;
    $('docSubCancelBtn').hidden = true;
  }

  function resetTemplateForm() {
    editingTplId = null;
    $('docTplTitleTg').value = '';
    $('docTplTitleRu').value = '';
    $('docTplDescTg').value = '';
    $('docTplLang').value = 'both';
    $('docTplSchoolType').value = 'all';
    $('docTplShift').value = 'all';
    $('docTplEditMode').value = 'full';
    $('docTplStatus').value = 'published';
    $('docTplSort').value = '100';
    $('docTplStrictNative').checked = false;
    $('docTplFileInput').value = '';
    setSelectedPositions('docTplPositionsBox', []);
    $('docTplCancelBtn').hidden = true;
    const ed = ensureWordEditor();
    if (ed) {
      ed.setPageSetup('portrait', DEFAULT_PAGE_MARGINS_MM);
      ed.setHtml('<p style="text-align:center"><strong>{{school.name}}</strong></p><p><br></p>');
    }
  }

  function renderCatalogTree() {
    const host = $('docCatalogTree');
    if (!host) return;
    const lang = getLang();
    const posFilter = $('docCatalogPosFilter')?.value || '';
    const needle = ($('docCatalogSearch')?.value || '').trim().toLowerCase();
    const cats = catalog.categories || [];
    const subs = catalog.subcategories || [];
    const tpls = catalog.templates || [];

    if (!cats.length) {
      host.innerHTML = `<p class="adm-hint">${lang === 'ru' ? 'Категорий пока нет.' : 'Ҳоло категория нест.'}</p>`;
      return;
    }

    const nodes = [];
    for (const cat of cats) {
      const catPos = cat.position_codes || [];
      if (posFilter && !catPos.includes(posFilter)) {
        const hasMatchingTpl = tpls.some((t) => t.category_id === cat.id && (t.position_codes || []).includes(posFilter));
        if (!hasMatchingTpl) continue;
      }

      const catTitle = `${cat.icon || '📁'} ${lang === 'ru' && cat.title_ru ? cat.title_ru : cat.title_tg}`;
      const catMatchesSearch = !needle || `${cat.title_tg} ${cat.title_ru}`.toLowerCase().includes(needle);
      const catSubs = subs.filter((s) => s.category_id === cat.id);

      const det = document.createElement('details');
      det.className = 'adm-tree-node';
      det.open = true;

      const sum = document.createElement('summary');
      const left = document.createElement('span');
      const posNames = catPos.slice(0, 3).map((p) => formatPositionTitle(p, lang)).join(', ')
        + (catPos.length > 3 ? ` +${catPos.length - 3}` : '');
      left.innerHTML = `${escapeHtml(catTitle)} <span class="pill">${escapeHtml(posNames || '—')}</span>`;
      if (!cat.is_active) left.innerHTML += ' <span class="pill warn">off</span>';

      const catBtns = document.createElement('span');
      catBtns.className = 'adm-row';
      catBtns.style.marginTop = '0';
      const editCatBtn = document.createElement('button');
      editCatBtn.type = 'button';
      editCatBtn.className = 'btn alt sm';
      editCatBtn.textContent = '✏️';
      editCatBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editingCatId = cat.id;
        $('docCatTitleTg').value = cat.title_tg || '';
        $('docCatTitleRu').value = cat.title_ru || '';
        $('docCatIcon').value = cat.icon || '📁';
        $('docCatSort').value = String(cat.sort_order ?? 100);
        $('docCatActive').checked = cat.is_active !== false;
        setSelectedPositions('docCatPositionsBox', catPos);
        $('docCatCancelBtn').hidden = false;
        $('docCatForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      const delCatBtn = document.createElement('button');
      delCatBtn.type = 'button';
      delCatBtn.className = 'btn danger sm';
      delCatBtn.textContent = '🗑️';
      delCatBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm(lang === 'ru' ? 'Удалить категорию со всеми подкатегориями и шаблонами?' : 'Категория ва ҳамаи қолабҳои онро нест мекунед?')) return;
        try {
          await client.adminDeleteDocumentCategory(cat.id);
          await refreshCatalog();
          setStatus(lang === 'ru' ? 'Категория удалена' : 'Категория нест шуд');
        } catch (err) {
          setStatus(err.message, 'error');
        }
      });
      catBtns.append(editCatBtn, delCatBtn);
      sum.append(left, catBtns);
      det.appendChild(sum);

      const childrenBox = document.createElement('div');
      childrenBox.className = 'adm-tree-children';

      for (const sub of catSubs) {
        const subTpls = tpls.filter((t) => {
          if (t.subcategory_id !== sub.id) return false;
          if (posFilter && !(t.position_codes || catPos).includes(posFilter)) return false;
          if (needle && !catMatchesSearch && !`${t.title_tg} ${t.title_ru} ${sub.title_tg} ${sub.title_ru}`.toLowerCase().includes(needle)) return false;
          return true;
        });
        if (needle && !catMatchesSearch && !subTpls.length && !`${sub.title_tg} ${sub.title_ru}`.toLowerCase().includes(needle)) {
          continue;
        }

        const subRow = document.createElement('div');
        subRow.className = 'adm-tree-node';
        const subHead = document.createElement('div');
        subHead.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:650;font-size:0.88rem;';
        const subLbl = document.createElement('span');
        subLbl.textContent = `📂 ${lang === 'ru' && sub.title_ru ? sub.title_ru : sub.title_tg}${sub.is_active ? '' : ' (off)'}`;
        const subBtns = document.createElement('span');
        subBtns.className = 'adm-row';
        subBtns.style.marginTop = '0';

        const editSubBtn = document.createElement('button');
        editSubBtn.type = 'button';
        editSubBtn.className = 'btn alt sm';
        editSubBtn.textContent = '✏️';
        editSubBtn.addEventListener('click', () => {
          editingSubId = sub.id;
          $('docSubCatSelect').value = sub.category_id;
          $('docSubTitleTg').value = sub.title_tg || '';
          $('docSubTitleRu').value = sub.title_ru || '';
          $('docSubSort').value = String(sub.sort_order ?? 100);
          $('docSubActive').checked = sub.is_active !== false;
          $('docSubCancelBtn').hidden = false;
          $('docSubForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        const delSubBtn = document.createElement('button');
        delSubBtn.type = 'button';
        delSubBtn.className = 'btn danger sm';
        delSubBtn.textContent = '🗑️';
        delSubBtn.addEventListener('click', async () => {
          if (!window.confirm(lang === 'ru' ? 'Удалить подкатегорию?' : 'Зеркатегорияро нест мекунед?')) return;
          try {
            await client.adminDeleteDocumentSubcategory(sub.id);
            await refreshCatalog();
          } catch (err) {
            setStatus(err.message, 'error');
          }
        });
        subBtns.append(editSubBtn, delSubBtn);
        subHead.append(subLbl, subBtns);
        subRow.appendChild(subHead);

        const tplList = document.createElement('div');
        tplList.className = 'adm-tree-children';
        for (const tpl of subTpls) {
          const leaf = document.createElement('div');
          leaf.className = 'adm-tree-leaf';
          const tTitle = lang === 'ru' && tpl.title_ru ? tpl.title_ru : tpl.title_tg;
          const badges = [
            `<span class="pill">${escapeHtml(tpl.page_orientation === 'landscape' ? 'A4-L' : 'A4-P')}</span>`,
            `<span class="pill">${escapeHtml(tpl.edit_mode)}</span>`,
            tpl.strict_native_only ? '<span class="pill warn">🛡️ App-Only</span>' : '',
            tpl.status !== 'published' ? '<span class="pill warn">draft</span>' : '',
          ].filter(Boolean).join(' ');

          const info = document.createElement('span');
          info.innerHTML = `📄 <strong>${escapeHtml(tTitle)}</strong> (v${tpl.version || 1}) ${badges}`;

          const leafBtns = document.createElement('span');
          leafBtns.className = 'adm-row';
          leafBtns.style.marginTop = '0';

          const editTplBtn = document.createElement('button');
          editTplBtn.type = 'button';
          editTplBtn.className = 'btn alt sm';
          editTplBtn.textContent = '✏️';
          editTplBtn.addEventListener('click', async () => {
            editingTplId = tpl.id;
            $('docTplCatSelect').value = tpl.category_id;
            syncTplSubcategorySelect();
            $('docTplSubSelect').value = tpl.subcategory_id;
            $('docTplTitleTg').value = tpl.title_tg || '';
            $('docTplTitleRu').value = tpl.title_ru || '';
            $('docTplDescTg').value = tpl.description_tg || '';
            $('docTplLang').value = tpl.lang || 'both';
            $('docTplSchoolType').value = tpl.school_type_filter || 'all';
            $('docTplShift').value = tpl.shift_filter || 'all';
            $('docTplEditMode').value = tpl.edit_mode || 'full';
            $('docTplStatus').value = tpl.status || 'published';
            $('docTplSort').value = String(tpl.sort_order ?? 100);
            $('docTplStrictNative').checked = Boolean(tpl.strict_native_only);
            setSelectedPositions('docTplPositionsBox', tpl.position_codes || []);
            $('docTplCancelBtn').hidden = false;

            const ed = ensureWordEditor();
            let html = tpl.content_json?.html || '';
            if (!html && tpl.storage_path) {
              try {
                const res = await client.docStorage({
                  action: 'load_template_blob',
                  template_id: tpl.id,
                  storage_path: tpl.storage_path,
                });
                if (res?.gzip_b64) html = decompressDocPayload(res.gzip_b64).html;
              } catch {}
            }
            if (ed) {
              ed.setPageSetup(tpl.page_orientation || 'portrait', tpl.page_margins_mm || DEFAULT_PAGE_MARGINS_MM);
              ed.setHtml(html || '<p><br></p>');
            }
            $('docTplForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
          });

          const delTplBtn = document.createElement('button');
          delTplBtn.type = 'button';
          delTplBtn.className = 'btn danger sm';
          delTplBtn.textContent = '🗑️';
          delTplBtn.addEventListener('click', async () => {
            if (!window.confirm(lang === 'ru' ? 'Удалить шаблон?' : 'Қолабро нест мекунед?')) return;
            try {
              if (tpl.storage_path) {
                await client.docStorage({ action: 'delete_template_blob', template_id: tpl.id, storage_path: tpl.storage_path }).catch(() => {});
              }
              await client.adminDeleteDocumentTemplate(tpl.id);
              await refreshCatalog();
            } catch (err) {
              setStatus(err.message, 'error');
            }
          });
          leafBtns.append(editTplBtn, delTplBtn);
          leaf.append(info, leafBtns);
          tplList.appendChild(leaf);
        }
        subRow.appendChild(tplList);
        childrenBox.appendChild(subRow);
      }

      det.appendChild(childrenBox);
      nodes.push(det);
    }

    host.replaceChildren(...(nodes.length ? nodes : [
      Object.assign(document.createElement('p'), { className: 'adm-hint', textContent: '—' }),
    ]));
  }

  async function refreshCatalog() {
    if (!client.session?.access_token) return;
    try {
      const res = await client.adminListDocumentCatalog();
      catalog = {
        categories: Array.isArray(res?.categories) ? res.categories : [],
        subcategories: Array.isArray(res?.subcategories) ? res.subcategories : [],
        templates: Array.isArray(res?.templates) ? res.templates : [],
      };
      renderCatalogFilterSelects();
      renderCatalogTree();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  // Quick position pickers for Category
  $('docCatPickSchool')?.addEventListener('click', () => {
    setSelectedPositions('docCatPositionsBox', POSITION_CATALOG.filter((p) => p.group === 'school').map((p) => p.id));
  });
  $('docCatPickMaorif')?.addEventListener('click', () => {
    setSelectedPositions('docCatPositionsBox', POSITION_CATALOG.filter((p) => p.group === 'office').map((p) => p.id));
  });
  $('docCatPickRaesat')?.addEventListener('click', () => {
    setSelectedPositions('docCatPositionsBox', POSITION_CATALOG.filter((p) => p.group === 'raesat').map((p) => p.id));
  });
  $('docCatPickClear')?.addEventListener('click', () => setSelectedPositions('docCatPositionsBox', []));

  $('docCatCancelBtn')?.addEventListener('click', resetCategoryForm);
  $('docSubCancelBtn')?.addEventListener('click', resetSubcategoryForm);
  $('docTplCancelBtn')?.addEventListener('click', resetTemplateForm);
  $('docTplCatSelect')?.addEventListener('change', syncTplSubcategorySelect);
  $('docCatalogPosFilter')?.addEventListener('change', renderCatalogTree);
  $('docCatalogSearch')?.addEventListener('input', renderCatalogTree);
  $('docCatalogRefreshBtn')?.addEventListener('click', refreshCatalog);

  // Import .docx or .txt directly into the inline mini-Word editor
  $('docTplFileInput')?.addEventListener('change', async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      const ed = ensureWordEditor();
      const nameNoExt = file.name.replace(/\.[^.]+$/, '');
      if (!$('docTplTitleTg').value.trim()) $('docTplTitleTg').value = nameNoExt;
      if (file.name.toLowerCase().endsWith('.docx')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const model = parseDocxBytesToDocModel(bytes);
        ed?.setPageSetup(model.pageOrientation, model.pageMarginsMm);
        ed?.setHtml(model.html);
      } else {
        const text = await file.text();
        const model = parsePlainTextToDocModel(text);
        ed?.setPageSetup(model.pageOrientation, model.pageMarginsMm);
        ed?.setHtml(model.html);
      }
      setStatus(getLang() === 'ru' ? 'Файл загружен в редактор' : 'Файл ба редактор ворид шуд');
    } catch (err) {
      setStatus(err?.message || 'DOCX import error', 'error');
    }
  });

  $('docCatForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const posCodes = getSelectedPositions('docCatPositionsBox');
    if (!posCodes.length) {
      setStatus(getLang() === 'ru' ? 'Выберите хотя бы одну должность' : 'Ақаллан як вазифаро интихоб кунед', 'error');
      return;
    }
    try {
      await client.adminUpsertDocumentCategory({
        p_id: editingCatId,
        p_position_codes: posCodes,
        p_title_tg: $('docCatTitleTg').value.trim(),
        p_title_ru: $('docCatTitleRu').value.trim(),
        p_icon: $('docCatIcon').value.trim() || '📁',
        p_sort_order: Number($('docCatSort').value || 100),
        p_is_active: Boolean($('docCatActive').checked),
      });
      resetCategoryForm();
      await refreshCatalog();
      setStatus(getLang() === 'ru' ? 'Категория сохранена' : 'Категория захира шуд');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  });

  $('docSubForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await client.adminUpsertDocumentSubcategory({
        p_id: editingSubId,
        p_category_id: $('docSubCatSelect').value,
        p_title_tg: $('docSubTitleTg').value.trim(),
        p_title_ru: $('docSubTitleRu').value.trim(),
        p_sort_order: Number($('docSubSort').value || 100),
        p_is_active: Boolean($('docSubActive').checked),
      });
      resetSubcategoryForm();
      await refreshCatalog();
      setStatus(getLang() === 'ru' ? 'Подкатегория сохранена' : 'Зеркатегория захира шуд');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  });

  $('docTplForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ed = ensureWordEditor();
    const setup = ed?.getPageSetup() || { pageOrientation: 'portrait', pageMarginsMm: DEFAULT_PAGE_MARGINS_MM };
    const html = ed?.getHtml() || '<p><br></p>';
    const titleTg = $('docTplTitleTg').value.trim();
    const posOverrides = getSelectedPositions('docTplPositionsBox');
    try {
      const tplId = await client.adminUpsertDocumentTemplate({
        p_id: editingTplId,
        p_category_id: $('docTplCatSelect').value,
        p_subcategory_id: $('docTplSubSelect').value,
        p_position_codes: posOverrides,
        p_title_tg: titleTg,
        p_title_ru: $('docTplTitleRu').value.trim(),
        p_description_tg: $('docTplDescTg').value.trim(),
        p_page_orientation: setup.pageOrientation,
        p_page_margins_mm: setup.pageMarginsMm,
        p_lang: $('docTplLang').value,
        p_school_type_filter: $('docTplSchoolType').value,
        p_shift_filter: $('docTplShift').value,
        p_edit_mode: $('docTplEditMode').value,
        p_strict_native_only: Boolean($('docTplStrictNative').checked),
        p_status: $('docTplStatus').value,
        p_sort_order: Number($('docTplSort').value || 100),
        p_storage_path: '',
        p_content_json: { html },
      });

      // Mirror gzipped template to private Supabase Storage bucket
      if (tplId) {
        try {
          const gz = compressDocPayload({
            title: titleTg,
            html,
            pageOrientation: setup.pageOrientation,
            pageMarginsMm: setup.pageMarginsMm,
          });
          const blobRes = await client.docStorage({
            action: 'save_template_blob',
            template_id: tplId,
            version: 1,
            gzip_b64: gz.gzipB64,
          });
          if (blobRes?.storage_path) {
            await client.adminUpsertDocumentTemplate({
              p_id: tplId,
              p_category_id: $('docTplCatSelect').value,
              p_subcategory_id: $('docTplSubSelect').value,
              p_position_codes: posOverrides,
              p_title_tg: titleTg,
              p_title_ru: $('docTplTitleRu').value.trim(),
              p_description_tg: $('docTplDescTg').value.trim(),
              p_page_orientation: setup.pageOrientation,
              p_page_margins_mm: setup.pageMarginsMm,
              p_lang: $('docTplLang').value,
              p_school_type_filter: $('docTplSchoolType').value,
              p_shift_filter: $('docTplShift').value,
              p_edit_mode: $('docTplEditMode').value,
              p_strict_native_only: Boolean($('docTplStrictNative').checked),
              p_status: $('docTplStatus').value,
              p_sort_order: Number($('docTplSort').value || 100),
              p_storage_path: blobRes.storage_path,
              p_content_json: { html },
            });
          }
        } catch {
          // DB copy in content_json ensures template always stays usable
        }
      }

      resetTemplateForm();
      await refreshCatalog();
      setStatus(getLang() === 'ru' ? 'Шаблон сохранён' : 'Қолаб захира шуд');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  });

  renderPositionChecks('docCatPositionsBox', 'cat');
  renderPositionChecks('docTplPositionsBox', 'tpl');
  ensureWordEditor();

  return {
    refresh: refreshCatalog,
    rerenderLabels: () => {
      renderPositionChecks('docCatPositionsBox', 'cat', getSelectedPositions('docCatPositionsBox'));
      renderPositionChecks('docTplPositionsBox', 'tpl', getSelectedPositions('docTplPositionsBox'));
      renderCatalogFilterSelects();
      renderCatalogTree();
    },
  };
}
