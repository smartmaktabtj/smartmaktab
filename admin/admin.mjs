import { createCloudClient } from '../shared/cloud-client.mjs';
import { getCloudConfig } from '../shared/cloud-config.mjs';
import { evaluateLicenseState } from '../shared/license-guard.mjs';

const copy = {
  tg: {
    title: 'SmartMaktab Admin',
    sub: 'Идораи муассисаҳо, нақшҳо, иҷозатномаҳо (30 рӯз офлайн) ва чекҳои пардохт',
    lang: 'Забон',
    signOut: 'Баромадан',
    reload: 'Навсозӣ',
    loginTitle: 'Вориди маъмури низом (super_admin)',
    email: 'Почтаи электронӣ',
    password: 'Рамз',
    signIn: 'Ворид шудан',
    sendRecovery: 'Пайванди таъини рамз ба почта',
    recoverySent: 'Пайванди таъини рамз / воридшавӣ ба почта фиристода шуд.',
    setPasswordTitle: 'Таъин ё навсозии рамзи super_admin',
    newPassword: 'Рамзи нав (на кам аз 8 рамз)',
    projectInfo: 'Лоиҳаи Supabase',
    needSuperAdmin: 'Ин ҳисоб иҷозати super_admin надорад. Дар smartmaktab_private.platform_developers сабт кунед.',
    signedIn: 'Ворид шудед ҳамчун super_admin.',
    tabOrgs: 'Ташкилотҳо',
    tabRoles: 'Нақшҳо ва дастрасӣ',
    tabLicenses: 'Иҷозатномаҳо',
    tabPlans: 'Тарифҳо ва реквизитҳо',
    tabPayments: 'Чекҳои пардохт (OCR)',
    planTitleTg: 'Номи тариф (тоҷикӣ)',
    planTitleRu: 'Номи тариф (русӣ)',
    planPrice: 'Нарх (TJS)',
    planDays: 'Муҳлат (рӯз)',
    recipientPhone: 'Рақами қабулкунанда (Амонатбонк / DCity)',
    save: 'Сабт кардан',
    saved: 'Маълумот сабт шуд.',
    orgName: 'Номи муассиса',
    orgKind: 'Навъ',
    orgTier: 'Сатҳи идора',
    orgParent: 'Волид (Раёсат/Маориф)',
    region: 'Вилоят / Минтақа',
    district: 'Шаҳр / Ноҳия',
    schoolCode: 'Рамзи мактаб',
    kindSchool: 'Мактаб',
    kindAuthority: 'Мақоми маориф',
    allKinds: 'Ҳама навъҳо',
    allRegions: 'Ҳама вилоятҳо',
    allDistricts: 'Ҳама шаҳру ноҳияҳо',
    filterRegion: 'Филтри вилоят',
    filterDistrict: 'Филтри шаҳр / ноҳия',
    filterKind: 'Филтри навъ',
    filterSearch: 'Ҷустуҷӯ (ном ё код)',
    generateCode: 'Рамзи нав',
    cancelEdit: 'Бекор кардан (муассисаи нав)',
    editingOrgPrefix: 'Таҳрири муассиса:',
    editOrg: 'Таҳрир / Рамз',
    openRole: 'Дастрасӣ ва нақш',
    openLicense: 'Иҷозатнома',
    showingCount: 'Намоиш: {shown} аз {total}',
    pickUser: 'Корбари мавҷуда (ихтиёрӣ)',
    newAccountOption: '— Ҳисоби нав бо email —',
    userEmailOrId: 'Email ё UUID-и корбар',
    fullName: 'Ному насаб',
    roleRegionFilter: 'Филтри минтақа',
    tempPassword: 'Рамзи муваққатӣ (ихтиёрӣ)',
    issueTempPassword: 'Сохтан / барқароркунии рамзи муваққатӣ',
    role: 'Нақш',
    targetOrg: 'Муассиса',
    assignRole: 'Додани дастрасӣ ва нақш',
    resetPassword: 'Рамзи нав',
    remove: 'Хориҷ',
    issuedTitle: 'Маълумоти дастрасӣ омода шуд:',
    copyCredentials: 'Нусхабардорӣ',
    copiedCredentials: 'Маълумоти дастрасӣ ба буфер нусха шуд.',
    hideCard: 'Пинҳон кардан',
    licenseStatus: 'Ҳолат',
    planCode: 'Нақша (тариф)',
    expiresAt: 'То таърих',
    graceDays: 'Рӯзҳои имтиёзии офлайн',
    notes: 'Эзоҳ',
    approve30: 'Тасдиқ + 30 рӯз',
    approve365: 'Тасдиқ + 365 рӯз',
    reject: 'Рад кардан',
    noRows: 'Маълумот нест.',
    colName: 'Ном',
    colKind: 'Навъ / Сатҳ',
    colLocation: 'Минтақа / Код',
    colUser: 'Корбар',
    colRole: 'Нақш',
    colStatus: 'Ҳолат / Офлайн',
    colReceipt: 'Чек / OCR / Маблағ',
    colActions: 'Амалҳо',
  },
  ru: {
    title: 'SmartMaktab Admin',
    sub: 'Управление школами, ролями, лицензиями (30 дней офлайн) и чеками оплаты',
    lang: 'Язык',
    signOut: 'Выйти',
    reload: 'Обновить',
    loginTitle: 'Вход супер-администратора (super_admin)',
    email: 'Электронная почта',
    password: 'Пароль',
    signIn: 'Войти',
    sendRecovery: 'Отправить ссылку для задания пароля',
    recoverySent: 'Ссылка для входа / смены пароля отправлена на почту.',
    setPasswordTitle: 'Установка / смена пароля super_admin',
    newPassword: 'Новый пароль (мин. 8 символов)',
    projectInfo: 'Проект Supabase',
    needSuperAdmin: 'У этого аккаунта нет прав super_admin. Добавьте user_id в smartmaktab_private.platform_developers.',
    signedIn: 'Вы вошли как super_admin.',
    tabOrgs: 'Организации и школы',
    tabRoles: 'Роли и выдача доступа',
    tabLicenses: 'Лицензии',
    tabPlans: 'Тарифы и реквизиты',
    tabPayments: 'Чеки оплаты (OCR)',
    planTitleTg: 'Название тарифа (тадж.)',
    planTitleRu: 'Название тарифа (рус.)',
    planPrice: 'Цена (TJS)',
    planDays: 'Срок (дней)',
    recipientPhone: 'Номер получателя (Амонатбонк / DCity)',
    save: 'Сохранить',
    saved: 'Сохранено.',
    orgName: 'Название организации',
    orgKind: 'Тип',
    orgTier: 'Уровень',
    orgParent: 'Вышестоящий орган',
    region: 'Область / Регион',
    district: 'Город / Район',
    schoolCode: 'Код школы',
    kindSchool: 'Школа',
    kindAuthority: 'Орган образования',
    allKinds: 'Все типы',
    allRegions: 'Все области',
    allDistricts: 'Все города / районы',
    filterRegion: 'Фильтр области',
    filterDistrict: 'Фильтр города / района',
    filterKind: 'Фильтр типа',
    filterSearch: 'Поиск (название или код)',
    generateCode: 'Сгенерировать код',
    cancelEdit: 'Сбросить (новая организация)',
    editingOrgPrefix: 'Редактирование:',
    editOrg: 'Изменить / Код',
    openRole: 'Код и роль',
    openLicense: 'Лицензия',
    showingCount: 'Показано: {shown} из {total}',
    pickUser: 'Существующий аккаунт (необяз.)',
    newAccountOption: '— Новый или по Email —',
    userEmailOrId: 'Email или UUID пользователя',
    fullName: 'ФИО',
    roleRegionFilter: 'Фильтр области',
    tempPassword: 'Временный пароль (необяз.)',
    issueTempPassword: 'Выдать / сбросить временный пароль',
    role: 'Роль',
    targetOrg: 'Организация / Школа',
    assignRole: 'Выдать доступ и роль',
    resetPassword: 'Сбросить пароль',
    remove: 'Удалить',
    issuedTitle: 'Данные для входа выданы:',
    copyCredentials: 'Скопировать карточку',
    copiedCredentials: 'Карточка доступа скопирована в буфер обмена.',
    hideCard: 'Скрыть',
    licenseStatus: 'Статус',
    planCode: 'Тариф',
    expiresAt: 'Действует до',
    graceDays: 'Льготных офлайн-дней',
    notes: 'Примечание',
    approve30: 'Подтвердить + 30 дн.',
    approve365: 'Подтвердить + 365 дн.',
    reject: 'Отклонить',
    noRows: 'Нет записей.',
    colName: 'Название',
    colKind: 'Тип / Уровень',
    colLocation: 'Регион / Код',
    colUser: 'Пользователь',
    colRole: 'Роль',
    colStatus: 'Статус / Офлайн',
    colReceipt: 'Чек / OCR / Сумма',
    colActions: 'Действия',
  },
};

