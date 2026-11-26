'use strict';
/* Administrative boundaries only. No target locations or paths. */
const BOUNDARY_SOURCE = 'https://raw.githubusercontent.com/Astaryon/UA_geojson/main/';
const UNKNOWN_ZONE = Object.freeze({status:'unknown'});
function boundaryNorm(value){return String(value).normalize('NFKC').toLowerCase().replace(/[’ʼ‘`]/g,"'").replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ').trim();}
function boundaryAliasIndex(regionKeys,parents,renames){
 const index=new Map();
 const put=(label,key)=>{const n=boundaryNorm(label);if(!index.has(n))index.set(n,new Set());index.get(n).add(key)};
 for(const key of regionKeys){put(key,key);if(!key.startsWith('м.')&&key!=='АР Крим'){put(key+' область',key);put(key+' обл.',key);put(key+' обл',key);}}
 for(const [label,key] of Object.entries({'Автономна Республіка Крим':'АР Крим','АРК':'АР Крим','Крим':'АР Крим','Київ':'м. Київ','місто Київ':'м. Київ','м.Київ':'м. Київ','Севастополь':'м. Севастополь','місто Севастополь':'м. Севастополь','м.Севастополь':'м. Севастополь'}))put(label,key);
 for(const district of Object.keys(parents)){put(district,district);put(district.replace(/ район$/,''),district);put(district.replace(/ район$/,' р-н'),district);}
 for(const [old,key] of Object.entries(renames)){put(old,key);put(old.replace(/ район$/,''),key);}
 return index;
}
function matchBoundary(feature,index,allowed){
 // Source property names vary. Prefer exact name properties, never substring matching.
 const properties=feature?.properties||{};
 const fields=Object.entries(properties).filter(([,v])=>typeof v==='string');
 const tiers=[fields.filter(([k])=>/^(name(:uk|_uk)?|назва|name_ua|adm[12]_ua|adm[12]_uk|nameuk|nameua|rayon|raion|region|oblast)$/i.test(k)),fields];
 for(const tier of tiers){const found=new Set();for(const [,v] of tier){for(const key of index.get(boundaryNorm(v))||[])if(allowed.has(key))found.add(key)}if(found.size===1)return [...found][0];if(found.size>1)return null;}
 return null;
}
function zoneState(regionState,districtState,offline){
 if(offline)return UNKNOWN_ZONE;
 if(!regionState||regionState.status==='unknown')return districtState||UNKNOWN_ZONE;
 if(regionState.scope==='district')return districtState||UNKNOWN_ZONE;
 if(regionState.status==='active'){
  // A district all-clear does not cancel an explicit oblast-wide alert.
  return districtState?.status==='active'?districtState:regionState;
 }
 return districtState||regionState;
}
function selectedZoneState(states,districts,parents,region,district,offline){
 const regionState=states[region]||UNKNOWN_ZONE;
 if(offline)return UNKNOWN_ZONE;
 if(!district||parents[district]!==region)return regionState;
 const explicit=districts[district]?.region===region?districts[district]:null;
 return zoneState(regionState,explicit,false);
}
function oblastState(state,offline){return offline||!state||state.scope==='district'?UNKNOWN_ZONE:state;}
async function boundaryFetch(file){
 const urls=['data/'+file,BOUNDARY_SOURCE+file];
 let last;
 for(const url of urls){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),18000);try{
  const response=await fetch(url,{signal:controller.signal,cache:'default'});if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Invalid GeoJSON');return data;
 }catch(e){last=e;}finally{clearTimeout(timeout)}}
 throw last||Error('GeoJSON unavailable');
}
class CivilBoundaryMap{
 constructor(map,regions,types,{onSelect}){
  this.map=map;this.regions=regions;this.types=types;this.onSelect=onSelect;
  this.regionKeys=new Set(regions.map(([r])=>r));this.districtKeys=new Set(Object.keys(BOUNDARY_PARENTS));
  this.index=boundaryAliasIndex(this.regionKeys,BOUNDARY_PARENTS,BOUNDARY_RENAMES);
  this.statusIcons=L.layerGroup().addTo(map);this.oblasts=new Map();this.raions=new Map();this.markers=new Map();this.data={states:{},districts:{},offline:true,selected:null};this.loaded={oblast:false,district:false};this.loading=false;
  map.createPane('oblastAreas');map.getPane('oblastAreas').style.zIndex=410;
  map.createPane('districtAreas');map.getPane('districtAreas').style.zIndex=420;
  this.renderers={oblast:L.svg({pane:'oblastAreas',padding:.25}),district:L.svg({pane:'districtAreas',padding:.25})};
  map.attributionControl.addAttribution('<a href="https://github.com/Astaryon/UA_geojson">UA_geojson</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>');
  this.status=document.getElementById('geometry-status');this.retry=document.getElementById('geometry-retry');this.retry.onclick=()=>this.load();
  const pulse=document.getElementById('pulse-toggle');let on=!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const apply=()=>{map.getContainer().classList.toggle('no-zone-pulse',!on);pulse.setAttribute('aria-pressed',String(on));pulse.textContent=on?'Пульсація: увімк.':'Пульсація: вимк.'};pulse.onclick=()=>{on=!on;apply()};apply();
  for(const [r,lat,lon] of regions){const m=L.circleMarker([lat,lon],{radius:6,color:'#8693a5',fillOpacity:.45,weight:2}).addTo(map);m.on('click',()=>onSelect(r));this.markers.set(r,m)}
 }
 type(a){return a.status==='active'?(this.types[a.threat_type]||this.types.general):a.status==='ended'?this.types.clear:this.types.unknown;}
 label(r){return r.startsWith('м.')||r==='АР Крим'?r:r+' область';}
 async load(){
  if(this.loading)return;this.loading=true;this.retry.hidden=true;this.status.textContent='Завантаження меж…';
  const tasks=[['oblast','regiony.geojson',this.regionKeys,this.oblasts],['district','rayony.geojson',this.districtKeys,this.raions]];
  await Promise.all(tasks.map(async ([level,file,allowed,collection])=>{
   if(this.loaded[level])return;
   try{const geo=await boundaryFetch(file);let count=0;
    for(const f of geo.features){if(!['Polygon','MultiPolygon'].includes(f?.geometry?.type))continue;const key=matchBoundary(f,this.index,allowed);if(!key)continue;
     const parent=level==='district'?BOUNDARY_PARENTS[key]:key;
     const group=L.geoJSON(f,{pane:level==='district'?'districtAreas':'oblastAreas',renderer:this.renderers[level],style:{color:'#8693a5',fillOpacity:0,weight:1},onEachFeature:(_,layer)=>{layer.on('click',()=>this.onSelect(parent,level==='district'?key:null));layer.bindTooltip(document.createElement('span'),{sticky:true});}}).addTo(this.map);
     if(!collection.has(key))collection.set(key,[]);group.eachLayer(layer=>collection.get(key).push(layer));count++;
    }
    if(!count)throw Error('No matching boundary names');this.loaded[level]=true;
   }catch(e){console.warn('[AIR MONITOR boundaries]',level,e);}
  }));
  this.loading=false;this.retry.hidden=this.loaded.oblast&&this.loaded.district;this.render(this.data);this.map.fire('civilboundariesloaded');
 }
 paint(layer,state,{selected=false,district=false,outline=false,label=''}){
  const type=this.type(state),active=state.status==='active'&&!outline;
  layer.setStyle({color:outline?'#95a7b8':type.color,fillColor:type.color,weight:selected?2:district?0.8:1.6,opacity:outline?.35:.85,fillOpacity:outline?0:active?.40:state.status==='ended'?.19:.09,dashArray:state.status==='unknown'&&!outline?'3 3':null});
  const el=layer.getElement();if(el){el.classList.toggle('civil-zone-active',active);el.classList.toggle('civil-zone-ballistic',active&&state.threat_type==='ballistic');el.style.setProperty('--zone-color',type.color);}
  const text=document.createElement('span');text.textContent=label+' · '+(outline?(state.status==='unknown'?'Немає окремих актуальних даних':type.label+' (статус області)'):type.label);layer.setTooltipContent(text);
 }
 render(data){
  this.data=data;const {states,districts,offline,selected}=data;
  this.statusIcons.clearLayers();
  for(const [key,layers] of this.oblasts){const state=oblastState(states[key],offline);for(const l of layers)this.paint(l,state,{selected:key===selected,label:this.label(key)});}
  for(const [key,layers] of this.raions){const parent=BOUNDARY_PARENTS[key],region=states[parent]||UNKNOWN_ZONE,explicit=districts[key]?.region===parent?districts[key]:null;
   const state=selectedZoneState(states,districts,BOUNDARY_PARENTS,parent,key,offline);
   // Only actual district declarations add a fill above the oblast layer. Inherited statuses use the oblast fill.
   const own=!offline&&explicit&&!(region.status==='active'&&region.scope!=='district'&&explicit.status!=='active');
   // If the parent geometry is absent, the known district polygon can still display its inherited state.
   const outline=!own&&this.oblasts.has(parent);
   for(const l of layers)this.paint(l,state,{district:true,outline,label:key,selected:key===data.selectedDistrict});
  }
  // Missing boundaries: preserve a clearly labelled point fallback, never colour the entire oblast for a partial alert.
  for(const [key,m] of this.markers){const region=offline?UNKNOWN_ZONE:states[key]||UNKNOWN_ZONE;
   const missingPartial=!offline&&region.scope==='district'&&!Object.entries(districts).some(([d,s])=>s.region===key&&s.status==='active'&&this.raions.has(d));
   const show=!this.oblasts.has(key)||missingPartial;if(show&&!this.map.hasLayer(m))m.addTo(this.map);else if(!show&&this.map.hasLayer(m))m.remove();
   if(show){const t=this.type(region);m.setStyle({color:t.color,fillColor:t.color,fillOpacity:.30,dashArray:'3 3'});const text=document.createElement('span');text.textContent=this.label(key)+' · '+t.label+' · межі недоступні, умовна позначка';if(!m.getTooltip())m.bindTooltip(text);else m.setTooltipContent(text);}
  }
  if(!offline){
   const badge=(point,state,label,select)=>{
    if(state?.status!=='active'||state.scope==='district')return;
    const t=this.type(state),el=document.createElement('span');el.className='civil-status-badge';el.style.setProperty('--status-color',t.color);el.textContent=t.icon;
    const marker=L.marker(point,{icon:L.divIcon({className:'civil-status-marker',html:el,iconSize:[32,32],iconAnchor:[16,16]}),title:label+' · оголошений статус території'}).addTo(this.statusIcons);
    const tip=document.createElement('span');tip.textContent=label+' · '+t.label+' · статус території, не місце загрози';marker.bindTooltip(tip);marker.on('click',select);
   };
   for(const [key,lat,lon] of this.regions)badge([lat,lon],oblastState(states[key],false),this.label(key),()=>this.onSelect(key));
   for(const [key,layers] of this.raions){const state=districts[key];if(!state||!layers.length||state.region!==BOUNDARY_PARENTS[key])continue;
    // Place a label at the administrative polygon centre; never use message coordinates.
    const bounds=layers[0].getBounds();if(bounds.isValid())badge(bounds.getCenter(),state,key,()=>this.onSelect(state.region,key));
   }
  }
  const missing=offline?0:Object.entries(districts).filter(([key,v])=>v.status==='active'&&!this.raions.has(key)).length;
  if(!this.loading)this.status.textContent=`Межі: ${this.oblasts.size}/${this.regionKeys.size} областей · ${this.raions.size}/${this.districtKeys.size} районів`+(missing?` · ${missing} активних районів без контуру`:'')+(!this.loaded.oblast||!this.loaded.district?' · частина меж недоступна':'');
 }
}
if(typeof module!=='undefined')module.exports={boundaryNorm,boundaryAliasIndex,matchBoundary,zoneState,oblastState,selectedZoneState};
