import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepare,connections,routeResult,routeKey} from '../web/experiment/model.js';
const data=JSON.parse(fs.readFileSync(new URL('../web/data/map.json',import.meta.url)));
const model=prepare(data);
const fhr=connections(model,{view:'fhr'});
assert.equal(fhr.length,74);
const nearest=connections(model,{view:'nearest'});
assert.equal(nearest.length,85);
assert.equal(new Set(nearest.map(l=>l.school_id)).size,85);
for(const l of nearest){
  const candidates=data.links.filter(c=>c.school_id===l.school_id);
  assert.equal(l.distance_km,Math.min(...candidates.map(c=>c.distance_km)));
  assert.equal(model.sites.get(l.school_id).province,model.sites.get(l.cbo_id).province);
}
assert.equal(new Set(model.colors.values()).size,25);
assert.equal(connections(model,{province:'Gauteng',view:'both'}).length,40);
assert.equal(connections(model,{view:'all'}).length,data.links.length-74);
assert.throws(()=>routeResult({code:'NoRoute'}),/No driving route/);
assert.equal(routeResult({code:'Ok',routes:[{distance:1234,geometry:{type:'LineString',coordinates:[[28,-26],[29,-27]]}}],waypoints:[{distance:300}]}).status,'check_access');
const a={latitude:-26,longitude:28},b={latitude:-27,longitude:29};
assert.notEqual(routeKey(a,b),routeKey(b,a));
// Cached routes should remain usable without another network request.
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
const {Routing}=await import('../web/experiment/routing.js');
const router=new Routing();
router.cache[routeKey(a,b)]={distance_km:1.5,fetched_at:new Date().toISOString()};
assert.equal((await router.get(a,b,new AbortController().signal)).distance_km,1.5);
const cancelled=new AbortController();cancelled.abort();
await assert.rejects(router.get(b,a,cancelled.signal),{name:'AbortError'});
router.cache[routeKey(a,b)].fetched_at='2020-01-01T00:00:00Z';
assert.equal(router.cached(a,b),null);
console.log('Experiment checks passed: FHR assignments, province-only nearest scenarios, stable colours and route handling.');
