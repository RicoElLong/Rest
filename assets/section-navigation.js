(() => {
 const gallery=document.querySelector('#gallery');
 if(!gallery)return;
 const stage=gallery.querySelector('.gallery-stage');
 const header=document.querySelector('.topbar-wrap');
 const targets=new Map([['#gallery',stage],['#promotions',document.querySelector('#promotions')]]);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let userMoved=false,frame;
 const markInteraction=()=>{userMoved=true};
 addEventListener('wheel',markInteraction,{passive:true});addEventListener('touchmove',markInteraction,{passive:true});
 addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))markInteraction()});
 function align(behavior='instant'){
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{
   const target=targets.get(location.hash);if(!target)return;
   const top=target.getBoundingClientRect().top+scrollY-(header?.getBoundingClientRect().height||0)-18;
   scrollTo({top:Math.max(0,top),behavior});
  });
 }
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const url=new URL(link.href);if(url.origin!==location.origin||url.pathname!==location.pathname||!targets.has(url.hash))return;
  event.preventDefault();userMoved=false;
  if(location.hash!==url.hash)history.pushState(null,'',url);
  align(reduced.matches?'instant':'smooth');
 });
 function initialAlignment(){if(targets.has(location.hash)&&!userMoved)align();}
 addEventListener('hashchange',()=>{if(targets.has(location.hash)){userMoved=false;align(reduced.matches?'instant':'smooth')}});
 addEventListener('restaurant:catalogready',initialAlignment);
 document.fonts?.ready.then(initialAlignment);
 initialAlignment();
})();
