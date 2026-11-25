import { persistentStore } from './cabinet-runtime.mjs';
import { createCloudClient } from './cloud-client.mjs';
import { getCloudConfig } from './cloud-config.mjs';
import { cacheVerifiedLicense, mountLicenseGate } from './license-guard.mjs';
import { parseReceiptText, runClientOcr, submitReceiptForVerification } from './ocr-receipt.mjs';
import { openWorkspaceView, closeWorkspaceView } from './workspace-view.mjs';

const copy = {
  trigger: ['Облако ва обуна', 'Облако и подписка'],
  heading: ['Ҳамоҳангсозии абрӣ ва обуна', 'Облачная синхронизация и подписка'],
  note: [
    'Барои ҳамоҳангсозии маълумот бо сервери мактаб ва санҷиши иҷозатнома (30 рӯз офлайн) ворид шавед.',
    'Войдите для синхронизации данных школы с облаком и проверки лицензии (30 дней офлайн).',
  ],
  email: ['Почтаи корӣ', 'Рабочая почта'],
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
  syncUp: ['Ҳамоҳангсозӣ бо абр', 'Сохранить данные кабинета в облако'],
  syncDown: ['Навсозӣ аз абр', 'Загрузить записи из облака'],
  restoreLocal: ['Барқарор дар ин дастгоҳ', 'Восстановить на устройство'],
  restoredLocal: ['Маълумот аз абр барқарор шуд.', 'Данные из облака восстановлены локально.'],
  receiptHeading: ['Тасдиқи пардохт тавассути чек (OCR)', 'Подтверждение оплаты по чеку (OCR)'],
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
};

export function setupCloudWorkspace(article, group, school) {
  const tg = () => document.documentElement.lang !== 'ru';
  const t = k => copy[k][tg() ? 0 : 1];
  const make = (tag, cls) => { const x = document.createElement(tag); if (cls) x.className = cls; return x; };

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
  emailInput.type = 'email';
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
  receiptForm.append(recTitle, reqBox, fileWrap, provWrap, amtWrap, ocrWrap, sendReceiptBtn);

  sessionBox.append(orgWrap, licLine, actionRow, cloudList, receiptForm);
  panel.append(head, note, status, loginForm, sessionBox);

  const client = createCloudClient({
    config: getCloudConfig(),
    storage: persistentStore,
    storageKey: 'smartmaktab.cloud.session.v1',
  });
  let ctx = null;
  let selectedOrgId = '';
  let statusMessage = t('signedOut');
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

  function activeOrg() {
    return (ctx?.memberships || []).find(m => m.organization_id === selectedOrgId) || null;
  }

  function refreshGate() {
    mountLicenseGate(gateHost, {
      orgId: selectedOrgId,
      onVerifyOnline: checkLicenseOnline,
      onOpenPayment: () => {
        panel.hidden = false;
        openWorkspaceView(panel.id, trigger);
      },
    });
  }

  async function checkLicenseOnline() {
    if (!client.session?.access_token || !selectedOrgId) return;
    try {
      const res = await client.getLicenseStatus(selectedOrgId);
      cacheVerifiedLicense(selectedOrgId, res);
      licLine.textContent = `${t('licenseLine')}: ${res.effective_status} (${res.effective_status === 'grace' ? res.grace_days_left : res.days_left}d)`;
      refreshGate();
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
    if (p.detectedAmount !== null) amtInput.value = String(p.detectedAmount);
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
    orgSelect.replaceChildren(...memberships.map(m => new Option(`${m.organization_name} (${m.role})`, m.organization_id)));
    selectedOrgId = memberships[0]?.organization_id || '';
    orgSelect.value = selectedOrgId;
    loginForm.hidden = true;
    sessionBox.hidden = false;
    statusMessage = memberships.length ? `${t('signedIn')} (${ctx.user_id})` : t('noOrg');
    try {
      const plans = await client.getPaymentPlans();
      if (plans?.length) {
        activePlan = plans[0];
        if (!amtInput.value || amtInput.value === String(DEFAULT_PAYMENT_TARIFF.priceTjs)) {
          amtInput.value = String(activePlan.price_tjs);
        }
      }
    } catch {}
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
      ? `Рақам / Ҳамён: ${activePlan.recipient_phone} · Маблағ: ${activePlan.price_tjs} TJS (${activePlan.duration_days} рӯз)`
      : `Номер / Кошелёк: ${activePlan.recipient_phone} · Тариф: ${activePlan.price_tjs} TJS (${activePlan.duration_days} дн.)`;
    copyPhoneBtn.textContent = t('copyPhone');
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
      });
      statusMessage = t('receiptSent');
      receiptForm.reset();
      amtInput.value = String(activePlan.price_tjs);
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
    await client.signOut();
    ctx = null;
    selectedOrgId = '';
    loginForm.hidden = false;
    sessionBox.hidden = true;
    cloudList.replaceChildren();
    statusMessage = t('signedOut');
    renderLabels();
  });

  document.addEventListener('cabinet:language', renderLabels);
  renderLabels();
  if (client.session?.access_token) {
    void applySignedInContext().catch(async () => {
      await client.signOut();
      renderLabels();
    });
  }
}
