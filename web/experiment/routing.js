import {routeKey,routeResult} from './model.js';
const ENDPOINT='https://routing.openstreetmap.de/routed-car';
const STORE='fhr-road-routes-v1';
const TTL=7*24*60*60*1000;

export class Routing {
  constructor(){
    this.cache={};this.nextRequest=0;
    try{this.cache=JSON.parse(localStorage.getItem(STORE)||'{}');}catch{/* Storage is optional. */}
  }
  cached(a,b){
    const value=this.cache[routeKey(a,b)];
    return value&&Date.now()-Date.parse(value.fetched_at)<TTL?value:null;
  }
  async get(a,b,signal){
    const cached=this.cached(a,b);if(cached)return cached;
    await new Promise((resolve,reject)=>{
      if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
      const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.max(0,this.nextRequest-Date.now()));
      signal.addEventListener('abort',abort,{once:true});
    });
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    this.nextRequest=Date.now()+1100;
    const coordinates=`${a.longitude},${a.latitude};${b.longitude},${b.latitude}`;
    const controller=new AbortController();
    const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(`${ENDPOINT}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,{signal:controller.signal});
      if(!response.ok)throw new Error(`Routing service returned ${response.status}`);
      const result=routeResult(await response.json());
      this.cache[routeKey(a,b)]=result;
      // Keep cache bounded; quota failures do not interrupt the map.
      const entries=Object.entries(this.cache).sort((a,b)=>Date.parse(b[1].fetched_at)-Date.parse(a[1].fetched_at)).slice(0,200);
      this.cache=Object.fromEntries(entries);
      try{localStorage.setItem(STORE,JSON.stringify(this.cache));}catch{/* In-memory cache remains usable. */}
      return result;
    }catch(error){if(!signal.aborted&&error.name==='AbortError')throw new Error('Routing service timed out');throw error;}
    finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
  }
}
