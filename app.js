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
 mixed:{label:'Кілька типів попереджень',icon:'⚠️',theme:'red',color:'#ff4545',anim:'alert'},
 general:{label:'Повітряна тривога',icon:'🚨',theme:'red',color:'#ff4545',anim:'siren'},
 drone:{label:'Загроза ударних БпЛА',icon:'🛵',theme:'orange',color:'#ff9638',anim:'drone'},
 jet_uav:{label:'Реактивний БпЛА / ціль',icon:'✈️',theme:'red',color:'#ff5a36',anim:'missile'},
 molniya:{label:'БпЛА «Молнія»',icon:'⚡',theme:'orange',color:'#ffb020',anim:'drone'},
 banderol:{label:'Загроза «Бандероль»',icon:'📦',theme:'red',color:'#ff4545',anim:'missile'},
 missile:{label:'Ракетна небезпека',icon:'🚀',theme:'red',color:'#ff4545',anim:'missile'},
 ballistic:{label:'Балістична загроза',icon:'⚠️',theme:'red',color:'#ff4545',anim:'alert'},
 kab:{label:'Загроза застосування КАБ',icon:'💣',theme:'orange',color:'#ff9638',anim:'explosion'},
 clear:{label:'Відбій тривоги',icon:'✅',theme:'green',color:'#35d878',anim:'clear'},
 unknown:{label:'Немає актуальних даних',icon:'⚪',theme:'gray',color:'#8693a5',anim:'default'}
};
let districts={},cities={},events=[],trajectories=[],publicAdvisories=[],areaAdvisories=[];
const ALL_VALID_TYPES=['general','drone','jet_uav','molniya','banderol','missile','ballistic','kab','mixed'];
const validType=t=>ALL_VALID_TYPES.includes(t)?t:'general';
const selected=()=>$('region').value;
const selectedDistrict=()=>$('district-select').value||null;
const selectedCity=()=>$('city-select').value||null;
function cityOptions(city=null){
 const sel=$('city-select'),r=selected(),d=selectedDistrict();sel.replaceChildren();
 const all=document.createElement('option');all.value='';all.textContent='Без вибору міста';sel.append(all);
 const keys=Object.keys(CITY_CATALOG).filter(c=>CITY_CATALOG[c].region===r&&(!d||CITY_CATALOG[c].district===d)).sort((a,b)=>a.localeCompare(b,'uk'));
 for(const c of keys){const o=document.createElement('option');o.value=c;o.textContent=c;sel.append(o)}
 sel.hidden=!keys.length;sel.value=keys.includes(city)?city:'';
}
function selectArea(region,district=null,city=null){
 if(!regionNames.has(region))return;
 alertSounds.clearPending();
 $('region').value=region;
 const select=$('district-select');select.replaceChildren();
 const all=document.createElement('option');all.value='';all.textContent='Уся область / місто';select.append(all);
 const keys=Object.keys(BOUNDARY_PARENTS).filter(d=>BOUNDARY_PARENTS[d]===region).sort((a,b)=>a.localeCompare(b,'uk'));
 for(const d of keys){const o=document.createElement('option');o.value=d;o.textContent=d;select.append(o)}
 select.hidden=!keys.length;select.value=keys.includes(district)?district:'';cityOptions(city);
}
function getCityState(city,offline=stale()){
 const meta=CITY_CATALOG[city];if(!meta)return {status:'unknown'};
 const own=cities[city];const d=selectedZoneState(states,districts,BOUNDARY_PARENTS,meta.region,meta.district,offline);
 return civilCityState(states[meta.region],d,own,offline);
}
function selectedState(offline=stale()){const c=selectedCity();return c?getCityState(c,offline):selectedZoneState(states,districts,BOUNDARY_PARENTS,selected(),selectedDistrict(),offline)}
const cityLayer=map?L.layerGroup().addTo(map):null;
function renderCities(offline){
 if(!cityLayer)return;cityLayer.clearLayers();if(offline)return;
 for(const [c,meta] of Object.entries(CITY_CATALOG)){
  if(!cities[c]||cities[c].status==='unknown')continue;
  const effective=getCityState(c,false);
  const badge=civilMarkerContent(cities[c].status==='active'?cities[c]:{status:effective.status},TYPES);
  const m=L.marker([meta.lat,meta.lng],{icon:L.divIcon({className:'civil-status-marker',html:badge.el,iconSize:[badge.width,32],iconAnchor:[badge.width/2,16]}),title:c+' · оголошений статус міста'}).addTo(cityLayer);
  const label=document.createElement('span');label.textContent=c+' · '+badge.label+' · статус для міста (не місце загрози)';m.bindTooltip(label);
  m.on('click',()=>{ownLocation?.manualSelection();selectArea(meta.region,meta.district,c);render()});
 }
}
function regionStatusText(a){return a.status==='active'&&a.scope==='district'?'Тривога в частині області':view(a).label;}

