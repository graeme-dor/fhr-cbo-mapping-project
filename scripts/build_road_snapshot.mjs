// Run manually when map data changes. No routing calls are made by the map UI.
import fs from 'node:fs/promises';
import {prepare,connections,nearestConnections,routeKey,distanceCsv} from '../web/experiment/model.js';
import {Routing} from '../web/experiment/routing.js';
import {batchRoutes,datasetSignature,validateSnapshot} from '../web/experiment/road-snapshot.js';
Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null,setItem:()=>{}}});
const endpoint=process.argv.slice(2).find(a=>!a.startsWith('--'))||'https://routing.openstreetmap.de/routed-car';
const input=new URL('../web/data/map.json',import.meta.url),output=new URL('../web/experiment/data/roads.json',import.meta.url);
const data=JSON.parse(await fs.readFile(input,'utf8')),model=prepare(data),signature=await datasetSignature(data);
try{
  const existing=JSON.parse(await fs.readFile(output,'utf8'));
  if(existing.metadata.dataset_signature===signature&&!process.argv.includes('--refresh')){
    const checked=await validateSnapshot(data,existing);
    await fs.writeFile(new URL('distances.csv',output),distanceCsv(model,{},checked.roads));console.log('Road snapshot matches the dataset; no requests made. Use --refresh for newer road data.');process.exit(0);
  }
}catch(error){if(error.code!=='ENOENT')console.log(`Rebuilding: ${error.message}`);}
const router=new Routing(),signal=new AbortController().signal;
// Identify this bounded experiment and keep all requests sequential.
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>originalFetch(String(url).replace('https://routing.openstreetmap.de/routed-car',endpoint),{
  ...options,headers:{'User-Agent':'fhr-cbo-mapping-project/experiment-road-snapshot (+https://github.com/graeme-dor/fhr-cbo-mapping-project)'}});
const roads=new Map();
for(const province of [...new Set(connections(model,{}).map(l=>model.sites.get(l.cbo_id).province))].sort()){
  const cbos=model.cbos.filter(c=>c.province===province),schools=[...new Set(connections(model,{province}).map(l=>l.school_id))].map(id=>model.sites.get(id));
  console.log(`Distance matrix: ${province}`);
  for(const [key,result] of await router.matrix(cbos,schools,signal))roads.set(key,result);
}
const groups=new Map();
for(const l of nearestConnections(model,{mode:'road'},roads)){
  if(!groups.has(l.cbo_id))groups.set(l.cbo_id,[]);groups.get(l.cbo_id).push(model.sites.get(l.school_id));
}
const routes={};
for(const [id,schools] of groups){
  const cbo=model.sites.get(id);console.log(`Nearest road paths: ${cbo.name} (${schools.length})`);
  // Alternate facility/school waypoints; keep outbound legs only. Disabling
  // continue_straight makes each leg match independent CBO–school routing.
  const coordinates=schools.flatMap(s=>[cbo,s]).map(s=>`${s.longitude},${s.latitude}`).join(';');
  const body=await router.request(`route/v1/driving/${coordinates}?steps=true&geometries=geojson&overview=false&continue_straight=false`,signal);
  const batch=batchRoutes(body,cbo,schools);
  for(const s of schools){const key=routeKey(cbo,s);if(Math.abs(batch[key].distance_km-roads.get(key).distance_km)>.01)throw new Error(`Route/matrix mismatch: ${s.name}`);}
  Object.assign(routes,batch);
}
const snapshot={metadata:{version:'0.2.0-experiment.4',dataset_signature:signature,built_at:new Date().toISOString(),provider:endpoint,
  distance_pairs:roads.size,nearest_routes:Object.keys(routes).length,method:'OSRM driving-route distance; no live traffic'},distances:Object.fromEntries(roads),routes};
await validateSnapshot(data,snapshot);
await fs.mkdir(new URL('.',output),{recursive:true});
const temporary=new URL('roads.json.tmp',output);await fs.writeFile(temporary,JSON.stringify(snapshot));await fs.rename(temporary,output);
await fs.writeFile(new URL('distances.csv',output),distanceCsv(model,{},roads));
console.log(`Saved ${roads.size} comparison distances and ${Object.keys(routes).length} nearest routes.`);
