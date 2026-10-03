(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DouXian = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CFG = Object.freeze({ version: '0.1-html.1', width: 960, height: 720, dt: 1 / 60,
    left: 110, right: 850, anchorY: 430, initialX: 480, initialY: 460,
    minX: 300, maxX: 660, minY: 460, maxY: 600, capacity: 6,
    slots: [250, 480, 710], safe: 58, targetY: 88, flight: 39,
    stop: 5220, end: 5400, expiry: 5520, hardEnd: 5580 });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const copy = x => JSON.parse(JSON.stringify(x));
  const EPS = 1e-9;
  function roots(a, b, c) {
    if (Math.abs(a) < EPS) return Math.abs(b) < EPS ? [] : [-c / b];
    let d = b * b - 4 * a * c;
    if (d < -EPS) return [];
    d = Math.sqrt(Math.max(0, d));
    if (d < EPS) return [-b / (2 * a)];
    const q = -0.5 * (b + (b >= 0 ? d : -d));
    return [q / a, c / q].sort((x, y) => x - y);
  }
  function bandY(x, h) {
    return x <= h.x ? 430 + (h.y - 430) * (x - 110) / (h.x - 110)
      : 430 + (h.y - 430) * (850 - x) / (850 - h.x);
  }
  function onBand(u, h) {
    return u <= 0 ? { x: h.x + u * (h.x - 110), y: h.y + u * (h.y - 430) }
      : { x: h.x + u * (850 - h.x), y: h.y - u * (h.y - 430) };
  }
  function contact(piece, oldH, newH, dy) {
    if (piece.x < 110 || piece.x > 850) return null;
    const dx = newH.x - oldH.x, dhy = newH.y - oldH.y;
    const A = piece.y + 15 - 430;
    let best = null;
    for (const side of [-1, 1]) {
      const B = side < 0 ? oldH.x - 110 : 850 - oldH.x;
      const dB = side < 0 ? dx : -dx;
      const K = side < 0 ? piece.x - 110 : 850 - piece.x;
      const a = dy * dB, b = A * dB + dy * B - dhy * K;
      const c = A * B - (oldH.y - 430) * K;
      const candidates = roots(a, b, c);
      // A root at t=0 is a contact only when approaching from above.
      if (Math.abs(c) < EPS) candidates.push(0);
      for (let t of candidates) {
        if (t < -EPS || t > 1 + EPS) continue;
        t = clamp(t, 0, 1);
        const hx = oldH.x + dx * t;
        if ((side < 0 && piece.x > hx + EPS) || (side > 0 && piece.x < hx - EPS)) continue;
        // At a root the derivative of q has the sign of F'; reject upward and tangential contact.
        if (2 * a * t + b <= EPS) continue;
        const h = { x: hx, y: oldH.y + dhy * t };
        const u = clamp((piece.x - hx) / (side < 0 ? hx - 110 : 850 - hx), -1, 1);
        if (!best || t < best.t) best = { t, u, h };
      }
    }
    return best;
  }
  function slotAt(x) { return CFG.slots.findIndex(c => x >= c - 58 && x <= c + 58); }
  function missReason(x) {
    if (x < 0 || x > 960) return 'OUTSIDE_FIELD';
    if (x < 192) return 'LEFT_OF_SLOT';
    if (x > 768) return 'RIGHT_OF_SLOT';
    return 'BETWEEN_SLOTS';
  }
  function predict(h, pieces) {
    const C = 480 + 4 / 3 * (h.x - 480), S = 100 + 240 * (h.y - 460) / 140;
    return pieces.map(p => { const x = C + S * p.u; return { id: p.id, u: p.u,
      start: onBand(p.u, h), x, y: 88, slot: slotAt(x), reason: slotAt(x) < 0 ? missReason(x) : null }; });
  }
  function score(n, h, k) { return 10 * h + 10 * Math.max(0, k - 1) + (n >= 3 && n === h ? 2 * h : 0); }
  function rng(s) {
    let x = s.rng >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    s.rng = x >>> 0; return s.rng / 4294967296;
  }
  function makeWave(s, catchTick, family, fixed = false) {
    const speed = fixed ? 200 : 180 + rng(s) * 40;
    const releaseH = fixed ? { x: 480, y: 600 } : { x: 390 + rng(s) * 180, y: 552 + rng(s) * 48 };
    const catchH = { x: 480, y: 460 };
    let us;
    if (fixed) us = [-0.65, 0, 0.65];
    else {
      const C = 480 + 4 / 3 * (releaseH.x - 480), S = 100 + 240 * (releaseH.y - 460) / 140;
      const available = CFG.slots.map(c => (c - C) / S).filter(u => Math.abs(u) <= 0.94);
      const center = available.reduce((a, b) => Math.abs(b) < Math.abs(a) ? b : a, available[0]);
      if (family === 0) us = [center - 0.06, center, center + 0.06];
      if (family === 1) { releaseH.x = 480; releaseH.y = 600; us = [-0.65, 0, 0.65]; }
      if (family === 2) { releaseH.x = 600; releaseH.y = 570; us = [-0.63, -0.55, 0.24]; }
      if (family === 3) { releaseH.x = 360; releaseH.y = 570; us = [-0.24, 0.55, 0.63]; }
      if (family === 4) us = [available[0], available[0] + 0.04, available.at(-1) - 0.04, available.at(-1)];
      if (family === 5) us = [available[0], center - 0.04, center + 0.04, available.at(-1)];
    }
    const wave = { family, catchTick, catchH, releaseH, us: [...us] };
    s.witnesses.push(wave); if (s.witnesses.length > 80) s.witnesses.shift();
    us.forEach((u, i) => {
      const pos = onBand(u, catchH), offset = family === 4 && i >= 2 ? 30 : 0;
      const spawn = Math.max(1, Math.round(catchTick + offset - (pos.y - 15 + 22) / speed * 60));
      if (s.mode === 'quick' && spawn >= CFG.stop) return;
      const p = { id: s.nextPiece++, spawn, x: pos.x,
        y: pos.y - 15 - speed * (catchTick + offset - spawn) / 60, speed, wave: family };
      s.queue.push(p); s.layout.push(copy(p));
    });
  }
  function extend(s) {
    while (s.nextCatch < (s.mode === 'quick' ? 5490 : s.tick + 900)) {
      const fixed = s.waveIndex < 3;
      makeWave(s, s.nextCatch, fixed ? 1 : Math.floor(rng(s) * 6), fixed);
      s.nextCatch += Math.round((2 + rng(s) * 1.2) * 60); s.waveIndex++;
    }
    s.queue.sort((a, b) => a.spawn - b.spawn || a.id - b.id);
    s.layout.sort((a, b) => a.spawn - b.spawn || a.id - b.id);
    if (s.layout.length>512) s.layout=s.layout.slice(-512);
  }
  function create(mode = 'quick', seed = 1906) {
    if (!['quick', 'practice', 'tutorial'].includes(mode)) throw new Error('mode');
    const s = { version: CFG.version, mode, seed: seed >>> 0, rng: (seed >>> 0) || 1906,
      tick: 0, phase: 'PLAYING', prior: 'PLAYING', held: false, handle: { x: 480, y: 460 },
      pieces: [], bag: [], batches: [], queue: [], layout: [], score: 0, nextPiece: 1, nextBatch: 1,
      nextCatch: 155, waveIndex: 0, witnesses: [], events: [], commands: [], preview: true,
      stats: { caught: 0, passed: 0, overflow: 0, hit: 0, missed: 0, unresolved: 0, expired: 0,
        released: 0, perfect: 0, bestBag: 0 }, lesson: 0, eligible: mode === 'quick' };
    if (mode === 'tutorial') {
      [-0.65, 0, 0.65].forEach(u => s.queue.push({ id: s.nextPiece++, spawn: 1,
        x: onBand(u, s.handle).x, y: 240, speed: 200, wave: 1 }));
      s.layout=copy(s.queue);
    } else extend(s);
    return s;
  }
  function emit(s, kind, data = {}) {
    const e = { tick: s.tick, kind, ...data }; s.events.push(e);
    if (s.events.length > 180) s.events.shift(); return e;
  }
  function pause(s) {
    if (!['PLAYING', 'TAIL'].includes(s.phase)) return;
    s.prior = s.phase; s.phase = 'PAUSED';
  }
  function awaitRegrab(s) { if (s.phase === 'PAUSED') s.phase = 'AWAIT_REGRAB'; }
  function step(s, actions = []) {
    const before = s.events.length, emitted = [];
    const event = (k, d) => emitted.push(emit(s, k, d));
    if (actions.some(a => a.kind === 'PAUSE')) { pause(s); return []; }
    if (s.phase === 'RESULT' || s.phase === 'PAUSED') return [];
    if (s.phase === 'AWAIT_REGRAB') {
      if (!actions.some(a => a.kind === 'BEGIN')) return [];
      s.phase = s.prior; s.held = true; event('REGRAB');
    }
    if (s.mode === 'tutorial' && s.tick === 0 && !actions.some(a => a.kind === 'BEGIN')) return [];
    s.tick++;
    const oldH = { ...s.handle };
    for (const a of actions) {
      if (a.kind === 'BEGIN') s.held = s.phase === 'PLAYING' || s.bag.length > 0;
      if (a.kind === 'MOVE' && s.held && Number.isFinite(a.x) && Number.isFinite(a.y)) {
        s.handle = { x: clamp(a.x, 300, 660), y: clamp(a.y, 460, 600) };
      }
      if (['BEGIN', 'MOVE', 'RELEASE'].includes(a.kind)) s.commands.push({ tick: s.tick, ...a });
    }
    const commandLimit=s.mode==='quick'?24000:12000;
    if (s.commands.length > commandLimit) s.commands.splice(0, s.commands.length - commandLimit);
    let captureOldH = oldH;
    if (actions.some(a => a.kind === 'RELEASE') && s.held) {
      if (s.bag.length) {
        const items = predict(s.handle, s.bag);
        const batch = { id: s.nextBatch++, release: s.tick, arrival: s.tick + 39,
          handle: { ...s.handle }, items, settled: false };
        s.batches.push(batch); s.stats.released += s.bag.length;
        event('RELEASE', { batch: copy(batch) }); s.bag = [];
      } else event('EMPTY_RELEASE');
      s.held = false; s.handle = { x: 480, y: 460 }; captureOldH = { ...s.handle };
    }
    if (s.phase === 'PLAYING') {
      if (s.mode === 'practice' && s.nextCatch < s.tick + 600) extend(s);
      while (s.queue.length && s.queue[0].spawn <= s.tick) {
        const p = s.queue.shift(); s.pieces.push({ ...p, status: 'INCOMING' });
      }
      const contacts = [];
      for (const p of s.pieces) {
        if (p.status !== 'INCOMING') continue;
        const c = contact(p, captureOldH, s.handle, p.speed / 60);
        if (c) contacts.push({ p, ...c });
      }
      contacts.sort((a, b) => Math.abs(a.t-b.t)<EPS ? a.p.id-b.p.id : a.t-b.t);
      for (const c of contacts) {
        const p = c.p;
        if (s.held && s.bag.length < 6) {
          p.status = 'CAPTURED'; s.bag.push({ id: p.id, u: c.u }); s.stats.caught++;
          event('CAPTURE', { id: p.id, u: c.u });
        } else {
          p.status = s.held ? 'OVERFLOW' : 'PASSED_UNCAUGHT';
          s.stats[s.held ? 'overflow' : 'passed']++; event(p.status, { id: p.id });
        }
      }
      for (const p of s.pieces) if (p.status !== 'CAPTURED') p.y += p.speed / 60;
      s.pieces = s.pieces.filter(p => p.status !== 'CAPTURED' && p.y <= 740);
    }
    for (const b of s.batches) {
      if (b.settled || s.tick < b.arrival) continue;
      b.settled = true;
      const hit = b.items.filter(p => p.slot >= 0), k = new Set(hit.map(p => p.slot)).size;
      const points = score(b.items.length, hit.length, k);
      s.score += points; s.stats.hit += hit.length; s.stats.missed += b.items.length - hit.length;
      s.stats.bestBag = Math.max(s.stats.bestBag, points);
      if (hit.length === b.items.length && hit.length >= 3) s.stats.perfect++;
      event('SETTLE', { id: b.id, n: b.items.length, h: hit.length, k, points,
        items: copy(b.items), perfect: hit.length === b.items.length && hit.length >= 3 });
      if (s.mode === 'tutorial') { s.phase = 'RESULT'; event('RESULT'); }
    }
    s.batches = s.batches.filter(b => !b.settled);
    if (s.mode === 'quick' && s.tick >= 5400 && s.phase === 'PLAYING') {
      s.phase = 'TAIL'; s.stats.unresolved += s.pieces.filter(p => p.status === 'INCOMING').length;
      s.pieces = []; s.queue = []; event('TAIL');
    }
    if (s.phase === 'TAIL') {
      if (s.tick >= 5520 && s.bag.length) {
        s.stats.expired += s.bag.length; s.bag = []; s.held = false; event('HELD_EXPIRED');
      }
      if ((!s.bag.length && !s.batches.length) || s.tick >= 5580) { s.phase = 'RESULT'; event('RESULT'); }
    }
    if (s.mode === 'tutorial' && !s.queue.length && !s.pieces.length && !s.bag.length && !s.batches.length && s.phase !== 'RESULT') {
      s.phase = 'RESULT'; event('RESULT');
    }
    return emitted;
  }
  function validate(s) {
    const integer = (v, max = 1e9) => Number.isInteger(v) && v >= 0 && v <= max;
    const finite = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
    if (!s || s.version !== CFG.version || !['quick', 'practice', 'tutorial'].includes(s.mode) ||
      !['PLAYING', 'TAIL', 'RESULT', 'PAUSED', 'AWAIT_REGRAB'].includes(s.phase) ||
      !['PLAYING', 'TAIL'].includes(s.prior) || !integer(s.tick) || !integer(s.seed, 4294967295) ||
      !integer(s.rng, 4294967295) || !integer(s.score) || typeof s.held !== 'boolean' ||
      typeof s.preview !== 'boolean' || typeof s.eligible !== 'boolean' ||
      !s.handle || !finite(s.handle.x, 300, 660) || !finite(s.handle.y, 460, 600)) return false;
    for (const [key, max] of [['bag',6], ['pieces',128], ['batches',128], ['queue',512], ['layout',512], ['events',180], ['commands',s.mode==='quick'?24000:12000], ['witnesses',80]])
      if (!Array.isArray(s[key]) || s[key].length > max) return false;
    if (!integer(s.nextPiece) || !integer(s.nextBatch) || !integer(s.nextCatch) || !integer(s.waveIndex) ||
      !integer(s.lesson,10) || !s.stats || Object.keys(createStats()).some(k => !integer(s.stats[k]))) return false;
    if (s.mode==='quick' && (s.tick>5580 || s.nextCatch>6000 || s.waveIndex>60)) return false;
    if (s.mode==='practice' && (s.nextCatch<s.tick || s.nextCatch>s.tick+1500)) return false;
    if (s.pieces.length+s.bag.length+s.batches.reduce((n,b)=>n+(Array.isArray(b.items)?b.items.length:1000),0)>128) return false;
    const layoutIds=new Set();let layoutSpawn=0;
    for (const p of s.layout) {
      if (!integer(p.id) || p.id<1 || p.id>=s.nextPiece || layoutIds.has(p.id) ||
        !integer(p.spawn) || p.spawn<layoutSpawn || !finite(p.x,110,850) ||
        !finite(p.y,-1000,740) || !finite(p.speed,180,220)) return false;
      layoutIds.add(p.id);layoutSpawn=p.spawn;
    }
    const ids = new Set(), add = p => {
      if (!integer(p.id) || p.id < 1 || p.id >= s.nextPiece || ids.has(p.id)) return false;
      ids.add(p.id); return true;
    };
    for (const p of s.bag) if (!add(p) || !finite(p.u, -1, 1)) return false;
    let lastSpawn = 0;
    for (const p of s.queue) {
      if (!add(p) || !integer(p.spawn) || p.spawn < s.tick || p.spawn < lastSpawn ||
        !finite(p.x,110,850) || !finite(p.y,-1000,740) || !finite(p.speed,180,220)) return false;
      lastSpawn = p.spawn;
    }
    for (const p of s.pieces) if (!add(p) || !finite(p.x,110,850) || !finite(p.y,-1000,740) ||
      !finite(p.speed,180,220) || !['INCOMING','OVERFLOW','PASSED_UNCAUGHT'].includes(p.status)) return false;
    const batchIds = new Set();
    for (const b of s.batches) {
      if (!integer(b.id) || b.id < 1 || b.id >= s.nextBatch || batchIds.has(b.id) ||
        !integer(b.release) || b.release > s.tick || b.arrival !== b.release + 39 || b.arrival <= s.tick ||
        b.settled !== false || !b.handle || !finite(b.handle.x,300,660) || !finite(b.handle.y,460,600) ||
        !Array.isArray(b.items) || !b.items.length || b.items.length > 6) return false;
      batchIds.add(b.id);
      for (const p of b.items) {
        if (!add(p) || !finite(p.u,-1,1) || !p.start) return false;
        const q = predict(b.handle,[p])[0];
        if (Math.abs(q.x-p.x)>1e-7 || q.y!==p.y || q.slot!==p.slot ||
          Math.abs(q.start.x-p.start.x)>1e-7 || Math.abs(q.start.y-p.start.y)>1e-7) return false;
      }
    }
    return true;
  }
  function createStats() { return { caught:0, passed:0, overflow:0, hit:0, missed:0, unresolved:0,
    expired:0, released:0, perfect:0, bestBag:0 }; }
  function hash(text) { let h = 2166136261; for (let i=0;i<text.length;i++) { h ^= text.charCodeAt(i); h = Math.imul(h,16777619); } return (h>>>0).toString(16); }
  function encode(s, generation) { const payload = JSON.stringify(s); return JSON.stringify({schema:1, generation, checksum:hash(payload), payload}); }
  function decode(raw) {
    try {
      if (typeof raw !== 'string' || raw.length > 2000000) return null;
      const e = JSON.parse(raw);
      if (e.schema!==1 || !Number.isSafeInteger(e.generation) || e.generation<0 || typeof e.payload!=='string' || hash(e.payload)!==e.checksum) return null;
      const s = JSON.parse(e.payload); return validate(s) ? { s, generation:e.generation } : null;
    } catch { return null; }
  }
  return { CFG, clamp, copy, roots, bandY, onBand, contact, slotAt, predict, score, create, step,
    pause, awaitRegrab, makeWave, extend, validate, hash, encode, decode };
});