function get(r){return states[r]||{status:'unknown'}}
function stale(){return failed||!updated||Date.now()-updated>120000||updated>Date.now()+60000}
function kind(a){return a.status==='active'?validType(a.threat_type):a.status==='ended'?'clear':'unknown'}
function view(a){return TYPES[kind(a)]||TYPES.general}
function format(ms){if(!Number.isFinite(ms)||ms<0)return '—';let s=Math.floor(ms/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':')}
function dateText(ms){return Number.isFinite(ms)?new Date(ms).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'}):'Час невідомий'}
function timer(){const a=selectedState();$('timer-value').textContent=a.status==='active'?format(Date.now()-a.started_at_ms):a.status==='ended'?format(a.ended_at_ms-a.started_at_ms):'—'}
function row(text,subtitle,color){const e=document.createElement('div');e.className='event';const main=document.createElement('div');main.textContent=text;main.style.color=color;const small=document.createElement('small');small.textContent=subtitle;e.append(main,small);return e}
function renderPublicAdvisories(offline){
 const panel=$('public-advisories'),list=$('advisory-icons');
 list.replaceChildren();
 const active=offline?[]:publicAdvisories;
 panel.hidden=!active.length;
 for(const type of active){
  const v=TYPES[type]||TYPES.general,chip=document.createElement('span');
  chip.className='advisory-chip';chip.style.setProperty('--advisory-color',v.color);
  chip.textContent=v.icon+' '+v.label;list.append(chip);
 }
}
function renderAreaReasons(offline){
 const panel=$('area-reasons'),list=$('area-reason-list');list.replaceChildren();
 const scope=selectedCity()?'city':selectedDistrict()?'district':'region',key=selectedCity()||selectedDistrict()||selected();
 const rows=offline?[]:cleanAreaAdvisories(areaAdvisories,states,districts,cities).filter(x=>x.scope===scope&&x.area_name===key);
 for(const x of rows){const v=TYPES[x.threat_type]||TYPES.general,previous=x.reported_as==='previous';const item=row(v.icon+' '+v.label,(previous?'Раніше зазначено, не підтверджено повторно · ':'Зазначено в оголошенні · ')+dateText(x.at_ms),v.color);if(previous)item.classList.add('previous-area-reason');list.append(item)}
 panel.hidden=!rows.length;
}
function render(){
 const offline=stale(),district=selectedDistrict(),city=selectedCity(),a=selectedState(offline),v=view(a),s=a.status,region=offline?{status:'unknown'}:get(selected());
 $('widget').className='theme-'+v.theme;
 $('status-text').textContent=!district&&s==='active'&&a.scope==='district'?'Тривога в частині області':v.label;
 $('status-badge').textContent=s==='active'?'АКТИВНА':s==='ended'?'ВІДБІЙ':'НЕВІДОМО';
 const activeIcons=s==='active'&&Array.isArray(a.threat_types)&&a.threat_types.length?a.threat_types.map(t=>(TYPES[t]||TYPES.general).icon).join(''):v.icon;
 $('threat-icon').textContent=activeIcons;$('threat-icon').className='icon anim-'+v.anim;
 $('threat-text').textContent=city||district||name(selected());
 const summary=$('region-summary');
 const ownRows=offline?[]:Object.values(districts).filter(x=>x.region===selected());
 const activeDistricts=ownRows.filter(x=>x.status==='active').length,endedDistricts=ownRows.filter(x=>x.status==='ended').length;
 const cityRows=offline?[]:Object.keys(cities).filter(c=>cities[c].region===selected());
 const cityActive=cityRows.filter(c=>getCityState(c,false).status==='active').length;
 summary.hidden=!city&&!district&&!ownRows.length&&!cityRows.length;
 summary.textContent=((district||city)?name(selected())+' · '+regionStatusText(region):'Окремі повідомлення районів і міст')+(ownRows.length?' · Тривога: '+activeDistricts+' · Відбій: '+endedDistricts:'');
 if(cityRows.length)summary.textContent+=' · Міста: '+cityRows.length+' · Тривога: '+cityActive;
 if(!city&&!district&&region.status==='unknown'&&(endedDistricts||cityRows.length))summary.textContent+=' · Відбій усієї області не підтверджено';

 const reasonUnknown=s==='active'&&kind(a)==='general';
 const multiLabels=s==='active'&&Array.isArray(a.threat_types)&&a.threat_types.length>1?a.threat_types.map(t=>(TYPES[t]||TYPES.general).label).join(' + '):v.label;
 const previousReason=reasonUnknown&&a.last_reported_threat_type&&Number.isFinite(a.last_reported_threat_at_ms)?' · Раніше зазначено: '+(TYPES[a.last_reported_threat_type]||TYPES.general).icon+' '+(TYPES[a.last_reported_threat_type]||TYPES.general).label+' ('+dateText(a.last_reported_threat_at_ms)+', не підтверджено повторно)':'';
 $('threat-caption').textContent=multiLabels+(reasonUnknown?' · Причину не вказано':'')+(!city&&!district&&s==='active'&&a.scope==='district'?' · частина області':'')+previousReason+(city?' · статус міста або ширшої території':'')+(!city&&district&&s!=='unknown'&&a===region?' · за статусом області':'');
 $('live-label').textContent=offline?'НЕАКТУАЛЬНО':s==='active'?'LIVE':'СТАТУС';$('mode').textContent=offline?'OFFLINE':'ONLINE';$('mode').dataset.online=String(!offline);
 $('updated').textContent=updated?'Зв’язок перевірено: '+dateText(updated):'Немає даних';
 $('active').textContent=offline?'—':Object.values(states).filter(a=>a.status==='active').length;
 $('known').textContent=offline?'—':Object.values(states).filter(a=>a.status!=='unknown').length;
 renderPublicAdvisories(offline);
 renderAreaReasons(offline);
 if(boundaryMap)boundaryMap.render({states,districts,offline,selected:selected(),selectedDistrict:district});
 if(trajectoryLayer)trajectoryLayer.setTrajectories(offline?[]:trajectories);
 renderCities(offline);
 const d=$('districts'),districtScroll=d.scrollTop;d.replaceChildren();
 if(!offline)Object.entries(districts).filter(([,x])=>x.region===selected()).sort((a,b)=>a[0].localeCompare(b[0],'uk')).forEach(([label,x])=>{const v=view(x);d.append(row((civilReasonBadges(x).map(b=>(TYPES[b.type]||TYPES.general).icon).join(' ')||v.icon)+' '+label,v.label+(civilReasonBadges(x).some(b=>b.previous)?' · є раніше зазначені причини':''),v.color))});
 if(!offline)Object.entries(cities).filter(([c,x])=>x.region===selected()).sort((a,b)=>a[0].localeCompare(b[0],'uk')).forEach(([c,x])=>{const state=getCityState(c,false),v=view(state),badges=civilReasonBadges(state).map(b=>(TYPES[b.type]||TYPES.general).icon).join(' ')||v.icon,item=row(badges+' '+c,v.label+' · місто',v.color);item.tabIndex=0;item.setAttribute('role','button');const choose=()=>{ownLocation?.manualSelection();selectArea(x.region,CITY_CATALOG[c].district,c);render()};item.onclick=choose;item.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}};d.append(item)});
 if(!d.children.length)d.textContent='Немає окремих актуальних оголошень для районів і міст';
 d.scrollTop=districtScroll;
 const feed=$('feed'),feedScroll=feed.scrollTop;feed.replaceChildren();const filter=$('filter').value;
 if(!offline)events.filter(x=>filter==='all'||kind(x)===filter||x.threat_types.includes(filter)).slice(0,20).forEach(x=>{const v=view(x),icons=x.threat_types.map(t=>(TYPES[t]||TYPES.general).icon).join(' ')||v.icon,labels=x.threat_types.length?x.threat_types.map(t=>(TYPES[t]||TYPES.general).label).join(' / '):v.label;feed.append(row(icons+' '+labels+' · '+(x.city||x.district||name(x.region)),dateText(x.at_ms)+(x.district?' · '+name(x.region):''),v.color))});
 if(!feed.children.length)feed.textContent='Немає актуальних повідомлень за цим фільтром';
 feed.scrollTop=feedScroll;
 $('notice').textContent=offline?(lastError?'API OFFLINE: '+lastError:'Немає актуального зв’язку'):'Статуси та напрямки руху цілей за повідомленнями підключених каналів. Невідомий статус не означає відбій.';
 timer();
}
const alertSounds=new AlertSounds({button:$('sound'),note:$('sound-note'),unlockButton:$('sound-unlock'),previewButton:$('sound-preview'),previewSelect:$('sound-preview-type'),documentRef:document,
 storage:(()=>{try{return window.localStorage}catch{return null}})(),contextFactory:()=>{const C=window.AudioContext||window.webkitAudioContext;return C?new C():null}});
