import { createCloudClient } from './cloud-client.mjs';
import { getCloudConfig } from './cloud-config.mjs';
import {
  DEFAULT_PAGE_MARGINS_MM,
  decompressDocPayload,
  escapeHtml,
  renderTemplateWithAutofill,
} from './doc-template-engine.mjs';
import { openDocumentEditorModal, openPdfDocumentModal } from './doc-word-editor.mjs';
import { smAlert, smConfirm, smPrompt } from './sm-dialog.mjs';

const SIDEBAR_CSS = `
.sm-home-layout{display:grid;grid-template-columns:clamp(325px,26.5vw,370px) minmax(0,1fr);gap:16px;align-items:start}
.sm-home-layout.sm-doc-collapsed{grid-template-columns:56px minmax(0,1fr)}
.sm-home-main{min-width:0;display:flex;flex-direction:column;gap:10px}
.sm-doc-sidebar{background:#fff;border:1px solid var(--line,#d7e6dd);border-radius:16px;padding:14px;position:sticky;top:12px;max-height:calc(100dvh - 104px);overflow-y:auto;display:flex;flex-direction:column;gap:11px;box-shadow:0 2px 10px rgba(17,99,71,.05)}
[data-theme="dark"] .sm-doc-sidebar{background:#182420;border-color:var(--line,#2e453b)}
.sm-home-layout.sm-doc-collapsed .sm-doc-sidebar{padding:10px 6px;align-items:center}
.sm-home-layout.sm-doc-collapsed .sm-doc-sidebar-body{display:none}
.sm-doc-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sm-doc-head h2{margin:0;font-size:15.5px;font-weight:750;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sm-home-layout.sm-doc-collapsed .sm-doc-head h2{display:none}
.sm-doc-collapse-btn{border:1px solid var(--line,#d7e6dd);background:var(--tint,#e7f4eb);color:var(--brand,#116347);border-radius:8px;width:32px;height:30px;cursor:pointer;font-weight:700;display:grid;place-items:center;flex-shrink:0}
.sm-doc-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:3px;border-radius:10px;background:#f1f5f9;border:1px solid var(--line,#d7e6dd)}
[data-theme="dark"] .sm-doc-tabs{background:rgba(255,255,255,.05)}
.sm-doc-tab{border:0;background:transparent;color:inherit;border-radius:7px;padding:7px 4px;font-size:12px;font-weight:700;cursor:pointer;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .12s,color .12s}
.sm-doc-tab.active{background:var(--brand,#116347);color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.sm-doc-search{width:100%;border:1px solid #bcd3c5;border-radius:10px;padding:8px 11px;font-size:13px;background:transparent;color:inherit;box-sizing:border-box}
.sm-doc-quota{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 9px;border-radius:10px;background:var(--tint,#e7f4eb);color:var(--ink,#18332a);font-size:11.5px;font-weight:650;flex-wrap:nowrap}
[data-theme="dark"] .sm-doc-quota{background:rgba(255,255,255,.06);color:inherit}
.sm-doc-quota span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sm-doc-pro-link{border:0;background:var(--brand,#116347);color:#fff;border-radius:7px;padding:4px 9px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0}
.sm-doc-cat{border:1px solid var(--line,#d7e6dd);border-radius:11px;padding:7px 9px;margin-bottom:7px;background:rgba(255,255,255,.55)}
[data-theme="dark"] .sm-doc-cat{background:rgba(255,255,255,.02)}
.sm-doc-cat>summary{cursor:pointer;font-weight:750;font-size:13.5px;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 2px;user-select:none}
.sm-doc-cat>summary::-webkit-details-marker{display:none}
.sm-doc-cat>summary::after{content:'▸';font-size:12px;opacity:.7;transition:transform .14s;flex-shrink:0}
.sm-doc-cat[open]>summary::after{content:'▾';opacity:1}
.sm-doc-sub{margin:6px 0 3px 4px;padding-left:9px;border-left:2px solid var(--line,#d7e6dd)}
.sm-doc-sub-details{margin:5px 0}
.sm-doc-sub-details>summary{cursor:pointer;font-size:12.5px;font-weight:700;color:var(--muted,#4b6259);list-style:none;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 6px;border-radius:7px;user-select:none}
.sm-doc-sub-details>summary::-webkit-details-marker{display:none}
.sm-doc-sub-details>summary:hover{background:var(--tint,#e7f4eb);color:var(--brand,#116347)}
.sm-doc-sub-details>summary::after{content:'▸';font-size:11px;opacity:.7;flex-shrink:0}
.sm-doc-sub-details[open]>summary::after{content:'▾';opacity:1}
.sm-doc-sub-list{padding-top:3px}
.sm-doc-file{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 6px;border-radius:9px;margin:2px 0;border:1px solid transparent;transition:background .12s,border-color .12s}
.sm-doc-file:hover{background:var(--tint,#e7f4eb);border-color:var(--line,#d7e6dd)}
[data-theme="dark"] .sm-doc-file:hover{background:rgba(255,255,255,.07)}
.sm-doc-file-open{border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;flex:1;min-width:0;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;padding:2px 0;line-height:1.3}
.sm-doc-file-open span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sm-doc-fmt-tag{font-size:10px;font-weight:750;padding:1px 5px;border-radius:4px;background:#fee2e2;color:#991b1b;flex-shrink:0;text-transform:uppercase}
[data-theme="dark"] .sm-doc-fmt-tag{background:#451a1a;color:#fca5a5}
.sm-doc-file-actions{display:inline-flex;align-items:center;gap:4px;flex-shrink:0}
.sm-doc-mini-btn{border:1px solid var(--line,#d7e6dd);background:transparent;color:inherit;border-radius:7px;min-width:28px;height:28px;padding:0 5px;font-size:12.5px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;white-space:nowrap}
.sm-doc-mini-btn:hover{background:rgba(17,99,71,.1);border-color:var(--brand,#116347)}
.sm-doc-mini-btn.fav-on{background:#fef3c7;border-color:#f59e0b;color:#b45309}
.sm-doc-folder-row{border:1px solid var(--line,#d7e6dd);border-radius:11px;padding:7px 9px;margin-bottom:7px}
.sm-doc-folder-row>summary::-webkit-details-marker{display:none}
.sm-doc-folder-head{display:flex;align-items:center;justify-content:space-between;gap:6px}
.sm-doc-main-folders{background:#fff;border:1px solid var(--line,#d7e6dd);border-radius:14px;padding:7px 12px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
[data-theme="dark"] .sm-doc-main-folders{background:#1b2a24}
.sm-doc-folder-chips{display:flex;flex-wrap:wrap;align-items:center;gap:7px;flex:1}
.sm-doc-chip{border:1px solid var(--line,#d7e6dd);background:var(--tint,#e7f4eb);color:var(--brand,#116347);border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:650;cursor:pointer}
.sm-doc-empty{font-size:12.5px;color:var(--muted,#4b6259);padding:8px 4px;margin:0}
.sm-doc-dialog-backdrop{position:fixed;inset:0;z-index:11500;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px}
.sm-doc-dialog{background:#fff;color:#0f172a;border-radius:16px;padding:20px;max-width:420px;width:100%;box-shadow:0 20px 48px rgba(0,0,0,.26);display:flex;flex-direction:column;gap:12px}
[data-theme="dark"] .sm-doc-dialog{background:#1e293b;color:#f1f5f9;border:1px solid #334155}
@media(max-width:980px){
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

function decodeBase64Bytes(b64) {
  const clean = String(b64 || '').replace(/\s+/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
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
      folderTitle: 'Новая папка',
      folderPrompt: 'Введите название новой папки:',
      folderPlaceholder: 'Например: Планы уроков',
      renameTitle: 'Переименовать папку',
      renamePrompt: 'Новое название папки:',
      deleteFolderTitle: 'Удаление папки',
      deleteFolderConfirm: 'Удалить эту папку и все её файлы?',
      signInTitle: 'Требуется вход в систему',
      signInHint: 'Войдите в аккаунт системы, чтобы открывать документы, избранное и личные папки.',
      emptyCats: 'Для этой должности пока нет шаблонов документов.',
      emptyFavs: 'Пока нет избранных документов. Нажмите ★ рядом с файлом.',
      emptyFolders: 'У вас пока нет папок. Создайте первую папку.',
      emptyFolderFiles: 'Папка пуста. Скопируйте сюда документ кнопкой 📁+.',
      quotaLabel: (fU, fL, dU, dL) => `Папки: ${fU}/${fL} · Файлы: ${dU}/${dL}`,
      proBtn: '+10 TJS Pro',
      mainFoldersTitle: '📁 Мои папки и документы',
      copyModalTitle: 'Сохранить копию в папку',
      copyCreateNew: '+ Новая папка и сохранить туда',
      cancel: 'Отмена',
      save: 'Сохранить',
      confirmDelete: 'Удалить',
      folderLimitTitle: 'Расширение места в системе',
      folderLimitMsg: 'Достигнут лимит (20 папок или 50 сохранённых документов). Подключить Pro-пакет +10 TJS/мес (+20 папок и +50 документов)?',
      openUpgrade: 'Подключить +10 TJS/мес',
      errorTitle: 'Ошибка',
    };
  }
  return {
    docsTitle: 'Ҳуҷҷатҳо',
    tabCategories: 'Категорияҳо',
    tabFavorites: 'Интихобшуда',
    tabFolders: 'Папкаҳо',
    searchPlaceholder: 'Ҷустуҷӯи ҳуҷҷат…',
    createFolder: '+ Сохтани папка',
    folderTitle: 'Папкаи нав',
    folderPrompt: 'Номи папкаи навро нависед:',
    folderPlaceholder: 'Масалан: Нақшаҳои дарсӣ',
    renameTitle: 'Тағйири номи папка',
    renamePrompt: 'Номи нави папка:',
    deleteFolderTitle: 'Нест кардани папка',
    deleteFolderConfirm: 'Ин папка ва ҳамаи файлҳои даруни онро нест мекунед?',
    signInTitle: 'Вуруд ба система зарур аст',
    signInHint: 'Барои дастрасӣ ба китобхонаи ҳуҷҷатҳо, интихобшудаҳо ва папкаҳои система ба ҳисоби худ ворид шавед.',
    emptyCats: 'Барои ин вазифа ҳоло қолаби ҳуҷҷат илова нашудааст.',
    emptyFavs: 'Ҳоло ҳуҷҷати интихобшуда нест. Тугмаи ★-ро дар назди файл пахш кунед.',
    emptyFolders: 'Шумо ҳоло папка надоред. Папкаи аввалинро созед.',
    emptyFolderFiles: 'Ин папка холӣ аст. Ҳуҷҷатро бо тугмаи 📁+ ба ин ҷо нусхабардорӣ кунед.',
    quotaLabel: (fU, fL, dU, dL) => `Папка: ${fU}/${fL} · Лоиҳа: ${dU}/${dL}`,
    proBtn: '+10 смн Pro',
    mainFoldersTitle: '📁 Папкаҳои ман ва ҳуҷҷатҳо',
    copyModalTitle: 'Нусхабардорӣ ба папка',
    copyCreateNew: '+ Папкаи нав созед ва гузоред',
    cancel: 'Бекор кардан',
    save: 'Захира',
    confirmDelete: 'Нест кардан',
    folderLimitTitle: 'Васеъ кардани ҷой дар система',
    folderLimitMsg: 'Лимит пур шуд (20 папка ё 50 ҳуҷҷати захирашуда). Барои +20 папка ва +50 ҳуҷҷат бастаи Pro (+10 сомонӣ/моҳ)-ро фаъол мекунед?',
    openUpgrade: 'Фаъол кардани +10 сомонӣ',
    errorTitle: 'Хато',
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
  const openCategoryState = new Map();
  const openSubcategoryState = new Map();

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

  async function promptStoragePackUpgrade(t) {
    const ok = await smConfirm({
      title: t.folderLimitTitle,
      message: t.folderLimitMsg,
      confirmLabel: t.openUpgrade,
      cancelLabel: t.cancel,
    });
    if (ok) {
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
      await smAlert({ title: t.signInTitle, message: t.signInHint });
      return null;
    }
    const name = await smPrompt({
      title: t.folderTitle,
      label: t.folderPrompt,
      placeholder: t.folderPlaceholder,
      confirmLabel: t.save,
      cancelLabel: t.cancel,
      maxLength: 80,
    });
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
        await promptStoragePackUpgrade(t);
      } else {
        await smAlert({ title: t.errorTitle, message: err?.message || 'Error' });
      }
    }
    return null;
  }

  async function openCopyToFolderModal(template) {
    const lang = getLang();
    const t = getTexts(lang);
    const { client, hasSession } = getCloudSessionAndClient();
    if (!client || !hasSession) {
      await smAlert({ title: t.signInTitle, message: t.signInHint });
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
      <p style="margin:0;font-size:13px;opacity:.78">${escapeHtml(titleStr)}</p>
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
          await smAlert({ title: t.errorTitle, message: err?.message || 'Copy failed' });
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
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
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

    // PDF templates and scanned PDFs open in strictly read-only & printable viewer
    if (template.doc_format === 'pdf' || (!template.storage_path && !template.content_json?.html && template.pdf_storage_path)) {
      await openPdfDocumentModal({
        title,
        strictNativeOnly: Boolean(template.strict_native_only),
        loadPdfBytes: async () => {
          if (!client) throw new Error(t.signInHint);
          const res = await client.docStorage({
            action: 'load_template_pdf',
            template_id: template.id,
            pdf_storage_path: template.pdf_storage_path || '',
          });
          if (!res?.pdf_b64) throw new Error(res?.error || 'PDF not found');
          return decodeBase64Bytes(res.pdf_b64);
        },
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
      return;
    }

    // Word document templates open in MS Word-style editor
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

    openDocumentEditorModal({
      title,
      initialHtml,
      pageOrientation,
      pageMarginsMm,
      editMode: template.edit_mode || 'full',
      strictNativeOnly: Boolean(template.strict_native_only),
      hasDraft: Boolean(existingItem?.has_draft),
      quota: library?.quota || null,
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
            await promptStoragePackUpgrade(t);
            throw err;
          }
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
    const isPdf = tpl.doc_format === 'pdf';

    const row = document.createElement('div');
    row.className = 'sm-doc-file';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'sm-doc-file-open';
    const icon = tpl.strict_native_only ? '🛡️' : (isPdf ? '📕' : (hasDraft ? '✏️' : '📄'));
    openBtn.innerHTML = `<span>${icon} ${escapeHtml(title)}</span>${isPdf ? '<span class="sm-doc-fmt-tag">PDF</span>' : ''}`;
    openBtn.title = title;
    openBtn.addEventListener('click', () => openDocumentTemplate(tpl, item || rootItem));
    row.appendChild(openBtn);

    const actions = document.createElement('div');
    actions.className = 'sm-doc-file-actions';

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
      actions.appendChild(favBtn);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'sm-doc-mini-btn';
      copyBtn.textContent = '📁+';
      copyBtn.title = '+';
      copyBtn.addEventListener('click', () => openCopyToFolderModal(tpl));
      actions.appendChild(copyBtn);
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
      actions.appendChild(delBtn);
    }
    row.appendChild(actions);
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
    body.style.gap = '9px';

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

          const subDet = document.createElement('details');
          subDet.className = 'sm-doc-sub-details';
          const defaultSubOpen = Boolean(needle) || catSubs.length <= 2;
          subDet.open = needle ? true : (openSubcategoryState.has(sub.id) ? openSubcategoryState.get(sub.id) : defaultSubOpen);
          subDet.addEventListener('toggle', () => {
            if (!needle) openSubcategoryState.set(sub.id, subDet.open);
          });

          const subSum = document.createElement('summary');
          subSum.className = 'sm-doc-sub-summary';
          const sTitle = lang === 'ru' && sub.title_ru ? sub.title_ru : sub.title_tg;
          subSum.textContent = `${sTitle} (${files.length})`;
          subDet.appendChild(subSum);

          const subList = document.createElement('div');
          subList.className = 'sm-doc-sub-list';
          for (const f of files) {
            subList.appendChild(renderFileRow(f, null, false));
          }
          subDet.appendChild(subList);

          const subWrap = document.createElement('div');
          subWrap.className = 'sm-doc-sub';
          subWrap.appendChild(subDet);
          subBlocks.push(subWrap);
        }
        if (!subBlocks.length) continue;
        shown += 1;
        const det = document.createElement('details');
        det.className = 'sm-doc-cat';
        const defaultCatOpen = Boolean(needle) || cats.length <= 2;
        det.open = needle ? true : (openCategoryState.has(cat.id) ? openCategoryState.get(cat.id) : defaultCatOpen);
        det.addEventListener('toggle', () => {
          if (!needle) openCategoryState.set(cat.id, det.open);
        });
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
        const next = await smPrompt({
          title: t.renameTitle,
          label: t.renamePrompt,
          defaultValue: f.name,
          confirmLabel: t.save,
          cancelLabel: t.cancel,
          maxLength: 80,
        });
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
        const ok = await smConfirm({
          title: t.deleteFolderTitle,
          message: t.deleteFolderConfirm,
          confirmLabel: t.confirmDelete,
          cancelLabel: t.cancel,
          danger: true,
        });
        if (!ok || !client) return;
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
