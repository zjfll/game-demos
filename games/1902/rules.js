(function (root) {
  'use strict';
  const W = 720, H = 480, LENGTH = 120, HIT = 10, EPS = 1e-7;
  const TURN_BUDGET = 240, MAX_TURNS = 12;
  const RULES_VERSION = 'R0.1', GENERATOR_VERSION = 'js-mulberry32-1';
  const mod = n => ((n % 720) + 720) % 720;
  const clone = x => JSON.parse(JSON.stringify(x));
  function endpoint(a, angle) {
    const t = mod(angle) * Math.PI / 360;
    return [a[0] + LENGTH * Math.cos(t), a[1] + LENGTH * Math.sin(t)];
  }
  const inside = p => p[0] >= 5 - EPS && p[0] <= W - 5 + EPS && p[1] >= 5 - EPS && p[1] <= H - 5 + EPS;
  const inArc = (u, start, delta) => delta >= 0 ? mod(u - start) <= delta + EPS : mod(start - u) <= -delta + EPS;
  function segmentDistance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = dx * dx + dy * dy;
    const t = d ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function sectorDistance(p, a, angle, delta) {
    if (Math.abs(delta) > TURN_BUDGET) throw new Error('Sector exceeds turn budget');
    if (!delta) return segmentDistance(p, a, endpoint(a, angle));
    const vx = p[0] - a[0], vy = p[1] - a[1];
    const u = mod(Math.atan2(vy, vx) * 360 / Math.PI);
    if (inArc(u, angle, delta)) return Math.max(0, Math.hypot(vx, vy) - LENGTH);
    return Math.min(segmentDistance(p, a, endpoint(a, angle)), segmentDistance(p, a, endpoint(a, angle + delta)));
  }
  function arcLegal(a, angle, delta) {
    if (Math.abs(delta) > TURN_BUDGET || !inside(a) || !inside(endpoint(a, angle)) || !inside(endpoint(a, angle + delta))) return false;
    return [0, 180, 360, 540].every(c => !inArc(c, angle, delta) || inside(endpoint(a, c)));
  }
  function legalPrefix(a, angle, delta) {
    if (!delta || arcLegal(a, angle, delta)) return delta;
    let accepted = 0;
    const sign = Math.sign(delta);
    for (let n = 1; n <= Math.abs(delta); n++) {
      if (!arcLegal(a, angle, sign * n)) break;
      accepted = sign * n;
    }
    return accepted;
  }
  // Synchronous SHA-256 keeps file:// saves and Node verification on the same codec.
  function sha256(text) {
    const bytes = new TextEncoder().encode(text), len = bytes.length;
    const data = new Uint8Array(Math.ceil((len + 9) / 64) * 64);
    data.set(bytes); data[len] = 128;
    const view = new DataView(data.buffer);
    view.setUint32(data.length - 8, Math.floor(len / 0x20000000));
    view.setUint32(data.length - 4, (len * 8) >>> 0);
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const w = new Uint32Array(64);
    for (let offset = 0; offset < data.length; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3);
        const s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,hh] = h;
      for (let i = 0; i < 64; i++) {
        const s1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const t1 = (hh + s1 + ((e & f) ^ (~e & g)) + k[i] + w[i]) >>> 0;
        const s0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        hh=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      [a,b,c,d,e,f,g,hh].forEach((v,i) => h[i]=(h[i]+v)>>>0);
    }
    return h.map(v => v.toString(16).padStart(8,'0')).join('');
  }
  const boardHash = targets => sha256(JSON.stringify({codec:'sweep-js-board-1', rules:RULES_VERSION, targets}));
  class Session {
    constructor(targets, seed = '0', testFixture = false) {
      if (!Array.isArray(targets) || !targets.length || (!testFixture && targets.length !== 48)) throw new Error('Invalid target count');
      const ids = targets.map(t => t.id);
      if (ids.some(i => !Number.isSafeInteger(i)) || new Set(ids).size !== ids.length) throw new Error('Invalid IDs');
      for (const t of targets) if (![t.x,t.y].every(n => typeof n === 'number' && Number.isFinite(n)) || !inside([t.x,t.y])) throw new Error('Invalid point');
      this.targets = clone(targets); this.seed = String(seed); this.a = [300,240]; this.angle = 0;
      this.turns_left = 12; this.phase = 'READY'; this.previous_phase = ''; this.used = 0;
      this.alive = new Set(ids); this.stroke_ids = new Set(); this.score = 0; this.action_seq = 0; this.reason = '';
      this.board_hash = boardHash(this.targets); this.check();
    }
    check() {
      const ids = new Set(this.targets.map(t => t.id));
      if (!['READY','ACTIVE','PAUSED','RESULT'].includes(this.phase) || !Number.isInteger(this.turns_left) || this.turns_left < 0 || this.turns_left > 12 || !Number.isInteger(this.used) || this.used < 0 || this.used > 240 || !Number.isInteger(this.angle) || this.angle < 0 || this.angle >= 720 || !this.a.every(Number.isFinite) || !arcLegal(this.a,this.angle,0) || [...this.alive].some(i=>!ids.has(i)) || [...this.stroke_ids].some(i=>!ids.has(i)||this.alive.has(i)) || this.score !== 100*(ids.size-this.alive.size) || (this.phase !== 'RESULT' && this.turns_left === 0) || (this.phase === 'PAUSED' && !['READY','ACTIVE'].includes(this.previous_phase))) throw new Error('Session invariant failed');
    }
    apply(kind, units = 0) {
      const result = {accepted:false, kind, applied_units:0, hits:[], reason:'WRONG_PHASE'};
      if (this.phase === 'RESULT') return result;
      if (kind === 'PAUSE' && this.phase !== 'PAUSED') { this.previous_phase=this.phase; this.phase='PAUSED'; }
      else if (kind === 'RESUME' && this.phase === 'PAUSED') { this.phase=this.previous_phase; this.previous_phase=''; }
      else if (kind === 'BEGIN' && this.phase === 'READY') { this.phase='ACTIVE'; this.used=0; this.stroke_ids.clear(); }
      else if (kind === 'ROTATE' && this.phase === 'ACTIVE') {
        if (!Number.isSafeInteger(units)) { result.reason='INVALID_PAYLOAD'; return result; }
        const limit = Math.min(Math.abs(units),TURN_BUDGET-this.used);
        let k=legalPrefix(this.a,this.angle,units >= 0 ? limit : -limit);
        if (!k) { result.reason='NO_PROGRESS'; return result; }
        const remaining=this.targets.filter(t=>this.alive.has(t.id));
        const hits=remaining.filter(t=>sectorDistance([t.x,t.y],this.a,this.angle,k)<=HIT+EPS).map(t=>t.id);
        if (hits.length === this.alive.size) {
          const sign=Math.sign(k); let low=1, high=Math.abs(k);
          while (low < high) {
            const mid=Math.floor((low+high)/2);
            if (remaining.every(t=>sectorDistance([t.x,t.y],this.a,this.angle,sign*mid)<=HIT+EPS)) high=mid; else low=mid+1;
          }
          k=sign*low;
        }
        hits.sort((a,b)=>a-b);
        hits.forEach(id=>{this.alive.delete(id); this.stroke_ids.add(id);});
        this.score+=100*hits.length; this.angle=mod(this.angle+k); this.used+=Math.abs(k);
        result.hits=hits; result.applied_units=k;
        if (!this.alive.size) { this.turns_left--; this.phase='RESULT'; this.reason='CLEAR'; }
      } else if (kind === 'COMMIT' && this.phase === 'ACTIVE') {
        if (this.used) { this.a=endpoint(this.a,this.angle); this.angle=mod(this.angle+360); this.turns_left--; }
        this.used=0; this.phase='READY'; this.stroke_ids.clear(); this.endIfEmpty();
      } else if (kind === 'PASS' && this.phase === 'READY') {
        this.a=endpoint(this.a,this.angle); this.angle=mod(this.angle+360); this.turns_left--; this.endIfEmpty();
      } else return result;
      this.action_seq++; result.accepted=true; result.reason='OK'; this.check(); return result;
    }
    endIfEmpty() { if (!this.turns_left) { this.phase='RESULT'; this.reason='TURNS_EXHAUSTED'; } }
    snapshot() {
      return {targets:clone(this.targets),seed:this.seed,a:this.a.slice(),angle:this.angle,turns_left:this.turns_left,phase:this.phase,previous_phase:this.previous_phase,used:this.used,alive:[...this.alive].sort((a,b)=>a-b),stroke_ids:[...this.stroke_ids].sort((a,b)=>a-b),score:this.score,action_seq:this.action_seq,reason:this.reason,rules_version:RULES_VERSION,board_hash:this.board_hash};
    }
    static restore(obj, testFixture=false) {
      if (obj.rules_version !== RULES_VERSION) throw new Error('Unsupported rules');
      const s=new Session(obj.targets,obj.seed,testFixture);
      if (obj.board_hash !== s.board_hash) throw new Error('Board checksum mismatch');
      for (const key of ['a','angle','turns_left','phase','previous_phase','used','score','action_seq','reason']) s[key]=clone(obj[key]);
      if (!Array.isArray(obj.alive) || !Array.isArray(obj.stroke_ids) || new Set(obj.alive).size!==obj.alive.length || new Set(obj.stroke_ids).size!==obj.stroke_ids.length || !Number.isSafeInteger(s.action_seq) || s.action_seq < 0) throw new Error('Invalid snapshot');
      s.alive=new Set(obj.alive); s.stroke_ids=new Set(obj.stroke_ids); s.check(); return s;
    }
  }
  function rngFor(seed) {
    let state=2166136261;
    for (const byte of new TextEncoder().encode(String(seed))) state=Math.imul(state^byte,16777619)>>>0;
    return () => { state=(state+0x6D2B79F5)>>>0; let t=state; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
  }
  function replay(targets, route, seed) {
    const s=new Session(targets,seed);
    for (const k of route) {
      if (s.phase==='RESULT') break;
      s.apply('BEGIN'); const r=s.apply('ROTATE',k);
      if (r.applied_units!==k && s.reason!=='CLEAR') throw new Error('Illegal witness');
      if (s.phase!=='RESULT') s.apply('COMMIT');
    }
    return s;
  }
  function generate(seed, fallback) {
    seed=String(seed); const rng=rngFor(seed);
    for (let attempt=1; attempt<=32; attempt++) {
      let a=[300,240],angle=0,failed=false; const targets=[],route=[];
      for (let hand=0; hand<12; hand++) {
        const options=[-240,-180,-120,-60,60,120,180,240].filter(k=>arcLegal(a,angle,k));
        if (!options.length) {failed=true; break;}
        const k=options[Math.floor(rng()*options.length)];
        for (let p=0; p<4; p++) {
          let found=false;
          for (let trial=0; trial<64; trial++) {
            const u=angle+k*(0.05+0.9*rng()),radius=Math.sqrt(0.12+0.88*rng())*LENGTH,rad=u*Math.PI/360;
            const point=[a[0]+radius*Math.cos(rad),a[1]+radius*Math.sin(rad)];
            if (!inside(point) || segmentDistance(point,[300,240],[420,240])<=HIT+EPS || targets.some(t=>Math.hypot(point[0]-t.x,point[1]-t.y)<16)) continue;
            targets.push({id:targets.length,x:point[0],y:point[1]}); found=true; break;
          }
          if (!found) {failed=true; break;}
        }
        if (failed) break;
        route.push(k); a=endpoint(a,angle+k); angle=mod(angle+k+360);
      }
      if (failed || targets.length!==48 || replay(targets,route,seed).reason!=='CLEAR') continue;
      return {seed,rules_version:RULES_VERSION,generator_version:GENERATOR_VERSION,targets,witness_units:route,board_hash:boardHash(targets),generation_attempts:attempt,fallback:false};
    }
    if (!fallback || replay(fallback.targets,fallback.witness_units,seed).reason!=='CLEAR') throw new Error('No valid fallback');
    return {...clone(fallback),seed,generator_version:GENERATOR_VERSION,board_hash:boardHash(fallback.targets),fallback:true,generation_attempts:32};
  }
  const api={W,H,LENGTH,HIT,EPS,TURN_BUDGET,MAX_TURNS,RULES_VERSION,GENERATOR_VERSION,endpoint,inside,inArc,segmentDistance,sectorDistance,arcLegal,legalPrefix,boardHash,sha256,Session,rngFor,replay,generate};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else root.SweepRules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
