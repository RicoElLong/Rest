const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'assets/menu.json'),'utf8'));
let server,browser,base;
before(async()=>{
 server=http.createServer((req,res)=>{
  try{
   let pathname=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/Rest\//,'/');
   if(pathname.endsWith('/'))pathname+='index.html';
   const file=path.resolve(root,'.'+pathname);
   if(!file.startsWith(root+path.sep))throw Error('Outside root');
   const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
   res.setHeader('Content-Type',mime);res.end(fs.readFileSync(file));
  }catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base=`http://127.0.0.1:${server.address().port}/Rest/`;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function pageAt(route='menu.html',options={}){
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce',...options});
 page.errors=[];page.on('pageerror',err=>page.errors.push(err.message));
 await page.goto(base+route,{waitUntil:'domcontentloaded'});
 await page.locator('.menu-dish').first().waitFor();return page;
}
async function category(page,id){await page.locator(`[data-category="${id}"]`).click();}
const count=page=>page.locator('.menu-dish').count();
test('JSON has all 48 unique positions, 10 categories and honest unverified fields',()=>{
 assert.equal(data.items.length,48);assert.equal(data.categories.length,10);assert.equal(new Set(data.items.map(i=>i.id)).size,48);
 for(const item of data.items){assert(data.categories.some(c=>c.id===item.categoryId));assert(item.priceRub>0);assert.equal(item.priceVerified,false);assert.equal(item.image,null);assert.equal(item.imageStatus,'missing');assert.equal(item.weightGrams,null);assert.equal(item.ingredients,null);assert.equal(item.available,null);assert(item.description);assert(item.history.split(/[.!?]/).filter(s=>s.trim()).length>=2);}
});
test('Every category shows exactly its JSON positions and preserves URL state',async()=>{
 const p=await pageAt();assert.equal(await count(p),48);assert.equal(await p.locator('[data-category]').count(),11);
 for(const cat of data.categories){await category(p,cat.id);assert.equal(await count(p),data.items.filter(i=>i.categoryId===cat.id).length,cat.id);assert.equal(new URL(p.url()).searchParams.get('category'),cat.id);assert.equal(await p.locator(`[data-category="${cat.id}"]`).getAttribute('aria-pressed'),'true');}
 await p.reload();await p.locator('.menu-dish').first().waitFor();assert.equal(await count(p),2);assert.deepEqual(p.errors,[]);await p.close();
});
test('All 48 detail dialogs preserve exact names, prices, histories and unknown recipe fields',async()=>{
 const p=await pageAt();
 for(const item of data.items){const card=p.locator(`[data-item-id="${item.id}"] .dish-button`);await card.click();assert.equal(await p.locator('#dialog-title').innerText(),item.name);assert.equal((await p.locator('#dialog-price').innerText()).replace(/\s/g,''),`${item.priceRub}₽`);assert.equal(await p.locator('#dialog-history').innerText(),item.history);assert.match(await p.locator('#dialog-price-status').innerText(),/Предварительная/);assert.equal(await p.locator('#dialog-weight').isVisible(),false);assert.equal(await p.locator('.dialog-zoom').isVisible(),false);await p.keyboard.press('Escape');assert.equal(await card.evaluate(el=>document.activeElement===el),true);}
 assert.deepEqual(p.errors,[]);await p.close();
});
test('Search normalizes е/ё, empty results reset, and sorting uses numeric prices',async()=>{
 const p=await pageAt();await p.locator('#dish-search').fill('семги');await p.waitForTimeout(180);assert.equal(await count(p),1);assert.match(await p.locator('.dish-name').innerText(),/сёмги/);
 await p.locator('#dish-search').fill('zzzz-нет-такого');await p.waitForTimeout(180);assert.equal(await count(p),0);assert.equal(await p.locator('.empty-state').isVisible(),true);await p.locator('.catalog-reset').click();assert.equal(await count(p),48);
 for(const sort of ['price-asc','price-desc']){await p.locator('#dish-sort').selectOption(sort);const ids=await p.locator('.menu-dish').evaluateAll(nodes=>nodes.map(n=>n.dataset.itemId));const prices=ids.map(id=>data.items.find(i=>i.id===id).priceRub);assert.deepEqual(prices,[...prices].sort((a,b)=>sort==='price-asc'?a-b:b-a));}
 await p.close();
});
test('Deep links, reload and browser back/forward retain catalogue selection',async()=>{
 const p=await pageAt('menu.html?category=soups&q=харчо&sort=price-desc#selected-menu');assert.equal(await count(p),1);assert.equal(await p.locator('#dish-search').inputValue(),'харчо');assert.equal(await p.locator('#dish-sort').inputValue(),'price-desc');
 await p.locator('#dish-search').fill('');await p.waitForTimeout(180);await category(p,'fish');assert.equal(await count(p),3);await category(p,'grill');assert.equal(await count(p),10);await p.goBack();assert.equal(await count(p),3);assert.match(await p.locator('#selection-heading').innerText(),/Рыба/);await p.goForward();assert.equal(await count(p),10);await p.close();
});
test('650 ms mouse hold opens once; movement cancels hold; regular click still works',async()=>{
 const p=await pageAt('menu.html',{reducedMotion:'no-preference'});const button=p.locator('.dish-button').first();await button.scrollIntoViewIfNeeded();
 await p.evaluate(()=>{window.openCount=0;new MutationObserver(ms=>{for(const m of ms)if(m.attributeName==='open'&&m.target.open)window.openCount++;}).observe(document.querySelector('#dish-dialog'),{attributes:true,attributeFilter:['open']});});
 let r=await button.boundingBox();await p.mouse.move(r.x+40,r.y+40);await p.mouse.down();await p.waitForTimeout(300);assert.equal(await p.locator('#dish-dialog').isVisible(),false);assert.equal(await button.locator('.hold-ring').evaluate(el=>getComputedStyle(el).opacity),'1');await p.waitForTimeout(450);assert.equal(await p.locator('#dish-dialog').isVisible(),true);await p.mouse.up();await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>window.openCount),1);assert.equal(await p.locator('#dish-dialog').isVisible(),true);await p.keyboard.press('Escape');
 await button.scrollIntoViewIfNeeded();r=await button.boundingBox();await p.mouse.move(r.x+40,r.y+40);await p.mouse.down();await p.mouse.move(r.x+r.width+20,r.y+30);await p.waitForTimeout(750);await p.mouse.up();assert.equal(await p.locator('#dish-dialog').isVisible(),false);await button.click();assert.equal(await p.locator('#dish-dialog').isVisible(),true);await p.keyboard.press('Escape');assert.deepEqual(p.errors,[]);await p.close();
});
test('Keyboard opens with Enter/Space, native dialog traps focus, Escape restores it',async()=>{
 const p=await pageAt();const button=p.locator('.dish-button').first();for(const key of ['Enter','Space']){await button.focus();await p.keyboard.press(key);assert.equal(await p.locator('#dish-dialog').isVisible(),true);for(let i=0;i<12;i++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.querySelector('#dish-dialog').contains(document.activeElement)),true);}await p.keyboard.press('Escape');assert.equal(await button.evaluate(el=>document.activeElement===el),true);}await p.close();
});
test('Failed JSON request offers a working retry',async()=>{
 const p=await browser.newPage({reducedMotion:'reduce'});let fail=true;await p.route('**/assets/menu.json',route=>fail?route.abort():route.continue());await p.goto(base+'menu.html');await p.locator('.catalog-error').waitFor();assert.equal(await count(p),0);fail=false;await p.locator('.catalog-retry').click();await p.locator('.menu-dish').first().waitFor();assert.equal(await count(p),48);assert.equal(await p.locator('.catalog-error').isVisible(),false);await p.close();
});
test('Mobile layouts and homepage keep navigation and contacts after gallery',async()=>{
 for(const width of [320,390,430,768,1024]){const p=await pageAt('',{viewport:{width,height:950},isMobile:width<768,hasTouch:width<768});assert.equal(await count(p),48);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await p.evaluate(()=>[...document.querySelectorAll('section')].at(-1).id),'location');await p.locator('.dish-button').first().click();assert.equal(await p.evaluate(()=>document.body.style.position),'fixed');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.keyboard.press('Escape');await p.waitForFunction(()=>document.body.style.position!=='fixed');assert.equal(await p.evaluate(()=>document.body.style.position),'');assert.deepEqual(p.errors,[]);await p.close();}
});
test('Mobile touch categories scroll; content scroll does not close dialog; handle swipe does',async()=>{
 const p=await pageAt('menu.html',{viewport:{width:390,height:844},isMobile:true,hasTouch:true});const cdp=await p.context().newCDPSession(p);
 async function swipe(x,y,dx,dy){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(100);}
 await p.locator('.catalog-categories').scrollIntoViewIfNeeded();let r=await p.locator('.catalog-categories').boundingBox();await swipe(r.x+r.width-30,r.y+22,-200,0);assert((await p.locator('.catalog-categories').evaluate(el=>el.scrollLeft))>0);
 // Let native horizontal momentum finish before a new independent tap.
 await p.waitForTimeout(800);
 await p.locator('.dish-button').first().tap();assert.equal(await p.locator('#dish-dialog').isVisible(),true);await swipe(100,650,0,-160);assert.equal(await p.locator('#dish-dialog').isVisible(),true);assert((await p.locator('#dish-dialog').evaluate(el=>el.scrollTop))>0);await p.waitForTimeout(600);await p.locator('#dish-dialog').evaluate(el=>el.scrollTop=0);await swipe(150,18,0,120);assert.equal(await p.locator('#dish-dialog').isVisible(),false);await p.close();
});
test('Image data supports a full-size photo/zoom and failed photos fall back honestly',async()=>{
 const p=await browser.newPage({reducedMotion:'reduce'});let broken=false;
 await p.route('**/assets/menu.json',route=>{const fixture=structuredClone(data);fixture.items[0].image={src:broken?'missing-photo.webp':'assets/gallery/dinner.jpg'};fixture.items[0].imageStatus='reference';return route.fulfill({json:fixture});});
 // A relative image path is site-relative, as in the supplied catalogue schema.
 await p.goto(base+'menu.html');await p.locator('.menu-dish').first().waitFor();await p.locator('.dish-button').first().click();await p.waitForFunction(()=>document.querySelector('#dialog-image').naturalWidth>0);assert.equal(await p.locator('.dialog-zoom').isVisible(),true);await p.locator('.dialog-zoom').click();assert.equal(await p.locator('.dialog-zoom').getAttribute('aria-pressed'),'true');await p.keyboard.press('Escape');broken=true;await p.reload();await p.locator('.dish-button').first().click();await p.waitForTimeout(150);assert.equal(await p.locator('.catalog-dialog-placeholder').isVisible(),true);assert.equal(await p.locator('.dialog-zoom').isVisible(),false);await p.close();
});
test('Existing kitchen, grill, bar and booking panels stay connected to the new catalogue',async()=>{
 for(const route of ['','menu.html']){const p=await pageAt(route);await p.locator('[data-section="grill"]').click();assert.equal(await count(p),10);await p.locator('[data-section="bar"]').click();assert.equal(await count(p),2);await p.locator('[data-section="kitchen"]').click();assert.equal(await count(p),48);await p.locator('[data-section="booking"]').click();assert.equal(await p.locator('#booking-dialog').isVisible(),true);assert.match(await p.locator('.booking-phone').getAttribute('href'),/^tel:/);await p.locator('.booking-close').click();await p.waitForFunction(()=>document.body.style.position!=='fixed');assert.deepEqual(p.errors,[]);await p.close();}
});
test('Catalogue becomes usable while the animation library is still downloading',async()=>{
 const p=await browser.newPage({reducedMotion:'reduce'});let release;const gate=new Promise(resolve=>release=resolve);let libraryFinished=false,jsonRequests=0;
 p.on('request',req=>{if(req.url().endsWith('/assets/menu.json'))jsonRequests++;});
 await p.route('**/assets/vendor/gsap.min.js',async route=>{await gate;libraryFinished=true;await route.continue();});
 try{await p.goto(base+'menu.html#selected-menu',{waitUntil:'commit'});await p.locator('.menu-dish').first().waitFor({timeout:5000});assert.equal(await count(p),48);assert.equal(libraryFinished,false);assert.equal(jsonRequests,1);await category(p,'soups');assert.equal(await count(p),3);}finally{release();await p.waitForLoadState('domcontentloaded');await p.close();}
});
