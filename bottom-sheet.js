/* Independent civil-warning information drawer. No API or location changes. */
(() => {
 'use strict';
 const sheet=document.getElementById('details-sheet');
 const handle=document.getElementById('sheet-handle');
 const content=document.getElementById('sheet-content');
 const hint=document.getElementById('sheet-hint');
 if(!sheet||!handle||!content||!hint)return;
 let open=false,drag=null,suppressClick=false;
 function setOpen(value){
  open=Boolean(value);
  if(!open&&content.contains(document.activeElement))handle.focus({preventScroll:true});
  sheet.dataset.open=String(open);
  sheet.style.removeProperty('height');
  handle.setAttribute('aria-expanded',String(open));
  content.setAttribute('aria-hidden',String(!open));
  content.inert=!open;
  hint.textContent=open?'Потягніть вниз':'Потягніть вгору';
  handle.title=open?'Згорнути панель':'Розгорнути панель';
 }
 function restoreTelegram(d){if(d?.restoreSwipes){try{window.Telegram?.WebApp?.enableVerticalSwipes?.()}catch{}}}
 function limits(){
  const old=sheet.dataset.open, inline=sheet.style.height;
  sheet.style.removeProperty('height');
  sheet.dataset.open='false';const min=sheet.getBoundingClientRect().height;
  sheet.dataset.open='true';const max=sheet.getBoundingClientRect().height;
  sheet.dataset.open=old;sheet.style.height=inline;
  return [min,Math.max(min,max)];
 }
 handle.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||drag)return;
  suppressClick=false;sheet.classList.add('is-dragging');
  const [min,max]=limits();
  const telegram=window.Telegram?.WebApp;
  drag={id:e.pointerId,y:e.clientY,min,max,start:open?max:min,moved:false,restoreSwipes:false};
  if(telegram?.isVerticalSwipesEnabled===true&&telegram.disableVerticalSwipes){try{telegram.disableVerticalSwipes();drag.restoreSwipes=true}catch{}}
  try{handle.setPointerCapture(e.pointerId)}catch{}
 });
 handle.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const dy=drag.y-e.clientY;
  if(Math.abs(dy)>7)drag.moved=true;
  if(!drag.moved)return;
  sheet.style.height=Math.max(drag.min,Math.min(drag.max,drag.start+dy))+'px';
 });
 function finish(e,cancel=false){
  if(!drag||drag.id!==e.pointerId)return;
  const d=drag;drag=null;
  const dy=d.y-e.clientY;
  const threshold=Math.min(55,Math.max(20,(d.max-d.min)*.16));
  suppressClick=d.moved&&!cancel;
  sheet.classList.remove('is-dragging');
  restoreTelegram(d);
  setOpen(!cancel&&d.moved&&Math.abs(dy)>=threshold?dy>0:open);
  if(handle.hasPointerCapture?.(e.pointerId))handle.releasePointerCapture(e.pointerId);
 }
 handle.addEventListener('pointerup',e=>finish(e));
 handle.addEventListener('pointercancel',e=>finish(e,true));
 handle.addEventListener('lostpointercapture',e=>finish(e,true));
 handle.addEventListener('click',e=>{
  if(suppressClick&&e.detail!==0){suppressClick=false;return;}
  suppressClick=false;setOpen(!open);
 });
 handle.addEventListener('keydown',e=>{
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setOpen(e.key==='ArrowUp');}
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){setOpen(false);handle.focus({preventScroll:true});}});
 document.addEventListener('pointerdown',e=>{if(open&&!sheet.contains(e.target)&&!drag)setOpen(false);},true);
 // Reopening Telegram or rotating never forces an expanded panel.
 window.addEventListener('pagehide',()=>{if(drag){restoreTelegram(drag);drag=null;sheet.classList.remove('is-dragging');}setOpen(false);});
 setOpen(false);
})();
