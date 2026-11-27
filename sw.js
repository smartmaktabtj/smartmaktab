const CACHE = 'smartmaktab-shell-v25';
const ASSETS = ['./index.html','./manifest.webmanifest','./icon.svg','./pwa-192.png','./pwa-512.png'];
const urlFor=path=>new URL(path,self.registration.scope).href;
const CACHEABLE=new Set(ASSETS.map(urlFor));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(
 keys.filter(key=>key.startsWith('smartmaktab-shell-')&&key!==CACHE).map(key=>caches.delete(key))
)).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const request=event.request,{href,pathname,searchParams}=new URL(request.url);
 if(request.method!=='GET'||!href.startsWith(self.registration.scope))return;
 const relative=pathname.slice(new URL(self.registration.scope).pathname.length);
 if(request.mode==='navigate'&&(!relative||relative==='index.html')){
  event.respondWith(fetch(request).catch(()=>caches.match(urlFor('./index.html'))));return;
 }
 if(request.mode==='navigate'&&/^cabinets\/(?:[a-z-]+\/){1,2}[a-z0-9-]+\.html$/.test(relative)){
  event.respondWith(fetch(request).catch(()=>{
   const target=new URL('./index.html',self.registration.scope);
   target.searchParams.set('offlineCabinet',relative);
   for(const key of ['school','lang'])if(searchParams.has(key))target.searchParams.set(key,searchParams.get(key));
   return Response.redirect(target.href);
  }));return;
 }
 if(CACHEABLE.has(href))event.respondWith(caches.match(href).then(hit=>hit||fetch(request)));
});
