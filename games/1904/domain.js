(function (root) {
  'use strict';
  const R = Object.freeze({ version: 'rules-v0.1', W: 960, H: 540, pearl: 10, ring: 20,
    hit: 30, perfect: 6, near: 36, dead: 8, K: 3, max: 900, dt: 1 / 120,
    damping: 1.5, stop: 20, ticks: 360, collisions: 8, eps: 1e-7, timeQ: 1e6 });
  const copy = x => JSON.parse(JSON.stringify(x));
  const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const quantize = q => ({ x: Math.round(q.x * 16) / 16, y: Math.round(q.y * 16) / 16 });
  const inside = (p, margin = 0) => finitePoint(p) && p.x >= margin && p.x <= R.W - margin && p.y >= margin && p.y <= R.H - margin;
  function launch(p, q) {
    const d = dist(p, q);
    if (d <= R.dead) return { x: 0, y: 0 };
    const k = Math.min(R.K, R.max / d);
    return { x: (p.x - q.x) * k, y: (p.y - q.y) * k };
  }
  function hash(x) {
    const s = JSON.stringify(x, (_, v) => typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  function validateBoard(b, initial = true) {
    if (!b || typeof b.id !== 'string' || b.id.length > 40 || !Array.isArray(b.pearls) || b.pearls.length !== 3 ||
      !Array.isArray(b.rings) || b.rings.length !== 12 || !Array.isArray(b.bumpers) || b.bumpers.length > 3) return false;
    if (!b.pearls.every(p => inside(p, 10)) || !b.rings.every(p => inside(p, 20)) ||
      !b.bumpers.every(p => Number.isFinite(p.r) && p.r >= 15 && p.r <= 100 && inside(p, p.r))) return false;
    if (b.pearls.some(p => b.bumpers.some(o => dist(p, o) < o.r + 10 - R.eps))) return false;
    if (!initial) return true;
    if (b.rings.some((p, i) => b.rings.some((q, j) => j < i && dist(p, q) < 42) ||
      b.pearls.some(q => dist(p, q) < 32) || b.bumpers.some(q => dist(p, q) < q.r + 22))) return false;
    if (b.pearls.some((p, i) => b.pearls.some((q, j) => j < i && dist(p, q) < 22))) return false;
    return !b.bumpers.some((p, i) => b.bumpers.some((q, j) => j < i && dist(p, q) < p.r + q.r + 24));
  }
  function initialState(board) {
    if (!validateBoard(board)) throw Error('INVALID_BOARD');
    return { board: copy(board), pearls: copy(board.pearls), consumed: Array(12).fill(false),
      owners: Array(12).fill(null), shots: 4, score: 0, bestShot: 0, actions: [] };
  }
  function interval(a, b, c, radius) {
    const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - c.x, fy = a.y - c.y;
    const A = dx * dx + dy * dy, C = fx * fx + fy * fy - radius * radius;
    if (A < R.eps * R.eps) return C <= R.eps ? [0, 1] : null;
    const B = 2 * (fx * dx + fy * dy), disc = B * B - 4 * A * C;
    if (disc < -R.eps) return null;
    const s = Math.sqrt(Math.max(0, disc));
    const lo = Math.max(0, (-B - s) / (2 * A)), hi = Math.min(1, (-B + s) / (2 * A));
    return lo <= hi + R.eps ? [lo, hi] : null;
  }
  function closest(a, b, c) {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
    const u = l ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l)) : 0;
    return { d: dist({ x: a.x + dx * u, y: a.y + dy * u }, c), u };
  }
  const priorities = { RingHit: 0, Perfect: 1, SolidBounce: 2, Stop: 3, NearMiss: 4 };
  function event(type, time, pearl, object, extra = {}) {
    let tick = Math.floor(time / R.dt + R.eps), subtime = Math.round((time / R.dt - tick) * R.timeQ);
    if (subtime < 0) subtime = 0;
    if (subtime >= R.timeQ) { tick++; subtime = 0; }
    return { type, time, tick, subtime, pearl, object, ...extra };
  }
  const compare = (a, b) => a.tick - b.tick || a.subtime - b.subtime || priorities[a.type] - priorities[b.type] || a.pearl - b.pearl || a.object - b.object;
  function resolveHits(paths, rings, consumed) {
    const events = [], owners = Array(rings.length).fill(null);
    rings.forEach((ring, object) => {
      if (consumed[object]) return;
      let near = Infinity;
      const candidates = [];
      paths.forEach((segments, pearl) => {
        let first = null, end = -Infinity, complete = false, perfectTime = null;
        for (const s of segments) {
          const c = closest(s.a, s.b, ring); near = Math.min(near, c.d);
          const hit = interval(s.a, s.b, ring, R.hit);
          if (!hit) { if (first !== null && s.t0 >= end - R.eps) complete = true; continue; }
          const enter = s.t0 + (s.t1 - s.t0) * hit[0], exit = s.t0 + (s.t1 - s.t0) * hit[1];
          if (first !== null && enter > end + R.eps) complete = true;
          if (complete) continue;
          if (first === null) first = enter;
          end = exit;
          const inner = interval(s.a, s.b, ring, R.perfect);
          if (inner && perfectTime === null) perfectTime = s.t0 + (s.t1 - s.t0) * inner[0];
        }
        if (first !== null) candidates.push(event('RingHit', first, pearl, object, { perfectTime }));
      });
      candidates.sort(compare);
      if (candidates.length) {
        const win = candidates[0]; owners[object] = win.pearl;
        events.push(event('RingHit', win.time, win.pearl, object));
        if (win.perfectTime !== null) events.push(event('Perfect', win.perfectTime, win.pearl, object));
      } else if (near > R.hit && near <= R.near + R.eps) events.push(event('NearMiss', 3, 3, object, { distance: near }));
    });
    return { events, owners };
  }
  function collide(p, v, duration, bumpers) {
    let best = duration + 1, contacts = [];
    function offer(t, nx, ny, object) {
      if (t < -R.eps || t > duration + R.eps) return;
      t = Math.max(0, t);
      if (t < best - R.eps) { best = t; contacts = [{ nx, ny, object }]; }
      else if (Math.abs(t - best) <= R.eps) contacts.push({ nx, ny, object });
    }
    if (v.x < -R.eps) offer((10 - p.x) / v.x, 1, 0, 0);
    if (v.x > R.eps) offer((950 - p.x) / v.x, -1, 0, 1);
    if (v.y < -R.eps) offer((10 - p.y) / v.y, 0, 1, 2);
    if (v.y > R.eps) offer((530 - p.y) / v.y, 0, -1, 3);
    bumpers.forEach((c, i) => {
      const fx = p.x - c.x, fy = p.y - c.y, radius = c.r + 10;
      const A = v.x * v.x + v.y * v.y, B = 2 * (fx * v.x + fy * v.y), C = fx * fx + fy * fy - radius * radius;
      const disc = B * B - 4 * A * C;
      if (disc < 0 || !A || B >= 0) return;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      const x = fx + v.x * Math.max(0, t), y = fy + v.y * Math.max(0, t), length = Math.hypot(x, y);
      offer(t, x / length, y / length, 4 + i);
    });
    return contacts.length ? { t: best, contacts } : null;
  }
  function trajectory(start, velocity, bumpers, pearl, collisionLimit = R.collisions) {
    let p = { ...start }, v = { ...velocity }, stopped = false;
    const path = [], events = [], frames = [{ ...p }];
    for (let tick = 0; tick < R.ticks; tick++) {
      v.x *= Math.exp(-R.damping * R.dt); v.y *= Math.exp(-R.damping * R.dt);
      if (Math.hypot(v.x, v.y) < R.stop) {
        if (!stopped) events.push(event('Stop', tick * R.dt, pearl, 0));
        v = { x: 0, y: 0 }; stopped = true; frames.push({ ...p }); continue;
      }
      let rest = R.dt, used = 0, collisions = 0;
      while (rest > R.eps) {
        const contact = collide(p, v, rest, bumpers), span = contact ? Math.min(rest, contact.t) : rest;
        const a = { ...p }; p = { x: p.x + v.x * span, y: p.y + v.y * span };
        path.push({ a, b: { ...p }, t0: tick * R.dt + used, t1: tick * R.dt + used + span });
        rest -= span; used += span;
        if (!contact) break;
        if (++collisions >= collisionLimit) throw Error('SIM_LIMIT');
        for (const n of contact.contacts) {
          const dot = v.x * n.nx + v.y * n.ny;
          if (dot < 0) { v.x -= 2 * dot * n.nx; v.y -= 2 * dot * n.ny; }
          p.x += n.nx * R.eps; p.y += n.ny * R.eps;
          events.push(event('SolidBounce', tick * R.dt + used, pearl, n.object, { x: p.x, y: p.y, nx: n.nx, ny: n.ny }));
        }
      }
      frames.push({ ...p });
    }
    if (!stopped) events.push(event('Stop', 3, pearl, 0, { capped: true }));
    return { path, events, frames, end: p };
  }
  const shotScore = (n, p, b) => 10 * n + 3 * Math.max(n - 1, 0) + 2 * p + (b ? 15 : 0);
  function solve(state, rawQ) {
    if (!inside(rawQ)) throw Error('INVALID_COMMAND');
    if (!state || !Number.isInteger(state.shots) || state.shots < 1 || state.shots > 4 ||
      !validateBoard({ ...state.board, pearls: state.pearls }, false)) throw Error('INVALID_STATE');
    const q = quantize(rawQ), velocities = state.pearls.map(p => launch(p, q));
    if (velocities.every(v => !v.x && !v.y)) throw Error('ZERO_ACTION');
    const traces = state.pearls.map((p, i) => trajectory(p, velocities[i], state.board.bumpers, i));
    const hits = resolveHits(traces.map(t => t.path), state.board.rings, state.consumed);
    const events = [...hits.events, ...traces.flatMap(t => t.events)].sort(compare);
    const n = events.filter(e => e.type === 'RingHit').length, perfect = events.filter(e => e.type === 'Perfect').length;
    const allThree = new Set(hits.owners.filter(v => v !== null)).size === 3;
    const post = copy(state); post.pearls = traces.map(t => t.end); post.shots--;
    hits.owners.forEach((owner, i) => { if (owner !== null) { post.consumed[i] = true; post.owners[i] = owner; } });
    const clear = post.consumed.every(Boolean), bonus = clear ? post.shots * 10 : 0;
    const points = shotScore(n, perfect, allThree); post.score += points + bonus;
    post.bestShot = Math.max(post.bestShot, n); post.actions.push(q);
    if (!validateBoard({ ...post.board, pearls: post.pearls }, false)) throw Error('INVALID_PLAN');
    const last = Math.max(...events.filter(e => e.type === 'Stop').map(e => e.time), 0);
    return { q, traces, events, duration: last, post, hash: hash({ post, events }),
      breakdown: { n, perfect, allThree, points, bonus, clear } };
  }
  class Session {
    constructor(board, generation = 1) { this.state = initialState(board); this.generation = generation; this.id = 'session-' + generation; this.phase = 'ready'; this.ids = new Set(); }
    submit(command) {
      if (!command || this.phase !== 'aiming' || command.generation !== this.generation || command.session !== this.id ||
        this.state.shots === 0 || this.state.consumed.every(Boolean) ||
        typeof command.id !== 'string' || !command.id || command.id.length > 100 || this.ids.has(command.id)) return { ok: false, error: 'INVALID_COMMAND' };
      try {
        const plan = solve(this.state, command.q);
        this.ids.add(command.id); this.state = plan.post; this.phase = 'playback'; this.plan = plan;
        return { ok: true, plan };
      } catch (e) { return { ok: false, error: e.message }; }
    }
    finish() { if (this.phase === 'playback') this.phase = this.state.shots === 0 || this.state.consumed.every(Boolean) ? 'results' : 'ready'; }
  }
  const api = { R, copy, dist, quantize, inside, launch, hash, validateBoard, initialState, interval, closest,
    event, compare, resolveHits, collide, trajectory, shotScore, solve, Session };
  if (typeof module !== 'undefined') module.exports = api;
  root.ChordRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
