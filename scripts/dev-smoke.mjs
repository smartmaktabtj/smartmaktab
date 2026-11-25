import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateConfig } from '../dev/config.mjs';

const configPath = new URL('../dev/supabase-config.json', import.meta.url);
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const org = n => `aa000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const fixture = [
  {name:'staff-a', orgs:[3], recordOrgs:[3], deleted:0, memberships:1, audit:false},
  {name:'deputy-a', orgs:[3], recordOrgs:[3], deleted:0, memberships:1, audit:false},
  {name:'director-b', orgs:[4], recordOrgs:[4], deleted:0, memberships:1, audit:false},
  {name:'authority-a', orgs:[1,3,5], recordOrgs:[3,5], deleted:0, memberships:1, audit:false},
  {name:'developer', orgs:[1,2,3,4,5], recordOrgs:[3,3,4,5], deleted:1, memberships:4, audit:true},
  {name:'no-membership', orgs:[], recordOrgs:[], deleted:0, memberships:0, audit:false}
];
export const accountEmail = name => `${name}@example.test`;

class CheckError extends Error {}
function check(condition, message) { if (!condition) throw new CheckError(message); }
function same(a, b) { return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()); }

export async function loadSmokeSettings(env = process.env, extraAccounts = []) {
  let config;
  try { config = validateConfig(JSON.parse(await readFile(configPath, 'utf8')), 'localhost'); }
  catch { throw new CheckError('Нет корректного dev/supabase-config.json.'); }
  const host = new URL(config.url).hostname;
  if (host.endsWith('.supabase.co')) {
    check(`${env.SM_EXPECTED_DEV_REF ?? ''}.supabase.co` === host,
      'Для облака явно задайте SM_EXPECTED_DEV_REF с идентификатором отдельного dev-проекта.');
  }
  check(env.SM_DEV_CREDENTIALS_FILE && isAbsolute(env.SM_DEV_CREDENTIALS_FILE),
    'Укажите абсолютный путь SM_DEV_CREDENTIALS_FILE к приватному JSON вне проекта.');
  let passwords;
  try {
    const path = await realpath(env.SM_DEV_CREDENTIALS_FILE);
    const rel = relative(await realpath(appRoot), path);
    check(rel.split(/[\\/]/)[0] === '..' || isAbsolute(rel),
      'Файл паролей нельзя хранить в каталоге приложения или раздавать HTTP-сервером.');
    const meta = await stat(path);
    check(meta.isFile() && meta.size < 16384 && (process.platform === 'win32' || !(meta.mode & 0o077)),
      'Файл должен быть обычным приватным JSON; на Unix выставьте chmod 600.');
    passwords = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error instanceof CheckError) throw error;
    throw new CheckError('Не удалось прочитать приватный JSON с тестовыми паролями.');
  }
  const accounts = [...fixture.map(({name}) => name), ...extraAccounts];
  check(accounts.every(name => Object.hasOwn(passwords ?? {}, name) && typeof passwords[name] === 'string' && passwords[name].length > 0),
    `В приватном JSON нужны пароли тестовых аккаунтов: ${accounts.join(', ')}.`);
  return { ...config, passwords };
}

export async function runSmoke({url,key,passwords}, progress = console.log) {
  async function call(label, path, {method='GET', token, body, schema} = {}) {
    let response;
    try {
      const headers = {apikey:key, accept:'application/json'};
      if (token) headers.authorization = `Bearer ${token}`;
      else if (!key.startsWith('sb_publishable_')) headers.authorization = `Bearer ${key}`;
      if (schema) headers['accept-profile'] = schema;
      if (body !== undefined) headers['content-type'] = 'application/json';
      response = await fetch(`${url}${path}`, {method, headers, body:body === undefined ? undefined : JSON.stringify(body),
        redirect:'error', cache:'no-store', signal:AbortSignal.timeout(12000)});
    } catch { throw new CheckError(`${label}: ошибка сети или тайм-аут.`); }
    const data = await response.json().catch(() => null);
    return {status:response.status, data};
  }
  const select = async (label,path,token) => {
    const {status,data} = await call(label, `/rest/v1/${path}`, {token});
    check(status === 200 && Array.isArray(data), `${label}: ожидался список HTTP 200, получен HTTP ${status}.`);
    return data;
  };
  const forbid = async (label,path,params) => {
    const {status,data} = await call(label,path,params);
    check([401,403].includes(status) && (!params?.token || data?.code === '42501'), `${label}: ожидался отказ HTTP 401/403, получен HTTP ${status}.`);
  };
  const settings = await call('Настройки Auth','/auth/v1/settings');
  check(settings.status === 200 && settings.data?.external?.email === true
    && settings.data?.external?.anonymous_users === false && settings.data?.disable_signup === true,
    'Auth: нужен Email/Password, с выключенными анонимным входом и саморегистрацией.');
  progress('PASS: саморегистрация и анонимный вход отключены');
  for (const table of ['organizations','school_records','school_memberships','audit_events']) {
    await forbid(`anon / ${table}`, `/rest/v1/${table}?select=id`);
  }
  progress('PASS: anon не получает доступ к таблицам');
  const wrong = await call('Неверный пароль','/auth/v1/token?grant_type=password', {
    method:'POST', body:{email:accountEmail('staff-a'),password:`invalid-${crypto.randomUUID()}`}
  });
  check([400,401].includes(wrong.status) && ['invalid_credentials','invalid_grant'].includes(wrong.data?.error_code ?? wrong.data?.error),
    `Неверный пароль: ожидается отказ Auth (HTTP ${wrong.status}).`);
  progress('PASS: Auth отклоняет неверный пароль');

  for (const item of fixture) {
    const {status,data} = await call(`${item.name} / вход`, '/auth/v1/token?grant_type=password', {
      method:'POST', body:{email:accountEmail(item.name),password:passwords[item.name]}
    });
    check(status === 200 && typeof data?.access_token === 'string' && typeof data?.refresh_token === 'string',
      `${item.name}: вход не выполнен (HTTP ${status}). Проверьте подтверждение аккаунта и пароль.`);
    const token = data.access_token;
    let failure;
    try {
      const orgs = await select(item.name,'organizations?select=id,name,kind',token);
      check(same(orgs.map(row => row.id), item.orgs.map(org)), `${item.name}: доступные учреждения не соответствуют матрице.`);
      const records = await select(item.name,'school_records?select=id,organization_id,record_type,title,deleted_at',token);
      check(same(records.map(row => row.organization_id), item.recordOrgs.map(org)), `${item.name}: видимые записи не соответствуют матрице.`);
      check(records.filter(row => row.deleted_at !== null).length === item.deleted,`${item.name}: неверная видимость корзины.`);
      const targeted = await select(item.name,`school_records?select=id&organization_id=eq.${org(4)}`,token);
      check(targeted.length === (item.recordOrgs.includes(4) ? 1 : 0),`${item.name}: неверный результат прямого фильтра школы B.`);
      const memberships = await select(item.name,'school_memberships?select=id,user_id',token);
      check(memberships.length === item.memberships && (item.audit || memberships.every(row => row.user_id === data.user?.id)),
        `${item.name}: неверная видимость назначений.`);
      const audit = await select(item.name,'audit_events?select=id,table_name&limit=100',token);
      check(item.audit ? ['public.organizations','public.school_memberships','public.school_records','smartmaktab_private.platform_developers']
        .every(name => audit.some(row => row.table_name === name)) : audit.length === 0, `${item.name}: неверная видимость аудита.`);
      await forbid(`${item.name} / payload`,'/rest/v1/school_records?select=payload&limit=0',{token});
      const internal = await call(`${item.name} / private schema`,'/rest/v1/platform_developers?select=user_id&limit=0',
        {token,schema:'smartmaktab_private'});
      check(internal.status === 406 && internal.data?.code === 'PGRST106', `${item.name}: private не должен быть в exposed schemas (HTTP ${internal.status}).`);
      // Deliberately unsatisfiable filters and an empty INSERT; no rows can be changed even if GRANT is wrong.
      const impossible = `id=eq.${org(3)}&id=neq.${org(3)}`;
      await forbid(`${item.name} / INSERT`, '/rest/v1/school_records', {token,method:'POST',body:[]});
      await forbid(`${item.name} / UPDATE`, `/rest/v1/school_memberships?${impossible}`, {token,method:'PATCH',body:{role:'staff'}});
      await forbid(`${item.name} / DELETE`, `/rest/v1/school_records?${impossible}`, {token,method:'DELETE'});
    } catch (error) { failure = error; }
    try {
      const ended = await call(`${item.name} / выход`,'/auth/v1/logout?scope=local',{method:'POST',token});
      check(ended.status === 204, `${item.name}: Auth не подтвердил выход (HTTP ${ended.status}).`);
    } catch (error) { if (!failure) throw error; }
    if (failure) throw failure;
    const refresh = await call(`${item.name} / refresh после выхода`,'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',body:{refresh_token:data.refresh_token}
    });
    check([400,401].includes(refresh.status) && ['refresh_token_not_found','refresh_token_already_used','session_not_found','invalid_grant']
      .includes(refresh.data?.error_code ?? refresh.data?.error), `${item.name}: refresh после выхода должен быть отклонён (HTTP ${refresh.status}).`);
    progress(`PASS: ${item.name} — вход, матрица RLS, запрет записи, выход`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await runSmoke(await loadSmokeSettings());
    console.log('PASS: матрица Supabase Dev подтверждена через Auth и Data API.');
  } catch (error) {
    // Never dump HTTP bodies, stack traces, config, or secrets to CI/terminal logs.
    console.error(`FAIL: ${error instanceof CheckError ? error.message : 'непредвиденная ошибка проверки'}`);
    process.exitCode = 1;
  }
}