const $ = id => document.getElementById(id);
let lang = 'tg';
const t = key => copy[lang][key] || key;
const client = createCloudClient({
  config: getCloudConfig(),
  storage: globalThis.localStorage,
  storageKey: 'smartmaktab.admin.session.v1',
});

let activeTab = 'orgs';
let editingOrgId = null;
let orgs = [];
let memberships = [];
let licenses = [];
let plans = [];
let payments = [];
let authUsers = [];

function setStatus(msg, kind = '') {
  const el = $('admStatus');
  el.textContent = msg;
  el.className = `adm-status${kind ? ` ${kind}` : ''}`;
  el.hidden = !msg;
}

function applyTranslations() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-t]')) {
    el.textContent = t(el.dataset.t);
  }
  renderFilterSelects();
  renderUserPicker();
  renderOrgSelects();
  renderEditBanner();
  renderTables();
}

function showTab(name) {
  activeTab = name;
  for (const btn of document.querySelectorAll('.adm-tabs button')) {
    btn.setAttribute('aria-selected', btn.dataset.tab === name ? 'true' : 'false');
  }
  for (const pane of document.querySelectorAll('[data-pane]')) {
    pane.hidden = pane.dataset.pane !== name;
  }
}

function generateSchoolCode(name = '', current = '') {
  const numMatch = `${current} ${name}`.match(/(?:SM-|№\s*)(\d{1,3})/i);
  const prefix = numMatch ? `SM-${numMatch[1].padStart(3, '0')}` : 'SM';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, b => chars[b % chars.length]).join('');
  return `${prefix}-${suffix}`;
}

