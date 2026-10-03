/* BENGXIAN 0.1. Pure simulation; rendering, audio and storage cannot change rules. */
(function(root){
'use strict';
const D=typeof module!=='undefined'?require('./data.js'):root.BXData, R=D.rules;
const cp=p=>({x:p.x,y:p.y}), v=(x,y)=>({x,y}), mix=(a,b,t)=>v(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
const len=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function pointSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;const u=l?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/l,0,1):0;return {d:len(p,v(a.x+u*dx,a.y+u*dy)),u};}
function swept(a0,a1,b0,b1,r){return pointSegment(v(0,0),v(a0.x-b0.x,a0.y-b0.y),v(a1.x-b1.x,a1.y-b1.y)).d<=r;}
function lineContact(p,a,b){const l=len(a,b);if(l<R.line.minimum_active_length)return null;const t=R.line.end_exclusion/l;const hit=pointSegment(p,mix(a,b,t),mix(a,b,1-t));return hit.d<=7.6+1e-9?{u:t+hit.u*(1-2*t)}:null;}
const score=n=>10*n+2*n*(n-1);
// Mulberry32: explicitly local to this HTML build, not Godot's PRNG.
function rng(seed){let state=seed>>>0;return ()=>{let t=state+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const EDGES=['N','E','S','W'];
function expand(seed){
 const random=rng(seed),out=[];let history=[];
 for(let phase=0;phase<6;phase++){
  let bag=[],needle=Math.floor(random()*4);
  for(const template of D.schedule.events.filter(e=>e.phase===phase)){
   const e={...template,locked_target:null,warned:false,shots:0};
   if(e.kind==='CUTTER'){e.edge=EDGES[needle++%4];e.lane=1;}
   else{
    if(!bag.length){bag=EDGES.slice();for(let i=3;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}}
    if(history.length>=2&&history.at(-1)===bag[0]&&history.at(-2)===bag[0]){const j=bag.findIndex(x=>x!==bag[0]);[bag[0],bag[j]]=[bag[j],bag[0]];}
    e.edge=bag.shift();history.push(e.edge);e.lane=e.kind==='CROSS'?1:Math.floor(random()*3);
   }
   out.push(e);
  }
 }
 return out;
}
class Game{
 constructor(seed=R.random.default_seed,mode='standard',practice=false){this.reset(seed,mode,practice);}
 reset(seed=this.seed,mode=this.mode,practice=false){
  this.seed=clamp(Math.floor(Number(seed)||0),0,2147483647);this.mode=mode;this.practice=practice;
  this.state='READY';this.action='FREE';this.pos=v(...R.player.start);this.anchor=null;this.cargo=[];
  this.hp=3;this.score=0;this.tick=0;this.clock=0;this.cooldown=0;this.invulnerable=0;this.recall=null;
  this.bullets=[];this.nextId=1;this.events=[];this.eventSeq=0;this.waves=expand(this.seed);this.reason='';
  this.stats={maxString:0,banks:0,cutLoss:0,captured:0,cleared:0,born:0,peak:0,capHit:0};
  this.tutorial={step:1,burst:null,needle:null,needleDone:false,done:false,needsCenter:false};
  this.pendingRelease=false;this.pauseReason='';this.emit('ready');return this;
 }
 emit(type,extra={}){this.events.push({seq:++this.eventSeq,tick:this.tick,clock:this.clock,type,pos:cp(this.pos),action:this.action,cargo:this.cargo.length,score:this.score,...extra});}
 drain(){const e=this.events;this.events=[];return e;}
 pause(reason='主动暂停'){if(this.state==='RUNNING'||this.state==='FINISHING'||this.state==='READY'){this.beforePause=this.state;this.state='PAUSED';this.pauseReason=reason;this.emit('pause',{reason});}}
 resume(){if(this.state==='PAUSED'){this.state=this.beforePause;this.emit('resume');}}
 pausedRelease(){if(this.state==='PAUSED'&&['OPEN','FULL'].includes(this.action))this.pendingRelease=true;}
 deploy(){if((this.action==='FREE'||this.action==='RECOVER')&&this.tick>=this.cooldown){this.anchor=cp(this.pos);this.cargo=[];this.action='OPEN';this.emit('deploy');}else this.emit('blocked',{reason:this.action==='RECALL'?'正在回到锚点':'收线后稍等，再重新按下'});}
 release(){
  if(!['OPEN','FULL'].includes(this.action))return;
  this.emit('release');
  if(!this.cargo.length){this.action='RECOVER';this.anchor=null;this.cooldown=this.tick+12;this.emit('empty_release');return;}
  const n=Math.max(6,Math.ceil(len(this.pos,this.anchor)*120/1280));
  this.recall={start:cp(this.pos),ticks:n,elapsed:0};this.action='RECALL';this.emit('recall_begin',{duration:n});
 }
 spawn(type,p,velocity,birth=this.clock){
  if(this.bullets.filter(b=>b.active).length>=600){this.stats.capHit++;this.emit('cap_hit');return null;}
  const b={id:this.nextId++,type,x:p.x,y:p.y,vx:velocity.x,vy:velocity.y,birth,active:true};this.bullets.push(b);this.stats.born++;this.stats.peak=Math.max(this.stats.peak,this.bullets.filter(x=>x.active).length);return b;
 }
 remove(b,reason){if(!b.active)return;b.active=false;if(reason==='recall'||reason==='arrival'||reason==='hit')this.stats.cleared++;this.emit('remove',{bullet_id:b.id,reason});}
 wavesStep(nextClock){
  for(const e of this.waves){
   if(!e.warned&&nextClock>=e.warning_clock){
    e.warned=true;const target=e.kind==='CUTTER'&&['OPEN','FULL'].includes(this.action)&&len(this.pos,this.anchor)>=48?mix(this.anchor,this.pos,.5):this.pos;
    if(e.kind==='FAN'||e.kind==='CUTTER')e.locked_target=cp(target);
    this.emit('warning',{event_id:e.event_id,kind:e.kind,edge:e.edge});
   }
   const count=e.kind==='FAN'?3:1;
   while(e.shots<count&&nextClock>=e.fire_clock+e.shots*180){
    const birth=e.fire_clock+e.shots*180;if(birth>=174*600){e.shots=count;break;}
    this.fire(e,birth);e.shots++;
   }
  }
 }
 fire(e,birth){
  const comb=edge=>{const p=R.ports[edge][e.lane],vertical=edge==='N'||edge==='S',spacing=vertical?44:28;
   const vel=v(edge==='E'?-150:edge==='W'?150:0,edge==='S'?-150:edge==='N'?150:0);
   for(let k=-4;k<=4;k++)this.spawn('NORMAL',v(p[0]+(vertical?k*spacing:0),p[1]+(vertical?0:k*spacing)),vel,birth);
  };
  if(e.kind==='COMB'||e.kind==='CROSS'){comb(e.edge);if(e.kind==='CROSS')comb(EDGES[(EDGES.indexOf(e.edge)+1)%4]);}
  else{const p=v(...R.ports[e.edge][e.lane]),q=e.locked_target||this.pos,angle=Math.atan2(q.y-p.y,q.x-p.x);
   if(e.kind==='CUTTER')this.spawn('CUTTER',p,v(Math.cos(angle)*260,Math.sin(angle)*260),birth);
   else for(const off of R.patterns.FAN.angles_degrees){const a=angle+off*Math.PI/180;this.spawn('NORMAL',p,v(Math.cos(a)*180,Math.sin(a)*180),birth);}
  }
  this.emit('fire',{event_id:e.event_id,kind:e.kind});
 }
 cut(){const lost=this.cargo.length;this.stats.cutLoss+=lost;const a=cp(this.anchor),p=cp(this.pos);this.cargo=[];this.anchor=null;this.action='RECOVER';this.cooldown=this.tick+18;this.emit('cut',{lost,a,p});
  if(this.practice&&this.tutorial.step===3&&this.tutorial.needleDone){this.tutorial.done=true;this.emit('tutorial_done',{reason:'切线针碰到线，暂存会全部丢失；身体没有因此扣命。'});}
 }
 hit(){
  this.emit('hit',{practice:this.practice});if(!this.practice)this.hp--;
  this.cargo=[];this.anchor=null;this.action='RECOVER';this.cooldown=this.tick+24;this.invulnerable=this.tick+120;
  for(const b of this.bullets)if(b.active&&len(this.pos,b)<=125)this.remove(b,'hit');
  if(this.practice){this.tutorial.burst=null;this.tutorial.needle=null;this.tutorial.needleDone=false;}
  if(this.hp===0)this.end('生命用完，挑战中断');
 }
 arrive(){
  this.pos=cp(this.anchor);for(const b of this.bullets)if(b.active&&len(this.pos,b)<=29)this.remove(b,'arrival');
  const n=this.cargo.length,points=score(n);this.score+=points;this.stats.maxString=Math.max(this.stats.maxString,n);this.stats.banks++;
  this.emit('bank',{count:n,points,anchor:cp(this.anchor)});this.cargo=[];this.anchor=null;this.recall=null;this.action='RECOVER';this.cooldown=this.tick+24;this.invulnerable=Math.max(this.invulnerable,this.tick+8);
  if(this.practice){if(this.tutorial.step===2){this.tutorial.step=3;this.tutorial.burst=null;this.tutorial.needle=null;this.emit('tutorial_step',{step:3});}
   else if(this.tutorial.step===3&&this.tutorial.needle){this.tutorial.done=true;this.emit('tutorial_done',{reason:'收线赶在针前完成，带着货物安全回到了锚点。'});}}
  if(this.state==='FINISHING')this.end('存活 180 秒，挑战完成');
 }
 end(reason){this.state='RESULTS';this.reason=reason;this.cargo=[];this.anchor=null;this.emit('run_end',{reason});}
 teachingOrigin(distance){
  if(!['OPEN','FULL'].includes(this.action)||len(this.anchor,this.pos)<48)return null;
  const m=mix(this.anchor,this.pos,.5),l=len(this.anchor,this.pos),nx=-(this.pos.y-this.anchor.y)/l,ny=(this.pos.x-this.anchor.x)/l;
  for(const sign of [1,-1]){const p=v(m.x+nx*distance*sign,m.y+ny*distance*sign);if(p.x>=140&&p.x<=1140&&p.y>=124&&p.y<=596)return {p,dir:v(-nx*sign,-ny*sign),target:m};}return null;
 }
 tutorialStep(nextClock){
  const t=this.tutorial;if(t.done)return;
  if(t.step===1&&['OPEN','FULL'].includes(this.action)&&len(this.pos,this.anchor)>=120){t.step=2;this.emit('tutorial_step',{step:2});}
  if(t.step>=2&&!t.burst&&this.cargo.length===0&&['OPEN','FULL'].includes(this.action)&&len(this.pos,this.anchor)>=48){
   const o=this.teachingOrigin(80);t.needsCenter=!o;if(o)t.burst={...o,birth:nextClock,shots:0};
  }
  if(t.burst){while(t.burst.shots<3&&nextClock>=t.burst.birth+t.burst.shots*180){this.spawn('NORMAL',t.burst.p,v(t.burst.dir.x*80,t.burst.dir.y*80),t.burst.birth+t.burst.shots*180);t.burst.shots++;}
   if(t.burst.shots===3&&this.cargo.length===0&&!this.bullets.some(b=>b.active&&b.type==='NORMAL'))t.burst=null;
  }
  if(t.step===3&&this.cargo.length>0&&!t.needle&&!t.needleDone){const o=this.teachingOrigin(160);t.needsCenter=!o;if(o){t.needle={...o,fire:nextClock+600};this.emit('warning',{kind:'CUTTER',tutorial:true});}}
  if(t.needle&&!t.needleDone&&nextClock>=t.needle.fire){this.spawn('CUTTER',t.needle.p,v(t.needle.dir.x*120,t.needle.dir.y*120),t.needle.fire);t.needleDone=true;}
 }
 step(input={}){
  if(this.state==='PAUSED'||this.state==='RESULTS')return;
  let mx=Number(input.x)||0,my=Number(input.y)||0;const magnitude=Math.hypot(mx,my);if(magnitude>1){mx/=magnitude;my/=magnitude;}
  if(this.state==='READY'){if(!magnitude&&!input.press)return;this.state='RUNNING';this.emit('run_start');}
  this.tick++;if(this.action==='RECOVER'&&this.tick>=this.cooldown)this.action='FREE';
  const finishing=this.state==='FINISHING';
  if(!finishing){if(input.press)this.deploy();if(input.release||this.pendingRelease){this.release();this.pendingRelease=false;}}
  const start=cp(this.pos);let target=cp(start);
  if(this.action!=='RECALL'&&!finishing){const speed=input.precision?140:280;target=v(clamp(start.x+mx*speed/120,136,1144),clamp(start.y+my*speed/120,120,600));
   if(['OPEN','FULL'].includes(this.action)){const l=len(target,this.anchor);if(l>320)target=mix(this.anchor,target,320/l);}}
  const recall=this.action==='RECALL'?this.recall:null;
  const positionAt=q=>{if(recall){const progress=clamp((recall.elapsed+q)/recall.ticks,0,1);return mix(recall.start,this.anchor,1-(1-progress)*(1-progress));}return mix(start,target,q);};
  const du=finishing?0:this.mode==='assist'?4:5,nextClock=this.clock+du;
  if(!finishing){if(this.practice)this.tutorialStep(nextClock);else this.wavesStep(nextClock);}
  for(let sub=0;sub<4;sub++){
   const q0=sub/4,q1=(sub+1)/4,qm=(sub+.5)/4,p0=positionAt(q0),p1=positionAt(q1),pm=positionAt(qm);
   this.pos=p1;
   for(const b of this.bullets){if(!b.active)continue;const b0=v(b.x,b.y),c0=this.clock+du*q0,c1=this.clock+du*q1,dt=Math.max(0,c1-Math.max(c0,b.birth))/600;
    b.x+=b.vx*dt;b.y+=b.vy*dt;b._prev=b0;b._mid=mix(b0,b,.5);
   }
   if(recall)for(const b of this.bullets)if(b.active&&swept(p0,p1,b._prev,b,23.1))this.remove(b,'recall');
   if(!recall&&this.tick>=this.invulnerable){for(const b of this.bullets){if(b.active&&swept(p0,p1,b._prev,b,11)){this.hit();break;}}}
   if(this.state==='RESULTS')break;
   if(['OPEN','FULL'].includes(this.action)){
    for(const b of this.bullets)if(b.active&&b.type==='CUTTER'&&lineContact(b._mid,this.anchor,pm)){this.cut();break;}
   }
   if(this.action==='OPEN'){
    for(const b of this.bullets){if(!b.active||b.type!=='NORMAL')continue;const hit=lineContact(b._mid,this.anchor,pm);if(hit){this.remove(b,'capture');this.cargo.push(hit.u);this.stats.captured++;this.emit('capture',{bullet_id:b.id,u:hit.u,at:cp(b)});if(this.cargo.length===12){this.action='FULL';this.emit('full');break;}}}
   }
  }
  this.clock=nextClock;
  for(const b of this.bullets)if(b.active&&(this.clock-b.birth>=3600||b.x< -32||b.x>1312||b.y< -32||b.y>752))this.remove(b,this.clock-b.birth>=3600?'lifetime':'bounds');
  this.bullets=this.bullets.filter(b=>b.active);
  if(recall&&this.action==='RECALL'){recall.elapsed++;if(recall.elapsed>=recall.ticks)this.arrive();}
  if(!this.practice&&this.state==='RUNNING'&&this.clock>=108000){this.clock=108000;if(this.hp===0)this.end('生命用完，挑战中断');else if(this.action==='RECALL'){this.state='FINISHING';this.emit('finishing');}else this.end('存活 180 秒，挑战完成');}
 }
 snapshot(){return {seed:this.seed,mode:this.mode,state:this.state,action:this.action,tick:this.tick,clock:this.clock,pos:cp(this.pos),anchor:this.anchor?cp(this.anchor):null,cooldown:this.cooldown,invulnerable:this.invulnerable,recall:this.recall?{...this.recall,start:cp(this.recall.start)}:null,hp:this.hp,score:this.score,cargo:this.cargo.slice(),stats:{...this.stats},bullets:this.bullets.map(b=>({id:b.id,type:b.type,x:b.x,y:b.y,vx:b.vx,vy:b.vy,birth:b.birth})),waves:this.waves.map(e=>({event_id:e.event_id,edge:e.edge,lane:e.lane,locked_target:e.locked_target,shots:e.shots}))};}
}
const api={Game,expand,score,lineContact,swept,pointSegment,rng,R,BUILD:'html-0.1.1'};
if(typeof module!=='undefined')module.exports=api;else root.BX=api;
})(typeof globalThis!=='undefined'?globalThis:this);
