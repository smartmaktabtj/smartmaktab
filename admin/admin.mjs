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
    projectInfo: 'Лоиҳаи Supabase',
    needSuperAdmin: 'Ин ҳисоб иҷозати super_admin надорад. Дар smartmaktab_private.platform_developers сабт кунед.',
    signedIn: 'Ворид шудед ҳамчун super_admin.',
    tabOrgs: 'Ташкилотҳо',
    tabRoles: 'Нақшҳо ва узвият',
    tabLicenses: 'Иҷозатномаҳо',
    tabPayments: 'Чекҳои пардохт (OCR)',
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
    userId: 'UUID-и корбар (аз Supabase Auth)',
    role: 'Нақш',
    targetOrg: 'Муассиса',
    assignRole: 'Таъин / Навсозии нақш',
    remove: 'Хориҷ',
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
    projectInfo: 'Проект Supabase',
    needSuperAdmin: 'У этого аккаунта нет прав super_admin. Добавьте user_id в smartmaktab_private.platform_developers.',
    signedIn: 'Вы вошли как super_admin.',
    tabOrgs: 'Организации',
    tabRoles: 'Роли и доступы',
    tabLicenses: 'Лицензии',
    tabPayments: 'Чеки оплаты (OCR)',
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
    userId: 'UUID пользователя (из Supabase Auth)',
    role: 'Роль',
    targetOrg: 'Организация',
    assignRole: 'Назначить / Обновить роль',
    remove: 'Удалить',
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
const client = createCloudClient({ config: getCloudConfig() });

let activeTab = 'orgs';
let orgs = [];
let memberships = [];
let licenses = [];
let payments = [];

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

async function refreshAll() {
  if (!client.session?.access_token) return;
  try {
    const [o, m, l, p] = await Promise.all([
      client.select('organizations', 'select=id,name,kind,parent_id,authority_tier,region_name,district_name,school_code&order=name.asc'),
      client.select('school_memberships', 'select=id,user_id,organization_id,role,created_at&order=created_at.desc'),
      client.select('school_licenses', 'select=id,organization_id,status,plan_code,starts_at,expires_at,grace_days,notes,updated_at&order=updated_at.desc'),
      client.select('payment_submissions', 'select=id,organization_id,submitted_by,provider_code,receipt_hash,amount_declared,currency,ocr_text,ocr_confidence,status,review_note,created_at&order=created_at.desc'),
    ]);
    orgs = o || [];
    memberships = m || [];
    licenses = l || [];
    payments = p || [];
    renderOrgSelects();
    renderTables();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function renderOrgSelects() {
  const authorities = orgs.filter(o => o.kind === 'education_authority');
  const parentSel = $('orgParent');
  const prevParent = parentSel.value;
  parentSel.replaceChildren(new Option('—', ''), ...authorities.map(a => new Option(`${a.name} (${a.authority_tier || a.kind})`, a.id)));
  if (authorities.some(a => a.id === prevParent)) parentSel.value = prevParent;

  for (const selId of ['roleOrg', 'licOrg']) {
    const sel = $(selId);
    const prev = sel.value;
    sel.replaceChildren(...orgs.map(o => new Option(`${o.name} · ${o.kind}`, o.id)));
    if (orgs.some(o => o.id === prev)) sel.value = prev;
  }
}

function orgNameById(id) {
  return orgs.find(o => o.id === id)?.name || id;
}

function renderTables() {
  const orgBody = $('orgsTbody');
  orgBody.replaceChildren(...(orgs.length ? orgs.map(o => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong></strong><br><small></small></td><td></td><td></td>`;
    tr.querySelector('strong').textContent = o.name;
    tr.querySelector('small').textContent = o.id;
    tr.children[1].textContent = `${o.kind}${o.authority_tier ? ` / ${o.authority_tier}` : ''}`;
    tr.children[2].textContent = [o.region_name, o.district_name, o.school_code].filter(Boolean).join(' · ') || '—';
    return tr;
  }) : [emptyRow(3)]));

  const memBody = $('rolesTbody');
  memBody.replaceChildren(...(memberships.length ? memberships.map(m => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = m.user_id;
    const td2 = document.createElement('td');
    td2.textContent = `${orgNameById(m.organization_id)} · ${m.role}`;
    const td3 = document.createElement('td');
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn alt';
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
    td3.append(rm);
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

  const payBody = $('paymentsTbody');
  payBody.replaceChildren(...(payments.length ? payments.map(p => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = `${orgNameById(p.organization_id)} · ${p.amount_declared ?? '—'} ${p.currency}`;
    const td2 = document.createElement('td');
    const hashEl = document.createElement('small');
    hashEl.textContent = `${p.status} · ${p.receipt_hash.slice(0, 14)}…`;
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
    });
    e.target.reset();
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('roleForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await client.adminAssignMembership({
      p_user_id: $('roleUserId').value.trim(),
      p_org_id: $('roleOrg').value,
      p_role: $('roleName').value,
    });
    setStatus(t('saved'));
    await refreshAll();
  } catch (err) {
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
applyTranslations();
showTab('orgs');
