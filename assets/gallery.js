(() => {
  const root=document.querySelector('#gallery');
  if(!root)return;
  const slides=[...root.querySelectorAll('.gallery-slide')],dots=[...root.querySelectorAll('.gallery-dot')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const status=root.querySelector('.gallery-status'),counter=root.querySelector('.gallery-current');
  let active=0,startX=null,timer,paused=false,visible=false,suppressClickUntil=0;
  function render(animate=true){
    slides.forEach((slide,i)=>{
      let offset=(i-active+slides.length)%slides.length;
      if(offset>slides.length/2)offset-=slides.length;
      const center=offset===0;
      slide.tabIndex=center?0:-1;
      slide.setAttribute('aria-label',`${slide.dataset.title}. ${center?'Открыть фотографию':'Перейти к фотографии'}`);
      slide.style.zIndex=String(10-Math.abs(offset));
      const props={xPercent:offset*106,scale:center?1:.86,rotation:offset*2,opacity:Math.abs(offset)>1?0:center?1:.45,duration:animate&&!reduced.matches?.85:0,ease:'power3.inOut',overwrite:true};
      if(window.gsap)gsap.to(slide,props);else{slide.style.transform=`translateX(${offset*106}%) scale(${center?1:.86})`;slide.style.opacity=props.opacity;}
      slide.style.pointerEvents=Math.abs(offset)>1?'none':'auto';
      slide.classList.toggle('is-active',center);
    });
    dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===active)));
    counter.textContent=String(active+1).padStart(2,'0');
    root.querySelector('.gallery-caption-title').textContent=slides[active].dataset.title;
    root.querySelector('.gallery-caption-note').textContent=slides[active].dataset.note;
  }
  function go(index,user=false){active=(index+slides.length)%slides.length;render();if(user)status.textContent=`${active+1} из ${slides.length}: ${slides[active].dataset.title}`;schedule();}
  function schedule(){clearTimeout(timer);if(!paused&&!reduced.matches&&visible&&!document.hidden&&!modal.open&&!root.contains(document.activeElement)&&!root.matches(':hover'))timer=setTimeout(()=>go(active+1),6500);}
  root.querySelector('.gallery-prev').addEventListener('click',()=>go(active-1,true));
  root.querySelector('.gallery-next').addEventListener('click',()=>go(active+1,true));
  dots.forEach((dot,i)=>dot.addEventListener('click',()=>go(i,true)));
  root.querySelector('.gallery-pause').addEventListener('click',event=>{paused=!paused;event.currentTarget.textContent=paused?'Продолжить':'Пауза';event.currentTarget.setAttribute('aria-pressed',String(paused));schedule();});
  const stage=root.querySelector('.gallery-stage');
  stage.addEventListener('pointerdown',e=>{startX=e.clientX});
  stage.addEventListener('pointerup',e=>{if(startX!==null&&Math.abs(e.clientX-startX)>45){suppressClickUntil=Date.now()+500;go(active+(e.clientX<startX?1:-1),true);startX=null;}else startX=null;});
  stage.addEventListener('pointercancel',()=>startX=null);
  root.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();go(active+(e.key==='ArrowRight'?1:-1),true);}});
  root.addEventListener('mouseenter',()=>clearTimeout(timer));root.addEventListener('mouseleave',schedule);
  root.addEventListener('focusin',()=>clearTimeout(timer));root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget))schedule()});
  const modal=document.querySelector('#gallery-viewer');
  slides.forEach((slide,i)=>slide.addEventListener('click',()=>{if(Date.now()<suppressClickUntil)return;if(i!==active){go(i,true);return;}modal.querySelector('img').src=slide.querySelector('img').src;modal.querySelector('img').alt=slide.querySelector('img').alt;modal.querySelector('figcaption').textContent=slide.dataset.title;modal.showModal();clearTimeout(timer);}));
  modal.querySelector('button').addEventListener('click',()=>modal.close());
  modal.addEventListener('click',e=>{if(e.target===modal)modal.close()});modal.addEventListener('close',schedule);
  document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',()=>{render(false);schedule()});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule()},{threshold:.2}).observe(root);
  render(false);
})();
