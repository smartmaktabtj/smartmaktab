import { createCloudClient } from './cloud-client.mjs';
import { getCloudConfig } from './cloud-config.mjs';
import {
  DEFAULT_PAGE_MARGINS_MM,
  decompressDocPayload,
  escapeHtml,
  renderTemplateWithAutofill,
} from './doc-template-engine.mjs';
import { openDocumentEditorModal } from './doc-word-editor.mjs';

const SIDEBAR_CSS = `
.sm-home-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start}
.sm-home-layout.sm-doc-collapsed{grid-template-columns:54px minmax(0,1fr)}
.sm-home-main{min-width:0;display:flex;flex-direction:column;gap:12px}
.sm-doc-sidebar{background:#fff;border:1px solid var(--line,#d7e6dd);border-radius:16px;padding:12px;position:sticky;top:12px;max-height:calc(100dvh - 104px);overflow-y:auto;display:flex;flex-direction:column;gap:10px}
[data-theme="dark"] .sm-doc-sidebar{background:#182420;border-color:var(--line,#2e453b)}
.sm-home-layout.sm-doc-collapsed .sm-doc-sidebar{padding:10px 6px;align-items:center}
.sm-home-layout.sm-doc-collapsed .sm-doc-sidebar-body{display:none}
.sm-doc-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sm-doc-head h2{margin:0;font-size:15px;font-weight:750;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sm-home-layout.sm-doc-collapsed .sm-doc-head h2{display:none}
.sm-doc-collapse-btn{border:1px solid var(--line,#d7e6dd);background:var(--tint,#e7f4eb);color:var(--brand,#116347);border-radius:8px;width:32px;height:30px;cursor:pointer;font-weight:700;display:grid;place-items:center;flex-shrink:0}
.sm-doc-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.sm-doc-tab{border:1px solid var(--line,#d7e6dd);background:transparent;color:inherit;border-radius:8px;padding:6px 4px;font-size:11.5px;font-weight:700;cursor:pointer;text-align:center}
.sm-doc-tab.active{background:var(--brand,#116347);border-color:var(--brand,#116347);color:#fff}
.sm-doc-search{width:100%;border:1px solid #bcd3c5;border-radius:9px;padding:7px 10px;font-size:13px;background:transparent;color:inherit}
.sm-doc-quota{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 9px;border-radius:9px;background:var(--tint,#e7f4eb);color:var(--ink,#18332a);font-size:11.5px;font-weight:650;flex-wrap:wrap}
[data-theme="dark"] .sm-doc-quota{background:rgba(255,255,255,.06);color:inherit}
.sm-doc-pro-link{border:0;background:var(--brand,#116347);color:#fff;border-radius:6px;padding:3px 7px;font-size:11px;font-weight:700;cursor:pointer}
.sm-doc-cat{border:1px solid var(--line,#d7e6dd);border-radius:10px;padding:6px 8px;margin-bottom:6px}
.sm-doc-cat summary{cursor:pointer;font-weight:720;font-size:13px;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:6px}
.sm-doc-sub{margin:6px 0 2px 6px;padding-left:8px;border-left:2px solid var(--line,#d7e6dd)}
.sm-doc-sub-title{font-size:12px;font-weight:700;color:var(--muted,#4b6259);margin:4px 0}
.sm-doc-file{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:5px 6px;border-radius:8px;margin:2px 0;border:1px solid transparent}
.sm-doc-file:hover{background:var(--tint,#e7f4eb);border-color:var(--line,#d7e6dd)}
[data-theme="dark"] .sm-doc-file:hover{background:rgba(255,255,255,.07)}
.sm-doc-file-open{border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;flex:1;min-width:0;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:5px;padding:2px 0}
.sm-doc-file-open span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sm-doc-mini-btn{border:1px solid var(--line,#d7e6dd);background:transparent;color:inherit;border-radius:6px;width:24px;height:24px;font-size:12px;cursor:pointer;display:inline-grid;place-items:center;flex-shrink:0}
.sm-doc-mini-btn.fav-on{background:#fef3c7;border-color:#f59e0b;color:#b45309}
.sm-doc-folder-row{border:1px solid var(--line,#d7e6dd);border-radius:10px;padding:6px 8px;margin-bottom:6px}
.sm-doc-folder-head{display:flex;align-items:center;justify-content:space-between;gap:4px}
.sm-doc-main-folders{background:#fff;border:1px solid var(--line,#d7e6dd);border-radius:14px;padding:8px 12px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
[data-theme="dark"] .sm-doc-main-folders{background:#1b2a24}
.sm-doc-folder-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:1}
.sm-doc-chip{border:1px solid var(--line,#d7e6dd);background:var(--tint,#e7f4eb);color:var(--brand,#116347);border-radius:999px;padding:5px 11px;font-size:12.5px;font-weight:650;cursor:pointer}
.sm-doc-empty{font-size:12.5px;color:var(--muted,#4b6259);padding:8px 4px;margin:0}
.sm-doc-dialog-backdrop{position:fixed;inset:0;z-index:11500;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px}
.sm-doc-dialog{background:#fff;color:#0f172a;border-radius:14px;padding:18px;max-width:400px;width:100%;box-shadow:0 16px 40px rgba(0,0,0,.22);display:flex;flex-direction:column;gap:12px}
@media(max-width:920px){
  .sm-home-layout{grid-template-columns:1fr}
  .sm-home-layout.sm-doc-collapsed{grid-template-columns:1fr}
  .sm-doc-sidebar{position:static;max-height:none}
}
`;

function ensureSidebarStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('sm-doc-sidebar-styles')) return;
  const s = document.createElement('style');
  s.id = 'sm-doc-sidebar-styles';
  s.textContent = SIDEBAR_CSS;
  (document.head || document.documentElement).appendChild(s);
}

function getTexts(lang = 'tg') {
  if (lang === 'ru') {
    return {
      docsTitle: 'Документы',
      tabCategories: 'Категории',
      tabFavorites: 'Избранное',
      tabFolders: 'Папки',
      searchPlaceholder: 'Поиск документа…',
      createFolder: '+ Создать папку',
      folderPrompt: 'Название новой папки:',
      renamePrompt: 'Новое название папки:',
      deleteFolderConfirm: 'Удалить эту папку и все её файлы?',
      signInHint: 'Войдите в облачный аккаунт, чтобы открывать документы, избранное и личные папки.',
      emptyCats: 'Для этой должности пока нет шаблонов документов.',
      emptyFavs: 'Пока нет избранных документов. Нажмите ★ рядом с файлом.',
      emptyFolders: 'У вас пока нет папок. Создайте первую папку.',
      emptyFolderFiles: 'Папка пуста. Скопируйте сюда документ кнопкой 📁+.',
      quotaLabel: (fU, fL, dU, dL) => `Папки: ${fU}/${fL} · Черновики: ${dU}/${dL}`,
      proBtn: '+10 TJS Pro',
      mainFoldersTitle: '📁 Мои папки и документы',
      copyModalTitle: 'Сохранить копию в папку',
      copyCreateNew: '+ Новая папка и сохранить туда',
      cancel: 'Отмена',
      save: 'Сохранить',
      folderLimitMsg: 'Достигнут лимит (20 папок или 50 сохранённых документов). Подключите Pro-пакет +10 TJS/мес (+20 папок и +50 документов)?',
      openUpgrade: 'Подключить +10 TJS/мес',
    };
  }
  return {
    docsTitle: 'Ҳуҷҷатҳо',
    tabCategories: 'Категорияҳо',
    tabFavorites: 'Интихобшуда',
    tabFolders: 'Папкаҳо',
    searchPlaceholder: 'Ҷустуҷӯи ҳуҷҷат…',
    createFolder: '+ Сохтани папка',
    folderPrompt: 'Номи папкаи нав:',
    renamePrompt: 'Номи нави папка:',
    deleteFolderConfirm: 'Ин папка ва ҳамаи файлҳои даруни онро нест мекунед?',
    signInHint: 'Барои дастрасӣ ба китобхонаи ҳуҷҷатҳо, интихобшудаҳо ва папкаҳои абрӣ ба ҳисоби худ ворид шавед.',
    emptyCats: 'Барои ин вазифа ҳоло қолаби ҳуҷҷат илова нашудааст.',
    emptyFavs: 'Ҳоло ҳуҷҷати интихобшуда нест. Тугмаи ★-ро дар назди файл пахш кунед.',
    emptyFolders: 'Шумо ҳоло папка надоред. Папкаи аввалинро созед.',
    emptyFolderFiles: 'Ин папка холӣ аст. Ҳуҷҷатро бо тугмаи 📁+ ба ин ҷо нусхабардорӣ кунед.',
    quotaLabel: (fU, fL, dU, dL) => `Папкаҳо: ${fU}/${fL} · Лоиҳаҳо: ${dU}/${dL}`,
    proBtn: '+10 смн Pro',
    mainFoldersTitle: '📁 Папкаҳои ман ва ҳуҷҷатҳо',
    copyModalTitle: 'Нусхабардорӣ ба папка',
    copyCreateNew: '+ Папкаи нав созед ва гузоред',
    cancel: 'Бекор кардан',
    save: 'Захира',
    folderLimitMsg: 'Лимит пур шуд (20 папка ё 50 ҳуҷҷати захирашуда). Барои +20 папка ва +50 ҳуҷҷат бастаи Pro (+10 сомонӣ/моҳ)-ро фаъол мекунед?',
    openUpgrade: 'Фаъол кардани +10 сомонӣ',
  };
}

