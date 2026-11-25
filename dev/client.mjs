import { createClient } from '@supabase/supabase-js';
import { allowApprovalExperiment, allowApprovalFollow, allowApprovalOutbox, validateConfig } from './config.mjs';
import { createApprovals } from './approvals.mjs';
import { createApprovalOutbox } from './approval-outbox.mjs';

const messages = {
  ru: { heading:'Контур Supabase Dev', warning:'Только синтетические данные. Только чтение. Демо-данные сюда не переносятся.', experimentWarning:'Только синтетические данные. Включён локальный эксперимент согласования. Демо-данные сюда не переносятся.', email:'Почта тестового аккаунта', password:'Пароль', signIn:'Войти', logout:'Выйти', reload:'Обновить доступ', org:'Учреждение', checking:'Проверка конфигурации…', config:'Supabase не настроен. Проверьте dev/supabase-config.json и инструкцию SUPABASE_DEV.md.', ready:'Войдите тестовым аккаунтом. При перезагрузке вход потребуется снова.', loginError:'Не удалось войти. Проверьте учётные данные, настройки проекта и сеть.', online:'Вход выполнен. Отображаются только данные, разрешённые сервером.', loading:'Загрузка…', readError:'Не удалось загрузить данные. Проверьте подключение и миграцию, затем обновите доступ.', noOrg:'Нет доступных учреждений. Проверьте назначение роли в dev-проекте.', noRecords:'Нет доступных записей.', limited:'Показаны первые 100 результатов. Пагинация пока не подключена.', truncatedOrgs:'Показаны первые 100 учреждений.', signOutError:'Вы вышли на этом устройстве; сервер не подтвердил отзыв сессии.', deleted:'в корзине', school:'школа', education_authority:'орган маориф', staff:'Сотрудники', document:'Документы', plan:'Планы', task:'Поручения', meeting:'Заседания', source:'Источники', other:'Другое' },
  tg: { heading:'Муҳити озмоишии Supabase', warning:'Танҳо додаҳои сохта ва танҳо барои хондан. Додаҳои демо ба ин ҷо намегузаранд.', experimentWarning:'Танҳо додаҳои сохта. Озмоиши маҳаллии тасдиқ фаъол аст. Додаҳои демо ба ин ҷо намегузаранд.', email:'Почтаи ҳисоби озмоишӣ', password:'Рамз', signIn:'Ворид шудан', logout:'Баромадан', reload:'Нав кардани иҷозат', org:'Муассиса', checking:'Танзимот санҷида мешавад…', config:'Supabase танзим нашудааст. dev/supabase-config.json ва SUPABASE_DEV.md-ро санҷед.', ready:'Бо ҳисоби озмоишӣ ворид шавед. Пас аз бозкушоии саҳифа дубора ворид шавед.', loginError:'Воридшавӣ имкон надошт. Почта, рамз, танзимот ва шабакаро санҷед.', online:'Ворид шудед. Танҳо додаҳои иҷозатдодаи сервер намоёнанд.', loading:'Бор шуда истодааст…', readError:'Додаҳо бор нашуданд. Пайваст ва мигратсияро санҷед, баъд иҷозатро нав кунед.', noOrg:'Муассисаи дастрас нест. Нақши таъиншударо санҷед.', noRecords:'Сабти дастрас нест.', limited:'100 натиҷаи аввал намоён аст. Саҳифабандӣ ҳоло дастрас нест.', truncatedOrgs:'100 муассисаи аввал намоён аст.', signOutError:'Дар ин дастгоҳ баромадед; сервер қатъи сессияро тасдиқ накард.', deleted:'дар сабад', school:'мактаб', education_authority:'мақоми маориф', staff:'Кормандон', document:'Ҳуҷҷатҳо', plan:'Нақшаҳо', task:'Супоришҳо', meeting:'Ҷаласаҳо', source:'Манбаъҳо', other:'Дигар' }
};
const $ = id => document.getElementById(id);
const t = key => messages[$('language').value][key] || key;
const limit = 100;
let client, approvals, sessionUser, request, signingOut = false, orgs = [], records = [], status = 'checking', detail = '', visibleLimit = false;
function paint() {
  document.documentElement.lang = $('language').value;
  for (const el of document.querySelectorAll('[data-text]')) el.textContent = t(approvals && el.dataset.text==='warning' ? 'experimentWarning' : el.dataset.text);
  $('status').textContent = t(status) + (visibleLimit ? ' ' + t('truncatedOrgs') : '');
  $('recordStatus').textContent = detail ? t(detail) : '';
  const selected = $('org').value;
  $('org').replaceChildren(...orgs.map(o => new Option(`${o.name} · ${t(o.kind)}`, o.id)));
  if (orgs.some(o => o.id === selected)) $('org').value = selected;
  $('org').disabled = !orgs.length;
  $('records').replaceChildren(...records.map(record => {
    const li = document.createElement('li');
    li.textContent = `${t(record.record_type)} · ${record.title}${record.deleted_at ? ` (${t('deleted')})` : ''}`;
    return li;
  }));
}
function clearPage() {
  request?.abort(); approvals?.hide(); orgs = []; records = []; detail = ''; visibleLimit = false;
}
function newRequest() {
  request?.abort(); request = new AbortController(); return request.signal;
}
async function readRecords({ updateApproval = true, quiet = false, parentSignal } = {}) {
  const org = $('org').value;
  if (updateApproval) approvals?.select(sessionUser, orgs.some(o=>o.id===org && o.kind==='school') ? org : null);
  if (!sessionUser || !org) return;
  const ownSignal = newRequest();
  const signal = parentSignal ? AbortSignal.any([ownSignal,parentSignal,AbortSignal.timeout(9000)]) : ownSignal;
  const current = () => !ownSignal.aborted && !parentSignal?.aborted;
  if (!quiet) { records = []; detail = 'loading'; paint(); }
  try {
    const {data, error} = await client.from('school_records').select('id,record_type,title,deleted_at')
      .eq('organization_id', org).order('id').limit(limit + 1).abortSignal(signal);
    if (!current()) return;
    if (error || signal.aborted) throw error ?? new Error('Read timed out');
    const incoming=data.slice(0,limit);
    const message=data.length > limit ? 'limited' : data.length ? '' : 'noRecords';
    if (quiet && detail===message && JSON.stringify(records)===JSON.stringify(incoming)) return;
    records=incoming; detail=message;
  } catch { if (current()) { records=[]; detail='readError'; } }
  if (current()) paint();
}
async function readOrganizations() {
  if (!sessionUser) return;
  const previous = $('org').value;
  clearPage(); detail = 'loading'; paint(); const signal = newRequest();
  try {
    const {data, error} = await client.from('organizations').select('id,name,kind')
      .order('name').order('id').limit(limit + 1).abortSignal(signal);
    if (signal.aborted) return;
    if (error) throw error;
    visibleLimit = data.length > limit; orgs = data.slice(0, limit);
    detail = orgs.length ? '' : 'noOrg'; paint();
    if (orgs.some(o => o.id === previous)) $('org').value = previous;
    if (orgs.length) await readRecords();
  } catch { if (!signal.aborted) { detail = 'readError'; paint(); } }
}
$('language').addEventListener('change', () => { paint(); approvals?.render(); });
$('org').addEventListener('change', () => void readRecords());
$('reload').addEventListener('click', readOrganizations);
$('login').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('login').querySelector('button');
  if (!client || button.disabled || sessionUser) return;
  button.disabled = true;
  const password = $('password').value; $('password').value = '';
  try {
    const { error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password });
    if (error) throw error;
    $('email').value = '';
  } catch { status = 'loginError'; paint(); }
  finally { button.disabled = false; }
});
$('logout').addEventListener('click', async () => {
  signingOut = true; sessionUser = null; approvals?.reset(); clearPage(); $('workspace').hidden = true; status = 'loading'; paint();
  try {
    const { error } = await client.auth.signOut({scope:'local'});
    if (error) throw error;
    signingOut = false; status = 'ready'; $('login').hidden = false;
  } catch {
    // Discard the current UI and require a fresh page on an unconfirmed revoke.
    status = 'signOutError'; $('login').hidden = true; client.auth.stopAutoRefresh();
  }
  paint();
});

