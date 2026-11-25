import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig, allowApprovalExperiment, allowApprovalFollow, allowApprovalOutbox} from '../dev/config.mjs';
const url = 'https://abcdefghijklmnopqrst.supabase.co';
const publishableKey = 'sb_publishable_test';
test('validate hosted dev config and disallow arbitrary hosts, URLs and privileged keys', () => {
  assert.deepEqual(validateConfig({url,publishableKey}, 'preview.example'), {url,key:publishableKey});
  for (const bad of [null, {}, {url,publishableKey:'sb_secret_test'}, {url:url+'.example.org',publishableKey},
    {url:url+'/rest/v1',publishableKey}, {url:url.replace('https:', 'http:'),publishableKey},
    {url:'https://user@abcdefghijklmnopqrst.supabase.co',publishableKey}]) assert.throws(()=>validateConfig(bad,'preview.example'));
});
test('only a loopback browser can use local config; local JWT must be anon', () => {
  const local = 'http://localhost:54321';
  const mock = role => `jwt.${Buffer.from(JSON.stringify({role})).toString('base64url')}.test`;
  assert.deepEqual(validateConfig({url:local,publishableKey:mock('anon')},'localhost'), {url:local,key:mock('anon')});
  assert.throws(()=>validateConfig({url:local,publishableKey:mock('service_role')},'localhost'));
  assert.throws(()=>validateConfig({url:local,publishableKey},'preview.example'));
});

test('approvals require explicit opt-in and both the page and API on loopback', () => {
  const local='http://127.0.0.1:54321';
  const page='http://localhost:4173/dev/';
  const on={approvalExperiment:true};
  assert.equal(allowApprovalExperiment(on,page,local),true);
  assert.equal(allowApprovalExperiment({},page,local),false);
  assert.equal(allowApprovalExperiment({approvalExperiment:'true'},page,local),false);
  assert.equal(allowApprovalExperiment(on,'https://preview.example/dev/',local),false);
  assert.equal(allowApprovalExperiment(on,page,'https://abcdefghijklmnopqrst.supabase.co'),false);
});

test('durable approval outbox has a second explicit opt-in and cannot run against hosted Supabase',()=>{
  const local='http://127.0.0.1:54321';
  const page='http://localhost:4173/dev/';
  assert.equal(allowApprovalOutbox({approvalOutbox:true},page,local),false);
  assert.equal(allowApprovalOutbox({approvalExperiment:true},page,local),false);
  const enabled={approvalExperiment:true,approvalOutbox:true};
  assert.equal(allowApprovalOutbox(enabled,page,local),true);
  assert.equal(allowApprovalOutbox(enabled,page,url),false);
  assert.equal(allowApprovalOutbox(enabled,'https://preview.example/dev/',local),false);
});


test('foreground follow never starts in hosted dev and requires a separate flag',()=>{
  const local='http://127.0.0.1:54321', page='http://localhost:4173/dev/';
  assert.equal(allowApprovalFollow({approvalExperiment:true},page,local),false);
  assert.equal(allowApprovalFollow({approvalFollow:true},page,local),false);
  const enabled={approvalExperiment:true,approvalFollow:true};
  assert.equal(allowApprovalFollow(enabled,page,local),true);
  assert.equal(allowApprovalFollow(enabled,page,url),false);
  assert.equal(allowApprovalFollow(enabled,'https://preview.example/dev/',local),false);
});