function renderEditBanner() {
  const banner = $('orgEditBanner');
  if (!editingOrgId) {
    banner.hidden = true;
    return;
  }
  const org = orgs.find(o => o.id === editingOrgId);
  banner.hidden = false;
  $('orgEditLabel').textContent = `${t('editingOrgPrefix')} ${org ? org.name : editingOrgId}${org?.school_code ? ` (${org.school_code})` : ''}`;
}

function startEditingOrg(org) {
  editingOrgId = org.id;
  $('orgName').value = org.name || '';
  $('orgKind').value = org.kind || 'school';
  $('orgTier').value = org.authority_tier || '';
  $('orgParent').value = org.parent_id || '';
  $('orgRegion').value = org.region_name || '';
  $('orgDistrict').value = org.district_name || '';
  $('orgCode').value = org.school_code || '';
  renderEditBanner();
  $('orgName').focus();
}

function resetOrgEditor() {
  editingOrgId = null;
  $('orgForm').reset();
  renderEditBanner();
}

function showIssuedCredentials(data) {
  if (!data) {
    $('issuedAccessCard').hidden = true;
    return;
  }
  const org = orgs.find(o => o.id === data.organization_id);
  const lines = [
    `${t('targetOrg')}: ${org ? org.name : data.organization_id || '—'}`,
    org?.school_code ? `${t('schoolCode')}: ${org.school_code}` : null,
    data.role ? `${t('role')}: ${data.role}` : null,
    `${t('email')}: ${data.email || '—'}`,
    data.temporary_password ? `${t('tempPassword')}: ${data.temporary_password}` : null,
  ].filter(Boolean);
  $('issuedAccessTitle').textContent = t('issuedTitle');
  $('issuedAccessText').textContent = lines.join('\n');
  $('issuedAccessCard').hidden = false;
}

