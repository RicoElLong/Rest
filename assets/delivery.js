/* Set data-delivery-url on the trigger once the restaurant's Yandex Food URL is ready. */
(()=>{
 const widget=document.querySelector('.delivery-widget');if(!widget)return;
 const trigger=widget.querySelector('.delivery-trigger'),notice=widget.querySelector('.delivery-notice');
 const close=()=>{notice.hidden=true;trigger.setAttribute('aria-expanded','false');};
 trigger.addEventListener('click',()=>{
  const destination=trigger.dataset.deliveryUrl;
  if(destination){const url=new URL(destination,location.href);if(url.protocol==='https:'){location.assign(url.href);return;}}
  const open=notice.hidden;notice.hidden=!open;trigger.setAttribute('aria-expanded',String(open));
 });
 document.addEventListener('click',event=>{if(!widget.contains(event.target))close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!notice.hidden){close();trigger.focus();}});
})();
