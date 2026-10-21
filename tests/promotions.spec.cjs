const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');let server,browser,base;
before(async()=>{
 server=http.createServer((req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/Rest\//,'/');if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error();const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.json':'application/json','.pdf':'application/pdf','.webp':'image/webp'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/Rest/`;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function pageAt(route='news.html',options={}){const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce',...options});p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));await p.goto(base+route,{waitUntil:'domcontentloaded'});return p;}
test('Promotions page fits eight widths, keeps touch controls readable and separates floating widgets',async()=>{
 for(const width of [320,375,390,430,768,1024,1440,1920]){
  const p=await pageAt('news.html',{viewport:{width,height:950}});await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,String(width));assert.equal(await p.locator('[data-offer]').count(),3);assert.equal(await p.locator('[data-offer="birthday"] h2').innerText(),'День рождения\nу Волги');
  const tg=await p.locator('.telegram-widget').boundingBox(),food=await p.locator('.delivery-widget').boundingBox();assert(tg.y+tg.height<=food.y-7,'widgets overlap');assert(tg.x>=0&&tg.x+tg.width<=width);assert(food.x>=0&&food.x+food.width<=width);assert(tg.height>=44&&food.height>=44);
  const header=await p.locator('.menu-header').boundingBox();const logo=await p.locator('.brand-center').boundingBox();assert(logo.x>=-1&&logo.x+logo.width<=width,'logo clipped');assert(header.width<=width);
  if(width<=1024){await p.locator('.nav-toggle').click();assert.equal(await p.locator('#mobile-nav').isVisible(),true);await p.keyboard.press('Escape');assert.equal(await p.locator('#mobile-nav').isVisible(),false);assert.equal(await p.locator('.nav-toggle').getAttribute('aria-expanded'),'false');}
  await p.waitForFunction(()=>[...document.querySelectorAll('.offer-image img')].every(img=>img.complete&&img.naturalWidth>0));
  assert.doesNotMatch(await p.locator('main').innerText(),/\d+\s*%|бесплатн|подарок|скидк/i);assert.deepEqual(p.errors,[]);
  if(width===390||width===1440)await p.screenshot({path:`/workspace/shared/promotions-${width}.png`,fullPage:true});await p.close();
 }
});
test('Each offer opens the real bot URL with its own source and filtering survives navigation',async()=>{
 const p=await pageAt();await p.context().route('https://t.me/**',route=>route.fulfill({status:200,contentType:'text/html',body:'Telegram intercepted; no real connection'}));
 const sources=new Set();for(const kind of ['birthday','company','delivery']){const card=p.locator(`[data-offer="${kind}"]`);const href=await card.getAttribute('href');const u=new URL(href);assert.equal(u.origin,'https://t.me');assert.equal(u.pathname,'/RESTSCHMIDTBOT');assert.equal(u.searchParams.get('start'),`promo_${kind}`);sources.add(u.searchParams.get('start'));assert.equal(await card.getAttribute('rel'),'noopener noreferrer');const pop=p.waitForEvent('popup');await card.click();const opened=await pop;await opened.waitForLoadState('domcontentloaded');assert.equal(opened.url(),href);await opened.close();}assert.equal(sources.size,3);
 await p.locator('[data-news-filter="birthday"]').click();assert.equal(await p.locator('[data-news-category]:visible').count(),1);assert.equal(new URL(p.url()).searchParams.get('topic'),'birthday');await p.reload();assert.equal(await p.locator('[data-news-category]:visible').count(),1);await p.locator('[data-news-filter="delivery"]').click();await p.goBack();assert.equal(await p.locator('[data-news-filter="birthday"]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('[data-news-category]:visible').count(),1);
 await p.goto(base+'news.html?topic=unknown');assert.equal(await p.locator('[data-news-category]:visible').count(),3);assert.equal(await p.locator('[data-news-filter="all"]').getAttribute('aria-pressed'),'true');
 await p.setViewportSize({width:1024,height:900});await p.locator('.nav-toggle').click();await p.setViewportSize({width:1440,height:900});await p.waitForFunction(()=>document.querySelector('#mobile-nav').hidden);assert.deepEqual(p.errors,[]);await p.close();
});
test('Promotions and bot links remain useful without GSAP or JavaScript; menus keep their PDF',async()=>{
 const p=await pageAt('news.html',{javaScriptEnabled:false,viewport:{width:390,height:950}});assert.equal(await p.locator('[data-offer]:visible').count(),3);assert.equal(await p.locator('.news-filters').isVisible(),false);assert.match(await p.locator('[data-offer="birthday"]').getAttribute('href'),/start=promo_birthday$/);assert.equal(await p.locator('[data-telegram-widget]').count(),1);await p.close();
 const q=await browser.newPage({reducedMotion:'reduce'});const errors=[];q.on('pageerror',e=>errors.push(e.message));await q.route('**/assets/vendor/gsap.min.js',route=>route.abort());await q.goto(base+'news.html');await q.locator('[data-news-filter="company"]').click();assert.equal(await q.locator('[data-news-category]:visible').count(),1);assert.deepEqual(errors,[]);await q.close();
 for(const entry of ['index.html','menu.html']){const r=await pageAt(entry);assert.equal(await r.locator('[data-section="kitchen"]').getAttribute('href'),'assets/menus/kitchen-menu.pdf');assert.equal(await r.locator('[data-telegram-widget]').count(),1);assert.equal(await r.locator('.delivery-widget').count(),1);for(const link of await r.locator('[data-promotions-page]').all())assert.equal(await link.getAttribute('href'),'news.html');assert.deepEqual(r.errors,[]);await r.close();}
});
