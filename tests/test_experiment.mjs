import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepare,connections,fhrSchools,routeResult,routeKey,tableResults,fhrConnections,fhrDistanceCsv,displayedConnections} from '../web/accessibility/model.js';
const data=JSON.parse(fs.readFileSync(new URL('../web/data/map.json',import.meta.url)));
const model=prepare(data),links=connections(model,{});
assert.equal(links.length,425);
assert.equal(new Set(model.colors.values()).size,25);
for(const cbo of model.cbos)for(const link of connections(model,{province:cbo.province,cbo:cbo.id})){
  assert.equal(link.cbo_id,cbo.id);
  assert.equal(model.sites.get(link.school_id).province,cbo.province);
  assert.equal(model.sites.get(link.school_id).kind,'DBE');
}
const source=model.cbos[0],outsider=data.sites.find(s=>s.kind==='DBE'&&s.province!==source.province);
const bad={cbo_id:source.id,school_id:outsider.id,distance_km:0};
const contaminated=prepare({...data,links:[...data.links,bad]});
assert.ok(!connections(contaminated,{}).includes(bad));
assert.ok(!connections(contaminated,{cbo:source.id}).includes(bad));
const markerOnly=prepare({...data,links:data.links.map(l=>({...l,distance_km:null}))});
assert.equal(model.cbos.reduce((n,c)=>n+fhrSchools(markerOnly,c.id).length,0),74);
assert.equal(connections(markerOnly,{}).length,0);
assert.throws(()=>routeResult({code:'NoRoute'}),/No driving route/);
assert.throws(()=>tableResults({code:'Ok',distances:[[1]]},2),/Invalid/);
assert.throws(()=>tableResults({code:'Ok',distances:[[-1]]},1),/Invalid/);
const table={code:'Ok',distances:[[1234,null]],sources:[{distance:0}],destinations:[{distance:300},{distance:0}]};
const parsed=tableResults(table,2);
assert.equal(parsed[0].distance_km,1.234);assert.equal(parsed[0].status,'check_access');
assert.equal(parsed[1].distance_km,null);assert.equal(parsed[1].status,'unavailable');
const a={id:'a',latitude:-26,longitude:28},b={id:'b',latitude:-27,longitude:29},c={id:'c',latitude:-28,longitude:30};
assert.notEqual(routeKey(a,b),routeKey(b,a));
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
const requests=[];
globalThis.fetch=async url=>{
  requests.push(url);
  return {ok:true,json:async()=>url.includes('/table/')?table:{code:'Ok',routes:[{distance:1400,geometry:{type:'LineString',coordinates:[[28,-26],[29,-27]]}}],waypoints:[{distance:0},{distance:0}]}};
};
const {Routing}=await import('../web/accessibility/routing.js');
const router=new Routing(),signal=new AbortController().signal;
const distances=await router.distances(a,[b,c],signal);
assert.equal(requests.length,1);assert.match(requests[0],/table\/v1/);
assert.equal(distances.get('b').distance_km,1.234);assert.equal(distances.get('c').distance_km,null);
await router.distances(a,[b,c],signal);assert.equal(requests.length,1);
const reloaded=new Routing();await reloaded.distances(a,[b,c],signal);assert.equal(requests.length,1);
router.nextRequest=0;
assert.equal((await router.get(a,b,signal)).distance_km,1.4);
assert.equal(requests.length,2);assert.match(requests[1],/route\/v1/);
await router.get(a,b,signal);assert.equal(requests.length,2);
const cancelled=new AbortController();cancelled.abort();
await assert.rejects(router.get(b,a,cancelled.signal),{name:'AbortError'});
router.cache[routeKey(a,b)].fetched_at='2020-01-01T00:00:00Z';assert.equal(router.cached(a,b),null);
console.log('Experiment checks passed: province-only DBE links, FHR markers without distances, batch road distances, selected routes and cache reuse.');
// Allocation chooses the winning CBO across the entire province before focus.
const {nearestConnections,distanceCsv}=await import('../web/accessibility/model.js');
const straight=nearestConnections(model,{});
assert.equal(straight.length,85);assert.equal(new Set(straight.map(l=>l.school_id)).size,85);
for(const l of straight){
  const candidates=links.filter(p=>p.school_id===l.school_id);
  assert.equal(l.distance_km,Math.min(...candidates.map(p=>p.distance_km)));
}
const roadValues=new Map();
for(const l of links)roadValues.set(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)),{distance_km:1000-l.distance_km,status:'available',fetched_at:new Date().toISOString()});
const roadWinners=nearestConnections(model,{mode:'road'},roadValues);
assert.equal(roadWinners.length,85);
assert.ok(roadWinners.some(l=>straight.find(s=>s.school_id===l.school_id).cbo_id!==l.cbo_id));
for(const l of roadWinners){
  assert.equal(model.sites.get(l.cbo_id).province,model.sites.get(l.school_id).province);
  const focus=nearestConnections(model,{mode:'road',cbo:l.cbo_id},roadValues);
  assert.ok(focus.includes(l));
}
const incomplete=new Map(roadValues),schoolId=roadWinners[0].school_id;
const candidate=links.find(l=>l.school_id===schoolId);
incomplete.delete(routeKey(model.sites.get(candidate.cbo_id),model.sites.get(schoolId)));
assert.ok(!nearestConnections(model,{mode:'road'},incomplete).some(l=>l.school_id===schoolId));
const unreachable=new Map(roadValues);
for(const l of links.filter(l=>l.school_id===schoolId))unreachable.set(routeKey(model.sites.get(l.cbo_id),model.sites.get(l.school_id)),{distance_km:null,status:'unavailable'});
assert.ok(!nearestConnections(model,{mode:'road'},unreachable).some(l=>l.school_id===schoolId));
assert.equal(distanceCsv(model,{},roadValues).split('\r\n').length,426);
assert.match(distanceCsv(model,{},roadValues),/Nearest CBO \(road network\)/);
const matrixRouter=new Routing();matrixRouter.cache={};matrixRouter.distanceCache={};
const a2={...a,id:'a2',longitude:27,province:'Test'},a1={...a,province:'Test'},b1={...b,province:'Test'},c1={...c,province:'Test'};
let batches=0;
globalThis.fetch=async url=>{batches++;assert.match(url,/sources=0;1&destinations=2;3/);return {ok:true,json:async()=>({...table,distances:[[1000,2000],[3000,null]],sources:[{distance:0},{distance:0}]})};};
const matrix=await matrixRouter.matrix([a1,a2],[b1,c1],signal);
assert.equal(batches,1);assert.equal(matrix.size,4);assert.equal(matrix.get(routeKey(a2,c1)).distance_km,null);
await matrixRouter.matrix([a1,a2],[b1,c1],signal);assert.equal(batches,1);
await assert.rejects(matrixRouter.matrix([a1],[{...b1,province:'Other'}],signal),/within one province/);
console.log('Allocation checks passed: metric-specific winners, focus invariance, incomplete/unreachable handling, 425-row export and province matrices.');
const {provinceGroups,provinceMatches}=await import('../web/accessibility/model.js');
const groups=provinceGroups(model);
assert.deepEqual(groups.dbe,['Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga']);
assert.equal(groups.other.length,5);assert.ok(provinceMatches(model,'Gauteng','__dbe__'));assert.ok(!provinceMatches(model,'Western Cape','__dbe__'));
assert.equal(nearestConnections(model,{province:'__dbe__'}).length,85);
const {validateSnapshot,datasetSignature,batchRoutes}=await import('../web/accessibility/road-snapshot.js');
const snapshot=JSON.parse(fs.readFileSync(new URL('../web/accessibility/data/roads.json',import.meta.url)));
const preloaded=await validateSnapshot(data,snapshot);
assert.equal(preloaded.roads.size,499);assert.equal(Object.keys(preloaded.routes).length,499);
assert.equal(nearestConnections(model,{mode:'road'},preloaded.roads).length,85);
const csv=fs.readFileSync(new URL('../web/accessibility/data/distances.csv',import.meta.url),'utf8');
assert.equal(csv,distanceCsv(prepare(data,JSON.parse(fs.readFileSync(new URL('../web/accessibility/data/districts.json',import.meta.url)))),{},preloaded.roads));assert.equal(csv.split('\r\n').length,426);
const changed=structuredClone(data);changed.sites.find(s=>s.kind==='DBE').latitude+=.001;
assert.notEqual(await datasetSignature(changed),snapshot.metadata.dataset_signature);
await assert.rejects(validateSnapshot(changed,snapshot),/needs rebuilding/);
const broken=structuredClone(snapshot);delete broken.routes[Object.keys(broken.routes)[0]];
await assert.rejects(validateSnapshot(data,broken),/Missing or inconsistent/);
const step=(p,q)=>({geometry:{type:'LineString',coordinates:[p,q]}});
const batch= batchRoutes({code:'Ok',routes:[{legs:[{distance:1000,steps:[step([28,-26],[28.5,-26.5]),step([28.5,-26.5],[29,-27])]},{distance:1000,steps:[]},{distance:2000,steps:[step([28,-26],[30,-28])]}]}],waypoints:[{distance:0},{distance:300},{distance:0},{distance:0}]},a,[b,c]);
assert.equal(batch[routeKey(a,b)].geometry.coordinates.length,3);assert.equal(batch[routeKey(a,b)].status,'check_access');assert.equal(batch[routeKey(a,c)].distance_km,2);
assert.throws(()=>batchRoutes({code:'Ok',routes:[{legs:[]}]},a,[b]),/Invalid route batch/);
console.log('Preload checks passed: province grouping, complete road snapshot, matching full CSV, stale-data rejection and independent route legs.');

