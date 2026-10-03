/* TURNLINE HTML 0.1. Core rules, independent of canvas, audio and wall clock.
 * Reflection, conservative CCD, one-shot contact and finite contract ported
 * from the supplied Python reference. All coordinates use 960 × 540. */
(function(root){
'use strict';
const V={add:(a,b)=>[a[0]+b[0],a[1]+b[1]],sub:(a,b)=>[a[0]-b[0],a[1]-b[1]],mul:(a,k)=>[a[0]*k,a[1]*k],dot:(a,b)=>a[0]*b[0]+a[1]*b[1],len:a=>Math.hypot(...a),mix:(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]};
const EPS=1e-8, TUNE={dt:1/60,speed:360,start:.08,stop:.06,min:24,max:160,life:.9,recovery:.15,buffer:.1,protection:.75,actorR:10,playerR:14,lineHalf:3};
const BOUNDS={left:28,right:932,top:28,bottom:512};
const DOCKS=[{side:'top',center:520,width:112,label:'上槽'},{side:'bottom',center:440,width:112,label:'下槽'}];
const RECIPES=[
 {id:'left',name:'左口',entry:[28,300],dir:[1,0],anchor:[482,338],end:[554,266],dock:0,cue:405},
 {id:'right',name:'右口',entry:[932,300],dir:[-1,0],anchor:[478,258],end:[550,330],dock:0,cue:631},
 {id:'bottom',name:'下口',entry:[220,512],dir:[0,-1],anchor:[180,299],end:[270,257],dock:1,cue:370}
];
function finite(a){if(!Array.isArray(a)||a.length!==2||!a.every(Number.isFinite))throw Error('finite vector required');}
function reflect(v,a,b,cap){[v,a,b].forEach(finite);if(!Number.isFinite(cap)||cap<0)throw Error('invalid speed cap');const d=V.sub(b,a),l=V.len(d);if(l<=1e-9)throw Error('degenerate line');const n=[-d[1]/l,d[0]/l],o=V.sub(v,V.mul(n,2*V.dot(v,n))),s=V.len(o);return s>cap?V.mul(o,cap/s):o;}
function distance(p,a,b){const ab=V.sub(b,a),q=V.dot(ab,ab);const t=q<1e-24?0:Math.max(0,Math.min(1,V.dot(V.sub(p,a),ab)/q));return V.len(V.sub(p,V.add(a,V.mul(ab,t))));}
function ccd(p0,p1,a0,a1,b0,b1,r,tol=1e-8,budget=256){
 [p0,p1,a0,a1,b0,b1].forEach(finite);if(!Number.isFinite(r)||r<0||!Number.isFinite(tol)||tol<=0||budget<1)throw Error('invalid CCD');
 const bound=V.len(V.sub(p1,p0))+Math.max(V.len(V.sub(a1,a0)),V.len(V.sub(b1,b0)));let t=0,gap=Infinity;
 for(let i=1;i<=budget;i++){gap=distance(V.mix(p0,p1,t),V.mix(a0,a1,t),V.mix(b0,b1,t))-r;if(gap<=tol)return {status:'hit',toi:t,iterations:i,gap};if(bound<=1e-15)return {status:'no_hit',toi:null,iterations:i,gap};const s=gap/bound;if(s>1-t)return {status:'no_hit',toi:null,iterations:i,gap};const nt=Math.min(1,t+s);if(nt<=t)return {status:'uncertain',toi:t,iterations:i,gap};t=nt;}return {status:'uncertain',toi:t,iterations:budget,gap};
}
class OneShotLine {constructor(){this.consumed=false;}resolve(cs){if(this.consumed)return null;cs=cs.filter(c=>c.raw!==false&&Number.isFinite(c.toi)&&c.toi>=0&&c.toi<=1);if(!cs.length)return null;const first=Math.min(...cs.map(c=>c.toi)),win=cs.filter(c=>c.toi<=first+EPS).sort((a,b)=>a.id-b.id)[0];this.consumed=true;return win.id;}}
class Contract {
 constructor(inventory=8,target=5,deadline=180){if(!Number.isInteger(inventory)||inventory<1||!Number.isInteger(target)||target<1||target>inventory||!Number.isFinite(deadline)||deadline<=0)throw Error('invalid contract');Object.assign(this,{inventory,target,deadline,elapsed:0,delivered:0,lost:0,status:'active',reason:'',settled:new Set()});}
 check(){if(this.status!=='active')return;if(this.delivered>=this.target){this.status='win';this.reason='已送入目标数量';}else if(this.delivered+this.inventory-this.settled.size<this.target){this.status='fail';this.reason='剩余来件已经不够完成目标';}else if(this.elapsed>=this.deadline){this.status='fail';this.reason='作业时间已到';}}
 settle(id,delivered,routed=false){if(!Number.isInteger(id)||id<0||id>=this.inventory)throw Error('invalid actor id');if(this.status!=='active'||this.settled.has(id))return false;if(delivered&&!routed)throw Error('raw delivery rejected');this.settled.add(id);delivered?this.delivered++:this.lost++;this.check();return true;}
 advance(t,paused=false){if(!Number.isFinite(t)||t<0)throw Error('invalid elapsed time');if(!paused&&this.status==='active'){this.elapsed+=t;this.check();}}
}
class ActionBuffer {constructor(){this.expiry=null;}press(t){this.expiry=t+TUNE.buffer;}clear(){this.expiry=null;}consume(t){const ok=this.expiry!==null&&t<=this.expiry+EPS;this.clear();return ok;}}
function rng(seed){let a=seed>>>0;return ()=>{a+=0x6d2b79f5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function expand(seed){const random=rng(seed^0x7475726e),seq=[0,1,2];while(seq.length<8)seq.push(Math.floor(random()*3));return {version:'html-0.1',seed:seed>>>0,sequence:seq.map(i=>JSON.parse(JSON.stringify(RECIPES[i])))};}
function rootsAtLength(p,v,a,r,duration){const d=V.sub(p,a),A=V.dot(v,v),B=2*V.dot(d,v),C=V.dot(d,d)-r*r;if(A<EPS)return [];const disc=B*B-4*A*C;if(disc<0)return [];return [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)].filter(t=>t>EPS&&t<duration-EPS);}
function moveVelocity(v,input,dt){let m=V.len(input);if(m>1)input=V.mul(input,1/m);const target=V.mul(input,TUNE.speed),d=V.sub(target,v),l=V.len(d),step=TUNE.speed/(m>0?TUNE.start:TUNE.stop)*dt;return l<=step?target:V.add(v,V.mul(d,step/l));}
function wallTime(p,v,duration,inset=0){const out=[];for(const [side,axis,val] of [['left',0,BOUNDS.left+inset],['right',0,BOUNDS.right-inset],['top',1,BOUNDS.top+inset],['bottom',1,BOUNDS.bottom-inset]]){const moving=(side==='left'||side==='top')?v[axis]<0:v[axis]>0;if(moving){let t=(val-p[axis])/v[axis];if(t>=-EPS&&t<=duration+EPS)out.push({t:Math.max(0,t),side});}}return out;}
class World {
 constructor(recipe=expand(20261002),mode='standard'){this.recipe=JSON.parse(JSON.stringify(recipe));this.mode=mode;this.contract=new Contract(mode==='tutorial'?2:8,mode==='tutorial'?2:5,mode==='tutorial'?9999:180);this.p=[350,390];this.velocity=[0,0];this.time=0;this.tick=0;this.hp=3;this.protectedUntil=0;this.state='READY';this.line=null;this.until=0;this.buffer=new ActionBuffer();this.held=false;this.nextId=0;this.actors=[];this.events=[];this.commands=[];this.nextAt=2;this.paused=false;this.diagnostic=null;this.lineSerial=0;this.freezeResult=false;}
 emit(type,data={}){this.events.push({type,tick:this.tick,time:this.time,...data});}
 anchor(){this.line={a:[...this.p],start:this.time,id:++this.lineSerial};this.state='DRAWING';this.buffer.clear();this.emit('anchor_started',{p:[...this.p],lineId:this.line.id});}
 cancel(reason){if(this.line){this.emit('line_cancelled',{reason,lineId:this.line.id});this.line=null;this.state='RECOVERY';this.until=this.time+TUNE.recovery;}if(reason!=='consumed')this.buffer.clear();if(this.toggleMode)this.held=false;}
 clearInput(){this.held=false;this.buffer.clear();this.cancel('pause');this.velocity=[0,0];}
 setPause(v){if(v&&!this.paused)this.clearInput();this.paused=v;}
 intent(press,release,toggle=false){this.toggleMode=toggle;if(press){if(toggle&&this.held){this.held=false;this.cancel('released');this.buffer.clear();return;}this.held=true;if(this.state==='READY')this.anchor();else if(this.state==='RECOVERY'){this.buffer.press(this.time);this.emit('input_buffered');}else if(this.state==='HURT')this.emit('input_rejected',{reason:'hurt'});}if(release&&!toggle){this.held=false;this.cancel('released');this.buffer.clear();}}
 spawn(recipe,speed=260,warning=1){const actor={id:this.nextId++,recipe,p:[...recipe.entry],v:V.mul(recipe.dir,speed),r:TUNE.actorR,routed:false,committed:false,launch:this.time+warning,hit:false,dead:false};this.actors.push(actor);this.emit('warning',{id:actor.id,recipe:recipe.id});return actor;}
 prepare(){if(['RECOVERY','HURT'].includes(this.state)&&this.time>=this.until-EPS){const from=this.state;this.state='READY';if(from==='RECOVERY'&&this.held&&this.buffer.consume(this.time))this.anchor();else this.buffer.clear();}if(this.line){const l=V.len(V.sub(this.p,this.line.a));if(this.time>=this.line.start+TUNE.life-EPS)this.cancel('expired');else if(l>TUNE.max+EPS)this.cancel('too_long');else this.state=l>=TUNE.min-EPS?'ACTIVE':'DRAWING';}for(const a of this.actors)if(!a.committed&&this.time>=a.launch-EPS){a.committed=true;this.emit('launched',{id:a.id});}}
 finish(){if(this.hp<=0&&this.contract.status==='active'){this.contract.status='fail';this.contract.reason='耐久耗尽';}if(this.contract.status!=='active'&&!this.freezeResult){this.freezeResult=true;this.line=null;this.buffer.clear();this.held=false;this.velocity=[0,0];this.emit('contract_end',{status:this.contract.status,reason:this.contract.reason});}}
 step(input={},dt=TUNE.dt){if(this.paused||this.diagnostic||this.contract.status!=='active')return;if(!Number.isFinite(dt)||dt<=0||dt>.1)throw Error('invalid step');const move=input.move||[0,0];finite(move);this.prepare();this.intent(!!input.press,!!input.release,!!input.toggle);this.velocity=moveVelocity(this.velocity,move,dt);this.commands.push({tick:this.tick,move:[...move],press:!!input.press,release:!!input.release,toggle:!!input.toggle});
  if(this.mode!=='tutorial'&&this.nextId<8&&this.time>=this.nextAt-EPS&&!this.actors.some(a=>!a.dead)){this.spawn(this.recipe.sequence[this.nextId],this.mode==='practice'?180:260);}
  let remain=dt,segments=0;
  while(remain>EPS&&!this.diagnostic&&this.contract.status==='active'){
   if(++segments>128){this.diagnostic={reason:'world budget',tick:this.tick};break;}this.prepare();let duration=Math.min(remain,this.contract.deadline-this.contract.elapsed);if(duration<=EPS){this.contract.check();this.finish();break;}
   // Actual boundary slide path, line-length thresholds, launch and expiry all split time.
   for(const x of wallTime(this.p,this.velocity,duration,TUNE.playerR)){if(x.t<EPS){if(x.side==='left'||x.side==='right')this.velocity[0]=0;else this.velocity[1]=0;}else duration=Math.min(duration,x.t);}
   if(this.line){const expiry=this.line.start+TUNE.life-this.time;if(expiry>EPS)duration=Math.min(duration,expiry);for(const r of [TUNE.min,TUNE.max])for(const t of rootsAtLength(this.p,this.velocity,this.line.a,r,duration))duration=Math.min(duration,t);const l=V.len(V.sub(this.p,this.line.a));if(l>=TUNE.max-EPS&&V.dot(V.sub(this.p,this.line.a),this.velocity)>0){this.cancel('too_long');}}
   if(this.protectedUntil>this.time+EPS)duration=Math.min(duration,this.protectedUntil-this.time);for(const a of this.actors)if(!a.dead&&!a.committed&&a.launch>this.time+EPS)duration=Math.min(duration,a.launch-this.time);
   // Test interior length, so inward crossing of 24 is disabled immediately.
   const active=this.line&&V.len(V.sub(V.add(this.p,V.mul(this.velocity,duration*.5)),this.line.a))>=TUNE.min-EPS;
   const result=this.solve(duration,active);if(!result)break;remain-=duration;this.finish();
  }
  this.tick++;this.actors=this.actors.filter(a=>!a.dead);this.prepare();this.finish();
 }
 solve(duration,active){let rem=duration,count=0;
  while(rem>EPS&&this.contract.status==='active'){
   if(++count>64){this.diagnostic={reason:'contact budget',tick:this.tick};return false;}const p1=V.add(this.p,V.mul(this.velocity,rem)),events=[];
   for(const a of this.actors){if(a.dead||!a.committed)continue;const end=V.add(a.p,V.mul(a.v,rem));
    const query=(kind,res)=>{if(res.status==='uncertain'){this.diagnostic={reason:'CCD uncertain',tick:this.tick,id:a.id,kind,gap:res.gap};}else if(res.status==='hit')events.push({t:res.toi*rem,kind,a});};
    if(active&&this.line&&!a.routed)query('line',ccd(a.p,end,this.line.a,this.line.a,this.p,p1,a.r+TUNE.lineHalf));
    if(!a.routed&&!a.hit&&this.mode!=='tutorial'&&this.time>=this.protectedUntil-EPS)query('hit',ccd(a.p,end,this.p,p1,this.p,p1,a.r+TUNE.playerR));
    for(const e of wallTime(a.p,a.v,rem)){const point=V.add(a.p,V.mul(a.v,e.t));const dock=DOCKS.find(d=>d.side===e.side&&Math.abs(point[0]-d.center)<=d.width/2+EPS);events.push({t:e.t,kind:a.routed&&dock?'dock':'wall',a,dock});}
   }
   if(this.diagnostic)return false;
   const priority={line:0,dock:1,hit:2,wall:3};let event=null;if(events.length){const first=Math.min(...events.map(e=>e.t));event=events.filter(e=>e.t<=first+EPS).sort((a,b)=>priority[a.kind]-priority[b.kind]||a.a.id-b.a.id)[0];}
   const t=event?event.t:rem;this.p=V.add(this.p,V.mul(this.velocity,t));for(const a of this.actors)if(a.committed&&!a.dead)a.p=V.add(a.p,V.mul(a.v,t));this.time+=t;rem-=t;this.contract.advance(t);if(this.contract.status!=='active'){this.finish();break;}
   if(!event)break;const a=event.a;
   if(event.kind==='line'){a.v=reflect(a.v,this.line.a,this.p,V.len(a.v));a.routed=true;this.emit('redirected',{id:a.id,p:[...a.p],v:[...a.v],lineId:this.line.id});this.cancel('consumed');active=false;}
   else if(event.kind==='hit'){a.hit=true;this.hp--;this.protectedUntil=this.time+TUNE.protection;this.cancel('hurt');this.buffer.clear();this.held=false;this.state='HURT';this.until=this.time+.15;active=false;this.emit('player_hit',{id:a.id,p:[...this.p]});if(this.hp<=0){this.finish();return true;}}
   else {a.dead=true;this.contract.settle(a.id,event.kind==='dock',a.routed);this.emit(event.kind==='dock'?'dock_delivered':'lost',{id:a.id,p:[...a.p],dock:event.dock?.label});this.nextAt=this.time+2;}
   this.finish();
  }return true;
 }
}
function preview(a,b,recipe){if(V.len(V.sub(b,a))<TUNE.min)return null;const d=recipe.dir,s=V.sub(b,a),q=V.sub(a,recipe.entry),cross=(x,y)=>x[0]*y[1]-x[1]*y[0],den=cross(d,s);if(Math.abs(den)<EPS)return null;const t=cross(q,s)/den,u=cross(q,d)/den;if(t<0||u<0||u>1)return null;const p=V.add(recipe.entry,V.mul(d,t)),v=reflect(d,a,b,1),walls=wallTime(p,v,2000).sort((a,b)=>a.t-b.t);return walls.length?{p,end:V.add(p,V.mul(v,walls[0].t))}:null;}
const API={V,EPS,TUNE,BOUNDS,DOCKS,RECIPES,reflect,distance,ccd,OneShotLine,Contract,ActionBuffer,rng,expand,rootsAtLength,moveVelocity,wallTime,World,preview};if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.Turnline=API;
})(typeof globalThis!=='undefined'?globalThis:this);
