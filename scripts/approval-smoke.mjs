import {accountEmail, loadSmokeSettings} from './dev-smoke.mjs';
const schoolA = 'aa000000-0000-4000-8000-000000000003';
const schoolB = 'aa000000-0000-4000-8000-000000000004';
class ProbeError extends Error {}
function check(condition, message) { if (!condition) throw new ProbeError(message); }

async function run() {
  check(process.env.SM_APPROVAL_EXPERIMENT === '1', 'Эта проверка создаёт синтетические строки. Укажите SM_APPROVAL_EXPERIMENT=1 только для изолированного локального стенда.');
  let settings;
  try { settings = await loadSmokeSettings(process.env,['director-a']); }
  catch { throw new ProbeError('Проверьте dev/supabase-config.json и приватный файл паролей семи аккаунтов, включая director-a.'); }
  const {url,key,passwords} = settings;
  check(['localhost','127.0.0.1'].includes(new URL(url).hostname), 'Экспериментальная проверка разрешена только на localhost.');
  const tag = crypto.randomUUID();
  const signIns = new Map();
  async function request(label,path,{method='GET',body,token}={}) {
    try {
      const headers = {apikey:key,accept:'application/json'};
      if (token) headers.authorization = `Bearer ${token}`;
      else if (!key.startsWith('sb_publishable_')) headers.authorization = `Bearer ${key}`;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const r = await fetch(`${url}${path}`,{method,headers,body:body === undefined ? undefined : JSON.stringify(body),
        redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
      return {status:r.status,data:await r.json().catch(()=>null)};
    } catch { throw new ProbeError(`${label}: ошибка сети.`); }
  }
  function expect(label,response,status,code) {
    check((Array.isArray(status) ? status.includes(response.status) : response.status === status) && (!code || response.data?.code === code),
      `${label}: получен неожиданный ответ HTTP ${response.status}.`);
    return response.data;
  }
  async function signIn(actor) {
    const data = expect(`вход ${actor}`,await request(`вход ${actor}`,'/auth/v1/token?grant_type=password',
      {method:'POST',body:{email:accountEmail(actor),password:passwords[actor]}}),200);
    check(typeof data?.access_token === 'string',`Auth не вернул токен: ${actor}.`);
    signIns.set(actor,data.access_token);
  }
  const rpc = (actor,method,body) => request(`${actor}/${method}`,`/rest/v1/rpc/${method}`,{method:'POST',body,token:signIns.get(actor)});
  const submit = (actor,title,id,school=schoolA) => rpc(actor,'submit_plan_creation',{p_school_id:school,p_title:title,p_client_request_id:id});
  const decide = (actor,id,approve,school=schoolA) => rpc(actor,'decide_plan_creation',{p_school_id:school,p_request_id:id,p_approve:approve});
  const read = async (actor,path) => {
    const data = expect(`${actor}/read`,await request(`${actor}/read`,`/rest/v1/${path}`,{token:signIns.get(actor)}),200);
    check(Array.isArray(data),`${actor}: ожидался ответ со списком.`); return data;
  };
  const proposal = (actor,id) => read(actor,`plan_creation_requests?select=id,title,status,record_id&id=eq.${id}`);
  const records = (title) => read('staff-a',`school_records?select=id,record_type,organization_id&title=eq.${encodeURIComponent(title)}`);
  const status = (res,code) => expect('запрет операции',res,403,code ?? '42501');
  let failure;
  try {
    for(const actor of ['staff-a','deputy-a','director-a','director-b','authority-a','developer','no-membership']) await signIn(actor);
    const title = `DEV plan ${tag}`;
    const key = crypto.randomUUID();
    expect('anon таблица',await request('anon таблица','/rest/v1/plan_creation_requests?select=id'),[401,403]);
    // An ungranted function may be hidden by PostgREST's schema cache on some configurations.
    expect('anon RPC',await submit('anon',title,key),[401,403,404]);
    status(await submit('staff-a',title,key,schoolB));
    status(await submit('director-a',title,key));
    status(await submit('authority-a',title,key));
    status(await submit('developer',title,key));
    status(await submit('no-membership',title,key));
    // Real simultaneous HTTP requests exercise the unique index and row-lock behavior.
    const ids = (await Promise.all([submit('staff-a',title,key),submit('staff-a',title,key)]))
      .map(res=>expect('параллельная подача',res,200));
    const id = ids[0];
    check(typeof id === 'string' && id === ids[1],'Повторная подача создала вторую заявку.');
    expect('изменённая подача',await submit('staff-a',`${title} changed`,key),409,'23505');
    check((await records(title)).length===0,'План появился без утверждения.');
    for(const actor of ['staff-a','director-a']) check((await proposal(actor,id))[0]?.status === 'pending',`${actor} не видит ожидаемую заявку.`);
    for(const actor of ['deputy-a','director-b','authority-a','developer','no-membership'])
      check((await proposal(actor,id)).length===0,`${actor} видит недоступную заявку.`);
    for(const actor of ['staff-a','deputy-a','director-b','authority-a','developer']) status(await decide(actor,id,true));
    status(await decide('director-b',id,true,schoolB));
    status(await request('прямой PATCH',`/rest/v1/plan_creation_requests?id=eq.${id}&id=neq.${id}`,
      {method:'PATCH',body:{title:'DEV FORBIDDEN'},token:signIns.get('director-a')}));
    console.log('PASS: очередь изолирована; запрос неизменяем, повторная подача не дублируется');
    const decisions = (await Promise.all([decide('director-a',id,true),decide('director-a',id,true)]))
      .map(res=>expect('параллельное утверждение',res,200));
    check(decisions.every(x=>x?.request_id===id && x.status==='approved' && x.record_id===decisions[0].record_id),
      'Утверждение не вернуло один и тот же план.');
    const plan = await records(title);
    check(plan.length===1 && plan[0].id===decisions[0].record_id && plan[0].organization_id===schoolA && plan[0].record_type==='plan',
      'Утверждение не создало ровно один план в правильной школе.');
    expect('решение уже принято',await decide('director-a',id,false),409,'23505');
    const audit = await read('developer',`audit_events?select=table_name,action,actor_id&record_id=in.(${id},${plan[0].id})&order=id`);
    check(audit.length===3 && audit[0].action==='INSERT' && audit[0].table_name==='public.plan_creation_requests'
      && audit[1].action==='INSERT' && audit[1].table_name==='public.school_records'
      && audit[2].action==='UPDATE' && audit[2].table_name==='public.plan_creation_requests'
      && audit[1].actor_id && audit[1].actor_id===audit[2].actor_id && audit[0].actor_id!==audit[1].actor_id,'Некорректный аудит.');
    console.log('PASS: параллельное утверждение создало ровно один план; аудит событий совпал');

    const rejectedTitle = `DEV reject ${tag}`;
    const rejected = expect('заявка на отклонение',await submit('deputy-a',rejectedTitle,crypto.randomUUID()),200);
    const rejectedResult = expect('отклонение',await decide('director-a',rejected,false),200);
    check(rejectedResult?.status==='rejected' && rejectedResult.record_id===null && (await records(rejectedTitle)).length===0,
      'Отклонение создало запись вместо отказа.');
    const competingTitle = `DEV competing ${tag}`;
    const competing = expect('заявка на конкурирующее решение',await submit('staff-a',competingTitle,crypto.randomUUID()),200);
    const race = await Promise.all([decide('director-a',competing,true),decide('director-a',competing,false)]);
    check(race.filter(x=>x.status===200).length===1 && race.filter(x=>x.status===409 && x.data?.code==='23505').length===1,
      'Несовместимые решения не сериализованы.');
    const success = race.find(x=>x.status===200).data;
    const final = (await proposal('director-a',competing))[0];
    check(final && final.status===success.status && final.record_id===success.record_id
      && (await records(competingTitle)).length===(success.status==='approved' ? 1 : 0),'Итог гонки расходится с состоянием плана.');
    console.log('PASS: отклонение не создаёт запись; при гонке действует только одно решение');
  } catch (error) { failure=error; }
  for (const [actor,token] of signIns) {
    try { expect(`выход ${actor}`,await request('выход','/auth/v1/logout?scope=local',{method:'POST',token}),204); }
    catch(error) { failure ??= error; }
  }
  if(failure) throw failure;
}

try { await run(); console.log('PASS: экспериментальный маршрут проверен через Auth и PostgREST.'); }
catch(error) {
  console.error(`FAIL: ${error instanceof ProbeError ? error.message : 'непредвиденная ошибка проверки'}`);
  process.exitCode=1;
}
