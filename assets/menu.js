(() => {
 'use strict';
 const scriptUrl=document.currentScript.src;
 const root=document.querySelector('[data-menu-app]')||document;
 const section=root.querySelector('#selected-menu');
 if(!section)return;
 const grid=root.querySelector('#dish-grid'),heading=root.querySelector('#selection-heading');
 const sort=root.querySelector('#dish-sort');
 const filters=root.querySelector('.catalog-categories'),status=root.querySelector('#menu-status');
 const empty=root.querySelector('.empty-state'),error=root.querySelector('.catalog-error');
 const panels=[...root.querySelectorAll('button.menu-panel')];
 const dialog=root.querySelector('#dish-dialog'),booking=root.querySelector('#booking-dialog');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const number=new Intl.NumberFormat('ru-RU');
 let catalog=null,category='grill',opener=null,selected='grill',scrollFrame;
 let bodySnapshot=null,dialogAnimation=null,loadSequence=0;
 const categoryTitle=id=>catalog?.categories.find(c=>c.id===id)?.title||'Шашлык и гриль';
 const price=item=>Number.isFinite(item.priceRub)?`${number.format(item.priceRub)} ₽`:'Цена уточняется';
 function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 function motion(target,vars){if(window.gsap&&!reduced.matches)return gsap.fromTo(target,{opacity:0,y:14},{opacity:1,y:0,duration:.35,ease:'power2.out',...vars});return null;}
 function announce(text){status.textContent=text;}
 function lockBody(){
  if(bodySnapshot)return;
  bodySnapshot={y:scrollY,position:document.body.style.position,top:document.body.style.top,width:document.body.style.width,overflow:document.body.style.overflow};
  document.body.style.position='fixed';document.body.style.top=`-${bodySnapshot.y}px`;document.body.style.width='100%';document.body.style.overflow='hidden';document.body.classList.add('dialog-open');
 }
 function unlockBody(){
  if(!bodySnapshot)return;
  const saved=bodySnapshot;bodySnapshot=null;
  for(const key of ['position','top','width','overflow'])document.body.style[key]=saved[key];
  document.body.classList.remove('dialog-open');scrollTo({top:saved.y,behavior:'instant'});
 }
 function imageData(item){return typeof item.image==='string'?{src:item.image}:item.image;}
 function decoratePlaceholder(placeholder,item){
  const photo=item.placeholderImage;
  placeholder.classList.toggle('has-category-photo',Boolean(photo?.src));
  placeholder.style.backgroundImage=photo?.src?`url("${new URL(photo.src,location.href).href}")`:'';
  placeholder.style.backgroundSize=photo?.size||'';
  placeholder.style.backgroundPosition=photo?.position||'';
  placeholder.lastElementChild.textContent=photo?.src?'Временное фото':'Фотография готовится';
  if(photo?.src){placeholder.setAttribute('role','img');placeholder.setAttribute('aria-label',`${item.name} — временная фотография`);}
  else{placeholder.removeAttribute('role');placeholder.removeAttribute('aria-label');}
 }
 function attachImage(image,item,onError){
  const data=imageData(item);if(!data?.src)return false;
  image.src=data.src;image.alt=item.imageAlt||item.name;
  if(data.srcSet)image.srcset=data.srcSet;
  if(data.sizes)image.sizes=data.sizes;
  image.decoding='async';image.addEventListener('error',onError,{once:true});return true;
 }
 function syncPanels(){panels.forEach(panel=>{const active=panel.dataset.section===selected;panel.classList.toggle('is-selected',active);panel.setAttribute('aria-expanded',String(active));});}
 function syncCategories(){
  filters.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===category)));
  heading.textContent=heading.dataset.catalogTitle||categoryTitle(category);
 }
 function saveUrl(push=false){
  const url=new URL(location.href);
  url.searchParams.set('category',category);
  url.searchParams.delete('q');
  if(sort.value==='menu')url.searchParams.delete('sort');else url.searchParams.set('sort',sort.value);
  history[push?'pushState':'replaceState'](null,'',url);
 }
 function buildCategories(){
  filters.replaceChildren();
  catalog.categories.forEach(cat=>{
   const button=element('button','',cat.title);button.type='button';button.dataset.category=cat.id;button.setAttribute('aria-controls','dish-grid');
   button.addEventListener('click',()=>{category=cat.id;selected=category==='grill'?'grill':category==='desserts-drinks'?'bar':'kitchen';syncPanels();syncCategories();render();saveUrl(true);});
   filters.append(button);
  });
 }
 function addHold(button,item){
  let timer=null,point=null,consumed=false;
  function cancel(){clearTimeout(timer);timer=null;point=null;button.classList.remove('is-holding');}
  button.addEventListener('pointerdown',event=>{
   if(event.pointerType!=='mouse'||event.button!==0)return;
   consumed=false;point={x:event.clientX,y:event.clientY};button.classList.add('is-holding');
   timer=setTimeout(()=>{timer=null;point=null;consumed=true;button.classList.remove('is-holding');openDish(item,button);},650);
  });
  button.addEventListener('pointermove',event=>{if(point&&Math.hypot(event.clientX-point.x,event.clientY-point.y)>10)cancel();});
  for(const type of ['pointerup','pointercancel','pointerleave','lostpointercapture'])button.addEventListener(type,cancel);
  button.addEventListener('blur',cancel);button.addEventListener('dragstart',event=>{event.preventDefault();cancel();});
  button.addEventListener('click',event=>{if(consumed){consumed=false;event.preventDefault();return;}openDish(item,button);});
 }
 function card(item){
  const refined=section.dataset.cardStyle==='editorial';
  const article=element('article','menu-dish');article.dataset.itemId=item.id;
  const button=element('button','dish-button');button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','dish-dialog');button.setAttribute('aria-label',`${item.name}, ${price(item)}${item.priceVerified?'':', предварительная цена'}. ${refined?'Открыть описание блюда':'Подробнее'}`);
  const visual=element('span','dish-visual');
  const placeholder=element('span','dish-placeholder');placeholder.append(element('span','catalog-plate'),element('span','','Фотография готовится'));placeholder.firstChild.setAttribute('aria-hidden','true');visual.append(placeholder);
  decoratePlaceholder(placeholder,item);
  const image=new Image();image.loading='lazy';image.width=720;image.height=refined?540:514;image.sizes='(max-width: 359px) 100vw, (max-width: 900px) 50vw, 33vw';
  if(attachImage(image,item,()=>image.remove()))visual.append(image);
  const hint=element('span','dish-detail-hint');hint.setAttribute('aria-hidden','true');hint.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 19 19 5M5 5h14v14"/></svg>';if(!refined)visual.append(hint);
  const ring=document.createElementNS('http://www.w3.org/2000/svg','svg');ring.classList.add('hold-ring');ring.setAttribute('viewBox','0 0 40 40');ring.setAttribute('aria-hidden','true');ring.innerHTML='<circle cx="20" cy="20" r="16" pathLength="100"/>';visual.append(ring);
  const body=element('span','dish-body');if(!refined)body.append(element('span','dish-category',categoryTitle(item.categoryId)));body.append(element('span','dish-name',item.name));
  const meta=element('span','dish-meta'),priceWrap=element('span','');priceWrap.append(element('span','dish-price',price(item)));if(!refined)priceWrap.append(element('span','dish-price-note',item.priceVerified?'Цена подтверждена':'Предварительная цена'));
  meta.append(priceWrap);if(!refined)meta.append(element('span','dish-more','Подробнее →'));body.append(meta);button.append(visual,body);article.append(button);addHold(button,item);return article;
 }
 function render(animate=true){
  if(!catalog)return;
  let items=catalog.items.filter(item=>item.categoryId===category);
  if(sort.value==='price-asc')items.sort((a,b)=>(a.priceRub??Infinity)-(b.priceRub??Infinity));
  if(sort.value==='price-desc')items.sort((a,b)=>(b.priceRub??-Infinity)-(a.priceRub??-Infinity));
  if(sort.value==='name')items.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  if(window.gsap)gsap.killTweensOf([...grid.children]);
  grid.replaceChildren(...items.map(card));grid.setAttribute('aria-busy','false');empty.hidden=items.length>0;
  announce(`${categoryTitle(category)} · ${items.length}`);
  if(animate)motion([...grid.children].slice(0,6),{stagger:.02,duration:.24});
 }
 function choose(key,scroll=true){
  if(key==='booking'){openBooking();return;}
  selected=key;category=key==='grill'?'grill':key==='bar'?'desserts-drinks':'khachapuri';sort.value='menu';
  section.hidden=false;syncPanels();syncCategories();render();saveUrl(true);
  if(scroll){cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{section.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});heading.focus({preventScroll:true});});}
 }
 panels.forEach(panel=>panel.addEventListener('click',()=>choose(panel.dataset.section)));
 root.querySelector('.close-selection').addEventListener('click',()=>{
  const previous=panels.find(p=>p.dataset.section===selected);section.hidden=true;selected='';syncPanels();
  const url=new URL(location.href);for(const key of ['category','q','sort'])url.searchParams.delete(key);if(url.hash==='#selected-menu')url.hash='menu';history.replaceState(null,'',url);
  previous?.focus({preventScroll:true});previous?.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'center'});
 });
 sort.addEventListener('change',()=>{render();saveUrl();});
 root.querySelector('.catalog-reset').addEventListener('click',()=>{sort.value='menu';render();saveUrl(true);sort.focus({preventScroll:true});});
 function readUrl(){
  if(!catalog)return;
  const url=new URL(location.href),value=url.searchParams.get('category');
  const legacy=url.hash.slice(1);
  const requested=value||({kitchen:'khachapuri',grill:'grill',bar:'desserts-drinks'}[legacy])||'grill';
  category=catalog.categories.some(c=>c.id===requested)?requested:'grill';
  sort.value=['price-asc','price-desc','name'].includes(url.searchParams.get('sort'))?url.searchParams.get('sort'):'menu';
  selected=category==='grill'?'grill':category==='desserts-drinks'?'bar':'kitchen';section.hidden=false;syncPanels();syncCategories();render(false);
  if(requested!==category||url.searchParams.has('q'))saveUrl();
 }
 addEventListener('popstate',readUrl);
 async function load(){
  const sequence=++loadSequence;error.hidden=true;grid.setAttribute('aria-busy','true');announce('Загружаем меню…');
  try{
   const dataUrl=new URL('menu.json',scriptUrl);dataUrl.search=new URL(scriptUrl).search;
   const response=await fetch(dataUrl,{priority:'high'});if(!response.ok)throw Error(`HTTP ${response.status}`);
   const data=await response.json();
   if(!Array.isArray(data.items)||!Array.isArray(data.categories)||!data.items.length)throw Error('Invalid catalogue');
   const ids=new Set(data.categories.map(c=>c.id));if(data.items.some(i=>!i.id||!i.name||!ids.has(i.categoryId)))throw Error('Invalid item');
   if(sequence!==loadSequence)return;
   catalog=data;catalog.categories.sort((a,b)=>a.order-b.order);buildCategories();readUrl();
   if(new URL(location.href).hash==='#selected-menu')section.scrollIntoView({behavior:'instant',block:'start'});
   dispatchEvent(new CustomEvent('restaurant:catalogready'));
  }catch(err){if(sequence!==loadSequence)return;error.hidden=false;grid.setAttribute('aria-busy','false');announce('Меню пока недоступно. Повторите загрузку.');}
 }
 root.querySelector('.catalog-retry').addEventListener('click',load);
 function openDish(item,button){
  if(dialog.open)return;
  cancelAnimationFrame(scrollFrame);opener=button;
  root.querySelector('#dialog-title').textContent=item.name;root.querySelector('#dialog-category').textContent=categoryTitle(item.categoryId);
  const note=root.querySelector('#dialog-note'),history=root.querySelector('#dialog-history');
  note.textContent=item.description||'';note.hidden=!item.description;
  history.textContent=item.history||'';history.closest('.dialog-story').hidden=!item.history;
  root.querySelector('#dialog-price').textContent=price(item);
  root.querySelector('#dialog-price-status').textContent=item.priceVerified?'Цена подтверждена.':'Предварительная цена. Подтвердите перед заказом.';
  const weight=root.querySelector('#dialog-weight');weight.hidden=!Number.isFinite(item.weightGrams);weight.textContent=weight.hidden?'':`Выход порции: ${number.format(item.weightGrams)} г`;
  const ingredients=root.querySelector('#dialog-ingredients'),availability=root.querySelector('#dialog-availability');
  if(ingredients)ingredients.textContent=Array.isArray(item.ingredients)&&item.ingredients.length?`Состав: ${item.ingredients.join(', ')}`:'Точный состав и аллергены пока не подтверждены. Уточните у официанта.';
  if(availability)availability.textContent=item.available===true?'Наличие подтверждено.':item.available===false?'Сейчас недоступно.':'Наличие уточняется у ресторана.';
  const image=root.querySelector('#dialog-image'),zoom=root.querySelector('.dialog-zoom'),wrap=root.querySelector('.dialog-image-wrap'),placeholder=root.querySelector('.catalog-dialog-placeholder');
  decoratePlaceholder(placeholder,item);
  wrap.classList.remove('is-zoomed');zoom.setAttribute('aria-pressed','false');zoom.textContent='Увеличить фото';
  image.removeAttribute('src');image.removeAttribute('srcset');image.hidden=true;zoom.hidden=true;placeholder.hidden=false;
  if(attachImage(image,item,()=>{image.hidden=true;zoom.hidden=true;placeholder.hidden=false;})){image.hidden=false;zoom.hidden=false;placeholder.hidden=true;}
  dialog.showModal();dialog.scrollTop=0;lockBody();dialogAnimation?.kill();dialogAnimation=motion(dialog,{duration:.35});
 }
 dialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const focusable=[...dialog.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length>0);
  if(!focusable.length){event.preventDefault();dialog.focus();return;}
  const first=focusable[0],last=focusable.at(-1),active=document.activeElement;
  if(event.shiftKey&&(active===first||!focusable.includes(active))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||!focusable.includes(active))){event.preventDefault();first.focus();}
 });
 root.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
 root.querySelector('.dialog-zoom').addEventListener('click',event=>{const zoomed=root.querySelector('.dialog-image-wrap').classList.toggle('is-zoomed');event.currentTarget.setAttribute('aria-pressed',String(zoomed));event.currentTarget.textContent=zoomed?'Уменьшить фото':'Увеличить фото';});
 dialog.addEventListener('close',()=>{dialogAnimation?.kill();dialog.style.opacity='';dialog.style.transform='';unlockBody();opener?.focus({preventScroll:true});});
 let backdropDown=false;
 dialog.addEventListener('pointerdown',event=>{const r=dialog.getBoundingClientRect();backdropDown=event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);});
 dialog.addEventListener('click',()=>{if(backdropDown)dialog.close();backdropDown=false;});
 // Swipe is limited to the dedicated handle; scrolling the recipe stays native.
 const handle=root.querySelector('.dialog-drag-handle');let drag=null;
 handle.addEventListener('pointerdown',event=>{if(dialog.scrollTop===0){drag={id:event.pointerId,y:event.clientY};handle.setPointerCapture(event.pointerId);}});
 handle.addEventListener('pointerup',event=>{if(drag&&drag.id===event.pointerId){if(event.clientY-drag.y>70)dialog.close();drag=null;}});
 handle.addEventListener('pointercancel',()=>drag=null);
 function openBooking(){
  cancelAnimationFrame(scrollFrame);opener=panels.find(p=>p.dataset.section==='booking');opener?.setAttribute('aria-expanded','true');booking.showModal();lockBody();
 }
 root.querySelector('.booking-close').addEventListener('click',()=>booking.close());
 booking.addEventListener('close',()=>{unlockBody();opener?.setAttribute('aria-expanded','false');opener?.focus({preventScroll:true});});
 let bookingBackdrop=false;
 booking.addEventListener('pointerdown',event=>{const r=booking.getBoundingClientRect();bookingBackdrop=event.target===booking&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);});
 booking.addEventListener('click',()=>{if(bookingBackdrop)booking.close();bookingBackdrop=false;});
 const toggle=root.querySelector('.nav-toggle'),nav=root.querySelector('#mobile-nav');
 function closeNav(){if(!nav||!toggle)return;nav.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.textContent='☰';toggle.setAttribute('aria-label','Открыть навигацию');}
 toggle?.addEventListener('click',()=>{const open=nav.hidden;nav.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰';toggle.setAttribute('aria-label',open?'Закрыть навигацию':'Открыть навигацию');});
 nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeNav));
 document.addEventListener('click',event=>{if(nav&&!nav.hidden&&!event.target.closest('.menu-header'))closeNav();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav&&!nav.hidden){closeNav();toggle?.focus();}});
 matchMedia('(min-width: 921px)').addEventListener('change',event=>{if(event.matches)closeNav();});
 const header=document.querySelector('.menu-header');const updateHeader=()=>header?.classList.toggle('is-scrolled',scrollY>16);addEventListener('scroll',updateHeader,{passive:true});updateHeader();
 reduced.addEventListener('change',()=>{if(reduced.matches){dialogAnimation?.kill();if(window.gsap)gsap.set([...grid.children,dialog],{clearProps:'opacity,transform'});}});
 section.hidden=false;load();
})();
