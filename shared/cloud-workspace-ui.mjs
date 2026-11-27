import { persistentStore } from './cabinet-runtime.mjs';
import { createCloudClient } from './cloud-client.mjs';
import { getCloudConfig } from './cloud-config.mjs';
import { cacheVerifiedLicense, clearCachedLicense, getOrCreateDeviceId, mountLicenseGate } from './license-guard.mjs';
import { DEFAULT_PAYMENT_TARIFF, parseReceiptText, runClientOcr, submitReceiptForVerification } from './ocr-receipt.mjs';
import {
  ALIYA_ADDON_PRICE_TJS,
  POSITION_CATALOG,
  SUBSCRIPTION_PERIOD_PACKAGES,
  canPositionVerifySchoolStaff,
  computePositionTariffTotal,
  computeSubscriptionPackagePrice,
  formatPositionTitle,
  getCompatibleExtraPositions,
  getPositionsForOrg,
} from './position-catalog.mjs';
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
  verifyTrigger: ['Верификатсия', 'Верификация'],
  heading: ['Ҳамоҳангсозии абрӣ, верификатсия ва обуна', 'Облачная синхронизация, верификация и подписка'],
  note: [
    'Барои ҳамоҳангсозии маълумот бо пойгоҳи додаҳо, тасдиқи ҳисоб ва обуна ворид шавед.',
    'Войдите для синхронизации с базой данных, верификации аккаунта и управления подпиской.',
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
  verifStatusLine: ['Ҳолати верификатсия', 'Статус верификации'],
  syncUp: ['Ҳамоҳангсозӣ бо абр', 'Сохранить данные кабинета в облако'],
  syncDown: ['Навсозӣ аз абр', 'Загрузить записи из облака'],
  restoreLocal: ['Барқарор дар ин дастгоҳ', 'Восстановить на устройство'],
  restoredLocal: ['Маълумот аз абр барқарор шуд.', 'Данные из облака восстановлены локально.'],
  verifHeading: ['Верификатсияи ҳисоб (барои дастрасӣ ба пойгоҳи додаҳо)', 'Верификация аккаунта (для доступа к базе данных)'],
  verifExplainDirector: [
    'Маълумоти худро фиристед. Дархости шуморо шуъбаи маориф ё раёсат тасдиқ мекунад. То тасдиқ танҳо бо файлҳои маҳаллӣ кор кардан мумкин аст.',
    'Отправьте данные на проверку. Вашу заявку подтвердит отдел образования (Маориф / Раёсат). До подтверждения доступен только локальный режим без базы данных.',
  ],
  verifExplainStaff: [
    'Маълумоти худро фиристед. Дархости шуморо директори мактаб, муовинон ё коргузор тасдиқ мекунад. То тасдиқ танҳо бо файлҳои маҳаллӣ кор кардан мумкин аст.',
    'Отправьте данные на проверку. Вашу заявку подтвердит директор школы, завуч или делопроизводитель. До подтверждения доступен только локальный режим без базы данных.',
  ],
  verifFullName: ['Ному насаб (ФИО)', 'ФИО полностью'],
  verifBirthDate: ['Санаи таваллуд (рр.мм.сссс)', 'Дата рождения (дд.мм.гггг)'],
  verifPhone: ['Рақами телефон', 'Номер телефона'],
  verifPassport: ['Рақами шиноснома (паспорт)', 'Номер паспорта'],
  verifSubmit: ['Фиристодан барои верификатсия', 'Отправить на верификацию'],
  verifSent: ['Дархости верификатсия фиристода шуд.', 'Заявка на верификацию отправлена.'],
  verifPendingNote: [
    'Дархости шумо дар ҳоли баррасӣ аст. Пас аз тасдиқ дастрасӣ ба пойгоҳи додаҳо кушода мешавад.',
    'Ваша заявка находится на рассмотрении. После подтверждения откроется доступ к базе данных.',
  ],
  verifVerifiedNote: [
    '✓ Ҳисоби шумо тасдиқ шудааст. Дастрасӣ ба пойгоҳи додаҳо пурра кушода аст.',
    '✓ Ваш аккаунт верифицирован. Доступ к базе данных полностью открыт.',
  ],
  verifRejectedDirector: [
    'Дархости тасдиқи шумо рад ва нест карда шуд. Лутфан ба шуъбаи маориф занг занед ё шахсан муроҷиат кунед.',
    'Ваша заявка на верификацию была отклонена и удалена. Пожалуйста, позвоните в отдел образования (Маориф) или обратитесь лично.',
  ],
  verifRejectedStaff: [
    'Дархости тасдиқи шумо рад ва нест карда шуд. Лутфан ба директори мактаб занг занед ё шахсан муроҷиат кунед.',
    'Ваша заявка на верификацию была отклонена и удалена. Пожалуйста, позвоните директору школы или обратитесь лично.',
  ],
  verifInvalidBirthDate: [
    'Санаи таваллудро дар шакли рр.мм.сссс ворид кунед (масалан 15.05.1985).',
    'Введите дату рождения в формате дд.мм.гггг (например 15.05.1985).',
  ],
  verifReviewHeading: ['Дархостҳои интизори верификатсияи кормандон / директорон', 'Ожидающие заявки на верификацию аккаунтов'],
  verifApproveBtn: ['Тасдиқ кардан', 'Подтвердить'],
  verifRejectBtn: ['Рад ва нест кардан', 'Отклонить и удалить'],
  verifReviewEmpty: ['Дархости нави верификатсия нест.', 'Новых заявок на верификацию нет.'],
  receiptHeading: ['Тасдиқи пардохт ва интихоби давраи обуна', 'Оплата подписки и загрузка чека'],
  payPrimaryOnlyBox: [
    'Вазъи обуна дар ҳама утоқҳо нишон дода мешавад, аммо тугмаи пардохт танҳо дар утоқи вазифаи асосии шумо дастрас аст:',
    'Статус подписки отображается в каждом окне, но оплата доступна только в окне вашей основной должности:',
  ],
  payRequisites: ['Маълумот барои пардохт', 'Реквизиты для оплаты'],
  copyPhone: ['Нусхабардории рақам', 'Скопировать номер'],
  copiedPhone: ['Рақам нусхабардорӣ шуд:', 'Номер скопирован:'],
  primaryPosLbl: ['Вазифаи асосӣ барои обуна', 'Основная должность для подписки'],
  periodLbl: ['Муҳлати обуна (таърифи тахфиф)', 'Период подписки (со скидкой)'],
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

function formatBirthDateInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
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

  const verifBannerHost = make('div', 'no-print');
  verifBannerHost.id = 'accountVerificationBanner';
  verifBannerHost.hidden = true;
  gateHost.after(verifBannerHost);

  const triggerWrap = make('div', 'control');
  const trigger = make('button', 'button alt');
  trigger.type = 'button';
  trigger.dataset.cloudPanelTrigger = '';
  const verifyQuickBtn = make('button', 'button');
  verifyQuickBtn.type = 'button';
  verifyQuickBtn.id = 'accountVerifyTriggerBtn';
  verifyQuickBtn.hidden = true;
  triggerWrap.append(trigger, verifyQuickBtn);
  group.append(triggerWrap);

  const panel = make('section', 'section no-print');
  panel.id = 'cloudWorkspacePanel';
  panel.hidden = true;
  const docsAnchor = document.getElementById('workspaceDocs');
  if (docsAnchor?.after) docsAnchor.after(panel);
  else article.append(panel);

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
  const verifStatusLine = make('p', 'small');
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

  // Account Verification section
  const verifBox = make('section', 'section');
  verifBox.id = 'cloudVerificationBox';
  const verifTitle = make('h3');
  const verifInfo = make('p', 'notice');
  const verifForm = make('form', 'school-fields');
  verifForm.id = 'smAccountVerifyForm';
  verifForm.autocomplete = 'off';

  const vNameWrap = make('label', 'field');
  const vNameLbl = make('span');
  const vNameInp = make('input');
  vNameInp.type = 'text';
  vNameInp.id = 'smAccVerifFullName';
  vNameInp.required = true;
  vNameInp.maxLength = 160;
  vNameWrap.append(vNameLbl, vNameInp);

  const vBirthWrap = make('label', 'field');
  const vBirthLbl = make('span');
  const vBirthInp = make('input');
  vBirthInp.type = 'text';
  vBirthInp.id = 'smAccVerifBirthDate';
  vBirthInp.required = true;
  vBirthInp.maxLength = 10;
  vBirthInp.placeholder = '15.05.1985';
  vBirthInp.inputMode = 'numeric';
  vBirthWrap.append(vBirthLbl, vBirthInp);

  const vPhoneWrap = make('label', 'field');
  const vPhoneLbl = make('span');
  const vPhoneInp = make('input');
  vPhoneInp.type = 'text';
  vPhoneInp.id = 'smAccVerifPhone';
  vPhoneInp.required = true;
  vPhoneInp.maxLength = 40;
  vPhoneInp.placeholder = '+992 92 000 00 00';
  vPhoneWrap.append(vPhoneLbl, vPhoneInp);

  const vPassWrap = make('label', 'field');
  const vPassLbl = make('span');
  const vPassInp = make('input');
  vPassInp.type = 'text';
  vPassInp.id = 'smAccVerifPassport';
  vPassInp.required = true;
  vPassInp.maxLength = 40;
  vPassInp.placeholder = 'A1234567';
  vPassWrap.append(vPassLbl, vPassInp);

  const vSubmitBtn = make('button', 'button');
  vSubmitBtn.type = 'submit';
  vSubmitBtn.id = 'smAccVerifSubmitBtn';
  verifForm.append(vNameWrap, vBirthWrap, vPhoneWrap, vPassWrap, vSubmitBtn);
  verifBox.append(verifTitle, verifInfo, verifForm);

  // Verifier Review Queue section (for Maorif, Director, Deputies, Clerk, Super-admin)
  const reviewQueueBox = make('section', 'section');
  reviewQueueBox.id = 'cloudReviewVerifBox';
  reviewQueueBox.hidden = true;
  const reviewQueueTitle = make('h3');
  const reviewQueueList = make('div');
  reviewQueueBox.append(reviewQueueTitle, reviewQueueList);

  const cloudList = make('ul');

  const payNoticeBox = make('p', 'notice');
  payNoticeBox.id = 'cloudPayPrimaryOnlyNotice';
  payNoticeBox.hidden = true;

  const receiptForm = make('form', 'school-fields');
  receiptForm.id = 'cloudReceiptForm';
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

  const periodWrap = make('label', 'field');
  const periodLbl = make('span');
  const periodSelect = make('select');
  periodSelect.id = 'cloudSubscriptionMonths';
  periodWrap.append(periodLbl, periodSelect);

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
  sendReceiptBtn.id = 'cloudSubmitReceiptBtn';
  receiptForm.append(
    recTitle,
    reqBox,
    posWrap,
    periodWrap,
    extraWrap,
    fileWrap,
    provWrap,
    amtWrap,
    ocrWrap,
    sendReceiptBtn,
  );

  sessionBox.append(
    orgWrap,
    licLine,
    scopeLine,
    verifStatusLine,
    actionRow,
    verifBox,
    reviewQueueBox,
    cloudList,
    payNoticeBox,
    receiptForm,
  );
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
  let pendingVerifQueue = [];

  function activeOrg() {
    return (ctx?.memberships || []).find(m => m.organization_id === selectedOrgId) || null;
  }

  function isCurrentCabinetPrimary() {
    const m = activeOrg();
    if (!m || !m.primary_position || !cabinetId) return true;
    return cabinetId === m.primary_position;
  }

  function isAccountVerified() {
    if (ctx?.is_super_admin) return true;
    const m = activeOrg();
    if (!m) return true;
    return m.verification_status === 'verified';
  }

  function canReviewVerifications() {
    if (ctx?.is_super_admin) return true;
    const m = activeOrg();
    if (!m) return false;
    if (m.kind === 'education_authority') return m.verification_status === 'verified' || m.role === 'district_observer';
    return m.verification_status === 'verified' && canPositionVerifySchoolStaff(m.primary_position);
  }

  function syncLocalProfileCloudState() {
    try {
      const m = activeOrg();
      const raw = safeReadKey(persistentStore, 'smartmaktab.profile.v1');
      const prof = raw ? (JSON.parse(raw) || {}) : {};
      if (client.session?.access_token && m) {
        prof.organizationId = selectedOrgId || prof.organizationId || '';
        prof.organizationName = m.organization_name || prof.organizationName || '';
        prof.verificationStatus = ctx?.is_super_admin ? 'verified' : (m.verification_status || 'unverified');
        prof.primaryPosition = m.primary_position || prof.primaryPosition || '';
        prof.canReviewVerifications = canReviewVerifications();
        if (ctx?.profile?.full_name && !prof.fullName) prof.fullName = ctx.profile.full_name;
      } else {
        delete prof.verificationStatus;
        delete prof.canReviewVerifications;
      }
      safeWriteKey(persistentStore, 'smartmaktab.profile.v1', JSON.stringify(prof));
    } catch {}
  }

  function emitCloudContextChange() {
    syncLocalProfileCloudState();
    try {
      const m = activeOrg();
      document.dispatchEvent(new CustomEvent('sm:cloud-context-changed', {
        detail: {
          signedIn: Boolean(client.session?.access_token),
          orgId: selectedOrgId,
          verificationStatus: ctx?.is_super_admin ? 'verified' : (m?.verification_status || 'unverified'),
          verified: isAccountVerified(),
          isPrimaryPosition: isCurrentCabinetPrimary(),
          canReviewVerifications: canReviewVerifications(),
          primaryPosition: m?.primary_position || null,
          pendingQueueCount: pendingVerifQueue.length,
        },
      }));
    } catch {}
  }

  function openCloudToVerification() {
    panel.hidden = false;
    renderLabels();
    openWorkspaceView(panel.id, verifyQuickBtn.hidden ? trigger : verifyQuickBtn);
    try { verifBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  }

  function refreshGate() {
    const m = activeOrg();
    const isPrimary = isCurrentCabinetPrimary();
    const state = mountLicenseGate(gateHost, {
      orgId: selectedOrgId,
      cabinetId,
      storage: persistentStore,
      isPrimaryPosition: isPrimary,
      primaryPosition: m?.primary_position || null,
      onVerifyOnline: checkLicenseOnline,
      onOpenPayment: isPrimary ? () => {
        panel.hidden = false;
        openWorkspaceView(panel.id, trigger);
        try { receiptForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
      } : undefined,
    });

    const signedIn = Boolean(client.session?.access_token && m);
    const verified = isAccountVerified();
    const blockedByLic = !state.allowed;
    const blockedByVerif = signedIn && !verified;
    syncUpBtn.disabled = blockedByLic || blockedByVerif;
    syncDownBtn.disabled = blockedByLic || blockedByVerif;

    verifBannerHost.replaceChildren();
    verifBannerHost.hidden = !blockedByVerif;
    verifyQuickBtn.hidden = !(blockedByVerif || pendingVerifQueue.length > 0);
    verifyQuickBtn.textContent = pendingVerifQueue.length > 0 && !blockedByVerif
      ? `${t('verifyTrigger')} (${pendingVerifQueue.length})`
      : t('verifyTrigger');
    if (blockedByVerif) {
      const box = make('div', 'notice sm-verif-banner');
      const txtEl = make('p', 'small');
      const vStat = m.verification_status || 'unverified';
      const isDir = m.primary_position === 'school-director';
      if (vStat === 'rejected') {
        txtEl.textContent = isDir ? t('verifRejectedDirector') : t('verifRejectedStaff');
      } else if (vStat === 'pending') {
        txtEl.textContent = t('verifPendingNote');
      } else {
        txtEl.textContent = isDir ? t('verifExplainDirector') : t('verifExplainStaff');
      }
      const btn = make('button', 'button');
      btn.type = 'button';
      btn.textContent = t('verifyTrigger');
      btn.addEventListener('click', openCloudToVerification);
      box.append(txtEl, btn);
      verifBannerHost.append(box);
    }

    return state;
  }

  function rebuildPeriodSelector() {
    const prevVal = periodSelect.value || '1';
    periodSelect.replaceChildren(...SUBSCRIPTION_PERIOD_PACKAGES.map(pkg => {
      const discTxt = pkg.discountPct > 0
        ? (tg() ? ` (-${pkg.discountPct}% тахфиф)` : ` (-${pkg.discountPct}% скидка)`)
        : '';
      const label = `${pkg.months} ${tg() ? 'моҳ' : 'мес.'} (${pkg.days} ${tg() ? 'рӯз' : 'дн.'})${discTxt}`;
      return new Option(label, String(pkg.months));
    }));
    periodSelect.value = SUBSCRIPTION_PERIOD_PACKAGES.some(p => String(p.months) === prevVal) ? prevVal : '1';
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

    rebuildPeriodSelector();

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
    const months = Number(periodSelect.value || 1);
    const calc = computePositionTariffTotal({
      primaryPosition: primary,
      extraPositions: extras,
      tariffs: roleTariffs,
      includeAliya,
    });
    const pkgCalc = computeSubscriptionPackagePrice(calc.totalTjs, months);
    if (!manualAmountOverride) {
      amtInput.value = String(pkgCalc.totalTjs);
    }
    const aliyaPart = includeAliya ? ` + Алия (${calc.aliyaPrice} TJS)` : '';
    const discPart = pkgCalc.discountPct > 0
      ? (tg()
        ? ` · ${pkgCalc.months} моҳ (-${pkgCalc.discountPct}%, сарфа ${pkgCalc.savedTjs} TJS)`
        : ` · ${pkgCalc.months} мес. (-${pkgCalc.discountPct}%, экономия ${pkgCalc.savedTjs} TJS)`)
      : (tg() ? ` · ${pkgCalc.months} моҳ` : ` · ${pkgCalc.months} мес.`);
    tariffCalcLine.textContent = tg()
      ? `Тарофаи моҳона: ${calc.basePrice} + ${extras.length} иловагӣ (${calc.extrasPrice})${aliyaPart} = ${calc.totalTjs} TJS/моҳ${discPart} → Ҳамагӣ: ${pkgCalc.totalTjs} TJS`
      : `Месячный тариф: ${calc.basePrice} + ${extras.length} доп. (${calc.extrasPrice})${aliyaPart} = ${calc.totalTjs} TJS/мес${discPart} → Итого: ${pkgCalc.totalTjs} TJS`;
  }

  function renderVerificationSection() {
    const m = activeOrg();
    if (!m) {
      verifBox.hidden = true;
      return;
    }
    verifBox.hidden = false;
    const vStat = ctx?.is_super_admin ? 'verified' : (m.verification_status || 'unverified');
    const isDir = m.primary_position === 'school-director';
    const prof = ctx?.profile || {};
    if (!vNameInp.value && (prof.full_name || m.verification_full_name)) {
      vNameInp.value = m.verification_full_name || prof.full_name || '';
    }
    if (!vBirthInp.value && m.verification_birth_date) vBirthInp.value = m.verification_birth_date;
    if (!vPhoneInp.value && m.verification_phone) vPhoneInp.value = m.verification_phone;
    if (!vPassInp.value && m.verification_passport_number) vPassInp.value = m.verification_passport_number;

    const statusMap = {
      unverified: tg() ? 'Тасдиқ нашудааст' : 'Не верифицирован',
      pending: tg() ? 'Дар баррасӣ' : 'На проверке',
      verified: tg() ? 'Тасдиқ шудааст ✓' : 'Верифицирован ✓',
      rejected: tg() ? 'Рад карда шуд (аз нав фиристед)' : 'Отклонён (подайте заново)',
    };
    verifStatusLine.textContent = `${t('verifStatusLine')}: ${statusMap[vStat] || vStat}`;

    if (vStat === 'verified') {
      verifInfo.textContent = t('verifVerifiedNote');
      verifForm.hidden = true;
    } else if (vStat === 'pending') {
      verifInfo.textContent = t('verifPendingNote');
      verifForm.hidden = false;
    } else if (vStat === 'rejected') {
      verifInfo.textContent = isDir ? t('verifRejectedDirector') : t('verifRejectedStaff');
      verifForm.hidden = false;
    } else {
      verifInfo.textContent = isDir ? t('verifExplainDirector') : t('verifExplainStaff');
      verifForm.hidden = false;
    }
  }

  async function loadPendingVerificationQueue() {
    if (!client.session?.access_token || !canReviewVerifications()) {
      reviewQueueBox.hidden = true;
      return;
    }
    try {
      const m = activeOrg();
      const rows = await client.getPendingAccountVerifications(
        ctx?.is_super_admin || m?.kind === 'education_authority' ? null : (selectedOrgId || null),
      );
      pendingVerifQueue = Array.isArray(rows) ? rows : [];
      emitCloudContextChange();
      renderReviewQueue();
      refreshGate();
    } catch {
      reviewQueueBox.hidden = true;
    }
  }

  function renderReviewQueue() {
    if (!canReviewVerifications()) {
      reviewQueueBox.hidden = true;
      return;
    }
    reviewQueueBox.hidden = false;
    reviewQueueTitle.textContent = t('verifReviewHeading');
    if (!pendingVerifQueue.length) {
      const empty = make('p', 'small');
      empty.textContent = t('verifReviewEmpty');
      reviewQueueList.replaceChildren(empty);
      return;
    }
    const items = pendingVerifQueue.map(req => {
      const card = make('div', 'notice');
      card.style.marginBottom = '10px';
      const headLine = make('strong');
      headLine.textContent = `${req.full_name} — ${formatPositionTitle(req.primary_position, langCode())}`;
      const detail = make('p', 'small');
      const place = [req.organization_name, req.district_name, req.jamoat_name, req.village_name].filter(Boolean).join(' · ');
      detail.textContent = `${place} | ${tg() ? 'Тав.' : 'Рожд.'}: ${req.birth_date} | ${tg() ? 'Тел.' : 'Тел.'}: ${req.phone} | ${tg() ? 'Шиноснома' : 'Паспорт'}: ${req.passport_number}`;
      const row = make('div', 'control');
      const appBtn = make('button', 'button');
      appBtn.type = 'button';
      appBtn.textContent = t('verifApproveBtn');
      appBtn.addEventListener('click', async () => {
        appBtn.disabled = true;
        try {
          await client.reviewAccountVerification({
            p_membership_id: req.membership_id || req.id,
            p_decision: 'verified',
            p_note: '',
          });
          await applySignedInContext();
        } catch (err) {
          statusMessage = err?.message || t('authError');
          renderLabels();
        }
      });
      const rejBtn = make('button', 'button alt');
      rejBtn.type = 'button';
      rejBtn.textContent = t('verifRejectBtn');
      rejBtn.addEventListener('click', async () => {
        rejBtn.disabled = true;
        try {
          await client.reviewAccountVerification({
            p_membership_id: req.membership_id || req.id,
            p_decision: 'rejected',
            p_note: '',
          });
          await loadPendingVerificationQueue();
        } catch (err) {
          statusMessage = err?.message || t('authError');
          renderLabels();
        }
      });
      row.append(appBtn, rejBtn);
      card.append(headLine, detail, row);
      return card;
    });
    reviewQueueList.replaceChildren(...items);
  }

  function updatePaymentVisibility() {
    const m = activeOrg();
    const isPrimary = isCurrentCabinetPrimary();
    receiptForm.hidden = !isPrimary;
    payNoticeBox.hidden = isPrimary || !m;
    if (!isPrimary && m) {
      const primName = m.primary_position ? formatPositionTitle(m.primary_position, langCode()) : m.role;
      payNoticeBox.textContent = `${t('payPrimaryOnlyBox')} ${primName}`;
    }
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
      const statusTxt = res.effective_status === 'trial'
        ? (tg() ? 'Давраи ройгон (1 моҳ)' : 'Бесплатный период (1 мес.)')
        : res.effective_status;
      licLine.textContent = tg()
        ? `${t('licenseLine')}: ${statusTxt} (${durVal} рӯз) · Дастгоҳҳо: ${devRes?.active_devices ?? 1}/${devRes?.max_devices ?? m?.max_devices ?? 1}`
        : `${t('licenseLine')}: ${statusTxt} (${durVal} дн.) · Устройства: ${devRes?.active_devices ?? 1}/${devRes?.max_devices ?? m?.max_devices ?? 1}`;

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
    if (!isAccountVerified()) {
      cloudList.replaceChildren();
      return;
    }
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
    renderVerificationSection();
    updatePaymentVisibility();
    emitCloudContextChange();
    renderLabels();
    if (selectedOrgId) {
      await checkLicenseOnline();
      await loadCloudRecords();
    }
    await loadPendingVerificationQueue();
  }

  function renderLabels() {
    trigger.textContent = t('trigger');
    verifyQuickBtn.textContent = t('verifyTrigger');
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
    verifTitle.textContent = t('verifHeading');
    vNameLbl.textContent = t('verifFullName');
    vBirthLbl.textContent = t('verifBirthDate');
    vPhoneLbl.textContent = t('verifPhone');
    vPassLbl.textContent = t('verifPassport');
    vSubmitBtn.textContent = t('verifSubmit');
    recTitle.textContent = t('receiptHeading');
    reqTitle.textContent = t('payRequisites');
    reqDetail.textContent = tg()
      ? `Рақам / Ҳамён: ${activePlan.recipient_phone}`
      : `Номер / Кошелёк: ${activePlan.recipient_phone}`;
    copyPhoneBtn.textContent = t('copyPhone');
    posLbl.textContent = t('primaryPosLbl');
    periodLbl.textContent = t('periodLbl');
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
    renderVerificationSection();
    updatePaymentVisibility();
    renderReviewQueue();
    refreshGate();
  }

  vBirthInp.addEventListener('input', () => {
    vBirthInp.value = formatBirthDateInput(vBirthInp.value);
  });

  verifForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!client.session?.access_token || !selectedOrgId) return;
    const birthDate = vBirthInp.value.trim();
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(birthDate)) {
      statusMessage = t('verifInvalidBirthDate');
      renderLabels();
      return;
    }
    vSubmitBtn.disabled = true;
    try {
      await client.submitAccountVerification({
        p_org_id: selectedOrgId,
        p_full_name: vNameInp.value.trim(),
        p_birth_date: birthDate,
        p_phone: vPhoneInp.value.trim(),
        p_passport_number: vPassInp.value.trim(),
      });
      statusMessage = t('verifSent');
      await applySignedInContext();
    } catch (err) {
      statusMessage = err?.message || t('authError');
      renderLabels();
    } finally {
      vSubmitBtn.disabled = false;
    }
  });

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
  verifyQuickBtn.addEventListener('click', openCloudToVerification);

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

  periodSelect.addEventListener('change', () => {
    manualAmountOverride = false;
    updateTariffSummary();
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
    renderVerificationSection();
    updatePaymentVisibility();
    emitCloudContextChange();
    await checkLicenseOnline();
    await loadCloudRecords();
    await loadPendingVerificationQueue();
  });

  checkLicBtn.addEventListener('click', checkLicenseOnline);

  syncUpBtn.addEventListener('click', async () => {
    const activeSchool = school();
    if (!selectedOrgId || !activeSchool || !isAccountVerified()) return;
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
    if (!client.session?.access_token || !selectedOrgId || !isCurrentCabinetPrimary()) return;
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
        months: Number(periodSelect.value || 1),
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
    pendingVerifQueue = [];
    loginForm.hidden = false;
    sessionBox.hidden = true;
    cloudList.replaceChildren();
    statusMessage = t('signedOut');
    emitCloudContextChange();
    renderLabels();
  });

  document.addEventListener('sm:open-account-verification', openCloudToVerification);
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
