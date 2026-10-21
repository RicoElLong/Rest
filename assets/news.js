(() => {
 'use strict';
 const root=document.querySelector('.news-page');if(!root)return;
 const filters=root.querySelector('.news-filters');
 const cards=[...root.querySelectorAll('[data-news-category]')];
 const status=root.querySelector('#news-status');
 const buttons=[...filters.querySelectorAll('[data-news-filter]')];
 const valid=new Set(buttons.map(button=>button.dataset.newsFilter));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function select(value,save=false){
  const category=valid.has(value)?value:'all';
  buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.newsFilter===category)));
  let visible=0;
  cards.forEach(card=>{const show=category==='all'||category===card.dataset.newsCategory;card.hidden=!show;if(show)visible++;});
  status.textContent=`Показано предложений: ${visible}`;
  if(save){const url=new URL(location.href);if(category==='all')url.searchParams.delete('topic');else url.searchParams.set('topic',category);history.pushState(null,'',url);}
  if(window.gsap&&!reduced.matches){gsap.killTweensOf(cards);gsap.fromTo(cards.filter(card=>!card.hidden),{y:12,opacity:.7},{y:0,opacity:1,duration:.35,stagger:.04,clearProps:'opacity,transform'});}
 }
 filters.hidden=false;
 buttons.forEach(button=>button.addEventListener('click',()=>select(button.dataset.newsFilter,true)));
 const read=()=>select(new URLSearchParams(location.search).get('topic'));
 addEventListener('popstate',read);read();
 const toggle=root.querySelector('.nav-toggle'),nav=root.querySelector('#mobile-nav');
 function closeNav(){nav.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.textContent='☰';toggle.setAttribute('aria-label','Открыть навигацию');}
 toggle.addEventListener('click',()=>{const open=nav.hidden;nav.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰';toggle.setAttribute('aria-label',open?'Закрыть навигацию':'Открыть навигацию');});
 nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeNav));
 document.addEventListener('click',event=>{if(!nav.hidden&&!event.target.closest('.menu-header'))closeNav();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!nav.hidden){closeNav();toggle.focus();}});
 matchMedia('(min-width: 1151px)').addEventListener('change',event=>{if(event.matches)closeNav();});
 const header=root.querySelector('.menu-header');const scroll=()=>header.classList.toggle('is-scrolled',scrollY>16);addEventListener('scroll',scroll,{passive:true});scroll();
})();
