import {createForegroundPoller} from './foreground-poller.mjs';

// Optional loopback UI. These role checks only control presentation; the RPC and RLS authorise every action.
const copy = {
  ru: {
    header:'Согласование создания плана', mode:'Локальный эксперимент. Вводите только вымышленные названия.',
    refresh:'Обновить заявки', title:'Название нового плана', send:'Подать заявку', retry:'Повторить отправку',
    review:'Директор · заявки этой школы', own:'Мои заявки · план создаётся только после утверждения',
    loading:'Проверяем право доступа и загружаем заявки…', failed:'Не удалось загрузить заявки. Проверьте локальный эксперимент и обновите список.',
    none:'Нет заявок.', truncated:'Показано не более 100 последних заявок.', pending:'Ожидает решения', approved:'Утверждена', rejected:'Отклонена',
    accept:'Утвердить', reject:'Отклонить', retryAccept:'Повторить утверждение', retryReject:'Повторить отклонение',
    sending:'Запрос отправляется…', submitted:'Заявка зарегистрирована. Текущий статус — в списке.',
    saved:'План создан.', declined:'Заявка отклонена. План не создан.', denied:'Сервер не разрешил действие. Права и очередь обновлены.',
    conflict:'Нельзя повторить изменённую заявку или уже принятое решение. Очередь обновлена.',
    invalid:'Проверьте название: от 1 до 240 знаков, без управляющих символов.',
    unknown:'Ответ не подтверждён. Повторите то же действие: приложение сохранит параметры и не создаст дубликат.',
    unknownDenied:'Сервер отклонил повтор, но исход предыдущей попытки неизвестен. Проверьте очередь, прежде чем подавать новую заявку.',
    defer:'Сохранить в очередь', discard:'Удалить неотправленную', queueSend:'Отправить из очереди',
    queued:'Сохранено на этом устройстве. Автоматической отправки нет.', discarded:'Неотправленная заявка удалена с устройства.',
    outboxHelp:'Очередь хранится в этом браузере без шифрования. Используйте только вымышленные названия. После перезагрузки требуется вход.',
    offline:'Нет сети. Сохраните заявку в очередь или отправьте её вручную после восстановления связи.',
    storageFailed:'Не удалось прочитать или обновить очередь устройства. До восстановления хранилища отправка отключена.',
    removedElsewhere:'Очередь изменилась в другой вкладке. Проверьте сохранённую заявку.',
    followOn:'Автообновление с сервера: каждые 5 секунд, пока вкладка открыта и видима.',
    followPaused:'Автообновление на паузе: нет сети или вкладка скрыта.',
    followError:'Сверка не удалась. Защищённый список скрыт, пока нет подтверждения сервера.',
    lostScope:'Подтвердить результат повтором нельзя: право доступа изменилось. Не создавайте новую заявку вместо этой.'
  },
  tg: {
    header:'Тасдиқи таъсиси нақша', mode:'Озмоиши маҳаллӣ. Танҳо номҳои сохтаро ворид кунед.',
    refresh:'Нав кардани дархостҳо', title:'Номи нақшаи нав', send:'Фиристодани дархост', retry:'Такрори фиристодан',
    review:'Директор · дархостҳои ин мактаб', own:'Дархостҳои ман · нақша танҳо пас аз тасдиқ сохта мешавад',
    loading:'Иҷозат санҷида ва дархостҳо бор мешаванд…', failed:'Дархостҳо бор нашуданд. Муҳити маҳаллиро санҷед ва рӯйхатро нав кунед.',
    none:'Дархост нест.', truncated:'То 100 дархости охирин намоён аст.', pending:'Дар интизори қарор', approved:'Тасдиқ шуд', rejected:'Рад шуд',
    accept:'Тасдиқ кардан', reject:'Рад кардан', retryAccept:'Такрори тасдиқ', retryReject:'Такрори радкунӣ',
    sending:'Дархост фиристода мешавад…', submitted:'Дархост сабт шуд. Ҳолати ҷорӣ дар рӯйхат аст.',
    saved:'Нақша сохта шуд.', declined:'Дархост рад шуд. Нақша сохта нашуд.', denied:'Сервер иҷозат надод. Иҷозатҳо ва рӯйхат нав шуданд.',
    conflict:'Дархости тағйирёфта ё қарори қабулшударо такрор кардан мумкин нест. Рӯйхат нав шуд.',
    invalid:'Номро санҷед: аз 1 то 240 аломат, бе аломатҳои идоракунӣ.',
    unknown:'Ҷавоб тасдиқ нашуд. Ҳамон амалро такрор кунед: барнома дубора сабт намесозад.',
    unknownDenied:'Сервер такрорро рад кард, вале натиҷаи кӯшиши аввал номаълум аст. Пеш аз дархости нав рӯйхатро санҷед.',
    defer:'Нигоҳ доштан дар навбат', discard:'Ҳазфи дархости нафиристода', queueSend:'Фиристодан аз навбат',
    queued:'Дар ин дастгоҳ нигоҳ дошта шуд. Фиристодани худкор нест.', discarded:'Дархости нафиристода аз дастгоҳ ҳазф шуд.',
    outboxHelp:'Навбат дар браузер бе рамзгузорӣ нигоҳ дошта мешавад. Танҳо номҳои сохтаро истифода баред. Пас аз бозкушоӣ ворид шавед.',
    offline:'Шабака нест. Дархостро дар навбат нигоҳ доред ё баъд аз барқарории шабака дастӣ фиристед.',
    storageFailed:'Хондан ё нав кардани навбат имкон надошт. То барқарории анбор фиристодан қатъ аст.',
    removedElsewhere:'Навбат дар равзанаи дигар тағйир ёфт. Дархости нигоҳдоштаро санҷед.',
    followOn:'Навсозии худкор аз сервер: ҳар 5 сония, то вақте ки равзана намоён аст.',
    followPaused:'Навсозии худкор боздошта шуд: шабака нест ё равзана пинҳон аст.',
    followError:'Навсозӣ муяссар нашуд. Рӯйхат то тасдиқи сервер пинҳон аст.',
    lostScope:'Такрори амал имкон надорад: иҷозат тағйир ёфт. Ба ҷойи ин дархост дархости нав насозед.'
  }
};
const roles = new Set(['staff','deputy','director']);
const limit = 100;
export function createApprovals({client, outbox, follow, language, onRecordsChanged}) {
  const $ = id => document.getElementById(id);
  const tr = key => copy[language()][key] ?? '';
  let active = null;
  let states = new Map();
  let actor = null;
  const writes = new Set();
  const poller=follow ? createForegroundPoller({canPoll:()=>navigator.onLine && !document.hidden,onState:()=>render()}) : null;
  const isAuthor = s => s.role==='staff' || s.role==='deputy';
  function fromEntry(s,entry) {
    return {kind:'submit',rpc:'submit_plan_creation',durable:true,uncertain:entry.attempted,
      args:{p_school_id:s.school,p_title:entry.title,p_client_request_id:entry.id}};
  }
  function showEntry(s,entry) {
    if (entry) s.intent=fromEntry(s,entry);
    else if (s.intent?.kind==='submit') s.intent=null;
  }
  function prepareLabels() {
    for (const [id,key] of [['approvalHeading','header'],['approvalMode','mode'],['approvalRefresh','refresh'],['approvalTitleLabel','title']]) {
      $(id).textContent = tr(key);
    }
  }
  function button(key, fn, secondary=false) {
    const b = document.createElement('button'); b.type='button'; b.textContent=tr(key);
    if (secondary) b.className='secondary';
    b.addEventListener('click',fn);
    return b;
  }
  function render() {
    const s = active;
    const panel = $('approvalPanel');
    panel.hidden = !s || (!s.role && !s.loading && !s.failed && !s.intent);
    if (panel.hidden) {
      $('approvalTitle').value=''; $('approvalQueue').replaceChildren(); $('approvalStatus').textContent='';
      $('approvalForm').hidden=true; return;
    }
    prepareLabels();
    const author = isAuthor(s);
    const offline = !!(outbox || follow) && !navigator.onLine;
    const review = s.role === 'director';
    const retrySubmit = s.intent?.kind === 'submit';
    const retryDecision = s.intent?.kind === 'decision';
    const canRetry = retrySubmit ? author : retryDecision ? review : true;
    $('approvalContext').textContent=s.role ? tr(review ? 'review' : 'own') : '';
    $('approvalFollowStatus').hidden=!follow;
    $('approvalFollowStatus').textContent=follow ? tr(offline || document.hidden ? 'followPaused' : s.failed ? 'followError' : 'followOn') : '';
    const line = s.busy ? 'sending' : s.loading ? 'loading' : s.intent && !canRetry && !s.failed ? 'lostScope' :
      s.storageFailed ? 'storageFailed' : s.failed ? 'failed' : s.note || (offline && author ? 'offline' :
        retrySubmit && s.intent.durable ? (s.intent.uncertain?'unknown':'queued') : (s.limited?'truncated':s.rows.length?'':'none'));
    $('approvalStatus').textContent = tr(line);
    $('approvalRefresh').disabled = s.busy || s.loading || offline;
    $('approvalForm').hidden = !author || s.loading || s.failed;
    const input = $('approvalTitle');
    const desired = !author ? '' : retrySubmit ? s.intent.args.p_title : s.draft;
    if (input.value !== desired) input.value = desired;
    input.readOnly = s.busy || retrySubmit;
    $('approvalSubmit').textContent = tr(retrySubmit && !s.busy ? (s.intent.durable && !s.intent.uncertain ? 'queueSend' : 'retry') : 'send');
    $('approvalSubmit').disabled = s.busy || !!s.intent && !retrySubmit || offline || !!s.storageFailed;
    $('approvalDefer').hidden = !outbox || !author || !!s.intent;
    $('approvalDefer').disabled = s.busy || !!s.storageFailed; $('approvalDefer').textContent=tr('defer');
    $('approvalDiscard').hidden = !outbox || !author || !retrySubmit || !s.intent.durable || !!s.intent.uncertain;
    $('approvalDiscard').disabled = s.busy || !!s.storageFailed; $('approvalDiscard').textContent=tr('discard');
    $('outboxHelp').hidden = !outbox || !author; $('outboxHelp').textContent=tr('outboxHelp');
    $('approvalQueue').replaceChildren(...s.rows.map(row => {
      const li = document.createElement('li');
      const title = document.createElement('strong'); title.textContent=row.title;
      const state = document.createElement('span'); state.className='approval-state'; state.textContent=tr(row.status);
      li.append(title,state);
      if (review && row.status === 'pending' && !s.intent && !s.busy && !offline) {
        const controls = document.createElement('div'); controls.className='approval-controls';
        controls.append(button('accept',()=>startDecision(s,row.id,true)),button('reject',()=>startDecision(s,row.id,false),true));
        li.append(controls);
      }
      return li;
    }));
    // Keep retry available even if a successful decision has already removed the pending controls.
    if (review && retryDecision && !s.busy && !s.loading && !s.failed && !offline) {
      const li=document.createElement('li');
      li.append(button(s.intent.args.p_approve?'retryAccept':'retryReject',()=>send(s,s.intent)));
      $('approvalQueue').prepend(li);
    }
  }
  function hide() {
    poller?.stop();
    active?.read?.abort(); active=null; render();
  }
  function reset() {
    hide(); states = new Map(); actor=null;
    for (const controller of writes) controller.abort();
    writes.clear();
  }
  function select(user,school) {
    if (user !== actor) { reset(); actor=user; }
    hide();
    if (!user || !school) return;
    if (!states.has(school)) states.set(school,{school,user,draft:'',rows:[],revision:0});
    active=states.get(school);
    const scoped=active;
    void read(scoped);
    poller?.start(signal=>reconcile(scoped,signal));
  }
  async function fetchQueue(s,signal) {
    const {data,error}=await client.from('school_memberships').select('role')
      .eq('user_id',s.user).eq('organization_id',s.school).maybeSingle().abortSignal(signal);
    if (error) throw error;
    if (!roles.has(data?.role)) return {role:null,limited:false,rows:[]};
    const queue=await client.from('plan_creation_requests').select('id,title,status,created_at')
      .eq('organization_id',s.school).order('created_at',{ascending:false}).order('id').limit(limit+1).abortSignal(signal);
    if (queue.error) throw queue.error;
    return {role:data.role,limited:queue.data.length>limit,rows:queue.data.slice(0,limit)};
  }
  function snapshot(s) {
    return JSON.stringify([s.role,s.limited,s.rows]);
  }
  async function reconcile(s,parentSignal) {
    if (active!==s || s.loading || s.busy) return true;
    const revision=s.revision;
    const current=()=>active===s && !parentSignal.aborted && s.revision===revision && !s.busy;
    const signal=AbortSignal.any([parentSignal,AbortSignal.timeout(9000)]);
    try {
      const incoming=await fetchQueue(s,signal);
      if (!current()) return true;
      const before=snapshot(s), failed=s.failed;
      Object.assign(s,incoming,{failed:false});
      const changed=before!==snapshot(s) || failed;
      if (changed) render();
      // Read both lists even when the queue matches: a prior independent records read
      // may have raced an approval commit. Never re-send mutations from here.
      if (changed || s.role) await onRecordsChanged(s.school,s.user,true,parentSignal);
      return true;
    } catch {
      if (!current()) return true;
      const wasFailed=s.failed;
      Object.assign(s,{role:null,rows:[],limited:false,failed:true});
      render();
      if (!wasFailed) await onRecordsChanged(s.school,s.user,true,parentSignal);
      return false;
    }
  }
  async function read(s) {
    if (active!==s) return;
    s.revision++;
    s.read?.abort(); const readController = new AbortController(); s.read=readController;
    const signal=AbortSignal.any([readController.signal,AbortSignal.timeout(10000)]);
    const current = () => active===s && s.read===readController && !readController.signal.aborted;
    s.role=null; s.rows=[]; s.failed=false; s.loading=true; s.limited=false; render();
    try {
      const incoming=await fetchQueue(s,signal);
      if (!current()) return;
      Object.assign(s,incoming,{storageFailed:false});
      if (outbox && isAuthor(s) && !s.busy) {
        try {
          const saved=await outbox.read(s.user,s.school);
          if (current()) { showEntry(s,saved); if (!saved && ['queued','unknown','unknownDenied'].includes(s.note)) s.note=''; }
        } catch { if (current()) s.storageFailed=true; }
      }
    } catch { if(current()) s.failed=true; }
    finally { if(current()){ s.loading=false; render(); } }
  }
  function startDecision(s,id,approve) {
    if (((outbox || follow) && !navigator.onLine) || s!==active || s.role!=='director' || s.intent || s.busy || !s.rows.some(row=>row.id===id && row.status==='pending')) return;
    s.intent={kind:'decision',rpc:'decide_plan_creation',args:{p_school_id:s.school,p_request_id:id,p_approve:approve}};
    void send(s,s.intent);
  }
  function confirmResult(intent,data) {
    return intent.kind === 'submit' ? typeof data==='string' && /^[0-9a-f-]{36}$/i.test(data) :
      data?.request_id===intent.args.p_request_id && data.status===(intent.args.p_approve?'approved':'rejected') &&
      (intent.args.p_approve ? typeof data.record_id==='string' : data.record_id===null);
  }
  async function send(s,intent) {
    if (active!==s || s.busy || s.loading || s.failed || !intent || s.intent!==intent || ((outbox || follow) && !navigator.onLine)) return;
    if (intent.kind==='submit' ? !isAuthor(s) || s.storageFailed : s.role!=='director') return;
    const sessionStates=states;
    const ctrl=new AbortController(); writes.add(ctrl);
    const expected = (error,code,status) => error?.code===code && status;
    s.revision++; s.busy=true; s.note=''; render();
    let refresh=false;
    const durable=!!outbox && intent.kind==='submit';
    try {
      if (durable) {
        // Persist the exact RPC intent before fetching. Never send stale or uncommitted storage data.
        try {
          const entry=await outbox.stage(s.user,s.school,{id:intent.args.p_client_request_id,title:intent.args.p_title});
          if (sessionStates!==states) return;
          if (entry.id!==intent.args.p_client_request_id || entry.title!==intent.args.p_title) {
            showEntry(s,entry); s.note='removedElsewhere'; return;
          }
          intent.durable=true;
          if (active!==s) return;
          const sent=await outbox.begin(s.user,s.school,entry.id);
          if (sessionStates!==states) return;
          if (!sent) { showEntry(s,await outbox.read(s.user,s.school)); s.note='removedElsewhere'; return; }
          if (active!==s) { intent.uncertain=true; return; }
        } catch { s.storageFailed=true; return; }
      }
      const signal=AbortSignal.any([ctrl.signal,AbortSignal.timeout(12000)]);
      const {data,error,status}=await client.rpc(intent.rpc,intent.args).abortSignal(signal);
      if (sessionStates!==states) return;
      if (!error && confirmResult(intent,data)) {
        if (durable) {
          try { await outbox.remove(s.user,s.school,intent.args.p_client_request_id); }
          catch { intent.uncertain=true; s.storageFailed=true; return; }
          if (sessionStates!==states) return;
        }
        s.intent=null; refresh=true;
        if (intent.kind==='submit') { s.draft=''; s.note='submitted'; }
        else if (intent.args.p_approve) { s.note='saved'; onRecordsChanged(s.school,s.user); }
        else s.note='declined';
      } else if (durable) {
        // With a durable intent, even a definite rejection on this attempt need not describe an earlier attempt.
        intent.uncertain=true;
        s.note=expected(error,'42501',[401,403].includes(status))?'unknownDenied':'unknown';
        refresh=expected(error,'42501',[401,403].includes(status));
      } else if (expected(error,'42501',[401,403].includes(status)) || expected(error,'23505',status===409)) {
        refresh=true;
        if (error.code==='42501' && intent.uncertain) s.note='unknownDenied';
        else { s.intent=null; s.note=error.code==='42501'?'denied':'conflict'; }
      } else if (expected(error,'22023',status===400)) { s.intent=null; s.note='invalid'; }
      else { intent.uncertain=true; s.note='unknown'; }
    } catch { if (sessionStates===states) { intent.uncertain=true; s.note='unknown'; } }
    finally {
      writes.delete(ctrl);
      if (sessionStates===states) {
        s.busy=false;
        if (active===s) refresh ? void read(s) : render();
      }
    }
  }
  function newSubmission(s) {
    const title=$('approvalTitle').value.trim();
    if (!title || [...title].length>240 || /[\u0000-\u001f\u007f-\u009f]/.test(title)) { s.note='invalid'; render(); return null; }
    return {kind:'submit',rpc:'submit_plan_creation',args:{p_school_id:s.school,p_title:title,p_client_request_id:crypto.randomUUID()}};
  }
  async function changeQueue(discard) {
    const s=active;
    if (!outbox || !s || !isAuthor(s) || s.busy || s.loading || s.failed || s.storageFailed) return;
    const sessionStates=states;
    const intent=discard ? s.intent : (!s.intent && newSubmission(s));
    if (!intent || (discard && (!intent.durable || intent.uncertain))) return;
    s.revision++; s.busy=true; s.note=''; render();
    try {
      if (discard) {
        const removed=await outbox.remove(s.user,s.school,intent.args.p_client_request_id,{unattemptedOnly:true});
        const entry=await outbox.read(s.user,s.school);
        if (sessionStates!==states) return;
        showEntry(s,entry);
        if (removed) s.draft='';
        s.note=removed ? 'discarded':'removedElsewhere';
      } else {
        const entry=await outbox.stage(s.user,s.school,{id:intent.args.p_client_request_id,title:intent.args.p_title});
        if (sessionStates!==states) return;
        showEntry(s,entry);
        s.note=entry.id===intent.args.p_client_request_id ? 'queued':'removedElsewhere';
      }
    } catch { if(sessionStates===states) s.storageFailed=true; }
    finally { if(sessionStates===states) { s.busy=false; if(active===s) render(); } }
  }
  $('approvalRefresh').addEventListener('click',()=>{ if(active && !active.busy) void read(active); });
  $('approvalTitle').addEventListener('input',e=>{ if (active && !active.intent) active.draft=e.target.value; });
  $('approvalDefer').addEventListener('click',()=>void changeQueue(false));
  $('approvalDiscard').addEventListener('click',()=>void changeQueue(true));
  if (follow) {
    for (const event of ['online','offline']) window.addEventListener(event,()=>poller.wake());
    document.addEventListener('visibilitychange',()=>poller.wake());
  } else if (outbox) for (const event of ['online','offline']) window.addEventListener(event,render);
  $('approvalForm').addEventListener('submit',event=>{
    event.preventDefault();
    const s=active;
    if (!s || s.busy || s.loading || s.failed || s.storageFailed || !isAuthor(s) || ((outbox || follow) && !navigator.onLine)) return;
    if (!s.intent) s.intent=newSubmission(s);
    if (s.intent?.kind==='submit') void send(s,s.intent);
  });
  return {select,hide,reset,render};
}
