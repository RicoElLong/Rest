(() => {
 const toggle=document.querySelector('.mobile-toggle'),menu=document.querySelector('.mobile-menu'),masthead=document.querySelector('.topbar-wrap');
 function close(){menu.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.textContent='☰';toggle.setAttribute('aria-label','Открыть меню');}
 toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';menu.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');toggle.textContent=open?'×':'☰'});
 menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.classList.contains('open')){close();toggle.focus()}});
 document.addEventListener('click',event=>{if(!event.target.closest('.mobile-header'))close()});
 matchMedia('(min-width:921px)').addEventListener('change',event=>{if(event.matches)close()});
 function update(){masthead.classList.toggle('is-scrolled',scrollY>16)}
 addEventListener('scroll',update,{passive:true});update();
 const links=[...document.querySelectorAll('.nav-left a[href^="#"],.nav-right a[href^="#"],.mobile-menu a[href^="#"],.footer-links a[href^="#"]')];
 const sections=['top','menu','banquets','promotions','gallery','location'].map(id=>document.getElementById(id)).filter(Boolean);
 let pending=false,lastY=scrollY,lastDirection=1,lastEvent="";
 function mark(){pending=false;const offset=masthead.getBoundingClientRect().height+70;let current='top';for(const section of sections)if(section.getBoundingClientRect().top<=offset)current=section.id;if(innerHeight+scrollY>=document.documentElement.scrollHeight-8)current='location';if(scrollY<40)current='top';const delta=scrollY-lastY;if(Math.abs(delta)>1)lastDirection=delta>0?1:-1;lastY=scrollY;const eventKey=current+':'+lastDirection;if(eventKey!==lastEvent){lastEvent=eventKey;dispatchEvent(new CustomEvent('restaurant:sectionchange',{detail:{id:current==='promotions'?'banquets':current,direction:lastDirection}}))}links.forEach(link=>{if(link.hash==='#'+current)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')})}
 addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(mark)}},{passive:true});addEventListener('resize',mark);mark();
})();
