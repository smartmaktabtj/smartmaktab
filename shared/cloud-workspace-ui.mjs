import { persistentStore } from './cabinet-runtime.mjs';
import { createCloudClient } from './cloud-client.mjs';
import { getCloudConfig } from './cloud-config.mjs';
import { cacheVerifiedLicense, clearCachedLicense, getOrCreateDeviceId, mountLicenseGate } from './license-guard.mjs';
import { DEFAULT_PAYMENT_TARIFF, parseReceiptText, runClientOcr, submitReceiptForVerification } from './ocr-receipt.mjs';
import { ALIYA_ADDON_PRICE_TJS, POSITION_CATALOG, computePositionTariffTotal, formatPositionTitle, getCompatibleExtraPositions, getPositionsForOrg } from './position-catalog.mjs';
import { openWorkspaceView, closeWorkspaceView } from './workspace-view.mjs';

const LAST_ORG_KEY = 'smartmaktab.cloud.last_org.v1';

const providerLabels = {
  amonat: ['Амонатбонк', 'Амонатбанк'],
  dcity: ['Душанбе Сити', 'Душанбе Сити'],
  alif: ['Алиф', 'Алиф'],
  eskhata: ['Эсхата', 'Эсхата'],
  spitamen: ['Спитамен Бонк', 'Спитамен Банк'],
  manual: ['Дигар / дастӣ', 'Другой / вручную'],
};

const roleLabels = {
  school_admin: ['Маъмури муассиса', 'Администратор школы'],
  teacher: ['Омӯзгор / Мутахассис', 'Учитель / Специалист'],
  librarian: ['Китобдор', 'Библиотекарь'],
  district_observer: ['Нозири маориф', 'Инспектор маориф'],
  super_admin: ['Супер-админ', 'Супер-админ'],
};

