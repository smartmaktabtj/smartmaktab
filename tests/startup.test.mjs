import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('startup embeds exactly the active registry without publishing earlier versions',async()=>{
 const [html,registry]=await Promise.all(['index.html','shared/cabinet-registry.json'].map(read));
 assert.deepEqual(JSON.parse(Buffer.from(html.match(/id="roleData" data-roles="([^"]+)"/)[1],'base64')),JSON.parse(registry));
 assert.match(html,/id="loginForm"[\s\S]*id="goToRegister"[\s\S]*id="goAuthorityLogin"/);
 assert.match(html,/id="startupUpdateMenu"[\s\S]*id="aliyaAddonToggle"[\s\S]*id="totalPriceAmount"/);
 assert.doesNotMatch(html,/href="\.\/(dashboard\.html|onboarding\/index\.html|dev\/)/);
 assert.match(html,/id="themeToggle"/);
 assert.doesNotMatch(html,/@@ROLE_DATA@@|@@VIEWER_DATA@@|@@STARTUP_JS@@|<script[^>]+src=/);
 const embedded=JSON.parse(gunzipSync(Buffer.from(html.match(/id="sm-embedded-pages" data-pack="([^"]+)"/)[1],'base64')));
 assert.equal(Object.keys(embedded.routes).length,24);
 for(const row of JSON.parse(registry))assert.ok(embedded.routes[row.path],row.id);
 assert.equal(embedded.dashboard,undefined);
});

test('the viewer source emits no markup-like strings inside the only executable inline tag',async()=>{
 const html=await read('index.html');
 const scripts=[...html.matchAll(/<script>(.*?)<\/script>/gs)];
 assert.equal(scripts.length,1);
 assert.doesNotMatch(scripts[0][1],/[<>]/);
 assert.doesNotMatch(html,/dashboardRuntime|\(\)=>runtime/);
});
