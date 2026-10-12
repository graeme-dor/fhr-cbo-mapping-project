export const palette = ['#bf4d45','#377ca8','#559b55','#9864ac','#d48a27','#318e8b','#b35d86','#827142','#6273bb','#8b6252','#cf596c','#428562','#b47631','#626aa4','#2995a4','#a54f69','#799334','#ab673f','#685d90','#40716d','#a78425','#47799a','#966b85','#638d69','#906447'];

export function prepare(data) {
  const sites=new Map(data.sites.map(s=>[s.id,s]));
  const cbos=data.sites.filter(s=>s.kind==='CBO').sort((a,b)=>a.id.localeCompare(b.id));
  const colors=new Map(cbos.map((c,i)=>[c.id,palette[i % palette.length]]));
  return {sites,cbos,colors,links:data.links};
}

export function connections(model,{province='',cbo=''}){
  return model.links.filter(link=>{
    const source=model.sites.get(link.cbo_id),school=model.sites.get(link.school_id);
    return source?.kind==='CBO' && school?.kind==='DBE'
      && source.province===school.province && Number.isFinite(link.distance_km)
      && (!province || source.province===province) && (!cbo || source.id===cbo);
  });
}

export function fhrSchools(model,cboId){
  const cbo=model.sites.get(cboId);
  if(!cbo)return [];
  const ids=new Set(model.links.filter(l=>l.cbo_id===cboId && l.basis==='workbook_fhr_assignment').map(l=>l.school_id));
  return [...ids].map(id=>model.sites.get(id)).filter(s=>s?.kind==='FHR' && s.province===cbo.province && Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
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