export function setupDocumentSidebar({
  layoutHost,
  sidebarHost,
  homeFolderBarHost,
  cabinetId,
  getSchool,
  persistentStore,
}) {
  ensureSidebarStyles();

  let activeTab = 'categories';
  let searchQuery = '';
  let collapsed = false;
  let activeFolderId = '';
  let library = null;
  let loading = false;
  let loadError = '';

  const getLang = () => (document.documentElement.lang === 'ru' ? 'ru' : 'tg');

  function getCloudSessionAndClient() {
    const cfg = getCloudConfig(persistentStore);
    if (!cfg?.url || !cfg?.publishableKey) return { client: null, hasSession: false };
    const client = createCloudClient({
      config: cfg,
      storage: persistentStore,
      storageKey: 'smartmaktab.cloud.session.v1',
    });
    const hasSession = Boolean(client.session?.access_token);
    return { client, hasSession };
  }

  function resolveCloudOrgId() {
    const s = typeof getSchool === 'function' ? getSchool() : null;
    const candidate = s?.id || persistentStore?.getItem?.('smartmaktab.cloud.last_org.v1') || '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
      ? candidate
      : null;
  }

  function promptStoragePackUpgrade(t) {
    if (window.confirm(t.folderLimitMsg)) {
      document.dispatchEvent(new CustomEvent('sm:open-payment-wizard', {
        detail: { preselectStoragePack: 1 },
      }));
    }
  }

  async function refreshLibrary() {
    const { client, hasSession } = getCloudSessionAndClient();
    if (!client || !hasSession) {
      library = null;
      loadError = '';
      render();
      return;
    }
    loading = true;
    loadError = '';
    render();
    try {
      const orgId = resolveCloudOrgId();
      const res = await client.getPositionDocumentLibrary(cabinetId, orgId);
      library = res && typeof res === 'object' ? res : { categories: [], subcategories: [], templates: [], folders: [], items: [], quota: {} };
    } catch (err) {
      loadError = err?.message || 'load_failed';
    } finally {
      loading = false;
      render();
    }
  }

  async function handleCreateFolder() {
    const lang = getLang();
    const t = getTexts(lang);
    const { client, hasSession } = getCloudSessionAndClient();
    if (!client || !hasSession) {
      window.alert(t.signInHint);
      return null;
    }
    const name = window.prompt(t.folderPrompt);
    if (!name || !name.trim()) return null;
    try {
      const res = await client.createUserDocumentFolder(name.trim());
      if (res?.folder && library) {
        library.folders = [...(library.folders || []), res.folder];
        if (res.quota) library.quota = res.quota;
        activeTab = 'folders';
        activeFolderId = res.folder.id;
        collapsed = false;
        render();
        return res.folder;
      }
      await refreshLibrary();
    } catch (err) {
      if (String(err?.message || '').includes('folder_quota_exceeded')) {
        promptStoragePackUpgrade(t);
      } else {
        window.alert(err?.message || 'Error');
      }
    }
    return null;
  }

  function openCopyToFolderModal(template) {
    const lang = getLang();
    const t = getTexts(lang);
    const { client, hasSession } = getCloudSessionAndClient();
    if (!client || !hasSession) {
      window.alert(t.signInHint);
      return;
    }
    const folders = library?.folders || [];
    const backdrop = document.createElement('div');
    backdrop.className = 'sm-doc-dialog-backdrop';
    const dlg = document.createElement('div');
    dlg.className = 'sm-doc-dialog';
    const titleStr = lang === 'ru' && template.title_ru ? template.title_ru : template.title_tg;
    dlg.innerHTML = `
      <h3 style="margin:0;font-size:16px">${escapeHtml(t.copyModalTitle)}</h3>
      <p style="margin:0;font-size:13px;color:#475569">${escapeHtml(titleStr)}</p>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto" data-folder-list></div>
      <button type="button" class="button alt" data-new-folder>${escapeHtml(t.copyCreateNew)}</button>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button type="button" class="button alt" data-cancel>${escapeHtml(t.cancel)}</button>
      </div>
    `;
    const listBox = dlg.querySelector('[data-folder-list]');
    for (const f of folders) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'button alt';
      b.style.justifyContent = 'flex-start';
      b.textContent = `📁 ${f.name}`;
      b.addEventListener('click', async () => {
        try {
          await client.copyTemplateToUserFolder(template.id, f.id, '');
          backdrop.remove();
          activeTab = 'folders';
          activeFolderId = f.id;
          await refreshLibrary();
        } catch (err) {
          window.alert(err?.message || 'Copy failed');
        }
      });
      listBox.appendChild(b);
    }
    dlg.querySelector('[data-new-folder]')?.addEventListener('click', async () => {
      const created = await handleCreateFolder();
      if (created?.id) {
        await client.copyTemplateToUserFolder(template.id, created.id, '');
        backdrop.remove();
        await refreshLibrary();
      }
    });
    dlg.querySelector('[data-cancel]')?.addEventListener('click', () => backdrop.remove());
    backdrop.appendChild(dlg);
    document.body.appendChild(backdrop);
  }

  async function openDocumentTemplate(template, existingItem = null) {
    const lang = getLang();
    const t = getTexts(lang);
    const { client } = getCloudSessionAndClient();
    const orgId = resolveCloudOrgId();
    const title = existingItem?.custom_title
      || (lang === 'ru' && template.title_ru ? template.title_ru : template.title_tg)
      || 'SmartMaktab';

    // 1. Load source content (user draft if exists, else clean autofilled template)
    let initialHtml = '';
    let pageOrientation = template.page_orientation || 'portrait';
    let pageMarginsMm = template.page_margins_mm || DEFAULT_PAGE_MARGINS_MM;

    async function loadFreshTemplateHtml() {
      let rawHtml = template.content_json?.html || '';
      if (!rawHtml && template.storage_path && client) {
        try {
          const blob = await client.docStorage({
            action: 'load_template_blob',
            template_id: template.id,
            storage_path: template.storage_path,
          });
          if (blob?.gzip_b64) {
            const parsed = decompressDocPayload(blob.gzip_b64);
            rawHtml = parsed.html;
          }
        } catch {
          rawHtml = '';
        }
      }
      return renderTemplateWithAutofill(rawHtml || '<p><br></p>', library?.autofill || {}, {
        lang,
        editMode: template.edit_mode || 'full',
      });
    }

    if (existingItem?.has_draft) {
      let loadedDraft = null;
      if (existingItem.draft_storage_path && client) {
        try {
          const blob = await client.docStorage({
            action: 'load_draft',
            storage_path: existingItem.draft_storage_path,
          });
          if (blob?.gzip_b64) loadedDraft = decompressDocPayload(blob.gzip_b64);
        } catch {
          loadedDraft = null;
        }
      }
      if (!loadedDraft && existingItem.draft_gzip_b64) {
        try {
          loadedDraft = decompressDocPayload(existingItem.draft_gzip_b64);
        } catch {
          loadedDraft = null;
        }
      }
      if (loadedDraft) {
        initialHtml = loadedDraft.html;
        pageOrientation = loadedDraft.pageOrientation || pageOrientation;
        pageMarginsMm = loadedDraft.pageMarginsMm || pageMarginsMm;
      }
    }
    if (!initialHtml) {
      initialHtml = await loadFreshTemplateHtml();
    }

    const userFull = library?.autofill?.user?.full_name || 'SmartMaktab';
    const orgName = library?.autofill?.organization?.name || '';
    const today = new Date().toLocaleDateString('ru-RU');
    const watermarkText = [userFull, orgName, today].filter(Boolean).join(' · ');

    openDocumentEditorModal({
      lang,
      title,
      initialHtml,
      pageOrientation,
      pageMarginsMm,
      editMode: template.edit_mode || 'full',
      strictNativeOnly: Boolean(template.strict_native_only),
      hasDraft: Boolean(existingItem?.has_draft),
      quota: library?.quota || null,
      watermarkText,
      onSave: client ? async ({ gzipB64, compressedBytes }) => {
        const folderId = existingItem?.folder_id || null;
        let saved = null;
        try {
          const fnRes = await client.docStorage({
            action: 'save_draft',
            template_id: template.id,
            folder_id: folderId,
            custom_title: existingItem?.custom_title || '',
            gzip_b64: gzipB64,
            size_bytes: compressedBytes,
          });
          if (fnRes?.ok || fnRes?.storage_path) saved = fnRes;
        } catch (err) {
          if (String(err?.message || '').includes('draft_quota_exceeded')) {
            promptStoragePackUpgrade(t);
            throw err;
          }
          // Fallback to direct RPC if storage Edge Function is unavailable in offline/dev sandbox
          saved = await client.saveUserDocumentDraft({
            p_template_id: template.id,
            p_folder_id: folderId,
            p_custom_title: existingItem?.custom_title || '',
            p_draft_storage_path: '',
            p_draft_gzip_b64: gzipB64,
            p_size_bytes: compressedBytes,
          });
        }
        await refreshLibrary();
        return saved ? { ...saved, quota: saved.quota || library?.quota } : { quota: library?.quota };
      } : null,
      onReset: (client && existingItem?.id) ? async () => {
        try {
          await client.docStorage({
            action: 'delete_draft',
            item_id: existingItem.id,
            storage_path: existingItem.draft_storage_path || '',
          });
        } catch {
          await client.resetUserDocumentDraft(existingItem.id);
        }
        await refreshLibrary();
        return loadFreshTemplateHtml();
      } : null,
      onPrint: client ? async ({ platform, title: pTitle }) => {
        await client.logDocumentPrint({
          p_template_id: template.id,
          p_org_id: orgId,
          p_folder_item_id: existingItem?.id || null,
          p_title: pTitle,
          p_platform: platform,
        });
      } : null,
    });
  }

  function renderFileRow(tpl, item = null, insideFolder = false) {
    const lang = getLang();
    const title = item?.custom_title || (lang === 'ru' && tpl.title_ru ? tpl.title_ru : tpl.title_tg);
    const allItems = library?.items || [];
    const rootItem = item && !item.folder_id
      ? item
      : allItems.find((x) => x.template_id === tpl.id && !x.folder_id) || null;
    const isFav = Boolean(rootItem?.is_favorite);
    const hasDraft = Boolean((item || rootItem)?.has_draft);

    const row = document.createElement('div');
    row.className = 'sm-doc-file';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'sm-doc-file-open';
    const icon = tpl.strict_native_only ? '🛡️' : (hasDraft ? '✏️' : '📄');
    openBtn.innerHTML = `<span>${icon} ${escapeHtml(title)}</span>`;
    openBtn.title = title;
    openBtn.addEventListener('click', () => openDocumentTemplate(tpl, item || rootItem));
    row.appendChild(openBtn);

    if (!insideFolder) {
      const favBtn = document.createElement('button');
      favBtn.type = 'button';
      favBtn.className = `sm-doc-mini-btn${isFav ? ' fav-on' : ''}`;
      favBtn.textContent = isFav ? '★' : '☆';
      favBtn.title = '★';
      favBtn.addEventListener('click', async () => {
        const { client } = getCloudSessionAndClient();
        if (!client) return;
        await client.toggleUserDocumentFavorite(tpl.id, !isFav);
        await refreshLibrary();
      });
      row.appendChild(favBtn);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'sm-doc-mini-btn';
      copyBtn.textContent = '📁+';
      copyBtn.title = '+';
      copyBtn.addEventListener('click', () => openCopyToFolderModal(tpl));
      row.appendChild(copyBtn);
    } else if (item?.id) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'sm-doc-mini-btn';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async () => {
        const { client } = getCloudSessionAndClient();
        if (!client) return;
        await client.removeUserDocumentItem(item.id);
        await refreshLibrary();
      });
      row.appendChild(delBtn);
    }
    return row;
  }

  function renderMainFolderBar(t) {
    if (!homeFolderBarHost) return;
    homeFolderBarHost.replaceChildren();
    const { hasSession } = getCloudSessionAndClient();
    if (!hasSession) {
      homeFolderBarHost.hidden = true;
      return;
    }
    homeFolderBarHost.hidden = false;
    const bar = document.createElement('section');
    bar.className = 'sm-doc-main-folders no-print';
    bar.id = 'smMainFoldersBar';

    const left = document.createElement('div');
    left.className = 'sm-doc-folder-chips';
    const titleEl = document.createElement('strong');
    titleEl.style.fontSize = '13.5px';
    titleEl.textContent = t.mainFoldersTitle;
    left.appendChild(titleEl);

    if (hasSession && library?.folders?.length) {
      for (const f of library.folders.slice(0, 6)) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sm-doc-chip';
        chip.textContent = `📁 ${f.name}`;
        chip.addEventListener('click', () => {
          collapsed = false;
          activeTab = 'folders';
          activeFolderId = f.id;
          render();
          sidebarHost?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        });
        left.appendChild(chip);
      }
    }

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'button alt';
    createBtn.id = 'smMainCreateFolderBtn';
    createBtn.textContent = t.createFolder;
    createBtn.addEventListener('click', handleCreateFolder);

    bar.append(left, createBtn);
    homeFolderBarHost.appendChild(bar);
  }

  function render() {
    if (!sidebarHost) return;
    const lang = getLang();
    const t = getTexts(lang);
    layoutHost?.classList.toggle('sm-doc-collapsed', collapsed);
    renderMainFolderBar(t);

    sidebarHost.replaceChildren();
    const head = document.createElement('div');
    head.className = 'sm-doc-head';
    const h2 = document.createElement('h2');
    h2.textContent = `📚 ${t.docsTitle}`;
    const cBtn = document.createElement('button');
    cBtn.type = 'button';
    cBtn.className = 'sm-doc-collapse-btn';
    cBtn.textContent = collapsed ? '📂' : '◀';
    cBtn.title = t.docsTitle;
    cBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      render();
    });
    head.append(h2, cBtn);
    sidebarHost.appendChild(head);

    const body = document.createElement('div');
    body.className = 'sm-doc-sidebar-body';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '8px';

    const { hasSession } = getCloudSessionAndClient();
    if (!hasSession) {
      const hint = document.createElement('p');
      hint.className = 'sm-doc-empty';
      hint.textContent = t.signInHint;
      body.appendChild(hint);
      sidebarHost.appendChild(body);
      return;
    }

    if (loading && !library) {
      const p = document.createElement('p');
      p.className = 'sm-doc-empty';
      p.textContent = '…';
      body.appendChild(p);
      sidebarHost.appendChild(body);
      return;
    }

    const q = library?.quota || { folders_used: 0, folders_limit: 20, drafts_used: 0, drafts_limit: 50 };
    const quotaBox = document.createElement('div');
    quotaBox.className = 'sm-doc-quota';
    quotaBox.innerHTML = `<span>${escapeHtml(t.quotaLabel(q.folders_used ?? 0, q.folders_limit ?? 20, q.drafts_used ?? 0, q.drafts_limit ?? 50))}</span>`;
    const proBtn = document.createElement('button');
    proBtn.type = 'button';
    proBtn.className = 'sm-doc-pro-link';
    proBtn.textContent = t.proBtn;
    proBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('sm:open-payment-wizard', { detail: { preselectStoragePack: 1 } }));
    });
    quotaBox.appendChild(proBtn);
    body.appendChild(quotaBox);

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'sm-doc-tabs';
    for (const [id, lbl] of [['categories', t.tabCategories], ['favorites', t.tabFavorites], ['folders', t.tabFolders]]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `sm-doc-tab${activeTab === id ? ' active' : ''}`;
      b.textContent = lbl;
      b.addEventListener('click', () => { activeTab = id; render(); });
      tabs.appendChild(b);
    }
    body.appendChild(tabs);

    // Search
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'sm-doc-search';
    search.placeholder = t.searchPlaceholder;
    search.value = searchQuery;
    search.addEventListener('input', () => {
      searchQuery = search.value;
      renderContentPane(contentHost, t, lang);
    });
    body.appendChild(search);

    const contentHost = document.createElement('div');
    renderContentPane(contentHost, t, lang);
    body.appendChild(contentHost);
    sidebarHost.appendChild(body);
  }

  function renderContentPane(host, t, lang) {
    host.replaceChildren();
    if (loadError) {
      const err = document.createElement('p');
      err.className = 'sm-doc-empty';
      err.textContent = loadError;
      host.appendChild(err);
      return;
    }

    const cats = library?.categories || [];
    const subs = library?.subcategories || [];
    const tpls = library?.templates || [];
    const folders = library?.folders || [];
    const items = library?.items || [];
    const tplById = new Map(tpls.map((x) => [x.id, x]));
    const needle = searchQuery.trim().toLowerCase();
    const matchesSearch = (tpl, extraTitle = '') => {
      if (!needle) return true;
      const hay = `${tpl.title_tg || ''} ${tpl.title_ru || ''} ${tpl.description_tg || ''} ${extraTitle}`.toLowerCase();
      return hay.includes(needle);
    };

    if (activeTab === 'categories') {
      if (!cats.length || !tpls.length) {
        const p = document.createElement('p');
        p.className = 'sm-doc-empty';
        p.textContent = t.emptyCats;
        host.appendChild(p);
        return;
      }
      let shown = 0;
      for (const cat of cats) {
        const catSubs = subs.filter((s) => s.category_id === cat.id);
        const subBlocks = [];
        for (const sub of catSubs) {
          const files = tpls.filter((x) => x.subcategory_id === sub.id && matchesSearch(x));
          if (!files.length) continue;
          const subDiv = document.createElement('div');
          subDiv.className = 'sm-doc-sub';
          const st = document.createElement('div');
          st.className = 'sm-doc-sub-title';
          st.textContent = lang === 'ru' && sub.title_ru ? sub.title_ru : sub.title_tg;
          subDiv.appendChild(st);
          for (const f of files) {
            subDiv.appendChild(renderFileRow(f, null, false));
          }
          subBlocks.push(subDiv);
        }
        if (!subBlocks.length) continue;
        shown += 1;
        const det = document.createElement('details');
        det.className = 'sm-doc-cat';
        det.open = Boolean(needle) || cats.length <= 2;
        const sum = document.createElement('summary');
        const cTitle = lang === 'ru' && cat.title_ru ? cat.title_ru : cat.title_tg;
        sum.textContent = `${cat.icon || '📁'} ${cTitle}`;
        det.appendChild(sum);
        for (const sb of subBlocks) det.appendChild(sb);
        host.appendChild(det);
      }
      if (!shown) {
        const p = document.createElement('p');
        p.className = 'sm-doc-empty';
        p.textContent = t.emptyCats;
        host.appendChild(p);
      }
      return;
    }

    if (activeTab === 'favorites') {
      const favItems = items.filter((i) => !i.folder_id && i.is_favorite);
      const rows = [];
      for (const it of favItems) {
        const tpl = tplById.get(it.template_id);
        if (tpl && matchesSearch(tpl, it.custom_title)) rows.push(renderFileRow(tpl, it, false));
      }
      if (!rows.length) {
        const p = document.createElement('p');
        p.className = 'sm-doc-empty';
        p.textContent = t.emptyFavs;
        host.appendChild(p);
        return;
      }
      for (const r of rows) host.appendChild(r);
      return;
    }

    // Folders tab
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'button';
    createBtn.id = 'smSidebarCreateFolderBtn';
    createBtn.style.width = '100%';
    createBtn.style.justifyContent = 'center';
    createBtn.style.marginBottom = '8px';
    createBtn.textContent = t.createFolder;
    createBtn.addEventListener('click', handleCreateFolder);
    host.appendChild(createBtn);

    if (!folders.length) {
      const p = document.createElement('p');
      p.className = 'sm-doc-empty';
      p.textContent = t.emptyFolders;
      host.appendChild(p);
      return;
    }

    const { client } = getCloudSessionAndClient();
    for (const f of folders) {
      const fBox = document.createElement('details');
      fBox.className = 'sm-doc-folder-row';
      fBox.open = f.id === activeFolderId || Boolean(needle) || folders.length === 1;
      const sum = document.createElement('summary');
      sum.style.listStyle = 'none';
      sum.style.cursor = 'pointer';
      const fHead = document.createElement('div');
      fHead.className = 'sm-doc-folder-head';
      const fName = document.createElement('span');
      fName.style.fontWeight = '700';
      fName.style.fontSize = '13px';
      fName.textContent = `📁 ${f.name}`;

      const fBtns = document.createElement('div');
      fBtns.style.display = 'flex';
      fBtns.style.gap = '4px';
      const renBtn = document.createElement('button');
      renBtn.type = 'button';
      renBtn.className = 'sm-doc-mini-btn';
      renBtn.textContent = '✏️';
      renBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = window.prompt(t.renamePrompt, f.name);
        if (!next || !next.trim() || !client) return;
        await client.renameUserDocumentFolder(f.id, next.trim());
        await refreshLibrary();
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'sm-doc-mini-btn';
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm(t.deleteFolderConfirm) || !client) return;
        await client.deleteUserDocumentFolder(f.id);
        await refreshLibrary();
      });
      fBtns.append(renBtn, delBtn);
      fHead.append(fName, fBtns);
      sum.appendChild(fHead);
      fBox.appendChild(sum);

      const fItems = items.filter((i) => i.folder_id === f.id);
      let renderedCount = 0;
      for (const it of fItems) {
        const tpl = tplById.get(it.template_id);
        if (tpl && matchesSearch(tpl, it.custom_title)) {
          fBox.appendChild(renderFileRow(tpl, it, true));
          renderedCount += 1;
        }
      }
      if (!renderedCount && !needle) {
        const ep = document.createElement('p');
        ep.className = 'sm-doc-empty';
        ep.textContent = t.emptyFolderFiles;
        fBox.appendChild(ep);
      }
      host.appendChild(fBox);
    }
  }

  document.addEventListener('cabinet:language', () => render());
  document.addEventListener('cabinet:school', () => refreshLibrary());
  document.addEventListener('sm:cloud-context-changed', () => refreshLibrary());

  refreshLibrary();
  return { refresh: refreshLibrary, render };
}
