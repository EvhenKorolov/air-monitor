'use strict';
const CIVIL_REASON_TYPES=['drone','jet_uav','molniya','banderol','missile','ballistic','kab'];
function civilReasonList(values,fallback){
 const arr=Array.isArray(values)?values:[fallback];
 return CIVIL_REASON_TYPES.filter(x=>arr.includes(x));
}
function civilReasonBadges(state,now=Date.now()){
 if(!state||state.status!=='active')return [];
 const current=civilReasonList(state.threat_types,state.threat_type);
 if(current.length)return current.map(type=>({type,previous:false}));
 if(state.scope==='district')return [];
 const at=state.last_reported_threat_at_ms;
 const previous=Number.isFinite(at)&&now>=at&&now-at<=900000?civilReasonList(state.last_reported_threat_types,state.last_reported_threat_type):[];
 return [{type:'general',previous:false},...previous.map(type=>({type,previous:true}))];
}
function civilMarkerContent(state,types,now=Date.now()){
 const entries=civilReasonBadges(state,now);
 if(!entries.length)entries.push({type:state?.status==='ended'?'clear':state?.status==='active'?'general':'unknown',previous:false});
 const el=document.createElement('span');el.className='civil-badge-group';
 for(const item of entries){const t=types[item.type]||types.general,b=document.createElement('span');b.className='civil-status-badge'+(item.previous?' previous-reason':'');b.style.setProperty('--status-color',t.color);b.textContent=t.icon;b.title=(item.previous?'Раніше зазначено: ':'')+t.label;el.append(b)}
 return {el,width:32*entries.length+3*(entries.length-1),label:entries.map(x=>(x.previous?'Раніше зазначено (не підтверджено повторно): ':'')+(types[x.type]||types.general).label).join(' · ')};
}
function cleanAreaAdvisories(rows,states,districts,cities,now=Date.now()){
 if(!Array.isArray(rows))return [];
 const tables={region:states,district:districts,city:cities},out=[],seen=new Set();
 for(const x of rows){if(!x||!Object.prototype.hasOwnProperty.call(tables,x.scope)||!CIVIL_REASON_TYPES.includes(x.threat_type)||!['current','previous'].includes(x.reported_as)||!Number.isFinite(x.at_ms)||now-x.at_ms<0||now-x.at_ms>900000)continue;
  const table=tables[x.scope],s=Object.prototype.hasOwnProperty.call(table,x.area_name)?table[x.area_name]:null;
  if(!s||s.status!=='active'||s.scope==='district'||(x.scope==='region'?x.area_name:s.region)!==x.region)continue;
  if(s.last_reported_threat_at_ms!==x.at_ms||!civilReasonBadges(s,now).some(b=>b.type===x.threat_type&&b.previous===(x.reported_as==='previous')))continue;
  const key=JSON.stringify([x.scope,x.area_name,x.threat_type]);if(seen.has(key))continue;seen.add(key);
  out.push({scope:x.scope,area_name:x.area_name,region:x.region,threat_type:x.threat_type,at_ms:x.at_ms,reported_as:x.reported_as});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={civilReasonList,civilReasonBadges,cleanAreaAdvisories};
