/* global L */
import {prepare,connections,fhrSchools,nearestConnections,distanceCsv,routeKey} from './model.js?v=0.2.0-experiment.3';
import {Routing} from './routing.js?v=0.2.0-experiment.3';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const state={province:'',cbo:'',mode:'straight',showFhr:false,school:''};
const routing=new Routing();
let model,map,markerLayer,lineLayer,controller,routeController,revision=0;
let active=[],roads=new Map(),currentRoute=null,exporting=false,downloadUrl=null;
function status(text=''){$('status').textContent=text;$('status').hidden=!text;}
function cbos(){return model.cbos.filter(c=>!state.province||c.province===state.province);}
function cboOptions(){
  const available=cbos().sort((a,b)=>a.name.localeCompare(b.name));
  if(!available.some(c=>c.id===state.cbo))state.cbo='';
  $('cbo').replaceChildren(new Option('All CBOs',''),...available.map(c=>new Option(c.name,c.id)));$('cbo').value=state.cbo;
}
function focus(id){state.cbo=id;state.province=model.sites.get(id).province;$('province').value=state.province;cboOptions();refresh(true);}
function popup(site,assigned){
  const box=node('div','');box.append(node('strong',site.name),node('p',`${site.kind} · ${site.province}`));
  if(assigned)box.append(node('p',`Assigned CBO: ${assigned.name}`));
  if(site.kind==='CBO'){const button=node('button','Focus on this CBO');button.onclick=()=>focus(site.id);box.append(button);}
  return box;
}
function shownCbos(){return cbos().filter(c=>!state.cbo||c.id===state.cbo);}
function markers(){
  markerLayer.clearLayers();
  for(const c of shownCbos())L.circleMarker([c.latitude,c.longitude],{radius:10,color:'#fff',weight:2,fillColor:model.colors.get(c.id),fillOpacity:1})
    .bindPopup(popup(c)).bindTooltip(node('span',c.name)).addTo(markerLayer);
  const winners=new Map(active.map(l=>[l.school_id,l]));
  // Show unresolved/unreachable schools neutrally in the overview; never use straight winners in road mode.
  const schools=[...model.sites.values()].filter(s=>s.kind==='DBE'&&(!state.province||s.province===state.province)&&(!state.cbo||winners.has(s.id)));
  for(const s of schools){
    const l=winners.get(s.id),c=l&&model.sites.get(l.cbo_id),color=c?model.colors.get(c.id):'#86929b';
    const label=`${s.name}${c?' · '+c.name:' · road allocation unavailable or loading'}`;
    L.circleMarker([s.latitude,s.longitude],{radius:s.id===state.school?6:4,color,weight:1,fillColor:color,fillOpacity:.95})
      .bindTooltip(node('span',label)).on('click',()=>l?selectSchool(s.id):status('No complete road allocation is available for this school.')).addTo(markerLayer);
  }
  if(state.showFhr)for(const c of shownCbos())for(const s of fhrSchools(model,c.id)){
    const color=model.colors.get(c.id),icon=L.divIcon({className:'school-icon',html:`<span class="school-dot fhr" style="--cbo:${color}"></span>`,iconSize:[10,10],iconAnchor:[5,5]});
    L.marker([s.latitude,s.longitude],{icon}).bindPopup(popup(s,c)).bindTooltip(node('span',s.name)).addTo(markerLayer);
  }
  $('fhr-key').hidden=!state.showFhr;
  $('legend').replaceChildren();
  for(const c of shownCbos()){
    const button=node('button',c.name);button.className='legend-row';
    const swatch=node('i','');swatch.className='swatch';swatch.style.background=model.colors.get(c.id);
    button.prepend(swatch);button.onclick=()=>focus(c.id);$('legend').append(button);
  }
}
function measurement(l){return state.mode==='straight'?l.distance_km:roads.get(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)))?.distance_km??Infinity;}
function render(){
  active=nearestConnections(model,state,roads);lineLayer.clearLayers();
  if(state.mode==='straight')for(const l of active){
    const c=model.sites.get(l.cbo_id),s=model.sites.get(l.school_id),selected=s.id===state.school;
    L.polyline([[c.latitude,c.longitude],[s.latitude,s.longitude]],{color:model.colors.get(c.id),weight:selected?3:1.5,opacity:selected ? .9 : .5})
      .bindTooltip(node('span',`${s.name} → ${c.name}: ${l.distance_km.toFixed(1)} km`)).on('click',()=>selectSchool(s.id)).addTo(lineLayer);
  }
  else if(currentRoute){const l=active.find(l=>l.school_id===state.school);if(l)L.geoJSON(currentRoute.geometry,{style:{color:model.colors.get(l.cbo_id),weight:3,opacity:.85}}).addTo(lineLayer);}
  markers();
  $('straight').setAttribute('aria-pressed',String(state.mode==='straight'));$('road').setAttribute('aria-pressed',String(state.mode==='road'));
  $('road-help').hidden=state.mode!=='road';
  $('caption').textContent=`${state.cbo?model.sites.get(state.cbo).name:state.province||'All provinces'} · nearest CBO by ${state.mode==='road'?'road':'straight-line'} distance`;
  $('school-list').replaceChildren();
  for(const l of [...active].sort((a,b)=>measurement(a)-measurement(b))){
    const s=model.sites.get(l.school_id),c=model.sites.get(l.cbo_id),r=roads.get(routeKey(c,s));
    const row=node('div','');row.className=`school-row${s.id===state.school?' selected':''}`;
    const button=node('button',s.name);button.append(node('small',c.name));button.onclick=()=>selectSchool(s.id);
    const value=node('span',`${measurement(l).toFixed(1)} km`);value.className='distance';
    if(state.mode==='road'&&r?.status==='check_access')value.append(node('small','check road access'));
    row.append(button,value);$('school-list').append(row);
  }
  if(!active.length)$('school-list').append(node('p',state.mode==='road'?'No complete road allocations in this view.':'No nearest DBE connections in this view.'));
}
function fit(){
  const sites=[...shownCbos(),...active.map(l=>model.sites.get(l.school_id)),...(state.showFhr?shownCbos().flatMap(c=>fhrSchools(model,c.id)):[])];
  if(sites.length)map.fitBounds(sites.map(s=>[s.latitude,s.longitude]),{padding:[45,45],maxZoom:13});
}
async function selectSchool(id){
  routeController?.abort();routeController=new AbortController();const signal=routeController.signal,run=revision;
  const l=active.find(l=>l.school_id===id);if(!l)return;
  state.school=id;currentRoute=null;render();
  const c=model.sites.get(l.cbo_id),s=model.sites.get(id);
  if(c.province!==s.province)return;
  if(state.mode==='straight'){map.fitBounds([[c.latitude,c.longitude],[s.latitude,s.longitude]],{padding:[55,55],maxZoom:14});status();return;}
  status(`Loading road path for ${s.name}…`);
  try{
    const result=await routing.get(c,s,signal);
    if(signal.aborted||run!==revision||state.mode!=='road')return;
    // Preserve the complete matrix used for allocation; geometry retrieval does not change winners.
    currentRoute=result;render();map.fitBounds(result.geometry.coordinates.map(([lon,lat])=>[lat,lon]),{padding:[50,50],maxZoom:14});
    status(result.status==='check_access'?'Check road access: a location is more than 250 metres from the mapped road.':'');
  }catch(error){if(!signal.aborted&&run===revision)status(`Road path unavailable: ${error.message}`);}
}
async function loadRoads(signal,run){
  const provinces=[...new Set(connections(model,{province:state.province}).map(l=>model.sites.get(l.cbo_id).province))];
  for(let i=0;i<provinces.length;i++){
    if(signal.aborted||run!==revision)return;
    const province=provinces[i],candidates=connections(model,{province});
    const schools=[...new Set(candidates.map(l=>l.school_id))].map(id=>model.sites.get(id));
    const facilities=model.cbos.filter(c=>c.province===province);
    status(`Loading road comparisons: ${province} (${i+1}/${provinces.length})…`);
    const matrix=await routing.matrix(facilities,schools,signal);
    if(signal.aborted||run!==revision)return;
    for(const [key,value] of matrix)roads.set(key,value);
    if(state.mode==='road')render();
  }
}
async function refresh(autoFit=false){
  controller?.abort();routeController?.abort();controller=new AbortController();const signal=controller.signal,run=++revision;
  state.school='';currentRoute=null;$('download').hidden=true;render();if(autoFit)fit();
  if(state.mode==='straight'){status();return;}
  try{await loadRoads(signal,run);if(signal.aborted||run!==revision)return;render();if(autoFit)fit();status('Select a DBE school to view its road path.');}
  catch(error){if(!signal.aborted&&run===revision)status(`Road comparisons incomplete: ${error.message}. Unresolved schools have no road allocation.`);}
}
async function exportView(){
  if(exporting)return;exporting=true;$('export').disabled=true;
  controller?.abort();routeController?.abort();controller=new AbortController();const signal=controller.signal,run=++revision;
  try{
    await loadRoads(signal,run);if(signal.aborted||run!==revision)return;
    const csv=distanceCsv(model,{province:state.province,cbo:state.cbo},roads);
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);
    downloadUrl=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=$('download');a.href=downloadUrl;a.hidden=false;a.click();
    status(`CSV ready: ${csv.split('\r\n').length-1} comparisons with both distances and nearest-CBO indicators.`);
  }catch(error){if(!signal.aborted&&run===revision)status(`Export could not complete: ${error.message}. Please retry.`);}
  finally{exporting=false;$('export').disabled=false;}
}
async function start(){
  const response=await fetch('../data/map.json?v=0.1.4');if(!response.ok)throw new Error('School data could not be loaded');
  model=prepare(await response.json());map=L.map('map',{preferCanvas:true}).setView([-29,25],5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Routes: <a href="https://project-osrm.org/">OSRM</a> / <a href="https://routing.openstreetmap.de/about.html">FOSSGIS</a>'}).addTo(map);
  lineLayer=L.layerGroup().addTo(map);markerLayer=L.layerGroup().addTo(map);L.control.scale({imperial:false}).addTo(map);
  $('province').replaceChildren(new Option('All provinces',''),...[...new Set(model.cbos.map(c=>c.province))].sort().map(p=>new Option(p,p)));
  $('province').value=state.province;cboOptions();
  $('province').onchange=()=>{state.province=$('province').value;state.cbo='';cboOptions();refresh(true);};
  $('cbo').onchange=()=>{state.cbo=$('cbo').value;if(state.cbo){state.province=model.sites.get(state.cbo).province;$('province').value=state.province;}cboOptions();refresh(true);};
  $('straight').onclick=()=>{state.mode='straight';refresh(true);};$('road').onclick=()=>{state.mode='road';refresh(true);};
  $('fhr').onchange=()=>{state.showFhr=$('fhr').checked;markers();};$('fit').onclick=fit;
  $('overview').onclick=()=>{state.province='';state.cbo='';$('province').value='';cboOptions();refresh(true);};
  $('export').onclick=exportView;await refresh(true);
}
start().catch(error=>status(`Unable to load explorer: ${error.message}`));
