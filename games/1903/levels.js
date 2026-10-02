(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' ? require('./core.js') : root.CurveVolley;
  const specs = [
    [500, 580, [.16, .37, .63, .84], [330, 330, 330, 330]],
    [500, 605, [.19, .40, .70], [370, 335, 350]],
    [540, 620, [.13, .35, .62, .85], [345, 405, 320, 390]],
    [460, 610, [.82, .60, .31], [350, 405, 325]],
    [500, 650, [.12, .36, .66, .88], [315, 420, 310, 410]],
    [565, 585, [.18, .45, .80], [340, 365, 380]],
    [435, 625, [.86, .65, .36, .14], [330, 435, 310, 400]],
    [515, 640, [.15, .46, .83], [365, 410, 320]],
    [480, 590, [.10, .32, .61, .90], [330, 360, 405, 340]],
    [545, 655, [.86, .54, .20], [350, 435, 355]],
    [455, 580, [.12, .36, .68, .86], [360, 335, 400, 325]],
    [500, 630, [.18, .48, .81], [400, 360, 420]]
  ];
  function make(spec, index) {
    const [hx, hy, us, lengths] = spec, xs = us.map(u => C.curve(C.REST, u).x);
    while (xs.length < 4) xs.push(500);
    const incomingX = [...xs, ...xs.slice().reverse()];
    const releaseTick = us.length === 3 ? 248 : 312;
    const capture = new C.Session([{ targets: [{ x: 60, y: 120 }], incomingX }], { mode: 'practice' });
    for (let t = 1; t < releaseTick; t++) capture.step();
    const caught = capture.caught().slice(0, us.length), h = { x: hx, y: hy };
    const targets = caught.map((b, i) => {
      const p = C.curve(h, b.u), n = C.normal(h, b.u);
      return { x: p.x + n.x * lengths[i], y: p.y + n.y * lengths[i] };
    });
    return { name: `布局${index + 1}`, targets, incomingX, reference: { captureH: { ...C.REST }, releaseH: h, releaseTick, u: caught.map(b => b.u), actions: [{ tick: releaseTick, actions: [{ type: 'grab' }, { type: 'move', ...h }, { type: 'release' }] }] } };
  }
  const templates = specs.map(make);
  function run(seed) {
    let state = seed >>> 0 || 1;
    function random() { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }
    const order = [0, 1];
    while (order.length < 48) {
      const bag = templates.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (bag[0] === order[order.length - 1]) [bag[0], bag[1]] = [bag[1], bag[0]];
      order.push(...bag);
    }
    return order.slice(0, 48).map(i => JSON.parse(JSON.stringify(templates[i])));
  }
  function warmup(stage) {
    const us = stage === 1 ? [.5] : [.30, .70], h = stage === 1 ? C.REST : { x: 500, y: 625 };
    const targets = us.map(u => { const p = C.curve(h, u), n = C.normal(h, u); return { x: p.x + n.x * 330, y: p.y + n.y * 330 }; });
    const session = new C.Session([{ targets, incomingX: [] }], { mode: 'tutorial' });
    session.spawnCursor = 0;
    session.balls = us.map(u => ({ id: session.nextId++, state: 'caught', u, ...C.curve(C.REST, u), wave: 0 }));
    return session;
  }
  const api = { templates, run, warmup };
  if (typeof module !== 'undefined') module.exports = api;
  root.CurveLevels = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
