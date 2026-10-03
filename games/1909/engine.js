/* JL-D0.1 fixed-step rules. Classic script, also usable in Node for regression checks. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const point=a=>({x:a[0],y:a[1]});
function transform(p,layout,vector=false,inverse=false){
 let x=p.x-(vector?0:360),y=p.y-(vector?0:360);
 if(inverse){for(let k=0;k<layout.clockwise_quarter_turns;k++)[x,y]=[y,-x];if(layout.reflect_x_first)x=-x;}
 else{if(layout.reflect_x_first)x=-x;for(let k=0;k<layout.clockwise_quarter_turns;k++)[x,y]=[-y,x];}
 return {x:x+(vector?0:360),y:y+(vector?0:360)};
}
function capture(b,a,p,c){
 const L=distance(a,p);if(L<c.minimum_length||L>c.maximum_length)return null;
 const u=clamp(((b.x-a.x)*(p.x-a.x)+(b.y-a.y)*(p.y-a.y))/(L*L),0,1-c.body_exclusion/L);
 const q={x:a.x+u*(p.x-a.x),y:a.y+u*(p.y-a.y)};
 return distance(b,q)<=7?{u,position:q}:null;
}
// Earliest square crossing; insertion order supplies exact-corner tie order.
function crossing(a,b){
 const dx=b.x-a.x,dy=b.y-a.y,candidates=[];
 const add=(edge,f)=>{if(f>=0&&f<=1){const x=a.x+f*dx,y=a.y+f*dy;if(x>=-1e-9&&x<=720+1e-9&&y>=-1e-9&&y<=720+1e-9)candidates.push({edge,f,x,y});}};
 if(dy<0&&b.y<=0)add('top',-a.y/dy);
 if(dx>0&&b.x>=720)add('right',(720-a.x)/dx);
 if(dy>0&&b.y>=720)add('bottom',(720-a.y)/dy);
 if(dx<0&&b.x<=0)add('left',-a.x/dx);
 candidates.sort((x,y)=>x.f-y.f);return candidates[0]||null;
}
function analog(x,y,deadzone=.18){const m=Math.hypot(x,y);if(m<=deadzone)return {x:0,y:0};const n=clamp((m-deadzone)/(1-deadzone),0,1)/m;return {x:x*n,y:y*n};}
class Engine{
 constructor(data,opts={}){
  this.data=data;this.c=data.demo_config;this.layoutId=opts.layout||0;this.layout=data.layouts.layouts[this.layoutId];
  this.mode=opts.mode||'standard';this.toggle=!!opts.toggle;this.immortal=!!opts.immortal||this.mode==='tutorial';this.consent=!!opts.consent;this.logContext=opts.logContext||{};this.wallNow=opts.wallNow||null;
  this.phase=this.mode==='tutorial'?'T1':'READY';this.micro=0;this.readyMicro=0;this.tutorialMicro=0;this.stage=0;
  this.p=transform(point(this.c.player.spawn),this.layout);if(this.mode==='tutorial')this.p=point(this.c.player.spawn);
  this.hp=3;this.score=0;this.invulnUntil=0;this.line='OFF';this.a=null;this.logicalHold=false;this.mustRelease=false;
  this.bullets=[];this.warnings=[];this.nextId=1;this.delivered=[0,0,0,0,0,0];this.quotaAwarded=[false,false,false,false,false,false];
  this.packets={};this.fired=0;this.trianglesFired=0;this.completePackets=0;this.stats={missed:0,uncaught:0,manual:0,short:0,broken:0,hit:0,window:0};
  this.signals=[];this.events=[];this.commands=[];this.outcome=null;this.error=null;this.peak=0;this.tutorialDelivered=0;this.tutorialHint=false;this.tutorialDone=false;
  this.input={x:0,y:0,held:false,edges:[]};this.lastCommand='';this.schedule=this.expand();this.scheduleCursor=0;
 }
 record(type,payload={}){return {wall_timestamp:this.wallNow?new Date(this.wallNow()).toISOString():null,run_id:this.logContext.run_id||null,build_id:this.logContext.build_id||null,config_hash:this.logContext.config_hash||null,layout_id:this.layoutId,mode:this.mode,micro:this.micro,readyMicro:this.readyMicro,tutorialMicro:this.tutorialMicro,phase:this.phase,type,...payload};}
 emit(type,payload={}){this.signals.push({type,...payload});if(this.consent)this.events.push(this.record(type,payload));}
 expand(){const list=[];const hz=480,c=this.c;
  this.data.phrases.phrases.forEach((ph,i)=>{
   ph.packets.forEach(packet=>{
    list.push({at:Math.round((i*30+packet.start_s-c.round.warning_s)*hz),type:'roundWarning',stage:i,packet});
    c.round.lane_offsets.forEach((off,slot)=>{let p=packet.edge==='top'?{x:packet.center+off,y:-12}:{x:-12,y:packet.center+off};let v=packet.edge==='top'?{x:0,y:c.round.speed}:{x:c.round.speed,y:0};
     list.push({at:Math.round((i*30+packet.start_s+slot*c.round.shot_interval_s)*hz),type:'round',stage:i,packet:packet.id,slot,p:transform(p,this.layout),v:transform(v,this.layout)});
    });
   });
   ph.triangle_volleys.forEach((volley,j)=>{list.push({at:Math.round((i*30+volley.warning_s)*hz),type:'triangleWarning',stage:i,id:'tri'+i+'_'+j,source:transform(point(volley.source),this.layout)});});
  });return list.sort((a,b)=>a.at-b.at);
 }
 get time(){return this.micro/480;}get localTime(){return this.time-this.stage*30;}get completed(){return this.quotaAwarded.filter(Boolean).length;}
 gate(local=this.localTime){
  const ph=this.mode==='tutorial'?{gate:{center:260,motion:'static'}}:this.data.phrases.phrases[this.stage];
  const g=ph.gate,center=g.motion==='sine'?360+120*Math.sin(2*Math.PI*(local-1)/24):g.center;
  const p=this.mode==='tutorial'?{x:720,y:center}:transform({x:720,y:center},this.layout);
  const normal=this.mode==='tutorial'?{x:1,y:0}:transform({x:1,y:0},this.layout,true);
  return {edge:normal.x===1?'right':normal.x===-1?'left':normal.y===1?'bottom':'top',center:normal.x?p.y:p.x,p,open:this.mode==='tutorial'||this.phase==='READY'||local<26};
 }
 cancel(reason,broken=false){
  const guided=this.bullets.filter(b=>b.state==='GUIDED');this.stats[reason]=(this.stats[reason]||0)+guided.length;
  this.bullets=this.bullets.filter(b=>b.state!=='GUIDED');
  if(this.line!=='OFF'||guided.length)this.emit(broken?'broken':'cancel',{reason,count:guided.length});
  this.line=broken?'BROKEN':'OFF';this.logicalHold=false;if(reason!=='manual')this.mustRelease=true;
 }
 syncResume(held){this.input.edges=[];this.input.held=held;if(!this.toggle&&!held){this.cancel('manual');this.mustRelease=false;} }
 edges(edges,held){
  for(const edge of edges){
   if(edge==='release'){this.mustRelease=false;if(this.line==='BROKEN')this.line='OFF';if(!this.toggle)this.cancel('manual');}
   else if(edge==='press'&&!this.mustRelease){
    if(this.toggle&&this.logicalHold){this.cancel('manual');}
    else if(this.line==='OFF'){this.a={...this.p};this.line='DORMANT';this.logicalHold=true;this.emit('anchor',{p:{...this.a}});}
   }
  }
  if(!held){this.mustRelease=false;if(this.line==='BROKEN')this.line='OFF';if(!this.toggle&&this.logicalHold)this.cancel('manual');}
 }
 validity(){if(!this.logicalHold||!this.a)return;const L=distance(this.a,this.p);
  if(L>this.c.conduit.maximum_length){this.cancel('broken',true);this.mustRelease=true;}
  else if(L<this.c.conduit.minimum_length){if(this.line==='ACTIVE'){const pts=this.bullets.filter(b=>b.state==='GUIDED');this.stats.short+=pts.length;this.bullets=this.bullets.filter(b=>b.state!=='GUIDED');this.emit('short',{count:pts.length});}this.line='DORMANT';}
  else{if(this.line==='DORMANT')this.emit('active');this.line='ACTIVE';}
 }
 reserve(n){if(this.bullets.length+this.warnings.length+n>this.c.simulation.object_cap){this.error='对象数量超过512，已暂停。请重开这一局。';this.emit('error',{message:this.error});return false;}return true;}
 spawn(kind,p,v,packet=null,slot=null,clock=this.micro){if(!this.reserve(1))return;this.bullets.push({id:this.nextId++,kind,state:kind==='round'?'INCOMING':'TRIANGLE',p:{...p},v:{...v},packet,slot,born:clock,age:0});if(kind==='round')this.fired++;else this.trianglesFired++;}
 roundWarning(packet,clock,transformed=true){if(!this.reserve(1))return;const source=packet.edge==='top'?{x:packet.center,y:0}:{x:0,y:packet.center};this.warnings.push({type:'round',source:transformed?transform(source,this.layout):source,edge:packet.edge,packet:packet.id,expires:clock+384});}
 triangleWarning(source,clock,id){if(!this.reserve(1))return;this.warnings.push({type:'triangle',source:{...source},target:{...this.p},fire:clock+384,expires:clock+384,id});this.emit('warning',{source});}
 scheduled(clock){
  while(this.scheduleCursor<this.schedule.length&&this.schedule[this.scheduleCursor].at<=clock){const e=this.schedule[this.scheduleCursor++];if(e.stage!==this.stage||this.localTime>=26)continue;
   if(e.type==='round')this.spawn('round',e.p,e.v,e.packet,e.slot,clock);
   if(e.type==='roundWarning')this.roundWarning(e.packet,clock);
   if(e.type==='triangleWarning')this.triangleWarning(e.source,clock,e.id);
  }
 }
 tutorialEvents(clock){
  if(this.phase==='T2'){const base=(clock-480);if(clock>=96&&(clock-96)%1440===0)this.roundWarning({id:'tutorial'+Math.floor(clock/1440),edge:'top',center:360},clock,false);
   if(base>=0){const k=Math.floor(base/1440),remainder=base%1440;if(remainder<=240&&remainder%48===0){const slot=remainder/48;this.spawn('round',{x:360+this.c.round.lane_offsets[slot],y:-12},{x:0,y:180},'tutorial'+k,slot,clock);}}
   if(clock>=4800&&!this.tutorialHint&&this.tutorialDelivered===0){this.tutorialHint=true;this.emit('tutorialHint');}
  }
  if(this.phase==='T3'&&clock===240)this.triangleWarning({x:360,y:732},clock,'tutorialTriangle');
 }
 delivery(b,hit,local){
  const gate=this.gate(local);const coord=hit.edge==='top'||hit.edge==='bottom'?hit.x:hit.y;
  if(local>=0&&local<26&&hit.edge===gate.edge&&Math.abs(coord-gate.center)<=72){
   const packet=this.packets[b.packet]||(this.packets[b.packet]={mask:0,bonus:false});const bit=1<<b.slot;if(packet.mask&bit)return;
   packet.mask|=bit;this.emit('delivery',{p:{x:hit.x,y:hit.y},packet:b.packet,slot:b.slot});
   if(this.mode==='tutorial'){this.tutorialDelivered++;return;}
   this.delivered[this.stage]++;this.score+=this.c.score.per_delivery;
   if(packet.mask===63&&!packet.bonus){packet.bonus=true;this.completePackets++;this.score+=this.c.score.complete_packet_bonus;this.emit('packet');}
   if(!this.quotaAwarded[this.stage]&&this.delivered[this.stage]>=this.c.run.quotas[this.stage]){this.quotaAwarded[this.stage]=true;this.score+=this.c.score.quota_bonus;this.emit('quota',{stage:this.stage});}
  }else{this.stats.missed++;this.emit('missed',{p:{x:hit.x,y:hit.y}});}
 }
 closeWindow(){this.cancel('window');this.stats.window+=this.bullets.filter(b=>b.kind==='round').length;this.bullets=[];this.warnings=[];this.emit('breath',{stage:this.stage});}
 finish(outcome){if(this.outcome)return;this.outcome=outcome;this.phase='TERMINAL';this.cancel('end');this.emit('terminal',{outcome});}
 tick(input={x:0,y:0,held:false,edges:[]}){
  if(this.outcome||this.error)return;this.input={x:input.x||0,y:input.y||0,held:!!input.held,edges:input.edges||[]};
  const encoded=JSON.stringify(this.input);if(this.consent&&encoded!==this.lastCommand){this.commands.push({micro:this.micro,readyMicro:this.readyMicro,tutorialMicro:this.tutorialMicro,input:{...this.input,edges:[...this.input.edges]}});this.lastCommand=encoded;}
  for(let i=0;i<4&&!this.outcome&&!this.error;i++)this.step(i===0?this.input.edges:[]);
 }
 step(edges){
  const c=this.c,dt=1/480,tutorial=this.mode==='tutorial';let clock=tutorial?this.tutorialMicro:this.phase==='READY'?this.readyMicro:this.micro;
  if(!tutorial&&this.phase==='RUNNING'){
   if(this.micro>=86400){this.finish(this.hp<=0?'FAIL':this.completed>=4?'CLEAR':'QUOTA');return;}
   const next=Math.floor(this.micro/14400);if(next!==this.stage){this.stage=next;this.emit('stage',{stage:next});}
   if(this.micro%14400===12480)this.closeWindow();
  }
  const canLine=tutorial||this.phase==='READY'||this.localTime<26;
  if(canLine)this.edges(edges,this.input.held);else{this.logicalHold=false;this.line='OFF';if(!this.input.held)this.mustRelease=false;}
  const held=this.logicalHold&&(this.line==='DORMANT'||this.line==='ACTIVE'),speed=held?c.player.held_speed:c.player.free_speed;
  const m=Math.hypot(this.input.x,this.input.y),norm=m>1?1/m:1;
  this.p={x:clamp(this.p.x+this.input.x*norm*speed*dt,12,708),y:clamp(this.p.y+this.input.y*norm*speed*dt,12,708)};this.validity();
  // Snapshot states before generation. New state objects wait until the following microstep.
  const old=new Map(this.bullets.map(b=>[b.id,b.state]));const removed=new Set();
  if(tutorial)this.tutorialEvents(clock);else if(this.phase==='RUNNING'&&this.localTime<26)this.scheduled(clock);
  for(const w of [...this.warnings]){if(w.type==='triangle'&&w.fire===clock){const src=tutorial?w.source:transform(w.source,this.layout,false,true),target=tutorial?w.target:transform(w.target,this.layout,false,true);const theta=Math.atan2(target.y-src.y,target.x-src.x);for(const spread of c.triangle.spread_radians){const localVelocity={x:Math.cos(theta+spread)*c.triangle.speed,y:Math.sin(theta+spread)*c.triangle.speed};this.spawn('triangle',w.source,tutorial?localVelocity:transform(localVelocity,this.layout,true),null,null,clock);}} }
  if(this.error)return;
  this.warnings=this.warnings.filter(w=>w.expires>clock);
  for(const b of this.bullets){if(!old.has(b.id))continue;if(b.state==='INCOMING'||b.state==='TRIANGLE'){b.p.x+=b.v.x*dt;b.p.y+=b.v.y*dt;b.ageMicro=(b.ageMicro||Math.round(b.age*480))+1;b.age=b.ageMicro/480;if(b.p.x< -24||b.p.x>744||b.p.y< -24||b.p.y>744||b.age>=8){removed.add(b.id);if(b.kind==='round')this.stats.uncaught++;}}}
  if(this.line==='ACTIVE')for(const b of this.bullets){if(b.state!=='INCOMING'||removed.has(b.id))continue;const cap=capture(b.p,this.a,this.p,c.conduit);if(cap){b.state='GUIDED';b.u=cap.u;b.p=cap.position;b.changed=clock;this.emit('capture',{p:{...b.p}});}}
  // All captures are complete before any dangerous contact is considered.
  if(clock>=this.invulnUntil){const hit=this.bullets.find(b=>!removed.has(b.id)&&(b.state==='INCOMING'||b.state==='TRIANGLE')&&distance(b.p,this.p)<=(b.kind==='round'?11:13));if(hit){removed.add(hit.id);if(!this.immortal)this.hp--;this.invulnUntil=clock+576;this.cancel('hit');this.emit('hit',{p:{...hit.p},kind:hit.kind,hp:this.hp});}}
  if(this.line==='ACTIVE')for(const b of this.bullets){if(removed.has(b.id)||b.state!=='GUIDED'||old.get(b.id)!=='GUIDED')continue;const L=distance(this.a,this.p);b.u=Math.max(0,b.u-c.conduit.guide_speed/L*dt);b.p={x:this.a.x+b.u*(this.p.x-this.a.x),y:this.a.y+b.u*(this.p.y-this.a.y)};
   if(b.u===0){b.state='OUTBOUND';b.p={...this.a};b.v={x:c.conduit.outbound_speed*(this.a.x-this.p.x)/L,y:c.conduit.outbound_speed*(this.a.y-this.p.y)/L};b.changed=clock;this.emit('outbound',{p:{...b.p}});}}
  for(const b of this.bullets){if(removed.has(b.id)||b.state!=='OUTBOUND'||old.get(b.id)!=='OUTBOUND')continue;const prev={...b.p},next={x:prev.x+b.v.x*dt,y:prev.y+b.v.y*dt};const hit=crossing(prev,next);b.p=next;if(hit){const local=tutorial?0:(clock+hit.f)/480-this.stage*30;this.delivery(b,hit,local);removed.add(b.id);}}
  this.bullets=this.bullets.filter(b=>!removed.has(b.id));this.peak=Math.max(this.peak,this.bullets.length+this.warnings.length);
  if(this.hp<=0&&!tutorial){this.finish('FAIL');return;}
  if(tutorial){
   this.tutorialMicro++;
   if(this.phase==='T1'&&this.line==='ACTIVE'&&distance(this.a,this.p)>=120){this.phase='T2';this.tutorialMicro=0;this.emit('tutorial2');}
   else if(this.phase==='T2'&&this.tutorialDelivered>=6){this.phase='T3';this.tutorialMicro=0;this.invulnUntil=0;this.bullets=[];this.warnings=[];this.cancel('window');this.emit('tutorial3');}
   else if(this.phase==='T3'&&this.tutorialMicro>624&&this.bullets.length===0&&this.warnings.length===0&&!this.tutorialDone){this.tutorialDone=true;this.emit('tutorialDone');}
  }else if(this.phase==='READY'){this.readyMicro++;if(this.readyMicro>=480){this.phase='RUNNING';this.micro=0;this.emit('stage',{stage:0});}}
  else{this.micro++;if(this.micro>=86400)this.finish(this.hp<=0?'FAIL':this.completed>=4?'CLEAR':'QUOTA');}
  if(this.consent&&clock%48===0)this.events.push(this.record('sample',{p:{...this.p},a:this.a?{...this.a}:null,line:this.line}));
 }
}
const api={Engine,transform,capture,crossing,analog,distance};if(typeof module!=='undefined')module.exports=api;root.Jieliu=api;
})(typeof window!=='undefined'?window:globalThis);