window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

try {
  const response = await fetch('./supabase-config.json', {cache:'no-store', redirect:'error'});
  if (!response.ok) throw new Error('Missing dev config');
  const config = await response.json();
  const {url, key} = validateConfig(config, location.hostname);
  client = createClient(url, key, {
    auth:{persistSession:false, autoRefreshToken:true, detectSessionInUrl:false},
    global:{fetch:(input, init) => fetch(input, {...init, cache:'no-store', redirect:'error'})}
  });
  if (allowApprovalExperiment(config, location.href, url)) {
    const outbox = allowApprovalOutbox(config,location.href,url) ? createApprovalOutbox(url) : null;
    const follow = allowApprovalFollow(config,location.href,url);
    approvals = createApprovals({client, outbox, follow, language:()=> $('language').value, onRecordsChanged:(school,user,quiet=false,parentSignal)=>{
      if (sessionUser===user && $('org').value===school) return readRecords({updateApproval:false,quiet,parentSignal});
    }});
  }
  client.auth.onAuthStateChange((event, session) => {
    if (signingOut) return;
    if (event === 'SIGNED_OUT') {
      sessionUser = null; approvals?.reset(); clearPage(); status = 'ready';
      $('login').hidden = false; $('workspace').hidden = true; paint(); return;
    }
    if (event !== 'SIGNED_IN' || !session?.user || sessionUser === session.user.id) return;
    sessionUser = session.user.id; status = 'online'; $('login').hidden = true; $('workspace').hidden = false;
    paint();
    // Do not await API calls from within Supabase Auth's state callback.
    setTimeout(readOrganizations, 0);
  });
  status = 'ready'; $('login').hidden = false;
} catch { status = 'config'; }
paint();