const copy = {
  trigger: ['Облако ва обуна', 'Облако и подписка'],
  heading: ['Ҳамоҳангсозии абрӣ ва обуна', 'Облачная синхронизация и подписка'],
  note: [
    'Барои ҳамоҳангсозии маълумот бо сервери мактаб ва санҷиши иҷозатнома (30 рӯз офлайн) ворид шавед.',
    'Войдите для синхронизации данных школы с облаком и проверки лицензии (30 дней офлайн).',
  ],
  email: ['Логин, телефон ё Email', 'Логин, телефон или Email'],
  password: ['Рамз', 'Пароль'],
  signIn: ['Ворид шудан', 'Войти'],
  signOut: ['Баромадан', 'Выйти'],
  close: ['Пӯшидан', 'Закрыть'],
  signedOut: ['Шумо дар реҷаи офлайн ҳастед.', 'Вы работаете в офлайн-режиме.'],
  signedIn: ['Пайваст ба абр фаъол аст.', 'Облачное подключение активно.'],
  orgSelect: ['Муассисаи фаъол дар абр', 'Активная организация в облаке'],
  noOrg: ['Ягон муассиса ба ин ҳисоб вобаста нашудааст.', 'К этому аккаунту не привязана организация.'],
  checkLicense: ['Тафтиши иҷозатнома', 'Проверить лицензию'],
  licenseLine: ['Ҳолати иҷозатнома', 'Статус лицензии'],
  accessLine: ['Дастрасии шумо', 'Ваш доступ'],
  syncUp: ['Ҳамоҳангсозӣ бо абр', 'Сохранить данные кабинета в облако'],
  syncDown: ['Навсозӣ аз абр', 'Загрузить записи из облака'],
  restoreLocal: ['Барқарор дар ин дастгоҳ', 'Восстановить на устройство'],
  restoredLocal: ['Маълумот аз абр барқарор шуд.', 'Данные из облака восстановлены локально.'],
  receiptHeading: ['Тасдиқи пардохт ва интихоби вазифа', 'Выбор должности и оплата по чеку'],
  payRequisites: ['Маълумот барои пардохт', 'Реквизиты для оплаты'],
  copyPhone: ['Нусхабардории рақам', 'Скопировать номер'],
  copiedPhone: ['Рақам нусхабардорӣ шуд:', 'Номер скопирован:'],
  primaryPosLbl: ['Вазифаи асосӣ барои обуна', 'Основная должность для подписки'],
  extraPosLbl: ['Вазифаҳои иловагӣ (ихтиёрӣ)', 'Дополнительные должности (по желанию)'],
  receiptFile: ['Акси чек (PNG/JPG/PDF)', 'Файл чека (PNG/JPG/PDF)'],
  provider: ['Усули пардохт', 'Способ оплаты'],
  amount: ['Маблағ (сомонӣ)', 'Сумма (сомони)'],
  ocrText: ['Матни чек (OCR / дастӣ)', 'Текст чека (OCR / вручную)'],
  sendReceipt: ['Ирсоли чек барои тафтиш', 'Отправить чек на проверку'],
  receiptSent: ['Чек барои тасдиқ бо муваффақият ирсол шуд.', 'Чек успешно отправлен на проверку.'],
  receiptDup: ['Ин чек ё рақами амалиёт аллакай қаблан ирсол шудааст.', 'Этот чек или номер операции уже был отправлен ранее.'],
  savedCloud: ['Сабт ба абр ирсол шуд.', 'Запись сохранена в облако.'],
  recordsEmpty: ['Сабтҳои абрӣ ёфт нашуданд.', 'Облачные записи не найдены.'],
  authError: ['Хатои воридшавӣ ё шабака.', 'Ошибка входа или сети.'],
  deviceBlockedMsg: [
    'Огоҳӣ: Ин логин дар дастгоҳи дигар фаъол аст. Ҳамоҳангсозӣ манъ шуд.',
    'Внимание: превышен лимит устройств для этого аккаунта. Синхронизация заблокирована.',
  ],
  posBlockedMsg: [
    'Огоҳӣ: Ин утоқ ба вазифаи пардохтшудаи шумо дохил намешавад.',
    'Внимание: этот кабинет не входит в ваш оплаченный тариф.',
  ],
};

function detectDeviceLabel() {
  try {
    const ua = String(globalThis.navigator?.userAgent || '');
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS|Macintosh/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
  } catch {}
  return 'Web';
}

function safeReadKey(store, key) {
  try { return store?.getItem?.(key) || ''; } catch { return ''; }
}

function safeWriteKey(store, key, val) {
  try {
    if (val) store?.setItem?.(key, val);
    else store?.removeItem?.(key);
  } catch {}
}

