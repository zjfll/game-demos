(function (root) {
  'use strict';
  const R = Object.freeze({ version: '0.1-html-1', hz: 60, w: 960, h: 600, radius: 8, catchRadius: 42, sweep: 50, capacity: 6, cap: 48, life: 600, duration: 5400, settling: 180, eps: 1e-6, centers: [180, 480, 780] });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const safe = p => p.x >= 8 && p.x <= 952 && p.y >= 8 && p.y <= 592;
  const point = p => ({ x: clamp(p.x, 8, 952), y: clamp(p.y, 8, 592) });
  function contact(a, b, p) {
    const dx = b.x-a.x, dy = b.y-a.y, fx = a.x-p.x, fy = a.y-p.y;
    const c = fx*fx+fy*fy-R.sweep*R.sweep;
    if (c <= 0) return 0;
    const aa = dx*dx+dy*dy;
    if (!aa) return null;
    const bb = 2*(fx*dx+fy*dy), disc = bb*bb-4*aa*c;
    if (disc < 0) return null;
    const t = (-bb-Math.sqrt(disc))/(2*aa);
    return t >= -R.eps && t <= 1+R.eps ? clamp(t, 0, 1) : null;
  }
  function boundary(p, d, kind) {
    const choices = [];
    if (d.x < 0) choices.push({ distance: -p.x/d.x, edge: 'left' });
    if (d.x > 0) choices.push({ distance: (960-p.x)/d.x, edge: 'right' });
    if (d.y < 0) choices.push({ distance: -p.y/d.y, edge: 'top' });
    if (d.y > 0) choices.push({ distance: (600-p.y)/d.y, edge: 'bottom' });
    choices.sort((a,b) => a.distance-b.distance);
    if (!choices.length) return null;
    const hit = choices[0], x = p.x+d.x*hit.distance, y = p.y+d.y*hit.distance;
    const lo=R.centers[kind]-56, hi=R.centers[kind]+56;
    const success = hit.edge === 'top' && x >= lo-R.eps && x <= hi+R.eps;
    const deviation = x < lo ? lo-x : x > hi ? x-hi : 0;
    const near = !success && hit.edge === 'top' && deviation > R.eps && deviation <= 8+R.eps;
    const reason = success ? 'hit' : near ? (x < lo ? 'near-left' : 'near-right') : hit.edge !== 'top' ? hit.edge : R.centers.some((c,i) => i !== kind && x >= c-56 && x <= c+56) ? 'wrong-shape' : (x < lo ? 'left-of-target' : 'right-of-target');
    return { ...hit, x, y, success, near, deviation, reason };
  }
  function launch(A, B, n, kind, config = {}) {
    if (!n) return { valid: false, reason: 'empty', rays: [] };
    const dx=A.x-B.x, dy=A.y-B.y, length=Math.hypot(dx,dy);
    if (length < 24) return { valid: false, reason: 'short', rays: [], length };
    const tension=clamp((length-24)/156,0,1), spacing=24-6*tension, speed=500+500*tension;
    const d={x:dx/length,y:dy/length}, u={x:-d.y,y:d.x};
    const origin=config.origin||B;
    const rays=Array.from({length:n},(_,i) => {
      const offset=(i-(n-1)/2)*spacing, p={x:origin.x+u.x*offset,y:origin.y+u.y*offset};
      return { p, d:{...d}, hit:boundary(p,d,kind), speed };
    });
    return { valid: rays.every(r => safe(r.p)), reason: rays.every(r => safe(r.p)) ? '' : 'unsafe', rays, length, tension, spacing, speed, width:(n-1)*spacing+16 };
  }
  const score = (n,q) => 10*q+(q===n ? 5*q*(q-1) : 0);
  function samples(seed) {
    let state=seed>>>0;
    return () => { state=(state+0x6D2B79F5)>>>0; let t=state; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return (t^(t>>>14))>>>0; };
  }
  function schedule(seed, opportunities=45) {
    const next=samples(seed);
    return Array.from({length:opportunities},(_,i) => {
      const raw=Array.from({length:8},()=>next()), u=raw.map(v=>v/4294967296), mother=Math.floor(2*u[0]), kind=Math.floor(3*u[1]), other=(kind+1+Math.floor(2*u[2]))%3, sign=u[6]<.5?-1:1;
      const tokens=[];
      function row(cx,cy,n,k,vx,vy) { for(let j=0;j<n;j++) tokens.push({kind:k,x:cx+(j-(n-1)/2)*26,y:cy,vx,vy}); }
      if (mother===0) row(160+640*u[4],260+260*u[5],3+Math.floor(3*u[3]),kind,sign*36,-12);
      else { row(200,320,3,kind,sign*42,-8); row(760,420,3,other,-sign*42,-8); }
      return {tick:i*120,raw,mother,tokens};
    });
  }
  class Session {
    constructor({seed=1,mode='standard',mechanism='full',traffic=null}={}) {
      this.seed=seed>>>0; this.mode=mode; this.mechanism=mechanism; this.traffic=traffic || schedule(this.seed, mode==='practice'?300:45);
      this.phase='playing'; this.tick=0; this.remaining=R.duration; this.settleTicks=0; this.score=0; this.chain=0; this.maxChain=0; this.fullCount=0; this.sent=0; this.hits=0;
      this.free=[]; this.held=[]; this.volleys=[]; this.scoop=null; this.nextID=1; this.nextVolley=1; this.chainCursor=0; this.spawnIndex=0; this.actions=[]; this.commands=[]; this.events=[]; this.diagnostics=[]; this.spawnLog=[];
      if(mode==='tutorial') this.free=[154,180,206].map(x=>this.token({kind:0,x,y:420,vx:0,vy:0}));
    }
    token(p) { return {id:this.nextID++,...p,life:R.life}; }
    emit(type,data={}) { this.events.push({type,tick:this.tick,...data}); }
    activeCount() { return this.free.length+this.held.length+this.volleys.reduce((n,v)=>n+v.members.filter(m=>!m.done).length,0); }
    enqueue(type,p) { if(this.phase!=='playing') return; if(p && (!Number.isFinite(p.x)||!Number.isFinite(p.y))) return; this.actions.push({type,...(p?{p:type==='press'?{x:clamp(p.x,0,960),y:clamp(p.y,0,600)}:point(p)}:{})}); }
    sweep(a,b) {
      if(this.held.length>=6) return;
      const candidates=this.free.map(t=>({token:t,time:contact(a,b,t)})).filter(c=>c.time!==null).sort((a,b)=>a.time-b.time || a.token.id-b.token.id);
      for(const {token} of candidates) {
        if(this.held.length===6) break;
        if(this.held.length && this.held[0].kind!==token.kind) continue;
        this.free.splice(this.free.indexOf(token),1); this.held.push({...token,captured:{x:token.x,y:token.y,vx:token.vx,vy:token.vy,life:token.life}}); this.emit('capture',{id:token.id,kind:token.kind,n:this.held.length});
      }
    }
    preview() { return this.scoop ? launch(this.scoop.A,this.scoop.B,this.held.length,this.held[0]?.kind,this.mechanism==='fixed'?{origin:{x:R.centers[this.fixedKind??0],y:480}}:{}) : null; }
    cancel(reason='cancel') {
      if(!this.scoop) return;
      if(this.mechanism!=='fixed') for(const token of this.held) { const restored={id:token.id,kind:token.kind,...token.captured}; this.free.push(restored); }
      this.held=[]; this.scoop=null; this.emit('cancel',{reason});
    }
    release() {
      if(!this.scoop) return;
      if(this.mechanism==='collect') {
        if(!this.held.length) return this.cancel('empty');
        const n=this.held.length; this.score+=10*n; this.hits+=n; this.sent+=n; this.emit('collect',{n,delta:n*10}); this.held=[]; this.scoop=null; return;
      }
      const info=this.preview();
      if(!info.valid) return this.cancel(info.reason);
      const v={id:this.nextVolley++,n:this.held.length,q:0,terminated:0,committed:false,members:info.rays.map((ray,i)=>({id:this.held[i].id,kind:this.held[i].kind,...ray,x:ray.p.x,y:ray.p.y,traveled:0,done:false}))};
      this.volleys.push(v); this.sent+=v.n; this.held=[]; this.scoop=null; this.emit('release',{id:v.id,n:v.n});
    }
    consume() {
      const actions=this.actions; this.actions=[];
      for(const a of actions) {
        this.commands.push({tick:this.tick,seq:this.commands.length,...a});
        if(a.type==='press' && !this.scoop) {
          this.scoop={A:this.mechanism==='fixed'?{x:R.centers[this.fixedKind??0],y:260}:{...a.p},B:point(a.p)};
          if(this.mechanism==='fixed') {
            if(this.activeCount()+6>48) {this.cancel('capacity');continue;}
            this.held=Array.from({length:6},()=>this.token({kind:this.fixedKind??0,x:a.p.x,y:a.p.y,vx:0,vy:0})).map(t=>({...t,captured:{x:t.x,y:t.y,vx:0,vy:0,life:t.life}}));
          } else this.sweep(this.scoop.B,this.scoop.B);
          this.emit('press');
        } else if(a.type==='move' && this.scoop) { const old=this.scoop.B; this.scoop.B={...a.p}; if(this.mechanism!=='fixed') this.sweep(old,a.p); }
        else if(a.type==='release' && this.scoop) { if(a.p) { const old=this.scoop.B; this.scoop.B={...a.p}; if(this.mechanism!=='fixed') this.sweep(old,a.p); } this.release(); }
        else if(a.type==='cancel') this.cancel();
      }
    }
    flying(force=false) {
      for(const v of this.volleys) for(const m of v.members) {
        if(m.done) continue;
        m.traveled+=m.speed/60;
        if(force || m.traveled >= m.hit.distance-R.eps) {
          m.x=m.hit.x; m.y=m.hit.y; m.done=true; m.success=!force && m.hit.success; v.terminated++; if(m.success) v.q++;
          this.emit('arrival',{kind:m.kind,x:m.x,y:m.y,success:m.success,reason:m.hit.reason,deviation:m.hit.deviation});
        } else { m.x=m.p.x+m.d.x*m.traveled; m.y=m.p.y+m.d.y*m.traveled; }
      }
    }
    commit() {
      for(const v of this.volleys) if(v.terminated===v.n && !v.committed) {
        v.committed=true; v.delta=score(v.n,v.q); this.score+=v.delta; this.hits+=v.q;
        if(v.q===v.n && v.n>=3) this.fullCount++;
        this.emit('result',{id:v.id,n:v.n,q:v.q,delta:v.delta,reasons:v.members.filter(m=>!m.success).map(m=>m.hit.reason)});
      }
      while(this.volleys[this.chainCursor]?.committed) {
        const v=this.volleys[this.chainCursor++];
        if(v.q!==v.n) this.chain=0; else if(v.n>=3) this.chain++;
        this.maxChain=Math.max(this.maxChain,this.chain);
      }
    }
    spawn() {
      if(this.mode==='tutorial' || this.mechanism==='fixed') return;
      if(this.mode==='practice' && this.spawnIndex===this.traffic.length) {
        const offset=this.traffic.length*120;
        this.traffic.push(...schedule((this.seed+this.spawnIndex)>>>0).map(g=>({...g,tick:g.tick+offset})));
      }
      const opportunity=this.traffic[this.spawnIndex];
      if(!opportunity || opportunity.tick!==this.tick) return;
      this.spawnIndex++;
      const accepted=this.activeCount()+opportunity.tokens.length<=48;
      this.spawnLog.push({tick:this.tick,accepted,raw:opportunity.raw});
      if(accepted) this.free.push(...opportunity.tokens.map(p=>this.token(p)));
      this.emit('spawn',{accepted,n:opportunity.tokens.length});
    }
    step() {
      this.events=[];
      if(this.phase==='paused' || this.phase==='results') return this.events;
      if(this.phase==='playing') {
        this.consume();
        if(this.mode!=='tutorial') {
          for(const t of this.free) { t.x+=t.vx/60; t.y+=t.vy/60; t.life--; }
          this.free=this.free.filter(t=>t.life>0 && t.x>=0 && t.x<=960 && t.y>=0 && t.y<=600);
        }
        this.flying(); this.commit(); this.spawn();
        if(this.mode==='standard' && --this.remaining===0) { this.cancel('timeout'); this.phase='settling'; this.emit('timeout'); }
      } else if(this.phase==='settling') {
        this.flying(); this.commit(); this.settleTicks++;
        if(this.settleTicks>=180 && this.volleys.some(v=>!v.committed)) { this.diagnostics.push({tick:this.tick,issue:'settling-timeout'}); this.flying(true); this.commit(); }
      }
      this.tick++;
      if(this.phase==='settling' && this.volleys.every(v=>v.committed)) { this.phase='results'; this.emit('end'); }
      return this.events;
    }
    pause() { if(['playing','settling'].includes(this.phase)) { this.actions=[]; this.cancel('pause'); this.resumePhase=this.phase; this.phase='paused'; } }
    resume() { if(this.phase==='paused') { this.phase=this.resumePhase||'playing'; this.actions=[]; } }
    endPractice() { if(this.mode==='practice' && this.phase==='playing') { this.consume(); this.cancel('end-practice'); this.phase='settling'; } }
    record() { return {schema:1,build:'scoop-snap-html-1',rules:R.version,seed:this.seed,mode:this.mode,mechanism:this.mechanism,traffic:this.traffic,commands:this.commands,spawnLog:this.spawnLog,volleys:this.volleys.map(v=>({id:v.id,n:v.n,q:v.q,committed:v.committed,delta:v.delta,members:v.members.map(m=>({id:m.id,kind:m.kind,p:m.p,hit:m.hit,done:m.done,success:m.success}))})),score:this.score,phase:this.phase,diagnostics:this.diagnostics}; }
    snapshot() { return JSON.parse(JSON.stringify(this)); }
    static restore(data) {
      if(!data || !['standard','practice','tutorial'].includes(data.mode) || !['playing','paused','settling','results'].includes(data.phase) || !Number.isInteger(data.tick) || data.tick<0 || data.tick>1000000 || !Number.isFinite(data.score) || data.score<0 || !Array.isArray(data.free) || !Array.isArray(data.held) || !Array.isArray(data.volleys) || !Array.isArray(data.traffic)) throw Error('bad snapshot');
      if(data.free.length+data.held.length+data.volleys.reduce((n,v)=>n+v.members.filter(m=>!m.done).length,0)>48 || data.held.length>6 || data.traffic.length>10000 || data.commands.length>100000) throw Error('bad limits');
      const tokens=[...data.free,...data.held,...data.volleys.flatMap(v=>v.members)];
      if(tokens.some(t=>!Number.isFinite(t.x)||!Number.isFinite(t.y)||![0,1,2].includes(t.kind)) || new Set(tokens.map(t=>t.id)).size!==tokens.length) throw Error('bad tokens');
      const s=Object.assign(new Session({seed:data.seed,mode:data.mode,mechanism:data.mechanism,traffic:data.traffic}),data); s.actions=[];
      if(s.phase!=='results') { const phase=s.phase==='paused'?s.resumePhase:s.phase; s.cancel('restore'); s.resumePhase=phase; s.phase='paused'; }
      return s;
    }
  }
  const api={R,contact,boundary,launch,score,schedule,Session};
  if(typeof module!=='undefined') module.exports=api;
  else root.ScoopRules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
