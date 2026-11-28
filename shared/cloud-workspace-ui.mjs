import { appRoot, clearActiveResume, openCabinetView, persistentStore } from './cabinet-runtime.mjs';
import { createCloudClient } from './cloud-client.mjs';
import { getCloudConfig } from './cloud-config.mjs';
import { cacheVerifiedLicense, clearCachedLicense, detectDeviceKind, getOrCreateDeviceId, mountLicenseGate } from './license-guard.mjs';
import { DEFAULT_PAYMENT_TARIFF, parseReceiptText, runClientOcr, submitReceiptForVerification } from './ocr-receipt.mjs';
import {
  ALIYA_ADDON_PRICE_TJS,
  POSITION_CATALOG,
  SUBSCRIPTION_PERIOD_PACKAGES,
  canPositionManageUsers,
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
  trigger: ['Система ва обуна', 'Система и подписка'],
  verifyTrigger: ['Верификатсия', 'Верификация'],
  heading: ['Ҳамоҳангсозии система, верификатсия ва обуна', 'Синхронизация с системой, верификация и подписка'],
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
  signedIn: ['Пайваст ба система фаъол аст.', 'Подключение к системе активно.'],
  orgSelect: ['Муассисаи фаъол дар система', 'Активная организация в системе'],
  noOrg: ['Ягон муассиса ба ин ҳисоб вобаста нашудааст.', 'К этому аккаунту не привязана организация.'],
  checkLicense: ['Тафтиши иҷозатнома', 'Проверить лицензию'],
  licenseLine: ['Ҳолати иҷозатнома', 'Статус лицензии'],
  accessLine: ['Дастрасии шумо', 'Ваш доступ'],
  verifStatusLine: ['Ҳолати верификатсия', 'Статус верификации'],
  syncUp: ['Ҳамоҳангсозӣ бо система', 'Сохранить данные кабинета в систему'],
  syncDown: ['Навсозӣ аз система', 'Загрузить записи из системы'],
  restoreLocal: ['Барқарор дар ин дастгоҳ', 'Восстановить на устройство'],
  restoredLocal: ['Маълумот аз система барқарор шуд.', 'Данные из системы восстановлены локально.'],
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
  savedCloud: ['Сабт ба система ирсол шуд.', 'Запись сохранена в систему.'],
  recordsEmpty: ['Сабтҳои система ёфт нашуданд.', 'Записи в системе не найдены.'],
  authError: ['Хатои воридшавӣ ё шабака.', 'Ошибка входа или сети.'],
  deviceBlockedMsg: [
    'Огоҳӣ: Лимити дастгоҳҳои ин намуд пур шудааст. Дастгоҳи кӯҳнаро дар зер ҷудо кунед ё ба роҳбари муассиса муроҷиат намоед.',
    'Внимание: достигнут лимит устройств данного типа. Отвяжите старое устройство ниже или обратитесь к руководителю.',
  ],
  posBlockedMsg: [
    'Огоҳӣ: Ин утоқ ба вазифаи пардохтшудаи шумо дохил намешавад.',
    'Внимание: этот кабинет не входит в ваш оплаченный тариф.',
  ],
  myDevicesHeading: ['Дастгоҳҳои ман (телефон ва компютер)', 'Мои устройства (телефон и компьютер)'],
  myDevicesEmpty: ['Ягон дастгоҳи фаъол сабт нашудааст.', 'Активных устройств не найдено.'],
  unlinkDeviceBtn: ['Ҷудо кардан', 'Отвязать'],
  currentDeviceTag: ['Ин дастгоҳ', 'Это устройство'],
  deviceUnlinked: ['Дастгоҳ ҷудо карда шуд.', 'Устройство отвязано.'],
  mobileKind: ['Мобайл', 'Мобильное'],
  desktopKind: ['Компютер', 'Компьютер'],
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

  const devicesBox = make('section', 'section');
  devicesBox.id = 'cloudDevicesBox';
  devicesBox.hidden = true;
  const devicesTitle = make('h3');
  const devicesSummary = make('p', 'small');
  const devicesList = make('ul', 'sm-device-list');
  devicesList.id = 'cloudDevicesList';
  devicesBox.append(devicesTitle, devicesSummary, devicesList);

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
  const extraListBox = make('div');
  extraListBox.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin:8px 0;';
  const aliyaLabel = make('label');
  aliyaLabel.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line,#d1d5db);border-radius:10px;cursor:pointer;margin:6px 0;font-size:13px;font-weight:600;';
  const aliyaToggle = make('input');
  aliyaToggle.type = 'checkbox';
  aliyaToggle.id = 'cloudAliyaAddonToggle';
  aliyaToggle.style.cssText = 'width:18px;height:18px;flex-shrink:0;cursor:pointer;';
  const aliyaTxt = make('span');
  aliyaLabel.append(aliyaToggle, aliyaTxt);
  const tariffCalcLine = make('div', 'notice');
  tariffCalcLine.style.cssText = 'margin-top:8px;padding:10px 12px;border-radius:10px;font-size:13px;font-weight:700;';
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

  provWrap.hidden = true;
  amtWrap.hidden = true;
  ocrWrap.hidden = true;

  reqBox.style.cssText = 'border:1px solid #fecaca;background:#fef2f2;color:#991b1b;padding:12px 14px;border-radius:10px;display:grid;gap:8px;';
  reqTitle.style.color = '#991b1b';
  reqDetail.style.cssText = 'color:#991b1b;font-size:13px;font-weight:500;margin:0;';

  let payStep = 1;
  const step1Nav = make('div', 'control school-field-wide');
  const payNext1Btn = make('button', 'button');
  payNext1Btn.type = 'button';
  payNext1Btn.textContent = !tg() ? 'Далее: доп. должности →' : 'Идома: вазифаҳои иловагӣ →';
  step1Nav.append(payNext1Btn);

  const step2Nav = make('div', 'control school-field-wide');
  const payBack2Btn = make('button', 'button alt');
  payBack2Btn.type = 'button';
  payBack2Btn.textContent = !tg() ? '← Назад' : '← Бозгашт';
  const paySkip2Btn = make('button', 'button alt');
  paySkip2Btn.type = 'button';
  paySkip2Btn.textContent = !tg() ? 'Пропустить →' : 'Гузаштан →';
  const payNext2Btn = make('button', 'button');
  payNext2Btn.type = 'button';
  payNext2Btn.textContent = !tg() ? 'Перейти к оплате →' : 'Гузаштан ба пардохт →';
  step2Nav.append(payBack2Btn, paySkip2Btn, payNext2Btn);

  const step3Nav = make('div', 'control school-field-wide');
  const payBack3Btn = make('button', 'button alt');
  payBack3Btn.type = 'button';
  payBack3Btn.textContent = !tg() ? '← Назад' : '← Бозгашт';

  const sendReceiptBtn = make('button', 'button');
  sendReceiptBtn.type = 'submit';
  sendReceiptBtn.id = 'cloudSubmitReceiptBtn';
  step3Nav.append(payBack3Btn, sendReceiptBtn);

  function syncPayWizardStep() {
    posWrap.hidden = payStep !== 1;
    periodWrap.hidden = payStep !== 1;
    step1Nav.hidden = payStep !== 1;
    extraWrap.hidden = payStep !== 2;
    step2Nav.hidden = payStep !== 2;
    reqBox.hidden = payStep !== 3;
    fileWrap.hidden = payStep !== 3;
    step3Nav.hidden = payStep !== 3;
  }
  payNext1Btn.addEventListener('click', () => { payStep = 2; syncPayWizardStep(); });
  payBack2Btn.addEventListener('click', () => { payStep = 1; syncPayWizardStep(); });
  paySkip2Btn.addEventListener('click', () => { selectedExtras.clear(); rebuildPositionSelectors(); payStep = 3; syncPayWizardStep(); });
  payNext2Btn.addEventListener('click', () => { payStep = 3; syncPayWizardStep(); });
  payBack3Btn.addEventListener('click', () => { payStep = 2; syncPayWizardStep(); });
  syncPayWizardStep();

  receiptForm.append(
    recTitle,
    posWrap,
    periodWrap,
    step1Nav,
    extraWrap,
    step2Nav,
    reqBox,
    fileWrap,
    provWrap,
    amtWrap,
    ocrWrap,
    step3Nav,
  );

  sessionBox.append(
    orgWrap,
    licLine,
    scopeLine,
    verifStatusLine,
    actionRow,
    devicesBox,
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
  let myDeviceSessions = [];
  let lastDeviceStats = { maxTotal: 2, maxPerKind: 1, activeTotal: 1, activeMobile: 0, activeDesktop: 0 };
  let panelFocusMode = 'all';

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

  function canManageUsers() {
    if (ctx?.is_super_admin) return true;
    const m = activeOrg();
    if (!m || m.verification_status !== 'verified') return false;
    return canPositionManageUsers(m.primary_position)
      || (Array.isArray(m.extra_positions) && m.extra_positions.some(canPositionManageUsers))
      || m.role === 'school_admin' || m.role === 'director' || m.role === 'maorif' || m.role === 'authority_viewer';
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
        prof.canManageUsers = canManageUsers();
        if (ctx?.profile?.full_name && !prof.fullName) prof.fullName = ctx.profile.full_name;
      } else {
        delete prof.verificationStatus;
        delete prof.canReviewVerifications;
        delete prof.canManageUsers;
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
          canManageUsers: canManageUsers(),
          primaryPosition: m?.primary_position || null,
          pendingQueueCount: pendingVerifQueue.length,
        },
      }));
    } catch {}
  }

  function openCloudToVerification() {
    panelFocusMode = 'verify';
    panel.hidden = false;
    renderLabels();
    openWorkspaceView(panel.id, verifyQuickBtn.hidden ? trigger : verifyQuickBtn);
    try { verifBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  }

  async function performFullSignOut() {
    const prevOrg = selectedOrgId;
    clearActiveResume();
    try { await client.signOut(); } catch {}
    clearCachedLicense(prevOrg, persistentStore);
    safeWriteKey(persistentStore, LAST_ORG_KEY, '');
    persistentStore.removeItem('smartmaktab.demo.workspace.v1');
    persistentStore.removeItem('smartmaktab.profile.v1');
    const dest = new URL('index.html', appRoot);
    dest.searchParams.set('setup', '1');
    dest.searchParams.set('lang', 'tg');
    openCabinetView(dest);
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
      onLoadDevices: client.session?.access_token && selectedOrgId
        ? () => client.getMyDeviceSessions(selectedOrgId)
        : undefined,
      onRevokeDevice: client.session?.access_token && selectedOrgId
        ? async (deviceId, orgId) => {
          await client.revokeMyDeviceSession({ p_org_id: orgId || selectedOrgId, p_device_id: deviceId });
          statusMessage = t('deviceUnlinked');
          await loadMyDevices();
        }
        : undefined,
      onSignOut: performFullSignOut,
      onOpenPayment: isPrimary ? () => {
        panelFocusMode = 'payment';
        panel.hidden = false;
        renderLabels();
        openWorkspaceView(panel.id, trigger);
        try { receiptForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
      } : undefined,
    });

    const signedIn = Boolean(client.session?.access_token && m);
    const verified = isAccountVerified();
    const blockedByLic = !state.allowed;
    const blockedByVerif = signedIn && !verified;
    if (blockedByLic) article.dataset.smLocked = '1';
    else delete article.dataset.smLocked;
    const settingsBtn = document.getElementById('workspaceSettingsToggle');
    const switchBtn = document.getElementById('workspaceSwitch');
    if (settingsBtn) settingsBtn.disabled = blockedByLic;
    if (switchBtn) switchBtn.disabled = blockedByLic;
    syncUpBtn.disabled = blockedByLic || blockedByVerif;
    syncDownBtn.disabled = blockedByLic || blockedByVerif;

    verifBannerHost.replaceChildren();
    verifBannerHost.hidden = !blockedByVerif;
    verifyQuickBtn.hidden = !(blockedByVerif || pendingVerifQueue.length > 0);
    verifyQuickBtn.textContent = pendingVerifQueue.length > 0 && !blockedByVerif
      ? `${t('verifyTrigger')} (${pendingVerifQueue.length})`
      : t('verifyTrigger');
    if (blockedByVerif) {
      if (!document.getElementById('smVerifWaveStyle')) {
        const st = document.createElement('style');
        st.id = 'smVerifWaveStyle';
        st.textContent = `
          @keyframes smVerifWave {
            0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45); }
            70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
            100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
          }
          .sm-verif-wave-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 10px;
            border: 1px solid #dc2626;
            background: linear-gradient(135deg, #dc2626, #b91c1c);
            color: #fff;
            font-size: 13px;
            font-weight: 600;
            text-align: left;
            cursor: pointer;
            animation: smVerifWave 2s infinite;
            transition: transform 0.15s ease, filter 0.15s ease;
          }
          .sm-verif-wave-btn:hover { filter: brightness(1.06); }
          .sm-verif-wave-btn:active { transform: scale(0.99); }
          .sm-verif-wave-btn .sm-verif-pill {
            background: rgba(255,255,255,0.2);
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
            flex-shrink: 0;
          }
        `;
        document.head.append(st);
      }
      const wrap = make('div', 'sm-verif-banner');
      const btn = make('button', 'sm-verif-wave-btn');
      btn.type = 'button';
      const vStat = m.verification_status || 'unverified';
      const labelSpan = make('span');
      labelSpan.style.cssText = 'line-height:1.35;';
      if (vStat === 'rejected') {
        labelSpan.textContent = '⚠️ ' + t('verifRejectedStaff').split('.')[0];
      } else if (vStat === 'pending') {
        labelSpan.textContent = '⚠️ ' + t('verifPendingNote').split('.')[0];
      } else {
        labelSpan.textContent = '⚠️ ' + t('verifyTrigger');
      }
      const pill = make('span', 'sm-verif-pill');
      pill.textContent = t('verifyTrigger') + ' →';
      btn.append(labelSpan, pill);
      btn.addEventListener('click', openCloudToVerification);
      wrap.append(btn);
      verifBannerHost.append(wrap);
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
      const lbl = make('label');
      lbl.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border:1px solid var(--line,#d1d5db);border-radius:10px;cursor:pointer;font-size:13px;background:rgba(255,255,255,0.02);';
      const left = make('span');
      left.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const cb = make('input');
      cb.type = 'checkbox';
      cb.value = r.position_code;
      cb.checked = selectedExtras.has(r.position_code);
      cb.style.cssText = 'width:17px;height:17px;flex-shrink:0;cursor:pointer;';
      cb.addEventListener('change', () => {
        if (cb.checked) selectedExtras.add(r.position_code);
        else selectedExtras.delete(r.position_code);
        updateTariffSummary();
      });
      const titleEl = make('span');
      titleEl.textContent = lang === 'ru' ? r.title_ru : r.title_tg;
      left.append(cb, titleEl);
      const priceEl = make('strong');
      priceEl.style.cssText = 'font-size:12px;white-space:nowrap;opacity:0.85;';
      priceEl.textContent = `+${Number(r.extra_price_tjs ?? r.base_price_tjs ?? 10).toFixed(0)} TJS`;
      lbl.append(left, priceEl);
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
    if (!m || panelFocusMode === 'payment') {
      verifBox.hidden = true;
      return;
    }
    verifBox.hidden = false;
    const vStat = ctx?.is_super_admin ? 'verified' : (m.verification_status || 'unverified');
    const isDir = m.primary_position === 'school-director';
    const prof = ctx?.profile || {};
    let localProf = null;
    try { localProf = JSON.parse(safeReadKey(persistentStore, 'smartmaktab.profile.v1') || 'null'); } catch {}
    if (!vNameInp.value && (prof.full_name || m.verification_full_name || localProf?.fullName)) {
      vNameInp.value = m.verification_full_name || prof.full_name || localProf?.fullName || '';
    }
    if (!vBirthInp.value && (m.verification_birth_date || prof.profile_details?.birthDate || localProf?.person?.birthDate)) {
      vBirthInp.value = m.verification_birth_date || prof.profile_details?.birthDate || localProf?.person?.birthDate || '';
    }
    if (!vPhoneInp.value && (m.verification_phone || prof.profile_details?.phone || localProf?.person?.phone)) {
      vPhoneInp.value = m.verification_phone || prof.profile_details?.phone || localProf?.person?.phone || '';
    }
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
    if (panelFocusMode === 'verify') {
      receiptForm.hidden = true;
      payNoticeBox.hidden = true;
      return;
    }
    const isPrimary = isCurrentCabinetPrimary();
    receiptForm.hidden = !isPrimary;
    payNoticeBox.hidden = isPrimary || !m;
    if (!isPrimary && m) {
      const primName = m.primary_position ? formatPositionTitle(m.primary_position, langCode()) : m.role;
      payNoticeBox.textContent = `${t('payPrimaryOnlyBox')} ${primName}`;
    }
  }

  function renderMyDevices() {
    if (!client.session?.access_token || !selectedOrgId) {
      devicesBox.hidden = true;
      return;
    }
    devicesBox.hidden = false;
    devicesTitle.textContent = t('myDevicesHeading');
    devicesSummary.textContent = tg()
      ? `📱 ${lastDeviceStats.activeMobile}/${lastDeviceStats.maxPerKind} мобайл · 🖥 ${lastDeviceStats.activeDesktop}/${lastDeviceStats.maxPerKind} компютер (Ҳамагӣ: ${lastDeviceStats.activeTotal}/${lastDeviceStats.maxTotal})`
      : `📱 ${lastDeviceStats.activeMobile}/${lastDeviceStats.maxPerKind} моб. · 🖥 ${lastDeviceStats.activeDesktop}/${lastDeviceStats.maxPerKind} комп. (Всего: ${lastDeviceStats.activeTotal}/${lastDeviceStats.maxTotal})`;
    if (!myDeviceSessions.length) {
      const empty = make('li', 'small');
      empty.textContent = t('myDevicesEmpty');
      devicesList.replaceChildren(empty);
      return;
    }
    const thisDevId = getOrCreateDeviceId(persistentStore);
    const rows = myDeviceSessions.map(d => {
      const li = make('li', 'sm-device-row');
      const icon = d.device_kind === 'mobile' ? '📱' : '🖥';
      const kindTxt = d.device_kind === 'mobile' ? t('mobileKind') : t('desktopKind');
      const seen = (d.last_seen_at || '').replace('T', ' ').slice(0, 16);
      const lbl = make('span');
      lbl.textContent = `${icon} ${d.device_label || 'Web'} (${kindTxt})${d.device_id === thisDevId ? ` · ${t('currentDeviceTag')}` : ''}${seen ? ` · ${seen}` : ''}`;
      const btn = make('button', 'button alt');
      btn.type = 'button';
      btn.textContent = t('unlinkDeviceBtn');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await client.revokeMyDeviceSession({ p_org_id: d.organization_id || selectedOrgId, p_device_id: d.device_id });
          statusMessage = t('deviceUnlinked');
          await checkLicenseOnline();
        } catch (err) {
          statusMessage = err?.message || t('authError');
          btn.disabled = false;
          renderLabels();
        }
      });
      li.append(lbl, btn);
      return li;
    });
    devicesList.replaceChildren(...rows);
  }

  async function loadMyDevices() {
    if (!client.session?.access_token || !selectedOrgId) {
      myDeviceSessions = [];
      renderMyDevices();
      return;
    }
    try {
      const rows = await client.getMyDeviceSessions(selectedOrgId);
      myDeviceSessions = Array.isArray(rows) ? rows : [];
    } catch {
      myDeviceSessions = [];
    }
    renderMyDevices();
  }

  async function checkLicenseOnline() {
    if (!client.session?.access_token || !selectedOrgId) return;
    try {
      const m = activeOrg();
      const myKind = detectDeviceKind();
      let devRes = {
        allowed: true,
        device_kind: myKind,
        max_devices: m?.max_devices ?? 2,
        max_per_kind: Math.max(1, Math.ceil((m?.max_devices ?? 2) / 2)),
        active_devices: 1,
        active_mobile: myKind === 'mobile' ? 1 : 0,
        active_desktop: myKind === 'desktop' ? 1 : 0,
      };
      try {
        const claimed = await client.claimDeviceSession({
          p_org_id: selectedOrgId,
          p_device_id: getOrCreateDeviceId(persistentStore),
          p_device_label: detectDeviceLabel(),
          p_cabinet_id: cabinetId || null,
          p_device_kind: myKind,
        });
        if (claimed && typeof claimed === 'object' && !Array.isArray(claimed)) devRes = claimed;
      } catch {}

      const res = await client.getLicenseStatus(selectedOrgId);
      const isBlockedDevice = devRes?.allowed === false && devRes?.reason === 'device_limit_reached';
      const isDisabledAccount = devRes?.allowed === false && devRes?.reason === 'account_disabled';
      const isDisallowedPos = devRes?.allowed === false && devRes?.reason === 'position_not_allowed';

      const maxTotal = devRes?.max_devices ?? m?.max_devices ?? 2;
      const maxPerKind = devRes?.max_per_kind ?? Math.max(1, Math.ceil(maxTotal / 2));
      const activeTotal = devRes?.active_devices ?? 1;
      const activeMob = devRes?.active_mobile ?? (m?.active_mobile_count ?? 0);
      const activeDesk = devRes?.active_desktop ?? (m?.active_desktop_count ?? 0);
      lastDeviceStats = { maxTotal, maxPerKind, activeTotal, activeMobile: activeMob, activeDesktop: activeDesk };

      cacheVerifiedLicense(selectedOrgId, {
        ...res,
        primary_position: m?.primary_position ?? null,
        extra_positions: m?.extra_positions ?? [],
        role: m?.role ?? '',
        max_devices: maxTotal,
        max_per_kind: maxPerKind,
        active_devices: activeTotal,
        active_mobile: activeMob,
        active_desktop: activeDesk,
        blocked_device_kind: devRes?.device_kind || myKind,
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
        ? `${t('licenseLine')}: ${statusTxt} (${durVal} рӯз) · Дастгоҳҳо: ${activeTotal}/${maxTotal} (${activeMob}/${maxPerKind} тел. · ${activeDesk}/${maxPerKind} комп.)`
        : `${t('licenseLine')}: ${statusTxt} (${durVal} дн.) · Устройства: ${activeTotal}/${maxTotal} (${activeMob}/${maxPerKind} тел. · ${activeDesk}/${maxPerKind} комп.)`;

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
      await loadMyDevices();
      emitCloudContextChange();
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
    reqTitle.textContent = tg()
      ? `⚠️ Пардохт ба рақами: ${activePlan.recipient_phone}`
      : `⚠️ Оплата на номер: ${activePlan.recipient_phone}`;
    reqDetail.textContent = tg()
      ? `Барои пардохти хизматрасонӣ ба рақамҳои ${activePlan.recipient_phone} (Душанбе Сити ё Амонатбонк) пардохт намоед, баъдан чеки худро ба мо фиристед. Агар чекро нафиристед, ҳарчанде ки пардохт намудед, система пардохти шуморо намебинад.`
      : `Для оплаты услуги переведите средства на номер ${activePlan.recipient_phone} (Душанбе Сити или Амонатбонк), затем отправьте нам чек. Если не отправить чек, даже при оплате система не увидит ваш платёж.`;
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
    renderMyDevices();
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
      const m = activeOrg();
      if (m) m.verification_status = 'pending';
      panelFocusMode = 'all';
      verifForm.hidden = true;
      const sentLabel = tg() ? 'Дархост фиристода шуд' : 'Заявка отправлена';
      vSubmitBtn.textContent = sentLabel;
      statusMessage = sentLabel;
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
    panelFocusMode = 'all';
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
    myDeviceSessions = [];
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
      const declaredAmt = amtInput.value ? Number(amtInput.value) : null;
      const calc = computePositionTariffTotal({
        primaryPosition: posSelect.value || cabinetId || 'school-teacher',
        extraPositions: [...selectedExtras],
        tariffs: roleTariffs,
        includeAliya: Boolean(aliyaToggle.checked),
      });
      const pkgCalc = computeSubscriptionPackagePrice(calc.totalTjs, Number(periodSelect.value || 1));
      const expectedTotal = Number(pkgCalc?.totalTjs || 0);
      const overpaid = declaredAmt && expectedTotal > 0 && declaredAmt > expectedTotal
        ? Math.round((declaredAmt - expectedTotal) * 100) / 100
        : 0;
      statusMessage = overpaid > 0
        ? (!tg()
          ? `${t('receiptSent')} Вы отправили на ${overpaid} сомони больше. Если хотите вернуть лишние деньги, пожалуйста, позвоните по номеру ${activePlan.recipient_phone}.`
          : `${t('receiptSent')} Шумо ${overpaid} сомонӣ зиёд пардохт кардед. Агар хоҳед маблағи зиёдатиро баргардонед, лутфан ба рақами ${activePlan.recipient_phone} занг занед.`)
        : t('receiptSent');
      receiptForm.reset();
      payStep = 1;
      syncPayWizardStep();
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
    await performFullSignOut();
  });

  document.addEventListener('sm:open-account-verification', openCloudToVerification);
  document.addEventListener('sm:open-payment-wizard', () => {
    panelFocusMode = 'payment';
    panel.hidden = false;
    renderLabels();
    openWorkspaceView(panel.id, trigger);
    try { (receiptForm.hidden ? payNoticeBox : receiptForm).scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  });
  document.addEventListener('cabinet:language', () => {
    rebuildPositionSelectors();
    renderLabels();
  });
  rebuildPositionSelectors();
  renderLabels();
  if (client.session?.access_token) {
    void applySignedInContext().catch(async err => {
      if (err?.status === 401 || err?.status === 403 || /invalid|expired|jwt/i.test(String(err?.message || ''))) {
        await client.signOut();
      }
      renderLabels();
    });
  }
}
