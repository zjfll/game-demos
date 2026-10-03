(function(root){
  'use strict';
  const TAU=Math.PI*2, RAD=Math.PI/180, DT=1/60, EPS=.025;
  const P=Object.freeze({length:72,endRadius:14,shaftRadius:8,maxOmega:420*RAD,accel:4200*RAD,brake:8400*RAD,minHitSpeed:320,swapArc:8,repeatArc:40,repeatTime:.180,buffer:.100,swapInterval:.080,recovery:.120,protection:.650,hitStop:2*DT});
  const v=(x=0,y=0)=>({x,y}),add=(a,b)=>v(a.x+b.x,a.y+b.y),sub=(a,b)=>v(a.x-b.x,a.y-b.y),mul=(a,s)=>v(a.x*s,a.y*s),dot=(a,b)=>a.x*b.x+a.y*b.y,len=a=>Math.hypot(a.x,a.y),unit=a=>len(a)>1e-10?mul(a,1/len(a)):v(1,0),cross=(a,b)=>a.x*b.y-a.y*b.x;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function closest(p,a,b){const ab=sub(b,a),q=dot(ab,ab);return add(a,mul(ab,q?clamp(dot(sub(p,a),ab)/q,0,1):0));}
  function intersect(a,b,c,d){const r=sub(b,a),s=sub(d,c),den=cross(r,s);if(Math.abs(den)<1e-12)return null;const t=cross(sub(c,a),s)/den,u=cross(sub(c,a),r)/den;return t>=0&&t<=1&&u>=0&&u<=1?add(a,mul(r,t)):null;}
  function inside(p,poly){let sign=0;for(let i=0;i<poly.length;i++){const z=cross(sub(poly[(i+1)%poly.length],poly[i]),sub(p,poly[i]));if(Math.abs(z)<1e-9)continue;const s=Math.sign(z);if(sign&&s!==sign)return false;sign=s;}return true;}
  const rect=(x,y,w,h)=>[v(x,y),v(x+w,y),v(x+w,y+h),v(x,y+h)];
  function segmentPoly(a,b,poly){
    let best={d:Infinity,p:a,q:poly[0]};
    for(let i=0;i<poly.length;i++){
      const c=poly[i],d=poly[(i+1)%poly.length],hit=intersect(a,b,c,d);
      if(hit)return {d:0,p:hit,q:hit};
      for(const p of [a,b]){const q=closest(p,c,d),dist=len(sub(p,q));if(dist<best.d)best={d:dist,p,q};}
      for(const q of [c,d]){const p=closest(q,a,b),dist=len(sub(p,q));if(dist<best.d)best={d:dist,p,q};}
    }
    if(inside(a,poly)||inside(b,poly))best.d=0;
    return best;
  }
  function endpoints(m,angle=m.angle){const free=add(m.pivot,v(P.length*Math.cos(angle),P.length*Math.sin(angle)));return m.fixed==='A'?{A:{...m.pivot},B:free}:{A:free,B:{...m.pivot}};}
  function pose(m,t=0){const q=endpoints(m,m.angle+m.omega*t);return {a:m.pivot,b:m.fixed==='A'?q.B:q.A,A:q.A,B:q.B};}
  function bodyCircle(q,c,ignoreFixed=false){
    const mid=closest(c.pos,q.a,q.b),candidates=[{p:q.b,r:P.endRadius,part:'active'},{p:mid,r:P.shaftRadius,part:'shaft'}];if(!ignoreFixed)candidates.push({p:q.a,r:P.endRadius,part:'fixed'});
    let out={d:Infinity};for(const k of candidates){const delta=sub(k.p,c.pos),d=len(delta)-k.r-c.r;if(d<out.d)out={d,n:unit(delta),point:sub(k.p,mul(unit(delta),k.r)),part:k.part};}return out;
  }
  function bodyPoly(q,poly,ignoreFixed=false){
    const seg=segmentPoly(q.a,q.b,poly);let out={d:seg.d-P.shaftRadius,n:unit(sub(seg.p,seg.q)),point:seg.p,part:'shaft'};
    for(const [p,part] of [[q.a,'fixed'],[q.b,'active']]){if(ignoreFixed&&part==='fixed')continue;const k=segmentPoly(p,p,poly),d=k.d-P.endRadius;if(d<out.d)out={d,n:unit(sub(p,k.q)),point:k.q,part};}
    return out;
  }
  // Conservative advancement samples the actual circular pose. V bounds the
  // rate of change of clearance for the whole body and the moving collider.
  function sweep(distanceAt,V,duration,budget=160){
    if(duration<=0)return null;
    let t=0,lastD=Infinity;
    for(let i=0;i<budget;i++){
      const c=distanceAt(t);
      if(c.d<=EPS+1e-6){
        const h=Math.min(1e-4,duration-t),next=h>0?distanceAt(t+h):c;
        if(c.d<-.05||next.d<c.d-1e-7)return {t,contact:c,iterations:i+1};
        // Resting and separating contact must not block motion away from it.
        if(V<1e-9||Math.abs(next.d-c.d)<1e-9)return null;
        if(t>=duration)return null;
        t+=Math.min(duration-t,Math.max(1e-5,(EPS-c.d+1e-5)/Math.max((next.d-c.d)/h,1e-4)));
      }else{
        if(V<1e-9)return null;
        const safe=(c.d-EPS)/V;
        if(safe>=duration-t)return null;
        if(safe<1e-8&&c.d<lastD)return {t,contact:c,iterations:i+1};
        t+=Math.max(1e-9,safe);lastD=c.d;
      }
      if(t>=duration)return null;
    }
    return {t,exhausted:true,contact:distanceAt(t),iterations:budget};
  }
  const walls=[{id:'wall-top',poly:rect(-200,-200,1700,296)},{id:'wall-bottom',poly:rect(-200,656,1700,300)},{id:'wall-left',poly:rect(-200,96,280,560)},{id:'wall-right',poly:rect(1200,96,300,560)}];
  const LAYOUTS=[
    {id:'open',name:'开阔台',start:v(280,455),angle:-.45,obstacles:[],locks:[v(470,430),v(780,275),v(1010,510)],pin:v(655,470),shield:v(880,400),exit:{x:1030,y:122,w:148,h:146}},
    {id:'pillars',name:'双柱台',start:v(265,470),angle:-.45,obstacles:[{id:'pillar-1',poly:rect(545,270,78,150)},{id:'pillar-2',poly:rect(790,460,78,130)}],locks:[v(440,230),v(735,330),v(1035,540)],pin:v(650,495),shield:v(970,355),exit:{x:1030,y:122,w:148,h:146}},
    {id:'offset',name:'偏置台',start:v(265,470),angle:-.45,obstacles:[{id:'offset-1',poly:rect(470,180,240,62)},{id:'offset-2',poly:rect(720,450,190,62)}],locks:[v(430,350),v(810,290),v(1040,545)],pin:v(600,470),shield:v(960,340),exit:{x:1030,y:122,w:148,h:146}}
  ];
  const makeEntity=(id,kind,pos,extra={})=>({id,kind,pos:{...pos},r:kind==='lock'?22:kind==='shield'?25:19,vel:v(),dead:false,wreckUntil:0,root:null,depth:0,phase:'idle',timer:kind==='pin'?2.8:3.7,facing:Math.PI,hitMemo:null,...extra});
  class Session{
    constructor(layout='open',tutorial=false){
      this.layout=LAYOUTS.find(x=>x.id===layout)||LAYOUTS[0];this.tutorial=tutorial;this.step=0;this.ruleTime=0;this.realTime=0;this.tick=0;this.health=3;this.hits=0;this.status='playing';this.paused=false;this.buffer=null;this.lastSwap=-10;this.recoverUntil=0;this.protectUntil=0;this.hitStop=0;this.lastStop=-10;this.serial=0;this.events=[];this.diagnostics=[];this.contacts=new Map();this.damageSeen=new Set();this.rootPairs=new Map();this.hazards=[];this.totalSwaps=0;this.strongHits=0;this.teachStart=null;this.teachSwapped=false;this.teachStrong=false;this.teachWarning=false;this.teachDodged=false;this.movement=0;this.spawn();
    }
    spawn(){
      this.motor={pivot:{...this.layout.start},fixed:'A',angle:this.layout.angle,omega:0,arc:0,swapArc:P.swapArc};this.obstacles=[...walls,...this.layout.obstacles];
      this.entities=this.layout.locks.map((p,i)=>makeEntity('lock-'+(i+1),'lock',p,{number:i+1}));
      this.entities.push(makeEntity('pin-1','pin',this.layout.pin),makeEntity('shield-1','shield',this.layout.shield));
      if(this.tutorial)this.setupTutorial(0);
    }
    setupTutorial(step){
      this.step=step;this.hazards=[];this.contacts.clear();this.obstacles=[...walls];this.buffer=null;this.hitStop=0;this.health=3;this.hits=0;this.recoverUntil=this.ruleTime;this.protectUntil=this.ruleTime;this.teachSwapped=false;this.movement=0;
      this.motor={pivot:v(step===0?370:step===1?430:450,390),fixed:'A',angle:0,omega:0,arc:0,swapArc:P.swapArc};
      this.entities=[];
      if(step===1)this.teachStart=v(430,390);
      if(step===2){this.entities=[makeEntity('practice','dummy',v(519,429)),makeEntity('tutorial-pin','pin',v(730,340),{timer:999})];this.teachSlow=false;this.teachStrong=false;this.teachWarning=false;this.teachDodged=false;}
      this.lessonStartEvent=this.serial;this.emit('lesson',null,{step});
    }
    emit(type,point,detail={}){const e={id:++this.serial,type,tick:this.tick,time:this.ruleTime,point:point?{...point}:null,...detail};this.events.push(e);if(this.events.length>700)this.events.shift();return e;}
    drain(){const result=this.events.slice(this.lastDrain||0);this.lastDrain=this.events.length;return result;}
    requestSwap(pressedTime=this.realTime){if(this.status!=='playing'||this.paused)return false;this.buffer={expires:pressedTime+P.buffer,pressed:pressedTime};return true;}
    pause(){this.paused=true;this.buffer=null;}
    resume(){this.paused=false;this.buffer=null;}
    swap(){
      const m=this.motor,q=pose(m);m.pivot={...q.b};m.fixed=m.fixed==='A'?'B':'A';m.angle+=Math.PI;m.swapArc=0;this.lastSwap=this.ruleTime;this.buffer=null;this.totalSwaps++;this.teachSwapped=true;this.emit('swap',m.pivot,{fixed:m.fixed});
    }
    stepTick(input={axis:0,brake:false},dt=DT,realDelta=dt){
      if(this.paused||this.status!=='playing')return;
      this.realTime+=realDelta;this.tick++;
      if(this.buffer&&this.realTime>this.buffer.expires+1e-9){this.buffer=null;this.emit('swap-expired',null);}
      if(this.hitStop>1e-9){this.hitStop=Math.max(0,this.hitStop-dt);return;}
      if(this.buffer&&this.ruleTime>=this.recoverUntil-1e-9&&this.ruleTime-this.lastSwap>=P.swapInterval-1e-9)this.swap();
      const target=input.brake?0:clamp(input.axis||0,-1,1)*P.maxOmega,a=input.brake?P.brake:P.accel;
      this.motor.omega+=clamp(target-this.motor.omega,-a*dt,a*dt);
      this.updateBrains(dt);this.resolveMovement(dt);
      for(const h of this.hazards)if(h.active&&!this.damageSeen.has(h.id)){const c=bodyCircle(pose(this.motor),h);if(c.d<=EPS)this.damage(h.id,c.point);}
      this.ruleTime+=dt;
      this.hazards=this.hazards.filter(h=>this.ruleTime<h.ends);
      for(const [id,rec] of this.contacts){const ent=this.entities.find(e=>e.id===id);if(!ent||ent.dead||bodyCircle(pose(this.motor),ent).d>1.5)rec.separated=true;}
      if(this.health<=0){this.health=0;this.status='failed';this.buffer=null;this.emit('failed',pose(this.motor).a,{reason:'钉击命中了身体，生命已用完'});}
      else if(!this.tutorial&&this.entities.filter(e=>e.kind==='lock'&&!e.dead).length===0&&this.inExit()){this.status='cleared';this.buffer=null;this.emit('cleared',pose(this.motor).a,{time:this.realTime,hits:this.hits});}
      if(this.tutorial&&this.status==='playing')this.updateLesson();
    }
    updateBrains(dt){
      for(const e of this.entities){
        if(e.dead){if(this.ruleTime>e.wreckUntil)e.vel=v();continue;}
        if(e.kind==='lock'||e.kind==='dummy')continue;
        if(e.root&&len(e.vel)>1){e.vel=mul(e.vel,Math.max(0,1-dt*3));if(e.phase!=='active'){e.phase='stagger';e.timer=.5;}continue;}
        e.vel=v();e.timer-=dt;
        if(e.kind==='pin'){
          if(e.phase==='idle'||e.phase==='recover'||e.phase==='stagger'){
            if(e.timer<=0&&!this.hazards.some(h=>this.ruleTime<h.starts+.24)){
              const pos={...this.motor.pivot},id='spike-'+(++this.serial);
              this.hazards.push({id,owner:e.id,pos,r:49,starts:this.ruleTime+.9,ends:this.ruleTime+1.5,active:false});e.attackId=id;e.phase='telegraph';e.timer=.9;this.emit('warning',pos,{hazard:id});this.teachWarning=true;
            }
          }else if(e.phase==='telegraph'&&e.timer<=1e-9){e.phase='active';e.timer=.6;const h=this.hazards.find(h=>h.id===e.attackId);if(h){h.active=true;this.emit('spike',h.pos,{hazard:h.id});}}
          else if(e.phase==='active'&&e.timer<=1e-9){e.phase='recover';e.timer=2.3;if(this.tutorial&&this.teachStrong&&!this.damageSeen.has(e.attackId))this.teachDodged=true;}
        }else if(e.kind==='shield'){
          if((e.phase==='idle'||e.phase==='recover'||e.phase==='stagger')&&e.timer<=0){e.facing=Math.atan2(this.motor.pivot.y-e.pos.y,this.motor.pivot.x-e.pos.x);e.phase='telegraph';e.timer=.7;this.emit('shield-windup',e.pos);}
          else if(e.phase==='telegraph'&&e.timer<=0){e.phase='active';e.timer=.4;e.vel=v(Math.cos(e.facing)*110,Math.sin(e.facing)*110);}
          else if(e.phase==='active'){e.vel=v(Math.cos(e.facing)*110,Math.sin(e.facing)*110);if(e.timer<=0){e.phase='recover';e.timer=2.8;e.vel=v();}}
        }
      }
    }
    circleWallMotion(e,delta){
      let fraction=1;
      for(const o of this.obstacles){const speed=len(delta);if(!speed)break;const hit=sweep(t=>{const pos=add(e.pos,mul(delta,t)),c=segmentPoly(pos,pos,o.poly);return {d:c.d-e.r,n:unit(sub(pos,c.q)),point:c.q};},speed,1);if(hit){fraction=Math.min(fraction,hit.t);if(hit.exhausted)this.diagnostic('circle-budget',e.id);}}
      return mul(delta,Math.max(0,fraction));
    }
    diagnostic(reason,id){if(this.diagnostics.length<100)this.diagnostics.push({tick:this.tick,reason,id});this.emit('diagnostic',null,{reason,target:id});}
    resolveMovement(dt){
      let remaining=dt,iterations=0;
      while(remaining>1e-8&&iterations++<28){
        const m=this.motor,speed=P.length*Math.abs(m.omega);
        // Clamp enemy proposals against solid geometry before the shared sweep.
        for(const e of this.entities){if(e.dead&&this.ruleTime>=e.wreckUntil)continue;const delta=this.circleWallMotion(e,mul(e.vel,remaining));e.vel=mul(delta,1/remaining);}
        let best=null;
        const consider=(hit,kind,obj)=>{if(hit&&(!best||hit.t<best.t-1e-8||(Math.abs(hit.t-best.t)<1e-8&&obj.id<best.obj.id)))best={...hit,kind,obj};};
        // The anchor cap is stationary during a rotation. Leaving its constant
        // skin distance in the minimum would produce a false TOI at t=0.
        // The shaft and moving cap still cover every changing body point.
        if(speed>1e-8)for(const o of this.obstacles)consider(sweep(t=>bodyPoly(pose(m,t),o.poly,true),speed,remaining),'wall',o);
        for(const e of this.entities){if(e.dead)continue;const enemySpeed=len(e.vel),V=speed+enemySpeed;if(V<=1e-8)continue;consider(sweep(t=>bodyCircle(pose(m,t),{...e,pos:add(e.pos,mul(e.vel,t))},enemySpeed<1e-8),V,remaining),'entity',e);}
        for(const h of this.hazards){if(!h.active||this.damageSeen.has(h.id))continue;const atStart=bodyCircle(pose(m),h);if(atStart.d<=EPS)consider({t:0,contact:atStart},'hazard',h);else consider(sweep(t=>bodyCircle(pose(m,t),h),speed,remaining),'hazard',h);}
        for(let i=0;i<this.entities.length;i++)for(let j=i+1;j<this.entities.length;j++){
          const a=this.entities[i],b=this.entities[j];if(a.kind==='lock'||b.kind==='lock'||(a.dead&&this.ruleTime>=a.wreckUntil)||(b.dead&&this.ruleTime>=b.wreckUntil))continue;
          const dv=sub(a.vel,b.vel),dp=sub(a.pos,b.pos),R=a.r+b.r+.03,A=dot(dv,dv),B=2*dot(dp,dv),C=dot(dp,dp)-R*R,D=B*B-4*A*C;
          if(A>1e-8&&B<0&&D>=0){const t=Math.max(0,(-B-Math.sqrt(D))/(2*A));if(t<=remaining)consider({t,contact:{point:add(a.pos,mul(a.vel,t))}},'pair',{id:[a.id,b.id].sort().join('|'),a,b});}
        }
        // A lethal event may trade with other contacts at the same TOI. It may
        // not continue moving and hit a later target after death in this tick.
        if(this.health<=0&&(!best||best.t>1e-6)){m.omega=0;break;}
        const advance=best?best.t:remaining;m.angle+=m.omega*advance;const arc=speed*advance;m.arc+=arc;m.swapArc+=arc;this.movement+=arc;
        for(const e of this.entities)e.pos=add(e.pos,mul(e.vel,advance));remaining-=advance;
        if(!best)break;
        if(best.exhausted){m.omega=0;for(const e of this.entities)e.vel=v();this.diagnostic('sweep-budget',best.obj.id);break;}
        if(best.kind==='hazard'){this.damage(best.obj.id,best.contact.point);continue;}
        if(best.kind==='pair'){this.chain(best.obj.a,best.obj.b,best.obj.id);continue;}
        if(best.kind==='wall'){m.omega=0;this.feedbackContact('wall',best.contact.point,best.obj.id);continue;}
        const e=best.obj,c=best.contact,free=pose(m).b,vel=v(-m.omega*(free.y-m.pivot.y),m.omega*(free.x-m.pivot.x));
        const shieldFront=e.kind==='shield'&&dot(unit(sub(c.point,e.pos)),v(Math.cos(e.facing),Math.sin(e.facing)))>.22;
        if(!shieldFront&&this.qualifies(e,c.part,speed)){this.impact(e,vel,c.point);continue;}
        if(shieldFront||e.kind==='lock'){m.omega=0;e.vel=v();this.feedbackContact(shieldFront?'shield':'slow',c.point,e.id);continue;}
        // A slow body contact can only push at 180 u/s; the safe wall query
        // never moves the target into a wall. If it cannot separate, stop here.
        const pushDir=speed>1?unit(vel):mul(c.n,-1),desired=mul(pushDir,Math.min(180,Math.max(speed,30))*remaining);
        const allowed=this.circleWallMotion(e,desired),old={...e.pos};e.pos=add(e.pos,allowed);
        if(bodyCircle(pose(m),e).d<=EPS+.01||len(sub(e.pos,old))<.01){m.omega=0;e.vel=v();this.feedbackContact('blocked',c.point,e.id);}
        else{m.omega=0;e.vel=v();this.feedbackContact('slow',c.point,e.id);}
      }
      if(iterations>=28&&remaining>1e-8){this.motor.omega=0;for(const e of this.entities)e.vel=v();this.diagnostic('contact-budget','world');}
    }
    feedbackContact(type,point,target){if(!this.feedbackTimes)this.feedbackTimes=new Map();if(this.ruleTime-(this.feedbackTimes.get(type+target)??-10)>.18){this.feedbackTimes.set(type+target,this.ruleTime);this.emit(type,point,{target});}}
    qualifies(e,part,speed){const rec=this.contacts.get(e.id);return part==='active'&&speed>=P.minHitSpeed-1e-7&&this.motor.swapArc>=P.swapArc-1e-7&&(!rec||(rec.separated&&this.ruleTime-rec.time>=P.repeatTime-1e-7&&this.motor.arc-rec.arc>=P.repeatArc-1e-7));}
    impact(e,vel,point){
      const m=this.motor;this.contacts.set(e.id,{separated:false,time:this.ruleTime,arc:m.arc});
      const root='impact-'+(++this.serial);e.vel=mul(unit(vel),Math.min(480,len(vel)));e.root=root;e.depth=0;e.phase='stagger';e.timer=.5;this.strongHits++;
      if(e.kind==='lock'){e.dead=true;e.vel=v();}
      else if(e.kind==='pin'||e.kind==='shield'){e.dead=true;e.wreckUntil=this.ruleTime+.8;this.hazards=this.hazards.filter(h=>h.owner!==e.id||h.active);}
      else if(e.kind==='dummy'){this.teachStrong=true;e.wreckUntil=this.ruleTime+.8;e.dead=true;const pin=this.entities.find(x=>x.kind==='pin');if(pin)pin.timer=.6;}
      const type=e.kind==='lock'?'unlock':'impact';this.emit(type,point,{target:e.id,root,velocity:{...e.vel}});
      if(this.ruleTime-this.lastStop>=.12){this.hitStop=P.hitStop;this.lastStop=this.ruleTime;}
    }
    chain(a,b,pair){
      let source=a,target=b;if((b.root&&b.depth===0&&len(b.vel)>len(a.vel))||(!a.root&&b.root)){source=b;target=a;}
      if(source.root&&source.depth===0){let set=this.rootPairs.get(source.root);if(!set){set=new Set();this.rootPairs.set(source.root,set);}if(!set.has(pair)){set.add(pair);target.vel=mul(source.vel,.55);target.root=source.root;target.depth=1;target.facing+=Math.PI/2;target.phase='stagger';target.timer=.7;source.vel=v();this.emit('chain',target.pos,{root:source.root,pair,depth:1,speed:len(target.vel)});if(this.rootPairs.size>64)this.rootPairs.delete(this.rootPairs.keys().next().value);return;}}
      a.vel=v();b.vel=v();
    }
    damage(id,point){
      if(this.damageSeen.has(id))return false;this.damageSeen.add(id);if(this.ruleTime<this.protectUntil-1e-9)return false;
      this.health--;this.hits++;this.protectUntil=this.ruleTime+P.protection;this.recoverUntil=this.ruleTime+P.recovery;this.emit('damage',point,{hazard:id,health:this.health,reason:'钉击命中身体'});return true;
    }
    inExit(){const {x,y,w,h}=this.layout.exit,q=pose(this.motor),r=P.endRadius;return [q.A,q.B].every(p=>p.x-r>=x&&p.x+r<=x+w&&p.y-r>=y&&p.y+r<=y+h);}
    updateLesson(){
      if(this.step===0&&this.movement>=85)this.setupTutorial(1);
      else if(this.step===1&&this.teachSwapped&&bodyCircle(pose(this.motor),{pos:this.teachStart,r:52}).d>0)this.setupTutorial(2);
      else if(this.step===2&&!this.teachSlow&&this.events.some(e=>e.id>this.lessonStartEvent&&e.type==='slow'&&e.target==='practice')){
        this.teachSlow=true;const e=this.entities.find(e=>e.id==='practice');e.pos=v(469,459);e.vel=v();this.motor.angle=0;this.motor.omega=0;this.emit('practice-reset',e.pos);
      }
      else if(this.step===2&&this.teachStrong&&this.teachDodged){this.status='lesson-done';this.emit('lesson-done',null);}
      else if(this.step===2&&this.hits>0){this.emit('lesson-retry',null);this.setupTutorial(2);}
    }
    snapshot(){return {layout:this.layout.id,tutorial:this.tutorial,step:this.step,status:this.status,health:this.health,hits:this.hits,ruleTime:this.ruleTime,realTime:this.realTime,swaps:this.totalSwaps,strongHits:this.strongHits,hitStop:this.hitStop,lastStop:this.lastStop,lastSwap:this.lastSwap,recoverUntil:this.recoverUntil,protectUntil:this.protectUntil,motor:JSON.parse(JSON.stringify(this.motor)),ends:endpoints(this.motor),entities:JSON.parse(JSON.stringify(this.entities)),hazards:JSON.parse(JSON.stringify(this.hazards)),diagnostics:this.diagnostics.slice(),remaining:this.entities.filter(e=>e.kind==='lock'&&!e.dead).length};}
  }
  const api={P,DT,EPS,LAYOUTS,Session,Geometry:{v,add,sub,mul,dot,len,unit,rect,inside,closest,segmentPoly,endpoints,pose,bodyCircle,bodyPoly,sweep},makeEntity};
  root.PivotBreak=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
