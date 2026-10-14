import {routeKey,routeResult,tableResults} from './model.js?v=0.3.0';
const ENDPOINT='https://routing.openstreetmap.de/routed-car';
const STORE='fhr-road-routes-v1', DISTANCES='fhr-road-distances-v1';
const TTL=7*24*60*60*1000;
function load(key){try{return JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* In-memory cache remains usable. */}}
function fresh(value){return value && Date.now()-Date.parse(value.fetched_at)<TTL?value:null;}
export class Routing {
  constructor(){this.cache=load(STORE);this.distanceCache=load(DISTANCES);this.nextRequest=0;}
  cached(a,b){return fresh(this.cache[routeKey(a,b)]);}
  cachedDistance(a,b){return fresh(this.distanceCache[routeKey(a,b)]) || this.cached(a,b);}
  async request(path,signal){
    await new Promise((resolve,reject)=>{
      if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
      const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.max(0,this.nextRequest-Date.now()));
      signal.addEventListener('abort',abort,{once:true});
    });
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    this.nextRequest=Date.now()+1100;
    const controller=new AbortController(),abort=()=>controller.abort();
    signal.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(`${ENDPOINT}/${path}`,{signal:controller.signal});
      if(!response.ok)throw new Error(`Routing service returned ${response.status}`);
      return await response.json();
    }catch(error){if(!signal.aborted&&error.name==='AbortError')throw new Error('Routing service timed out');throw error;}
    finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
  }
  async distances(a,schools,signal){
    const pending=schools.filter(s=>!this.cachedDistance(a,s));
    if(pending.length){
      const coordinates=[a,...pending].map(s=>`${s.longitude},${s.latitude}`).join(';');
      const destinations=pending.map((_,i)=>i+1).join(';');
      const body=await this.request(`table/v1/driving/${coordinates}?sources=0&destinations=${destinations}&annotations=distance`,signal);
      const values=tableResults(body,pending.length);
      pending.forEach((s,i)=>{this.distanceCache[routeKey(a,s)]=values[i];});
      save(DISTANCES,this.distanceCache);
    }
    return new Map(schools.map(s=>[s.id,this.cachedDistance(a,s)]));
  }
  async matrix(cbos,schools,signal){
    if(!cbos.length||!schools.length)return new Map();
    const province=cbos[0].province;
    if(cbos.some(c=>c.province!==province)||schools.some(s=>s.province!==province))throw new Error('Road comparisons must stay within one province');
    const pending=schools.filter(s=>cbos.some(c=>!this.cachedDistance(c,s)));
    if(pending.length){
      const coordinates=[...cbos,...pending].map(s=>`${s.longitude},${s.latitude}`).join(';');
      const sources=cbos.map((_,i)=>i).join(';'),destinations=pending.map((_,i)=>cbos.length+i).join(';');
      const body=await this.request(`table/v1/driving/${coordinates}?sources=${sources}&destinations=${destinations}&annotations=distance`,signal);
      if(body.code!=='Ok'||body.distances?.length!==cbos.length)throw new Error('Invalid road matrix');
      // Validate every row before changing the cache.
      const rows=cbos.map((_,i)=>tableResults({...body,distances:[body.distances[i]],sources:[body.sources?.[i]]},pending.length));
      cbos.forEach((c,i)=>pending.forEach((s,j)=>{this.distanceCache[routeKey(c,s)]=rows[i][j];}));
      save(DISTANCES,this.distanceCache);
    }
    return new Map(cbos.flatMap(c=>schools.map(s=>[routeKey(c,s),this.cachedDistance(c,s)])));
  }
  async get(a,b,signal){
    const cached=this.cached(a,b);if(cached)return cached;
    const coordinates=`${a.longitude},${a.latitude};${b.longitude},${b.latitude}`;
    const body=await this.request(`route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,signal);
    const result=routeResult(body);
    this.cache[routeKey(a,b)]=result;
    this.cache=Object.fromEntries(Object.entries(this.cache).sort((a,b)=>Date.parse(b[1].fetched_at)-Date.parse(a[1].fetched_at)).slice(0,200));
    save(STORE,this.cache);return result;
  }
}
