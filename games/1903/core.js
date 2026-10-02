(function (root) {
  'use strict';
  const DT = 1 / 120, REST = { x: 500, y: 550 };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const pose = h => ({ x: clamp(h.x, 400, 600), y: clamp(h.y, 520, 700) });
  function curve(h, u) {
    return { x: 80 + 840 * u + 4 * (h.x - 500) * u * (1 - u), y: 500 + 4 * (h.y - 500) * u * (1 - u) };
  }
  function normal(h, u) {
    const tx = 840 + 4 * (h.x - 500) * (1 - 2 * u), ty = 4 * (h.y - 500) * (1 - 2 * u);
    const length = Math.hypot(tx, ty);
    return { x: ty / length, y: -tx / length };
  }
  function closest(p, h) {
    let best = { distance: Infinity, u: 0 };
    let a = curve(h, 0);
    for (let i = 1; i <= 32; i++) {
      const b = curve(h, i / 32), dx = b.x - a.x, dy = b.y - a.y;
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
      const distance = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
      if (distance < best.distance) best = { distance, u: (i - 1 + t) / 32 };
      a = b;
    }
    return best;
  }
  // Distance to the moving polyline is Lipschitz with this speed bound.
  // Interval pruning covers the whole motion, including an instantaneous drag.
  function beltContact(p0, p1, h0, h1) {
    const speed = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(h1.x - h0.x, h1.y - h0.y);
    const sample = t => closest(mix(p0, p1, t), mix(h0, h1, t));
    const first = sample(0), radius = 14;
    if (first.distance <= radius) return { t: 0, u: first.u };
    if (first.distance - speed > radius || speed === 0) return null;
    let visits = 0;
    function search(lo, hi) {
      visits++;
      const mid = (lo + hi) / 2, q = sample(mid);
      if (q.distance - speed * (hi - lo) / 2 > radius + 1e-9) return null;
      if (speed * (hi - lo) <= .005) return { t: mid, u: q.u };
      if (visits > 32768) throw new Error('BELT_CCD_BUDGET');
      return search(lo, mid) || search(mid, hi);
    }
    return search(0, 1);
  }
  function circleContact(a, b, center, radius = 34) {
    const dx = b.x - a.x, dy = b.y - a.y, x = a.x - center.x, y = a.y - center.y;
    const c = x * x + y * y - radius * radius;
    if (c <= 0) return 0;
    const aa = dx * dx + dy * dy;
    if (aa === 0) return null;
    const bb = 2 * (x * dx + y * dy), disc = bb * bb - 4 * aa * c;
    if (disc < 0) return null;
    const t = (-bb - Math.sqrt(disc)) / (2 * aa);
    return t >= 0 && t <= 1 ? t : null;
  }
  function boundaryTime(p, delta) {
    let t = Infinity;
    if (delta.x > 0) t = Math.min(t, (1000 - p.x) / delta.x);
    if (delta.x < 0) t = Math.min(t, -p.x / delta.x);
    if (delta.y > 0) t = Math.min(t, (760 - p.y) / delta.y);
    if (delta.y < 0) t = Math.min(t, -p.y / delta.y);
    return t;
  }
  function preview(h, u, targets) {
    const p = curve(h, u), n = normal(h, u), delta = { x: n.x * 2500, y: n.y * 2500 };
    let t = boundaryTime(p, delta), targetId = null;
    const end = { x: p.x + delta.x, y: p.y + delta.y };
    for (const target of targets.filter(t => !t.lit).sort((a, b) => a.id - b.id)) {
      const hit = circleContact(p, end, target);
      if (hit !== null && hit < t) { t = hit; targetId = target.id; }
    }
    return { from: p, to: { x: p.x + t * delta.x, y: p.y + t * delta.y }, targetId };
  }
  const volleyScore = k => 100 * k + 25 * k * (k - 1);
  class Session {
    constructor(waves, options = {}) {
      this.waves = JSON.parse(JSON.stringify(waves));
      this.mode = options.mode || 'standard'; this.seed = options.seed || 1;
      this.phase = 'playing'; this.paused = false; this.tick = 0; this.activeTicks = 0; this.drainTicks = 0;
      this.h = { ...REST }; this.grab = null; this.recovery = null;
      this.balls = []; this.targets = []; this.volleys = []; this.score = 0;
      this.hits = 0; this.shots = 0; this.misses = 0; this.bestVolley = 0; this.cleared = 0; this.failed = 0;
      this.nextId = 1; this.waveIndex = -1; this.transition = 0;
      this.events = []; this.history = []; this.commands = []; this.waveHistory = [];
      this.beginWave();
    }
    emit(type, data = {}) {
      const e = { tick: this.tick, type, ...data };
      this.events.push(e); this.history.push(e);
    }
    caught() { return this.balls.filter(b => b.state === 'caught'); }
    beginWave() {
      this.waveIndex++;
      if (this.waveIndex >= this.waves.length && this.mode === 'tutorial') { this.end('collection'); return; }
      const w = this.waves[this.waveIndex % this.waves.length];
      this.targets = w.targets.map(t => ({ ...t, id: this.nextId++, lit: false }));
      this.waveTicks = 0; this.spawnCursor = 0; this.transition = 0;
      this.waveHistory.push({ index: this.waveIndex, tick: this.tick, layout: JSON.parse(JSON.stringify(w)) });
      this.emit('wave', { index: this.waveIndex });
    }
    pause() {
      if (this.phase === 'results') return;
      if (this.grab) this.commands.push({ tick: this.tick, boundary: 'after', actions: [{ type: 'cancel' }] });
      this.applyActions([{ type: 'cancel' }], []); this.paused = true;
    }
    resume() { this.paused = false; }
    applyActions(actions, paths) {
      for (const action of actions) {
        if (!action || typeof action.type !== 'string') continue;
        if (action.type === 'cancel') {
          if (this.grab) {
            const from = { ...this.h }; this.h = { ...this.grab.origin }; paths.push([from, { ...this.h }]);
            for (const ball of this.caught()) { const p = curve(this.h, ball.u); ball.x = p.x; ball.y = p.y; }
            this.grab = null; this.recovery = null; this.emit('cancel');
          }
          continue;
        }
        if (this.phase !== 'playing' || this.transition > 0) { this.emit('rejected', { reason: this.transition > 0 ? 'transition' : 'time' }); continue; }
        if (action.type === 'grab' && !this.grab) {
          this.grab = { origin: { ...this.h } }; this.recovery = null; this.emit('grab');
        }
        if (action.type === 'move' && this.grab && Number.isFinite(action.x) && Number.isFinite(action.y)) {
          const from = { ...this.h }; this.h = pose(action); paths.push([from, { ...this.h }]);
        }
        if (action.type === 'release' && this.grab) {
          const balls = this.caught(), id = this.volleys.length + 1;
          if (balls.length) {
            this.volleys.push({ id, count: balls.length, hits: 0, resolved: 0, done: false });
            this.shots += balls.length;
            for (const ball of balls) {
              const p = curve(this.h, ball.u), n = normal(this.h, ball.u);
              Object.assign(ball, { state: 'outgoing', x: p.x, y: p.y, vx: 1200 * n.x, vy: 1200 * n.y, age: 0, volley: id });
            }
          }
          this.emit('release', { volley: id, count: balls.length, h: { ...this.h } });
          this.recovery = { from: { ...this.h }, elapsed: 0 }; this.grab = null;
        }
      }
    }
    finishBall(ball, reason, target) {
      if (ball.state === 'outgoing') {
        const v = this.volleys[ball.volley - 1]; v.resolved++;
        if (reason === 'hit') {
          const before = volleyScore(v.hits); v.hits++;
          const points = volleyScore(v.hits) - before;
          this.score += points; this.hits++; this.bestVolley = Math.max(this.bestVolley, v.hits);
          this.emit('hit', { ball: ball.id, target: target.id, x: target.x, y: target.y, points, k: v.hits });
        }
      }
      if (reason === 'miss') { this.misses++; this.emit('miss', { ball: ball.id, x: ball.x, y: ball.y }); }
      ball.state = reason;
    }
    resolveVolleys() {
      for (const v of this.volleys) if (!v.done && v.resolved === v.count) {
        v.done = true;
        this.emit('volley', { id: v.id, hits: v.hits, count: v.count, points: volleyScore(v.hits), perfect: v.hits >= 2 && v.hits === v.count });
      }
    }
    end(reason) {
      this.grab = null; this.recovery = null; this.phase = 'results';
      for (const b of this.balls) if (['incoming', 'caught', 'outgoing'].includes(b.state)) this.finishBall(b, 'cancelled');
      this.balls = []; this.resolveVolleys(); this.emit('end', { reason, score: this.score });
    }
    step(actions = []) {
      this.events = [];
      if (this.paused || this.phase === 'results') return this.events;
      this.tick++;
      if (actions.length) this.commands.push({ tick: this.tick, actions: JSON.parse(JSON.stringify(actions)) });
      const paths = [], before = { ...this.h };
      this.applyActions(actions, paths);
      const afterActions = { ...this.h };
      if (this.recovery) {
        this.recovery.elapsed += DT;
        const t = Math.min(1, this.recovery.elapsed / .16), ease = 1 - (1 - t) ** 2;
        this.h = mix(this.recovery.from, REST, ease);
        if (t >= 1) this.recovery = null;
      }
      if (this.phase === 'playing') {
        this.activeTicks++;
        if (this.transition > 0) {
          this.transition--;
          if (this.transition === 0) this.beginWave();
        } else {
          const w = this.waves[this.waveIndex % this.waves.length];
          while (this.spawnCursor < w.incomingX.length && this.waveTicks >= Math.round((this.spawnCursor < 4 ? this.spawnCursor * .35 : 3 + (this.spawnCursor - 4) * .35) * 120)) {
            this.balls.push({ id: this.nextId++, state: 'incoming', x: w.incomingX[this.spawnCursor], y: 90, wave: this.waveIndex, overflow: false });
            this.spawnCursor++;
          }
          this.waveTicks++;
        }
      }
      const collisions = [], incomingEnds = new Map();
      for (const ball of this.balls) {
        if (ball.state === 'caught') {
          const p = curve(this.h, ball.u); ball.x = p.x; ball.y = p.y;
        } else if (ball.state === 'incoming') {
          const p0 = { x: ball.x, y: ball.y }, p1 = { x: ball.x, y: ball.y + 380 * DT };
          incomingEnds.set(ball.id, p1);
          if (!ball.overflow && this.phase === 'playing' && this.transition === 0) {
            let contact = null;
            for (let i = 0; i < paths.length; i++) {
              const c = beltContact(p0, p0, paths[i][0], paths[i][1]);
              if (c) { contact = { ...c, t: (i + c.t) / (paths.length + 1) }; break; }
            }
            if (!contact) {
              const c = beltContact(p0, p1, paths.length ? afterActions : before, this.h);
              if (c) contact = { ...c, t: (paths.length + c.t) / (paths.length + 1) };
            }
            if (contact) collisions.push({ t: contact.t, kind: 'capture', priority: 2, ball, u: contact.u, targetId: 0 });
          }
          if (p1.y > 770) collisions.push({ t: 1, kind: 'miss', priority: 3, ball, targetId: 0 });
        } else if (ball.state === 'outgoing') {
          const a = { x: ball.x, y: ball.y }, delta = { x: ball.vx * DT, y: ball.vy * DT }, b = { x: a.x + delta.x, y: a.y + delta.y };
          for (const target of this.targets) if (!target.lit) {
            const t = circleContact(a, b, target);
            if (t !== null) collisions.push({ t, kind: 'hit', priority: 0, ball, target, targetId: target.id });
          }
          const out = boundaryTime(a, delta), age = (1.8 - ball.age) / DT;
          if (out <= 1) collisions.push({ t: Math.max(0, out), kind: 'miss', priority: 1, ball, targetId: 0 });
          if (age <= 1 + 1e-9) collisions.push({ t: clamp(age, 0, 1), kind: 'miss', priority: 3, ball, targetId: 0 });
          ball.x = b.x; ball.y = b.y; ball.age += DT;
        }
      }
      collisions.sort((a, b) => a.t - b.t || a.priority - b.priority || a.targetId - b.targetId || a.ball.id - b.ball.id);
      for (const c of collisions) {
        const ball = c.ball;
        if (c.kind === 'capture' && ball.state === 'incoming' && !ball.overflow) {
          if (this.caught().length < 4) {
            const p = curve(this.h, c.u);
            Object.assign(ball, { state: 'caught', u: c.u, x: p.x, y: p.y, caughtTick: this.tick });
            this.emit('capture', { ball: ball.id, u: c.u, x: p.x, y: p.y });
          } else { ball.overflow = true; this.emit('full', { ball: ball.id, x: ball.x, y: ball.y }); }
        }
        if (c.kind === 'hit' && ball.state === 'outgoing' && !c.target.lit) {
          c.target.lit = true; this.finishBall(ball, 'hit', c.target);
        }
        if (c.kind === 'miss' && ['incoming', 'outgoing'].includes(ball.state)) this.finishBall(ball, 'miss');
      }
      for (const b of this.balls) if (b.state === 'incoming') Object.assign(b, incomingEnds.get(b.id));
      this.resolveVolleys();
      if (['playing', 'draining'].includes(this.phase) && this.transition === 0) {
        if (this.targets.every(t => t.lit)) {
          this.score += 100; this.cleared++;
          this.applyActions([{ type: 'cancel' }], []);
          for (const b of this.balls) if (['incoming', 'outgoing'].includes(b.state)) this.finishBall(b, 'cancelled');
          this.resolveVolleys(); this.transition = 30;
          this.emit('clear', { points: 100, index: this.waveIndex });
        } else if (this.phase === 'playing' && this.spawnCursor === this.waves[this.waveIndex % this.waves.length].incomingX.length && !this.balls.some(b => ['incoming', 'outgoing', 'caught'].includes(b.state))) {
          this.applyActions([{ type: 'cancel' }], []);
          this.failed++; this.transition = 30; this.emit('waveFail', { remaining: this.targets.filter(t => !t.lit).length });
        }
      }
      this.balls = this.balls.filter(b => ['incoming', 'outgoing', 'caught'].includes(b.state));
      if (this.phase === 'playing' && this.mode === 'standard' && this.activeTicks >= 10800) {
        this.phase = 'draining'; this.grab = null; this.recovery = null;
        for (const b of this.balls) if (b.state !== 'outgoing') this.finishBall(b, 'cancelled');
        this.balls = this.balls.filter(b => b.state === 'outgoing'); this.emit('draining');
      } else if (this.phase === 'draining') this.drainTicks++;
      if (this.phase === 'draining' && (!this.balls.some(b => b.state === 'outgoing') || this.drainTicks >= 240)) this.end('time');
      return this.events;
    }
    snapshot() {
      return JSON.parse(JSON.stringify({ tick: this.tick, activeTicks: this.activeTicks, drainTicks: this.drainTicks, phase: this.phase, h: this.h, grab: this.grab, recovery: this.recovery, balls: this.balls, targets: this.targets, score: this.score, volleys: this.volleys, waveIndex: this.waveIndex, waveTicks: this.waveTicks, spawnCursor: this.spawnCursor, transition: this.transition, nextId: this.nextId, hits: this.hits, shots: this.shots, misses: this.misses }));
    }
  }
  const api = { DT, REST, clamp, pose, mix, curve, normal, closest, beltContact, circleContact, boundaryTime, preview, volleyScore, Session, build: 'html-demo-1', rules: 'curve-volley-r0' };
  if (typeof module !== 'undefined') module.exports = api;
  root.CurveVolley = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
