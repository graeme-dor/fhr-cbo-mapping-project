export const palette = ['#bf4d45','#377ca8','#559b55','#9864ac','#d48a27','#318e8b','#b35d86','#827142','#6273bb','#8b6252','#cf596c','#428562','#b47631','#626aa4','#2995a4','#a54f69','#799334','#ab673f','#685d90','#40716d','#a78425','#47799a','#966b85','#638d69','#906447'];

export function prepare(data,districtData=null) {
  const sites=new Map(data.sites.map(s=>{
    const d=districtData?.assignments?.[s.id];
    const valid=d&&d.latitude===s.latitude&&d.longitude===s.longitude&&d.province===s.province;
    return [s.id,{...s,district:valid?d:null}];
  }));
  const cbos=[...sites.values()].filter(s=>s.kind==='CBO').sort((a,b)=>a.id.localeCompare(b.id));
  const colors=new Map(cbos.map((c,i)=>[c.id,palette[i % palette.length]]));
  return {sites,cbos,colors,links:data.links,districtMetadata:districtData?.metadata};
}

export function provinceGroups(model){
  const dbe=[...new Set([...model.sites.values()].filter(s=>s.kind==='DBE').map(s=>s.province))].sort();
  const other=[...new Set(model.cbos.map(c=>c.province))].filter(p=>!dbe.includes(p)).sort();
  return {dbe,other};
}
export function provinceMatches(model,province,scope){
  return !scope || (scope==='__dbe__'?provinceGroups(model).dbe.includes(province):province===scope);
}

export function connections(model,{province='',cbo=''}){
  return model.links.filter(link=>{
    const source=model.sites.get(link.cbo_id),school=model.sites.get(link.school_id);
    return source?.kind==='CBO' && school?.kind==='DBE'
      && source.province===school.province && Number.isFinite(link.distance_km)
      && provinceMatches(model,source.province,province) && (!cbo || source.id===cbo);
  });
}

export function fhrConnections(model,{province='',cbo=''}={}){
  return model.links.filter(l=>{
    const c=model.sites.get(l.cbo_id),s=model.sites.get(l.school_id);
    return l.basis==='workbook_fhr_assignment' && c?.kind==='CBO' && s?.kind==='FHR'
      && Number.isFinite(l.distance_km) && provinceMatches(model,c.province,province) && (!cbo||c.id===cbo);
  });
}
export function displayedConnections(model,filter={},roads=new Map()){
  const nearest=nearestConnections(model,filter,roads),keys=new Set(nearest.map(l=>`${l.cbo_id}|${l.school_id}`));
  return {nearest,other:connections(model,filter).filter(l=>!keys.has(`${l.cbo_id}|${l.school_id}`)),fhr:fhrConnections(model,filter)};
}

export function fhrSchools(model,cboId){
  const cbo=model.sites.get(cboId);
  if(!cbo)return [];
  const ids=new Set(model.links.filter(l=>l.cbo_id===cboId && l.basis==='workbook_fhr_assignment').map(l=>l.school_id));
  return [...ids].map(id=>model.sites.get(id)).filter(s=>s?.kind==='FHR' && Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
}

export function tableResults(body,count){
  const values=body.distances?.[0];
  if(body.code!=='Ok' || !Array.isArray(values) || values.length!==count || values.some(d=>d!==null && (!Number.isFinite(d)||d<0)))throw new Error('Invalid road-distance response');
  return values.map((d,i)=>({distance_km:d===null?null:d/1000,
    status:d===null?'unavailable':(body.sources?.[0]?.distance>250 || body.destinations?.[i]?.distance>250)?'check_access':'available',
    fetched_at:new Date().toISOString()}));
}

export function routeKey(a,b){
  return [a.longitude,a.latitude,b.longitude,b.latitude].map(n=>n.toFixed(7)).join(',');
}

export function routeResult(body){
  if(body.code!=='Ok'||!body.routes?.length)throw new Error('No driving route found');
  const r=body.routes[0];
  if(!Number.isFinite(r.distance)||r.distance<0||r.geometry?.type!=='LineString'||r.geometry.coordinates.length<2)throw new Error('Invalid route response');
  const snaps=(body.waypoints||[]).map(w=>w.distance);
  return {distance_km:r.distance/1000,geometry:r.geometry,snap_distances:snaps,
          status:snaps.some(d=>d>250)?'check_access':'available',fetched_at:new Date().toISOString()};
}

// Determine winners before applying a CBO focus, so focus never changes allocation.
export function nearestConnections(model,{province='',cbo='',mode='straight',scope='province'}={},roads=new Map()){
  const candidates=connections(model,{province}).filter(l=>scope!=='district'||sameDistrict(model.sites.get(l.cbo_id),model.sites.get(l.school_id))),groups=new Map();
  for(const l of candidates){if(!groups.has(l.school_id))groups.set(l.school_id,[]);groups.get(l.school_id).push(l);}
  const winners=[];
  for(const group of groups.values()){
    // Missing road candidates must not silently produce a provisional winner.
    if(mode==='road'&&group.some(l=>!roads.has(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)))))continue;
    const measure=l=>mode==='straight'?l.distance_km:roads.get(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)))?.distance_km;
    const eligible=group.filter(l=>Number.isFinite(measure(l))).sort((a,b)=>measure(a)-measure(b)||a.cbo_id.localeCompare(b.cbo_id));
    if(eligible.length&&(!cbo||eligible[0].cbo_id===cbo))winners.push(eligible[0]);
  }
  return winners;
}
export function sameDistrict(a,b){
  return a?.province===b?.province && a?.district?.status==='matched' && b?.district?.status==='matched'
    && Boolean(a.district.district_code) && a.district.district_code===b.district.district_code;
}
export function districtReason(model,school){
  if(!school.district)return 'District assignment unavailable';
  if(school.district?.status!=='matched')return 'Location / province needs review';
  return model.cbos.some(c=>sameDistrict(c,school))?'':'No CBO in this district';
}

