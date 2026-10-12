import {prepare,connections,nearestConnections,routeKey} from './model.js?v=0.2.1';

export async function datasetSignature(data){
  const model=prepare(data);
  const sites=[...model.sites.values()].filter(s=>s.kind==='CBO'||s.kind==='DBE').sort((a,b)=>a.id.localeCompare(b.id))
    .map(s=>[s.id,s.kind,s.province,s.longitude,s.latitude]);
  const links=connections(model,{}).map(l=>[l.cbo_id,l.school_id,l.distance_km]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const bytes=new TextEncoder().encode(JSON.stringify({sites,links}));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function batchRoutes(body,cbo,schools){
  const legs=body.routes?.[0]?.legs;
  if(body.code!=='Ok'||legs?.length!==schools.length*2-1)throw new Error('Invalid route batch');
  const routes={};
  schools.forEach((school,i)=>{
    const leg=legs[i*2],coordinates=[];
    for(const step of leg.steps||[]){
      if(step.geometry?.type!=='LineString')throw new Error('Invalid route step');
      for(const point of step.geometry.coordinates){
        const last=coordinates.at(-1);
        if(!last||point[0]!==last[0]||point[1]!==last[1])coordinates.push(point);
      }
    }
    if(!Number.isFinite(leg.distance)||leg.distance<0||coordinates.length<2)throw new Error('Invalid route geometry');
    const snaps=[body.waypoints?.[i*2]?.distance,body.waypoints?.[i*2+1]?.distance];
    routes[routeKey(cbo,school)]={distance_km:leg.distance/1000,geometry:{type:'LineString',coordinates},
      snap_distances:snaps,status:snaps.some(d=>d>250)?'check_access':'available',fetched_at:new Date().toISOString()};
  });
  return routes;
}
export async function validateSnapshot(data,snapshot){
  if(snapshot.metadata?.dataset_signature!==await datasetSignature(data))throw new Error('Road snapshot needs rebuilding for the updated dataset');
  const model=prepare(data),roads=new Map(Object.entries(snapshot.distances||{})),routes=snapshot.routes||{};
  for(const l of connections(model,{})){
    const r=roads.get(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)));
    if(!r||!(r.distance_km===null||Number.isFinite(r.distance_km)&&r.distance_km>=0))throw new Error('Incomplete road snapshot');
  }
  for(const l of nearestConnections(model,{mode:'road'},roads)){
    const key=routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)),r=routes[key];
    if(r?.geometry?.type!=='LineString'||r.geometry.coordinates.length<2||Math.abs(r.distance_km-roads.get(key).distance_km)>.01)throw new Error('Missing or inconsistent nearest road path');
  }
  return {roads,routes,metadata:snapshot.metadata};
}