const assigned=fhrConnections(model);
assert.equal(assigned.length,74);
assert.ok(assigned.every(l=>l.basis==='workbook_fhr_assignment'&&model.sites.get(l.school_id).kind==='FHR'));
const fhrCsv=fs.readFileSync(new URL('../web/accessibility/data/fhr-distances.csv',import.meta.url),'utf8');
assert.equal(fhrCsv,fhrDistanceCsv(model,preloaded.roads));assert.equal(fhrCsv.split('\r\n').length,75);
for(const mode of ['straight','road']){
  const overview=displayedConnections(model,{mode},preloaded.roads);
  assert.equal(overview.nearest.length,85);assert.equal(overview.other.length,340);assert.equal(overview.fhr.length,74);
  for(const c of model.cbos){
    const grouped=displayedConnections(model,{cbo:c.id,province:c.province,mode},preloaded.roads);
    const pairKeys=grouped.nearest.concat(grouped.other).map(l=>`${l.cbo_id}|${l.school_id}`);
    assert.equal(pairKeys.length,connections(model,{cbo:c.id}).length);
    assert.equal(new Set(pairKeys).size,pairKeys.length);
    assert.ok(grouped.other.every(l=>l.cbo_id===c.id&&model.sites.get(l.school_id).province===c.province));
    assert.ok(grouped.nearest.every(l=>overview.nearest.includes(l)));
    assert.ok(grouped.fhr.every(l=>l.cbo_id===c.id));
  }
}
const fhrChange=structuredClone(data);fhrChange.sites.find(s=>s.kind==='FHR').latitude+=.001;
assert.notEqual(await datasetSignature(fhrChange),snapshot.metadata.dataset_signature);
await assert.rejects(validateSnapshot(fhrChange,snapshot),/needs rebuilding/);
const {simplifyRoute}=await import('../web/accessibility/road-snapshot.js');
const points=[[28,-26],[28.0001,-26],[28.0002,-26],[28.1,-26.1]];
const simplified=simplifyRoute(points,15);
assert.deepEqual(simplified[0],points[0]);assert.deepEqual(simplified.at(-1),points.at(-1));assert.ok(simplified.length<points.length);
console.log('All-pair and assigned FHR checks passed: 425 DBE pairs, 74 assigned FHR pairs, invariant winners, grouped panels, complete exports and simplified road paths.');