export function distanceCsv(model,filter,roads=new Map()){
  const straight=new Map(nearestConnections(model,{province:filter.province}).map(l=>[l.school_id,l.cbo_id]));
  const road=new Map(nearestConnections(model,{province:filter.province,mode:'road'},roads).map(l=>[l.school_id,l.cbo_id]));
  const districtStraight=new Map(nearestConnections(model,{scope:'district'}).map(l=>[l.school_id,l]));
  const districtRoad=new Map(nearestConnections(model,{scope:'district',mode:'road'},roads).map(l=>[l.school_id,l]));
  const rows=[['Province','CBO','DBE school','Straight-line km','Road network km','Nearest CBO (straight line)','Nearest CBO (road network)','Is nearest CBO (straight line)','Is nearest CBO (road network)',...(model.districtMetadata?['CBO district / metro','DBE district / metro','Same district / metro','Nearest district CBO (straight line)','Nearest district straight-line km','Nearest district CBO (road network)','Nearest district road km','District comparison note']:[])]];
  for(const l of connections(model,filter)){
    const c=model.sites.get(l.cbo_id),s=model.sites.get(l.school_id),r=roads.get(routeKey(c,s)),winner=road.get(s.id);
    const ds=districtStraight.get(s.id),dr=districtRoad.get(s.id),drKm=dr&&roads.get(routeKey(model.sites.get(dr.cbo_id),s))?.distance_km;
    const districtCells=model.districtMetadata?[c.district?.district_name||'',s.district?.district_name||'',sameDistrict(c,s)?'Yes':'No',ds?model.sites.get(ds.cbo_id).name:'',ds?ds.distance_km.toFixed(3):'',dr?model.sites.get(dr.cbo_id).name:'',Number.isFinite(drKm)?drKm.toFixed(3):'',districtReason(model,s)||(!dr?'District road route unavailable':'')]:[];
    rows.push([c.province,c.name,s.name,l.distance_km.toFixed(3),Number.isFinite(r?.distance_km)?r.distance_km.toFixed(3):'',model.sites.get(straight.get(s.id))?.name||'',model.sites.get(winner)?.name||'',straight.get(s.id)===c.id?'Yes':'No',winner?(winner===c.id?'Yes':'No'):'',...districtCells]);
  }
  return '\uFEFF'+rows.map(row=>row.map(value=>{let s=String(value);if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
}

export function fhrDistanceCsv(model,roads=new Map()){
  const rows=[['CBO province','CBO','FHR school province','FHR school','Straight-line km','Road network km']];
  for(const l of fhrConnections(model)){
    const c=model.sites.get(l.cbo_id),s=model.sites.get(l.school_id),r=roads.get(routeKey(c,s));
    rows.push([c.province,c.name,s.province,s.name,l.distance_km.toFixed(3),Number.isFinite(r?.distance_km)?r.distance_km.toFixed(3):'']);
  }
  return '\uFEFF'+rows.map(row=>row.map(value=>{let s=String(value);if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
}
