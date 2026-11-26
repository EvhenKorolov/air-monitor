'use strict';
/* Sounds represent announced civil warnings, not actual object positions. */
const ALERT_SOUND_PATTERNS=Object.freeze({
 general:{wave:'sine',notes:[[520,660,.20],[660,520,.20],[520,660,.20]]},
 drone:{wave:'triangle',notes:[[350,410,.16],[350,410,.16],[350,410,.16]]},
 jet_uav:{wave:'triangle',notes:[[560,920,.30],[920,560,.23]]},
 molniya:{wave:'sine',notes:[[740,740,.09],[980,980,.09],[1240,1240,.13]]},
 banderol:{wave:'triangle',notes:[[420,420,.23],[680,680,.10],[420,420,.23]]},
 missile:{wave:'triangle',notes:[[480,820,.35],[480,820,.35]]},
 ballistic:{wave:'triangle',notes:[[1050,1050,.13],[1050,1050,.13],[1050,1050,.13],[650,1050,.26]]},
 kab:{wave:'sine',notes:[[330,220,.35],[330,220,.35]]},
 mixed:{wave:'sine',notes:[[500,750,.17],[850,550,.17],[500,900,.22]]},
 clear:{wave:'sine',notes:[[440,440,.16],[554,554,.16],[660,660,.28]]}
});
const SOUND_PRIORITY=['ballistic','missile','jet_uav','banderol','kab','drone','molniya','mixed','general','clear'];
const SOUND_KEY='air-monitor.sound.enabled.v1';
function soundTypes(state){
 if(state?.status!=='active')return [];
 const listed=Array.isArray(state.threat_types)?state.threat_types.filter(t=>SOUND_PRIORITY.includes(t)&&t!=='clear'):[];
 if(listed.length)return [...new Set(listed)];
 return [SOUND_PRIORITY.includes(state.threat_type)&&state.threat_type!=='clear'?state.threat_type:'general'];
}
function warningSoundChanges(before,after,oldPublic=[],newPublic=[]){
 const oldTypes=soundTypes(before),newTypes=soundTypes(after),out=new Set();
 const freshStart=after?.status==='active'&&before?.status==='active'&&Number.isFinite(before.started_at_ms)&&Number.isFinite(after.started_at_ms)&&after.started_at_ms>before.started_at_ms;
 for(const t of newTypes)if(freshStart||!oldTypes.includes(t))out.add(t);
 if(before?.status==='active'&&after?.status==='ended')out.add('clear');
 for(const t of newPublic)if(t!=='clear'&&SOUND_PRIORITY.includes(t)&&!oldPublic.includes(t))out.add(t);
 return SOUND_PRIORITY.filter(t=>out.has(t));
}
class AlertSounds{
 constructor({button,note,unlockButton,previewButton,previewSelect,contextFactory,storage,documentRef}){
  this.button=button;this.note=note;this.unlockButton=unlockButton;this.previewButton=previewButton;this.previewSelect=previewSelect;
  this.doc=documentRef;this.storage=storage;this.contextFactory=contextFactory;this.context=null;this.enabled=true;this.pending=new Map();this.nodes=new Set();this.nextAt=0;this.unavailable=false;
  try{this.enabled=storage?.getItem(SOUND_KEY)!=='off'}catch{}
  this.button.onclick=()=>this.setEnabled(!this.enabled);
  this.unlockButton.onclick=()=>{if(this.enabled)this.unlock()};
  this.previewButton.onclick=()=>{if(this.enabled){const type=this.previewSelect.value;this.unlock().then(ok=>{if(ok&&this.enabled)this.safePlay([type])})}};
  const gesture=e=>{if(!this.enabled||this.ready||e.isTrusted===false||[this.button,this.unlockButton,this.previewButton].some(el=>el===e.target||el.contains?.(e.target)))return;this.unlock()};
  this.doc?.addEventListener('click',gesture,true);
  this.doc?.addEventListener('keydown',gesture,true);
  this.doc?.addEventListener('visibilitychange',()=>{if(this.doc.hidden){this.pending.clear();this.stop()}else this.render()});
  this.render();
 }
 get ready(){return this.context?.state==='running'}
 render(){
  this.button.textContent=this.enabled?'🔊 Звук: увімкнено':'🔇 Звук: вимкнено';
  this.button.setAttribute('aria-pressed',String(this.enabled));
  this.unlockButton.hidden=!this.enabled||this.ready||this.unavailable;
  this.previewButton.disabled=!this.enabled||this.unavailable;
  this.previewSelect.disabled=!this.enabled||this.unavailable;
  this.note.textContent=!this.enabled?'Звукові сповіщення вимкнено.':this.unavailable?'Звук недоступний у цьому браузері.':this.ready?'Звук активний у відкритому застосунку.': 'Звук увімкнено. Для відтворення торкніться екрана або натисніть «Активувати звук».';
 }
 setEnabled(value){
  this.enabled=Boolean(value);try{this.storage?.setItem(SOUND_KEY,this.enabled?'on':'off')}catch{}
  if(!this.enabled){this.pending.clear();this.stop()}else this.unlock();this.render();
 }
 async unlock(){
  if(!this.enabled||this.unavailable)return false;
  try{
   if(!this.context||this.context.state==='closed'){
    this.context=this.contextFactory();if(!this.context){this.unavailable=true;this.render();return false}
    this.context.onstatechange=()=>{this.render();if(this.ready&&this.enabled)this.flush()};
   }
   // resume() must be called synchronously from the user's gesture on iOS/Android.
   if(!this.ready)await this.context.resume();
   this.render();if(this.ready&&this.enabled)this.flush();return Boolean(this.ready&&this.enabled);
  }catch{this.render();return false}
 }
 notify(types,allowed){
  if(!this.enabled||this.doc?.hidden)return;
  const now=Date.now();
  for(const [t,at] of this.pending)if(!allowed.includes(t)||now-at>30000)this.pending.delete(t);
  for(const t of types)if(ALERT_SOUND_PATTERNS[t]&&allowed.includes(t))this.pending.set(t,now);
  if(this.ready)this.flush();else if(types.length)this.render();
 }
 clearPending(){this.pending.clear()}
 flush(){
  if(!this.enabled||!this.ready||this.doc?.hidden)return;
  const now=Date.now(),types=SOUND_PRIORITY.filter(t=>this.pending.has(t)&&now-this.pending.get(t)<=30000);
  this.pending.clear();this.safePlay(types);
 }
 safePlay(types){try{this.play(types)}catch(e){this.stop();console.warn("[AIR MONITOR AUDIO]",e);this.render()}}
 play(types){
  if(!this.enabled||!this.ready||this.doc?.hidden)return;
  if(!types.length)return;
  const c=this.context;let at=Math.max(c.currentTime+.025,this.nextAt);
  // Bound the queue: never build a long backlog of delayed warnings.
  if(at-c.currentTime>7)return;
  for(const type of [...new Set(types)]){
   const p=ALERT_SOUND_PATTERNS[type];if(!p)continue;
   for(const [start,end,duration] of p.notes){
    const o=c.createOscillator(),g=c.createGain();o.type=p.wave;
    o.frequency.setValueAtTime(start,at);o.frequency.linearRampToValueAtTime(end,at+duration);
    g.gain.setValueAtTime(.001,at);g.gain.linearRampToValueAtTime(.10,at+.018);g.gain.exponentialRampToValueAtTime(.001,at+duration);
    o.connect(g);g.connect(c.destination);this.nodes.add(o);
    o.onended=()=>{this.nodes.delete(o);o.disconnect();g.disconnect()};o.start(at);o.stop(at+duration+.01);at+=duration+.085;
   }
   at+=.23;
  }
  this.nextAt=at;
 }
 stop(){for(const o of this.nodes){try{o.stop()}catch{}}this.nodes.clear();this.nextAt=0;}
}
if(typeof module!=='undefined')module.exports={ALERT_SOUND_PATTERNS,SOUND_PRIORITY,soundTypes,warningSoundChanges,AlertSounds};