export function setupCloudWorkspace(article, group, school) {
  const tg = () => document.documentElement.lang !== 'ru';
  const langCode = () => (tg() ? 'tg' : 'ru');
  const t = k => copy[k][tg() ? 0 : 1];
  const make = (tag, cls) => { const x = document.createElement(tag); if (cls) x.className = cls; return x; };
  const cabinetId = article?.dataset?.cabinetId || '';

  const gateHost = make('div', 'no-print');
  gateHost.id = 'licenseGateBanner';
  gateHost.hidden = true;
  article.prepend(gateHost);

  const triggerWrap = make('div', 'control');
  const trigger = make('button', 'button alt');
  trigger.type = 'button';
  trigger.dataset.cloudPanelTrigger = '';
  triggerWrap.append(trigger);
  group.append(triggerWrap);

  const panel = make('section', 'section no-print');
  panel.id = 'cloudWorkspacePanel';
  panel.hidden = true;
  document.getElementById('workspaceDocs').after(panel);

  const head = make('h2');
  head.tabIndex = -1;
  const note = make('p', 'small');
  const status = make('p', 'notice');
  status.setAttribute('role', 'status');

  const loginForm = make('form', 'school-fields');
  loginForm.autocomplete = 'off';
  const emailWrap = make('label', 'field');
  const emailLbl = make('span');
  const emailInput = make('input');
  emailInput.type = 'text';
  emailInput.required = true;
  emailWrap.append(emailLbl, emailInput);

  const passWrap = make('label', 'field');
  const passLbl = make('span');
  const passInput = make('input');
  passInput.type = 'password';
  passInput.required = true;
  passWrap.append(passLbl, passInput);

  const loginRow = make('div', 'control');
  const signInBtn = make('button', 'button');
  signInBtn.type = 'submit';
  const closeLoginBtn = make('button', 'button alt');
  closeLoginBtn.type = 'button';
  loginRow.append(signInBtn, closeLoginBtn);
  loginForm.append(emailWrap, passWrap, loginRow);

  const sessionBox = make('div');
  sessionBox.hidden = true;

  const orgWrap = make('label', 'field');
  const orgLbl = make('span');
  const orgSelect = make('select');
  orgWrap.append(orgLbl, orgSelect);

  const licLine = make('p', 'small');
  const scopeLine = make('p', 'small');
  const actionRow = make('div', 'control');
  const checkLicBtn = make('button', 'button alt');
  checkLicBtn.type = 'button';
  const syncUpBtn = make('button', 'button alt');
  syncUpBtn.type = 'button';
  const syncDownBtn = make('button', 'button alt');
  syncDownBtn.type = 'button';
  const signOutBtn = make('button', 'button alt');
  signOutBtn.type = 'button';
  const closeSessionBtn = make('button', 'button alt');
  closeSessionBtn.type = 'button';
  actionRow.append(checkLicBtn, syncUpBtn, syncDownBtn, signOutBtn, closeSessionBtn);

  const cloudList = make('ul');

  const receiptForm = make('form', 'school-fields');
  const recTitle = make('h3');
  const reqBox = make('div', 'notice school-field-wide');
  const reqTitle = make('strong');
  const reqDetail = make('p', 'small');
  const copyPhoneBtn = make('button', 'button alt');
  copyPhoneBtn.type = 'button';
  reqBox.append(reqTitle, reqDetail, copyPhoneBtn);

  const posWrap = make('label', 'field');
  const posLbl = make('span');
  const posSelect = make('select');
  posWrap.append(posLbl, posSelect);

  const extraWrap = make('div', 'field school-field-wide');
  const extraLbl = make('span');
  const extraListBox = make('div', 'control');
  const aliyaLabel = make('label', 'small');
  const aliyaToggle = make('input');
  aliyaToggle.type = 'checkbox';
  aliyaToggle.id = 'cloudAliyaAddonToggle';
  const aliyaTxt = make('span');
  aliyaLabel.append(aliyaToggle, aliyaTxt);
  const tariffCalcLine = make('small', 'small');
  extraWrap.append(extraLbl, extraListBox, aliyaLabel, tariffCalcLine);

  const fileWrap = make('label', 'field');
  const fileLbl = make('span');
  const fileInput = make('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,application/pdf';
  fileWrap.append(fileLbl, fileInput);

  const provWrap = make('label', 'field');
  const provLbl = make('span');
  const provSelect = make('select');
  for (const code of ['amonat', 'dcity', 'alif', 'eskhata', 'spitamen', 'manual']) {
    provSelect.append(new Option(code, code));
  }
  provWrap.append(provLbl, provSelect);

  const amtWrap = make('label', 'field');
  const amtLbl = make('span');
  const amtInput = make('input');
  amtInput.type = 'number';
  amtInput.step = '0.01';
  amtInput.min = '0';
  amtInput.value = String(DEFAULT_PAYMENT_TARIFF.priceTjs);
  amtWrap.append(amtLbl, amtInput);

  const ocrWrap = make('label', 'field school-field-wide');
  const ocrLbl = make('span');
  const ocrInput = make('textarea');
  ocrInput.rows = 3;
  const ocrParsedLine = make('small', 'small');
  ocrWrap.append(ocrLbl, ocrInput, ocrParsedLine);

  const sendReceiptBtn = make('button', 'button');
  sendReceiptBtn.type = 'submit';
  receiptForm.append(recTitle, reqBox, posWrap, extraWrap, fileWrap, provWrap, amtWrap, ocrWrap, sendReceiptBtn);

  sessionBox.append(orgWrap, licLine, scopeLine, actionRow, cloudList, receiptForm);
  panel.append(head, note, status, loginForm, sessionBox);

  const client = createCloudClient({
    config: getCloudConfig(persistentStore),
    storage: persistentStore,
    storageKey: 'smartmaktab.cloud.session.v1',
  });
  let ctx = null;
  let selectedOrgId = safeReadKey(persistentStore, LAST_ORG_KEY);
  let statusMessage = t('signedOut');
  let roleTariffs = [...POSITION_CATALOG];
  let selectedExtras = new Set();
  let extraCheckboxes = [];
  let activePlan = {
    code: DEFAULT_PAYMENT_TARIFF.code,
    price_tjs: DEFAULT_PAYMENT_TARIFF.priceTjs,
    duration_days: DEFAULT_PAYMENT_TARIFF.durationDays,
    recipient_phone: DEFAULT_PAYMENT_TARIFF.recipientPhone,
    recipient_account: DEFAULT_PAYMENT_TARIFF.recipientAccount,
  };
  let receiptBytes = null;
  let receiptBase64 = '';
  let receiptConfidence = null;
  let manualAmountOverride = false;

  function activeOrg() {
    return (ctx?.memberships || []).find(m => m.organization_id === selectedOrgId) || null;
  }

  function refreshGate() {
    const state = mountLicenseGate(gateHost, {
      orgId: selectedOrgId,
      cabinetId,
      storage: persistentStore,
      onVerifyOnline: checkLicenseOnline,
      onOpenPayment: () => {
        panel.hidden = false;
        openWorkspaceView(panel.id, trigger);
      },
    });
    const blocked = !state.allowed;
    syncUpBtn.disabled = blocked;
    syncDownBtn.disabled = blocked;
    return state;
  }

  function rebuildPositionSelectors() {
    const lang = langCode();
    const m = activeOrg();
    const orgLike = m ? { kind: m.kind, authority_tier: m.authority_tier } : { kind: 'school' };
    const available = getPositionsForOrg(orgLike, roleTariffs).filter(r => r.is_active !== false);
    const currentPos = posSelect.value || m?.primary_position || cabinetId || available[0]?.position_code || 'school-director';
    posSelect.replaceChildren(...available.map(r => new Option(
      `${lang === 'ru' ? r.title_ru : r.title_tg} (${Number(r.base_price_tjs ?? 10).toFixed(2)} TJS)`,
      r.position_code,
    )));
    if (available.some(r => r.position_code === currentPos)) {
      posSelect.value = currentPos;
    }

    extraCheckboxes = [];
    const compatible = getCompatibleExtraPositions(posSelect.value, available);
    const compatibleIds = new Set(compatible.map(r => r.position_code));
    for (const oldExtra of [...selectedExtras]) {
      if (!compatibleIds.has(oldExtra)) selectedExtras.delete(oldExtra);
    }
    const nodes = compatible.map(r => {
      const lbl = make('label', 'small');
      const cb = make('input');
      cb.type = 'checkbox';
      cb.value = r.position_code;
      cb.checked = selectedExtras.has(r.position_code);
      cb.addEventListener('change', () => {
        if (cb.checked) selectedExtras.add(r.position_code);
        else selectedExtras.delete(r.position_code);
        updateTariffSummary();
      });
      const txt = make('span');
      txt.textContent = ` ${lang === 'ru' ? r.title_ru : r.title_tg} (+${Number(r.extra_price_tjs ?? r.base_price_tjs ?? 10).toFixed(2)} TJS)`;
      lbl.append(cb, txt);
      extraCheckboxes.push(cb);
      return lbl;
    });
    extraListBox.replaceChildren(...nodes);
    updateTariffSummary();
  }

  function updateTariffSummary() {
    const primary = posSelect.value;
    const extras = [...selectedExtras].filter(code => code !== primary);
    const includeAliya = Boolean(aliyaToggle.checked);
    const calc = computePositionTariffTotal({
      primaryPosition: primary,
      extraPositions: extras,
      tariffs: roleTariffs,
      includeAliya,
    });
    if (!manualAmountOverride) {
      amtInput.value = String(calc.totalTjs);
    }
    const aliyaPart = includeAliya ? ` + Алия (${calc.aliyaPrice} TJS)` : '';
    tariffCalcLine.textContent = tg()
      ? `Тарофаи интихобшуда: ${calc.basePrice} TJS + ${extras.length} вазифаи иловагӣ (${calc.extrasPrice} TJS)${aliyaPart} = Ҳамагӣ ${calc.totalTjs} TJS`
      : `Выбранный тариф: ${calc.basePrice} TJS + ${extras.length} доп. должн. (${calc.extrasPrice} TJS)${aliyaPart} = Итого ${calc.totalTjs} TJS`;
  }

  async function checkLicenseOnline() {
    if (!client.session?.access_token || !selectedOrgId) return;
    try {
      const m = activeOrg();
      let devRes = { allowed: true, max_devices: m?.max_devices ?? 1, active_devices: 1 };
      try {
        devRes = await client.claimDeviceSession({
          p_org_id: selectedOrgId,
          p_device_id: getOrCreateDeviceId(persistentStore),
          p_device_label: detectDeviceLabel(),
          p_cabinet_id: cabinetId || null,
        });
      } catch {}

      const res = await client.getLicenseStatus(selectedOrgId);
      const isBlockedDevice = devRes?.allowed === false && devRes?.reason === 'device_limit_reached';
      const isDisabledAccount = devRes?.allowed === false && devRes?.reason === 'account_disabled';
      const isDisallowedPos = devRes?.allowed === false && devRes?.reason === 'position_not_allowed';

      cacheVerifiedLicense(selectedOrgId, {
        ...res,
        primary_position: m?.primary_position ?? null,
        extra_positions: m?.extra_positions ?? [],
        role: m?.role ?? '',
        max_devices: devRes?.max_devices ?? m?.max_devices ?? 1,
        aliya_enabled: Boolean(m?.aliya_enabled),
        aliya_expires_at: m?.aliya_expires_at ?? null,
        is_super_admin: Boolean(ctx?.is_super_admin),
        deviceBlocked: isBlockedDevice,
        accountDisabled: isDisabledAccount || m?.account_active === false,
      }, persistentStore);

      const durVal = res.effective_status === 'grace' ? res.grace_days_left : res.days_left;
      licLine.textContent = tg()
        ? `${t('licenseLine')}: ${res.effective_status} (${durVal} рӯз) · Дастгоҳҳо: ${devRes?.active_devices ?? 1}/${devRes?.max_devices ?? m?.max_devices ?? 1}`
        : `${t('licenseLine')}: ${res.effective_status} (${durVal} дн.) · Устройства: ${devRes?.active_devices ?? 1}/${devRes?.max_devices ?? m?.max_devices ?? 1}`;

      const lang = langCode();
      const posName = m?.primary_position ? formatPositionTitle(m.primary_position, lang) : (roleLabels[m?.role]?.[tg() ? 0 : 1] || m?.role || '');
      const extraCount = (m?.extra_positions || []).length;
      scopeLine.textContent = m
        ? (tg()
          ? `${t('accessLine')}: ${posName}${extraCount ? ` (+${extraCount} иловагӣ)` : ''}`
          : `${t('accessLine')}: ${posName}${extraCount ? ` (+${extraCount} доп.)` : ''}`)
        : '';

      if (isBlockedDevice) statusMessage = t('deviceBlockedMsg');
      else if (isDisallowedPos) statusMessage = t('posBlockedMsg');
      renderLabels();
    } catch (err) {
      statusMessage = err.message;
      renderLabels();
    }
  }

  async function loadCloudRecords() {
    if (!client.session?.access_token || !selectedOrgId) return;
    try {
      const rows = await client.listRecordsDetail({ p_org_id: selectedOrgId, p_record_type: null, p_include_deleted: false });
      cloudList.replaceChildren(...(rows?.length ? rows.slice(0, 20).map(r => {
        const li = make('li');
        const label = make('span');
        label.textContent = `${r.record_type} · ${r.title} `;
        li.append(label);
        if (r.payload?.local_snapshot && typeof r.payload.local_snapshot === 'object') {
          const restoreBtn = make('button', 'button alt');
          restoreBtn.type = 'button';
          restoreBtn.textContent = t('restoreLocal');
          restoreBtn.addEventListener('click', () => {
            for (const [k, v] of Object.entries(r.payload.local_snapshot)) {
              if (k.startsWith('smartmaktab.demo.') && typeof v === 'string') persistentStore.setItem(k, v);
            }
            statusMessage = t('restoredLocal');
            renderLabels();
          });
          li.append(restoreBtn);
        }
        return li;
      }) : [Object.assign(make('li'), { textContent: t('recordsEmpty') })]));
    } catch (err) {
      statusMessage = err.message;
      renderLabels();
    }
  }

  function updateParsedPreview() {
    const raw = ocrInput.value.trim();
    if (!raw) { ocrParsedLine.textContent = ''; return; }
    const p = parseReceiptText(raw);
    if (p.detectedProvider) provSelect.value = p.detectedProvider;
    if (p.detectedAmount !== null) {
      manualAmountOverride = true;
      amtInput.value = String(p.detectedAmount);
    }
    const parts = [
      p.detectedProvider && `${tg() ? 'Бонк' : 'Банк'}: ${p.detectedProvider}`,
      p.detectedAmount !== null && `${tg() ? 'Маблағ' : 'Сумма'}: ${p.detectedAmount} TJS`,
      p.detectedReference && `TX: ${p.detectedReference}`,
      p.detectedRecipient && `${tg() ? 'Қабулкунанда' : 'Получатель'}: ${p.detectedRecipient}`,
      p.statusConfirmed && (tg() ? 'Ҳолат: ✓' : 'Статус: ✓'),
    ].filter(Boolean);
    ocrParsedLine.textContent = parts.join(' · ');
  }

  async function applySignedInContext() {
    ctx = await client.getWorkspaceContext();
    const memberships = ctx?.memberships || [];
    orgSelect.replaceChildren(...memberships.map(m => {
      const posTxt = m.primary_position
        ? formatPositionTitle(m.primary_position, langCode())
        : (roleLabels[m.role]?.[tg() ? 0 : 1] || m.role);
      return new Option(`${m.organization_name} (${posTxt})`, m.organization_id);
    }));
    const saved = safeReadKey(persistentStore, LAST_ORG_KEY);
    const chosen = memberships.find(m => m.organization_id === saved) || memberships[0] || null;
    selectedOrgId = chosen?.organization_id || '';
    safeWriteKey(persistentStore, LAST_ORG_KEY, selectedOrgId);
    orgSelect.value = selectedOrgId;
    loginForm.hidden = true;
    sessionBox.hidden = false;
    statusMessage = memberships.length ? t('signedIn') : t('noOrg');
    try {
      const [plans, tariffs] = await Promise.all([
        client.getPaymentPlans().catch(() => []),
        client.getRoleTariffs().catch(() => []),
      ]);
      if (plans?.length) activePlan = plans[0];
      if (tariffs?.length) roleTariffs = tariffs;
    } catch {}
    aliyaToggle.checked = Boolean(chosen?.aliya_enabled);
    rebuildPositionSelectors();
    renderLabels();
    if (selectedOrgId) {
      await checkLicenseOnline();
      await loadCloudRecords();
    }
  }

  function renderLabels() {
    trigger.textContent = t('trigger');
    head.textContent = t('heading');
    note.textContent = t('note');
    emailLbl.textContent = t('email');
    passLbl.textContent = t('password');
    signInBtn.textContent = t('signIn');
    signOutBtn.textContent = t('signOut');
    closeLoginBtn.textContent = t('close');
    closeSessionBtn.textContent = t('close');
    orgLbl.textContent = t('orgSelect');
    checkLicBtn.textContent = t('checkLicense');
    syncUpBtn.textContent = t('syncUp');
    syncDownBtn.textContent = t('syncDown');
    recTitle.textContent = t('receiptHeading');
    reqTitle.textContent = t('payRequisites');
    reqDetail.textContent = tg()
      ? `Рақам / Ҳамён: ${activePlan.recipient_phone} · Давомнокӣ: ${activePlan.duration_days} рӯз`
      : `Номер / Кошелёк: ${activePlan.recipient_phone} · Период: ${activePlan.duration_days} дн.`;
    copyPhoneBtn.textContent = t('copyPhone');
    posLbl.textContent = t('primaryPosLbl');
    extraLbl.textContent = t('extraPosLbl');
    aliyaTxt.textContent = tg()
      ? ` Функсияи Алия (+${ALIYA_ADDON_PRICE_TJS} сомонӣ / моҳ)`
      : ` Функция Алия (+${ALIYA_ADDON_PRICE_TJS} сомони / мес)`;
    for (const opt of provSelect.options) {
      const pair = providerLabels[opt.value];
      if (pair) opt.textContent = pair[tg() ? 0 : 1];
    }
    fileLbl.textContent = t('receiptFile');
    provLbl.textContent = t('provider');
    amtLbl.textContent = t('amount');
    ocrLbl.textContent = t('ocrText');
    sendReceiptBtn.textContent = t('sendReceipt');
    status.textContent = statusMessage;
    refreshGate();
  }

  copyPhoneBtn.addEventListener('click', async () => {
    try { await navigator.clipboard?.writeText(activePlan.recipient_phone); } catch {}
    statusMessage = `${t('copiedPhone')} ${activePlan.recipient_phone}`;
    renderLabels();
  });

  trigger.addEventListener('click', () => {
    panel.hidden = false;
    renderLabels();
    openWorkspaceView(panel.id, trigger);
  });
  for (const b of [closeLoginBtn, closeSessionBtn]) {
    b.addEventListener('click', () => {
      closeWorkspaceView(panel.id);
      panel.hidden = true;
    });
  }

  posSelect.addEventListener('change', () => {
    selectedExtras.delete(posSelect.value);
    manualAmountOverride = false;
    rebuildPositionSelectors();
  });

  aliyaToggle.addEventListener('change', () => {
    manualAmountOverride = false;
    updateTariffSummary();
  });

  amtInput.addEventListener('input', () => {
    manualAmountOverride = true;
  });

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    signInBtn.disabled = true;
    try {
      await client.signIn(emailInput.value, passInput.value);
      passInput.value = '';
      await applySignedInContext();
    } catch (err) {
      statusMessage = err?.message || t('authError');
      renderLabels();
    } finally {
      signInBtn.disabled = false;
    }
  });

  orgSelect.addEventListener('change', async () => {
    selectedOrgId = orgSelect.value;
    safeWriteKey(persistentStore, LAST_ORG_KEY, selectedOrgId);
    rebuildPositionSelectors();
    await checkLicenseOnline();
    await loadCloudRecords();
  });

  checkLicBtn.addEventListener('click', checkLicenseOnline);

  syncUpBtn.addEventListener('click', async () => {
    const activeSchool = school();
    if (!selectedOrgId || !activeSchool) return;
    try {
      const localSnapshot = {};
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('smartmaktab.demo.') && (key.includes(activeSchool.id) || key.includes('saved-'))) {
            const val = localStorage.getItem(key);
            if (typeof val === 'string' && val.length <= 64000) localSnapshot[key] = val;
          }
        }
      } catch {}
      await client.saveRecord({
        p_org_id: selectedOrgId,
        p_record_type: 'plan',
        p_title: `${activeSchool.name} · ${article.dataset.cabinetId}`,
        p_payload: { school: activeSchool, cabinet_id: article.dataset.cabinetId, local_snapshot: localSnapshot, synced_at: new Date().toISOString() },
      });
      statusMessage = t('savedCloud');
      renderLabels();
      await loadCloudRecords();
    } catch (err) {
      statusMessage = err.message;
      renderLabels();
    }
  });

  syncDownBtn.addEventListener('click', loadCloudRecords);
  ocrInput.addEventListener('input', updateParsedPreview);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) { receiptBytes = null; receiptBase64 = ''; return; }
    receiptBytes = new Uint8Array(await file.arrayBuffer());
    const base64Reader = await new Promise(resolve => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '');
      fr.onerror = () => resolve('');
      fr.readAsDataURL(file);
    });
    receiptBase64 = base64Reader;
    if (file.type.startsWith('image/')) {
      const ocr = await runClientOcr(file).catch(() => ({ text: '', confidence: null }));
      if (ocr.text) {
        ocrInput.value = ocr.text;
        receiptConfidence = ocr.confidence;
        updateParsedPreview();
      }
    }
  });

  receiptForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!client.session?.access_token || !selectedOrgId) return;
    if (!receiptBytes && !ocrInput.value.trim()) return;
    sendReceiptBtn.disabled = true;
    try {
      const payloadBytes = receiptBytes || new TextEncoder().encode(ocrInput.value.trim());
      await submitReceiptForVerification({
        accessToken: client.session.access_token,
        organizationId: selectedOrgId,
        bytes: payloadBytes,
        imageBase64: receiptBase64,
        providerCode: provSelect.value,
        amountDeclared: amtInput.value ? Number(amtInput.value) : null,
        ocrText: ocrInput.value,
        ocrConfidence: receiptConfidence,
        planCode: activePlan.code,
        primaryPosition: posSelect.value || cabinetId || null,
        extraPositions: [...selectedExtras],
        includeAliya: Boolean(aliyaToggle.checked),
      });
      statusMessage = t('receiptSent');
      receiptForm.reset();
      manualAmountOverride = false;
      selectedExtras.clear();
      rebuildPositionSelectors();
      receiptBytes = null;
      receiptBase64 = '';
      await checkLicenseOnline();
      renderLabels();
    } catch (err) {
      statusMessage = err?.code === 'duplicate_receipt' ? t('receiptDup') : err.message;
      renderLabels();
    } finally {
      sendReceiptBtn.disabled = false;
    }
  });

  signOutBtn.addEventListener('click', async () => {
    const prevOrg = selectedOrgId;
    await client.signOut();
    clearCachedLicense(prevOrg, persistentStore);
    safeWriteKey(persistentStore, LAST_ORG_KEY, '');
    ctx = null;
    selectedOrgId = '';
    loginForm.hidden = false;
    sessionBox.hidden = true;
    cloudList.replaceChildren();
    statusMessage = t('signedOut');
    renderLabels();
  });

  document.addEventListener('cabinet:language', () => {
    rebuildPositionSelectors();
    renderLabels();
  });
  rebuildPositionSelectors();
  renderLabels();
  if (client.session?.access_token) {
    void applySignedInContext().catch(async () => {
      await client.signOut();
      renderLabels();
    });
  }
}
