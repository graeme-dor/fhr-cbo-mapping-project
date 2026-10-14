/* global L */
import {prepare,connections,fhrSchools,nearestConnections,displayedConnections,provinceGroups,provinceMatches,routeKey} from './model.js?v=0.3.5';
import {validateSnapshot} from './road-snapshot.js?v=0.3.5';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const state={province:'__dbe__',cbo:'',mode:'straight',showFhr:false,school:''};
let model,map,markerLayer,lineLayer,snapshotMetadata;
let active=[],groups,roads=new Map(),routes={};
function status(text=''){$('status').textContent=text;$('status').hidden=!text;}
function cbos(){return model.cbos.filter(c=>provinceMatches(model,c.province,state.province));}
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
  const winners=new Map(nearestConnections(model,{province:state.province,mode:state.mode},roads).map(l=>[l.school_id,l]));
  // Show unresolved/unreachable schools neutrally in the overview; never use straight winners in road mode.
  const schools=[...model.sites.values()].filter(s=>s.kind==='DBE'&&(provinceMatches(model,s.province,state.province)));
  for(const s of schools){
    const l=winners.get(s.id),c=l&&model.sites.get(l.cbo_id),color=c?model.colors.get(c.id):'#86929b';
    const label=`${s.name}${c?' · '+c.name:' · road allocation unavailable or loading'}`;
    L.circleMarker([s.latitude,s.longitude],{radius:state.school.endsWith('|'+s.id)?6:4,color,weight:1,fillColor:color,fillOpacity:.95})
      .bindTooltip(node('span',label)).on('click',()=>selectSchool(s.id)).addTo(markerLayer);
  }
  if(state.showFhr)for(const c of shownCbos())for(const s of fhrSchools(model,c.id)){
    const color=model.colors.get(c.id),icon=L.divIcon({className:'school-icon',html:`<span class="school-dot fhr" style="--cbo:${color}"></span>`,iconSize:[10,10],iconAnchor:[5,5]});
    L.marker([s.latitude,s.longitude],{icon}).bindPopup(popup(s,c)).bindTooltip(node('span',s.name)).on('click',()=>selectConnection(groups.fhr.find(l=>l.cbo_id===c.id&&l.school_id===s.id))).addTo(markerLayer);
  }
  $('fhr-key').hidden=!state.showFhr;$('fhr-line-key').hidden=!state.showFhr;
  $('legend').replaceChildren();
  for(const c of shownCbos()){
    const button=node('button',c.name);button.className='legend-row';
    const swatch=node('i','');swatch.className='swatch';swatch.style.background=model.colors.get(c.id);
    button.prepend(swatch);button.onclick=()=>focus(c.id);$('legend').append(button);
  }
}
function measurement(l){return state.mode==='straight'?l.distance_km:roads.get(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)))?.distance_km??Infinity;}
const key=l=>`${l.cbo_id}|${l.school_id}`;
function drawConnection(l,colour,nearest=false,fhr=false){
  const c=model.sites.get(l.cbo_id),s=model.sites.get(l.school_id),selected=key(l)===state.school;
  const straight=state.mode==='straight';
  const style={color:colour,weight:selected?(straight?3:4):nearest||fhr?(straight?1.7:2.2):state.cbo?(straight?1.3:2):(straight?1:1.6),
    opacity:selected?.98:nearest||fhr?.88:state.cbo?(straight?.7:.8):(straight?.5:.65),...(fhr?{dashArray:'5 4'}:{})};
  const r=routes[routeKey(c,s)];
  const makeLayer=options=>state.mode==='road'?(r&&L.geoJSON(r.geometry,{style:options,interactive:options.interactive!==false})):
    L.polyline([[c.latitude,c.longitude],[s.latitude,s.longitude]],options);
  // Road paths use a white casing; straight connections use a single stroke.
  if(state.mode==='road'){
    const outline=makeLayer({...style,color:'#fff',weight:style.weight+2.2,opacity:.92,interactive:false});
    if(outline)outline.addTo(lineLayer);
  }
  const layer=makeLayer(style);
  if(layer)layer.bindTooltip(node('span',`${c.name} to ${s.name}: ${distanceLabel(l)}`)).on('click',()=>selectConnection(l)).addTo(lineLayer);
}
function distanceLabel(l){const value=measurement(l);return Number.isFinite(value)?`${value.toFixed(1)} km${state.mode==='road'?' road':''}`:'Road route unavailable';}
function listSection(title,links){
  const heading=node('h3',`${title} (${links.length})`);heading.className='distance-heading';$('school-list').append(heading);
  if(!links.length){$('school-list').append(node('p','No connections in this group.'));return;}
  for(const l of [...links].sort((a,b)=>measurement(a)-measurement(b))){
    const school=model.sites.get(l.school_id),c=model.sites.get(l.cbo_id),r=roads.get(routeKey(c,school));
    const row=node('div','');row.className=`school-row${key(l)===state.school?' selected':''}`;
    const button=node('button',school.name);button.append(node('small',c.name));button.onclick=()=>selectConnection(l);
    const value=node('span',distanceLabel(l));value.className='distance';
    if(state.mode==='road'&&r?.status==='check_access')value.append(node('small','check road access'));
    row.append(button,value);$('school-list').append(row);
  }
}
function render(){
  groups=displayedConnections(model,state,roads);active=[...groups.nearest,...groups.other,...(state.showFhr?groups.fhr:[])];lineLayer.clearLayers();
  for(const l of groups.other)drawConnection(l,state.mode==='straight'?'#81909a':'#6b7882');
  for(const l of groups.nearest)drawConnection(l,model.colors.get(l.cbo_id),true);
  if(state.showFhr)for(const l of groups.fhr)drawConnection(l,model.colors.get(l.cbo_id),false,true);
  markers();
  $('straight').setAttribute('aria-pressed',String(state.mode==='straight'));$('road').setAttribute('aria-pressed',String(state.mode==='road'));
  $('road-help').hidden=state.mode!=='road';
  $('caption').textContent=`${state.cbo?model.sites.get(state.cbo).name:(state.province==='__dbe__'?'DBE provinces':state.province||'All provinces')} · ${state.mode==='road'?'road':'straight-line'} distances`;
  $('school-list').replaceChildren();
  listSection(state.cbo?'DBE schools nearest to this CBO':'Nearest CBO–DBE connections',groups.nearest);
  listSection(state.cbo?'Other DBE schools in this province':'Other same-province CBO–DBE connections',groups.other);
  if(state.showFhr)listSection('Workbook-assigned FHR schools',groups.fhr);
}
function fit(){
  const sites=[...shownCbos(),...active.map(l=>model.sites.get(l.school_id))];
  if(sites.length)map.fitBounds(sites.map(s=>[s.latitude,s.longitude]),{padding:[45,45],maxZoom:13});
}
function selectSchool(id){
  const link=active.find(l=>l.school_id===id&&(!state.cbo||l.cbo_id===state.cbo));
  if(link)selectConnection(link);
}
function selectConnection(l){
  if(!l)return;state.school=key(l);render();
  const c=model.sites.get(l.cbo_id),s=model.sites.get(l.school_id),r=routes[routeKey(c,s)];
  if(s.kind==='DBE'&&c.province!==s.province)return;
  const points=state.mode==='road'&&r?r.geometry.coordinates.map(([lon,lat])=>[lat,lon]):[[c.latitude,c.longitude],[s.latitude,s.longitude]];
  map.fitBounds(points,{padding:[55,55],maxZoom:14});
  const measured=roads.get(routeKey(c,s));
  status(state.mode==='road'&&measured?.status==='check_access'?'Check road access: a location is more than 250 metres from the mapped road.':'');
}
function refresh(autoFit=false){state.school='';render();if(autoFit)fit();status();}
function provinceOptions(){
  const groups=provinceGroups(model),dbe=document.createElement('optgroup'),other=document.createElement('optgroup');
  dbe.label='Provinces with DBE schools';other.label='Other provinces';
  dbe.append(...groups.dbe.map(p=>new Option(p,p)));other.append(...groups.other.map(p=>new Option(p,p)));
  $('province').replaceChildren(new Option('All provinces',''),new Option('DBE provinces','__dbe__'),dbe,other);
  $('province').value=state.province;
}
async function start(){
  // Start independent downloads together, but do not block the initial map on roads.
  const roadFilePromise=fetch('data/roads.json?v=0.3.5',{cache:'no-cache'}).then(response=>{
    if(!response.ok)throw new Error('Preloaded road data could not be loaded');
    return response.json();
  }).then(value=>({value}),error=>({error}));
  const response=await fetch('../data/map.json?v=0.1.4',{cache:'no-cache'});if(!response.ok)throw new Error('School data could not be loaded');
  const data=await response.json();model=prepare(data);
  map=L.map('map',{preferCanvas:true}).setView([-29,25],5);

  lineLayer=L.layerGroup().addTo(map);markerLayer=L.layerGroup().addTo(map);L.control.scale({imperial:false}).addTo(map);
  provinceOptions();cboOptions();
  $('province').onchange=()=>{state.province=$('province').value;state.cbo='';cboOptions();refresh(true);};
  $('cbo').onchange=()=>{state.cbo=$('cbo').value;if(state.cbo){state.province=model.sites.get(state.cbo).province;$('province').value=state.province;}cboOptions();refresh(true);};
  $('straight').onclick=()=>{state.mode='straight';refresh(true);};$('road').onclick=()=>{state.mode='road';refresh(true);};
  $('fhr').onchange=()=>{state.showFhr=$('fhr').checked;refresh(true);};refresh(true);
  // Centre the design credit above Leaflet and the data acknowledgements.
  map.attributionControl.setPrefix('<span class="design-credit">Pro bono design by <strong>Graeme Dor</strong> &amp; <a href="https://datavisionanalytics.com/" target="_blank" rel="noopener noreferrer">DataVision Analytics</a></span>'+map.attributionControl.options.prefix);
  // Request tiles only after fitting the actual initial school/CBO view.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Routes: <a href="https://project-osrm.org/">OSRM</a> / <a href="https://routing.openstreetmap.de/about.html">FOSSGIS</a> · <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>'}).addTo(map);
  try{
    const roadFile=await roadFilePromise;if(roadFile.error)throw roadFile.error;
    const snapshot=await validateSnapshot(data,roadFile.value);
    roads=snapshot.roads;routes=snapshot.routes;snapshotMetadata=snapshot.metadata;
    $('road-date').textContent=`Road snapshot: ${new Date(snapshotMetadata.built_at).toLocaleDateString('en-ZA')}. Refresh the snapshot when locations or road data change.`;
    $('road').disabled=false;$('road').title='';
  }catch(error){
    $('road').title='Saved road layer unavailable';
    $('road-date').textContent='Saved road layer unavailable.';
    status(`Road layer unavailable: ${error.message}. The straight-line map remains available.`);
  }

}
start().catch(error=>status(`Unable to load explorer: ${error.message}`));
