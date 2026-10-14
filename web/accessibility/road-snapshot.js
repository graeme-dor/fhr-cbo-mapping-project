import {prepare,connections,fhrConnections,routeKey} from './model.js?v=0.3.0';

export async function datasetSignature(data){
  const model=prepare(data);
  const sites=[...model.sites.values()].filter(s=>['CBO','DBE','FHR'].includes(s.kind)).sort((a,b)=>a.id.localeCompare(b.id))
    .map(s=>[s.id,s.kind,s.province,s.longitude,s.latitude]);
  const links=[...connections(model,{}),...fhrConnections(model)].map(l=>[l.cbo_id,l.school_id,l.distance_km]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
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
  for(const l of [...connections(model,{}),...fhrConnections(model)]){
    const r=roads.get(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)));
    if(!r||!(r.distance_km===null||Number.isFinite(r.distance_km)&&r.distance_km>=0))throw new Error('Incomplete road snapshot');
  }
  for(const l of [...connections(model,{}),...fhrConnections(model)]){
    const key=routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)),r=routes[key];
    if(roads.get(key)?.distance_km===null)continue;
    if(r?.geometry?.type!=='LineString'||r.geometry.coordinates.length<2||Math.abs(r.distance_km-roads.get(key).distance_km)>.01)throw new Error('Missing or inconsistent road path');
  }
  return {roads,routes,metadata:snapshot.metadata};
}

// Douglas–Peucker in local metre coordinates. Distance values are not changed.
export function simplifyRoute(points,tolerance=15){
  if(points.length<=2)return points;
  const cos=Math.cos(points[0][1]*Math.PI/180),xy=points.map(([x,y])=>[x*111320*cos,y*111320]);
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
  while(stack.length){
    const [start,end]=stack.pop(),a=xy[start],b=xy[end],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    let max=tolerance*tolerance,index=-1;
    for(let i=start+1;i<end;i++){const p=xy[i],t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0,d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;if(d>max){max=d;index=i;}}
    if(index!==-1){keep.add(index);stack.push([start,index],[index,end]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
