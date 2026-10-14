// Manual, bounded snapshot build. Map interaction never calls a routing API.
import fs from 'node:fs/promises';
import {prepare,connections,fhrConnections,routeKey,distanceCsv,fhrDistanceCsv} from '../web/accessibility/model.js';
import {Routing} from '../web/accessibility/routing.js';
import {batchRoutes,datasetSignature,validateSnapshot,simplifyRoute} from '../web/accessibility/road-snapshot.js';
Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null,setItem:()=>{}}});
const endpoint=process.argv.slice(2).find(a=>!a.startsWith('--'))||'https://routing.openstreetmap.de/routed-car';
const refresh=process.argv.includes('--refresh');
const input=new URL('../web/data/map.json',import.meta.url),output=new URL('../web/accessibility/data/roads.json',import.meta.url);
const data=JSON.parse(await fs.readFile(input,'utf8')),model=prepare(data),signature=await datasetSignature(data);
let existing;
try{existing=JSON.parse(await fs.readFile(output,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
async function exports(roads){await fs.writeFile(new URL('distances.csv',output),distanceCsv(model,{},roads));await fs.writeFile(new URL('fhr-distances.csv',output),fhrDistanceCsv(model,roads));}
if(existing?.metadata.dataset_signature===signature&&!refresh){
  try{const checked=await validateSnapshot(data,existing);await exports(checked.roads);console.log('Snapshot is complete and current; exports regenerated without routing requests.');process.exit(0);}catch(e){console.log(`Extending snapshot: ${e.message}`);}
}
const router=new Routing(),signal=new AbortController().signal;
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>originalFetch(String(url).replace('https://routing.openstreetmap.de/routed-car',endpoint),{...options,headers:{'User-Agent':'fhr-cbo-mapping-project/accessibility-snapshot (+https://github.com/graeme-dor/fhr-cbo-mapping-project)'}});
const links=[...connections(model,{}),...fhrConnections(model)],roads=new Map(),routes={};
const reuse=!refresh&&existing?.metadata.provider===endpoint;
for(const l of links){const key=routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id));if(reuse&&existing.distances[key]){roads.set(key,existing.distances[key]);router.distanceCache[key]=existing.distances[key];}if(reuse&&existing.routes[key])routes[key]=existing.routes[key];}
for(const c of model.cbos){
  const schools=links.filter(l=>l.cbo_id===c.id).map(l=>model.sites.get(l.school_id));
  if(!schools.length)continue;
  console.log(`Distances and paths: ${c.name} (${schools.length})`);
  const pending=schools.filter(s=>!roads.has(routeKey(c,s)));
  if(pending.length)for(const [id,r] of await router.distances(c,pending,signal))roads.set(routeKey(c,model.sites.get(id)),r);
  const needed=schools.filter(s=>Number.isFinite(roads.get(routeKey(c,s))?.distance_km)&&(!routes[routeKey(c,s)]||Math.abs(routes[routeKey(c,s)].distance_km-roads.get(routeKey(c,s)).distance_km)>.01));
  // Keep batches below the service waypoint limit and all requests sequential.
  for(let i=0;i<needed.length;i+=25){
    const batchSchools=needed.slice(i,i+25),coordinates=batchSchools.flatMap(s=>[c,s]).map(s=>`${s.longitude},${s.latitude}`).join(';');
    const body=await router.request(`route/v1/driving/${coordinates}?steps=true&geometries=geojson&overview=false&continue_straight=false`,signal);
    const batch=batchRoutes(body,c,batchSchools);
    for(const school of batchSchools){const key=routeKey(c,school);if(Math.abs(batch[key].distance_km-roads.get(key).distance_km)>.01)throw new Error(`Route/matrix mismatch: ${school.name}`);}
    Object.assign(routes,batch);
  }
}
for(const [key,r] of Object.entries(routes)){
  if(reuse&&existing.metadata.geometry_tolerance_metres===15&&existing.routes[key]===r)continue;
  r.geometry.coordinates=simplifyRoute(r.geometry.coordinates,15);
}
const snapshot={metadata:{version:'0.3.0',dataset_signature:signature,built_at:new Date().toISOString(),provider:endpoint,distance_pairs:roads.size,dbe_pairs:connections(model,{}).length,fhr_pairs:fhrConnections(model).length,route_paths:Object.keys(routes).length,geometry_tolerance_metres:15,method:'OSRM driving-route distance; no live traffic'},distances:Object.fromEntries(roads),routes};
await validateSnapshot(data,snapshot);
const temporary=new URL('roads.json.tmp',output);await fs.writeFile(temporary,JSON.stringify(snapshot));await fs.rename(temporary,output);await exports(roads);
console.log(`Saved ${roads.size} distances and ${Object.keys(routes).length} simplified paths.`);
