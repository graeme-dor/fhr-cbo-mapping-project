/* global L */
import {prepare,connections,fhrSchools} from './model.js?v=0.2.0-experiment.2';
import {Routing} from './routing.js?v=0.2.0-experiment.2';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const state={province:'Gauteng',cbo:'',mode:'straight',showFhr:false,school:''};
const routing=new Routing();
let model,map,markerLayer,lineLayer,controller,routeController,revision=0;
let active=[],distances=new Map(),currentRoute=null,roadError=false;
function status(text=''){$('status').textContent=text;$('status').hidden=!text;}
function cboOptions(){
  const cbos=model.cbos.filter(c=>c.province===state.province).sort((a,b)=>a.name.localeCompare(b.name));
  if(!cbos.some(c=>c.id===state.cbo))state.cbo=cbos[0]?.id||'';
  $('cbo').replaceChildren(...cbos.map(c=>new Option(c.name,c.id)));$('cbo').value=state.cbo;
}
function popup(site,assigned){
  const box=node('div','');box.append(node('strong',site.name),node('p',`${site.kind} · ${site.province}`));
  if(assigned)box.append(node('p',`Assigned CBO: ${assigned.name}`));
  if(site.kind==='CBO'){
    const button=node('button','View DBE schools');
    button.onclick=()=>{state.cbo=site.id;cboOptions();refresh(true);};box.append(button);
  }
  return box;
}
function markers(){
  markerLayer.clearLayers();
  const cbo=model.sites.get(state.cbo),color=model.colors.get(state.cbo);
  for(const c of model.cbos.filter(c=>c.province===state.province)){
    L.circleMarker([c.latitude,c.longitude],{radius:c.id===state.cbo?11:7,color:'#fff',weight:2,fillColor:model.colors.get(c.id),fillOpacity:c.id===state.cbo?1:.55})
      .bindPopup(popup(c)).bindTooltip(node('span',c.name)).addTo(markerLayer);
  }
  for(const link of active){
    const s=model.sites.get(link.school_id);
    L.circleMarker([s.latitude,s.longitude],{radius:s.id===state.school?6:4,color,weight:1.5,fillColor:'#fff',fillOpacity:1})
      .bindTooltip(node('span',s.name)).on('click',()=>selectSchool(s.id)).addTo(markerLayer);
  }
  if(state.showFhr)for(const s of fhrSchools(model,state.cbo)){
    const icon=L.divIcon({className:'school-icon',html:`<span class="school-dot fhr" style="--cbo:${color}"></span>`,iconSize:[10,10],iconAnchor:[5,5]});
    L.marker([s.latitude,s.longitude],{icon}).bindPopup(popup(s,cbo)).bindTooltip(node('span',s.name)).addTo(markerLayer);
  }
  $('fhr-key').hidden=!state.showFhr;
}
function distance(link){return state.mode==='straight'?link.distance_km:distances.get(link.school_id)?.distance_km??Infinity;}
function render(){
  lineLayer.clearLayers();
  const c=model.sites.get(state.cbo),color=model.colors.get(state.cbo);
  if(state.mode==='straight')for(const link of active){
    const s=model.sites.get(link.school_id),selected=s.id===state.school;
    L.polyline([[c.latitude,c.longitude],[s.latitude,s.longitude]],{color,weight:selected?3:1.5,opacity:selected ? .9 : .5})
      .bindTooltip(node('span',`${s.name}: ${link.distance_km.toFixed(1)} km straight line`)).on('click',()=>selectSchool(s.id)).addTo(lineLayer);
  }
  else if(currentRoute)L.geoJSON(currentRoute.geometry,{style:{color,weight:3,opacity:.85}}).addTo(lineLayer);
  $('straight').setAttribute('aria-pressed',String(state.mode==='straight'));
  $('road').setAttribute('aria-pressed',String(state.mode==='road'));
  $('road-help').hidden=state.mode!=='road';
  $('caption').textContent=`${state.province} · ${c?.name||'Choose a CBO'}`;
  $('school-list').replaceChildren();
  for(const link of [...active].sort((a,b)=>distance(a)-distance(b))){
    const s=model.sites.get(link.school_id),r=distances.get(s.id);
    const row=node('div','');row.className=`school-row${s.id===state.school?' selected':''}`;
    const button=node('button',s.name);button.onclick=()=>selectSchool(s.id);
    const value=state.mode==='straight'?`${link.distance_km.toFixed(1)} km`:Number.isFinite(r?.distance_km)?`${r.distance_km.toFixed(1)} km`:r||roadError?'Unavailable':'Loading…';
    const measurement=node('span',value);measurement.className='distance';
    if(state.mode==='road'&&r?.status==='check_access')measurement.append(node('small','check road access'));
    row.append(button,measurement);$('school-list').append(row);
  }
  if(!active.length)$('school-list').append(node('p',`No DBE schools are listed for ${state.province}.`));
}
function fit(){
  const c=model.sites.get(state.cbo);
  const sites=[c,...active.map(l=>model.sites.get(l.school_id)),...(state.showFhr?fhrSchools(model,state.cbo):[])].filter(Boolean);
  if(sites.length)map.fitBounds(sites.map(s=>[s.latitude,s.longitude]),{padding:[45,45],maxZoom:13});
}
async function selectSchool(id){
  routeController?.abort();routeController=new AbortController();const signal=routeController.signal,run=revision;
  state.school=id;currentRoute=null;markers();render();
  const c=model.sites.get(state.cbo),s=model.sites.get(id);
  if(s?.kind!=='DBE'||c?.province!==s.province||!active.some(l=>l.school_id===id))return;
  if(state.mode==='straight'){map.fitBounds([[c.latitude,c.longitude],[s.latitude,s.longitude]],{padding:[55,55],maxZoom:14});status();return;}
  const measurement=distances.get(id);
  if(!measurement)return;
  if(measurement.distance_km===null){status('No driving route is available for this school.');return;}
  status(`Loading road path for ${s.name}…`);
  try{
    const result=await routing.get(c,s,signal);
    if(signal.aborted||run!==revision||state.mode!=='road')return;
    currentRoute=result;distances.set(id,result);render();
    map.fitBounds(result.geometry.coordinates.map(([lon,lat])=>[lat,lon]),{padding:[50,50],maxZoom:14});
    status(result.status==='check_access'?'Check road access: a location is more than 250 metres from the mapped road.':'');
  }catch(error){if(!signal.aborted&&run===revision)status(`Road path unavailable: ${error.message}`);}
}
async function refresh(autoFit=false){
  controller?.abort();routeController?.abort();controller=new AbortController();const signal=controller.signal,run=++revision;
  active=connections(model,state);state.school='';currentRoute=null;distances=new Map();roadError=false;
  markers();render();if(autoFit)fit();
  if(state.mode==='straight'||!active.length){status();return;}
  status('Loading DBE road distances…');
  try{
    const result=await routing.distances(model.sites.get(state.cbo),active.map(l=>model.sites.get(l.school_id)),signal);
    if(signal.aborted||run!==revision)return;
    distances=result;render();status();
    const closest=[...active].filter(l=>Number.isFinite(distances.get(l.school_id)?.distance_km)).sort((a,b)=>distance(a)-distance(b))[0];
    if(closest)await selectSchool(closest.school_id);else status('No driving routes are available for these schools.');
  }catch(error){if(!signal.aborted&&run===revision){roadError=true;render();status(`Road distances unavailable: ${error.message}`);}}
}
async function start(){
  const response=await fetch('../data/map.json?v=0.1.4');if(!response.ok)throw new Error('School data could not be loaded');
  model=prepare(await response.json());map=L.map('map',{preferCanvas:true}).setView([-26,28],9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Routes: <a href="https://project-osrm.org/">OSRM</a> / <a href="https://routing.openstreetmap.de/about.html">FOSSGIS</a>'}).addTo(map);
  lineLayer=L.layerGroup().addTo(map);markerLayer=L.layerGroup().addTo(map);L.control.scale({imperial:false}).addTo(map);
  $('province').replaceChildren(...[...new Set(model.cbos.map(c=>c.province))].sort().map(p=>new Option(p,p)));
  $('province').value=state.province;cboOptions();
  $('province').onchange=()=>{state.province=$('province').value;state.cbo='';cboOptions();refresh(true);};
  $('cbo').onchange=()=>{state.cbo=$('cbo').value;refresh(true);};
  $('straight').onclick=()=>{state.mode='straight';refresh(true);};
  $('road').onclick=()=>{state.mode='road';refresh();};
  $('fhr').onchange=()=>{state.showFhr=$('fhr').checked;markers();};
  $('fit').onclick=fit;await refresh(true);
}
start().catch(error=>status(`Unable to load explorer: ${error.message}`));
