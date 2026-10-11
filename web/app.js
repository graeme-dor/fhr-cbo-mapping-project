/* global L */
const colors = {CBO:'#823fc7', DBE:'#2563eb', FHR:'#0d9488'};
const $ = id => document.getElementById(id);
const textNode = (tag, text) => {const node=document.createElement(tag);node.textContent=text;return node;};

async function start() {
  const response = await fetch('data/map.json');
  if (!response.ok) throw new Error('Map data could not be loaded.');
  const {sites, links, metadata} = await response.json();
  $('version').textContent = `v${metadata.version}`;
  $('method').textContent = `Distances are straight-line kilometres (Haversine), not travel distances. DBE ${metadata.dbe_scope} comparisons${metadata.dbe_scope_status === 'provisional' ? ' are provisional' : ''}; FHR links follow workbook assignments where CBO names match.`;
  const map = L.map('map').setView([-28.5,26],6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  L.control.scale({imperial:false}).addTo(map);
  const markers=L.layerGroup().addTo(map), lines=L.layerGroup().addTo(map);
  const lookup=new Map(sites.map(s=>[s.id,s]));
  const cbos=sites.filter(s=>s.kind==='CBO');
  const layers=()=>new Set([...document.querySelectorAll('[data-layer]:checked')].map(n=>n.dataset.layer));
  for(const province of [...new Set(sites.map(s=>s.province))].sort()) $('province').add(new Option(province,province));
  function cboOptions(){
    $('cbo').replaceChildren(new Option('Select a CBO',''));
    for(const cbo of cbos.filter(s=>!$('province').value || s.province===$('province').value).sort((a,b)=>a.name.localeCompare(b.name))) $('cbo').add(new Option(cbo.name,cbo.id));
  }
  function draw(fit=false){
    const allowed=layers(), prov=$('province').value, selected=$('cbo').value;
    markers.clearLayers();lines.clearLayers();
    const visible=sites.filter(s=>(!prov||s.province===prov)&&allowed.has(s.kind));
    const located=visible.filter(s=>s.coordinate_status==='available');
    for(const s of located){
      const popup=document.createElement('div');
      popup.append(textNode('strong',s.name),textNode('p',`${s.kind} · ${s.province}`));
      if(s.kind==='CBO'){
        const button=textNode('button','Show school distances');
        button.onclick=()=>{$('cbo').value=s.id;draw();};popup.append(button);
      }
      L.circleMarker([s.latitude,s.longitude],{radius:s.kind==='CBO'?10:5,color:'#fff',weight:1.5,fillColor:colors[s.kind],fillOpacity:.9})
        .bindPopup(popup).bindTooltip(textNode('span',s.name)).addTo(markers);
    }
    $('summary').textContent=`${located.length} locations shown. ${visible.length-located.length} in these layers need coordinates. ${metadata.unresolved_fhr_assignments} FHR school links need CBO name review across the dataset.`;
    $('distances').replaceChildren();
    if(selected){
      const cbo=lookup.get(selected);
      $('distance-title').textContent='School distances';
      $('distances').append(textNode('p',cbo.name));
      const rows=links.filter(l=>l.cbo_id===selected&&allowed.has(lookup.get(l.school_id).kind))
        .sort((a,b)=>(a.distance_km??Infinity)-(b.distance_km??Infinity));
      if(!rows.length) $('distances').append(textNode('p','No matched schools in the selected layers.'));
      for(const link of rows){
        const school=lookup.get(link.school_id), row=document.createElement('div');row.className='school';
        const button=textNode('button',school.name);
        button.append(textNode('small',`${school.kind} · ${school.kind==='DBE'?'comparison':'assigned'}`));
        button.disabled=school.coordinate_status!=='available';
        button.onclick=()=>map.setView([school.latitude,school.longitude],14);
        const km=textNode('span',link.distance_km===null?'Unavailable':`${link.distance_km.toFixed(1)} km`);km.className='km';
        row.append(button,km);$('distances').append(row);
        if(link.distance_km!==null&&allowed.has('CBO')){
          L.polyline([[cbo.latitude,cbo.longitude],[school.latitude,school.longitude]],{color:colors[school.kind],weight:1.5,opacity:.55})
            .bindTooltip(textNode('span',`${school.name}: ${link.distance_km.toFixed(1)} km straight-line`)).addTo(lines);
        }
      }
    }else $('distances').append(textNode('p','Choose a CBO to view distances.'));
    if(fit&&located.length) map.fitBounds(located.map(s=>[s.latitude,s.longitude]),{padding:[25,25],maxZoom:12});
  }
  $('province').onchange=()=>{cboOptions();draw(true);};
  $('cbo').onchange=()=>draw();
  document.querySelectorAll('[data-layer]').forEach(n=>n.onchange=()=>draw());
  cboOptions();draw(true);
}
start().catch(error=>{$('summary').textContent=`Unable to load the map: ${error.message}`;});
