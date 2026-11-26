'use strict';
// Set to a public HTTPS endpoint returning official, region-level alert states.
const API_URL = 'https://ittusovkaeuserver.herokuapp.com/api/alerts';
const regions = [ ['Вінницька',49.23,28.48],['Волинська',50.75,25.34],['Дніпропетровська',48.46,35.05],['Донецька',48,37.8],['Житомирська',50.25,28.66],['Закарпатська',48.62,22.3],['Запорізька',47.84,35.14],['Івано-Франківська',48.92,24.71],['Київська',50.45,30.52],['Кіровоградська',48.51,32.26],['Луганська',48.57,39.3],['Львівська',49.84,24.03],['Миколаївська',46.97,31.99],['Одеська',46.48,30.73],['Полтавська',49.59,34.55],['Рівненська',50.62,26.25],['Сумська',50.91,34.8],['Тернопільська',49.55,25.59],['Харківська',49.99,36.23],['Херсонська',46.64,32.62],['Хмельницька',49.42,27],['Черкаська',49.44,32.06],['Чернівецька',48.29,25.94],['Чернігівська',51.5,31.29],['АР Крим',44.95,34.1],['м. Київ',50.47,30.61],['м. Севастополь',44.6,33.53] ];
const $=id=>document.getElementById(id), tg=window.Telegram?.WebApp;
function full(){try{tg?.expand();if(tg?.isVersionAtLeast?.('8.0'))tg.requestFullscreen();else if(!tg?.initData)document.documentElement.requestFullscreen?.()?.catch(()=>{});}catch{}}
try{tg?.ready();tg?.expand();tg?.setHeaderColor('#0b1019');if(tg?.isVersionAtLeast?.('8.0'))tg.requestFullscreen();}catch{}
function safe(){document.documentElement.style.setProperty('--safe-top',`${(tg?.safeAreaInset?.top||0)+(tg?.contentSafeAreaInset?.top||0)}px`)}safe();tg?.onEvent?.('safeAreaChanged',safe);tg?.onEvent?.('contentSafeAreaChanged',safe);
$('fullscreen').onclick=full;
const name=r=>r.startsWith('м.')||r==='АР Крим'?r:r+' область';
for(const [r] of regions){const o=document.createElement('option');o.value=r;o.textContent=name(r);$('region').append(o)}$('region').value='Запорізька';
let states={}, updated=0, failed=false, busy=false, lastError='';
const map=window.L?L.map('map',{minZoom:4,maxZoom:12,preferCanvas:false}).fitBounds([[44.3,22],[52.5,40.3]]):null;
if(map){L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:12,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);if(window.ResizeObserver)new ResizeObserver(()=>map.invalidateSize()).observe($('map'));else window.addEventListener('resize',()=>map.invalidateSize());}else $('map').textContent='Карта недоступна';
const TYPES = {
 general:{label:'Повітряна тривога',icon:'🚨',theme:'red',color:'#ff4545',anim:'siren'},
 drone:{label:'Загроза БпЛА',icon:'🛸',theme:'orange',color:'#ff9638',anim:'drone'},
 missile:{label:'Ракетна небезпека',icon:'🚀',theme:'red',color:'#ff4545',anim:'missile'},
 ballistic:{label:'Балістична загроза',icon:'⚠️',theme:'red',color:'#ff4545',anim:'alert'},
 kab:{label:'Загроза застосування КАБ',icon:'💣',theme:'orange',color:'#ff9638',anim:'explosion'},
 clear:{label:'Відбій тривоги',icon:'✅',theme:'green',color:'#35d878',anim:'clear'},
 unknown:{label:'Немає актуальних даних',icon:'⚪',theme:'yellow',color:'#8693a5',anim:'default'}
};
let districts={},events=[],soundEnabled=false,audio=null;
const validType=t=>['general','drone','missile','ballistic','kab'].includes(t)?t:'general';
const selected=()=>$('region').value;
function get(r){return states[r]||{status:'unknown'}}
function stale(){return failed||!updated||Date.now()-updated>120000||updated>Date.now()+60000}
function kind(a){return a.status==='active'?validType(a.threat_type):a.status==='ended'?'clear':'unknown'}
function view(a){return TYPES[kind(a)]}
function format(ms){if(!Number.isFinite(ms)||ms<0)return '—';let s=Math.floor(ms/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':')}
function dateText(ms){return Number.isFinite(ms)?new Date(ms).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'}):'Час невідомий'}
function timer(){const a=get(selected());$('timer-value').textContent=stale()?'—':a.status==='active'?format(Date.now()-a.started_at_ms):a.status==='ended'?format(a.ended_at_ms-a.started_at_ms):'—'}
function row(text,subtitle,color){const e=document.createElement('div');e.className='event';const main=document.createElement('div');main.textContent=text;main.style.color=color;const small=document.createElement('small');small.textContent=subtitle;e.append(main,small);return e}
function render(){
 const offline=stale(),a=offline?{status:'unknown'}:get(selected()),v=view(a),s=a.status;
 $('widget').className='theme-'+v.theme;
 $('status-text').textContent=s==='active'&&a.scope==='district'?'Тривога в частині області':v.label;
 $('status-badge').textContent=s==='active'?'АКТИВНА':s==='ended'?'ВІДБІЙ':'НЕВІДОМО';
 $('threat-icon').textContent=v.icon;$('threat-icon').className='icon anim-'+v.anim;
 $('threat-text').textContent=name(selected());
 $('threat-caption').textContent=v.label+(s==='active'&&a.scope==='district'?' · частина області':'');
 $('live-label').textContent=offline?'НЕАКТУАЛЬНО':s==='active'?'LIVE':'СТАТУС';$('mode').textContent=offline?'OFFLINE':'ONLINE';
 $('updated').textContent=updated?'Зв’язок перевірено: '+dateText(updated):'Немає даних';
 $('active').textContent=offline?'—':Object.values(states).filter(a=>a.status==='active').length;
 $('known').textContent=offline?'—':Object.values(states).filter(a=>a.status!=='unknown').length;
 if(boundaryMap)boundaryMap.render({states,districts,offline,selected:selected()});
 const d=$('districts');d.replaceChildren();
 if(!offline)Object.entries(districts).filter(([,x])=>x.region===selected()).sort((a,b)=>a[0].localeCompare(b[0],'uk')).forEach(([label,x])=>{const v=view(x);d.append(row(v.icon+' '+label,v.label,v.color))});
 if(!d.children.length)d.textContent='Немає окремих актуальних оголошень для районів';
 const feed=$('feed');feed.replaceChildren();const filter=$('filter').value;
 if(!offline)events.filter(x=>filter==='all'||kind(x)===filter).slice(0,20).forEach(x=>{const v=view(x);feed.append(row(v.icon+' '+v.label+' · '+(x.district||name(x.region)),dateText(x.at_ms)+(x.district?' · '+name(x.region):''),v.color))});
 if(!feed.children.length)feed.textContent='Немає актуальних повідомлень за цим фільтром';
 $('notice').textContent=offline?(lastError?'API OFFLINE: '+lastError:'Немає актуального зв’язку'):'Статуси за повідомленнями підключених каналів. Невідомий статус не означає відбій. Заливка показує адміністративні зони, а не місця перебування об’єктів.';
 timer();
}
function beep(){
 if(!soundEnabled||!audio||audio.state!=='running')return;
 const t=audio.currentTime;
 for(const offset of [0,.24]){const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=660;g.gain.setValueAtTime(0,t+offset);g.gain.linearRampToValueAtTime(.10,t+offset+.025);g.gain.exponentialRampToValueAtTime(.001,t+offset+.18);o.connect(g);g.connect(audio.destination);o.start(t+offset);o.stop(t+offset+.19)}
}
$('sound').onclick=async()=>{
 if(soundEnabled){soundEnabled=false;}else{try{const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Audio unavailable');audio=audio||new C();await audio.resume();soundEnabled=audio.state==='running';if(!soundEnabled)throw Error('Audio suspended');beep();}catch{soundEnabled=false;$('sound-note').textContent='Звук недоступний у цьому браузері.';}}
 $('sound').textContent=soundEnabled?'🔊 Звук: увімкнено':'🔇 Звук: вимкнено';$('sound').setAttribute('aria-pressed',String(soundEnabled));
};
function clean(a){return {status:['active','ended','unknown'].includes(a?.status)?a.status:'unknown',scope:a?.scope==='district'?'district':null,threat_type:validType(a?.threat_type),started_at_ms:Number.isFinite(a?.started_at_ms)?a.started_at_ms:NaN,ended_at_ms:Number.isFinite(a?.ended_at_ms)?a.ended_at_ms:NaN}}
const regionNames=new Set(regions.map(([r])=>r));
async function fetchAlerts(){const c=new AbortController(),timeout=setTimeout(()=>c.abort(),15000);try{const response=await fetch(API_URL,{cache:'no-store',signal:c.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json()}finally{clearTimeout(timeout)}}
async function refresh(){
 if(busy)return;busy=true;$('refresh').disabled=true;$('refresh').setAttribute('aria-busy','true');
 try{
  const data=await fetchAlerts();if(!Number.isFinite(data.updated_at_ms)||!data.regions||typeof data.regions!=='object'||Array.isArray(data.regions))throw Error('Некоректний JSON API');
  if(!data.updated_at_ms||Date.now()-data.updated_at_ms>120000||data.updated_at_ms>Date.now()+60000)throw Error('Дані API застаріли або час пристрою відрізняється');
  const previous=get(selected()),wasOnline=!stale(),next={};for(const [r] of regions)next[r]=clean(data.regions[r]);
  const nextDistricts={};if(data.districts&&typeof data.districts==='object'&&!Array.isArray(data.districts))for(const [d,x] of Object.entries(data.districts))if(x&&regionNames.has(x.region))nextDistricts[d]={...clean(x),region:x.region};
  const nextEvents=Array.isArray(data.events)?data.events.filter(x=>x&&regionNames.has(x.region)&&['active','ended'].includes(x.status)&&Number.isFinite(x.at_ms)).map(x=>({...clean(x),region:x.region,district:typeof x.district==='string'?x.district:null,at_ms:x.at_ms})).sort((a,b)=>b.at_ms-a.at_ms):[];
  states=next;districts=nextDistricts;events=nextEvents;updated=data.updated_at_ms;failed=false;lastError='';
  if(wasOnline&&previous.status!=='active'&&get(selected()).status==='active')beep();
 }catch(e){failed=true;lastError=e.name==='AbortError'?'Час очікування API вичерпано':e instanceof TypeError?'Мережева помилка або CORS':String(e.message||e);console.error('[AIR MONITOR]',e)}finally{busy=false;$('refresh').disabled=false;$('refresh').setAttribute('aria-busy','false');render()}
}
let ownLocation=null;
const boundaryMap=map?new CivilBoundaryMap(map,regions,TYPES,{onSelect:r=>{ownLocation?.manualSelection();$('region').value=r;render()}}):null;
if(boundaryMap)boundaryMap.load();else $('geometry-status').textContent='Карта недоступна';
if(map&&boundaryMap){ownLocation=new OwnLocation(map,boundaryMap,tg,{parents:BOUNDARY_PARENTS,label:name,onSelect:r=>{if(regionNames.has(r)){$('region').value=r;render();}}});ownLocation.start();}else{$('locate').disabled=true;$('location-status').textContent='Карта недоступна';}
$('region').onchange=()=>{ownLocation?.manualSelection();render();};$('filter').onchange=render;$('refresh').onclick=refresh;refresh();setInterval(timer,1000);setInterval(refresh,15000);setInterval(render,30000);
