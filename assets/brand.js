(() => {
  const brand=document.querySelector('.brand-center');
  if(!brand)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer;
  function flicker(){
    if(reduced.matches)return;
    brand.classList.add('is-flickering');
    clearTimeout(timer);
    timer=setTimeout(()=>brand.classList.remove('is-flickering'),650);
  }
  window.addEventListener('scroll',flicker,{passive:true});
  function interactive(event){
    if(event.target instanceof Element && event.target.closest('a,button,input,select,textarea,summary'))flicker();
  }
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
