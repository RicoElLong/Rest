(() => {
 const brand=document.querySelector('.brand-center');
 if(!brand)return;
 const lamps=[...brand.querySelectorAll('.car-headlight')];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const ids=['top','menu','banquets','gallery','location'];
 let state={id:'top',direction:1};
 function project(animate=true){
  const index=Math.max(0,ids.indexOf(state.id));
  const reset=index===0||reduced.matches;
  const links=[...document.querySelectorAll('.nav-left a[href^="#"],.nav-right a[href^="#"],.mobile-menu a[href^="#"]')];
  links.forEach(link=>link.classList.toggle('is-beam-lit',!reset&&link.hash==='#'+state.id));
  brand.classList.toggle('is-projecting',!reset);
  const link=links.find(link=>link.hash==='#'+state.id&&link.getBoundingClientRect().width>0);
  lamps.forEach((lamp,i)=>{
   const origin=lamp.getBoundingClientRect();
   const target=link?.getBoundingClientRect();
   const mobile=innerWidth<=640;
   let length=mobile?210:Math.min(440,Math.max(200,innerWidth*.31));
   let angle=i?1.5:0,height=mobile?(i?54:58):(i?92:100),opacity=1,power=1;
   if(!reset){
    const dx=target?target.x+target.width*.65-(origin.x+origin.width/2):Math.max(80,innerWidth-origin.x-18);
    const dy=target?target.y+target.height/2-(origin.y+origin.height/2):0;
    length=Math.max(80,Math.hypot(dx,dy)+28);
    angle=Math.atan2(dy,dx)*180/Math.PI;
    const intensity=state.direction>0?1:.5;
    height=(mobile?58:94)+index*(state.direction>0?12:5);
    opacity=intensity+index*.09;
    power=1+(state.direction>0?.13:.04)*index;
    // Extend the second beam slightly further for a layered cone of light.
    length+=i*12;
   }
   const props={'--beam-length':length+'px','--beam-height':height+'px','--beam-angle':angle+'deg','--beam-opacity':opacity,'--lamp-power':power};
   if(window.gsap)gsap.to(lamp,{...props,duration:animate&&!reduced.matches?.85:0,ease:'power2.out',overwrite:true});
   else for(const[key,value]of Object.entries(props))lamp.style.setProperty(key,String(value));
  });
 }
 addEventListener('restaurant:sectionchange',event=>{state=event.detail;project()});
 addEventListener('resize',()=>project(false));
 reduced.addEventListener('change',()=>project(false));
 // Navigation starts before this script and may already have selected a section.
 const current=document.querySelector('.nav-left [aria-current],.nav-right [aria-current]');
 if(current)state.id=current.hash.slice(1);
 project(false);
})();
