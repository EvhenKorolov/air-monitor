'use strict';
/* The visitor's own location, used only in the open page. */
function ringContains(ring,x,y){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [a,b]=ring[j],[c,d]=ring[i];
  const dx=c-a,dy=d-b;
  if((dx!==0||dy!==0)&&Math.abs((x-a)*dy-(y-b)*dx)<1e-10&&x>=Math.min(a,c)-1e-10&&x<=Math.max(a,c)+1e-10&&y>=Math.min(b,d)-1e-10&&y<=Math.max(b,d)+1e-10)return 2;
  if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
 }
 return inside?1:0;
}
function geometryContains(geometry,lat,lon){
 if(!geometry)return false;
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
 return polygons.some(rings=>rings.length&&ringContains(rings[0],lon,lat)>0&&!rings.slice(1).some(r=>ringContains(r,lon,lat)>0));
}
function localArea(boundaries,lat,lon,parents){
 if(!boundaries)return null;
 const hits=collection=>[...collection].filter(([,layers])=>layers.some(l=>geometryContains(l.feature?.geometry,lat,lon))).map(([k])=>k);
 let oblasts=hits(boundaries.oblasts),districts=hits(boundaries.raions);
 // Separately administered cities take precedence over overlapping oblast geometries.
 const cities=oblasts.filter(k=>k.startsWith('м.'));
 if(cities.length===1)return {region:cities[0],district:null};
 if(oblasts.length>1)return null;
 if(oblasts.length===1){const region=oblasts[0];districts=districts.filter(k=>parents[k]===region);return {region,district:districts.length===1?districts[0]:null};}
 const regions=[...new Set(districts.map(k=>parents[k]).filter(Boolean))];
 return regions.length===1?{region:regions[0],district:districts.length===1?districts[0]:null}:null;
}
function validLocation(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}
class OwnLocation{
 constructor(map,boundaries,tg,{onSelect,parents,label}){
  this.map=map;this.boundaries=boundaries;this.tg=tg;this.onSelect=onSelect;this.parents=parents;this.label=label;
  this.button=document.getElementById('locate');this.stopButton=document.getElementById('location-stop');this.status=document.getElementById('location-status');this.privacy=document.getElementById('location-privacy');
  this.enabled=false;this.token=0;this.watch=null;this.interval=null;this.pending=null;this.fix=null;this.marker=null;this.circle=null;this.focusPending=false;this.fallbackFocused=false;this.settingsNeeded=false;this.native=null;
  map.createPane('ownAccuracy');map.getPane('ownAccuracy').style.zIndex=440;map.getPane('ownAccuracy').style.pointerEvents='none';
  map.createPane('ownPosition');map.getPane('ownPosition').style.zIndex=650;map.getPane('ownPosition').style.pointerEvents='none';
  this.button.onclick=()=>this.locate();this.stopButton.onclick=()=>this.stop();
  map.on('civilboundariesloaded',()=>{if(this.fix)this.resolveArea()});
  map.on('dragstart',()=>this.manualSelection());
  document.addEventListener('visibilitychange',()=>{if(!this.enabled)return;if(document.hidden){this.pause();if(this.fix)this.setStatus('Остання відома позиція · оновиться після повернення');}else this.resume();});
  window.addEventListener('pagehide',()=>this.stop(false));
 }
 setStatus(text){this.status.textContent=text;}
 busy(value){this.button.setAttribute('aria-busy',String(value));}
 start(){
  if(this.enabled)return;
  this.enabled=true;this.token++;this.focusPending=true;this.fallbackFocused=false;this.settingsNeeded=false;this.stopButton.hidden=false;this.busy(true);this.setStatus('Запитуємо доступ до геопозиції…');
  const manager=this.tg?.LocationManager;
  // Telegram's native prompt is preferred; an explicit denial is never bypassed.
  if(this.tg?.initData&&this.tg?.isVersionAtLeast?.('8.0')&&manager&&typeof manager.init==='function'){
   this.native=manager;const token=this.token;
   this.pending=setTimeout(()=>{if(this.enabled&&token===this.token){this.pending=null;this.busy(false);this.setStatus('Telegram не відповів. Спробуйте ще раз.');}},15000);
   try{manager.init(()=>{if(!this.enabled||token!==this.token)return;clearTimeout(this.pending);this.pending=null;
    if(manager.isAccessRequested&&!manager.isAccessGranted){this.denied(true);return;}
    if(!manager.isLocationAvailable){this.native=null;this.browser();return;}
    this.nativeRequest();
   });}catch{clearTimeout(this.pending);this.pending=null;this.native=null;this.browser();}
  }else this.browser();
 }
 nativeRequest(){
  if(!this.enabled||document.hidden||this.pending!==null)return;
  const token=this.token,manager=this.native;
  if(!manager?.isLocationAvailable){this.error('Геолокація недоступна.');return;}
  if(manager.isAccessRequested&&!manager.isAccessGranted){this.denied(true);return;}
  this.busy(!this.fix);
  // Ignore late callbacks after a timeout, stop, or new request.
  const request={};this.nativeRequestId=request;
  this.pending=setTimeout(()=>{if(this.nativeRequestId!==request)return;this.nativeRequestId=null;this.pending=null;this.error('Не вдалося отримати геопозицію. Спробуйте ще раз.');},18000);
  try{manager.getLocation(data=>{
   if(!this.enabled||token!==this.token||this.nativeRequestId!==request)return;
   clearTimeout(this.pending);this.pending=null;this.nativeRequestId=null;
   if(!data){if(!manager.isAccessGranted)this.denied(true);else this.error('Не вдалося отримати геопозицію.');return;}
   this.accept(data.latitude,data.longitude,data.horizontal_accuracy);
   if(this.enabled&&manager.isAccessGranted&&this.interval===null&&!document.hidden)this.interval=setInterval(()=>this.nativeRequest(),30000);
  });}catch{clearTimeout(this.pending);this.pending=null;this.nativeRequestId=null;this.error('Геолокація Telegram недоступна.');}
 }
 browser(){
  if(!this.enabled||document.hidden||this.watch!==null)return;
  if(!navigator.geolocation){this.error('Цей браузер не підтримує геолокацію.');return;}
  const token=this.token;this.busy(!this.fix);
  try{this.watch=navigator.geolocation.watchPosition(p=>{if(this.enabled&&token===this.token&&!document.hidden)this.accept(p.coords.latitude,p.coords.longitude,p.coords.accuracy);},e=>{
   if(!this.enabled||token!==this.token)return;
   if(e.code===1)this.denied(false);else this.error(e.code===3?'Час очікування GPS вичерпано.':'Не вдалося визначити геопозицію.');
  },{enableHighAccuracy:false,timeout:15000,maximumAge:10000});}catch{this.error('Геолокація недоступна.');}
 }
 accept(lat,lon,accuracy){
  if(!validLocation(lat,lon)){this.error('Некоректні дані GPS.');return;}
  if(document.hidden)return;
  const acc=Number.isFinite(accuracy)&&accuracy>=0?accuracy:null;
  this.fix={lat,lon,accuracy:acc};this.busy(false);this.settingsNeeded=false;
  const pos=[lat,lon];
  if(!this.marker){const icon=L.divIcon({className:'own-location-icon',html:'<span class="own-location-dot"></span>',iconSize:[22,22],iconAnchor:[11,11]});this.marker=L.marker(pos,{icon,pane:'ownPosition',interactive:false,keyboard:false}).addTo(this.map);}
  else this.marker.setLatLng(pos);
  if(acc!==null){if(!this.circle)this.circle=L.circle(pos,{radius:acc,pane:'ownAccuracy',interactive:false,color:'#64aaff',weight:1,fillColor:'#439aff',fillOpacity:.10}).addTo(this.map);else this.circle.setLatLng(pos).setRadius(acc);}
  else if(this.circle){this.circle.remove();this.circle=null;}
  this.resolveArea();
 }
 resolveArea(){
  const f=this.fix;if(!f)return;
  const area=localArea(this.boundaries,f.lat,f.lon,this.parents),acc=f.accuracy===null?'точність невідома':'± '+(f.accuracy>=1000?(f.accuracy/1000).toFixed(1)+' км':Math.round(f.accuracy)+' м');
  this.setStatus(area?'Ви тут: '+this.label(area.region)+(area.district?' · '+area.district:'')+' · '+acc:(this.boundaries?.loading?'Геопозицію отримано · очікуємо межі':'Геопозицію отримано · область не визначено')+' · '+acc);
  if(this.focusPending&&area){this.focusPending=false;this.onSelect(area.region,area.district);this.focus(area);}
  else if(this.focusPending&&!this.boundaries?.loading&&!this.fallbackFocused){this.fallbackFocused=true;this.focus(null);}
 }
 focus(area){
  const f=this.fix;if(!f)return;const layers=area?(this.boundaries?.oblasts.get(area.region)||[]):[];
  if(layers.length){const bounds=L.latLngBounds([]);for(const layer of layers)bounds.extend(layer.getBounds());bounds.extend([f.lat,f.lon]);if(bounds.isValid()){this.map.fitBounds(bounds,{padding:[18,18],maxZoom:10,animate:false});return;}}
  this.map.setView([f.lat,f.lon],Math.max(8,Math.min(this.map.getZoom(),10)),{animate:false});
 }
 locate(){
  if(this.settingsNeeded&&this.native){try{this.native.openSettings();this.setStatus('Дозвольте доступ у налаштуваннях Telegram, потім натисніть кнопку ще раз.');this.settingsNeeded=false;}catch{this.setStatus('Відкрийте налаштування геолокації Telegram.');}return;}
  if(this.fix){const f=this.fix,area=localArea(this.boundaries,f.lat,f.lon,this.parents);if(area)this.onSelect(area.region,area.district);this.focus(area);if(this.native)this.nativeRequest();return;}
  this.stop(false);this.start();
 }
 manualSelection(){this.focusPending=false;}
 pause(){
  if(this.watch!==null){navigator.geolocation.clearWatch(this.watch);this.watch=null;}
  if(this.interval!==null){clearInterval(this.interval);this.interval=null;}
  if(this.pending!==null){clearTimeout(this.pending);this.pending=null;}
  this.nativeRequestId=null;
 }
 resume(){if(this.native){if(this.native.isInited&&!(this.native.isAccessRequested&&!this.native.isAccessGranted))this.nativeRequest();}else this.browser();}
 error(text){this.busy(false);this.setStatus(text+(this.fix?' Остання відома позиція.':''));}
 denied(native){this.pause();this.enabled=false;this.token++;this.focusPending=false;this.removePosition();this.busy(false);this.settingsNeeded=native;this.stopButton.hidden=true;this.setStatus(native?'Доступ заборонено. Натисніть кнопку для налаштувань.':'Доступ заборонено. Дозвольте геолокацію в налаштуваннях браузера.');}
 removePosition(){if(this.marker)this.marker.remove();if(this.circle)this.circle.remove();this.marker=this.circle=this.fix=null;}
 stop(show=true){this.pause();this.enabled=false;this.token++;this.focusPending=false;this.settingsNeeded=false;this.native=null;this.removePosition();this.stopButton.hidden=true;this.busy(false);if(show)this.setStatus('Геолокацію вимкнено. Оберіть область вручну.');}
}
if(typeof module!=='undefined')module.exports={ringContains,geometryContains,localArea,validLocation,OwnLocation};
