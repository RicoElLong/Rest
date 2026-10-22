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
   const mime={'.pdf':'application/pdf','.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream';
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
 const url=new URL(route,base);
 await page.goto(url.href,{waitUntil:'domcontentloaded'});
 await page.locator('.menu-dish').first().waitFor();return page;
}
async function category(page,id){await page.locator(`[data-category="${id}"]`).click();}
const count=page=>page.locator('.menu-dish').count();
test('JSON has all 48 unique positions, 10 categories and honest unverified fields',()=>{
 assert.equal(data.items.length,48);assert.equal(data.categories.length,10);assert.equal(new Set(data.items.map(i=>i.id)).size,48);
 for(const item of data.items){assert(data.categories.some(c=>c.id===item.categoryId));assert(item.priceRub>0);assert.equal(item.priceVerified,false);assert.equal(item.image,null);assert.equal(item.imageStatus,'missing');assert.equal(item.weightGrams,null);assert.equal(item.ingredients,null);assert.equal(item.available,null);assert(item.description===null||typeof item.description==='string');assert(item.history===null||typeof item.history==='string');assert.doesNotMatch(`${item.description||''} ${item.history||''}`,/в исходных данных|пока не подтвержд|уточняйте|рецептуру.*уточни|по одному названию/i);}
});
test('Every category shows exactly its JSON positions and preserves URL state',async()=>{
 const p=await pageAt();assert.equal(await count(p),10);assert.equal(await p.locator('[data-category]').count(),10);const seen=new Set();
 for(const cat of data.categories){await category(p,cat.id);const ids=await p.locator('.menu-dish').evaluateAll(nodes=>nodes.map(n=>n.dataset.itemId));assert.deepEqual(ids,data.items.filter(i=>i.categoryId===cat.id).map(i=>i.id),cat.id);ids.forEach(id=>seen.add(id));assert.equal(new URL(p.url()).searchParams.get('category'),cat.id);assert.equal(await p.locator(`[data-category="${cat.id}"]`).getAttribute('aria-pressed'),'true');}
 assert.equal(seen.size,48);
 await p.reload();await p.locator('.menu-dish').first().waitFor();assert.equal(await count(p),2);assert.deepEqual(p.errors,[]);await p.close();
});
test('All 48 dishes have distinct matching local photo placeholders on both entry points',async()=>{
 const signatures=data.items.map(item=>{const photo=item.placeholderImage;assert(photo?.src);assert(fs.existsSync(path.join(root,photo.src)));return `${photo.src}|${photo.size}|${photo.position}`;});assert.equal(new Set(signatures).size,48);
 for(const entry of ['index.html','menu.html']){const p=await pageAt(entry);
  for(const cat of data.categories){
   const items=data.items.filter(i=>i.categoryId===cat.id);await category(p,cat.id);assert.equal(await p.locator('.dish-placeholder.has-category-photo').count(),items.length);
   for(const item of items){
    const photo=p.locator(`[data-item-id="${item.id}"] .dish-placeholder`);assert.equal(await photo.innerText(),'Временное фото');assert.equal(await photo.getAttribute('aria-label'),`${item.name} — временная фотография`);
    const background=await photo.evaluate(el=>getComputedStyle(el).backgroundImage);assert(background.includes(item.placeholderImage.src));assert.equal(await photo.evaluate(el=>el.style.backgroundPosition),item.placeholderImage.position);
    await p.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();if(!image.naturalWidth)throw Error('Empty placeholder image');},new URL(item.placeholderImage.src,p.url()).href);
    await p.locator(`[data-item-id="${item.id}"] .dish-button`).click();const modal=p.locator('.catalog-dialog-placeholder');assert.equal(await modal.isVisible(),true);assert.equal(await modal.evaluate(el=>getComputedStyle(el).backgroundImage),background);assert.equal(await modal.innerText(),'Временное фото');assert.equal(await p.locator('.dialog-zoom').isVisible(),false);await p.keyboard.press('Escape');
   }
  }
  assert.deepEqual(p.errors,[]);await p.close();
 }
});
test('All 48 detail dialogs preserve exact names, prices, histories and unknown recipe fields',async()=>{
 const p=await pageAt();let active='grill';
 for(const item of data.items){if(item.categoryId!==active){await category(p,item.categoryId);active=item.categoryId;}const card=p.locator(`[data-item-id="${item.id}"] .dish-button`);await card.click();assert.equal(await p.locator('#dialog-title').innerText(),item.name);assert.equal((await p.locator('#dialog-price').innerText()).replace(/\s/g,''),`${item.priceRub}₽`);assert.equal(await p.locator('#dialog-history').textContent(),item.history||'');assert.equal(await p.locator('.dialog-story').isVisible(),Boolean(item.history));assert.match(await p.locator('#dialog-price-status').innerText(),/Предварительная/);assert.equal(await p.locator('#dialog-weight').isVisible(),false);assert.equal(await p.locator('.dialog-zoom').isVisible(),false);await p.keyboard.press('Escape');assert.equal(await card.evaluate(el=>document.activeElement===el),true);}
 assert.deepEqual(p.errors,[]);await p.close();
});
test('Catalogue has no search field and sorting uses numeric prices',async()=>{
 const p=await pageAt('menu.html?category=grill');assert.equal(await p.locator('#dish-search,.catalog-search').count(),0);
 for(const sort of ['price-asc','price-desc']){await p.locator('#dish-sort').selectOption(sort);const ids=await p.locator('.menu-dish').evaluateAll(nodes=>nodes.map(n=>n.dataset.itemId));const prices=ids.map(id=>data.items.find(i=>i.id===id).priceRub);assert.deepEqual(prices,[...prices].sort((a,b)=>sort==='price-asc'?a-b:b-a));}
 await p.close();
});
test('Deep links, reload and browser back/forward retain catalogue selection',async()=>{
 const p=await pageAt('menu.html?category=soups&q=харчо&sort=price-desc#selected-menu');assert.equal(await count(p),3);assert.equal(new URL(p.url()).searchParams.has('q'),false);assert.equal(await p.locator('#dish-sort').inputValue(),'price-desc');
 await category(p,'fish');assert.equal(await count(p),3);await category(p,'grill');assert.equal(await count(p),10);await p.goBack();assert.equal(await count(p),3);assert.equal(await p.locator('[data-category="fish"]').getAttribute('aria-pressed'),'true');await p.goForward();assert.equal(await count(p),10);await p.close();
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
 const p=await browser.newPage({reducedMotion:'reduce'});let fail=true;await p.route('**/assets/menu.json*',route=>fail?route.abort():route.continue());await p.goto(base+'menu.html');await p.locator('.catalog-error').waitFor();assert.equal(await count(p),0);fail=false;await p.locator('.catalog-retry').click();await p.locator('.menu-dish').first().waitFor();assert.equal(await count(p),10);assert.equal(await p.locator('.catalog-error').isVisible(),false);await p.close();
});
test('Mobile layouts and homepage keep navigation and contacts after gallery',async()=>{
 for(const width of [320,390,430,768,1024]){const p=await pageAt('',{viewport:{width,height:950},isMobile:width<768,hasTouch:width<768});assert.equal(await count(p),10);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await p.evaluate(()=>[...document.querySelectorAll('section')].at(-1).id),'location');await p.locator('.dish-button').first().click();assert.equal(await p.evaluate(()=>document.body.style.position),'fixed');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.keyboard.press('Escape');await p.waitForFunction(()=>document.body.style.position!=='fixed');assert.equal(await p.evaluate(()=>document.body.style.position),'');assert.deepEqual(p.errors,[]);await p.close();}
});
test('Mobile categories wrap without sideways scrolling; content scroll keeps dialog open; handle swipe closes it',async()=>{
 const p=await pageAt('menu.html',{viewport:{width:390,height:640},isMobile:true,hasTouch:true});const cdp=await p.context().newCDPSession(p);
 async function swipe(x,y,dx,dy){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(100);}
 const nav=await p.locator('.catalog-categories').evaluate(el=>({wrap:getComputedStyle(el).flexWrap,overflow:el.scrollWidth>el.clientWidth}));assert.equal(nav.wrap,'wrap');assert.equal(nav.overflow,false);assert.equal(await p.locator('.category-scroll-hint').count(),0);await category(p,'khachapuri');
 await p.locator('.dish-button').first().tap();assert.equal(await p.locator('#dish-dialog').isVisible(),true);await swipe(100,520,0,-140);assert.equal(await p.locator('#dish-dialog').isVisible(),true);assert((await p.locator('#dish-dialog').evaluate(el=>el.scrollTop))>0);await p.waitForTimeout(600);await p.locator('#dish-dialog').evaluate(el=>el.scrollTop=0);await swipe(150,18,0,120);assert.equal(await p.locator('#dish-dialog').isVisible(),false);await p.close();
});
test('Image data supports a full-size photo/zoom and failed photos fall back honestly',async()=>{
 const p=await browser.newPage({reducedMotion:'reduce'});let broken=false;
 await p.route('**/assets/menu.json*',route=>{const fixture=structuredClone(data);fixture.items[0].image={src:broken?'missing-photo.webp':'assets/gallery/dinner.jpg'};fixture.items[0].imageStatus='reference';return route.fulfill({json:fixture});});
 // A relative image path is site-relative, as in the supplied catalogue schema.
 await p.goto(base+'menu.html');await p.locator('.menu-dish').first().waitFor();await p.locator('.dish-button').first().click();await p.waitForFunction(()=>document.querySelector('#dialog-image').naturalWidth>0);assert.equal(await p.locator('.dialog-zoom').isVisible(),true);await p.locator('.dialog-zoom').click();assert.equal(await p.locator('.dialog-zoom').getAttribute('aria-pressed'),'true');await p.keyboard.press('Escape');broken=true;await p.reload();await p.locator('.dish-button').first().click();await p.waitForTimeout(150);assert.equal(await p.locator('.catalog-dialog-placeholder').isVisible(),true);assert.equal(await p.locator('.dialog-zoom').isVisible(),false);await p.close();
});
test('Kitchen opens the supplied PDF while grill, bar, categories and booking keep working',async()=>{
 const pdfPath='assets/menus/kitchen-menu.pdf';const expected=fs.readFileSync(path.join(root,pdfPath));assert.equal(expected.subarray(0,5).toString(),'%PDF-');
 for(const route of ['','menu.html'])for(const width of [390,1440]){
  const p=await pageAt(route,{viewport:{width,height:950}});const kitchen=p.locator('[data-section="kitchen"]');
  assert.equal(await kitchen.evaluate(el=>el.tagName),'A');assert.equal(await kitchen.getAttribute('href'),pdfPath);assert.equal(await kitchen.getAttribute('target'),'_blank');assert.equal(await kitchen.getAttribute('rel'),'noopener noreferrer');assert.equal(await kitchen.getAttribute('aria-expanded'),null);
  assert.equal(p.context().pages().length,1);assert.equal(await count(p),10);
  const response=await p.request.get(new URL(pdfPath,p.url()).href);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/application\/pdf/);assert.deepEqual(await response.body(),expected);
  const openedPromise=p.waitForEvent('popup');if(width===390)await kitchen.click();else{await kitchen.focus();await kitchen.press('Enter');}const opened=await openedPromise;await opened.waitForURL(url=>url.pathname.endsWith('/'+pdfPath),{waitUntil:'commit'});assert.equal(opened.url(),new URL(pdfPath,p.url()).href);await opened.close();assert.equal(await count(p),10);
  await p.locator('[data-section="bar"]').click();assert.equal(await count(p),2);await category(p,'khachapuri');assert.equal(await count(p),4);assert.equal(await p.locator('[data-category="khachapuri"]').getAttribute('aria-pressed'),'true');await p.locator('[data-section="grill"]').click();assert.equal(await count(p),10);
  await p.locator('[data-section="booking"]').click();assert.equal(await p.locator('#booking-dialog').isVisible(),true);assert.match(await p.locator('.booking-phone').getAttribute('href'),/^tel:/);await p.locator('.booking-close').click();await p.waitForFunction(()=>document.body.style.position!=='fixed');assert.deepEqual(p.errors,[]);await p.close();
 }
});
test('Catalogue becomes usable while the animation library is still downloading',async()=>{
 const p=await browser.newPage({reducedMotion:'reduce'});let release;const gate=new Promise(resolve=>release=resolve);let libraryFinished=false,jsonRequests=0;
 p.on('request',req=>{if(new URL(req.url()).pathname.endsWith('/assets/menu.json'))jsonRequests++;});
 await p.route('**/assets/vendor/gsap.min.js',async route=>{await gate;libraryFinished=true;await route.continue();});
 try{await p.goto(base+'menu.html#selected-menu',{waitUntil:'commit'});await p.locator('.menu-dish').first().waitFor({timeout:5000});assert.equal(await count(p),10);assert.equal(libraryFinished,false);assert.equal(jsonRequests,1);await category(p,'soups');assert.equal(await count(p),3);}finally{release();await p.waitForLoadState('domcontentloaded');await p.close();}
});
test('Homepage and menu page share text-only categories and omit recipe-status lines',async()=>{
 const p=await pageAt();assert.equal(await p.locator('#selection-heading').innerText(),'Гастрономическая карта');assert.equal(await p.locator('.catalog-categories button span').count(),0);assert.equal(await p.locator('.dialog-composition,.dialog-hint').count(),0);
 const active=p.locator('[data-category="grill"]');const styles=await active.evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth,radius:getComputedStyle(el).borderRadius,line:getComputedStyle(el,'::after').transform}));assert.equal(styles.background,'rgba(0, 0, 0, 0)');assert.equal(styles.border,'0px');assert.equal(styles.radius,'0px');assert.equal(styles.line,'matrix(1, 0, 0, 1, 0, 0)');
 const soups=p.locator('[data-category="soups"]');await soups.hover();assert.equal(await soups.evaluate(el=>getComputedStyle(el,'::after').transform),'matrix(1, 0, 0, 1, 0, 0)');await soups.click();assert.equal(await count(p),3);await p.locator('.dish-button').first().click();assert.equal(await p.locator('#dish-dialog').isVisible(),true);assert.doesNotMatch(await p.locator('#dish-dialog').innerText(),/Состав и наличие|Наличие уточняется у ресторана|Уточните состав и аллергены перед заказом/);await p.keyboard.press('Escape');await p.close();
 const home=await pageAt('');assert.equal(await home.locator('.catalog-categories button span').count(),0);assert.equal(await home.locator('.dialog-composition,.dialog-hint').count(),0);assert.equal(await home.locator('#selection-heading').innerText(),'Гастрономическая карта');assert.equal(await count(home),10);assert.equal(await home.locator('[data-category="grill"]').evaluate(el=>getComputedStyle(el).borderRadius),'0px');await home.close();
});
test('Premium cards preserve data and interactions while changing only menu.html presentation',async()=>{
 for(const [width,expectedColumns]of [[320,1],[390,2],[600,2],[768,2],[1024,3],[1440,3]]){
  const p=await pageAt('menu.html',{viewport:{width,height:950}});assert.equal(await count(p),10);assert.equal(await p.locator('.dish-detail-hint,.dish-more,.dish-category').count(),0);
  const style=await p.locator('.dish-visual').first().evaluate(el=>{const r=el.getBoundingClientRect();return {ratio:r.width/r.height,border:getComputedStyle(el).borderTopWidth,columns:getComputedStyle(document.querySelector('.dish-grid')).gridTemplateColumns.trim().split(/\s+/).length,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(Math.abs(style.ratio-4/3)<.002);assert.equal(style.border,'0px');assert.equal(style.columns,expectedColumns);assert.equal(style.overflow,false);await p.close();
 }
 const home=await pageAt('');assert.equal(await home.locator('.dish-detail-hint').count(),10);assert.equal(await home.locator('.dish-more').count(),10);assert.equal(await home.locator('.menu-dish').first().evaluate(el=>getComputedStyle(el).borderTopWidth),'1px');await home.close();
});
test('Menu photo zooms five percent on hover and gets a soft glow without changing full-photo details',async()=>{
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
 await p.route('**/assets/menu.json*',route=>{const fixture=structuredClone(data);fixture.items[0].image='assets/gallery/dinner.jpg';return route.fulfill({json:fixture});});
 await p.goto(base+'menu.html',{waitUntil:'domcontentloaded'});const card=p.locator('.dish-button').first();await card.waitFor();await p.evaluate(()=>document.fonts.ready);await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});await card.locator('.dish-visual').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));await card.locator('.dish-visual').hover();await p.waitForFunction(()=>{const img=document.querySelector('.dish-visual img');return img&&Math.abs(new DOMMatrix(getComputedStyle(img).transform).a-1.05)<.0001;},{},{timeout:3000});const scale=await card.locator('.dish-visual img').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a);assert(Math.abs(scale-1.05)<.0001);const glow=await card.locator('.dish-visual').evaluate(el=>Number(getComputedStyle(el,'::after').opacity));assert(glow>.99);await card.click();assert.equal(await p.locator('#dish-dialog').isVisible(),true);assert.equal(await p.locator('#dialog-title').innerText(),data.items[0].name);assert.equal(await p.locator('#dialog-history').textContent(),data.items[0].history||'');await p.keyboard.press('Escape');await p.close();
});
test('Both entry points initially open grill and retain a selected real category after reload',async()=>{
 for(const route of ['','index.html','menu.html']){const p=await browser.newPage({reducedMotion:'reduce'});await p.goto(base+route,{waitUntil:'domcontentloaded'});await p.locator('.menu-dish').first().waitFor();assert.equal(await count(p),10);assert.equal(await p.locator('[data-section="grill"]').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('[data-category="grill"]').getAttribute('aria-pressed'),'true');const image=p.locator('[data-section="grill"] img');assert.equal(await image.getAttribute('src'),'assets/grill-lamb-720.webp');await p.waitForFunction(()=>document.querySelector('[data-section="grill"] img').naturalWidth>0);await category(p,'khachapuri');assert.equal(await count(p),4);assert.equal(new URL(p.url()).searchParams.get('category'),'khachapuri');await p.reload();await p.locator('.menu-dish').first().waitFor();assert.equal(await count(p),4);await p.close();}
});
test('Header drops About, enlarges navigation, animates the brass line and stays inside mobile widths',async()=>{
 for(const route of ['index.html','menu.html']){for(const width of [320,390,1024,1440]){const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});await p.goto(base+route,{waitUntil:'domcontentloaded'});await p.locator('.menu-dish').first().waitFor();assert.equal(await p.locator('.topbar-wrap a,.menu-header a').filter({hasText:'О ресторане'}).count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(width===1440){const link=p.locator(route==='index.html'?'.nav-left a[href="#menu"]':'.desktop-nav a[href="index.html#gallery"]');assert((await link.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))>=14);await link.hover();assert.equal(await link.evaluate(el=>getComputedStyle(el,'::after').transform),'matrix(1, 0, 0, 1, 0, 0)');}await p.close();}}
});
test('Legacy all links and a search without category never expand the catalogue',async()=>{
 for(const entry of ['index.html','menu.html']){
  for(const suffix of ['?category=all','?category=invalid','?q=шашлык']){
   const p=await pageAt(entry+suffix);assert.equal(await p.locator('[data-category="all"]').count(),0);assert.doesNotMatch(await p.locator('.catalog-categories').innerText(),/Все блюда/);assert.equal(await p.locator('[data-category="grill"]').getAttribute('aria-pressed'),'true');assert((await count(p))<=10);assert.equal(await p.locator('.menu-dish').evaluateAll(nodes=>nodes.every(n=>n.dataset.itemId.startsWith('grill-'))),true);
   if(!suffix.includes('q=')){assert.equal(await count(p),10);assert.equal(new URL(p.url()).searchParams.get('category'),'grill');}
   assert.equal(await p.locator('#dish-search,.catalog-search').count(),0);assert.equal(await count(p),10);await p.reload();await p.locator('.menu-dish').first().waitFor();assert.equal(await count(p),10);await p.close();
  }
  const p=await pageAt(entry+'#kitchen');assert.equal(await count(p),4);assert.equal(await p.locator('[data-category="khachapuri"]').getAttribute('aria-pressed'),'true');await p.close();
 }
});
test('Both category menus wrap into visible rows without a horizontal scroll area at every viewport',async()=>{
 for(const entry of ['index.html','menu.html']){for(const width of [320,390,640,768,1024,1440,1920]){
  const p=await pageAt(entry,{viewport:{width,height:950}});await p.evaluate(()=>document.fonts.ready);
  const layout=await p.locator('.catalog-categories').evaluate(el=>{const r=el.getBoundingClientRect(),buttons=[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect());return {wrap:getComputedStyle(el).flexWrap,overflow:getComputedStyle(el).overflowX,scrollWidth:el.scrollWidth,width:el.clientWidth,rows:new Set(buttons.map(b=>Math.round(b.top))).size,inside:buttons.every(b=>b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1)};});
  assert.equal(layout.wrap,'wrap');assert.equal(layout.overflow,'visible');assert(layout.scrollWidth<=layout.width);assert.equal(layout.inside,true);assert(layout.rows>=(width<=1024?2:1));assert.equal(await p.locator('.category-scroll-hint').count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await category(p,'desserts-drinks');assert.equal(await count(p),2);await category(p,'grill');assert.equal(await count(p),10);await p.close();
 }}
});
test('Gallery navigation and a delayed catalogue align the whole image below the header',async()=>{
 for(const width of [390,1440]){const p=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});await p.goto(base+'index.html',{waitUntil:'domcontentloaded'});await p.locator('.menu-dish').first().waitFor();await p.locator('footer a[href="#gallery"]').click();await p.waitForFunction(()=>{const r=document.querySelector('.gallery-stage').getBoundingClientRect(),header=document.querySelector('.topbar-wrap').getBoundingClientRect();return Math.abs(r.top-header.height-18)<2&&r.bottom<innerHeight;});assert.equal(new URL(p.url()).hash,'#gallery');await p.close();}
 const p=await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce'});await p.route('**/assets/menu.json*',async route=>{await new Promise(resolve=>setTimeout(resolve,350));await route.continue();});await p.goto(base+'index.html#gallery',{waitUntil:'domcontentloaded'});await p.locator('.menu-dish').first().waitFor();await p.waitForFunction(()=>Math.abs(document.querySelector('.gallery-stage').getBoundingClientRect().top-document.querySelector('.topbar-wrap').getBoundingClientRect().height-18)<2);await p.close();
});
test('Unwritten dish descriptions and histories stay absent instead of rendering fallback explanations',async()=>{
 const p=await pageAt('menu.html?category=salads');await p.locator('[data-item-id="salads-02"] .dish-button').click();assert.equal(await p.locator('#dialog-title').innerText(),'Олимпус с говядиной');assert.equal(await p.locator('#dialog-note').isVisible(),false);assert.equal(await p.locator('.dialog-story').isVisible(),false);assert.doesNotMatch(await p.locator('#dish-dialog').innerText(),/нет единого|исходных данных|Описание уточняется|Гастрономическая заметка/);await p.close();
});
test('Phone and tablet layouts stack chooser tiles in order with readable controls and benefits in normal flow',async()=>{
 for(const entry of ['index.html','menu.html'])for(const width of [320,360,390,430,640,768,920]){
  const p=await pageAt(entry,{viewport:{width,height:844},isMobile:true,hasTouch:true});await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const tiles=await p.locator('.menu-panels').evaluate(el=>{const frame=el.getBoundingClientRect();return {height:frame.height,columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,inside:[...el.querySelectorAll('.menu-panel')].every(panel=>{const r=panel.getBoundingClientRect(),t=panel.querySelector('.panel-title').getBoundingClientRect();return r.left>=frame.left-1&&r.right<=frame.right+1&&t.left>=r.left&&t.right<=r.right&&t.bottom<=r.bottom;})};});
  assert.equal(tiles.columns,1,`${entry} ${width}`);assert(tiles.height<=720);assert.equal(tiles.inside,true,`${entry} ${width}`);
  assert.deepEqual(await p.locator('.menu-panel').evaluateAll(nodes=>nodes.map(el=>el.dataset.section)),['kitchen','grill','bar','booking']);assert.equal(await p.locator('.menu-panel').evaluateAll(nodes=>nodes.every((el,i)=>i===0||el.getBoundingClientRect().top>=nodes[i-1].getBoundingClientRect().bottom)),true);
  await p.waitForFunction(()=>[...document.querySelectorAll('.menu-panel img')].every(img=>img.complete&&img.naturalWidth>0));
  for(const selector of ['#dish-sort'])assert((await p.locator(selector).evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))>=16);
  const header=p.locator(entry==='index.html'?'.topbar-wrap':'.menu-header'),toggle=header.locator('button[aria-controls]').first();const logo=await header.locator('.brand-center').boundingBox(),control=await toggle.boundingBox();assert(logo.x+logo.width<=control.x-4);assert(control.width>=44&&control.height>=44);
  if(entry==='index.html')assert.equal(await p.locator('.hero-bottom').evaluate(el=>getComputedStyle(el).position),'static');
  await p.locator('[data-section="grill"]').click();await p.waitForFunction(()=>{const section=document.querySelector('#selected-menu').getBoundingClientRect(),header=document.querySelector('.topbar-wrap,.menu-header').getBoundingClientRect();return section.top>=header.height+6&&section.top<=header.height+40;});
  assert.equal(await count(p),10);assert.deepEqual(p.errors,[]);await p.close();
 }
});
test('Mobile menu closes outside the header and when returning to desktop',async()=>{
 for(const entry of ['index.html','menu.html']){
  const p=await pageAt(entry,{viewport:{width:390,height:844}}),header=p.locator(entry==='index.html'?'.topbar-wrap':'.menu-header'),toggle=header.locator('button[aria-controls]').first();
  await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');await p.locator('#selection-heading').click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await toggle.click();await p.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();await p.setViewportSize({width:1440,height:950});await p.waitForFunction(()=>document.querySelector('.mobile-toggle,.nav-toggle').getAttribute('aria-expanded')==='false');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.close();
 }
});
test('Logo loads once as a filter-free high-resolution PNG on retina phones and desktop',async()=>{
 for(const entry of ['index.html','menu.html'])for(const [width,dpr]of [[320,3],[390,3],[768,2],[1440,1]]){
  const p=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:dpr,reducedMotion:'reduce'});let requests=0;p.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/logo-car-compatible.png'))requests++;});await p.goto(base+entry,{waitUntil:'domcontentloaded'});
  const logo=p.locator('.logo-car');await logo.evaluate(img=>img.decode());const info=await logo.evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight,ratio:img.getBoundingClientRect().width/img.getBoundingClientRect().height,filter:getComputedStyle(img).filter,src:img.currentSrc}));assert.equal(info.width,2172);assert.equal(info.height,724);assert(Math.abs(info.ratio-3)<.01);assert.equal(info.filter,'none');assert(info.src.includes('logo-car-compatible.png'));assert.equal(requests,1);assert.equal(await p.locator('.car-headlight').count(),2);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.close();
 }
});
test('Both pages share the black-green masthead palette and the updated contact number',async()=>{
 for(const entry of ['index.html','menu.html'])for(const width of [390,1440]){
  const p=await pageAt(entry,{viewport:{width,height:950}});assert.equal(await p.locator('meta[name="theme-color"]').getAttribute('content'),'#080f0b');
  for(const selector of ['body','.menu-catalog.catalog-editorial','.banquet-panel','.gallery-section','.location-section'])for(const node of await p.locator(selector).all())assert.equal(await node.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(8, 15, 11)');
  assert.equal(await p.locator('a[href^="tel:"]').evaluateAll(nodes=>nodes.length>0&&nodes.every(el=>el.getAttribute('href')==='tel:+78920000000')),true);
  assert.doesNotMatch(await p.locator('body').textContent(),/937|644-13|000-00=00/);assert.match(await p.locator('body').textContent(),/\+7 \(892\) 000-00-00/);
  if(entry==='index.html')assert.equal(await p.locator('.header-phone:visible').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
  assert.equal(await count(p),10);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.close();
 }
});
test('Header promotions opens the homepage main section on all widths and preserves independent widgets',async()=>{
 for(const entry of ['index.html','menu.html'])for(const width of [320,375,390,430,768,1024,1440,1920]){
  const p=await pageAt(entry,{viewport:{width,height:950}});
  assert.equal(await p.locator('[data-promotions-page],.promotions-trigger,#promotions-dialog,a[href="news.html"]').count(),0);
  const header=p.locator(entry==='index.html'?'.topbar-wrap':'.menu-header');
  const headerExpected=entry==='index.html'?'#promotions':'index.html#promotions';
  assert.equal(await header.locator('[data-header-promotions]').count(),2);assert.equal(await p.locator('[data-header-promotions]').count(),2);
  for(const link of await header.locator('[data-header-promotions]').all()){
   assert.equal(await link.textContent(),'Акции');assert.equal(await link.getAttribute('href'),headerExpected);assert.equal(await link.getAttribute('target'),null);
   assert.equal(await link.evaluate(el=>el.previousElementSibling.textContent),'Банкеты');
  }
  const expected='https://t.me/RESTSCHMIDTBOT?start='+(entry==='index.html'?'src_widget_home':'src_widget_menu');
  const telegram=p.locator('[data-telegram-widget]');assert.equal(await telegram.getAttribute('href'),expected);assert.equal(await telegram.getAttribute('rel'),'noopener noreferrer');assert.equal(await telegram.isVisible(),true);
  const delivery=p.locator('.delivery-widget');assert.equal(await delivery.isVisible(),true);const tgBox=await telegram.boundingBox(),deliveryBox=await delivery.boundingBox();assert(tgBox.y+tgBox.height<=deliveryBox.y-7);
  assert.equal(await p.locator('[data-section="kitchen"]').getAttribute('href'),'assets/menus/kitchen-menu.pdf');assert.equal(await count(p),10);
  if(width===390||width===1440){await p.context().route('https://t.me/**',route=>route.fulfill({status:200,contentType:'text/html',body:'Telegram navigation intercepted locally'}));await telegram.focus();const popupPromise=p.waitForEvent('popup');await telegram.press('Enter');const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),expected);await popup.close();}
  const toggle=header.locator('.mobile-toggle,.nav-toggle');if(await toggle.isVisible())await toggle.click();
  const link=header.locator('[data-header-promotions]:visible');await link.focus();await link.press('Enter');
  await p.waitForFunction(()=>location.hash==='#promotions'&&document.querySelector('main #promotions'));
  await p.locator('.menu-dish').first().waitFor();
  await p.waitForFunction(()=>{const section=document.querySelector('#promotions'),header=document.querySelector('.topbar-wrap');return Math.abs(section.getBoundingClientRect().top-header.getBoundingClientRect().bottom-18)<4});
  assert.equal(await p.locator('main #promotions').count(),1);assert.equal(await p.locator('#promotions-heading').innerText(),'Акции');
  assert.equal(await p.evaluate(()=>document.querySelector('#banquets').getBoundingClientRect().top<document.querySelector('#promotions').getBoundingClientRect().top&&document.querySelector('#promotions').getBoundingClientRect().top<document.querySelector('#gallery').getBoundingClientRect().top&&document.querySelector('#gallery').getBoundingClientRect().top<document.querySelector('#location').getBoundingClientRect().top),true);
  const section=p.locator('#promotions');assert.doesNotMatch(await section.innerText(),/скидк|бесплатн|подарок|\d+\s*%/i);assert.equal(await section.locator('.promotion-telegram').getAttribute('href'),'https://t.me/RESTSCHMIDTBOT?start=promo_birthday');
  await p.waitForFunction(()=>document.querySelector('#promotions img').naturalWidth>0);
  assert.equal(await p.locator('.mobile-toggle').getAttribute('aria-expanded'),'false');
  if(width===390||width===1440)await section.screenshot({path:`/workspace/shared/home-promotions-${width}.png`});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(p.errors,[]);await p.close();
 }
 assert.equal(fs.existsSync(path.join(root,'news.html')),false);
 for(const width of [390,1440]){
  const p=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});
  await p.route('**/assets/menu.json?*',async route=>{await new Promise(resolve=>setTimeout(resolve,900));await route.continue()});
  await p.goto(base+'index.html#promotions');await p.locator('.menu-dish').first().waitFor();await p.waitForFunction(()=>Math.abs(document.querySelector('#promotions').getBoundingClientRect().top-document.querySelector('.topbar-wrap').getBoundingClientRect().bottom-18)<4);
  await p.close();
 }
});
test('Mobile mastheads fit logo and phone in one row with the address below the number',async()=>{
 for(const entry of ['index.html','menu.html'])for(const width of [320,360,390,430,640,768,920]){
  const p=await pageAt(entry,{viewport:{width,height:950}});await p.evaluate(()=>document.fonts.ready);
  const header=p.locator(entry==='index.html'?'.topbar-wrap':'.menu-header'),contact=header.locator('.mobile-header-contact');assert.equal(await contact.isVisible(),true);assert.equal(await contact.locator('.mobile-header-address').innerText(),'Самара, ул. Лейтенанта Шмидта, 1В');assert.equal(await contact.locator('.mobile-header-address').getAttribute('href'),entry==='index.html'?'#location':'index.html#location');assert.equal(await contact.locator('.header-phone').getAttribute('href'),'tel:+78920000000');
  const logo=await header.locator('.brand-center').boundingBox(),group=await contact.boundingBox(),phone=await contact.locator('.header-phone').boundingBox(),address=await contact.locator('.mobile-header-address').boundingBox(),toggle=await header.locator('.mobile-toggle,.nav-toggle').boundingBox();assert(logo.x+logo.width<=group.x-4);assert(group.x+group.width<=toggle.x-4);assert(address.y>=phone.y+phone.height);assert((await contact.locator('.header-phone').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))<=14);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.close();
 }
});
