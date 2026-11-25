// One foreground read at a time. Visibility, network and scope changes cancel stale work.
export function createForegroundPoller({canPoll, onState, delay=5000, cap=30000}) {
  let scope=null;
  function cancel(s) {
    clearTimeout(s.timer); s.timer=null;
    s.controller?.abort(); s.controller=null;
  }
  function schedule(s, ms) {
    if (scope!==s || !canPoll() || s.controller || s.timer!==null) return;
    s.timer=setTimeout(()=>{ s.timer=null; void tick(s); },ms);
  }
  async function tick(s) {
    if (scope!==s || !canPoll() || s.controller) return;
    const ctrl=new AbortController(); s.controller=ctrl;
    let ok=false;
    try { ok=await s.load(ctrl.signal); } catch { /* a failed read gets backoff */ }
    if (scope!==s || s.controller!==ctrl) return;
    s.controller=null;
    s.next=ok ? delay : Math.min(cap,s.next*2);
    schedule(s,s.next);
  }
  function stop() { if (!scope) return; const old=scope; scope=null; cancel(old); }
  function start(load) {
    stop(); scope={load,controller:null,timer:null,next:delay};
    schedule(scope,delay);
  }
  function wake() {
    onState?.();
    const s=scope;
    if (!s) return;
    if (!canPoll()) { cancel(s); return; }
    if (s.controller) return;
    clearTimeout(s.timer); s.timer=null; s.next=delay;
    schedule(s,0);
  }
  return {start,stop,wake};
}
