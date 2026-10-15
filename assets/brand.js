(() => {
  const brand=document.querySelector('.brand-center');
  if(!brand)return;
  const header=brand.parentElement;
  const trigger=document.createElement('button');
  trigger.className='promotions-trigger';
  trigger.textContent='Акции';
  trigger.setAttribute('aria-haspopup','dialog');
  trigger.setAttribute('aria-controls','promotions-dialog');
  header.append(trigger);
  const modal=document.createElement('dialog');
  modal.id='promotions-dialog';
  modal.className='promotions-dialog';
  modal.setAttribute('aria-labelledby','promotions-title');
  modal.innerHTML=`<button class="promotions-close" aria-label="Закрыть акции" autofocus>×</button><p class="promotions-eyebrow">Специально для вас</p><h2 id="promotions-title">Акции ресторана</h2><p>Выберите, где вам удобно узнавать о новых предложениях.</p><div class="promotions-options"><button data-messenger="Telegram">Telegram <span>↗</span></button><button data-messenger="MAX">MAX <span>↗</span></button></div><p class="promotions-status" role="status" aria-live="polite">Демонстрационный режим — подписка не оформляется.</p>`;
  document.body.append(modal);
  trigger.addEventListener('click',()=>{
    modal.querySelector('.promotions-status').textContent='Демонстрационный режим — подписка не оформляется.';
    modal.querySelectorAll('[data-messenger]').forEach(button=>button.setAttribute('aria-pressed','false'));
    modal.showModal();
    if(window.gsap&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      gsap.fromTo(modal,{opacity:0,y:18},{opacity:1,y:0,duration:.35,ease:'power2.out'});
    }
  });
  modal.querySelector('.promotions-close').addEventListener('click',()=>modal.close());
  modal.addEventListener('click',event=>{
    if(event.target===modal){const rect=modal.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)modal.close();}
    const button=event.target.closest('[data-messenger]');
    if(!button)return;
    modal.querySelectorAll('[data-messenger]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    modal.querySelector('.promotions-status').textContent=`Вы выбрали ${button.dataset.messenger}. Это демонстрация: переход и подписка пока не подключены.`;
  });
  modal.addEventListener('close',()=>{window.gsap?.killTweensOf(modal);trigger.focus({preventScroll:true})});
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer;
  function flicker(){
    if(reduced.matches)return;
    brand.classList.add('is-flickering');
    clearTimeout(timer);
    timer=setTimeout(()=>brand.classList.remove('is-flickering'),650);
  }
  function interactive(event){
    if(event.target instanceof Element && event.target.closest('a,button,input,select,textarea,summary'))flicker();
  }
  window.addEventListener('scroll',flicker,{passive:true});
  document.addEventListener('pointerover',event=>{
    if(event.target instanceof Element){const control=event.target.closest('a,button,input,select,textarea,summary');
      if(control && (!(event.relatedTarget instanceof Node)||!control.contains(event.relatedTarget)))flicker();
    }
  },{passive:true});
  document.addEventListener('pointerdown',interactive,{passive:true});
  document.addEventListener('focusin',interactive);
  document.addEventListener('input',interactive);
  reduced.addEventListener('change',()=>{clearTimeout(timer);brand.classList.remove('is-flickering')});
})();
