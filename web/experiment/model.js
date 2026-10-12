export const palette = ['#bf4d45','#377ca8','#559b55','#9864ac','#d48a27','#318e8b','#b35d86','#827142','#6273bb','#8b6252','#cf596c','#428562','#b47631','#626aa4','#2995a4','#a54f69','#799334','#ab673f','#685d90','#40716d','#a78425','#47799a','#966b85','#638d69','#906447'];

export function prepare(data) {
  const sites=new Map(data.sites.map(s=>[s.id,s]));
  const cbos=data.sites.filter(s=>s.kind==='CBO').sort((a,b)=>a.id.localeCompare(b.id));
  const colors=new Map(cbos.map((c,i)=>[c.id,palette[i % palette.length]]));
  const nearest=new Map();
  for(const link of data.links){
    const school=sites.get(link.school_id);
    if(school?.kind==='DBE'&&link.distance_km!==null){
      const current=nearest.get(school.id);
      if(!current || link.distance_km<current.distance_km || (link.distance_km===current.distance_km && link.cbo_id<current.cbo_id)) nearest.set(school.id,link);
    }
  }
  return {sites,cbos,colors,links:data.links,nearest};
}

export function connections(model,{province='',cbo='',view='both'}){
  return model.links.filter(link=>{
    const source=model.sites.get(link.cbo_id),school=model.sites.get(link.school_id);
    if(!source||!school||link.distance_km===null)return false;
    if(province&&source.province!==province)return false;
    if(cbo&&source.id!==cbo)return false;
    if(school.kind==='FHR')return view==='both'||view==='fhr';
    if(view==='fhr')return false;
    if(view==='all')return true;
    return model.nearest.get(school.id)?.cbo_id===source.id;
  });
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