async function refreshAll() {
  if (!client.session?.access_token) return;
  try {
    const [o, m, l, pl, p, uRes] = await Promise.all([
      client.select('organizations', 'select=id,name,kind,parent_id,authority_tier,region_name,district_name,school_code&order=name.asc'),
      client.select('school_memberships', 'select=id,user_id,organization_id,role,created_at&order=created_at.desc'),
      client.select('school_licenses', 'select=id,organization_id,status,plan_code,starts_at,expires_at,grace_days,notes,updated_at&order=updated_at.desc'),
      client.getPaymentPlans(),
      client.select('payment_submissions', 'select=id,organization_id,submitted_by,provider_code,receipt_hash,amount_declared,currency,ocr_text,ocr_confidence,transaction_id,recipient_account,status_confirmed,plan_code,status,review_note,created_at&order=created_at.desc'),
      client.adminUsers({ action: 'list_users' }).catch(() => ({ users: [] })),
    ]);
    orgs = o || [];
    memberships = m || [];
    licenses = l || [];
    plans = pl || [];
    payments = p || [];
    authUsers = Array.isArray(uRes?.users) ? uRes.users : [];
    renderFilterSelects();
    renderUserPicker();
    renderOrgSelects();
    renderEditBanner();
    renderTables();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

function renderFilterSelects() {
  const regions = uniqueSorted(orgs.map(o => o.region_name));
  const fReg = $('filterRegion');
  const prevFReg = fReg.value;
  fReg.replaceChildren(new Option(t('allRegions'), ''), ...regions.map(r => new Option(r, r)));
  if (regions.includes(prevFReg)) fReg.value = prevFReg;

  const districts = uniqueSorted(
    orgs.filter(o => !fReg.value || o.region_name === fReg.value).map(o => o.district_name),
  );
  const fDist = $('filterDistrict');
  const prevFDist = fDist.value;
  fDist.replaceChildren(new Option(t('allDistricts'), ''), ...districts.map(d => new Option(d, d)));
  if (districts.includes(prevFDist)) fDist.value = prevFDist;

  const rReg = $('roleRegionFilter');
  const prevRReg = rReg.value;
  rReg.replaceChildren(new Option(t('allRegions'), ''), ...regions.map(r => new Option(r, r)));
  if (regions.includes(prevRReg)) rReg.value = prevRReg;
}

function renderUserPicker() {
  const sel = $('roleUserPick');
  const prev = sel.value;
  sel.replaceChildren(
    new Option(t('newAccountOption'), ''),
    ...authUsers.map(u => new Option(`${u.email || u.id}${u.full_name ? ` · ${u.full_name}` : ''}`, u.id)),
  );
  if (authUsers.some(u => u.id === prev)) sel.value = prev;
}

function formatOrgOptionLabel(o) {
  const parts = [o.name];
  if (o.school_code) parts.push(`[${o.school_code}]`);
  if (o.district_name) parts.push(o.district_name);
  else if (o.region_name) parts.push(o.region_name);
  else parts.push(o.kind);
  return parts.join(' · ');
}

function renderOrgSelects() {
  const authorities = orgs.filter(o => o.kind === 'education_authority');
  const parentSel = $('orgParent');
  const prevParent = parentSel.value;
  parentSel.replaceChildren(new Option('—', ''), ...authorities.map(a => new Option(`${a.name} (${a.authority_tier || a.kind})`, a.id)));
  if (authorities.some(a => a.id === prevParent)) parentSel.value = prevParent;

  const roleRegion = $('roleRegionFilter').value;
  const roleOrgCandidates = orgs.filter(o => !roleRegion || o.region_name === roleRegion);
  const roleSel = $('roleOrg');
  const prevRole = roleSel.value;
  roleSel.replaceChildren(...roleOrgCandidates.map(o => new Option(formatOrgOptionLabel(o), o.id)));
  if (roleOrgCandidates.some(o => o.id === prevRole)) roleSel.value = prevRole;

  const licSel = $('licOrg');
  const prevLic = licSel.value;
  licSel.replaceChildren(...orgs.map(o => new Option(formatOrgOptionLabel(o), o.id)));
  if (orgs.some(o => o.id === prevLic)) licSel.value = prevLic;
}

function orgById(id) {
  return orgs.find(o => o.id === id);
}

function orgNameById(id) {
  const o = orgById(id);
  return o ? (o.school_code ? `${o.name} (${o.school_code})` : o.name) : id;
}

function userById(id) {
  return authUsers.find(u => u.id === id);
}

function filteredOrgs() {
  const reg = $('filterRegion').value;
  const dist = $('filterDistrict').value;
  const kind = $('filterKind').value;
  const q = $('filterSearch').value.trim().toLowerCase();
  return orgs.filter(o => {
    if (reg && o.region_name !== reg) return false;
    if (dist && o.district_name !== dist) return false;
    if (kind !== 'all' && o.kind !== kind) return false;
    if (q) {
      const hay = `${o.name} ${o.school_code || ''} ${o.district_name || ''} ${o.region_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderTables() {
  const shownOrgs = filteredOrgs();
  $('orgsCountInfo').textContent = t('showingCount').replace('{shown}', String(shownOrgs.length)).replace('{total}', String(orgs.length));

  const orgBody = $('orgsTbody');
  orgBody.replaceChildren(...(shownOrgs.length ? shownOrgs.map(o => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = o.name;
    const subId = document.createElement('small');
    subId.textContent = o.id;
    td1.append(strong, document.createElement('br'), subId);

    const td2 = document.createElement('td');
    td2.textContent = `${o.kind}${o.authority_tier ? ` / ${o.authority_tier}` : ''}`;

    const td3 = document.createElement('td');
    td3.textContent = [o.region_name, o.district_name, o.school_code].filter(Boolean).join(' · ') || '—';

    const td4 = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'adm-row';
    actions.style.marginTop = '0';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn alt sm';
    editBtn.textContent = t('editOrg');
    editBtn.addEventListener('click', () => startEditingOrg(o));

    const roleBtn = document.createElement('button');
    roleBtn.type = 'button';
    roleBtn.className = 'btn sm';
    roleBtn.textContent = t('openRole');
    roleBtn.addEventListener('click', () => {
      $('roleRegionFilter').value = '';
      renderOrgSelects();
      $('roleOrg').value = o.id;
      if (o.kind === 'education_authority') $('roleName').value = o.authority_tier === 'maorif' ? 'maorif' : 'authority_viewer';
      else if ($('roleName').value === 'maorif' || $('roleName').value === 'authority_viewer') $('roleName').value = 'director';
      showTab('roles');
      $('roleUserId').focus();
    });

    const licBtn = document.createElement('button');
    licBtn.type = 'button';
    licBtn.className = 'btn alt sm';
    licBtn.textContent = t('openLicense');
    licBtn.addEventListener('click', () => {
      $('licOrg').value = o.id;
      showTab('licenses');
    });

    actions.append(editBtn, roleBtn, licBtn);
    td4.append(actions);
    tr.append(td1, td2, td3, td4);
    return tr;
  }) : [emptyRow(4)]));

  const memBody = $('rolesTbody');
  memBody.replaceChildren(...(memberships.length ? memberships.map(m => {
    const tr = document.createElement('tr');
    const u = userById(m.user_id);
    const td1 = document.createElement('td');
    const uTitle = document.createElement('strong');
    uTitle.textContent = u ? `${u.email || m.user_id}${u.full_name ? ` · ${u.full_name}` : ''}` : m.user_id;
    const uSub = document.createElement('small');
    uSub.textContent = m.user_id;
    td1.append(uTitle, document.createElement('br'), uSub);

    const td2 = document.createElement('td');
    td2.textContent = `${orgNameById(m.organization_id)} · ${m.role}`;

    const td3 = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'adm-row';
    wrap.style.marginTop = '0';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn alt sm';
    resetBtn.textContent = t('resetPassword');
    resetBtn.addEventListener('click', async () => {
      resetBtn.disabled = true;
      try {
        const res = await client.adminUsers({ action: 'reset_password', user_id: m.user_id });
        showIssuedCredentials({ ...res, organization_id: m.organization_id, role: m.role });
        setStatus(t('saved'));
      } catch (err) {
        setStatus(err.message, 'error');
      } finally {
        resetBtn.disabled = false;
      }
    });

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn alt sm';
    rm.textContent = t('remove');
    rm.addEventListener('click', async () => {
      rm.disabled = true;
      try {
        await client.adminRemoveMembership(m.id);
        setStatus(t('saved'));
        await refreshAll();
      } catch (err) {
        setStatus(err.message, 'error');
        rm.disabled = false;
      }
    });
    wrap.append(resetBtn, rm);
    td3.append(wrap);
    tr.append(td1, td2, td3);
    return tr;
  }) : [emptyRow(3)]));

  const licBody = $('licensesTbody');
  licBody.replaceChildren(...(licenses.length ? licenses.map(l => {
    const evalState = evaluateLicenseState({ ...l, configured: true });
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = `${orgNameById(l.organization_id)} (${l.plan_code})`;
    const td2 = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `pill ${evalState.status === 'locked' ? 'danger' : evalState.status === 'grace' ? 'warn' : ''}`;
    pill.textContent = `${evalState.status} · ${evalState.status === 'grace' ? `${evalState.graceDaysLeft}d grace` : `${evalState.daysLeft}d left`}`;
    td2.append(pill);
    const td3 = document.createElement('td');
    td3.textContent = l.expires_at?.slice(0, 10) || '—';
    tr.append(td1, td2, td3);
    return tr;
  }) : [emptyRow(3)]));

  const planBody = $('plansTbody');
  if (planBody) {
    planBody.replaceChildren(...(plans.length ? plans.map(pl => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      const td1 = document.createElement('td');
      td1.textContent = `${pl.code} · ${lang === 'tg' ? pl.title_tg : pl.title_ru}`;
      const td2 = document.createElement('td');
      td2.textContent = `${pl.price_tjs} TJS / ${pl.duration_days}d`;
      const td3 = document.createElement('td');
      td3.textContent = `${pl.recipient_phone} (${(pl.supported_providers || []).join(', ')})`;
      tr.append(td1, td2, td3);
      tr.addEventListener('click', () => {
        $('planCode').value = pl.code;
        $('planTitleTg').value = pl.title_tg;
        $('planTitleRu').value = pl.title_ru;
        $('planPrice').value = String(pl.price_tjs);
        $('planDays').value = String(pl.duration_days);
        $('planPhone').value = pl.recipient_phone;
      });
      return tr;
    }) : [emptyRow(3)]));
    if (plans[0] && !$('planTitleTg').value) {
      $('planCode').value = plans[0].code;
      $('planTitleTg').value = plans[0].title_tg;
      $('planTitleRu').value = plans[0].title_ru;
      $('planPrice').value = String(plans[0].price_tjs);
      $('planDays').value = String(plans[0].duration_days);
      $('planPhone').value = plans[0].recipient_phone;
    }
  }

  const payBody = $('paymentsTbody');
  payBody.replaceChildren(...(payments.length ? payments.map(p => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = `${orgNameById(p.organization_id)} · ${p.provider_code} · ${p.amount_declared ?? '—'} ${p.currency}`;
    const td2 = document.createElement('td');
    const hashEl = document.createElement('small');
    const txPart = p.transaction_id ? ` · TX:${p.transaction_id}` : '';
    const recPart = p.recipient_account ? ` · ->${p.recipient_account}` : '';
    const okPart = p.status_confirmed ? ' · ✓' : '';
    hashEl.textContent = `${p.status}${txPart}${recPart}${okPart} · ${p.receipt_hash.slice(0, 10)}…`;
    const ocrEl = document.createElement('div');
    ocrEl.textContent = p.ocr_text ? p.ocr_text.slice(0, 160) : '—';
    td2.append(hashEl, ocrEl);
    const td3 = document.createElement('td');
    if (p.status === 'pending') {
      const wrap = document.createElement('div');
      wrap.className = 'adm-row';
      for (const [days, labelKey, cls] of [[30, 'approve30', 'btn'], [365, 'approve365', 'btn alt'], [0, 'reject', 'btn danger']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = t(labelKey);
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            await client.adminReviewPayment({
              p_payment_id: p.id,
              p_decision: days > 0 ? 'verified' : 'rejected',
              p_review_note: days > 0 ? `Verified +${days}d` : 'Rejected by admin',
              p_extend_days: days,
              p_plan_code: days >= 365 ? 'annual' : 'monthly',
            });
            setStatus(t('saved'));
            await refreshAll();
          } catch (err) {
            setStatus(err.message, 'error');
            b.disabled = false;
          }
        });
        wrap.append(b);
      }
      td3.append(wrap);
    } else {
      td3.textContent = p.review_note || p.status;
    }
    tr.append(td1, td2, td3);
    return tr;
  }) : [emptyRow(3)]));
}

function emptyRow(cols) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = cols;
  td.textContent = t('noRows');
  tr.append(td);
  return tr;
}

$('admLang').addEventListener('change', e => {
  lang = e.target.value;
  applyTranslations();
});

for (const btn of document.querySelectorAll('.adm-tabs button')) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}

$('filterRegion').addEventListener('change', () => {
  renderFilterSelects();
  renderTables();
});
$('filterDistrict').addEventListener('change', renderTables);
$('filterKind').addEventListener('change', renderTables);
$('filterSearch').addEventListener('input', renderTables);

$('roleRegionFilter').addEventListener('change', renderOrgSelects);
$('roleUserPick').addEventListener('change', e => {
  const u = userById(e.target.value);
  if (!u) return;
  $('roleUserId').value = u.email || u.id;
  if (u.full_name) $('roleFullName').value = u.full_name;
});

$('orgGenCode').addEventListener('click', () => {
  $('orgCode').value = generateSchoolCode($('orgName').value, $('orgCode').value);
});
$('orgCancelEdit').addEventListener('click', resetOrgEditor);

$('copyAccessBtn').addEventListener('click', async () => {
  const txt = $('issuedAccessText').textContent;
  if (!txt) return;
  try {
    await navigator.clipboard.writeText(txt);
    setStatus(t('copiedCredentials'));
  } catch {
    setStatus(txt);
  }
});
$('closeAccessBtn').addEventListener('click', () => { $('issuedAccessCard').hidden = true; });

$('admLoginForm').addEventListener('submit', async e => {
  e.preventDefault();
  setStatus('');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await client.signIn($('loginEmail').value, $('loginPassword').value);
    $('loginPassword').value = '';
    const ctx = await client.getWorkspaceContext();
    if (!ctx?.is_super_admin) {
      await client.signOut();
      setStatus(t('needSuperAdmin'), 'error');
      return;
    }
    $('admLoginCard').hidden = true;
    $('admWorkspace').hidden = false;
    $('signOutBtn').hidden = false;
    $('reloadBtn').hidden = false;
    setStatus(t('signedIn'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('signOutBtn').addEventListener('click', async () => {
  await client.signOut();
  $('admLoginCard').hidden = false;
  $('admWorkspace').hidden = true;
  $('signOutBtn').hidden = true;
  $('reloadBtn').hidden = true;
  setStatus('');
});

$('reloadBtn').addEventListener('click', refreshAll);

$('orgForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await client.adminUpsertOrganization({
      p_name: $('orgName').value,
      p_kind: $('orgKind').value,
      p_parent_id: $('orgParent').value || null,
      p_authority_tier: $('orgKind').value === 'education_authority' ? ($('orgTier').value || 'maorif') : null,
      p_region_name: $('orgRegion').value || null,
      p_district_name: $('orgDistrict').value || null,
      p_school_code: $('orgCode').value || null,
      p_org_id: editingOrgId || null,
    });
    resetOrgEditor();
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('roleForm').addEventListener('submit', async e => {
  e.preventDefault();
  const ident = $('roleUserId').value.trim();
  const orgId = $('roleOrg').value;
  const role = $('roleName').value;
  const fullName = $('roleFullName').value.trim();
  const password = $('roleTempPassword').value.trim();
  const resetPass = $('roleResetPass').checked;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ident);
  try {
    const res = await client.adminUsers({
      action: 'assign_or_create',
      ...(isUuid ? { user_id: ident } : { email: ident }),
      org_id: orgId,
      role,
      full_name: fullName,
      preferred_lang: lang,
      ...(password ? { password } : {}),
      reset_password: resetPass,
    });
    showIssuedCredentials(res);
    $('roleTempPassword').value = '';
    $('roleResetPass').checked = false;
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
    if (isUuid && !password && !resetPass) {
      try {
        await client.adminAssignMembership({ p_user_id: ident, p_org_id: orgId, p_role: role });
        setStatus(t('saved'));
        await refreshAll();
        return;
      } catch {}
    }
    setStatus(err.message, 'error');
  }
});

$('licForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await client.adminSetLicense({
      p_org_id: $('licOrg').value,
      p_status: $('licStatus').value,
      p_plan_code: $('licPlan').value.trim() || 'standard',
      p_expires_at: new Date(`${$('licExpires').value}T23:59:59Z`).toISOString(),
      p_grace_days: Number($('licGraceDays').value || 30),
      p_notes: $('licNotes').value.trim(),
    });
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('projectEndpoint').textContent = `${getCloudConfig().url} (${getCloudConfig().projectRef})`;
$('licExpires').value = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

$('sendRecoveryBtn').addEventListener('click', async () => {
  setStatus('');
  const email = $('loginEmail').value.trim();
  if (!email) return;
  try {
    await client.requestPasswordRecovery(email, location.href.split('#')[0]);
    setStatus(t('recoverySent'));
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('admPasswordForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await client.updatePassword($('newPasswordInput').value);
    $('newPasswordInput').value = '';
    $('admPasswordCard').hidden = true;
    setStatus(t('saved'));
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('planForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await client.adminUpsertSubscriptionPlan({
      p_code: $('planCode').value.trim(),
      p_title_tg: $('planTitleTg').value.trim(),
      p_title_ru: $('planTitleRu').value.trim(),
      p_price_tjs: Number($('planPrice').value),
      p_duration_days: Number($('planDays').value),
      p_recipient_phone: $('planPhone').value.trim(),
      p_supported_providers: ['amonat', 'dcity'],
      p_is_active: true,
    });
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

(async function restoreUrlOrSession() {
  let authType = '';
  if (location.hash && location.hash.includes('access_token=')) {
    const params = new URLSearchParams(location.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    authType = params.get('type') || '';
    if (accessToken) {
      client.setSession({ access_token: accessToken, refresh_token: refreshToken || '' });
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
  if (!client.session?.access_token) return;
  try {
    const ctx = await client.getWorkspaceContext();
    if (ctx?.is_super_admin) {
      $('admLoginCard').hidden = true;
      $('admWorkspace').hidden = false;
      $('signOutBtn').hidden = false;
      $('reloadBtn').hidden = false;
      if (authType === 'recovery' || authType === 'magiclink') $('admPasswordCard').hidden = false;
      setStatus(t('signedIn'));
      await refreshAll();
    } else {
      await client.signOut();
      setStatus(t('needSuperAdmin'), 'error');
    }
  } catch {
    await client.signOut();
  }
})();

applyTranslations();
showTab('orgs');
