(() => {
  const root=document.querySelector('[data-menu-app]')||document;
  const panels=[...root.querySelectorAll('.menu-panel')];
  const section=root.querySelector('#selected-menu');
  const heading=root.querySelector('#selection-heading');
  const grid=root.querySelector('#dish-grid');
  const filters=[...root.querySelectorAll('[data-filter]')];
  const search=root.querySelector('#dish-search');
  const empty=root.querySelector('.empty-state');
  const status=root.querySelector('#menu-status');
  const dialog=root.querySelector('#dish-dialog');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let selected='',filter='all',opener=null;
  const titles={kitchen:'Меню кухни',grill:'На гриле',bar:'Бар',booking:'Бронирование зала'};
  const belongs=(item)=>selected==='kitchen'?item.tags.some(t=>['snack','salad','hot'].includes(t)):item.tags.includes(selected);
  function imageState(image){image.addEventListener('error',()=>image.classList.add('is-unavailable'));image.addEventListener('load',()=>image.classList.remove('is-unavailable'));if(image.complete&&!image.naturalWidth)image.classList.add('is-unavailable')}
  root.querySelectorAll('.panel-photo').forEach(imageState);
  function render(){
    const query=search.value.trim().toLocaleLowerCase('ru');
    const items=menuItems.filter(item=>belongs(item)&&(filter==='all'||item.tags.includes(filter))&&`${item.name} ${item.note}`.toLocaleLowerCase('ru').includes(query));
    grid.replaceChildren();
    items.forEach((item,index)=>{
      const article=document.createElement('article');article.className='menu-dish';article.style.setProperty('--order',index);
      const button=document.createElement('button');button.className='dish-button';button.setAttribute('aria-label',`${item.name}, ${item.price}. Подробнее`);
      const visual=document.createElement('span');visual.className='dish-visual';
      const fallback=document.createElement('span');fallback.className='dish-fallback';fallback.textContent='Дети';fallback.setAttribute('aria-hidden','true');visual.append(fallback);
      if(item.image){const image=new Image();image.alt='';image.loading='lazy';imageState(image);image.src=item.image;visual.append(image)}
      const hint=document.createElement('span');hint.className='dish-detail-hint';hint.innerHTML='<svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';hint.setAttribute('aria-hidden','true');visual.append(hint);
      const name=document.createElement('span');name.className='dish-name';name.textContent=item.name;
      const meta=document.createElement('span');meta.className='dish-meta';const note=document.createElement('span');note.textContent=item.note;const price=document.createElement('span');price.className='dish-price';price.textContent=item.price;meta.append(note,price);
      button.append(visual,name,meta);button.addEventListener('click',()=>openDish(item,button));article.append(button);grid.append(article);
    });
    empty.hidden=items.length>0;status.textContent=`Найдено блюд: ${items.length}`;
  }
  const bookingDialog=root.querySelector('#booking-dialog');
  let bookingOpener;
  let selectionScrollFrame;
  function openBooking(){cancelAnimationFrame(selectionScrollFrame);window.scrollTo({top:window.scrollY,behavior:'instant'});bookingBackdropPressed=false;bookingOpener=panels.find(p=>p.dataset.section==='booking');bookingOpener.setAttribute('aria-expanded','true');bookingDialog.showModal();document.body.classList.add('dialog-open')}
  root.querySelector('.booking-close').addEventListener('click',()=>bookingDialog.close());
  bookingDialog.addEventListener('close',()=>{document.body.classList.remove('dialog-open');bookingOpener?.setAttribute('aria-expanded','false');bookingOpener?.focus({preventScroll:true})});
  let bookingBackdropPressed=false;
  bookingDialog.addEventListener('pointerdown',event=>{const r=bookingDialog.getBoundingClientRect();bookingBackdropPressed=event.target===bookingDialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)});
  bookingDialog.addEventListener('click',()=>{if(bookingBackdropPressed)bookingDialog.close();bookingBackdropPressed=false});
  function select(key,scroll=true,updateUrl=true){
    if(key==='booking'){openBooking();return}
    selected=key;filter='all';search.value='';
    panels.forEach(p=>{const active=p.dataset.section===key;p.classList.toggle('is-selected',active);p.setAttribute('aria-expanded',String(active))});
    filters.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter==='all')));
    root.querySelector('.dish-filters').hidden=key!=='kitchen';heading.textContent=titles[key];section.hidden=false;render();
    if(updateUrl)history.replaceState(null,'',`#${key}`);
    if(scroll){selectionScrollFrame=requestAnimationFrame(()=>{section.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});heading.focus({preventScroll:true})})}
  }
  panels.forEach(p=>p.addEventListener('click',()=>select(p.dataset.section)));
  root.querySelector('.close-selection').addEventListener('click',()=>{const previous=panels.find(p=>p.dataset.section===selected);section.hidden=true;panels.forEach(p=>{p.classList.remove('is-selected');p.setAttribute('aria-expanded','false')});selected='';history.replaceState(null,'',location.pathname+location.search);previous?.focus({preventScroll:true});previous?.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'center'})});
  filters.forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;filters.forEach(f=>f.setAttribute('aria-pressed',String(f===b)));render()}));
  search.addEventListener('input',render);
  function openDish(item,button){
    opener=button;root.querySelector('#dialog-title').textContent=item.name;root.querySelector('#dialog-note').textContent=item.note;root.querySelector('#dialog-price').textContent=item.price;
    const image=root.querySelector('#dialog-image');image.classList.remove('is-unavailable');image.hidden=!item.image;image.alt=item.name;if(item.image)image.src=item.image;else image.removeAttribute('src');
    dialog.showModal();document.body.classList.add('dialog-open');
  }
  imageState(root.querySelector('#dialog-image'));
  root.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close()});
  dialog.addEventListener('close',()=>{document.body.classList.remove('dialog-open');opener?.focus({preventScroll:true})});
  const toggle=root.querySelector('.nav-toggle'),nav=root.querySelector('#mobile-nav');
  function closeNav(){if(!nav||!toggle)return;nav.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.textContent='☰';toggle.setAttribute('aria-label','Открыть навигацию')}
  toggle?.addEventListener('click',()=>{const open=nav.hidden;nav.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰';toggle.setAttribute('aria-label',open?'Закрыть навигацию':'Открыть навигацию')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav&&!nav.hidden){closeNav();toggle.focus()}});
  window.matchMedia('(min-width: 901px)').addEventListener('change',e=>{if(e.matches)closeNav()});
  const header=document.querySelector('.menu-header');const updateHeader=()=>header?.classList.toggle('is-scrolled',scrollY>16);window.addEventListener('scroll',updateHeader,{passive:true});updateHeader();
  const initialAnchor=location.hash.slice(1);
  if(titles[initialAnchor])history.replaceState(null,'',location.pathname+location.search);
  select('kitchen',false,false);
})();
