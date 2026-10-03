/* Authoritative 120 Hz simulation. No DOM, animation, audio or wall clock. */
(function(g){
'use strict';
const C=typeof module!=='undefined'?require('./config.js'):g.QianliuConfig;
const EPS=1e-6, DT=1/120;
const v=(x=0,y=0)=>({x,y}), copy=a=>v(a.x,a.y), add=(a,b)=>v(a.x+b.x,a.y+b.y), sub=(a,b)=>v(a.x-b.x,a.y-b.y), mul=(a,s)=>v(a.x*s,a.y*s), dot=(a,b)=>a.x*b.x+a.y*b.y, len=a=>Math.hypot(a.x,a.y), mix=(a,b,t)=>add(a,mul(sub(b,a),t)), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function normalized(a){const l=len(a);return l>0?mul(a,1/l):v();}
function analog(x,y){const l=Math.hypot(x,y);return l<=.18?v():mul(v(x,y),(Math.min(l,1)-.18)/(.82*l));}
function digital(x,y){const l=Math.hypot(x,y);return l>1?mul(v(x,y),1/l):v(x,y);}
function transform(p,id,vector=false){return v(id&1?(vector?-p.x:1280-p.x):p.x,id&2?(vector?-p.y:720-p.y):p.y);}
function circleSweep(p,q,c,r){
 const a=sub(p,c),d=sub(q,p),cc=dot(a,a)-r*r;if(cc<=1e-10)return 0;
 const aa=dot(d,d);if(aa<1e-18)return null;const b=2*dot(a,d),disc=b*b-4*aa*cc;if(disc<0)return null;
 const t=(-b-Math.sqrt(disc))/(2*aa);return t>=-1e-10&&t<=1+1e-10?clamp(t,0,1):null;
}
function capsuleSweep(p,q,a,b,r=8){
 const ab=sub(b,a),L=len(ab);if(L<1e-12)return circleSweep(p,q,a,r);
 const d=mul(ab,1/L),n=v(-d.y,d.x),ap=sub(p,a),dq=sub(q,p),x=dot(ap,d),y=dot(ap,n),dx=dot(dq,d),dy=dot(dq,n);
 const nearest=clamp(x,0,L);if((x-nearest)**2+y*y<=r*r+1e-10)return 0;
 let best=null;const take=t=>{if(t!==null&&(best===null||t<best))best=t;};take(circleSweep(p,q,a,r));take(circleSweep(p,q,b,r));
 if(Math.abs(dy)>1e-12)for(const edge of [-r,r]){const t=(edge-y)/dy,xx=x+dx*t;if(t>=0&&t<=1&&xx>=0&&xx<=L)take(t);}
 return best;
}
function wallSweep(p,q){
 const d=sub(q,p),out=[];const check=(axis,bound,side)=>{if(Math.abs(d[axis])<1e-14)return;const t=(bound-p[axis])/d[axis];if(t>=-1e-10&&t<=1+1e-10)out.push({t:clamp(t,0,1),side});};
 if(d.x<0)check('x',94,'left');if(d.x>0)check('x',1186,'right');if(d.y<0)check('y',64,'top');if(d.y>0)check('y',656,'bottom');
 if(!out.length)return null;out.sort((a,b)=>a.t-b.t);return {t:out[0].t,sides:out.filter(e=>Math.abs(e.t-out[0].t)<=EPS).map(e=>e.side)};
}
function geometry(a,p){const L=len(sub(p,a)),d=L>1e-12?mul(sub(p,a),1/L):v();return {a:copy(a),p:copy(p),L,d};}
function gateFor(center,id){const p=transform(v(...center),id),side=p.x===90?'left':p.x===1190?'right':p.y===60?'top':'bottom';return {p,side};}
function eventCompare(a,b){return Math.abs(a.time-b.time)<=EPS?(a.priority-b.priority||a.uid-b.uid):a.time-b.time;}
class Engine{
 constructor(options={}){this.options=options;this.uid=0;this.railUid=0;this.generations=new Uint32Array(1024);this.recording=false;this.log=[];this.inputLog=[];this.start(false,0,0);this.mode='MENU';}
 emit(event,data={}){const e={event,sim_tick:this.tick,phase:this.tutorial?this.tutorialStep:'formal',...data};this.lastEvents.push(e);if(this.recording)this.log.push(e);if(this.onEvent)this.onEvent(e);return e;}
 start(tutorial=false,transformId=0,countdown=240){
 this.mode=tutorial?'TUTORIAL':countdown?'COUNTDOWN':'RUNNING';this.previousMode=null;this.tick=0;this.countdown=countdown;this.transformId=transformId;this.tutorial=tutorial;this.tutorialStep='A';this.stepTick=0;this.sourceStart=null;this.releaseB=false;this.needleSeen=false;this.hintShown=false;
 this.p=transform(tutorial?v(400,360):v(640,360),tutorial?0:transformId);this.pPrev=copy(this.p);this.hp=3;this.invulnerableUntil=0;this.score=0;this.gateCount=0;this.totalDelivered=0;this.damageCount=0;this.current=null;this.rails=new Map();this.objects=[];this.slots=new Array(1024).fill(null);this.freeSlots=Array.from({length:1024},(_,i)=>1023-i);this.gateIndex=0;this.delivered=0;this.gateState='OPEN';this.openAt=0;this.phase=-1;this.warnings=[];this.result=null;this.invalid=null;this.deathHistory=[];this.lastEvents=[];this.log=[];this.inputLog=[];this.lastInput={};this.emit('session_start',{phase:tutorial?'tutorial':'formal',transform_id:transformId,cosmetic_seed:1,uid_base:this.uid,rail_uid_base:this.railUid});if(tutorial)this.emit('tutorial_step',{step_id:'A'});
 }
 pause(reason='manual'){if(['RUNNING','TUTORIAL','COUNTDOWN'].includes(this.mode)){this.previousMode=this.mode;this.mode='PAUSED';this.emit('pause',{reason});}}
 resume(){if(this.mode==='PAUSED'&&!this.invalid){this.mode=this.previousMode;this.emit('resume',{reason:'explicit'});}}
 invalidate(error_code,object_uid=null,diagnostic=''){this.invalid=error_code;this.previousMode=this.mode;this.mode='PAUSED';this.emit('invalid_session',{error_code,object_uid,diagnostic});}
 gate(){if(this.tutorial)return gateFor(this.tutorialStep==='A'?[1190,360]:[90,360],0);return gateFor(C.gate.sequence[this.gateIndex].center,this.transformId);}
 nextGate(){return this.tutorial?gateFor([90,360],0):gateFor(C.gate.sequence[(this.gateIndex+1)%8].center,this.transformId);}
 spawn(kind,pos,velocity,extra={}){
 if(!this.freeSlots.length){this.invalidate('POOL_OVERFLOW');return null;}const slot=this.freeSlots.pop();
 const b={slot,uid:++this.uid,generation:++this.generations[slot],kind,state:'FREE',pos:copy(pos),prev:copy(pos),velocity:copy(velocity),birth:this.tick,ready:this.tick,bounce:kind==='bead'?1:0,routed:false,railId:null,u:0,history:[],alive:true,...extra};this.slots[slot]=b;this.objects.push(b);return b;
 }
 remove(b){if(!b.alive)return;b.alive=false;this.slots[b.slot]=null;this.freeSlots.push(b.slot);}
 boundCount(id){let n=0;for(const b of this.objects)if(b.alive&&b.state==='BOUND'&&b.railId===id)n++;return n;}
 drain(r,geom){if(this.boundCount(r.id)){Object.assign(r,geom,{state:'DRAINING'});this.emit('rail_drain_created',{rail_id:r.id,anchor:[r.a.x,r.a.y],endpoint:[r.p.x,r.p.y],bound_count:this.boundCount(r.id)});}else this.rails.delete(r.id);}
 release(){if(!this.current)return;const r=this.current;this.emit('rail_released',{rail_id:r.id,was_active:r.state==='ACTIVE',bound_count:this.boundCount(r.id)});if(this.tutorial&&this.tutorialStep==='B'&&(r.everActive))this.releaseB=true;this.drain(r,r);this.current=null;}
 press(){if(this.current)return;const r={id:++this.railUid,...geometry(this.p,this.p),state:'FORMING',everActive:false,lastValid:null};this.rails.set(r.id,r);this.current=r;this.emit('rail_pressed',{rail_id:r.id,anchor:[this.p.x,this.p.y]});}
 move(input){this.pPrev=copy(this.p);const delta=mul(digital(input.x||0,input.y||0),(input.focus?180:360)*DT);let p=add(this.p,delta);p.x=clamp(p.x,110,1170);p.y=clamp(p.y,80,640);
 if(this.current){const r=this.current,d=sub(p,r.a),l=len(d);if(l>300)p=add(r.a,mul(d,300/l));this.p=p;const geo=geometry(r.a,p);
 if(geo.L<64&&r.state==='ACTIVE'){
 const anchor=copy(r.a);this.drain(r,r.lastValid);const nr={id:++this.railUid,...geometry(anchor,p),state:'FORMING',everActive:true,lastValid:null};this.rails.set(nr.id,nr);this.current=nr;
 }else{const was=r.state;Object.assign(r,geo);r.state=geo.L>=64?'ACTIVE':'FORMING';if(r.state==='ACTIVE'){r.lastValid=geometry(r.a,r.p);r.everActive=true;if(was!=='ACTIVE'){this.emit('rail_active',{rail_id:r.id,anchor:[r.a.x,r.a.y],endpoint:[p.x,p.y],length:r.L});if(this.tutorial&&this.sourceStart===null)this.sourceStart=this.tick;}}}
 }else this.p=p;
 }
 source(edge,wave=null){const normal={top:v(0,1),bottom:v(0,-1),left:v(1,0),right:v(-1,0)}[edge];const t=(this.tick%3600)/120;const pos=edge==='top'?v(wave?640+220*Math.sin(2*Math.PI*t/8):640,65):edge==='bottom'?v(wave?640+220*Math.sin(2*Math.PI*t/8):640,655):edge==='left'?v(95,wave?360+180*Math.sin(2*Math.PI*t/8):360):v(1185,wave?360+180*Math.sin(2*Math.PI*t/8):360);return {pos:transform(pos,this.transformId),normal:transform(normal,this.transformId,true)};}
 spawners(){
 if(this.options.noSpawners)return;
 if(this.tutorial){
 if(this.tutorialStep!=='C'&&this.sourceStart!==null&&(this.tick-this.sourceStart)%30===0)this.spawn('bead',v(500,65),v(0,220));
 if(this.tutorialStep==='C'&&this.tick-this.stepTick===0){this.warnings=[{type:'N',pos:v(640,65),target:copy(this.p),fire:this.tick+108}];this.emit('needle_warning',{position:[640,65],target:[this.p.x,this.p.y]});}
 }else{
 const phase=Math.floor(this.tick/3600),t=this.tick%3600;if(phase!==this.phase){this.phase=phase;this.warnings=[];this.emit('phase_changed',{phase:phase+1});}
 for(const em of C.phases[phase].emitters){const {pos,normal}=this.source(em.edge,em.template==='S');
 if(em.template==='N'){if(t%em.period_ticks===0){this.warnings.push({type:'N',pos,target:copy(this.p),fire:this.tick+108});this.emit('needle_warning',{position:[pos.x,pos.y],target:[this.p.x,this.p.y]});}}
 else if(t<108){if(t===0)this.warnings.push({type:em.template,pos,normal,fire:this.tick+108});}
 else if((t-108)%(em.template==='S'?15:60)===0){for(const degrees of em.template==='S'?[0]:[-18,0,18]){const mirrorSign=((this.transformId&1)!==0)^((this.transformId&2)!==0)?-1:1,angle=degrees*mirrorSign*Math.PI/180,n=v(normal.x*Math.cos(angle)-normal.y*Math.sin(angle),normal.x*Math.sin(angle)+normal.y*Math.cos(angle));this.spawn('bead',pos,mul(n,220));}}
 }
 }
 for(const w of this.warnings)if(w.type==='N'&&w.fire===this.tick){this.spawn('needle',w.pos,mul(normalized(sub(w.target,w.pos)),540));this.emit('needle_fired',{target:[w.target.x,w.target.y]});}
 this.warnings=this.warnings.filter(w=>w.fire>this.tick);
 }
 geometryBudget(count,uid){if(count>4){this.invalidate('GEOMETRY_LIMIT',uid);return false;}return true;}
 atGate(point,sides){const gate=this.gate();return sides.includes(gate.side)&&Math.abs((gate.side==='left'||gate.side==='right'?point.y-gate.p.y:point.x-gate.p.x))<=76;}
 plan(b){
 let pos=copy(b.pos),velocity=copy(b.velocity),bounce=b.bounce,time=0,count=0;const events=[],segments=[];let terminal=false;
 while(time<1-1e-12){const q=add(pos,mul(velocity,DT*(1-time)));const choices=[];
 const player0=mix(this.pPrev,this.p,time);const hit=circleSweep(sub(pos,player0),sub(q,this.p),v(),10);if(hit!==null)choices.push({f:hit,type:'damage',priority:0});
 const wall=wallSweep(pos,q);if(wall)choices.push({f:wall.t,type:'wall',priority:1,sides:wall.sides});
 const r=this.current;if(b.kind==='bead'&&r?.state==='ACTIVE'){const a=add(r.a,mul(r.d,16)),e=add(r.p,mul(r.d,-24));const cap=capsuleSweep(pos,q,a,e);if(cap!==null)choices.push({f:cap,type:'capture',priority:2,railId:r.id});}
 if(!choices.length){segments.push({a:pos,b:q,t0:time,t1:1});pos=q;break;}
 choices.sort((a,b)=>Math.abs(a.f-b.f)<=EPS?a.priority-b.priority:a.f-b.f);const first=choices[0],t=time+(1-time)*first.f,point=mix(pos,q,first.f);segments.push({a:pos,b:point,t0:time,t1:t});
 if(!this.geometryBudget(++count,b.uid))break;
 const ev={...first,time:t,pos:point,uid:b.uid,b};events.push(ev);
 if(first.type==='wall'){
 if(b.kind==='bead'&&this.atGate(point,first.sides)){ev.type='gate';terminal=true;pos=point;break;}
 if(b.kind==='needle'||bounce===0){ev.remove=true;terminal=true;pos=point;break;}
 if(first.sides.includes('left')||first.sides.includes('right'))velocity.x*=-1;if(first.sides.includes('top')||first.sides.includes('bottom'))velocity.y*=-1;bounce=0;ev.velocity=copy(velocity);ev.bounce=0;pos=point;time=t;
 }else{terminal=true;pos=point;break;}
 }
 return {b,pos,velocity,bounce,events,segments,terminal};
 }
 deliver(b){this.remove(b);if(!b.routed||this.gateState!=='OPEN'||(this.tutorial&&this.tutorialStep==='C'))return;
 this.score+=10;this.delivered++;this.totalDelivered++;this.emit('delivered',{uid:b.uid,gate_id:this.tutorial?this.tutorialStep:C.gate.sequence[this.gateIndex].id,routed:true,score_delta:10,count_delta:1});
 if(this.delivered===(this.tutorial?6:20)){this.score+=100;this.gateCount++;this.gateState='DRAINING';this.openAt=this.tick+72;this.emit('gate_completed',{gate_id:this.tutorial?this.tutorialStep:C.gate.sequence[this.gateIndex].id,gate_count:this.gateCount,score_delta:100,open_at_tick:this.openAt});}
 }
 damage(b,point){
 this.deathHistory=b.history.slice(-30).map(s=>({...s}));this.deathHistory.push({tick:this.tick,x:point.x,y:point.y});this.deathHistory=this.deathHistory.slice(-30);this.deathObject={uid:b.uid,kind:b.kind,pos:copy(point)};this.remove(b);
 if(this.tutorial&&this.tutorialStep==='C'&&b.kind==='needle')this.needleSeen=true;
 if(this.tick<this.invulnerableUntil)return;
 const before=this.hp;if(!this.tutorial)this.hp--;this.damageCount++;this.invulnerableUntil=this.tick+120;
 for(const other of this.objects)if(other.alive&&other.state==='FREE'&&len(sub(other.pos,this.p))<=48)this.remove(other);
 this.emit(this.tutorial?'would_hit':'damage',{uid:b.uid,kind:b.kind,position:[point.x,point.y],hp_before:before,hp_after:this.hp,invulnerable_until_tick:this.invulnerableUntil,tutorial_step:this.tutorialStep});
 if(this.hp===0)this.finish('death');
 }
 finish(reason){this.mode='RESULTS';this.result={reason,score:this.score,gateCount:this.gateCount,totalDelivered:this.totalDelivered,hp:this.hp,survivalTicks:this.tick};this.emit('session_end',{reason,score:this.score,gate_count:this.gateCount,hp:this.hp,survival_ticks:this.tick});}
 tutorialTransition(){
 if(this.tutorialStep==='A'&&this.gateState==='DRAINING'&&this.tick>=this.openAt){this.tutorialStep='B';this.stepTick=this.tick;this.releaseB=false;this.delivered=0;this.gateState='OPEN';this.hintShown=false;this.emit('tutorial_step',{step_id:'B'});}
 if(this.tutorialStep==='B'&&this.gateState==='DRAINING'&&this.tick>=this.openAt&&this.releaseB){this.tutorialStep='C';this.stepTick=this.tick;this.hintShown=false;this.emit('tutorial_step',{step_id:'C'});}
 if(this.tick-this.stepTick>=7200&&!this.hintShown){this.hintShown=true;this.emit('hint_shown',{step_id:this.tutorialStep,hint_id:'local_demo'});}
 }
 step(input={}){
 this.lastEvents=[];if(!['RUNNING','TUTORIAL','COUNTDOWN'].includes(this.mode))return;
 if(this.mode==='COUNTDOWN'){if(--this.countdown<=0)this.mode='RUNNING';return;}
 this.lastInput={x:input.x||0,y:input.y||0,focus:!!input.focus,press:!!input.press,release:!!input.release};if(this.recording)this.inputLog.push({tick:this.tick,...this.lastInput});
 if(input.release)this.release();if(input.press)this.press();this.move(input);
 for(const b of this.objects)if(b.alive&&this.tick-b.birth>=(b.kind==='bead'?1440:360))this.remove(b);
 if(!this.tutorial&&this.gateState==='DRAINING'&&this.tick>=this.openAt){this.gateIndex=(this.gateIndex+1)%8;this.delivered=0;this.gateState='OPEN';this.emit('gate_opened',{gate_id:C.gate.sequence[this.gateIndex].id});}
 if(this.tutorial)this.tutorialTransition();this.spawners();if(this.invalid)return;
 const launches=[];
 for(const b of this.objects){if(!b.alive)continue;b.prev=copy(b.pos);if(b.state==='BOUND'&&b.ready<=this.tick){const r=this.rails.get(b.railId);if(!r||r.L<64){this.invalidate('ORPHAN_RAIL',b.uid);return;}b.u+=780*DT/r.L;b.pos=add(r.a,mul(sub(r.p,r.a),Math.min(1,b.u)));if(b.u>=1-1e-12)launches.push({b,r});}}
 const plans=[];const events=[];
 for(const b of this.objects)if(b.alive&&b.state==='FREE'&&b.ready<=this.tick){const plan=this.plan(b);plans.push(plan);events.push(...plan.events);if(this.invalid)return;}
 events.sort(eventCompare);
 for(const ev of events){const b=ev.b;if(!b.alive||this.mode==='RESULTS')continue;
 b.pos=copy(ev.pos);
 if(ev.type==='damage')this.damage(b,ev.pos);
 else if(ev.type==='gate'){if(this.tutorial&&b.kind==='needle')this.needleSeen=true;this.deliver(b);}
 else if(ev.type==='capture'){const r=this.rails.get(ev.railId),s=clamp(dot(sub(ev.pos,r.a),r.d),16,r.L-24),was=b.routed;b.u=s/r.L;b.state='BOUND';b.railId=r.id;b.pos=add(r.a,mul(r.d,s));b.routed=true;b.ready=this.tick+1;this.emit('captured',{uid:b.uid,rail_id:r.id,u:b.u,routed_previously:was});}
 else if(ev.remove){if(this.tutorial&&this.tutorialStep==='C'&&b.kind==='needle')this.needleSeen=true;this.remove(b);}
 else{b.velocity=copy(ev.velocity);b.bounce=ev.bounce;this.emit('bounced',{uid:b.uid});}
 }
 if(this.mode==='RESULTS')return;
 for(const plan of plans)if(plan.b.alive&&plan.b.state==='FREE'&&!plan.terminal){plan.b.pos=plan.pos;plan.b.velocity=plan.velocity;plan.b.bounce=plan.bounce;}
 for(const {b,r} of launches)if(b.alive){b.state='FREE';b.railId=null;b.pos=add(r.p,mul(r.d,12));b.velocity=mul(r.d,420);b.ready=this.tick+1;this.emit('launched',{uid:b.uid,rail_id:r.id,position:[b.pos.x,b.pos.y],velocity:[b.velocity.x,b.velocity.y]});}
 for(const b of this.objects)if(b.alive){b.history.push({tick:this.tick,x:b.pos.x,y:b.pos.y});if(b.history.length>30)b.history.shift();}
 this.objects=this.objects.filter(b=>b.alive);for(const [id,r]of this.rails)if(r.state==='DRAINING'&&this.boundCount(id)===0)this.rails.delete(id);
 if(this.recording&&this.tick%12===0)this.emit('geometry_sample',{player:[this.p.x,this.p.y],rails:[...this.rails.values()].map(r=>({rail_id:r.id,anchor:[r.a.x,r.a.y],endpoint:[r.p.x,r.p.y],state:r.state})),object_count:this.objects.length});
 this.tick++;if(!this.tutorial&&this.tick>=18000)this.finish(this.hp>0&&this.gateCount>=5?'success':'insufficient');
 }
 snapshot(){return {tick:this.tick,mode:this.mode,p:this.p,hp:this.hp,score:this.score,gateCount:this.gateCount,delivered:this.delivered,gateIndex:this.gateIndex,gateState:this.gateState,rails:[...this.rails.values()].map(r=>({id:r.id,state:r.state,a:r.a,p:r.p,L:r.L})),objects:this.objects.filter(b=>b.alive).sort((a,b)=>a.uid-b.uid).map(b=>({uid:b.uid,kind:b.kind,state:b.state,pos:b.pos,velocity:b.velocity,birth:b.birth,ready:b.ready,bounce:b.bounce,routed:b.routed,railId:b.railId,u:b.u}))};}
}
const API={Engine,C,DT,EPS,v,add,sub,mul,len,clamp,normalized,analog,digital,transform,geometry,circleSweep,capsuleSweep,wallSweep,eventCompare};if(typeof module!=='undefined')module.exports=API;else g.Qianliu=API;
})(typeof globalThis!=='undefined'?globalThis:this);