alertSounds.unlock();
function clean(a){return {status:['active','ended','unknown'].includes(a?.status)?a.status:'unknown',scope:a?.scope==='district'?'district':null,threat_type:validType(a?.threat_type),threat_types:civilReasonList(a?.threat_types,a?.threat_type),last_reported_threat_types:civilReasonList(a?.last_reported_threat_types,a?.last_reported_threat_type),last_reported_threat_type:CIVIL_REASON_TYPES.concat(['mixed']).includes(a?.last_reported_threat_type)?a.last_reported_threat_type:null,last_reported_threat_at_ms:Number.isFinite(a?.last_reported_threat_at_ms)?a.last_reported_threat_at_ms:NaN,started_at_ms:Number.isFinite(a?.started_at_ms)?a.started_at_ms:NaN,ended_at_ms:Number.isFinite(a?.ended_at_ms)?a.ended_at_ms:NaN}}
const regionNames=new Set(regions.map(([r])=>r));
async function fetchAlerts(){const c=new AbortController(),timeout=setTimeout(()=>c.abort(),15000);try{const response=await fetch(API_URL,{cache:'no-store',signal:c.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json()}finally{clearTimeout(timeout)}}
async function refresh(){
 if(busy)return;busy=true;$('refresh').disabled=true;$('refresh').setAttribute('aria-busy','true');
 try{
  const data=await fetchAlerts();if(!Number.isFinite(data.updated_at_ms)||!data.regions||typeof data.regions!=='object'||Array.isArray(data.regions))throw Error('Некоректний JSON API');
  if(!data.updated_at_ms||Date.now()-data.updated_at_ms>120000||data.updated_at_ms>Date.now()+60000)throw Error('Дані API застаріли або час пристрою відрізняється');
  const previousArea=selectedState(false),previousPublic=publicAdvisories.slice(),next={};for(const [r] of regions)next[r]=clean(data.regions[r]);
  const nextDistricts={};if(data.districts&&typeof data.districts==='object'&&!Array.isArray(data.districts))for(const [d,x] of Object.entries(data.districts))if(x&&regionNames.has(x.region))nextDistricts[d]={...clean(x),region:x.region};
  const nextCities={};if(data.cities&&typeof data.cities==='object'&&!Array.isArray(data.cities))for(const [c,x] of Object.entries(data.cities)){const m=Object.prototype.hasOwnProperty.call(CITY_CATALOG,c)?CITY_CATALOG[c]:null;if(m&&x&&m.region===x.region&&m.district===x.district)nextCities[c]={...clean(x),region:m.region,district:m.district};}
  const nextEvents=Array.isArray(data.events)?data.events.filter(x=>x&&regionNames.has(x.region)&&['active','ended'].includes(x.status)&&Number.isFinite(x.at_ms)).map(x=>({...clean(x),region:x.region,district:typeof x.district==='string'?x.district:null,city:Object.prototype.hasOwnProperty.call(CITY_CATALOG,x.city)?x.city:null,at_ms:x.at_ms})).sort((a,b)=>b.at_ms-a.at_ms):[];
  const nextTrajectories=Array.isArray(data.trajectories)?data.trajectories.filter(t=>t&&Array.isArray(t.points)&&t.points.length>=2):[];
  publicAdvisories=Array.isArray(data.public_advisories)?[...new Set(data.public_advisories.map(x=>x?.threat_type).filter(x=>CIVIL_REASON_TYPES.includes(x)))]:[];
  areaAdvisories=cleanAreaAdvisories(data.area_advisories,next,nextDistricts,nextCities);
  states=next;districts=nextDistricts;cities=nextCities;events=nextEvents;trajectories=nextTrajectories;updated=data.updated_at_ms;failed=false;lastError='';
  const currentArea=selectedState(false);
  const sounds=warningSoundChanges(previousArea,currentArea,previousPublic,publicAdvisories);
  const allowed=[...soundTypes(currentArea),...publicAdvisories];
  if(currentArea.status==='ended')allowed.push('clear');
  alertSounds.notify(sounds,allowed);
 }catch(e){alertSounds.clearPending();failed=true;lastError=e.name==='AbortError'?'Час очікування API вичерпано':e instanceof TypeError?'Мережева помилка або CORS':String(e.message||e);console.error('[AIR MONITOR]',e)}finally{busy=false;$('refresh').disabled=false;$('refresh').setAttribute('aria-busy','false');render()}
}
selectArea(selected());
let ownLocation=null;
const boundaryMap=map?new CivilBoundaryMap(map,regions,TYPES,{onSelect:(r,d)=>{ownLocation?.manualSelection();selectArea(r,d);render()}}):null;
const trajectoryLayer=map&&typeof TelegramTrajectoryLayer!=='undefined'?new TelegramTrajectoryLayer(map,{pauseButton:$('traj-pause'),resetButton:$('traj-reset'),legendElement:$('traj-legend')}):null;
if(boundaryMap)boundaryMap.load();else $('geometry-status').textContent='Карта недоступна';
if(map&&boundaryMap){ownLocation=new OwnLocation(map,boundaryMap,tg,{parents:BOUNDARY_PARENTS,label:name,onSelect:(r,d)=>{selectArea(r,d);render();}});ownLocation.start();}else{$('locate').disabled=true;$('location-status').textContent='Карта недоступна';}
$('region').onchange=()=>{ownLocation?.manualSelection();selectArea(selected());render();};$('district-select').onchange=()=>{alertSounds.clearPending();ownLocation?.manualSelection();cityOptions();render();};$('city-select').onchange=()=>{alertSounds.clearPending();ownLocation?.manualSelection();render();};$('filter').onchange=render;$('refresh').onclick=refresh;refresh();setInterval(timer,1000);setInterval(refresh,15000);setInterval(render,30000);
