/* global L */
import {prepare,connections,routeKey} from './model.js';
import {Routing} from './routing.js';

const $=id=>document.getElementById(id);
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const state={province:'Gauteng',cbo:'',view:'both',mode:'straight',rings:false};
const routing=new Routing();
let model,map,markerLayer,lineLayer,ringLayer,controller,revision=0;
let active=[],results=new Map(),errors=new Map();

function options(){
  const provinces=[...new Set(model.cbos.map(c=>c.province))].sort();
  $('province').replaceChildren(new Option('All provinces',''),...provinces.map(p=>new Option(p,p)));
  $('province').value=state.province;
  cboOptions();
}
function cboOptions(){
  const cbos=model.cbos.filter(c=>!state.province||c.province===state.province).sort((a,b)=>a.name.localeCompare(b.name));
  $('cbo').replaceChildren(new Option('All CBOs in view',''),...cbos.map(c=>new Option(c.name,c.id)));
  $('cbo').value=state.cbo;
}
function focus(id){
  state.cbo=id;state.province=model.sites.get(id).province;
  $('province').value=state.province;cboOptions();refresh(true);
}
function popup(site,cbo){
  const box=document.createElement('div');box.append(node('strong',site.name));
  box.append(node('p',`${site.kind} · ${site.province}`));
  if(cbo)box.append(node('p',`CBO: ${cbo.name}`));
  if(site.kind==='CBO'){
    const button=node('button','Focus on this CBO');button.onclick=()=>focus(site.id);box.append(button);
  }
  return box;
}
function drawMarkers(){
  markerLayer.clearLayers();ringLayer.clearLayers();
  const cbos=model.cbos.filter(c=>(!state.province||c.province===state.province)&&(!state.cbo||c.id===state.cbo));
  for(const c of cbos){
    const color=model.colors.get(c.id);
    L.circleMarker([c.latitude,c.longitude],{radius:10,color:'#fff',weight:2.5,fillColor:color,fillOpacity:1})
      .bindPopup(popup(c)).bindTooltip(node('span',c.name)).addTo(markerLayer);
  }
  const drawn=new Set();
  for(const link of active){
    const school=model.sites.get(link.school_id),cbo=model.sites.get(link.cbo_id);
    if(drawn.has(school.id))continue;drawn.add(school.id);
    // Many-to-many DBE comparisons use neutral school markers; lines identify CBOs.
    const color=state.view==='all'&&!state.cbo?'#768693':model.colors.get(cbo.id);
    const icon=L.divIcon({className:'school-icon',html:`<span class="school-dot ${school.kind==='FHR'?'fhr':''}" style="--cbo:${color}"></span>`,iconSize:[10,10],iconAnchor:[5,5]});
    L.marker([school.latitude,school.longitude],{icon}).bindPopup(popup(school,state.view==='all'&&!state.cbo?null:cbo))
      .bindTooltip(node('span',school.name)).addTo(markerLayer);
  }
  if(state.rings&&state.cbo){
    const c=model.sites.get(state.cbo),color=model.colors.get(c.id);
    for(const km of [5,10,25]){
      L.circle([c.latitude,c.longitude],{radius:km*1000,color,weight:1,dashArray:'4 5',fillOpacity:.015,interactive:false}).addTo(ringLayer);
      const lat=c.latitude+km/111.195;
      L.marker([lat,c.longitude],{interactive:false,icon:L.divIcon({className:'ring-label',html:`${km} km`,iconSize:[40,18],iconAnchor:[20,9]})}).addTo(ringLayer);
    }
  }
  $('rings').disabled=!state.cbo;
  $('rings').parentElement.title=state.cbo?'Straight-line radii':'Focus on a CBO to show distance rings';
  $('legend').replaceChildren();
  for(const c of cbos){
    const button=node('button',c.name);button.className='legend-row';
    const swatch=document.createElement('i');swatch.className='swatch';swatch.style.background=model.colors.get(c.id);
    button.prepend(swatch);button.onclick=()=>focus(c.id);$('legend').append(button);
  }
}
function line(link,result){
  const c=model.sites.get(link.cbo_id),s=model.sites.get(link.school_id),color=model.colors.get(c.id);
  const coordinates=result?result.geometry.coordinates.map(([lon,lat])=>[lat,lon]):[[c.latitude,c.longitude],[s.latitude,s.longitude]];
  const km=result?result.distance_km:link.distance_km;
  const layer=L.polyline(coordinates,{color,weight:state.mode==='road'?2.2:1.6,opacity:.65,dashArray:s.kind==='DBE'?'5 4':null});
  layer.bindTooltip(node('span',`${c.name} → ${s.name}: ${km.toFixed(1)} km ${state.mode==='road'?'driving':'straight'}${result?.status==='check_access'?' · check road access':''}`)).addTo(lineLayer);
}
function render(){
  lineLayer.clearLayers();
  const measured=[];
  for(const link of active){
    if(state.mode==='straight'){line(link);measured.push(link.distance_km);}
    else if(results.has(routeKey(model.sites.get(link.cbo_id),model.sites.get(link.school_id)))){
      const r=results.get(routeKey(model.sites.get(link.cbo_id),model.sites.get(link.school_id)));
      line(link,r);measured.push(r.distance_km);
    }
  }
  $('count').textContent=active.length;
  $('average').textContent=measured.length?(measured.reduce((a,b)=>a+b,0)/measured.length).toFixed(1):'—';
  $('longest').textContent=measured.length?Math.max(...measured).toFixed(1):'—';
  const partial=measured.length!==active.length;
  $('average-label').textContent=state.mode==='straight'?'avg. straight km':`avg. road km${partial?' (loaded)':''}`;
  $('longest-label').textContent=state.mode==='straight'?'longest straight km':`longest road km${partial?' (loaded)':''}`;
  $('straight').setAttribute('aria-pressed',String(state.mode==='straight'));
  $('road').setAttribute('aria-pressed',String(state.mode==='road'));
  $('scenario').textContent=state.view==='fhr'?'Workbook FHR assignments.':state.view==='all'?'DBE comparison: every CBO to every DBE school in its province.':'DBE scenario: nearest CBO by straight-line distance within the province. FHR assignments stay as supplied.';
  const caption=state.cbo?model.sites.get(state.cbo).name:state.province||'All provinces';
  $('caption').textContent=`${caption} · ${state.mode==='road'?'Driving routes':'Straight connections'}`;
  const sorted=[...active].sort((a,b)=>{
    const distance=l=>state.mode==='straight'?l.distance_km:results.get(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)))?.distance_km??Infinity;
    return distance(a)-distance(b);
  });
  $('school-list').replaceChildren();
  for(const link of sorted){
    const s=model.sites.get(link.school_id),c=model.sites.get(link.cbo_id),k=routeKey(c,s);
    const row=document.createElement('div');row.className='school-row';
    const button=node('button',s.name);
    button.append(node('small',`${s.kind} · ${state.cbo?'':c.name+' · '}${s.kind==='FHR'?'assigned':state.view==='all'?'comparison':'nearest scenario'}`));
    button.onclick=()=>{
      const result=state.mode==='road'?results.get(k):null;
      const coordinates=result?result.geometry.coordinates.map(([lon,lat])=>[lat,lon]):[[c.latitude,c.longitude],[s.latitude,s.longitude]];
      map.fitBounds(coordinates,{padding:[55,55],maxZoom:15});
    };
    const result=results.get(k);
    const value=state.mode==='straight'?`${link.distance_km.toFixed(1)} km`:result?`${result.distance_km.toFixed(1)} km`:errors.has(k)?'Unavailable':'Pending';
    const distance=node('span',value);distance.className='distance';
    if(state.mode==='road'&&result){distance.append(node('small',`straight ${link.distance_km.toFixed(1)} km${result.status==='check_access'?' · check access':''}`));}
    row.append(button,distance);$('school-list').append(row);
  }
  if(!active.length)$('school-list').append(node('p','No school connections in this view.'));
}
function fit(){
  const points=[];
  for(const l of active){
    for(const id of [l.cbo_id,l.school_id]){const s=model.sites.get(id);points.push([s.latitude,s.longitude]);}
    const result=results.get(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)));
    if(state.mode==='road'&&result)points.push(...result.geometry.coordinates.map(([lon,lat])=>[lat,lon]));
  }
  if(!points.length)for(const c of model.cbos.filter(c=>!state.province||c.province===state.province))points.push([c.latitude,c.longitude]);
  if(points.length)map.fitBounds(points,{padding:[45,45],maxZoom:13});
}
async function refresh(autoFit=false){
  controller?.abort();controller=new AbortController();const signal=controller.signal,run=++revision;
  active=connections(model,state);results=new Map();errors=new Map();
  for(const l of active){const c=model.sites.get(l.cbo_id),s=model.sites.get(l.school_id),r=routing.cached(c,s);if(r)results.set(routeKey(c,s),r);}
  drawMarkers();render();if(autoFit)fit();
  if(state.mode==='straight'){$('status').textContent='Solid lines: FHR assignments. Dashed lines: DBE comparisons or scenarios.';return;}
  const pending=active.filter(l=>!results.has(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id))));
  if(pending.length>60){$('status').textContent='Select a province or focus on one CBO to load road routes. This view needs more than 60 new requests.';return;}
  let loaded=0;
  const status=()=>{
    const access=[...results.values()].filter(r=>r.status==='check_access').length;
    const covered=active.filter(l=>results.has(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)))).length;
    const unavailable=active.filter(l=>errors.has(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)))).length;
    $('status').textContent=`Road routes: ${covered}/${active.length} loaded${unavailable?`; ${unavailable} unavailable`:''}${access?`; ${access} need road-access review`:''}.${loaded<pending.length?' Loading…':''}`;
  };
  status();
  for(const l of pending){
    if(signal.aborted||revision!==run)return;
    const c=model.sites.get(l.cbo_id),s=model.sites.get(l.school_id),k=routeKey(c,s);
    try{const result=await routing.get(c,s,signal);if(signal.aborted||revision!==run)return;results.set(k,result);}
    catch(error){if(signal.aborted||revision!==run)return;errors.set(k,error.message);}
    loaded++;render();status();
  }
}
function exportView(){
  const rows=[['CBO','School','Layer','Relationship','Straight-line km','Driving route km','Road status']];
  for(const l of active){const c=model.sites.get(l.cbo_id),s=model.sites.get(l.school_id),k=routeKey(c,s),r=results.get(k);
    rows.push([c.name,s.name,s.kind,s.kind==='FHR'?'assigned':state.view==='all'?'province comparison':'nearest straight-line scenario',l.distance_km,state.mode==='road'&&r?r.distance_km.toFixed(3):'',state.mode==='road'?(r?r.status:errors.has(k)?'unavailable':'pending'):'not requested']);}
  const csv=rows.map(row=>row.map(value=>{let text=String(value);if(/^[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='fhr-experiment-connections.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function start(){
  const response=await fetch('../data/map.json?v=0.1.4');if(!response.ok)throw new Error('School data could not be loaded');
  model=prepare(await response.json());
  map=L.map('map',{preferCanvas:true}).setView([-26,28],9);
  // Greyscale applies only to basemap tiles, preserving all overlay colours.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Routes: <a href="https://project-osrm.org/">OSRM</a> / <a href="https://routing.openstreetmap.de/about.html">FOSSGIS</a> · <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>'}).addTo(map);
  markerLayer=L.layerGroup().addTo(map);lineLayer=L.layerGroup().addTo(map);ringLayer=L.layerGroup().addTo(map);
  L.control.scale({imperial:false}).addTo(map);options();
  $('province').onchange=()=>{state.province=$('province').value;state.cbo='';cboOptions();refresh(true);};
  $('cbo').onchange=()=>{state.cbo=$('cbo').value;refresh(true);};
  $('view').onchange=()=>{state.view=$('view').value;refresh(true);};
  $('straight').onclick=()=>{state.mode='straight';refresh();};
  $('road').onclick=()=>{state.mode='road';refresh();};
  $('rings').onchange=()=>{state.rings=$('rings').checked;refresh();};
  $('fit').onclick=fit;$('export').onclick=exportView;
  await refresh(true);
}
start().catch(error=>{$('status').textContent=`Unable to load explorer: ${error.message}`;});
