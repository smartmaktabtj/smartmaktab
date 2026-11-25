import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createForegroundPoller} from '../dev/foreground-poller.mjs';

async function advance(t,ms){ t.mock.timers.tick(ms); await Promise.resolve(); }

test('poller backs off on failures and returns to normal cadence after success',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let count=0;
  const poll=createForegroundPoller({delay:10,cap:30,canPoll:()=>true});
  poll.start(async()=>{ count++; return count>=3; });
  await advance(t,9); assert.equal(count,0);
  await advance(t,1); assert.equal(count,1);
  await advance(t,19); assert.equal(count,1);
  await advance(t,1); assert.equal(count,2);
  await advance(t,29); assert.equal(count,2);
  await advance(t,1); assert.equal(count,3);
  await advance(t,10); assert.equal(count,4);
  poll.stop();
  await advance(t,100); assert.equal(count,4);
});

test('poller cancels on pause, starts fresh on resume and ignores results from an old scope',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let eligible=true;
  const old=[];
  const fresh=[];
  const poll=createForegroundPoller({delay:10,canPoll:()=>eligible});
  poll.start(signal=>new Promise(resolve=>old.push({signal,resolve})));
  await advance(t,10); assert.equal(old.length,1);
  await advance(t,100); assert.equal(old.length,1);
  eligible=false; poll.wake(); assert.equal(old[0].signal.aborted,true);
  await advance(t,100); assert.equal(old.length,1);
  eligible=true; poll.wake(); await advance(t,0); assert.equal(old.length,2);
  poll.start(async signal=>{fresh.push(signal); return true;});
  assert.equal(old[1].signal.aborted,true);
  old[0].resolve(false); old[1].resolve(true);
  await advance(t,10); assert.equal(fresh.length,1);
  await advance(t,10); assert.equal(fresh.length,2);
  poll.stop();
});
