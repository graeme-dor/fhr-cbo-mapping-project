import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepare,nearestConnections,sameDistrict,districtReason,distanceCsv,routeKey,displayedConnections} from '../web/accessibility/model.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const data=read('../web/data/map.json'),districts=read('../web/accessibility/data/districts.json'),m=prepare(data,districts),roads=new Map(Object.entries(read('../web/accessibility/data/roads.json').distances));
const schools=[...m.sites.values()].filter(s=>s.kind==='DBE');
for(const mode of ['straight','road']){
 const province=nearestConnections(m,{mode},roads),district=nearestConnections(m,{mode,scope:'district'},roads);
 assert.equal(province.length,85);
 for(const l of district){assert.ok(sameDistrict(m.sites.get(l.cbo_id),m.sites.get(l.school_id)));const km=q=>mode==='straight'?q.distance_km:roads.get(routeKey(m.sites.get(q.cbo_id),m.sites.get(q.school_id))).distance_km;const p=province.find(p=>p.school_id===l.school_id);assert.ok(km(l)>=km(p)-1e-9);}
 for(const c of m.cbos){assert.deepEqual(nearestConnections(m,{mode,scope:'district',cbo:c.id},roads),district.filter(l=>l.cbo_id===c.id));const g=displayedConnections(m,{scope:'district',mode,cbo:c.id},roads);assert.equal(g.nearest.length+g.other.length,data.links.filter(l=>l.cbo_id===c.id&&m.sites.get(l.school_id).kind==='DBE').length);}
 const gaps=schools.filter(s=>districtReason(m,s));assert.equal(district.length+gaps.length,85);
 console.log(mode, district.length,'district matches;',gaps.length,'district gaps / reviews');
}
const out=m.cbos.find(c=>c.name.startsWith('OUT-')),ts=[...m.sites.values()].find(s=>s.name==='Tsosoloso School');assert.ok(!sameDistrict(out,ts));
const mismatch=schools.find(s=>s.name==='Wolvenkop Special School');assert.equal(districtReason(m,mismatch),'Location / province needs review');assert.ok(!nearestConnections(m,{scope:'district'},roads).some(l=>l.school_id===mismatch.id));
assert.ok(schools.some(s=>districtReason(m,s)==='No CBO in this district'));
const stale=structuredClone(districts);stale.assignments[out.id].latitude+=1;const staleM=prepare(data,stale);assert.equal(staleM.sites.get(out.id).district,null);
assert.equal(nearestConnections(prepare(data),{scope:'district'}).length,0);
const c=m.cbos[0],fake={...c,province:'Other'};assert.ok(!sameDistrict(fake,c));
const first=nearestConnections(m,{scope:'district'})[0],missingRoads=new Map(roads);missingRoads.delete(routeKey(m.sites.get(first.cbo_id),m.sites.get(first.school_id)));assert.ok(!nearestConnections(m,{scope:'district',mode:'road'},missingRoads).some(l=>l.school_id===first.school_id));
const csv=distanceCsv(m,{},roads);assert.equal(csv.split('\r\n').length,426);assert.match(csv,/Nearest district CBO \(road network\)/);assert.match(csv,/No CBO in this district/);assert.match(csv,/Location \/ province needs review/);assert.equal(csv,fs.readFileSync(new URL('../web/accessibility/data/distances.csv',import.meta.url),'utf8'));
console.log('District checks passed: same province + district, metro support, focus invariance, gaps, coordinate review, stale assignments, incomplete roads and full export.');
